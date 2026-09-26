-- ---------------------------------------------------------------------------
-- 0003 — Platform completion
--
-- Everything a production social-live app needs beyond the original MVP:
--   notifications + email delivery queue, VOD/recording library, watch-time
--   analytics, moderation (reports / bans / channel rules), scheduling,
--   blocking, API tokens, tips/payments, push subscriptions, consent records,
--   audit log, client-error telemetry, feature flags and outbound webhooks.
--
-- Conventions follow 0001_init.sql: ISO-8601 UTC text timestamps, JSON blobs
-- stored as TEXT, 0/1 INTEGERs for booleans. No PRAGMA statements (D1 rejects
-- them, error 7500).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. users / streams / chat — additive columns
-- ---------------------------------------------------------------------------

-- Account state (moderation + compliance)
ALTER TABLE users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN ban_reason TEXT;
ALTER TABLE users ADD COLUMN suspended_until TEXT;

-- Profile extras
ALTER TABLE users ADD COLUMN locale TEXT;
ALTER TABLE users ADD COLUMN timezone TEXT;
ALTER TABLE users ADD COLUMN website_url TEXT;
ALTER TABLE users ADD COLUMN donation_url TEXT;
ALTER TABLE users ADD COLUMN pronouns TEXT;

-- Compliance / consent bookkeeping
ALTER TABLE users ADD COLUMN terms_accepted_at TEXT;
ALTER TABLE users ADD COLUMN terms_version TEXT;
ALTER TABLE users ADD COLUMN marketing_opt_in INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN analytics_opt_in INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN data_exported_at TEXT;
ALTER TABLE users ADD COLUMN deleted_at TEXT;

-- Payment provider linkage (Stripe customer / Connect account)
ALTER TABLE users ADD COLUMN payment_customer_id TEXT;
ALTER TABLE users ADD COLUMN payout_account_id TEXT;
ALTER TABLE users ADD COLUMN payouts_enabled INTEGER NOT NULL DEFAULT 0;

-- Stream moderation + library linkage
ALTER TABLE streams ADD COLUMN chat_mode TEXT NOT NULL DEFAULT 'open';   -- open | followers | subscribers
ALTER TABLE streams ADD COLUMN scheduled_for TEXT;
ALTER TABLE streams ADD COLUMN reminder_sent_at TEXT;
ALTER TABLE streams ADD COLUMN is_mature INTEGER NOT NULL DEFAULT 0;
ALTER TABLE streams ADD COLUMN language TEXT;
ALTER TABLE streams ADD COLUMN recording_id TEXT;
ALTER TABLE streams ADD COLUMN total_views INTEGER NOT NULL DEFAULT 0;
ALTER TABLE streams ADD COLUMN unique_viewers INTEGER NOT NULL DEFAULT 0;
ALTER TABLE streams ADD COLUMN watch_minutes INTEGER NOT NULL DEFAULT 0;

-- Chat: replies, soft delete, edit trail
ALTER TABLE chat_messages ADD COLUMN reply_to_id TEXT;
ALTER TABLE chat_messages ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_messages ADD COLUMN edited_at TEXT;

-- ---------------------------------------------------------------------------
-- 2. notifications
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type        TEXT NOT NULL,               -- follow | stream_live | scheduled | system | moderation | tip | mention | reply
  title       TEXT NOT NULL,
  body        TEXT,
  url         TEXT,
  actor_id    TEXT REFERENCES users (id) ON DELETE SET NULL,
  stream_id   TEXT,
  data        TEXT,                        -- JSON blob
  read_at     TEXT,
  emailed_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS notifications_user_idx   ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (user_id, read_at);
CREATE INDEX IF NOT EXISTS notifications_email_idx  ON notifications (emailed_at, created_at);

