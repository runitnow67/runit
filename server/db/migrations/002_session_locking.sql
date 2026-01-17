-- Add session locking and grace period columns

-- Add columns to sessions table (if they don't exist)
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS locked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS abandoned_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMP;

-- Create indexes for locked sessions
CREATE INDEX IF NOT EXISTS idx_sessions_locked_user ON sessions(locked_by_user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_abandoned ON sessions(abandoned_at);
