const DEBOUNCE_MS = 1200;
const POLL_MS = 5000;
const DEBUG = false;

let lastSignature = "";
let pendingSignature = "";
let domDebounceTimer = undefined;
let mediaDebounceTimer = undefined;
let latestMediaSessionTrack = null;
let pendingMediaTrack = null;

function debug(...args) {
  if (DEBUG) {
    console.log("[Now Playing]", ...args);
  }
}

function text(selector) {
  return document.querySelector(selector)?.textContent?.trim() ?? "";
}

function visibleText(selector) {
  const elements = Array.from(document.querySelectorAll(selector));
  const visible = elements.find((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  return visible?.textContent?.trim() ?? "";
}

function domTrack() {
  const playerBar = document.querySelector("ytmusic-player-bar");
  const root = playerBar ?? document;

  const title =
    root.querySelector(".title")?.textContent?.trim() ||
    visibleText("ytmusic-player-bar yt-formatted-string.title") ||
    visibleText("ytmusic-player-bar .song-title");

  const byline =
    root.querySelector(".byline")?.textContent?.trim() ||
    visibleText("ytmusic-player-bar yt-formatted-string.byline") ||
    visibleText("ytmusic-player-bar .subtitle") ||
    visibleText("ytmusic-player-bar .secondary-flex-columns");

  const artist = byline
    .split(" • ")
    .map((part) => part.trim())
    .filter(Boolean)[0];

  const image =
    playerBar?.querySelector("img")?.src ||
    document.querySelector("ytmusic-player-page img")?.src ||
    "";

  if (!title || !artist) {
    debug("missing title or artist", { title, artist, byline });
    return null;
  }

  return {
    title,
    artist,
    image: image || undefined,
    source: "desktop",
    url: location.href,
    playedAt: new Date().toISOString()
  };
}

function currentTrack() {
  return latestMediaSessionTrack ?? domTrack();
}

async function postTrack(track) {
  await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "now-playing:track", track }, (response) => {
      const error = chrome.runtime.lastError;
      if (error || !response?.ok) {
        reject(new Error(error?.message ?? response?.error ?? "No response from Now Playing"));
      } else {
        resolve();
      }
    });
  });
}

async function postIfChanged(track) {
  if (!track) {
    debug("no track to post");
    return;
  }

  const signature = `${track.title}::${track.artist}`;
  if (signature === lastSignature || signature === pendingSignature) {
    debug("unchanged", signature);
    return;
  }

  pendingSignature = signature;

  try {
    await postTrack(track);
    lastSignature = signature;
    debug("posted", track);
  } catch (error) {
    console.warn("Failed to post now playing track", error);
  } finally {
    if (pendingSignature === signature) pendingSignature = "";
  }
}

function scheduleDomUpdate() {
  clearTimeout(domDebounceTimer);
  domDebounceTimer = setTimeout(() => {
    postIfChanged(currentTrack());
  }, DEBOUNCE_MS);
}

function scheduleMediaUpdate(track) {
  pendingMediaTrack = track;

  clearTimeout(mediaDebounceTimer);
  mediaDebounceTimer = setTimeout(() => {
    const trackToPost = pendingMediaTrack;
    pendingMediaTrack = null;
    postIfChanged(trackToPost);
  }, 700);
}

function mediaSessionTrackFromEvent(event) {
  if (event.source !== window || event.data?.type !== "now-playing:media-session") {
    return null;
  }

  const artwork = event.data.artwork ?? [];
  const image = artwork[artwork.length - 1]?.src || artwork[0]?.src || undefined;
  const title = String(event.data.title ?? "").trim();
  const artist = String(event.data.artist ?? "").trim();
  const album = String(event.data.album ?? "").trim();

  if (!title || !artist) {
    return null;
  }

  return {
    title,
    artist,
    album: album || undefined,
    image,
    source: "desktop",
    url: location.href,
    playedAt: new Date().toISOString()
  };
}

window.addEventListener("message", (event) => {
  const track = mediaSessionTrackFromEvent(event);
  if (!track) return;

  latestMediaSessionTrack = track;
  debug("media session", track);
  scheduleMediaUpdate(track);
});

const observer = new MutationObserver(scheduleDomUpdate);

function start() {
  debug("content script loaded");

  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true
  });

  scheduleDomUpdate();
  window.setInterval(scheduleDomUpdate, POLL_MS);
}

start();