-- ---------------------------------------------------------------------------
-- 3. transactional email queue
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS email_outbox (
  id                  TEXT PRIMARY KEY,
  to_email            TEXT NOT NULL,
  to_name             TEXT,
  template            TEXT NOT NULL,
  subject             TEXT NOT NULL,
  html                TEXT NOT NULL,
  text                TEXT,
  reply_to            TEXT,
  status              TEXT NOT NULL DEFAULT 'queued',   -- queued | sent | failed | skipped
  attempts            INTEGER NOT NULL DEFAULT 0,
  last_error          TEXT,
  provider            TEXT,
  provider_message_id TEXT,
  scheduled_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  sent_at             TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS email_outbox_status_idx ON email_outbox (status, scheduled_at);

-- ---------------------------------------------------------------------------
-- 4. recordings — VOD library (recordings, replays and clips)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS recordings (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  stream_id           TEXT REFERENCES streams (id) ON DELETE SET NULL,
  session_id          TEXT,
  title               TEXT NOT NULL,
  description         TEXT,
  r2_key              TEXT NOT NULL,
  url                 TEXT NOT NULL,
  thumbnail_url       TEXT,
  duration_seconds    INTEGER,
  size_bytes          INTEGER,
  mime_type           TEXT,
  visibility          TEXT NOT NULL DEFAULT 'public',   -- public | unlisted | private
  status              TEXT NOT NULL DEFAULT 'ready',     -- processing | ready | failed | deleted
  source              TEXT NOT NULL DEFAULT 'browser',   -- browser | obs | upload | clip
  views               INTEGER NOT NULL DEFAULT 0,
  watch_minutes       INTEGER NOT NULL DEFAULT 0,
  category            TEXT,
  tags                TEXT,
  is_mature           INTEGER NOT NULL DEFAULT 0,
  clip_of             TEXT REFERENCES recordings (id) ON DELETE SET NULL,
  clip_start_seconds  REAL,
  clip_end_seconds    REAL,
  retention_expires_at TEXT,
  published_at        TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT
);

CREATE INDEX IF NOT EXISTS recordings_user_idx    ON recordings (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS recordings_stream_idx  ON recordings (stream_id, created_at DESC);
CREATE INDEX IF NOT EXISTS recordings_public_idx  ON recordings (visibility, published_at DESC);
CREATE INDEX IF NOT EXISTS recordings_expiry_idx  ON recordings (retention_expires_at);

-- ---------------------------------------------------------------------------
-- 5. analytics — watch sessions + daily rollups
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS watch_sessions (
  id               TEXT PRIMARY KEY,
  stream_id        TEXT REFERENCES streams (id) ON DELETE CASCADE,
  recording_id     TEXT REFERENCES recordings (id) ON DELETE CASCADE,
  user_id          TEXT REFERENCES users (id) ON DELETE SET NULL,
  viewer_hash      TEXT,                       -- salted hash for signed-out viewers
  is_authenticated INTEGER NOT NULL DEFAULT 0,
  country          TEXT,
  region           TEXT,
  device           TEXT,                       -- mobile | tablet | desktop | tv | unknown
  referrer         TEXT,
  joined_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  left_at          TEXT,
  seconds_watched  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS watch_sessions_stream_idx ON watch_sessions (stream_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS watch_sessions_user_idx   ON watch_sessions (user_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS watch_sessions_rec_idx    ON watch_sessions (recording_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS analytics_daily (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day              TEXT NOT NULL,              -- YYYY-MM-DD (UTC)
  streams_started  INTEGER NOT NULL DEFAULT 0,
  minutes_streamed INTEGER NOT NULL DEFAULT 0,
  peak_viewers     INTEGER NOT NULL DEFAULT 0,
  unique_viewers   INTEGER NOT NULL DEFAULT 0,
  watch_minutes    INTEGER NOT NULL DEFAULT 0,
  new_followers    INTEGER NOT NULL DEFAULT 0,
  chat_messages    INTEGER NOT NULL DEFAULT 0,
  tips_cents       INTEGER NOT NULL DEFAULT 0,
  updated_at       TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS analytics_daily_user_day ON analytics_daily (user_id, day);

-- ---------------------------------------------------------------------------
-- 6. moderation — reports, bans, channel rules
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reports (
  id             TEXT PRIMARY KEY,
  reporter_id    TEXT REFERENCES users (id) ON DELETE SET NULL,
  target_type    TEXT NOT NULL,                -- user | stream | chat_message | recording
  target_id      TEXT NOT NULL,
  stream_id      TEXT,
  reason         TEXT NOT NULL,                -- spam | harassment | hate | sexual | violence | impersonation | copyright | other
  details        TEXT,
  status         TEXT NOT NULL DEFAULT 'open', -- open | reviewing | resolved | dismissed
  resolution_note TEXT,
  handled_by     TEXT REFERENCES users (id) ON DELETE SET NULL,
  handled_at     TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS reports_status_idx ON reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_target_idx ON reports (target_type, target_id);

CREATE TABLE IF NOT EXISTS bans (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  scope       TEXT NOT NULL DEFAULT 'site',    -- site | chat | stream
  stream_id   TEXT,
  kind        TEXT NOT NULL DEFAULT 'ban',     -- ban | timeout
  reason      TEXT,
  issued_by   TEXT REFERENCES users (id) ON DELETE SET NULL,
  expires_at  TEXT,
  revoked_at  TEXT,
  revoked_by  TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS bans_user_idx    ON bans (user_id, scope, revoked_at);
CREATE INDEX IF NOT EXISTS bans_stream_idx  ON bans (stream_id, user_id);

CREATE TABLE IF NOT EXISTS chat_settings (
  stream_id         TEXT PRIMARY KEY REFERENCES streams (id) ON DELETE CASCADE,
  slow_mode_seconds INTEGER NOT NULL DEFAULT 0,
  followers_only    INTEGER NOT NULL DEFAULT 0,
  subscribers_only  INTEGER NOT NULL DEFAULT 0,
  emotes_only       INTEGER NOT NULL DEFAULT 0,
  links_allowed     INTEGER NOT NULL DEFAULT 1,
  min_account_age_minutes INTEGER NOT NULL DEFAULT 0,
  blocked_words     TEXT NOT NULL DEFAULT '[]',
  moderators        TEXT NOT NULL DEFAULT '[]',  -- JSON array of user ids
  updated_at        TEXT
);

CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON user_blocks (blocked_id);

-- ---------------------------------------------------------------------------
-- 7. scheduling
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS scheduled_streams (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  category         TEXT,
  tags             TEXT,
  thumbnail_url    TEXT,
  scheduled_for    TEXT NOT NULL,
  duration_minutes INTEGER,
  timezone         TEXT,
  status           TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled | live | completed | cancelled
  stream_id        TEXT,
  reminder_sent_at TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT
);

CREATE INDEX IF NOT EXISTS scheduled_user_idx  ON scheduled_streams (user_id, scheduled_for);
CREATE INDEX IF NOT EXISTS scheduled_due_idx   ON scheduled_streams (status, scheduled_for, reminder_sent_at);

CREATE TABLE IF NOT EXISTS schedule_reminders (
  id          TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES scheduled_streams (id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (schedule_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 8. platform: audit log, api tokens, feature flags, webhooks, consent
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT,
  actor_role  TEXT,                            -- user | moderator | admin | system
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  metadata    TEXT,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS audit_log_actor_idx  ON audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action, created_at DESC);

CREATE TABLE IF NOT EXISTS api_tokens (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  token_hash   TEXT NOT NULL,
  prefix       TEXT NOT NULL,
  scopes       TEXT NOT NULL DEFAULT '[]',
  last_used_at TEXT,
  expires_at   TEXT,
  revoked_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS api_tokens_hash_idx ON api_tokens (token_hash);
CREATE INDEX IF NOT EXISTS api_tokens_user_idx ON api_tokens (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS feature_flags (
  key         TEXT PRIMARY KEY,
  enabled     INTEGER NOT NULL DEFAULT 0,
  value       TEXT,
  description TEXT,
  updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id               TEXT PRIMARY KEY,
  user_id          TEXT REFERENCES users (id) ON DELETE CASCADE,
  url              TEXT NOT NULL,
  secret           TEXT,
  events           TEXT NOT NULL DEFAULT '[]',
  enabled          INTEGER NOT NULL DEFAULT 1,
  last_status      INTEGER,
  last_delivery_at TEXT,
  failure_count    INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS webhook_user_idx ON webhook_endpoints (user_id);

CREATE TABLE IF NOT EXISTS consents (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users (id) ON DELETE SET NULL,
  kind       TEXT NOT NULL,                    -- terms | privacy | marketing | analytics | cookies
  version    TEXT NOT NULL,
  granted    INTEGER NOT NULL,
  ip         TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS consents_user_idx ON consents (user_id, kind, created_at DESC);

CREATE TABLE IF NOT EXISTS email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                    -- verify_email | change_email
  email      TEXT,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS email_tokens_user_idx ON email_tokens (user_id, kind);

-- ---------------------------------------------------------------------------
-- 9. monetisation — tips and payouts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tips (
  id                 TEXT PRIMARY KEY,
  stream_id          TEXT REFERENCES streams (id) ON DELETE SET NULL,
  recording_id       TEXT,
  streamer_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  tipper_id          TEXT REFERENCES users (id) ON DELETE SET NULL,
  tipper_name        TEXT,
  amount_cents       INTEGER NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'usd',
  message            TEXT,
  status             TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | failed | refunded
  provider           TEXT,
  provider_ref       TEXT,
  provider_session_id TEXT,
  paid_at            TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS tips_streamer_idx ON tips (streamer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tips_stream_idx   ON tips (stream_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS tips_provider_ref ON tips (provider, provider_ref);

-- ---------------------------------------------------------------------------
-- 10. web push + client error telemetry
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT,
  auth        TEXT,
  user_agent  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint ON push_subscriptions (endpoint);
CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS client_errors (
  id          TEXT PRIMARY KEY,
  user_id     TEXT,
  message     TEXT NOT NULL,
  stack       TEXT,
  url         TEXT,
  user_agent  TEXT,
  app_version TEXT,
  release     TEXT,
  fingerprint TEXT,
  occurrences INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT
);

CREATE INDEX IF NOT EXISTS client_errors_fingerprint ON client_errors (fingerprint);
CREATE INDEX IF NOT EXISTS client_errors_created ON client_errors (created_at DESC);

-- ---------------------------------------------------------------------------
-- 11. categories (browse taxonomy managed from the admin console)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS categories (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  emoji       TEXT,
  color       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO categories (slug, name, emoji, sort_order) VALUES
  ('gaming',        'Gaming',        '🎮', 10),
  ('music',         'Music',         '🎧', 20),
  ('talk',          'Just Chatting', '💬', 30),
  ('technology',    'Technology',    '💻', 40),
  ('art',           'Art & Design',  '🎨', 50),
  ('education',     'Education',     '📚', 60),
  ('sports',        'Sports',        '⚽', 70),
  ('faith',         'Faith',         '🙏', 80),
  ('cooking',       'Food & Drink',  '🍳', 90),
  ('fitness',       'Fitness',       '🏋️', 100),
  ('business',      'Business',      '💼', 110),
  ('irl',           'IRL',           '🌍', 120);

-- ---------------------------------------------------------------------------
-- 12. login attempt telemetry (account lockout + abuse detection)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS login_attempts (
  id         TEXT PRIMARY KEY,
  email      TEXT,
  user_id    TEXT,
  ip         TEXT,
  user_agent TEXT,
  success    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts (email, created_at DESC);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx    ON login_attempts (ip, created_at DESC);
