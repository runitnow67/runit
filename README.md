# RUNIT

🚀 **Remote Unified Notebook Infrastructure & Tunneling**

A production-ready, security-hardened platform for remote Jupyter notebook execution. Think Colab, but decentralized, GPU-aware, and built for real-world deployment.

## What is RUNIT?

RUNIT connects compute providers (machines with GPUs) to renters (users who need compute) through a secure, scalable control plane:

- **Providers** run a lightweight agent that starts isolated Jupyter notebooks
- **Notebooks** are exposed via secure Cloudflare tunnels (no port forwarding)
- **Control plane** handles session management, authentication, and scheduling
- **Direct access** - notebook traffic never flows through the server
- **Security hardened** - rate limiting, container isolation, bandwidth monitoring

## Architecture

```
┌─────────┐                  ┌──────────────┐                  ┌──────────┐
│ Renter  │ ──────────────── │    RENDER    │ ───────────────→ │ Provider │
│ Browser │   Access Token   │ Control Plane│   Heartbeats     │  Agent   │
└─────────┘                  └──────────────┘                  └──────────┘
	│                                                                │
	│                                                                │
	└────────────── Direct Tunnel (Cloudflare) ────────────────────┘
				 Jupyter Lab + WebSocket
```

**Key principle**: GPUs cannot be shared over the internet efficiently.  
**RUNIT's approach**: Move the compute to where the GPU exists.

## 🎯 Current Status: Phase 9 Complete

✅ **Phase 1-5**: Core functionality, persistent sessions, heartbeats  
✅ **Phase 6**: Identity & ownership (access tokens, provider IDs)  
✅ **Phase 7**: GPU metadata & pricing (hardware detection, cost estimation)  
✅ **Phase 8**: Scheduling (multi-provider support, session selection)  
✅ **Phase 9**: Security hardening ← **YOU ARE HERE**

### Phase 9 Security Features

- 🛡️ **Rate limiting** (100 req/15min general, 10 sessions/5min)
- 🔐 **Session hijacking protection** (IP tracking)
- 🐳 **Container isolation** (non-root user, read-only FS, resource limits)
- 📊 **Bandwidth monitoring** (10GB/day cap)
- 📝 **Security logging** (all auth attempts, violations)
- ⚡ **DDoS protection** (express-rate-limit + helmet)

See [PHASE9_SECURITY.md](PHASE9_SECURITY.md) for complete details.

## 🚀 Quick Start

### For Providers (Host a Jupyter Session)

```bash
cd provider

# Create workspace directory
mkdir -p workspace

# Build secure Docker image
docker build -t runit-jupyter docker/

# Run the provider agent
python3 provider_agent.py
```

**What happens:**
1. Agent builds/checks Docker image
2. Starts Jupyter in isolated container (4GB RAM, 2 CPUs max)
3. Starts Cloudflare tunnel
4. Registers session with control plane
5. Sends heartbeats every 30s
6. Auto-shuts down after 10min idle

### For Renters (Use a Remote Notebook)

```bash
# Open the renter interface
open renter/renter.html
```

**What happens:**
1. Fetches available sessions from control plane
2. Shows GPU type, RAM, pricing
3. Click "Connect" → get access token
4. Redirected to provider's Jupyter via secure tunnel
5. Heartbeats maintain session lock
6. Auto-unlocks after 60s of no heartbeat

### For Developers (Run the Control Plane)

```bash
cd server

# Install dependencies (includes security packages)
npm install

# Start server
npm start
```

**Dependencies:**
- `express` - Web framework
- `cors` - Cross-origin support
- `helmet` - Security headers
- `express-rate-limit` - DDoS protection
- `http-proxy-middleware` - Future proxy capabilities

## 📁 Project Structure

```
runit/
├── server/                 # Control plane (Render deployment)
│   ├── index.js           # Express server with security
│   └── package.json       # Dependencies
│
├── provider/              # Provider agent (runs on GPU machine)
│   ├── provider_agent.py  # Main agent script
│   ├── requirements.txt   # Python dependencies
│   └── docker/
│       └── Dockerfile     # Hardened Jupyter container
│
├── renter/                # Frontend (static HTML)
│   └── renter.html        # Session selection UI
│
├── PHASE9_SECURITY.md     # Security documentation
├── test_security.sh       # Security test suite
└── README.md              # You are here
```

## 🔒 Security Testing

```bash
# Run comprehensive security tests
./test_security.sh
```

**Tests:**
- Rate limiting enforcement
- Invalid provider URL blocking
- Session locking (concurrent access prevention)
- Container isolation (non-root, read-only FS)
- Resource limits (CPU, RAM, processes)

## 🛠️ Configuration

### Server ([index.js](server/index.js))
```javascript
RATE_LIMIT_WINDOW = 15 minutes
RATE_LIMIT_MAX = 100 requests
SESSION_LIMIT = 10 per 5 minutes
MAX_BANDWIDTH = 10 GB/day
SESSION_TTL = 2 minutes (no provider heartbeat)
RENTER_HEARTBEAT_TIMEOUT = 60 seconds
```

### Provider ([provider_agent.py](provider/provider_agent.py))
```python
MEMORY_LIMIT = "4g"        # Max RAM per container
CPU_LIMIT = "2.0"          # Max CPU cores
PID_LIMIT = 100            # Max processes
IDLE_TIMEOUT = 10 minutes  # Auto-shutdown if unused
SERVER_URL = "https://runit-p5ah.onrender.com"
```

## 📊 Monitoring

### Security Events (Server Logs)
```bash
[SECURITY] 2026-01-14T10:30:00.000Z - INVALID_ACCESS_ATTEMPT
[SECURITY] 2026-01-14T10:31:00.000Z - SESSION_HIJACK_ATTEMPT
[SECURITY] 2026-01-14T10:32:00.000Z - BANDWIDTH_EXCEEDED
```

### Provider Metrics
```bash
docker stats runit-session
```

## 🔮 Roadmap

### Phase 10 - "Company Mode" (Next)
- 📊 Real-time dashboard with security metrics
- 🔔 Webhook alerts for security events
- 💰 Billing integration with usage tracking
- 📈 Auto-scaling provider pools
- 🔐 OAuth2 + API keys
- 🗄️ Persistent audit logs
- 🌍 Geographic routing

### Future Phases
- Multi-region deployment
- Provider reputation system
- Custom Docker images
- Spot instance support
- Team accounts & quotas

## 🤝 Contributing

This is a research/demonstration project showing how to build a decentralized compute platform with enterprise-grade security.

## 📄 License

MIT

## 🙏 Acknowledgments

Built with:
- **Cloudflare Tunnels** - Secure public access without port forwarding
- **Docker** - Container isolation
- **Express.js** - Control plane API
- **Jupyter Lab** - Notebook interface
- **Render** - Control plane hosting

---

**Current Build**: Phase 9 Complete (Security Hardening)  
**Status**: Production-ready for controlled deployment  
**Last Updated**: January 14, 2026
