-- Make content nullable so file-only messages are allowed
ALTER TABLE board_messages ALTER COLUMN content DROP NOT NULL;

-- Drop the old inline check (PostgreSQL auto-names it based on table+column)
ALTER TABLE board_messages DROP CONSTRAINT IF EXISTS board_messages_content_check;

-- Add attachment columns
ALTER TABLE board_messages
  ADD COLUMN IF NOT EXISTS attachment_url  TEXT,
  ADD COLUMN IF NOT EXISTS attachment_name TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type TEXT,
  ADD COLUMN IF NOT EXISTS attachment_size INTEGER;

-- New constraint: content must be 1-2000 chars if present; at least one of content/attachment must exist
ALTER TABLE board_messages ADD CONSTRAINT board_messages_content_check
  CHECK (
    (content IS NULL OR char_length(content) BETWEEN 1 AND 2000)
    AND (content IS NOT NULL OR attachment_url IS NOT NULL)
  );
