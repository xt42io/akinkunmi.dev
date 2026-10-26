import Redis from "ioredis";
import { createTrackStore } from "./now-playing-store.ts";
import type { Track } from "./now-playing.ts";

declare global {
  // Share state between the API, SSR, and local hot reloads.
  var __akinkunmiNowPlaying: {
    redisUrl: string | undefined;
    redis?: Redis;
    store: ReturnType<typeof createTrackStore>;
  } | undefined;
}

function getStore() {
  const redisUrl = process.env.REDIS_URL ?? import.meta.env?.REDIS_URL;
  if (globalThis.__akinkunmiNowPlaying && globalThis.__akinkunmiNowPlaying.redisUrl === redisUrl) {
    return globalThis.__akinkunmiNowPlaying.store;
  }

  globalThis.__akinkunmiNowPlaying?.redis?.disconnect();
  const redis = redisUrl ? new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 1000,
    commandTimeout: 1500,
    retryStrategy: () => null,
  }) : undefined;
  // Failed operations use the bounded, in-memory fallback in the store.
  redis?.on("error", () => {});
  const cache = redis ? {
    async get(key: string) {
      if (redis.status === "end") await redis.connect();
      return redis.get(key);
    },
    async set(key: string, value: string, mode: "EX", seconds: number) {
      if (redis.status === "end") await redis.connect();
      return redis.set(key, value, mode, seconds);
    },
  } : undefined;

  const store = createTrackStore(cache);
  globalThis.__akinkunmiNowPlaying = { redisUrl, redis, store };
  return store;
}

export function getCurrentTrack(): Promise<Track | null> {
  return getStore().get();
}

export function saveCurrentTrack(track: Track): Promise<void> {
  return getStore().save(track);
}
