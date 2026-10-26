import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const background = await readFile(new URL("../now-playing/chrome-extension/background.js", import.meta.url), "utf8");
const content = await readFile(new URL("../now-playing/chrome-extension/content.js", import.meta.url), "utf8");
const track = { isPlaying: true, title: "Song", artist: "Artist", source: "desktop", playedAt: new Date().toISOString() };
const sender = { id: "test-extension", tab: { id: 1 }, url: "https://music.youtube.com/watch?v=test" };

function backgroundClient(fetch) {
  let listener;
  const context = {
    URL, AbortSignal, fetch,
    chrome: { runtime: { id: sender.id, onMessage: { addListener(callback) { listener = callback; } } } },
    importScripts() {
      context.NOW_PLAYING_CONFIG = { API_URL: "https://akinkunmi.dev/api/now-playing", TOKEN: "test-token" };
    },
  };
  runInNewContext(background, context);
  return (message, from = sender) => new Promise(resolve => {
    let responded = false;
    const keepAlive = listener(message, from, response => {
      responded = true;
      resolve(JSON.parse(JSON.stringify(response)));
    });
    if (!keepAlive && !responded) resolve(undefined);
  });
}

test("extension worker posts trusted tracks to its configured endpoint", async () => {
  const requests = [];
  const send = backgroundClient(async (url, options) => {
    requests.push({ url, options });
    return Response.json({ ok: true });
  });
  assert.deepEqual(await send({ type: "now-playing:track", track,
    url: "https://untrusted.example/collect" }), { ok: true });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://akinkunmi.dev/api/now-playing");
  assert.equal(requests[0].options.headers.Authorization, "Bearer test-token");
  assert.equal(requests[0].options.credentials, "omit");
  assert.deepEqual(JSON.parse(requests[0].options.body), track);
});

test("extension worker refuses other pages, extensions and non-tab senders", async () => {
  let requests = 0;
  const send = backgroundClient(async () => { requests++; return Response.json({ ok: true }); });
  for (const from of [
    { ...sender, id: "other-extension" },
    { ...sender, url: "https://untrusted.example/" },
    { ...sender, url: "https://music.youtube.com.untrusted.example/" },
    { ...sender, url: "invalid" },
    { ...sender, tab: undefined },
  ]) {
    assert.equal((await send({ type: "now-playing:track", track }, from)).ok, false);
  }
  assert.equal(await send({ type: "unrelated" }), undefined);
  assert.equal(requests, 0);
});

test("extension worker rejects incomplete tracks before making requests", async () => {
  let requests = 0;
  const send = backgroundClient(async () => { requests++; });
  for (const invalid of [null, {}, { ...track, title: " " }, { ...track, artist: 12 }]) {
    assert.equal((await send({ type: "now-playing:track", track: invalid })).ok, false);
  }
  assert.equal(requests, 0);
});

test("extension worker reports failed API requests to the content script", async () => {
  for (const status of [401, 503]) {
    const send = backgroundClient(async () => new Response(null, { status }));
    const result = await send({ type: "now-playing:track", track });
    assert.equal(result.ok, false);
    assert.match(result.error, new RegExp(`HTTP ${status}`));
  }
});

