# Now Playing

The website’s Astro server hosts the now-playing API and UI. The Chrome
extension and Android client send the current track to the same website.
A separate Bun or Elysia server is no longer needed.

## API

Start the website from the repository root:

```sh
npm install
npm run dev
```

Configure these server-only variables in `.env.local` for local development and
in the website’s runtime environment for production:

- `NOW_PLAYING_TOKEN`: a long random bearer token required by `POST /api/now-playing`.
  Use this same token in your extension and Android client.
- `REDIS_URL`: optional Redis connection string. Redis shares the current track
  between server instances and preserves it across restarts. Without Redis, or
  while Redis is unavailable, storage is local to each running server process.
- `WEBSITE_ORIGIN`: allowed website origin; defaults to the current request’s origin.
- `CORS_ORIGINS`: optional comma-separated allowed origins. Defaults to the website
  origin and `https://music.youtube.com`. Include YouTube Music for the extension.

The API is implemented in `src/pages/api/now-playing.ts`:

- `GET /api/now-playing`: publicly returns `{ "track": Track | null }`.
- `POST /api/now-playing`: validates the bearer token and track payload, then
  returns `{ "ok": true }`. Each update expires after 600 seconds.
- `OPTIONS /api/now-playing`: handles CORS preflights for authorized origins.

Track payloads require nonempty `title` and `artist`, `source` set to `desktop`
or `android`, and an ISO date-time `playedAt`. Optional fields are `album`,
`image`, and `url`; URLs must use HTTP or HTTPS.

Redis retains the existing `now-playing:latest` key and `EX 600` expiry. Reuse
`NOW_PLAYING_TOKEN` and `REDIS_URL` from the previous backend when deploying the
migration. Existing clients need the new API URL below; reload the extension and
rebuild/reinstall the Android app after changing its configuration.

Example local request (set `NOW_PLAYING_TOKEN` in your shell first):

```sh
curl -X POST http://localhost:4321/api/now-playing \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $NOW_PLAYING_TOKEN" \
  -d '{
    "title": "Song",
    "artist": "Artist",
    "source": "desktop",
    "playedAt": "2026-05-10T12:00:00.000Z"
  }'
```

## Chrome Extension

Edit `now-playing/chrome-extension/config.js`:

```js
window.NOW_PLAYING_CONFIG = {
  API_URL: "https://akinkunmi.dev/api/now-playing",
  TOKEN: "same-token-as-NOW_PLAYING_TOKEN"
};
```

Load it as an unpacked extension:

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click **Load unpacked** and select `now-playing/chrome-extension`.
4. Open `https://music.youtube.com` and play a track.

The content script watches the player bar with `MutationObserver`, debounces
updates, and posts when the title or artist changes.

## Android App

The Android project lives in `now-playing/android`. In
`now-playing/android/app/build.gradle.kts`, configure:

- `NOW_PLAYING_API_URL`: `https://akinkunmi.dev/api/now-playing`.
- `NOW_PLAYING_TOKEN`: the same token configured on the website.

Open the project in Android Studio, build, and install it on your phone. Launch
the app, tap **Open Notification Access**, and enable access for **Now Playing**.

The app uses `NotificationListenerService` and `MediaSessionManager` to read
YouTube Music metadata and post changes to the website.

## Website Component

The component is at `src/components/NowPlaying.astro`:

```astro
---
import NowPlaying from "../components/NowPlaying.astro";
---

<NowPlaying />
```

Astro reads the current track directly from the shared server store for the
initial HTML. A small browser script polls `/api/now-playing` every 10 seconds.
It displays the latest track or **Nothing playing right now**. No React hydration
or `PUBLIC_NOW_PLAYING_API_URL` setting is needed.

Selecting a track opens a native dialog with artwork and links to YouTube Music,
Spotify, and Apple Music. It supports Escape, backdrop and close-button dismissal,
keyboard focus management, reduced motion, and the existing PostHog events.
An optional `apiUrl` prop supports an external endpoint; external requests time
out after 3 seconds and fall back to the idle state on failure.

## Verification

```sh
npm run test:now-playing
npm run build
```

Tests cover API authentication, validation, CORS, expiry, Redis failures, and
music-link generation. The test command uses Node’s native TypeScript support
(Node 22.18 or newer).
