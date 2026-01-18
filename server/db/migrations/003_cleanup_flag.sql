-- Add cleanup flag to sessions to trigger provider-side volume reset
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS needs_cleanup BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_sessions_needs_cleanup ON sessions (needs_cleanup);
