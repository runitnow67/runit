-- RUNIT Database Schema
-- Phase 10: PostgreSQL Migration

-- Users table (both providers and renters)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  avatar_url TEXT,
  oauth_provider VARCHAR(50) NOT NULL, -- 'github', 'google'
  oauth_id VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'renter', -- 'renter', 'provider', 'admin'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(oauth_provider, oauth_id)
);

-- Provider profiles (hardware, pricing, reputation)
CREATE TABLE providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID UNIQUE NOT NULL, -- Legacy provider UUID from agent
  hardware JSONB, -- {gpu, vram_gb, ram_gb}
  pricing JSONB, -- {hourlyUsd}
  is_active BOOLEAN DEFAULT true,
  total_uptime_hours DECIMAL(10, 2) DEFAULT 0,
  total_sessions INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Sessions (active and historical)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID UNIQUE NOT NULL, -- Legacy session ID from server
  access_token UUID UNIQUE NOT NULL,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  renter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  public_url TEXT NOT NULL,
  jupyter_token VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'READY', -- 'READY', 'LOCKED', 'TERMINATED'
  renter_ip INET,
  locked_at TIMESTAMP,
  renter_last_seen TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  terminated_at TIMESTAMP,
  last_seen TIMESTAMP DEFAULT NOW() -- Provider heartbeat
);

-- Session history (for billing/analytics)
CREATE TABLE session_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL, -- 'created', 'locked', 'unlocked', 'terminated'
  metadata JSONB, -- {ip, reason, etc}
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_sessions_provider ON sessions(provider_id);
CREATE INDEX idx_sessions_renter ON sessions(renter_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_last_seen ON sessions(last_seen);
CREATE INDEX idx_session_history_session ON session_history(session_id);
CREATE INDEX idx_session_history_created ON session_history(created_at);
CREATE INDEX idx_providers_user ON providers(user_id);
