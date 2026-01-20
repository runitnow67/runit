require('dotenv').config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const helmet = require("helmet");
const session = require("express-session");
const passport = require("passport");
const GitHubStrategy = require("passport-github2").Strategy;
const jwt = require("jsonwebtoken");

const db = require("./db/connection");

const app = express();

// 🔒 Security headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: [
    'https://runit-p5ah.onrender.com',
    'http://localhost:10000',
    'http://127.0.0.1:10000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Serve static files (renter UI)
app.use(express.static('public'));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  },
  proxy: true // Trust Render's proxy
}));

app.use(passport.initialize());
app.use(passport.session());

const PORT = process.env.PORT || 10000;

// 🔒 Security logging
function logSecurityEvent(type, details) {
  console.log(`[SECURITY] ${new Date().toISOString()} - ${type}:`, details);
}

// Passport serialization
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, rows[0]);
  } catch (err) {
    done(err);
  }
});

// GitHub OAuth Strategy
if (process.env.GITHUB_CLIENT_ID) {
  passport.use(new GitHubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Find or create user
        const { rows: existing } = await db.query(
          'SELECT * FROM users WHERE oauth_provider = $1 AND oauth_id = $2',
          ['github', profile.id]
        );

        if (existing.length > 0) {
          return done(null, existing[0]);
        }

        // Create new user
        const { rows: newUser } = await db.query(
          `INSERT INTO users (email, name, avatar_url, oauth_provider, oauth_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [
            profile.emails?.[0]?.value || `${profile.username}@github.com`,
            profile.displayName || profile.username,
            profile.photos?.[0]?.value,
            'github',
            profile.id
          ]
        );

        done(null, newUser[0]);
      } catch (err) {
        done(err);
      }
    }
  ));
} else {
  console.warn('[auth] GitHub OAuth not configured - authentication disabled');
}

// Middleware to check authentication
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  
  // Check for JWT token in Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
      req.user = decoded;
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }
  
  res.status(401).json({ error: 'Authentication required' });
}

// Health check
app.get("/", (req, res) => {
  res.send("RUNIT control plane running ✅");
});

// Renter UI
app.get("/renter", (req, res) => {
  res.sendFile(__dirname + "/public/renter.html");
});

// Auth routes
app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));

app.get('/auth/github/callback',
  passport.authenticate('github', { failureRedirect: '/login' }),
  (req, res) => {
    // Session cookie is automatically set by Passport
    // Redirect to renter page
    res.redirect('/renter');
  }
);

app.get('/auth/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/renter');
  });
});

app.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get('/auth/success', (req, res) => {
  const { token } = req.query;
  res.send(`
    <html>
      <head><title>Login Successful</title></head>
      <body>
        <h2>✅ Login Successful!</h2>
        <p>Your token:</p>
        <pre>${token}</pre>
        <p>Save this token and use it in your API requests.</p>
        <script>
          // Auto-copy token to clipboard
          navigator.clipboard.writeText('${token}');
        </script>
      </body>
    </html>
  `);
});

// Provider registers session (requires auth)
app.post("/provider/session", requireAuth, async (req, res) => {
  try {
    const { providerId, publicUrl, token, hardware, pricing } = req.body || {};

    if (!providerId || !publicUrl || !token) {
      logSecurityEvent("INVALID_PROVIDER_REGISTRATION", { 
        ip: req.ip, 
        userId: req.user?.id 
      });
      return res.status(400).json({ error: "invalid payload" });
    }

    if (!publicUrl.startsWith("https://") || !publicUrl.includes("trycloudflare.com")) {
      logSecurityEvent("SUSPICIOUS_PROVIDER_URL", { 
        ip: req.ip, 
        userId: req.user?.id, 
        publicUrl 
      });
      return res.status(400).json({ error: "invalid public URL" });
    }

    // Create or get provider profile
    let providerRecord;
    const { rows: existingProvider } = await db.query(
      'SELECT * FROM providers WHERE user_id = $1',
      [req.user.id]
    );

    if (existingProvider.length > 0) {
      // Update existing provider
      const { rows } = await db.query(
        `UPDATE providers 
         SET provider_id = $1, hardware = $2, pricing = $3, is_active = true, updated_at = NOW()
         WHERE user_id = $4 
         RETURNING *`,
        [providerId, hardware, pricing, req.user.id]
      );
      providerRecord = rows[0];
    } else {
      // Create new provider
      const { rows } = await db.query(
        `INSERT INTO providers (user_id, provider_id, hardware, pricing)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [req.user.id, providerId, hardware, pricing]
      );
      providerRecord = rows[0];
      logSecurityEvent("NEW_PROVIDER_REGISTERED", { providerId: providerRecord.id, userId: req.user.id });
    }

    // Create session
    const sessionId = crypto.randomUUID();
    const accessToken = crypto.randomUUID();

    const { rows: sessionRows } = await db.query(
      `INSERT INTO sessions 
       (session_id, access_token, provider_id, public_url, jupyter_token, status, last_seen)
       VALUES ($1, $2, $3, $4, $5, 'READY', NOW())
       RETURNING *`,
      [sessionId, accessToken, providerRecord.id, publicUrl, token]
    );

    // Log session creation
    await db.query(
      `INSERT INTO session_history (session_id, event_type, metadata)
       VALUES ((SELECT id FROM sessions WHERE session_id = $1), 'created', $2)`,
      [sessionId, JSON.stringify({ ip: req.ip })]
    );

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

// Get all available sessions (auth required)
app.get("/renter/sessions", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // READY sessions for all users
    const { rows: readySessions } = await db.query(
      `SELECT s.session_id, s.access_token, p.hardware, p.pricing, u.name as provider_name, 'READY' as session_status
       FROM sessions s
       JOIN providers p ON s.provider_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE s.status = 'READY'
       ORDER BY s.created_at DESC`
    );

    // LOCKED sessions for current user (show persistent Release)
    const { rows: lockedSessions } = await db.query(
      `SELECT s.session_id, s.access_token, p.hardware, p.pricing, u.name as provider_name, 'LOCKED' as session_status
       FROM sessions s
       JOIN providers p ON s.provider_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE s.status = 'LOCKED' AND s.locked_by_user_id = $1
       ORDER BY s.locked_at DESC`,
      [userId]
    );

    // LOCKED_ABANDONED sessions for current user (with reconnect option)
    const { rows: abandonedSessions } = await db.query(
      `SELECT s.session_id, s.access_token, p.hardware, p.pricing, u.name as provider_name, 'LOCKED_ABANDONED' as session_status
       FROM sessions s
       JOIN providers p ON s.provider_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE s.status = 'LOCKED_ABANDONED' AND s.locked_by_user_id = $1
       ORDER BY s.abandoned_at DESC`,
      [userId]
    );

    const sessions = [
      ...readySessions.map(r => ({
        sessionId: r.session_id,
        accessToken: r.access_token,
        hardware: r.hardware,
        pricing: r.pricing,
        providerName: r.provider_name,
        sessionStatus: r.session_status
      })),
      ...lockedSessions.map(r => ({
        sessionId: r.session_id,
        accessToken: r.access_token,
        hardware: r.hardware,
        pricing: r.pricing,
        providerName: r.provider_name,
        sessionStatus: r.session_status
      })),
      ...abandonedSessions.map(r => ({
        sessionId: r.session_id,
        accessToken: r.access_token,
        hardware: r.hardware,
        pricing: r.pricing,
        providerName: r.provider_name,
        sessionStatus: r.session_status,
        isAbandoned: true
      }))
    ];

    res.json(sessions);
  } catch (err) {
    console.error("[server] renter/sessions error:", err);
    res.status(500).json({ error: "internal error" });
  }
});

