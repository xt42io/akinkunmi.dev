import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { Auth, customFetch } from '@auth/core';
import { createAuthConfig } from '../auth.config.ts';

// Exercise the real Auth.js callback, PKCE and encrypted session cookies.
// Only GitHub's token/profile responses are simulated; no real credentials are used.
async function signIn(issuer) {
  const origin = 'https://website.example';
  const jar = new Map();
  const errors = [];
  let tokenRequests = 0;
  let challenge;
  const env = {
    AUTH_SECRET: 'test-auth-secret-with-at-least-thirty-two-characters',
    GITHUB_CLIENT_ID: 'test-client-id',
    GITHUB_CLIENT_SECRET: 'test-client-secret',
  };
  function config() {
    const config = createAuthConfig(env);
    config.logger = { error(error) { errors.push(error); }, warn() {}, debug() {} };
    const provider = config.providers[0];
    provider.options[customFetch] = async (input, init) => {
      assert.equal(String(input), 'https://github.com/login/oauth/access_token');
      assert.equal(init.body.get('code'), 'test-authorization-code');
      const verifier = init.body.get('code_verifier');
      assert.ok(verifier);
      assert.equal(createHash('sha256').update(verifier).digest('base64url'), challenge);
      tokenRequests++;
      return Response.json({ access_token: 'test-access-token', token_type: 'bearer' });
    };
    provider.options.userinfo = {
      url: 'https://api.github.com/user',
      async request({ tokens }) {
        assert.equal(tokens.access_token, 'test-access-token');
        return { id: 123, login: 'test-user', name: 'Test User', email: 'test@example.com',
          avatar_url: 'https://github.com/test-user.png' };
      },
    };
    return config;
  }
  async function request(path, body) {
    const headers = new Headers({ Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') });
    if (body) headers.set('Content-Type', 'application/x-www-form-urlencoded');
    const response = await Auth(new Request(new URL(path, origin), {
      method: body ? 'POST' : 'GET', headers, body,
    }), config());
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0];
      const index = pair.indexOf('=');
      jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  }
  const csrf = await (await request('/api/auth/csrf')).json();
  const authorization = await request('/api/auth/signin/github', new URLSearchParams({
    csrfToken: csrf.csrfToken, callbackUrl: `${origin}/guestbook`,
  }));
  const url = new URL(authorization.headers.get('Location'));
  assert.equal(url.hostname, 'github.com');
  challenge = url.searchParams.get('code_challenge');
  assert.ok(challenge);
  const callback = new URL(url.searchParams.get('redirect_uri'));
  callback.searchParams.set('code', 'test-authorization-code');
  if (issuer !== undefined) callback.searchParams.set('iss', issuer);
  if (url.searchParams.has('state')) callback.searchParams.set('state', url.searchParams.get('state'));
  const response = await request(callback.toString());
  const session = await (await request('/api/auth/session')).json();
  return { response, session, tokenRequests, errors };
}

test('GitHub issuer callback completes PKCE and creates a guestbook session', async () => {
  const result = await signIn('https://github.com/login/oauth');
  assert.equal(result.response.headers.get('Location'), 'https://website.example/guestbook');
  assert.equal(result.tokenRequests, 1);
  assert.equal(result.errors.length, 0);
  assert.equal(result.session.user.id, '123');
  assert.equal(result.session.user.username, 'test-user');
  assert.equal(result.session.user.name, 'Test User');
});

test('GitHub callbacks without an issuer remain compatible', async () => {
  const result = await signIn();
  assert.equal(result.response.headers.get('Location'), 'https://website.example/guestbook');
  assert.equal(result.session.user.id, '123');
});

test('a callback from an unexpected issuer cannot create a session', async () => {
  const result = await signIn('https://untrusted.example');
  assert.match(result.response.headers.get('Location'), /\/api\/auth\/error/);
  assert.equal(result.tokenRequests, 0);
  assert.equal(result.session, null);
  assert.equal(result.errors[0].cause.err.message, 'unexpected "iss" (issuer) response parameter value');
});
