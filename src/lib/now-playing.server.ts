import type { D1Database } from "@cloudflare/workers-types";
import { parseTrack, type Track } from "./now-playing.ts";

export const TRACK_TTL_SECONDS = 600;

export async function getCurrentTrack(db: D1Database, now = Date.now()): Promise<Track | null> {
  const row = await db.prepare(
    "SELECT track_json FROM now_playing WHERE id = 1 AND expires_at_ms > ?",
  ).bind(now).first<{ track_json: string }>();
  return row ? parseTrack(JSON.parse(row.track_json)) : null;
}

export async function saveCurrentTrack(db: D1Database, track: Track, now = Date.now()): Promise<void> {
  await db.prepare(`
    INSERT INTO now_playing (id, track_json, expires_at_ms) VALUES (1, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      track_json = excluded.track_json,
      expires_at_ms = excluded.expires_at_ms
  `).bind(JSON.stringify(track), now + TRACK_TTL_SECONDS * 1000).run();
}