// Access session (lock it)
app.get("/access/:accessToken", requireAuth, async (req, res) => {
  try {
    const { accessToken } = req.params;
    const userId = req.user.id;

    // Get session
    const { rows } = await db.query(
      `SELECT s.*, p.provider_id, s.jupyter_token 
       FROM sessions s
       JOIN providers p ON s.provider_id = p.id
       WHERE s.access_token = $1`,
      [accessToken]
    );

    if (rows.length === 0) {
      logSecurityEvent("INVALID_ACCESS_ATTEMPT", { 
        ip: req.ip, 
        accessToken: accessToken.substring(0, 8) + "...",
        userId
      });
      return res.status(403).send("Invalid or expired token");
    }

    const session = rows[0];

    // Allow LOCKED_ABANDONED sessions for the owner to reconnect
    if (session.status === "LOCKED" && session.locked_by_user_id !== userId) {
      logSecurityEvent("SESSION_ALREADY_LOCKED", { 
        sessionId: session.session_id, 
        ip: req.ip, 
        status: session.status,
        lockedByUser: session.locked_by_user_id,
        attemptUser: userId
      });
      return res.status(409).send("Session already in use by another user");
    }

    if (session.status !== "READY" && session.status !== "LOCKED_ABANDONED") {
      logSecurityEvent("SESSION_INVALID_STATE", { 
        sessionId: session.session_id, 
        ip: req.ip, 
        status: session.status 
      });
      return res.status(409).send("Session not available");
    }

    // Lock session or re-lock abandoned session
    await db.query(
      `UPDATE sessions 
       SET status = 'LOCKED', locked_by_user_id = $1, locked_at = NOW(), 
           abandoned_at = NULL, last_heartbeat = NOW(),
           renter_last_seen = NOW(), renter_ip = $2::inet, renter_id = $1,
           last_status_change = NOW()
       WHERE access_token = $3`,
      [userId, req.ip, accessToken]
    );

    // Log lock event
    await db.query(
      `INSERT INTO session_history (session_id, event_type, metadata)
       VALUES ($1, 'locked', $2)`,
      [session.id, JSON.stringify({ ip: req.ip, userId, type: session.status === 'LOCKED_ABANDONED' ? 'reconnect' : 'lock' })]
    );

    logSecurityEvent("SESSION_LOCKED", { sessionId: session.session_id, userId, ip: req.ip });
    console.log("[server] session locked:", session.session_id, "user:", userId);

    const redirectUrl = `${session.public_url}/lab?token=${session.jupyter_token}`;
    res.redirect(302, redirectUrl);

  } catch (err) {
    console.error("[server] access error:", err);
    res.status(500).send("Internal error");
  }
});

