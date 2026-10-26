export type Track = {
  title: string;
  artist: string;
  album?: string;
  image?: string;
  source: "desktop" | "android";
  url?: string;
  playedAt: string;
};

export const POLL_INTERVAL_MS = 10_000;
export const REQUEST_TIMEOUT_MS = 3_000;

function httpUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function parseTrack(value: unknown): Track | null {
  if (!value || typeof value !== "object") return null;
  const track = value as Record<string, unknown>;
  if (
    typeof track.title !== "string" || !track.title.trim() ||
    typeof track.artist !== "string" || !track.artist.trim() ||
    typeof track.playedAt !== "string" ||
    (track.source !== "desktop" && track.source !== "android")
  ) return null;

  const parsed: Track = {
    title: track.title,
    artist: track.artist,
    source: track.source,
    playedAt: track.playedAt,
  };
  if (typeof track.album === "string") parsed.album = track.album;
  const image = httpUrl(track.image);
  const url = httpUrl(track.url);
  if (image) parsed.image = image;
  if (url) parsed.url = url;
  return parsed;
}

export async function fetchNowPlaying(
  apiUrl: string,
  signal: AbortSignal,
): Promise<Track | null> {
  try {
    const response = await fetch(apiUrl, { cache: "no-store", signal });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return data && typeof data === "object" && "track" in data
      ? parseTrack(data.track)
      : null;
  } catch {
    return null;
  }
}

export function musicLinks(track: Track | null) {
  const query = encodeURIComponent(`${track?.title ?? ""} ${track?.artist ?? ""}`);
  return [
    {
      label: "YouTube Music",
      platform: "youtube_music",
      href: track?.url && new URL(track.url).hostname === "music.youtube.com"
        ? track.url
        : `https://music.youtube.com/search?q=${query}`,
    },
    {
      label: "Spotify",
      platform: "spotify",
      href: `https://open.spotify.com/search/${query}`,
    },
    {
      label: "Apple Music",
      platform: "apple_music",
      href: `https://music.apple.com/search?term=${query}`,
    },
  ];
}
