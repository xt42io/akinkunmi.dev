import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const background = await readFile(new URL("../now-playing/chrome-extension/background.js", import.meta.url), "utf8");
const content = await readFile(new URL("../now-playing/chrome-extension/content.js", import.meta.url), "utf8");
const track = { title: "Song", artist: "Artist", source: "desktop", playedAt: new Date().toISOString() };
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
  const context = {
    chrome: { runtime: { sendMessage } },
    document: { body: {} },
    window: { addEventListener() {}, setInterval() {} },
    console: { log() {}, warn(...args) { warnings.push(args); } },
    MutationObserver: class { observe() {} },
    setTimeout() {}, clearTimeout() {},
    fetch() { throw new Error("Content scripts must not fetch the API directly"); },
  };
  runInNewContext(content, context);
  return { post: context.postIfChanged, warnings };
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