// Renter heartbeat (auth required)
app.post("/renter/heartbeat/:accessToken", requireAuth, async (req, res) => {
  try {
    const { accessToken } = req.params;
    const userId = req.user.id;
    
    const { rows } = await db.query(
      'SELECT * FROM sessions WHERE access_token = $1',
      [accessToken]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "session not found" });
    }

    const session = rows[0];

    // Verify user owns this session
    if (session.locked_by_user_id !== userId) {
      logSecurityEvent("HEARTBEAT_UNAUTHORIZED", { 
        sessionId: session.session_id, 
        sessionOwner: session.locked_by_user_id,
        attemptUser: userId
      });
      return res.status(403).json({ error: "not authorized" });
    }

    if (session.renter_ip && session.renter_ip !== req.ip) {
      logSecurityEvent("SESSION_HIJACK_ATTEMPT", { 
        sessionId: session.session_id, 
        originalIp: session.renter_ip, 
        attemptIp: req.ip 
      });
      return res.status(403).json({ error: "IP mismatch - access denied" });
    }

    // Update last heartbeat and last seen
    await db.query(
      'UPDATE sessions SET last_heartbeat = NOW(), renter_last_seen = NOW() WHERE access_token = $1',
      [accessToken]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("[server] heartbeat error:", err);
    res.status(500).json({ error: "internal error" });
  }
});

// Renter release session (auth required)
app.post("/renter/release/:accessToken", requireAuth, async (req, res) => {
  try {
    const { accessToken } = req.params;
    const userId = req.user.id;
    
    const { rows } = await db.query(
      `SELECT * FROM sessions WHERE access_token = $1`,
      [accessToken]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "session not found" });
    }

    const session = rows[0];

    // Only session owner can release
    if (session.locked_by_user_id !== userId) {
      logSecurityEvent("RELEASE_UNAUTHORIZED", { 
        sessionId: session.session_id,
        sessionOwner: session.locked_by_user_id,
        attemptUser: userId
      });
      return res.status(403).json({ error: "not authorized" });
    }

    // Mark for cleanup but keep LOCKED so no one else can connect during cleanup window
    const { rows: updated } = await db.query(
      `UPDATE sessions 
       SET status = 'CLEANING', locked_by_user_id = NULL, locked_at = NULL, 
           abandoned_at = NULL, last_heartbeat = NULL,
           renter_last_seen = NULL, renter_ip = NULL, renter_id = NULL,
           needs_cleanup = TRUE, last_status_change = NOW()
       WHERE access_token = $1
       RETURNING session_id, id`,
      [accessToken]
    );

    if (updated.length > 0) {
      await db.query(
        `INSERT INTO session_history (session_id, event_type, metadata)
         VALUES ($1, 'unlocked', $2)`,
        [updated[0].id, JSON.stringify({ reason: 'manual_release', userId })]
      );
      console.log("[server] session unlocked (released by renter):", updated[0].session_id);
    }
    
    res.json({ ok: true });
  } catch (err) {
    console.error("[server] release error:", err);
    res.status(500).json({ error: "internal error" });
  }
});

