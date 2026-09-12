-- I'm Live — initial schema (Cloudflare D1 / SQLite)
-- All timestamps are ISO-8601 UTC strings.

PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id              TEXT PRIMARY KEY,                -- nanoid-style public id
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name    TEXT NOT NULL,
  password_hash   TEXT NOT NULL,                   -- pbkdf2-sha256$iterations$salt_b64$hash_b64
  bio             TEXT NOT NULL DEFAULT '',
  avatar_color    TEXT NOT NULL DEFAULT '#7C5CFF', -- deterministic accent for identicon avatar
  followers_count INTEGER NOT NULL DEFAULT 0,
  following_count INTEGER NOT NULL DEFAULT 0,
  preferences     TEXT NOT NULL DEFAULT '{}',      -- JSON UserPreferences
  social_links    TEXT NOT NULL DEFAULT '[]',      -- JSON [{platform,url}]
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX idx_users_username ON users(username);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,                     -- sha256(token) hex — token itself never stored
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT,
  ip         TEXT
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE streams (
  id                  TEXT PRIMARY KEY,             -- short public id used in /watch/:id
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  category            TEXT NOT NULL DEFAULT 'Other',
  tags                TEXT NOT NULL DEFAULT '[]',   -- JSON string[]
  is_live             INTEGER NOT NULL DEFAULT 0,
  is_recording        INTEGER NOT NULL DEFAULT 0,
  recording_key       TEXT,                         -- R2 object key (when cloud recordings configured)
  recording_expires_at TEXT,
  viewer_count        INTEGER NOT NULL DEFAULT 0,
  peak_viewers        INTEGER NOT NULL DEFAULT 0,
  started_at          TEXT,
  ended_at            TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE INDEX idx_streams_live ON streams(is_live, viewer_count DESC);
CREATE INDEX idx_streams_user ON streams(user_id, created_at DESC);

CREATE TABLE stream_sessions (
  id               TEXT PRIMARY KEY,
  stream_id        TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at       TEXT NOT NULL,
  ended_at         TEXT,
  duration_seconds INTEGER,
  peak_viewers     INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL
);

CREATE INDEX idx_sessions_stream ON stream_sessions(stream_id, started_at DESC);
CREATE INDEX idx_stream_sessions_user ON stream_sessions(user_id, started_at DESC);

CREATE TABLE stream_stats (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  stream_id    TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  timestamp    TEXT NOT NULL,
  viewer_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_stats_stream ON stream_stats(stream_id, timestamp);

CREATE TABLE chat_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  stream_id  TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username   TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_chat_stream ON chat_messages(stream_id, id);

CREATE TABLE follows (
  follower_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (follower_id, following_id)
);

CREATE INDEX idx_follows_following ON follows(following_id);

CREATE TABLE login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  identity   TEXT NOT NULL,        -- lowercased email/username attempted
  ip         TEXT,
  success    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_attempts_identity ON login_attempts(identity, created_at);
CREATE INDEX idx_attempts_ip ON login_attempts(ip, created_at);
