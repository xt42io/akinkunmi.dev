import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { GET, POST, OPTIONS } from "../src/pages/api/now-playing.ts";
import { getCurrentTrack as readTrack, saveCurrentTrack, TRACK_TTL_SECONDS } from "../src/lib/now-playing.server.ts";
import { createTestDb, createTestEnv } from "./d1-fixture.mjs";
import { fetchNowPlaying, musicLinks, parseTrack } from "../src/lib/now-playing.ts";

const token = "now-playing-test-token";
const track = {
  title: "One & <two>",
  artist: "Artist / Another",
  album: "Test album",
  image: "https://example.com/cover.jpg",
  source: "desktop",
  playedAt: "2026-10-26T00:00:00.000Z",
};
let db;
let env;
const getCurrentTrack = () => readTrack(db);
beforeEach(() => { db = createTestDb(); env = createTestEnv(db); });
afterEach(() => db.sqlite.close());

function context(method, { body, authorization, origin, raw } = {}) {
  const url = new URL("http://localhost:4321/api/now-playing");
  const headers = new Headers();
  if (authorization) headers.set("Authorization", authorization);
  if (origin) headers.set("Origin", origin);
  if (body !== undefined || raw !== undefined) headers.set("Content-Type", "application/json");
  return {
    url,
    locals: { runtime: { env } },
    request: new Request(url, {
      method,
      headers,
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    }),
  };
}

const authenticated = (body, extra = {}) => context("POST", {
  body, authorization: `Bearer ${token}`, ...extra,
});

