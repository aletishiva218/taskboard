CREATE TABLE IF NOT EXISTS board_messages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id   UUID        NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  content    TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_board_messages_board_created
  ON board_messages(board_id, created_at DESC);
