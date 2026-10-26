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

## Local guestbook samples

Run `npm run db:seed:guestbook` to add eight fictional notes and handwritten
signatures to local D1. The command always uses `--local`, rejects extra flags,
and updates its own sample IDs on subsequent runs. Existing entries are preserved.
The website labels these sample entries during development; production data is
unaffected.

## Hidden page breaker

Type `22` within 1.2 seconds outside a text field, or double-tap the home page's
name or the Roman year in the footer. You can also hold either of those or an
empty side margin for 22 seconds, or tap the empty side margins 22 times
(at most three seconds between taps). Scrolling, dragging, changing tabs, and
interacting with content cancel the gesture. The visible content column becomes the brick field.
Move with the pointer, touch, or arrow keys; Space launches, P pauses, M toggles
sound, and Escape restores the page. The HUD tracks score, local best, lives,
cleared pieces, combos, and active power-ups.

Catch falling M, W, S, and F tiles for multiball, a 14-second wider paddle,
10 seconds of slow motion, and a single-use fireball. The fireball detonates on
its next brick hit, clearing surrounding bricks within the blast radius, then
returns to normal. Multiball never duplicates a fire charge. A missed ball costs
a life only when no balls remain; a two-second countdown on the paddle serves
the next ball automatically. Keep moving, or press Space/tap to serve early.
Paddle contact angle and movement affect the bounce.
Physics uses fixed time steps, and the canvas/audio code loads only on first use.
Sound is synthesized locally after Play; no assets or services are needed. The
game pauses in hidden tabs, reduced-motion disables particles and trails, and
closing restores the original text nodes and styles without navigation. Resizing
starts a fresh board so collisions follow the new page layout.

Gameplay uses the existing PostHog integration. Events use the `brick_breaker_`
prefix: `opened`, `started`, `paused`, `resumed`, `power_up_collected`,
`fireball_exploded`, `life_lost`, `restarted`, `sound_toggled`, `round_ended`,
`closed`, and `load_failed`. Each opening has a game session ID, with numbered
rounds starting on the first launch. Round summaries include score, lives,
bricks cleared, maximum combo, power-ups, explosions, elapsed time, and active
play time (excluding pauses and serve countdowns). Outcomes distinguish wins,
losses, restarts, viewport resets, and abandoned rounds. Individual brick hits
and animation frames do not send custom events. Navigation exits use a beacon;
missing or blocked analytics never interrupts gameplay.

## Verification

```sh
npm test
npm run build
```

Tests exercise D1's SQLite schema, authenticated guestbook submissions and
duplicates, reaction counts, and Now Playing authentication, validation and expiry.
See [now-playing/README.md](now-playing/README.md) for client configuration.
