# akinkunmi.dev

Personal website built with Astro 5, React and Tailwind. Cloudflare Workers
serves the website and Astro API routes. A single D1 database stores the
guestbook, blog reactions and current Now Playing track.

## Local development

Use Node 22.18 or newer.

```sh
npm ci
cp .dev.vars.example .dev.vars
# Fill in the server secrets in .dev.vars.
npm run db:migrate
npm run dev
```

The Cloudflare adapter supplies a local D1 binding during Astro development.
`.dev.vars` is ignored by Git. It contains `AUTH_SECRET`, `GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET`, and `NOW_PLAYING_TOKEN`. GitHub OAuth's production
callback URL is `https://akinkunmi.dev/api/auth/callback/github`.

To exercise the production Worker locally:

```sh
npm run build
npm run preview
```

## Deployment

`wrangler.jsonc` configures the Worker, static assets, D1 binding `DB`, origin
settings and custom domain. Runtime credentials are Cloudflare Worker secrets;
they are never build-time environment variables.

```sh
npx wrangler login
npm run db:migrate:remote
npx wrangler secret bulk .dev.vars
npm run deploy
```

For Workers Builds, connect `xt42io/akinkunmi.dev`, production branch `master`.
Use `npm test && npm run build` as the build command and
`npx wrangler d1 migrations apply DB --remote && npx wrangler deploy` as the
deploy command. D1 migrations run before deploying code that uses them.
The production build environment pins Node 24.13.0.

## Data migration

The read-only Postgres importer takes `DATABASE_URL` from ignored `.env.local`,
saves a private snapshot and SQL backup under ignored `data/cloudflare-migration/`,
then imports guestbook entries and reactions into D1. Existing rows are preserved.
Every imported field is verified against the source snapshot. It is safe to rerun
after cutover to catch any writes that reached the previous server.

```sh
npm run db:import-postgres            # remote D1
npm run db:import-postgres -- --local # local D1
```

Postgres and Redis are not used by the website runtime. Keep the old database
and migration backups until the Cloudflare deployment has been confirmed.

## Verification

```sh
npm test
npm run build
```

Tests exercise D1's SQLite schema, authenticated guestbook submissions and
duplicates, reaction counts, and Now Playing authentication, validation and expiry.
See [now-playing/README.md](now-playing/README.md) for client configuration.
