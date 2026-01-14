const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { createProxyMiddleware } = require("http-proxy-middleware");

const providers = {}; // providerId -> { createdAt }
const accessTokens = {}; // accessToken -> sessionId
const sessionBandwidth = {}; // sessionId -> { bytesIn, bytesOut, lastReset }

const app = express();

// 🔒 Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Allow iframe embedding for Jupyter
  crossOriginEmbedderPolicy: false
}));

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Limit request body size

const PORT = process.env.PORT || 10000;

const sessions = {};

// 🛡️ Rate limiting for different endpoints
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false
});

const sessionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // Limit session creation to 10 per 5 minutes
  message: "Too many session requests, please try again later."
});

const heartbeatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Allow frequent heartbeats
  skipSuccessfulRequests: true
});

// Apply general rate limiting to all requests
app.use(generalLimiter);

// Health check
app.get("/", (req, res) => {
  res.send("RUNIT control plane running ✅");
});

// 🔒 Security logging middleware
function logSecurityEvent(type, details) {
  console.log(`[SECURITY] ${new Date().toISOString()} - ${type}:`, details);
}

// 🔒 Middleware to track bandwidth per session
function trackBandwidth(sessionId, bytesIn, bytesOut) {
  if (!sessionBandwidth[sessionId]) {
    sessionBandwidth[sessionId] = {
      bytesIn: 0,
      bytesOut: 0,
      lastReset: Date.now()
    };
  }

  sessionBandwidth[sessionId].bytesIn += bytesIn || 0;
  sessionBandwidth[sessionId].bytesOut += bytesOut || 0;

  // Reset daily (24 hours)
  const now = Date.now();
  if (now - sessionBandwidth[sessionId].lastReset > 24 * 60 * 60 * 1000) {
    sessionBandwidth[sessionId].bytesIn = 0;
    sessionBandwidth[sessionId].bytesOut = 0;
    sessionBandwidth[sessionId].lastReset = now;
  }

  // Bandwidth cap: 10 GB per day
  const MAX_BANDWIDTH = 10 * 1024 * 1024 * 1024; // 10 GB
  const totalBandwidth = sessionBandwidth[sessionId].bytesIn + sessionBandwidth[sessionId].bytesOut;

  if (totalBandwidth > MAX_BANDWIDTH) {
    logSecurityEvent("BANDWIDTH_EXCEEDED", { sessionId, totalBandwidth });
    return false; // Bandwidth exceeded
  }

  return true; // Within limits
}

// Provider registers session
app.post("/provider/session", sessionLimiter, (req, res) => {
  try {
    const { providerId, publicUrl, token, hardware, pricing } = req.body || {};

    if (!providerId || !publicUrl || !token) {
      logSecurityEvent("INVALID_PROVIDER_REGISTRATION", { 
        ip: req.ip, 
        providerId 
      });
      return res.status(400).json({ error: "invalid payload" });
    }

    // Validate URL format
    if (!publicUrl.startsWith("https://") || !publicUrl.includes("trycloudflare.com")) {
      logSecurityEvent("SUSPICIOUS_PROVIDER_URL", { 
        ip: req.ip, 
        providerId, 
        publicUrl 
      });
      return res.status(400).json({ error: "invalid public URL" });
    }

    // register provider if first time
    if (!providers[providerId]) {
      providers[providerId] = {
        providerId,
        createdAt: Date.now()
      };
      logSecurityEvent("NEW_PROVIDER_REGISTERED", { providerId, ip: req.ip });
    }

    const sessionId = crypto.randomUUID();
    const accessToken = crypto.randomUUID();

    sessions[sessionId] = {
      sessionId,
      providerId,
      publicUrl,
      jupyterToken: token,
      hardware,
      pricing,
      status: "READY",
      createdAt: Date.now(),
      lastSeen: Date.now()
    };

    accessTokens[accessToken] = sessionId;

    console.log("[server] session registered:", sessionId);

    res.json({
      sessionId,
      accessToken
    });

  } catch (err) {
    console.error("[server] provider/session error:", err);
    logSecurityEvent("PROVIDER_REGISTRATION_ERROR", { error: err.message });
    res.status(500).json({ error: "internal error" });
  }
});
// Get all available sessions
app.get("/renter/sessions", (req, res) => {
  const availableSessions = Object.entries(sessions)
    .filter(([_, s]) => s.status === "READY")
    .map(([sessionId, s]) => {
      const accessToken = Object.keys(accessTokens).find(
        t => accessTokens[t] === sessionId
      );
      return {
        sessionId,
        accessToken,
        hardware: s.hardware,
        pricing: s.pricing
      };
    });

  res.json(availableSessions);
});

// Renter requests session
app.post("/renter/request", (req, res) => {
  const session = Object.values(sessions).find(
    s => s.status === "READY"
  );

  if (!session) {
    return res.status(404).json({ error: "no sessions available" });
  }

  const accessToken = Object.keys(accessTokens).find(
    t => accessTokens[t] === session.sessionId
  );

  res.json({
    accessToken,
    hardware: session.hardware,
    pricing: session.pricing
  });
});

