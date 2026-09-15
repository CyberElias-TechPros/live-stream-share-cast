-- System messages ("X started following the channel", stream notices) are
-- written by the chat Durable Object with no author, so `user_id` must be
-- nullable. SQLite cannot relax a NOT NULL constraint in place, so the table
-- is rebuilt (the standard 12-step ALTER procedure, trimmed down).

PRAGMA foreign_keys = OFF;

CREATE TABLE chat_messages_new (
  id           TEXT PRIMARY KEY,
  stream_id    TEXT NOT NULL REFERENCES streams (id) ON DELETE CASCADE,
  user_id      TEXT REFERENCES users (id) ON DELETE CASCADE,
  message      TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'text',
  metadata     TEXT,
  is_moderated INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO chat_messages_new (id, stream_id, user_id, message, type, metadata, is_moderated, created_at)
  SELECT id, stream_id, user_id, message, type, metadata, is_moderated, created_at FROM chat_messages;

DROP TABLE chat_messages;
ALTER TABLE chat_messages_new RENAME TO chat_messages;

CREATE INDEX IF NOT EXISTS chat_messages_stream_idx ON chat_messages (stream_id, created_at);
CREATE INDEX IF NOT EXISTS chat_messages_user_idx   ON chat_messages (user_id);

PRAGMA foreign_keys = ON;
