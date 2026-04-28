// Minimal LAN relay client (WebSocket). Not required for single-player.
(() => {
  const Net = {
    ws: null,
    role: "offline", // offline | host | join
    room: null,
    onRemoteState: null,
    statusEl: null
  };

  function setStatus(text) {
    if (Net.statusEl) Net.statusEl.textContent = text;
  }

  function safeSend(obj) {
    if (!Net.ws || Net.ws.readyState !== WebSocket.OPEN) return;
    Net.ws.send(JSON.stringify(obj));
  }

  function connect(url, role) {
    disconnect();
    Net.role = role;
    setStatus(`Connecting… (${role})`);
    const ws = new WebSocket(url);
    Net.ws = ws;

    ws.addEventListener("open", () => {
      setStatus(`Connected (${role})`);
      safeSend({ type: "hello", role });
    });

    ws.addEventListener("close", () => {
      setStatus("Disconnected");
      Net.ws = null;
      Net.role = "offline";
    });

    ws.addEventListener("error", () => {
      setStatus("Connection error");
    });

    ws.addEventListener("message", (ev) => {
      let msg = null;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === "state" && Net.onRemoteState) Net.onRemoteState(msg.payload);
      if (msg.type === "info") setStatus(String(msg.text || "Connected"));
    });
  }

  function disconnect() {
    if (Net.ws) {
      try {
        Net.ws.close();
      } catch {}
    }
    Net.ws = null;
    Net.role = "offline";
    setStatus("Offline");
  }

  // Public
  window.TetrisNet = {
    init({ statusEl, onRemoteState }) {
      Net.statusEl = statusEl;
      Net.onRemoteState = onRemoteState;
      setStatus("Offline");
    },
    connectHost(url) {
      connect(url, "host");
    },
    connectJoin(url) {
      connect(url, "join");
    },
    disconnect,
    sendState(payload) {
      safeSend({ type: "state", payload });
    },
    get role() {
      return Net.role;
    }
  };
})();