// Get session status
app.get("/provider/session/:sessionId", async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT status, needs_cleanup FROM sessions WHERE session_id = $1',
      [req.params.sessionId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: "not found" });
    }
    
    res.json({ status: rows[0].status, needs_cleanup: rows[0].needs_cleanup });
  } catch (err) {
    console.error("[server] session status error:", err);
    res.status(500).json({ error: "internal error" });
  }
});

// Provider acknowledges cleanup and retires old session
app.post("/provider/session/:sessionId/cleanup_ack", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { rows } = await db.query(
      'SELECT id, session_id FROM sessions WHERE session_id = $1',
      [sessionId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'not found' });
    }

    const sessionDbId = rows[0].id;

    // Terminate old session completely - provider will register a new one
    const { rows: updated } = await db.query(
      `UPDATE sessions
       SET status = 'TERMINATED', terminated_at = NOW(), needs_cleanup = FALSE, last_status_change = NOW()
       WHERE session_id = $1
       RETURNING id, session_id`,
      [sessionId]
    );

    if (updated.length > 0) {
      await db.query(
        `INSERT INTO session_history (session_id, event_type, metadata)
         VALUES ($1, 'terminated', $2)`,
        [sessionDbId, JSON.stringify({ reason: 'cleanup_ack' })]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[server] cleanup_ack error:', err);
    res.status(500).json({ error: 'internal error' });
  }
});

// Provider heartbeat (no auth required for backward compatibility)
app.post("/provider/heartbeat", async (req, res) => {
  try {
    const { sessionId } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({ error: "missing sessionId" });
    }

    const { rowCount } = await db.query(
      'UPDATE sessions SET last_seen = NOW() WHERE session_id = $1',
      [sessionId]
    );

    if (rowCount === 0) {
      console.log("[server] heartbeat for unknown session (may need re-register):", sessionId);
      return res.status(404).json({ error: "unknown session - re-register required" });
    }

    const { rows: count } = await db.query("SELECT COUNT(*) FROM sessions WHERE status IN ('READY', 'LOCKED')");
    console.log("[server] heartbeat updated for:", sessionId, "| Total active sessions:", count[0].count);
    res.json({ ok: true });
  } catch (err) {
    console.error("[server] heartbeat error:", err);
    res.status(500).json({ error: "internal error" });
  }
});

// Cleanup stale sessions
const SESSION_TTL = 2 * 60 * 1000;
const RENTER_HEARTBEAT_TIMEOUT = 2 * 60 * 60 * 1000;

setInterval(async () => {
  try {
    const now = new Date();

    // Auto-unlock abandoned sessions
    const { rows: unlocked } = await db.query(
      `UPDATE sessions 
       SET status = 'READY', locked_at = NULL, renter_last_seen = NULL, renter_ip = NULL, renter_id = NULL
       WHERE status = 'LOCKED' 
       AND renter_last_seen < $1
       AND last_seen > $2
       RETURNING session_id, id`,
      [new Date(now - RENTER_HEARTBEAT_TIMEOUT), new Date(now - SESSION_TTL)]
    );

    for (const session of unlocked) {
      await db.query(
        `INSERT INTO session_history (session_id, event_type, metadata)
         VALUES ($1, 'unlocked', $2)`,
        [session.id, JSON.stringify({ reason: 'abandoned_2hr_timeout' })]
      );
      logSecurityEvent("SESSION_AUTO_UNLOCKED", { sessionId: session.session_id, reason: "abandoned_2hr_timeout" });
      console.log("[server] auto-unlocked abandoned session (2hr timeout):", session.session_id);
    }

    // Remove stale sessions (provider offline) - exclude CLEANING status
    const { rows: removed } = await db.query(
      `UPDATE sessions 
       SET status = 'TERMINATED', terminated_at = NOW()
       WHERE last_seen < $1 AND status NOT IN ('TERMINATED', 'CLEANING')
       RETURNING session_id, id`,
      [new Date(now - SESSION_TTL)]
    );

    for (const session of removed) {
      await db.query(
        `INSERT INTO session_history (session_id, event_type, metadata)
         VALUES ($1, 'terminated', $2)`,
        [session.id, JSON.stringify({ reason: 'stale_provider' })]
      );
      logSecurityEvent("SESSION_REMOVED", { sessionId: session.session_id, reason: "stale_provider" });
      console.log("[server] removing stale session:", session.session_id);
    }
  } catch (err) {
    console.error("[server] cleanup error:", err);
  }
}, 30 * 1000);

