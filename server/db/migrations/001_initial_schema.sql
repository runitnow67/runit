-- Initial schema migration
-- Creates users, providers, sessions, and session_history tables

-- Users table (both providers and renters)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  avatar_url TEXT,
  oauth_provider VARCHAR(50) NOT NULL,
  oauth_id VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'renter',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(oauth_provider, oauth_id)
);

-- Provider profiles
CREATE TABLE providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID UNIQUE NOT NULL,
  hardware JSONB,
  pricing JSONB,
  is_active BOOLEAN DEFAULT true,
  total_uptime_hours DECIMAL(10, 2) DEFAULT 0,
  total_sessions INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID UNIQUE NOT NULL,
  access_token UUID UNIQUE NOT NULL,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  renter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  public_url TEXT NOT NULL,
  jupyter_token VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'READY',
  renter_ip INET,
  locked_at TIMESTAMP,
  renter_last_seen TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  terminated_at TIMESTAMP,
  last_seen TIMESTAMP DEFAULT NOW()
);

-- Session history
CREATE TABLE session_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sessions_provider ON sessions(provider_id);
CREATE INDEX idx_sessions_renter ON sessions(renter_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_last_seen ON sessions(last_seen);
CREATE INDEX idx_session_history_session ON session_history(session_id);
CREATE INDEX idx_session_history_created ON session_history(created_at);
CREATE INDEX idx_providers_user ON providers(user_id);
