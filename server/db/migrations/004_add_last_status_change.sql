-- Add last_status_change column to track when status was last updated
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS last_status_change TIMESTAMP DEFAULT NOW();

-- Create index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_sessions_last_status_change ON sessions (last_status_change);

-- Backfill existing sessions (use created_at as best guess)
UPDATE sessions SET last_status_change = created_at WHERE last_status_change IS NULL;