app.get("/access/:accessToken", (req, res) => {
  const { accessToken } = req.params;
  const sessionId = accessTokens[accessToken];

  if (!sessionId) {
    logSecurityEvent("INVALID_ACCESS_ATTEMPT", { 
      ip: req.ip, 
      accessToken: accessToken.substring(0, 8) + "..." 
    });
    return res.status(403).send("Invalid or expired token");
  }

  const session = sessions[sessionId];
  if (!session) {
    logSecurityEvent("SESSION_NOT_FOUND", { sessionId, ip: req.ip });
    return res.status(404).send("Session not found");
  }

  // 🔒 LOCK SESSION - prevent multiple users from accessing same session
  if (session.status !== "READY") {
    logSecurityEvent("SESSION_ALREADY_LOCKED", { 
      sessionId, 
      ip: req.ip, 
      status: session.status 
    });
    return res.status(409).send("Session already in use");
  }

  session.status = "LOCKED";
  session.lockedAt = Date.now();
  session.renterLastSeen = Date.now();
  session.renterIp = req.ip; // Track renter IP

  logSecurityEvent("SESSION_LOCKED", { sessionId, ip: req.ip });
  console.log("[server] session locked:", sessionId);

  const redirectUrl =
    `${session.publicUrl}/lab?token=${session.jupyterToken}`;

  res.redirect(302, redirectUrl);
});

// Renter heartbeat - proves renter still connected
app.post("/renter/heartbeat/:accessToken", heartbeatLimiter, (req, res) => {
  const sessionId = accessTokens[req.params.accessToken];
  
  if (!sessionId || !sessions[sessionId]) {
    return res.status(404).json({ error: "session not found" });
  }

  // Verify IP matches original renter (prevent session hijacking)
  const session = sessions[sessionId];
  if (session.renterIp && session.renterIp !== req.ip) {
    logSecurityEvent("SESSION_HIJACK_ATTEMPT", { 
      sessionId, 
      originalIp: session.renterIp, 
      attemptIp: req.ip 
    });
    return res.status(403).json({ error: "IP mismatch - access denied" });
  }

  sessions[sessionId].renterLastSeen = Date.now();
  res.json({ ok: true });
});

// Renter release - unlock session when user disconnects
app.post("/renter/release/:accessToken", (req, res) => {
  const sessionId = accessTokens[req.params.accessToken];
  
  if (sessionId && sessions[sessionId]) {
    sessions[sessionId].status = "READY";
    delete sessions[sessionId].lockedAt;
    delete sessions[sessionId].renterLastSeen;
    console.log("[server] session unlocked (released by renter):", sessionId);
  }
  
  res.json({ ok: true });
});

// Get session status (used by provider to check if in use)
app.get("/provider/session/:sessionId", (req, res) => {
  const session = sessions[req.params.sessionId];
  if (!session) {
    return res.status(404).json({ error: "not found" });
  }
  res.json({ status: session.status });
});

// Provider heartbeat
app.post("/provider/heartbeat", heartbeatLimiter, (req, res) => {
  const { sessionId } = req.body || {};

  if (!sessionId) {
    return res.status(400).json({ error: "missing sessionId" });
  }

  if (!sessions[sessionId]) {
    console.log("[server] heartbeat for unknown session (server may have restarted):", sessionId);
    return res.status(404).json({ error: "unknown session - re-register required" });
  }

  sessions[sessionId].lastSeen = Date.now();
  console.log("[server] heartbeat updated for:", sessionId, "| Total active sessions:", Object.keys(sessions).length);
  res.json({ ok: true });
});

// Cleanup stale sessions
const SESSION_TTL = 2 * 60 * 1000;
const RENTER_HEARTBEAT_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours (only for abandoned sessions)

setInterval(() => {
  const now = Date.now();

  for (const [id, session] of Object.entries(sessions)) {
    // Auto-unlock LOCKED sessions only if:
    // 1. No renter heartbeat for 2 HOURS (abandoned session)
    // 2. Provider is still alive (has recent heartbeat)
    if (session.status === "LOCKED" && session.renterLastSeen) {
      const renterAbandoned = now - session.renterLastSeen > RENTER_HEARTBEAT_TIMEOUT;
      const providerAlive = now - session.lastSeen < SESSION_TTL;
      
      if (renterAbandoned && providerAlive) {
        session.status = "READY";
        delete session.lockedAt;
        delete session.renterLastSeen;
        delete session.renterIp;
        logSecurityEvent("SESSION_AUTO_UNLOCKED", { sessionId: id, reason: "abandoned_2hr_timeout" });
        console.log("[server] auto-unlocked abandoned session (2hr timeout):", id);
      }
    }

    // Remove sessions with no provider heartbeat (provider offline)
    if (now - session.lastSeen > SESSION_TTL) {
      logSecurityEvent("SESSION_REMOVED", { sessionId: id, reason: "stale_provider" });
      console.log("[server] removing stale session:", id);

      // Remove associated access tokens to keep frontend/backend consistent
      for (const [token, sId] of Object.entries(accessTokens)) {
        if (sId === id) {
          delete accessTokens[token];
        }
      }

      // Clean up bandwidth tracking
      delete sessionBandwidth[id];
      delete sessions[id];
    }
  }
}, 30 * 1000);
app.listen(PORT, () => {
  console.log(`RUNIT server listening on port ${PORT}`);
});
