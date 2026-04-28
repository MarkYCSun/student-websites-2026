# Dino Tetris Arena

## Run

1. Install dependencies:
   - `npm install`
2. Start multiplayer server:
   - `npm run start-server`
3. Open `index.html` in two browser windows/tabs.

## Multiplayer Over IP

- On the host machine, start the server.
- Use the host machine IP in `Server URL`, for example `ws://192.168.1.24:8080`.
- Use the same `Room Code` in both clients.
- Click **Host Room** on one side and **Join Room** on the other.

## Controls

- Left/Right: Move piece
- Up or Space: Rotate piece
- Down: Soft drop
- Enter: Hard drop

## Features

- Large bonus dinosaur event clears board blocks at score milestones and level-up moments.
- Continuous music plus event SFX for line clear, level-up, and dinosaur bonus.
- Extra speed scaling as score increases, plus a small celebration animation every 100 points.
- Side-by-side local and invited-player boards.
- Local persistent leaderboard with player name entry after game over.