// Background job: Idle detection (2 min) and grace period cleanup (10 min)
setInterval(async () => {
  try {
    const now = new Date();
    const idle2MinAgo = new Date(now.getTime() - 2 * 60 * 1000);
    const abandoned10MinAgo = new Date(now.getTime() - 10 * 60 * 1000);

    // Auto-unlock LOCKED sessions with no heartbeat for 2 min
    const { rows: idleSessions } = await db.query(
      `SELECT id, session_id FROM sessions 
       WHERE status = 'LOCKED' AND last_heartbeat IS NOT NULL 
       AND last_heartbeat < $1`,
      [idle2MinAgo]
    );

    for (const session of idleSessions) {
      await db.query(
        `UPDATE sessions 
         SET status = 'LOCKED_ABANDONED', abandoned_at = NOW(), last_status_change = NOW()
         WHERE id = $1`,
        [session.id]
      );
      await db.query(
        `INSERT INTO session_history (session_id, event_type, metadata)
         VALUES ($1, 'auto_abandoned', $2)`,
        [session.id, JSON.stringify({ reason: 'no_heartbeat_2min' })]
      );
      console.log("[server] session auto-abandoned (idle 2 min):", session.session_id);
    }

    // Auto-unlock LOCKED_ABANDONED sessions after 10 min grace period
    const { rows: expiredAbandoned } = await db.query(
      `SELECT id, session_id FROM sessions 
       WHERE status = 'LOCKED_ABANDONED' AND abandoned_at IS NOT NULL 
       AND abandoned_at < $1`,
      [abandoned10MinAgo]
    );

    for (const session of expiredAbandoned) {
      await db.query(
        `UPDATE sessions 
         SET status = 'CLEANING', locked_by_user_id = NULL, locked_at = NULL,
             abandoned_at = NULL, last_heartbeat = NULL,
             renter_last_seen = NULL, renter_ip = NULL, renter_id = NULL,
             needs_cleanup = TRUE, last_status_change = NOW()
         WHERE id = $1`,
        [session.id]
      );
      await db.query(
        `INSERT INTO session_history (session_id, event_type, metadata)
         VALUES ($1, 'auto_released', $2)`,
        [session.id, JSON.stringify({ reason: 'grace_period_expired' })]
      );
      console.log("[server] session auto-released (grace period expired):", session.session_id);
    }
  } catch (err) {
    console.error("[server] session cleanup job error:", err);
  }
}, 30 * 1000); // Run every 30 seconds

// Background job: Cleanup stale CLEANING sessions (provider crashed during cleanup)
setInterval(async () => {
  try {
    const now = new Date();
    const staleCleaningThreshold = new Date(now.getTime() - 60 * 1000); // 60 seconds

    // Reset CLEANING sessions older than 60 seconds to TERMINATED
    // Using last_status_change to detect sessions stuck in CLEANING
    const { rows: staleCleaning } = await db.query(
      `SELECT id, session_id FROM sessions 
       WHERE status = 'CLEANING' AND last_status_change < $1`,
      [staleCleaningThreshold]
    );

    for (const session of staleCleaning) {
      await db.query(
        `UPDATE sessions 
         SET status = 'TERMINATED', terminated_at = NOW(), needs_cleanup = FALSE, last_status_change = NOW()
         WHERE id = $1`,
        [session.id]
      );
      await db.query(
        `INSERT INTO session_history (session_id, event_type, metadata)
         VALUES ($1, 'terminated', $2)`,
        [session.id, JSON.stringify({ reason: 'stale_cleaning_timeout' })]
      );
      logSecurityEvent("STALE_CLEANING_TERMINATED", { sessionId: session.session_id });
      console.log("[server] terminated stale CLEANING session:", session.session_id);
    }
  } catch (err) {
    console.error("[server] stale CLEANING cleanup error:", err);
  }
}, 30 * 1000); // Run every 30 seconds

app.listen(PORT, () => {
  console.log(`RUNIT server listening on port ${PORT}`);
});
