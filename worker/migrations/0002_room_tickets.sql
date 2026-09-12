-- Room tickets: short-lived credentials for authenticating the *host* role on
-- a room WebSocket (cookies aren't available on cross-origin WS handshakes).

CREATE TABLE room_tickets (
  id         TEXT PRIMARY KEY,          -- sha256(ticket) hex
  stream_id  TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_tickets_stream ON room_tickets(stream_id, expires_at);