function contentClient(sendMessage) {
  const warnings = [];
  const timers = new Map();
  const events = {};
  const windowEvents = {};
  let timerId = 0;
  let now = 100_000;
  let poll;
  const media = { paused: false, ended: false };
  const window = {
    addEventListener(name, callback) { windowEvents[name] = callback; },
    setInterval(callback) { poll = callback; },
  };
  const context = {
    chrome: { runtime: { sendMessage } },
    document: {
      body: {},
      querySelector(selector) { return selector === "video, audio" ? media : null; },
      querySelectorAll() { return []; },
      addEventListener(name, callback) { events[name] = callback; },
    },
    location: { href: sender.url },
    Date: class extends Date { static now() { return now; } },
    window,
    console: { log() {}, warn(...args) { warnings.push(args); } },
    MutationObserver: class { observe() {} },
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    fetch() { throw new Error("Content scripts must not fetch the API directly"); },
  };
  runInNewContext(content, context);
  return {
    post: context.postIfChanged, warnings, media, events, windowEvents,
    advance(ms) { now += ms; },
    poll: () => poll(),
    message(data) { windowEvents.message({ source: window, data: { type: "now-playing:media-session", ...data } }); },
    async flush() {
      const pending = [...timers.values()];
      timers.clear();
      for (const callback of pending) callback();
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}

test("content script retries a failed track and deduplicates only successful posts", async () => {
  let attempts = 0;
  const client = contentClient((message, callback) => {
    assert.equal(message.type, "now-playing:track");
    attempts++;
    callback(attempts === 1 ? { ok: false, error: "Network unavailable" } : { ok: true });
  });
  await client.post(track);
  await client.post(track);
  await client.post(track);
  assert.equal(attempts, 2);
  assert.equal(client.warnings.length, 1);
});

test("content script avoids duplicate requests while a track post is pending", async () => {
  let attempts = 0;
  let complete;
  const client = contentClient((_message, callback) => { attempts++; complete = callback; });
  const first = client.post(track);
  await client.post(track);
  assert.equal(attempts, 1);
  complete({ ok: true });
  await first;
  await client.post(track);
  assert.equal(attempts, 1);
});

test("extension reports pause and resume for the same song, with playing heartbeats", async () => {
  const sent = [];
  const client = contentClient((message, callback) => { sent.push(JSON.parse(JSON.stringify(message.track))); callback({ ok: true }); });
  await client.post(track);
  client.advance(29_999);
  await client.post(track);
  assert.equal(sent.length, 1);
  client.advance(1);
  await client.post(track);
  assert.equal(sent.length, 2);
  await client.post({ ...track, isPlaying: false });
  client.advance(120_000);
  await client.post({ ...track, isPlaying: false });
  assert.equal(sent.length, 3);
  await client.post(track);
  assert.deepEqual(sent.map(item => item.isPlaying), [true, true, false, true]);
  assert.ok(sent.every(item => item.title === track.title));
});

test("playback changes queued during a request are sent after it completes", async () => {
  const sent = [];
  const callbacks = [];
  const client = contentClient((message, callback) => { sent.push(message.track); callbacks.push(callback); });
  const pending = client.post(track);
  await client.post({ ...track, isPlaying: false });
  assert.equal(sent.length, 1);
  callbacks.shift()({ ok: true });
  await pending;
  assert.equal(sent.length, 2);
  assert.equal(sent[1].isPlaying, false);
  callbacks.shift()({ ok: true });
});

test("media events and tab closing retain metadata while reporting stopped", async () => {
  const sent = [];
  const client = contentClient((message, callback) => { sent.push(message.track); callback({ ok: true }); });
  client.message(track);
  await client.flush();
  client.media.paused = true;
  await client.events.pause();
  client.media.paused = false;
  await client.events.play();
  await client.windowEvents.pagehide();
  assert.deepEqual(sent.map(item => item.isPlaying), [true, false, true, false]);
  assert.ok(sent.every(item => item.title === track.title && item.artist === track.artist));
});

test("the MAIN-world bridge reads actual media playback and emits stopped on end", async () => {
  const bridge = await readFile(new URL("../now-playing/chrome-extension/media-session.js", import.meta.url), "utf8");
  const sent = [];
  const events = {};
  const media = { paused: false, ended: false };
  const metadata = { title: "Song", artist: "Artist", artwork: [] };
  runInNewContext(bridge, {
    document: { querySelector() { return media; }, addEventListener(name, callback) { events[name] = callback; } },
    navigator: { mediaSession: { metadata, playbackState: "none" } },
    window: { location: { origin: "https://music.youtube.com" }, setInterval() {}, postMessage(data) { sent.push(data); } },
  });
  media.paused = true;
  events.pause();
  media.paused = false;
  events.play();
  media.ended = true;
  events.ended();
  assert.deepEqual(sent.map(item => item.isPlaying), [true, false, true, false]);
  assert.ok(sent.every(item => item.title === metadata.title));
});

test("extension play/pause events reach the authenticated API and retained D1 song", async () => {
  const { createTestDb, createTestEnv } = await import("./d1-fixture.mjs");
  const { POST, GET } = await import("../src/pages/api/now-playing.ts");
  const db = createTestDb();
  const env = createTestEnv(db);
  env.NOW_PLAYING_TOKEN = "test-token";
  const url = new URL("https://akinkunmi.dev/api/now-playing");
  const send = backgroundClient(async (_url, options) => POST({
    url, request: new Request(url, options), locals: { runtime: { env } },
  }));
  const client = contentClient((message, callback) => { send(message).then(callback); });
  const read = async () => (await (await GET({
    url, request: new Request(url), locals: { runtime: { env } },
  })).json()).track;
  try {
    client.message(track);
    await client.flush();
    assert.equal((await read()).isPlaying, true);
    client.media.paused = true;
    await client.events.pause();
    await client.flush();
    assert.equal((await read()).title, track.title);
    assert.equal((await read()).isPlaying, false);
    client.media.paused = false;
    await client.events.play();
    await client.flush();
    assert.equal((await read()).isPlaying, true);
    client.media.ended = true;
    await client.events.ended();
    await client.flush();
    assert.equal((await read()).title, track.title);
    assert.equal((await read()).isPlaying, false);
  } finally {
    db.sqlite.close();
  }
});
