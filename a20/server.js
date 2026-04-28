const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Dino Tetris WebSocket server is running.\n");
});

const wss = new WebSocket.Server({ server });
const rooms = new Map();

function roomKey(v) {
  return String(v || "").trim().toUpperCase();
}

function broadcast(room, from, payload) {
  room.forEach((peer) => {
    if (peer !== from && peer.readyState === WebSocket.OPEN) {
      peer.send(JSON.stringify(payload));
    }
  });
}

wss.on("connection", (socket) => {
  socket.meta = { room: null, nick: "Player" };

  socket.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === "join") {
      const room = roomKey(msg.room);
      if (!room) return;
      socket.meta.room = room;
      socket.meta.nick = msg.nick || "Player";

      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room).add(socket);

      broadcast(rooms.get(room), socket, { type: "peer-joined", nick: socket.meta.nick });
      return;
    }

    if (msg.type === "state") {
      const room = socket.meta.room;
      if (!room || !rooms.has(room)) return;
      broadcast(rooms.get(room), socket, { type: "state", state: msg.state || {} });
    }
  });

  socket.on("close", () => {
    const room = socket.meta.room;
    if (!room || !rooms.has(room)) return;
    const set = rooms.get(room);
    set.delete(socket);
    if (!set.size) rooms.delete(room);
  });
});

server.listen(PORT, () => {
  console.log(`WebSocket server listening on ws://0.0.0.0:${PORT}`);
});
