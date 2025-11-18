// index.js
const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const cors = require("cors");

// Express app
const app = express();
app.use(cors());
app.use(express.json());

// HTTP server (IMPORTANT)
const server = http.createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server });

// Maps for provider and renter sockets
let providers = {};
let renters = {};

console.log("Bridge server starting...");

// Basic test route
app.get("/", (req, res) => {
  res.send("Bridge server running");
});

// WebSocket handling
wss.on("connection", (ws, req) => {
  const url = req.url;
  console.log("WS connection:", url);

  // Provider WS
  if (url.startsWith("/ws/provider")) {
    const sessionId = new URLSearchParams(url.split("?")[1]).get("sessionId");
    providers[sessionId] = ws;

    console.log("Provider connected:", sessionId);

    ws.on("message", (msg) => {
      if (renters[sessionId]) {
        renters[sessionId].send(msg);
      }
    });

    ws.on("close", () => {
      delete providers[sessionId];
      console.log("Provider disconnected:", sessionId);
    });
  }

  // Renter WS
  if (url.startsWith("/ws/renter")) {
    const sessionId = new URLSearchParams(url.split("?")[1]).get("sessionId");
    renters[sessionId] = ws;

    console.log("Renter connected:", sessionId);

    ws.on("message", (msg) => {
      if (providers[sessionId]) {
        providers[sessionId].send(msg);
      }
    });

    ws.on("close", () => {
      delete renters[sessionId];
      console.log("Renter disconnected:", sessionId);
    });
  }
});

// IMPORTANT: Start HTTP + WS server together
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
