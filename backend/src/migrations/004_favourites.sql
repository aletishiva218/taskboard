CREATE TABLE IF NOT EXISTS favourite_boards (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, board_id)
);

CREATE INDEX IF NOT EXISTS idx_favourite_boards_user_id ON favourite_boards(user_id);
