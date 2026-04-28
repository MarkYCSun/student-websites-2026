# Tetris (Dino Bonus) — Web + Optional LAN Multiplayer

## What this is
- A single-page Tetris game (`index.html`) with:
  - Arrow keys to move
  - **Space** to rotate
  - Score + level + increasing speed
  - Adaptive music + sound effects (generated with WebAudio; no copyrighted tracks)
  - A surprise **dinosaur bonus** that can "eat" blocks
  - Local scoreboard/history saved in `localStorage`
- Optional **LAN multiplayer**: two game areas, with a host/client connection via WebSocket.

## Run (single player)
Just open `index.html` in Chrome.

## Run (LAN multiplayer)
You need Node.js for the simple WebSocket relay server.

1. In this folder, run:

```bash
npm init -y
npm i ws
node server.js
```

2. On the host machine, note the IP the server prints (example `192.168.1.20:8787`).
3. Open `index.html` on both machines (same Wi‑Fi/LAN).
4. In the game UI:
   - One player clicks **Host**
   - The other clicks **Join** and enters `ws://<host-ip>:8787`

## Controls
- **Left/Right**: move
- **Down**: soft drop
- **Up**: hard drop
- **Space**: rotate
- **P**: pause

## About “Playboi Carti music”
I didn’t include copyrighted music. The game uses original synth loops and changes vibe as you level up. If you own audio files, you can add them locally and wire them in.

