/**
 * WebSocket relay for two Tetris clients + in-memory session leaderboard.
 * Run: node tetris-server.js
 * Open tetris.html on two browsers to ws://<host-ip>:8765 — saves broadcast to all clients.
 */
/* eslint-disable no-console */
const WebSocket = require("ws");

const PORT = process.env.TETRIS_WS_PORT ? Number(process.env.TETRIS_WS_PORT) : 8765;

/** @type {WebSocket | null} */
let waiting = null;

/** @type {{ name: string, score: number, lines: number, level: number, at: number }[]} */
let leaderboard = [];

function safeSend(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

const wss = new WebSocket.Server({ port: PORT });

function broadcastLeaderboard() {
  const payload = JSON.stringify({ type: "leaderboard", entries: leaderboard });
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(payload);
  });
}

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  safeSend(ws, { type: "leaderboard", entries: leaderboard });

  if (waiting && waiting.readyState === WebSocket.OPEN) {
    const a = waiting;
    const b = ws;
    waiting = null;
    a.partner = b;
    b.partner = a;
    safeSend(a, { type: "paired", slot: 0 });
    safeSend(b, { type: "paired", slot: 1 });
    console.log("Paired two players.");
  } else {
    waiting = ws;
    safeSend(ws, { type: "waiting" });
    console.log("First client waiting for peer…");
  }

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return;
    }
    if (msg.type === "hiscore") {
      const name = String(msg.name || "Player").replace(/[\u0000-\u001f<>]/g, "").slice(0, 24) || "Player";
      const score = Math.max(0, Math.min(99999999, Number(msg.score) || 0));
      const lines = Math.max(0, Math.min(99999, Number(msg.lines) || 0));
      const level = Math.max(1, Math.min(999, Number(msg.level) || 1));
      const at = typeof msg.at === "number" ? msg.at : Date.now();
      leaderboard.push({ name, score, lines, level, at });
      leaderboard.sort((a, b) => b.score - a.score);
      leaderboard = leaderboard.slice(0, 50);
      broadcastLeaderboard();
      console.log("Hiscore:", name, score);
      return;
    }
    const partner = ws.partner;
    if (partner && partner.readyState === WebSocket.OPEN) {
      partner.send(raw);
    }
  });

  ws.on("close", () => {
    if (waiting === ws) waiting = null;
    const partner = ws.partner;
    if (partner && partner.readyState === WebSocket.OPEN) {
      safeSend(partner, { type: "peer-left" });
      partner.partner = undefined;
    }
    ws.partner = undefined;
    console.log("Client disconnected.");
  });
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try {
      ws.ping();
    } catch (e) {}
  });
}, 32000);

console.log(`Holiday Tetris relay + hall of fame on ws://0.0.0.0:${PORT}`);
