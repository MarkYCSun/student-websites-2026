/* ============================================================================
  Neon Tetris (Plain JS)
  - 10x20 board + next preview
  - Score/Lines/Level + high score (localStorage)
  - Pause (P), restart (R), mute (M)
  - Game over + pause overlays
  - Procedural background music + SFX (no external assets)
  - Bonus dinosaur effect on line clears

  This is intentionally beginner-friendly: clear data structures,
  small helper functions, and comments explaining the "why".
============================================================================ */

(() => {
  "use strict";

  /* ----------------------------- DOM references ---------------------------- */
  const $ = (sel) => document.querySelector(sel);

  const canvas = $("#board");
  const ctx = canvas.getContext("2d");

  const nextCanvas = $("#next");
  const nextCtx = nextCanvas.getContext("2d");

  const overlayPause = $("#overlayPause");
  const overlayGameOver = $("#overlayGameOver");

  const statScore = $("#statScore");
  const statLines = $("#statLines");
  const statLevel = $("#statLevel");
  const statHigh = $("#statHigh");

  const btnRestart = $("#btnRestart");
  const btnRestart2 = $("#btnRestart2");
  const btnMute = $("#btnMute");

  const fxLayer = $("#fxLayer");

  /* ------------------------------- Game config ----------------------------- */
  const COLS = 10;
  const ROWS = 20;
  const BLOCK = 30; // canvas is 300x600 so this is 30px per cell

  const PREVIEW_SIZE = 4; // 4x4 preview grid

  // The game speeds up by level. We'll compute drop interval from level.
  function dropIntervalForLevel(level) {
    // A simple curve: starts ~700ms and gets faster.
    // Clamp to keep it playable.
    const ms = 720 - (level - 1) * 55;
    return Math.max(70, ms);
  }

  // Scoring (classic-ish): points per lines cleared, multiplied by level.
  const SCORE_TABLE = {
    0: 0,
    1: 100,
    2: 300,
    3: 500,
    4: 800,
  };

  // Level up every N lines.
  const LINES_PER_LEVEL = 10;

  const STORAGE_KEY = "neon_tetris_highscore_v1";

  /* ------------------------------ Piece definitions ------------------------ */
  // We represent each tetromino as a list of rotations.
  // Each rotation is an array of [x, y] offsets within a 4x4 area.
  //
  // Rotation system: simple "SRS-like" kicks are applied separately.
  const PIECES = {
    I: {
      color: "#00e5ff",
      rotations: [
        [
          [0, 1],
          [1, 1],
          [2, 1],
          [3, 1],
        ],
        [
          [2, 0],
          [2, 1],
          [2, 2],
          [2, 3],
        ],
        [
          [0, 2],
          [1, 2],
          [2, 2],
          [3, 2],
        ],
        [
          [1, 0],
          [1, 1],
          [1, 2],
          [1, 3],
        ],
      ],
    },
    O: {
      color: "#ffcc00",
      rotations: [
        [
          [1, 1],
          [2, 1],
          [1, 2],
          [2, 2],
        ],
        [
          [1, 1],
          [2, 1],
          [1, 2],
          [2, 2],
        ],
        [
          [1, 1],
          [2, 1],
          [1, 2],
          [2, 2],
        ],
        [
          [1, 1],
          [2, 1],
          [1, 2],
          [2, 2],
        ],
      ],
    },
    T: {
      color: "#ff4dff",
      rotations: [
        [
          [1, 1],
          [0, 2],
          [1, 2],
          [2, 2],
        ],
        [
          [1, 1],
          [1, 2],
          [2, 2],
          [1, 3],
        ],
        [
          [0, 2],
          [1, 2],
          [2, 2],
          [1, 3],
        ],
        [
          [1, 1],
          [0, 2],
          [1, 2],
          [1, 3],
        ],
      ],
    },
    S: {
      color: "#7cff6b",
      rotations: [
        [
          [1, 1],
          [2, 1],
          [0, 2],
          [1, 2],
        ],
        [
          [1, 1],
          [1, 2],
          [2, 2],
          [2, 3],
        ],
        [
          [1, 2],
          [2, 2],
          [0, 3],
          [1, 3],
        ],
        [
          [0, 1],
          [0, 2],
          [1, 2],
          [1, 3],
        ],
      ],
    },
    Z: {
      color: "#ff6b6b",
      rotations: [
        [
          [0, 1],
          [1, 1],
          [1, 2],
          [2, 2],
        ],
        [
          [2, 1],
          [1, 2],
          [2, 2],
          [1, 3],
        ],
        [
          [0, 2],
          [1, 2],
          [1, 3],
          [2, 3],
        ],
        [
          [1, 1],
          [0, 2],
          [1, 2],
          [0, 3],
        ],
      ],
    },
    J: {
      color: "#7aa8ff",
      rotations: [
        [
          [0, 1],
          [0, 2],
          [1, 2],
          [2, 2],
        ],
        [
          [1, 1],
          [2, 1],
          [1, 2],
          [1, 3],
        ],
        [
          [0, 2],
          [1, 2],
          [2, 2],
          [2, 3],
        ],
        [
          [1, 1],
          [1, 2],
          [0, 3],
          [1, 3],
        ],
      ],
    },
    L: {
      color: "#ffa84d",
      rotations: [
        [
          [2, 1],
          [0, 2],
          [1, 2],
          [2, 2],
        ],
        [
          [1, 1],
          [1, 2],
          [1, 3],
          [2, 3],
        ],
        [
          [0, 2],
          [1, 2],
          [2, 2],
          [0, 3],
        ],
        [
          [0, 1],
          [1, 1],
          [1, 2],
          [1, 3],
        ],
      ],
    },
  };

  const PIECE_KEYS = Object.keys(PIECES);

  /* ------------------------------ Rendering helpers ------------------------ */
  function clearCanvas(context, w, h) {
    context.clearRect(0, 0, w, h);
  }

  function drawRoundedRect(context, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + w, y, x + w, y + h, radius);
    context.arcTo(x + w, y + h, x, y + h, radius);
    context.arcTo(x, y + h, x, y, radius);
    context.arcTo(x, y, x + w, y, radius);
    context.closePath();
  }

  function fillCell(context, x, y, color, alpha = 1) {
    const px = x * BLOCK;
    const py = y * BLOCK;

    // Subtle "neon tile" look: gradient fill + inner shine.
    context.save();
    context.globalAlpha = alpha;

    const grad = context.createLinearGradient(px, py, px + BLOCK, py + BLOCK);
    grad.addColorStop(0, "rgba(255,255,255,0.16)");
    grad.addColorStop(0.2, color);
    grad.addColorStop(1, "rgba(0,0,0,0.12)");

    drawRoundedRect(context, px + 1.2, py + 1.2, BLOCK - 2.4, BLOCK - 2.4, 8);
    context.fillStyle = grad;
    context.fill();

    // Neon outline
    context.strokeStyle = "rgba(255,255,255,0.18)";
    context.lineWidth = 1;
    context.stroke();

    // Glow (cheap and effective)
    context.shadowColor = color;
    context.shadowBlur = 16;
    context.strokeStyle = color;
    context.globalAlpha = alpha * 0.35;
    context.lineWidth = 1.2;
    context.stroke();

    context.restore();
  }

  function drawBoardGrid(context) {
    // Grid lines for readability.
    context.save();
    context.globalAlpha = 0.16;
    context.strokeStyle = "rgba(255,255,255,0.2)";
    context.lineWidth = 1;

    for (let x = 0; x <= COLS; x++) {
      context.beginPath();
      context.moveTo(x * BLOCK + 0.5, 0);
      context.lineTo(x * BLOCK + 0.5, ROWS * BLOCK);
      context.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      context.beginPath();
      context.moveTo(0, y * BLOCK + 0.5);
      context.lineTo(COLS * BLOCK, y * BLOCK + 0.5);
      context.stroke();
    }
    context.restore();
  }

  /* ---------------------------- Game state variables ----------------------- */
  let board = createEmptyBoard();

  // Current falling piece (active)
  let active = null;
  // Next piece (preview)
  let next = null;

  // Timing
  let lastTime = 0;
  let dropAccumulator = 0;

  // Stats
  let score = 0;
  let lines = 0;
  let level = 1;
  let highScore = 0;

  // Flags
  let isPaused = false;
  let isGameOver = false;
  let isMuted = false;

  // Input: allow "soft drop hold" smoothly
  let softDropping = false;

  /* ------------------------------ Audio (procedural) ----------------------- */
  // We use the Web Audio API to generate simple bleeps and a background loop.
  // Browsers require a user gesture before audio can start, so the first keypress
  // or button click will "unlock" audio.
  let audioCtx = null;
  let music = null; // object with start/stop
  let audioUnlocked = false;

  function ensureAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    music = createMusicEngine(audioCtx);
    if (!isMuted) music.start();
  }

  function setMuted(muted) {
    isMuted = muted;
    btnMute.setAttribute("aria-pressed", String(isMuted));
    btnMute.querySelector(".btn__icon").textContent = isMuted ? "🔇" : "🔊";
    btnMute.querySelector(".btn__label").textContent = isMuted ? "Sound: Off" : "Sound: On";

    if (music) {
      if (isMuted) music.stop();
      else music.start();
    }
  }

  function beep(type, freq = 440, dur = 0.08, gain = 0.08) {
    if (!audioCtx || isMuted) return;
    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();

    o.type = type;
    o.frequency.setValueAtTime(freq, t0);

    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noiseBurst(dur = 0.08, gain = 0.07) {
    if (!audioCtx || isMuted) return;
    const t0 = audioCtx.currentTime;
    const bufferSize = Math.floor(audioCtx.sampleRate * dur);
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);

    const src = audioCtx.createBufferSource();
    src.buffer = buffer;

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(g);
    g.connect(audioCtx.destination);
    src.start(t0);
    src.stop(t0 + dur);
  }

  function createMusicEngine(context) {
    // Simple arpeggio loop with a gentle sidechain-y pulse.
    // We keep it very lightweight and not too loud.
    let intervalId = null;
    let step = 0;
    const bpm = 124;
    const beatMs = (60_000 / bpm) / 2; // eighth-notes

    const scale = [0, 3, 7, 10]; // minor-ish chord tones
    const base = 220; // A3-ish

    function tick() {
      // Short pluck
      const semitone = scale[step % scale.length] + (step % 8 === 0 ? 12 : 0);
      const f = base * Math.pow(2, semitone / 12);
      const type = step % 2 === 0 ? "triangle" : "sine";

      // Tiny accent on step 0
      const gain = step % 8 === 0 ? 0.06 : 0.035;
      beep(type, f, 0.09, gain);

      step++;
    }

    return {
      start() {
        if (intervalId) return;
        intervalId = window.setInterval(tick, beatMs);
      },
      stop() {
        if (!intervalId) return;
        window.clearInterval(intervalId);
        intervalId = null;
      },
    };
  }

  /* ------------------------------ Board & pieces --------------------------- */
  function createEmptyBoard() {
    // Each cell is either null (empty) or an object { color: "#rrggbb" }.
    return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
  }

  function clone2D(arr) {
    return arr.map((row) => row.slice());
  }

  function makePiece(typeKey) {
    const def = PIECES[typeKey];
    return {
      type: typeKey,
      color: def.color,
      rot: 0,
      x: 3, // spawn near the top-center (fits most pieces)
      y: -1,
    };
  }

  function cellsFor(piece, rot = piece.rot, x = piece.x, y = piece.y) {
    const offsets = PIECES[piece.type].rotations[rot];
    return offsets.map(([dx, dy]) => [x + dx, y + dy]);
  }

  function inBounds(x, y) {
    return x >= 0 && x < COLS && y < ROWS;
  }

  function collides(piece, rot = piece.rot, x = piece.x, y = piece.y) {
    for (const [cx, cy] of cellsFor(piece, rot, x, y)) {
      // Above the board is allowed (spawn area). Only check collisions when y>=0.
      if (!inBounds(cx, cy)) return true;
      if (cy >= 0 && board[cy][cx]) return true;
    }
    return false;
  }

  function lockPiece(piece) {
    for (const [cx, cy] of cellsFor(piece)) {
      if (cy < 0) continue; // if we lock above the board, game over will be handled separately
      board[cy][cx] = { color: piece.color };
    }
  }

  function clearLines() {
    // Remove full rows and return count cleared.
    let cleared = 0;
    const newBoard = [];
    for (let y = 0; y < ROWS; y++) {
      const full = board[y].every((cell) => cell !== null);
      if (full) {
        cleared++;
      } else {
        newBoard.push(board[y]);
      }
    }
    while (newBoard.length < ROWS) {
      newBoard.unshift(Array.from({ length: COLS }, () => null));
    }
    board = newBoard;
    return cleared;
  }

  /* ------------------------------ Randomizer (7-bag) ------------------------ */
  let bag = [];

  function refillBag() {
    bag = PIECE_KEYS.slice();
    // Fisher-Yates shuffle
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }

  function nextFromBag() {
    if (bag.length === 0) refillBag();
    return bag.pop();
  }

  /* ------------------------------ UI + overlays ---------------------------- */
  function showPauseOverlay(show) {
    overlayPause.classList.toggle("overlay--hidden", !show);
    overlayPause.setAttribute("aria-hidden", String(!show));
  }

  function showGameOverOverlay(show) {
    overlayGameOver.classList.toggle("overlay--hidden", !show);
    overlayGameOver.setAttribute("aria-hidden", String(!show));
  }

  function updateStats() {
    statScore.textContent = String(score);
    statLines.textContent = String(lines);
    statLevel.textContent = String(level);
    statHigh.textContent = String(highScore);
  }

  function loadHighScore() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : 0;
    highScore = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }

  function saveHighScoreIfNeeded() {
    if (score > highScore) {
      highScore = score;
      localStorage.setItem(STORAGE_KEY, String(highScore));
    }
  }

  /* ------------------------------ Drawing --------------------------------- */
  function draw() {
    clearCanvas(ctx, canvas.width, canvas.height);

    // Draw locked board tiles
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = board[y][x];
        if (cell) fillCell(ctx, x, y, cell.color, 1);
      }
    }

    // Ghost piece (where it would land) - helps beginners.
    if (active && !isGameOver) {
      const ghost = { ...active };
      while (!collides(ghost, ghost.rot, ghost.x, ghost.y + 1)) ghost.y++;
      for (const [x, y] of cellsFor(ghost)) {
        if (y >= 0) fillCell(ctx, x, y, active.color, 0.18);
      }
    }

    // Active falling piece
    if (active) {
      for (const [x, y] of cellsFor(active)) {
        if (y >= 0) fillCell(ctx, x, y, active.color, 1);
      }
    }

    drawBoardGrid(ctx);

    // Next preview
    drawNext();
  }

  function drawNext() {
    clearCanvas(nextCtx, nextCanvas.width, nextCanvas.height);
    // Background grid
    const cell = nextCanvas.width / PREVIEW_SIZE;
    nextCtx.save();
    nextCtx.globalAlpha = 0.25;
    nextCtx.strokeStyle = "rgba(255,255,255,0.20)";
    for (let i = 0; i <= PREVIEW_SIZE; i++) {
      nextCtx.beginPath();
      nextCtx.moveTo(i * cell + 0.5, 0);
      nextCtx.lineTo(i * cell + 0.5, nextCanvas.height);
      nextCtx.stroke();
      nextCtx.beginPath();
      nextCtx.moveTo(0, i * cell + 0.5);
      nextCtx.lineTo(nextCanvas.width, i * cell + 0.5);
      nextCtx.stroke();
    }
    nextCtx.restore();

    if (!next) return;

    // Draw next piece centered in 4x4.
    const offsets = PIECES[next.type].rotations[0];
    // Compute bounding box for centering.
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const [dx, dy] of offsets) {
      minX = Math.min(minX, dx);
      maxX = Math.max(maxX, dx);
      minY = Math.min(minY, dy);
      maxY = Math.max(maxY, dy);
    }
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const ox = Math.floor((PREVIEW_SIZE - w) / 2) - minX;
    const oy = Math.floor((PREVIEW_SIZE - h) / 2) - minY;

    for (const [dx, dy] of offsets) {
      // Use a local cell size rather than BLOCK.
      const px = (dx + ox) * cell;
      const py = (dy + oy) * cell;
      nextCtx.save();
      const grad = nextCtx.createLinearGradient(px, py, px + cell, py + cell);
      grad.addColorStop(0, "rgba(255,255,255,0.16)");
      grad.addColorStop(0.2, next.color);
      grad.addColorStop(1, "rgba(0,0,0,0.12)");
      drawRoundedRect(nextCtx, px + 2, py + 2, cell - 4, cell - 4, 10);
      nextCtx.fillStyle = grad;
      nextCtx.fill();
      nextCtx.strokeStyle = "rgba(255,255,255,0.18)";
      nextCtx.stroke();
      nextCtx.restore();
    }
  }

  /* ------------------------------ Movement & rotation ---------------------- */
  function tryMove(dx, dy) {
    if (!active || isPaused || isGameOver) return false;
    const nx = active.x + dx;
    const ny = active.y + dy;
    if (collides(active, active.rot, nx, ny)) return false;
    active.x = nx;
    active.y = ny;
    return true;
  }

  // A small set of "kick" offsets to make rotation feel nicer near walls/blocks.
  // This is not a full SRS implementation, but it's reliable and beginner-friendly.
  const KICKS = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [2, 0],
    [-2, 0],
    [0, -1],
    [1, -1],
    [-1, -1],
  ];

  function tryRotate(dir) {
    // dir = +1 (CW) or -1 (CCW)
    if (!active || isPaused || isGameOver) return false;
    if (active.type === "O") return true; // square doesn't need rotation logic

    const oldRot = active.rot;
    const newRot = (oldRot + (dir === 1 ? 1 : 3)) % 4;

    for (const [kx, ky] of KICKS) {
      const nx = active.x + kx;
      const ny = active.y + ky;
      if (!collides(active, newRot, nx, ny)) {
        active.rot = newRot;
        active.x = nx;
        active.y = ny;
        beep("square", 680, 0.05, 0.03);
        return true;
      }
    }

    return false;
  }

  function hardDrop() {
    if (!active || isPaused || isGameOver) return;
    let dropped = 0;
    while (tryMove(0, 1)) dropped++;
    // Small reward for hard drop distance.
    score += dropped * 2;
    beep("triangle", 520, 0.06, 0.04);
    pieceLanded();
  }

  function softDropStep() {
    if (!active || isPaused || isGameOver) return;
    // Soft drop: if we can move down, we get +1 score per step.
    if (tryMove(0, 1)) {
      score += 1;
    } else {
      pieceLanded();
    }
  }

  /* ------------------------------ Game flow -------------------------------- */
  function spawn() {
    // If next is empty, initialize it.
    if (!next) next = makePiece(nextFromBag());

    active = next;
    next = makePiece(nextFromBag());

    // Spawn position tweaks: give I piece a slightly different x so it centers.
    active.x = active.type === "I" ? 3 : 3;
    active.y = -1;
    active.rot = 0;

    // If we collide immediately, it's game over.
    if (collides(active)) {
      isGameOver = true;
      showGameOverOverlay(true);
      showPauseOverlay(false);
      noiseBurst(0.12, 0.08);
      saveHighScoreIfNeeded();
      updateStats();
    } else {
      beep("sine", 330, 0.05, 0.03);
    }
  }

  function pieceLanded() {
    // Lock piece into board, clear lines, update score, spawn next.
    lockPiece(active);

    // If any locked blocks are above the visible board, end game.
    // (Happens if the stack reaches the top.)
    if (cellsFor(active).some(([, y]) => y < 0)) {
      isGameOver = true;
      showGameOverOverlay(true);
      noiseBurst(0.14, 0.08);
      saveHighScoreIfNeeded();
      updateStats();
      return;
    }

    // Clear lines and score
    const cleared = clearLines();
    if (cleared > 0) {
      lines += cleared;
      const gained = SCORE_TABLE[cleared] * level;
      score += gained;

      // A little celebration: SFX + dinosaur bonus.
      beep("triangle", 880, 0.06, 0.05);
      beep("sine", 990, 0.08, 0.04);
      spawnDinoBonus(cleared, gained);
    } else {
      // Landing thud
      beep("square", 180, 0.05, 0.03);
    }

    // Leveling
    const newLevel = Math.floor(lines / LINES_PER_LEVEL) + 1;
    if (newLevel !== level) {
      level = newLevel;
      beep("sawtooth", 220, 0.08, 0.03);
      beep("sawtooth", 330, 0.08, 0.03);
    }

    saveHighScoreIfNeeded();
    updateStats();

    spawn();
  }

  function togglePause() {
    if (isGameOver) return;
    isPaused = !isPaused;
    showPauseOverlay(isPaused);
    beep("sine", isPaused ? 240 : 360, 0.06, 0.03);
  }

  function restart() {
    board = createEmptyBoard();
    bag = [];
    refillBag();
    active = null;
    next = null;

    score = 0;
    lines = 0;
    level = 1;

    isGameOver = false;
    isPaused = false;
    softDropping = false;

    showGameOverOverlay(false);
    showPauseOverlay(false);

    updateStats();
    spawn();
    beep("triangle", 520, 0.06, 0.04);
  }

  /* ------------------------------ Dinosaur bonus effect -------------------- */
  const DINO_SAYS = [
    "Rawr! Nice clear!",
    "Neo-dino approves.",
    "That was clean.",
    "Combo vibes!",
    "Stack attack!",
    "Arcade energy!",
    "Chomp! Lines gone.",
  ];

  function spawnDinoBonus(cleared, gained) {
    if (!fxLayer) return;

    const d = document.createElement("div");
    d.className = "dino";
    d.style.bottom = `${14 + Math.random() * 40}px`;

    const sprite = document.createElement("div");
    sprite.className = "dino__sprite";
    sprite.textContent = "🦖";

    const bubble = document.createElement("div");
    bubble.className = "dino__bubble";
    const msg = DINO_SAYS[Math.floor(Math.random() * DINO_SAYS.length)];
    bubble.textContent = `${msg} (+${gained} | ${cleared} line${cleared === 1 ? "" : "s"})`;

    d.appendChild(sprite);
    d.appendChild(bubble);
    fxLayer.appendChild(d);

    // Cleanup after animation ends.
    window.setTimeout(() => d.remove(), 1500);
  }

  /* ------------------------------ Main loop -------------------------------- */
  function update(dtMs) {
    if (isPaused || isGameOver) return;
    if (!active) return;

    // Gravity
    const interval = dropIntervalForLevel(level);
    dropAccumulator += dtMs;

    // If player is holding soft drop, we speed up.
    const target = softDropping ? Math.min(60, interval) : interval;

    while (dropAccumulator >= target) {
      dropAccumulator -= target;
      // Move down; if blocked, land.
      if (!tryMove(0, 1)) {
        pieceLanded();
        break;
      }
    }
  }

  function frame(timeMs) {
    const dt = Math.min(50, timeMs - lastTime); // clamp to reduce big jumps
    lastTime = timeMs;

    update(dt);
    draw();

    requestAnimationFrame(frame);
  }

  /* ------------------------------ Controls -------------------------------- */
  function onKeyDown(e) {
    // Unlock audio on first user gesture.
    ensureAudio();

    const key = e.key;
    const lower = key.toLowerCase();

    // Global keys that work even during overlays:
    if (lower === "m") {
      setMuted(!isMuted);
      return;
    }

    if (lower === "r") {
      restart();
      return;
    }

    if (lower === "p") {
      togglePause();
      return;
    }

    if (isPaused || isGameOver) return;

    switch (key) {
      case "ArrowLeft":
        e.preventDefault();
        tryMove(-1, 0);
        break;
      case "ArrowRight":
        e.preventDefault();
        tryMove(1, 0);
        break;
      case "ArrowDown":
        e.preventDefault();
        softDropping = true;
        // Give one immediate step for responsiveness.
        softDropStep();
        break;
      case "ArrowUp":
        e.preventDefault();
        tryRotate(1);
        break;
      case " ":
        e.preventDefault();
        hardDrop();
        break;
      default: {
        // Letter controls
        if (lower === "x") {
          tryRotate(1);
        } else if (lower === "z") {
          tryRotate(-1);
        }
        break;
      }
    }
  }

  function onKeyUp(e) {
    if (e.key === "ArrowDown") softDropping = false;
  }

  /* ------------------------------ Buttons --------------------------------- */
  btnRestart.addEventListener("click", () => {
    ensureAudio();
    restart();
  });
  btnRestart2.addEventListener("click", () => {
    ensureAudio();
    restart();
  });

  btnMute.addEventListener("click", () => {
    ensureAudio();
    setMuted(!isMuted);
  });

  /* ------------------------------ Init ------------------------------------ */
  function init() {
    // Safety: match canvas to constants (in case HTML was edited).
    canvas.width = COLS * BLOCK;
    canvas.height = ROWS * BLOCK;

    loadHighScore();
    updateStats();

    // Prepare first bag for nicer variety.
    refillBag();
    spawn();

    // Initial overlays hidden.
    showPauseOverlay(false);
    showGameOverOverlay(false);

    // Listeners
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Start render loop
    requestAnimationFrame((t) => {
      lastTime = t;
      requestAnimationFrame(frame);
    });
  }

  init();
})();