test("GET is public, starts idle, and disables caching", async () => {
  const response = await GET(context("GET"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { track: null });
});

test("POST rejects missing/wrong tokens without changing the track", async () => {
  for (const authorization of [undefined, "Bearer wrong", "Basic anything"]) {
    const response = await POST(context("POST", { body: track, authorization }));
    assert.equal(response.status, 401);
  }
  assert.equal(await getCurrentTrack(), null);
});

test("POST fails closed when no token is configured", async () => {
  delete env.NOW_PLAYING_TOKEN;
  assert.equal((await POST(authenticated(track))).status, 401);
});

test("authorized POST is visible through GET and the shared SSR store", async () => {
  const response = await POST(authenticated(track));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(await getCurrentTrack(), track);
  assert.deepEqual(await (await GET(context("GET"))).json(), { track });
  const replacement = { ...track, title: "Another song", source: "android" };
  await POST(authenticated(replacement));
  assert.deepEqual(await getCurrentTrack(), replacement);
});

test("POST rejects malformed JSON", async () => {
  const response = await POST(authenticated(undefined, { raw: "{" }));
  assert.equal(response.status, 400);
  assert.equal(await getCurrentTrack(), null);
});

test("POST validates required fields, dates, sources, and URLs", async () => {
  const invalid = [
    null, [], {}, { ...track, title: "  " }, { ...track, artist: 10 },
    { ...track, source: "browser" }, { ...track, playedAt: "yesterday" },
    { ...track, image: "javascript:alert(1)" }, { ...track, url: "file:///etc/passwd" },
    { ...track, album: {} },
  ];
  for (const body of invalid) assert.equal((await POST(authenticated(body))).status, 422);
  assert.equal(await getCurrentTrack(), null);
});

test("minimal tracks and offset date-times remain supported", async () => {
  const minimal = {
    title: "Song", artist: "Artist", source: "android", playedAt: "2026-10-26T01:00:00+01:00",
  };
  assert.equal((await POST(authenticated(minimal))).status, 200);
  assert.deepEqual(await getCurrentTrack(), minimal);
});

test("Android's base64 JPEG artwork is accepted and preserved for rendering", async () => {
  const image = "data:image/jpeg;base64,/9j/AA==";
  const android = { ...track, source: "android", image };
  assert.equal((await POST(authenticated(android))).status, 200);
  const response = await (await GET(context("GET"))).json();
  assert.equal(response.track.image, image);
  assert.equal(parseTrack(response.track).image, image);
  assert.equal((await POST(authenticated({ ...android, image: "data:image/svg+xml;base64,PHN2Zz4=" }))).status, 422);
});

test("CORS allows the extension's authenticated preflight and request", async () => {
  const origin = "https://music.youtube.com";
  const preflight = await OPTIONS(context("OPTIONS", { origin }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), origin);
  assert.match(preflight.headers.get("Access-Control-Allow-Headers"), /Authorization/);
  const response = await POST(authenticated(track, { origin }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  assert.equal(response.headers.get("Vary"), "Origin");
});

test("unapproved origins cannot read or write through CORS", async () => {
  const origin = "https://unapproved.example";
  assert.equal((await OPTIONS(context("OPTIONS", { origin }))).status, 403);
  assert.equal((await GET(context("GET", { origin }))).status, 403);
  assert.equal((await POST(authenticated(track, { origin }))).status, 403);
  assert.equal(await getCurrentTrack(), null);
});

test("D1 expires tracks ten minutes after POST, even across separate requests", async () => {
  await saveCurrentTrack(db, track, 0);
  assert.deepEqual(await readTrack(db, 599_999), track);
  assert.equal(await readTrack(db, 600_000), null);
  assert.equal(await readTrack(db, 600_001), null);
});

test("updates replace the one current-track row and reset its expiry", async () => {
  await saveCurrentTrack(db, track, 0);
  await saveCurrentTrack(db, { ...track, title: "New song" }, 500_000);
  assert.equal((await readTrack(db, 600_000)).title, "New song");
  assert.equal(await readTrack(db, 1_100_000), null);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM now_playing').get().count, 1);
  assert.equal(TRACK_TTL_SECONDS, 600);
});

test("failed D1 writes return 503 and never acknowledge an unsaved track", async (t) => {
  t.mock.method(console, "error", () => {});
  env.DB = { prepare() { throw new Error("D1 unavailable"); } };
  assert.equal((await POST(authenticated(track))).status, 503);
  assert.equal(await getCurrentTrack(), null);
  assert.equal((await GET(context("GET"))).status, 503);
});

test("track parsing rejects malformed metadata and unsafe optional URLs", () => {
  assert.equal(parseTrack({ title: "Song" }), null);
  assert.equal(parseTrack({ ...track, title: " " }), null);
  assert.equal(parseTrack({ ...track, image: "javascript:alert(1)" }).image, undefined);
});

test("music links encode metadata and only reuse real YouTube Music URLs", () => {
  const encoded = encodeURIComponent(`${track.title} ${track.artist}`);
  const links = musicLinks(track);
  assert.equal(links.length, 3);
  assert.equal(links[1].href, `https://open.spotify.com/search/${encoded}`);
  const youtube = "https://music.youtube.com/watch?v=test";
  assert.equal(musicLinks({ ...track, url: youtube })[0].href, youtube);
  assert.equal(musicLinks({ ...track, url: "https://music.youtube.com.evil.example/" })[0].href,
    `https://music.youtube.com/search?q=${encoded}`);
});

test("browser fetching handles HTTP failures, malformed data, and aborts", async (t) => {
  const signal = new AbortController().signal;
  t.mock.method(globalThis, "fetch", async () => Response.json({ track }));
  assert.deepEqual(await fetchNowPlaying("https://example.com/api", signal), track);
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ track }, { status: 500 }));
  assert.equal(await fetchNowPlaying("https://example.com/api", signal), null);
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ track: { title: 12 } }));
  assert.equal(await fetchNowPlaying("https://example.com/api", signal), null);
  globalThis.fetch.mock.mockImplementation(async () => { throw new DOMException("Aborted", "AbortError"); });
  assert.equal(await fetchNowPlaying("https://example.com/api", signal), null);
});
