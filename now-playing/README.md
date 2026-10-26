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

Run `npm run db:migrate` once to initialize local D1. Configure these server-only
secrets in `.dev.vars` locally and Cloudflare Worker secrets in production:

- `NOW_PLAYING_TOKEN`: a long random bearer token required by `POST /api/now-playing`.
  Use this same token in your extension and Android client.

`WEBSITE_ORIGIN` and `CORS_ORIGINS` are configured in `wrangler.jsonc`. The latter
includes the website and `https://music.youtube.com` for extension requests.

The API is implemented in `src/pages/api/now-playing.ts`:

- `GET /api/now-playing`: publicly returns `{ "track": Track | null }`.
- `POST /api/now-playing`: validates the bearer token and track payload, then
  returns `{ "ok": true }`. Each update expires after 600 seconds.
- `OPTIONS /api/now-playing`: handles CORS preflights for authorized origins.

Track payloads require nonempty `title` and `artist`, `source` set to `desktop`
or `android`, and an ISO date-time `playedAt`. Optional fields are `album`,
`image`, and `url`. Links must use HTTP or HTTPS. Artwork also accepts base64
JPEG, PNG, WebP, and GIF data URLs, including the Android client's JPEG artwork.

D1 stores the latest track in a single row with a ten-minute expiry timestamp.
Reads ignore expired tracks; each update replaces the row. No Redis service or
process-local fallback is needed, and storage errors return HTTP 503.

The Cloudflare migration generated a new token saved in ignored `.dev.vars`.
Build both clients from the repository root:

```sh
npm run now-playing:build
```

This reads `NOW_PLAYING_TOKEN` from `.dev.vars` and uses
`https://akinkunmi.dev/api/now-playing`. An optional `NOW_PLAYING_API_URL` in
`.dev.vars` or the shell overrides the endpoint. The build prepares ignored local
config files, packages the extension ZIP, and assembles the Android debug APK.
Both artifacts are saved under ignored `data/now-playing/` and contain the token.
Android builds require an installed Android SDK and JDK; on macOS the script uses
Android Studio's bundled JDK when `JAVA_HOME` is not set.

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

Run the client build above. It writes the API URL and token into ignored
`now-playing/chrome-extension/config.local.js`, which loads after the public
defaults in `config.js`. The packaged ZIP is
`data/now-playing/now-playing-extension.zip`.

Load it as an unpacked extension:

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click **Load unpacked** and select `now-playing/chrome-extension`.
4. Open `https://music.youtube.com` and play a track.

For an existing installation from this source folder, select **Reload** on its
extension card after rebuilding, then refresh YouTube Music.

The content script watches the player bar with `MutationObserver`, debounces
updates, and posts when the title or artist changes.

## Android App

The Android project lives in `now-playing/android`. The client build writes
`nowPlaying.apiUrl` and `nowPlaying.token` into ignored `local.properties`.
Gradle also accepts `NOW_PLAYING_API_URL` and `NOW_PLAYING_TOKEN` environment
overrides. Missing tokens stop the build instead of producing a placeholder APK.

Install the assembled APK over the existing app to preserve its settings:

```sh
adb install -r data/now-playing/now-playing.apk
```

For a first installation, launch the app, tap **Open Notification Access**, and
enable access for **Now Playing**.

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

Astro reads the current track directly from D1 for the
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

Tests cover API authentication, validation, CORS, D1 persistence and failures, expiry, and
music-link generation. The test command uses Node’s native TypeScript support
(Node 22.18 or newer).
