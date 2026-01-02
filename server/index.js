const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

/**
 * sessionId -> {
 *   sessionId,
 *   providerId,
 *   publicUrl,
 *   token,
 *   status,
 *   createdAt
 * }
 */
const sessions = {};

// Health check
app.get("/", (req, res) => {
  res.send("RUNIT control plane running ✅");
});

/**
 * Provider registers a ready notebook session
 */
// app.post("/provider/session", (req, res) => {
//   const { providerId, publicUrl, token } = req.body;

//   if (!providerId || !publicUrl || !token) {
//     return res.status(400).json({ error: "missing fields" });
//   }

//   const sessionId = crypto.randomUUID();

//   sessions[sessionId] = {
//     sessionId,
//     providerId,
//     publicUrl,
//     token,
//     status: "READY",
//     createdAt: Date.now()
//   };

//   console.log("[server] session registered:", sessionId);

//   res.json({ sessionId });
// });
app.post("/provider/session", (req, res) => {
  try {
    const { providerId, publicUrl, token } = req.body || {};

    if (!providerId || !publicUrl || !token) {
      console.error("[server] invalid provider payload:", req.body);
      return res.status(400).json({ error: "invalid payload" });
    }

    const sessionId = crypto.randomUUID();

    sessions[sessionId] = {
      sessionId,
      providerId,
      publicUrl,
      token,
      status: "READY",
      createdAt: Date.now()
    };

    console.log("[server] session registered:", sessionId);

    res.json({ sessionId });
  } catch (err) {
    console.error("[server] provider/session error:", err);
    res.status(500).json({ error: "internal error" });
  }
});
/**
 * Renter requests a notebook
 */
app.post("/renter/request", (req, res) => {
  const session = Object.values(sessions).find(
    s => s.status === "READY"
  );

  if (!session) {
    return res.status(404).json({ error: "no sessions available" });
  }

  session.status = "ASSIGNED";

  res.json({
    sessionId: session.sessionId,
    publicUrl: session.publicUrl,
    token: session.token
  });
});

app.listen(PORT, () => {
  console.log(`RUNIT server listening on port ${PORT}`);
});
