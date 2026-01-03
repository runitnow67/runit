const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const providers = {}; // providerId -> { createdAt }
const accessTokens = {}; // accessToken -> sessionId

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

const sessions = {};

// Health check
app.get("/", (req, res) => {
  res.send("RUNIT control plane running ✅");
});

// Provider registers session
app.post("/provider/session", (req, res) => {
  try {
    const { providerId, publicUrl, token, hardware, pricing } = req.body || {};

    if (!providerId || !publicUrl || !token) {
      return res.status(400).json({ error: "invalid payload" });
    }

    // register provider if first time
    if (!providers[providerId]) {
      providers[providerId] = {
        providerId,
        createdAt: Date.now()
      };
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
    return res.status(403).send("Invalid or expired token");
  }

  const session = sessions[sessionId];
  if (!session) {
    return res.status(404).send("Session not found");
  }

  // 🔒 LOCK SESSION - prevent multiple users from accessing same session
  if (session.status !== "READY") {
    return res.status(409).send("Session already in use");
  }

  session.status = "LOCKED";
  session.lockedAt = Date.now();

  console.log("[server] session locked:", sessionId);

  const redirectUrl =
    `${session.publicUrl}/lab?token=${session.jupyterToken}`;

  res.redirect(302, redirectUrl);
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
app.post("/provider/heartbeat", (req, res) => {
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

setInterval(() => {
  const now = Date.now();

  for (const [id, session] of Object.entries(sessions)) {
    if (now - session.lastSeen > SESSION_TTL) {
      console.log("[server] removing stale session:", id);

      // Remove associated access tokens to keep frontend/backend consistent
      for (const [token, sId] of Object.entries(accessTokens)) {
        if (sId === id) {
          delete accessTokens[token];
        }
      }

      delete sessions[id];
    }
  }
}, 30 * 1000);

app.listen(PORT, () => {
  console.log(`RUNIT server listening on port ${PORT}`);
});
