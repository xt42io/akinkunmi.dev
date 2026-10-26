import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { encode } from '@auth/core/jwt';
import { GET as guestbookGet, POST as guestbookPost } from '../src/pages/api/guestbook.ts';
import { GET as reactionsGet, POST as reactionsPost } from '../src/pages/api/reactions.ts';
import { createTestDb, createTestEnv } from './d1-fixture.mjs';

let db;
let env;
beforeEach(() => { db = createTestDb(); env = createTestEnv(db); });
afterEach(() => db.sqlite.close());
function context(method, path, body, cookie) {
  const url = new URL(path, 'http://localhost:4321');
  const headers = new Headers();
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (cookie) headers.set('Cookie', cookie);
  return { url, locals: { runtime: { env } }, request: new Request(url, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  }) };
}
async function cookie(id = '123', username = 'test-user') {
  const token = await encode({
    secret: env.AUTH_SECRET, salt: 'authjs.session-token', maxAge: 3600,
    token: { name: 'Test User', email: 'test@example.com', githubId: id, githubUsername: username },
  });
  return `authjs.session-token=${token}`;
}

test('guestbook is public and initially empty', async () => {
  const response = await guestbookGet(context('GET', '/api/guestbook'));
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), []);
});
test('guestbook signing requires a valid GitHub session', async () => {
  const response = await guestbookPost(context('POST', '/api/guestbook', {message:'Hello',signature:'data:image/png;base64,AAAA'}));
  assert.equal(response.status, 401);
});
test('authenticated signatures persist with the existing response shape and reject duplicates', async () => {
  const session = await cookie();
  const body = {message: "  Hello, it's me!  ", signature:'data:image/png;base64,AAAA'};
  assert.equal((await guestbookPost(context('POST','/api/guestbook',body,session))).status, 200);
  assert.equal((await guestbookPost(context('POST','/api/guestbook',body,session))).status, 409);
  const entries = await (await guestbookGet(context('GET','/api/guestbook'))).json();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].message, "Hello, it's me!");
  assert.equal(entries[0].githubId, '123');
  assert.equal(entries[0].githubUsername, 'test-user');
  assert.equal(entries[0].signature, body.signature);
  assert.equal(typeof entries[0]._id, 'string');
  assert.equal(typeof entries[0].createdAt, 'number');
});
test('invalid guestbook content and incomplete sessions cannot create entries', async () => {
  const session = await cookie();
  for(const body of [null,{}, {message:' ',signature:'x'}, {message:'Hello'}]) {
    assert.equal((await guestbookPost(context('POST','/api/guestbook',body,session))).status,400);
  }
  const incomplete = await cookie('456', '');
  assert.equal((await guestbookPost(context('POST','/api/guestbook',{message:'Hi',signature:'x'},incomplete))).status,401);
});
test('reactions aggregate by slug and emoji with parameterized SQL', async () => {
  const slug = "post'; DROP TABLE reactions; --";
  for(const emoji of ['👍','👍','❤️']) {
    assert.equal((await reactionsPost(context('POST','/api/reactions',{slug,emoji}))).status,200);
  }
  await reactionsPost(context('POST','/api/reactions',{slug:'different-post',emoji:'👍'}));
  const response = await reactionsGet(context('GET',`/api/reactions?slug=${encodeURIComponent(slug)}`));
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.deepEqual((await response.json()).sort((a,b)=>a.emoji.localeCompare(b.emoji)),
    [{emoji:'👍',count:2},{emoji:'❤️',count:1}].sort((a,b)=>a.emoji.localeCompare(b.emoji)));
});
test('reactions reject missing slugs and unsupported emoji', async () => {
  assert.equal((await reactionsGet(context('GET','/api/reactions'))).status,400);
  for(const body of [null,{}, {slug:'post',emoji:'not-an-emoji'}]) {
    assert.equal((await reactionsPost(context('POST','/api/reactions',body))).status,400);
  }
});
