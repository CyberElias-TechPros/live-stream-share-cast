-- Cloudflare D1 schema — mirrors Supabase tables in
-- src/integrations/supabase/types.ts
-- Run: wrangler d1 execute livestream-db --file=./schema.sql

PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  followers_count INTEGER NOT NULL DEFAULT 0,
  following_count INTEGER NOT NULL DEFAULT 0,
  is_streamer INTEGER NOT NULL DEFAULT 0,
  preferences TEXT,      -- JSON
  social_links TEXT,     -- JSON
  last_seen TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

CREATE TABLE IF NOT EXISTS streams (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  stream_key TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_live INTEGER NOT NULL DEFAULT 0,
  is_recording INTEGER NOT NULL DEFAULT 0,
  viewer_count INTEGER NOT NULL DEFAULT 0,
  peak_viewers INTEGER NOT NULL DEFAULT 0,
  thumbnail_url TEXT,
  category TEXT,
  tags TEXT,             -- JSON array
  stream_type TEXT NOT NULL DEFAULT 'internet',
  recording_url TEXT,
  recording_expiry TEXT,
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_streams_live ON streams(is_live, viewer_count DESC);
CREATE INDEX IF NOT EXISTS idx_streams_user ON streams(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS stream_sessions (
  id TEXT PRIMARY KEY,
  stream_id TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ended_at TEXT,
  duration INTEGER,
  viewer_count INTEGER NOT NULL DEFAULT 0,
  peak_viewers INTEGER,
  avg_view_duration REAL,
  avg_bitrate REAL,
  resolution TEXT,
  recording_url TEXT,
  recording_expiry TEXT,
  stream_type TEXT DEFAULT 'internet',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON stream_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_stream ON stream_sessions(stream_id, created_at DESC);

CREATE TABLE IF NOT EXISTS stream_stats (
  id TEXT PRIMARY KEY,
  stream_id TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  viewer_count INTEGER NOT NULL DEFAULT 0,
  bandwidth REAL,
  cpu_usage REAL,
  memory_usage REAL,
  errors TEXT,           -- JSON
  timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_stats_stream ON stream_stats(stream_id, timestamp ASC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  stream_id TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  metadata TEXT,         -- JSON
  is_moderated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_stream ON chat_messages(stream_id, created_at ASC);

CREATE TABLE IF NOT EXISTS followers (
  id TEXT PRIMARY KEY,
  follower_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(follower_id, following_id)
);
CREATE INDEX IF NOT EXISTS idx_followers_following ON followers(following_id);
CREATE INDEX IF NOT EXISTS idx_followers_follower ON followers(follower_id);
