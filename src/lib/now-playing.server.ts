import type { D1Database } from "@cloudflare/workers-types";
import { parseTrack, type Track } from "./now-playing.ts";

// Only playback status expires. The last song remains stored indefinitely.
export const PLAYBACK_TTL_SECONDS = 90;

export async function getCurrentTrack(db: D1Database, now = Date.now()): Promise<Track | null> {
  const row = await db.prepare(
    "SELECT track_json, expires_at_ms FROM now_playing WHERE id = 1",
  ).first<{ track_json: string; expires_at_ms: number }>();
  if (!row) return null;
  const track = parseTrack(JSON.parse(row.track_json));
  return track && { ...track, isPlaying: track.isPlaying && row.expires_at_ms > now };
}

export async function saveCurrentTrack(db: D1Database, track: Track, now = Date.now()): Promise<void> {
  await db.prepare(`
    INSERT INTO now_playing (id, track_json, expires_at_ms) VALUES (1, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      track_json = excluded.track_json,
      expires_at_ms = excluded.expires_at_ms
    WHERE json_extract(excluded.track_json, '$.isPlaying') = 1
      OR (
        json_extract(now_playing.track_json, '$.source') = json_extract(excluded.track_json, '$.source')
        AND json_extract(now_playing.track_json, '$.title') = json_extract(excluded.track_json, '$.title')
        AND json_extract(now_playing.track_json, '$.artist') = json_extract(excluded.track_json, '$.artist')
      )
  `).bind(JSON.stringify(track), now + PLAYBACK_TTL_SECONDS * 1000).run();
}
