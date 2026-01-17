# RUNIT Phase 10 - PostgreSQL + OAuth Setup Guide

## 📋 Prerequisites

- PostgreSQL 14+ installed
- Node.js 18+
- GitHub account (for OAuth)

## 🗄️ Database Setup

### 1. Install PostgreSQL (if not already installed)

**macOS:**
```bash
brew install postgresql@14
brew services start postgresql@14
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### 2. Create Database

```bash
# Login to PostgreSQL
psql postgres

# Create database and user
CREATE DATABASE runit_dev;
CREATE USER runit_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE runit_dev TO runit_user;

# Exit
\q
```

### 3. Configure Environment

```bash
cd server
cp .env.example .env
```

Edit `.env`:
```bash
DATABASE_URL=postgresql://runit_user:your_secure_password@localhost:5432/runit_dev
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Run Migrations

```bash
npm run migrate
```

You should see:
```
[migrate] → Running 001_initial_schema.sql...
[migrate] ✓ 001_initial_schema.sql executed successfully
[migrate] All migrations completed
```

## 🔐 GitHub OAuth Setup

### 1. Create GitHub OAuth App

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in:
   - **Application name:** RUNIT (or your choice)
   - **Homepage URL:** `http://localhost:10000`
   - **Authorization callback URL:** `http://localhost:10000/auth/github/callback`
4. Click "Register application"
5. Copy **Client ID** and **Client Secret**

### 2. Update .env

```bash
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
GITHUB_CALLBACK_URL=http://localhost:10000/auth/github/callback
```

## 🚀 Running the Server

### Start Server (new version with PostgreSQL + OAuth)

```bash
node index_v2.js
```

You should see:
```
[db] Connected to PostgreSQL: 2026-01-17T...
RUNIT server listening on port 10000
```

## 🧪 Testing Authentication

### 1. Login with GitHub

Visit: http://localhost:10000/auth/github

This will:
1. Redirect to GitHub for authorization
2. Create a user account in the database
3. Return a JWT token

### 2. Test API with Token

```bash
# Get your user info
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  http://localhost:10000/auth/me
```

## 🔄 Provider Updates (Coming Next)

The provider agent will need updates to:
1. Authenticate with GitHub before registering sessions
2. Include JWT token in registration requests

## 📊 Database Schema

**Tables created:**
- `users` - GitHub/Google authenticated users
- `providers` - Provider profiles (hardware, pricing)
- `sessions` - Active and historical sessions
- `session_history` - Audit log of all session events
- `migrations` - Track applied database migrations

## 🛠️ Useful Commands

```bash
# Connect to database
psql postgresql://runit_user:password@localhost:5432/runit_dev

# View tables
\dt

# View users
SELECT id, email, name, role FROM users;

# View active sessions
SELECT session_id, status, created_at FROM sessions WHERE status IN ('READY', 'LOCKED');

# View session history
SELECT * FROM session_history ORDER BY created_at DESC LIMIT 10;
```

## 🐛 Troubleshooting

**"Connection refused":**
- Ensure PostgreSQL is running: `brew services list` or `sudo systemctl status postgresql`

**"role does not exist":**
- Make sure you created the user: `CREATE USER runit_user WITH ENCRYPTED PASSWORD '...'`

**"GitHub OAuth not configured":**
- Check `.env` has `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`

## ⏭️ Next Steps

1. Test provider registration with auth
2. Update renter HTML to handle authentication
3. Build dashboard UI
4. Add billing tracking
