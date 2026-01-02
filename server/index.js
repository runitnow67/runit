const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

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
    const { providerId, publicUrl, token } = req.body || {};

    if (!providerId || !publicUrl || !token) {
      return res.status(400).json({ error: "invalid payload" });
    }

    const sessionId = crypto.randomUUID();

    sessions[sessionId] = {
      sessionId,
      providerId,
      publicUrl,
      token,
      status: "READY",
      createdAt: Date.now(),
      lastSeen: Date.now()
    };

    console.log("[server] session registered:", sessionId);
    res.json({ sessionId });

  } catch (err) {
    console.error("[server] provider/session error:", err);
    res.status(500).json({ error: "internal error" });
  }
});

// Renter requests session
app.post("/renter/request", (req, res) => {
  const session = Object.values(sessions)
    .find(s => s.status === "READY");

  if (!session) {
    return res.status(404).json({ error: "no sessions available" });
  }

  res.json({
    sessionId: session.sessionId,
    publicUrl: session.publicUrl,
    token: session.token
  });
});

// Provider heartbeat
app.post("/provider/heartbeat", (req, res) => {
  const { sessionId } = req.body || {};

  if (!sessionId || !sessions[sessionId]) {
    return res.status(404).json({ error: "unknown session" });
  }

  sessions[sessionId].lastSeen = Date.now();
  res.json({ ok: true });
});

// Cleanup stale sessions
const SESSION_TTL = 2 * 60 * 1000;

setInterval(() => {
  const now = Date.now();

  for (const [id, session] of Object.entries(sessions)) {
    if (now - session.lastSeen > SESSION_TTL) {
      console.log("[server] removing stale session:", id);
      delete sessions[id];
    }
  }
}, 30 * 1000);

app.listen(PORT, () => {
  console.log(`RUNIT server listening on port ${PORT}`);
});
