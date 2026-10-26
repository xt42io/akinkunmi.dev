importScripts("config.js", "config.local.js");

async function postTrack(track) {
  const config = globalThis.NOW_PLAYING_CONFIG;
  if (!config?.TOKEN || config.TOKEN.startsWith("replace-with-")) {
    throw new Error("Now Playing is not configured. Rebuild the extension.");
  }
  const response = await fetch(config.API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.TOKEN}`,
    },
    credentials: "omit",
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ ...track, source: "desktop" }),
  });
  if (!response.ok) throw new Error(`Now Playing API returned HTTP ${response.status}`);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "now-playing:track") return false;

  let allowed = false;
  try {
    allowed = sender.id === chrome.runtime.id && Boolean(sender.tab)
      && new URL(sender.url).origin === "https://music.youtube.com";
  } catch { /* Ignore invalid sender URLs. */ }
  if (!allowed) {
    sendResponse({ ok: false, error: "Untrusted Now Playing sender" });
    return false;
  }

  const track = message.track;
  if (typeof track?.title !== "string" || !track.title.trim()
    || typeof track?.artist !== "string" || !track.artist.trim()) {
    sendResponse({ ok: false, error: "Missing track title or artist" });
    return false;
  }

  postTrack(track).then(
    () => sendResponse({ ok: true }),
    error => sendResponse({ ok: false, error: error.message }),
  );
  return true;
});
