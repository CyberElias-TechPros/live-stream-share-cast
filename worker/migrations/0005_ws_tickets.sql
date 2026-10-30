-- ---------------------------------------------------------------------------
-- 0005 — short-lived, single-use WebSocket upgrade tickets.
--
-- Reusable JWTs must not be placed in WebSocket URLs: proxies, browser history,
-- and request logs can retain query strings. Tickets are scoped to one stream
-- and role, expire quickly, and are atomically marked used by the upgrade route.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ws_tickets (
  id         TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  stream_id  TEXT NOT NULL REFERENCES streams (id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES users (id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('host', 'viewer')),
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS ws_tickets_expiry_idx ON ws_tickets (expires_at, used_at);
CREATE INDEX IF NOT EXISTS ws_tickets_stream_idx ON ws_tickets (stream_id, created_at DESC);
