import { parseTrack, type Track } from "./now-playing.ts";

export const TRACK_KEY = "now-playing:latest";
export const TRACK_TTL_SECONDS = 600;

export interface TrackCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", seconds: number): Promise<unknown>;
}

export function createTrackStore(cache?: TrackCache, now = Date.now) {
  let track: Track | null = null;
  let expiresAt = 0;
  let warned = false;

  function warn() {
    if (!warned) console.warn("[now-playing] Redis unavailable; using process-local storage.");
    warned = true;
  }

  return {
    async save(value: Track): Promise<void> {
      track = value;
      expiresAt = now() + TRACK_TTL_SECONDS * 1000;
      if (cache) {
        try {
          await cache.set(TRACK_KEY, JSON.stringify(value), "EX", TRACK_TTL_SECONDS);
          warned = false;
        } catch {
          warn();
        }
      }
    },

    async get(): Promise<Track | null> {
      if (cache) {
        try {
          const value = await cache.get(TRACK_KEY);
          const stored = value ? parseTrack(JSON.parse(value)) : null;
          warned = false;
          if (!stored) {
            track = null;
            expiresAt = 0;
          }
          return stored;
        } catch {
          warn();
        }
      }
      if (now() >= expiresAt) track = null;
      return track;
    },
  };
}
