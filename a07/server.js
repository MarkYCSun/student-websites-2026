// Simple WebSocket relay server for LAN multiplayer
// Usage:
//   npm i ws
//   node server.js
const os = require("os");
const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Tetris relay server running.\n");
});

const wss = new WebSocket.Server({ server });

/** @type {Set<WebSocket>} */
const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "info", text: "Connected to relay." }));

  ws.on("message", (data) => {
    // Broadcast to everyone else
    for (const c of clients) {
      if (c === ws || c.readyState !== WebSocket.OPEN) continue;
      c.send(data);
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
  });
});

server.listen(PORT, () => {
  const ifs = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifs)) {
    for (const info of ifs[name] || []) {
      if (info.family === "IPv4" && !info.internal) ips.push(info.address);
    }
  }
  const tip = ips.length ? ips.map((ip) => `ws://${ip}:${PORT}`).join("  |  ") : `ws://<your-ip>:${PORT}`;
  console.log(`Tetris relay listening on :${PORT}`);
  console.log(`LAN URLs: ${tip}`);
});

