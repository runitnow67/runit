-- Add session locking and grace period columns

-- Add columns to sessions table
ALTER TABLE sessions 
ADD COLUMN locked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN locked_at TIMESTAMP,
ADD COLUMN abandoned_at TIMESTAMP,
ADD COLUMN last_heartbeat TIMESTAMP;

-- Create index for locked sessions
CREATE INDEX idx_sessions_locked_user ON sessions(locked_by_user_id);
CREATE INDEX idx_sessions_abandoned ON sessions(abandoned_at);
