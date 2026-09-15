-- ---------------------------------------------------------------------------
-- live-stream-share-cast — initial D1 schema
--
-- This is the Cloudflare D1 port of the Postgres schema that the Supabase
-- generated types (src/integrations/supabase/types.ts) describe, plus the
-- tables needed for first-party auth (users / sessions / password_resets)
-- and for Durable Object presence bookkeeping (host_connected, last_heartbeat).
--
-- Timestamps are ISO-8601 UTC strings ('YYYY-MM-DDTHH:MM:SS.sssZ') so they can
-- be compared lexicographically and consumed directly by the JS client.
-- ---------------------------------------------------------------------------

PRAGMA foreign_keys = ON;

/* ---------------------------------- users --------------------------------- */

CREATE TABLE IF NOT EXISTS users (
  id               TEXT PRIMARY KEY,
  email            TEXT NOT NULL,
  username         TEXT NOT NULL,
  display_name     TEXT,
  password_hash    TEXT NOT NULL,
  avatar_url       TEXT,
  bio              TEXT,
  is_streamer      INTEGER NOT NULL DEFAULT 0,
  is_admin         INTEGER NOT NULL DEFAULT 0,
  email_verified   INTEGER NOT NULL DEFAULT 0,
  followers_count  INTEGER NOT NULL DEFAULT 0,
  following_count  INTEGER NOT NULL DEFAULT 0,
  preferences      TEXT,                       -- JSON blob (UserPreferences)
  social_links     TEXT,                       -- JSON blob (SocialLink[])
  last_seen        TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_key    ON users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (lower(username));

/* --------------------------------- sessions -------------------------------- */

CREATE TABLE IF NOT EXISTS sessions (
  id                 TEXT PRIMARY KEY,         -- access token jti
  user_id            TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  user_agent         TEXT,
  ip                 TEXT,
  expires_at         TEXT NOT NULL,
  refresh_expires_at TEXT NOT NULL,
  revoked_at         TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS sessions_user_idx    ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx  ON sessions (refresh_expires_at);

/* ----------------------------- password resets ----------------------------- */

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id);

/* --------------------------------- streams --------------------------------- */

CREATE TABLE IF NOT EXISTS streams (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  stream_key       TEXT NOT NULL,
  category         TEXT,
  tags             TEXT,                       -- JSON array of strings
  stream_type      TEXT NOT NULL DEFAULT 'internet',   -- 'local' | 'internet'
  is_live          INTEGER NOT NULL DEFAULT 0,
  is_recording     INTEGER NOT NULL DEFAULT 0,
  viewer_count     INTEGER NOT NULL DEFAULT 0,
  peak_viewers     INTEGER NOT NULL DEFAULT 0,
  thumbnail_url    TEXT,
  recording_url    TEXT,
  recording_key    TEXT,                       -- R2 object key (for deletion)
  recording_expiry TEXT,
  host_connected   INTEGER NOT NULL DEFAULT 0, -- set by the presence Durable Object
  last_heartbeat   TEXT,
  started_at       TEXT,
  ended_at         TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS streams_key_idx       ON streams (stream_key);
CREATE INDEX IF NOT EXISTS streams_live_idx             ON streams (is_live, viewer_count DESC);
CREATE INDEX IF NOT EXISTS streams_user_idx             ON streams (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS streams_category_idx         ON streams (category);
CREATE INDEX IF NOT EXISTS streams_recording_expiry_idx ON streams (recording_expiry);

/* ----------------------------- stream sessions ----------------------------- */

CREATE TABLE IF NOT EXISTS stream_sessions (
  id               TEXT PRIMARY KEY,
  stream_id        TEXT NOT NULL REFERENCES streams (id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  stream_type      TEXT NOT NULL DEFAULT 'internet',
  viewer_count     INTEGER NOT NULL DEFAULT 0,
  peak_viewers     INTEGER NOT NULL DEFAULT 0,
  duration         INTEGER,                    -- seconds
  avg_view_duration INTEGER,
  avg_bitrate      INTEGER,
  resolution       TEXT,
  recording_url    TEXT,
  recording_key    TEXT,
  recording_expiry TEXT,
  started_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ended_at         TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS stream_sessions_stream_idx ON stream_sessions (stream_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stream_sessions_user_idx   ON stream_sessions (user_id, created_at DESC);

/* ------------------------------- stream stats ------------------------------ */

CREATE TABLE IF NOT EXISTS stream_stats (
  id           TEXT PRIMARY KEY,
  stream_id    TEXT NOT NULL REFERENCES streams (id) ON DELETE CASCADE,
  viewer_count INTEGER NOT NULL DEFAULT 0,
  bandwidth    INTEGER NOT NULL DEFAULT 0,
  cpu_usage    REAL,
  memory_usage REAL,
  errors       TEXT,                           -- JSON blob (StreamError[])
  timestamp    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS stream_stats_stream_idx ON stream_stats (stream_id, timestamp);

/* ------------------------------- chat messages ----------------------------- */

CREATE TABLE IF NOT EXISTS chat_messages (
  id           TEXT PRIMARY KEY,
  stream_id    TEXT NOT NULL REFERENCES streams (id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  message      TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'text',   -- text | emote | donation | system
  metadata     TEXT,                           -- JSON blob
  is_moderated INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS chat_messages_stream_idx ON chat_messages (stream_id, created_at);
CREATE INDEX IF NOT EXISTS chat_messages_user_idx   ON chat_messages (user_id);

/* --------------------------------- followers ------------------------------- */

CREATE TABLE IF NOT EXISTS followers (
  follower_id  TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  following_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS followers_following_idx ON followers (following_id);
CREATE INDEX IF NOT EXISTS followers_follower_idx  ON followers (follower_id);
