CREATE TABLE IF NOT EXISTS guestbook (
  id TEXT PRIMARY KEY,
  creation_time_ms REAL NOT NULL,
  message TEXT NOT NULL,
  author_name TEXT NOT NULL,
  github_username TEXT,
  github_id TEXT,
  author_image TEXT,
  signature TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS guestbook_github_id_unique
  ON guestbook (github_id) WHERE github_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS guestbook_created_at_idx
  ON guestbook (created_at_ms DESC);

CREATE TABLE IF NOT EXISTS reactions (
  id TEXT PRIMARY KEY,
  creation_time_ms REAL NOT NULL,
  slug TEXT NOT NULL,
  emoji TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reactions_slug_emoji_idx ON reactions (slug, emoji);

CREATE TABLE IF NOT EXISTS now_playing (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  track_json TEXT NOT NULL CHECK (json_valid(track_json)),
  expires_at_ms INTEGER NOT NULL
);
