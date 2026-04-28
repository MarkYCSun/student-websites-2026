/* ============================================================================
  GB Tetris — Game Boy Edition
  Changes from original:
  · Game Boy green monochrome color palette
  · Faster starting speed (500ms base vs 720ms)
  · Harder level scaling (steeper curve, faster acceleration)
  · T-spin detection + bonus scoring (400/800/1200 × level)
  · Piece statistics tracker (count per piece type)
  · Combo counter
  · T-spin popup flash effect
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
  const statCombo = $("#statCombo");
  const comboDisplay = $("#comboDisplay");
  const pieceStatsGrid = $("#pieceStatsGrid");

  const btnRestart = $("#btnRestart");
  const btnRestart2 = $("#btnRestart2");
  const btnMute = $("#btnMute");

  const fxLayer = $("#fxLayer");

  /* ------------------------------- Game config ----------------------------- */
  const COLS = 10;
  const ROWS = 20;
  const BLOCK = 30;
  const PREVIEW_SIZE = 4;

  // HARDER: starts at 500ms (was 720ms), drops faster, floor is 50ms (was 70ms)
  function dropIntervalForLevel(level) {
    // Exponential-ish curve that becomes brutal fast
    const ms = 500 * Math.pow(0.78, level - 1);
    return Math.max(50, Math.round(ms));
  }

  // Scoring: classic lines + T-spin bonus
  const SCORE_TABLE = { 0: 0, 1: 100, 2: 300, 3: 500, 4: 800 };
  // T-spin bonus: mini=0, single=400, double=800, triple=1200
  const TSPIN_BONUS = { 0: 0, 1: 400, 2: 800, 3: 1200 };

  // HARDER: level up every 8 lines instead of 10
  const LINES_PER_LEVEL = 8;

  const STORAGE_KEY = "gb_tetris_highscore_v1";

  /* ------------------------------ Game Boy color palette ------------------- */
  // All pieces use shades of GB green; differentiated by brightness
  const GB_COLORS = {
    I:  "#c8e840", // brightest
    O:  "#b8d830",
    T:  "#7cb518",
    S:  "#a8c828",
    Z:  "#90b010",
    J:  "#8bac0f",
    L:  "#3a6b20",
  };

  /* ------------------------------ Piece definitions ------------------------ */
  const PIECES = {
    I: {
      color: GB_COLORS.I,
      rotations: [
        [[0,1],[1,1],[2,1],[3,1]],
        [[2,0],[2,1],[2,2],[2,3]],
        [[0,2],[1,2],[2,2],[3,2]],
        [[1,0],[1,1],[1,2],[1,3]],
      ],
    },
    O: {
      color: GB_COLORS.O,
      rotations: [
        [[1,1],[2,1],[1,2],[2,2]],
        [[1,1],[2,1],[1,2],[2,2]],
        [[1,1],[2,1],[1,2],[2,2]],
        [[1,1],[2,1],[1,2],[2,2]],
      ],
    },
    T: {
      color: GB_COLORS.T,
      rotations: [
        [[1,1],[0,2],[1,2],[2,2]],
        [[1,1],[1,2],[2,2],[1,3]],
        [[0,2],[1,2],[2,2],[1,3]],
        [[1,1],[0,2],[1,2],[1,3]],
      ],
    },
    S: {
      color: GB_COLORS.S,
      rotations: [
        [[1,1],[2,1],[0,2],[1,2]],
        [[1,1],[1,2],[2,2],[2,3]],
        [[1,2],[2,2],[0,3],[1,3]],
        [[0,1],[0,2],[1,2],[1,3]],
      ],
    },
    Z: {
      color: GB_COLORS.Z,
      rotations: [
        [[0,1],[1,1],[1,2],[2,2]],
        [[2,1],[1,2],[2,2],[1,3]],
        [[0,2],[1,2],[1,3],[2,3]],
        [[1,1],[0,2],[1,2],[0,3]],
      ],
    },
    J: {
      color: GB_COLORS.J,
      rotations: [
        [[0,1],[0,2],[1,2],[2,2]],
        [[1,1],[2,1],[1,2],[1,3]],
        [[0,2],[1,2],[2,2],[2,3]],
        [[1,1],[1,2],[0,3],[1,3]],
      ],
    },
    L: {
      color: GB_COLORS.L,
      rotations: [
        [[2,1],[0,2],[1,2],[2,2]],
        [[1,1],[1,2],[1,3],[2,3]],
        [[0,2],[1,2],[2,2],[0,3]],
        [[0,1],[1,1],[1,2],[1,3]],
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

  // Game Boy–style pixel block: flat fill + pixel border + shine dot
  function fillCell(context, x, y, color, alpha = 1) {
    const px = x * BLOCK;
    const py = y * BLOCK;

    context.save();
    context.globalAlpha = alpha;

    // Main fill
    drawRoundedRect(context, px + 1, py + 1, BLOCK - 2, BLOCK - 2, 2);
    context.fillStyle = color;
    context.fill();

    // Darker inner border (pixel art style)
    context.strokeStyle = "rgba(0,0,0,0.55)";
    context.lineWidth = 1.5;
    context.stroke();

    // Bright top-left shine (classic GB highlight)
    context.fillStyle = "rgba(255,255,255,0.28)";
    drawRoundedRect(context, px + 3, py + 3, BLOCK - 10, 4, 1);
    context.fill();

    // Subtle glow
    if (alpha > 0.5) {
      context.shadowColor = color;
      context.shadowBlur = 10;
      drawRoundedRect(context, px + 1, py + 1, BLOCK - 2, BLOCK - 2, 2);
      context.strokeStyle = color;
      context.globalAlpha = alpha * 0.25;
      context.lineWidth = 1;
      context.stroke();
    }

    context.restore();
  }

  function drawBoardGrid(context) {
    context.save();
    context.globalAlpha = 0.12;
    context.strokeStyle = "rgba(124, 181, 24, 0.4)";
    context.lineWidth = 0.5;
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
  let active = null;
  let next = null;

  let lastTime = 0;
  let dropAccumulator = 0;

  let score = 0;
  let lines = 0;
  let level = 1;
  let highScore = 0;
  let combo = 0; // consecutive line-clear combo

  // Piece statistics: count of each piece spawned
  let pieceStats = {};
  PIECE_KEYS.forEach(k => { pieceStats[k] = 0; });

  // T-spin tracking
  let lastMoveWasRotation = false;
  let lastRotationKickUsed = false; // was a wall kick used?

  let isPaused = false;
  let isGameOver = false;
  let isMuted = false;
  let softDropping = false;

  /* ------------------------------ Audio (procedural) ----------------------- */
  let audioCtx = null;
  let music = null;
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
    btnMute.querySelector(".btn__label").textContent = isMuted ? "SFX: OFF" : "SFX: ON";
    if (music) { if (isMuted) music.stop(); else music.start(); }
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
    let intervalId = null;
    let step = 0;
    const bpm = 132; // slightly faster than original
    const beatMs = (60_000 / bpm) / 2;
    // More energetic scale: pentatonic minor
    const scale = [0, 3, 5, 7, 10];
    const base = 220;

    function tick() {
      const semitone = scale[step % scale.length] + (step % 10 === 0 ? 12 : 0);
      const f = base * Math.pow(2, semitone / 12);
      const type = step % 3 === 0 ? "square" : "triangle";
      const gain = step % 10 === 0 ? 0.055 : 0.03;
      beep(type, f, 0.08, gain);
      step++;
    }

    return {
      start() { if (intervalId) return; intervalId = window.setInterval(tick, beatMs); },
      stop() { if (!intervalId) return; window.clearInterval(intervalId); intervalId = null; },
    };
  }

  /* ------------------------------ Board & pieces --------------------------- */
  function createEmptyBoard() {
    return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
  }

  function makePiece(typeKey) {
    return { type: typeKey, color: PIECES[typeKey].color, rot: 0, x: 3, y: -1 };
  }

  function cellsFor(piece, rot = piece.rot, x = piece.x, y = piece.y) {
    return PIECES[piece.type].rotations[rot].map(([dx, dy]) => [x + dx, y + dy]);
  }

  function inBounds(x, y) {
    return x >= 0 && x < COLS && y < ROWS;
  }

  function collides(piece, rot = piece.rot, x = piece.x, y = piece.y) {
    for (const [cx, cy] of cellsFor(piece, rot, x, y)) {
      if (!inBounds(cx, cy)) return true;
      if (cy >= 0 && board[cy][cx]) return true;
    }
    return false;
  }

  function lockPiece(piece) {
    for (const [cx, cy] of cellsFor(piece)) {
      if (cy < 0) continue;
      board[cy][cx] = { color: piece.color };
    }
  }

  function clearLines() {
    let cleared = 0;
    const newBoard = [];
    for (let y = 0; y < ROWS; y++) {
      if (board[y].every(cell => cell !== null)) { cleared++; }
      else { newBoard.push(board[y]); }
    }
    while (newBoard.length < ROWS) newBoard.unshift(Array.from({ length: COLS }, () => null));
    board = newBoard;
    return cleared;
  }

  /* ------------------------------ T-Spin detection ------------------------- */
  // Classic 3-corner T-spin check
  function detectTSpin() {
    if (!active || active.type !== "T") return false;
    if (!lastMoveWasRotation) return false;

    // Check 4 corners of the T bounding box
    const cx = active.x + 1; // center of T is always at +1,+2 offset
    const cy = active.y + 2;

    const corners = [
      [cx - 1, cy - 1],
      [cx + 1, cy - 1],
      [cx - 1, cy + 1],
      [cx + 1, cy + 1],
    ];

    let filledCorners = 0;
    for (const [bx, by] of corners) {
      if (bx < 0 || bx >= COLS || by < 0 || by >= ROWS) filledCorners++;
      else if (by >= 0 && board[by][bx]) filledCorners++;
    }

    return filledCorners >= 3;
  }

  /* ------------------------------ Randomizer (7-bag) ----------------------- */
  let bag = [];

  function refillBag() {
    bag = PIECE_KEYS.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }

  function nextFromBag() {
    if (bag.length === 0) refillBag();
    return bag.pop();
  }

  /* ------------------------------ UI helpers -------------------------------- */
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

    // Combo display
    statCombo.textContent = combo + "×";
    comboDisplay.classList.toggle("combo-display--active", combo >= 2);

    // Piece stats
    renderPieceStats();
  }

  function renderPieceStats() {
    if (!pieceStatsGrid) return;
    pieceStatsGrid.innerHTML = "";
    for (const key of PIECE_KEYS) {
      const item = document.createElement("div");
      item.className = "piece-stat-item";
      item.innerHTML = `
        <span class="piece-stat-item__label" style="color:${PIECES[key].color}">${key}</span>
        <span class="piece-stat-item__count">${pieceStats[key]}</span>
      `;
      pieceStatsGrid.appendChild(item);
    }
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

    // Locked board
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = board[y][x];
        if (cell) fillCell(ctx, x, y, cell.color, 1);
      }
    }

    // Ghost piece
    if (active && !isGameOver) {
      const ghost = { ...active };
      while (!collides(ghost, ghost.rot, ghost.x, ghost.y + 1)) ghost.y++;
      for (const [x, y] of cellsFor(ghost)) {
        if (y >= 0) fillCell(ctx, x, y, active.color, 0.15);
      }
    }

    // Active piece
    if (active) {
      for (const [x, y] of cellsFor(active)) {
        if (y >= 0) fillCell(ctx, x, y, active.color, 1);
      }
    }

    drawBoardGrid(ctx);
    drawNext();
  }

  function drawNext() {
    clearCanvas(nextCtx, nextCanvas.width, nextCanvas.height);
    const cell = nextCanvas.width / PREVIEW_SIZE;

    // Grid
    nextCtx.save();
    nextCtx.globalAlpha = 0.15;
    nextCtx.strokeStyle = "rgba(124, 181, 24, 0.4)";
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

    const offsets = PIECES[next.type].rotations[0];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [dx, dy] of offsets) {
      minX = Math.min(minX, dx); maxX = Math.max(maxX, dx);
      minY = Math.min(minY, dy); maxY = Math.max(maxY, dy);
    }
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const ox = Math.floor((PREVIEW_SIZE - w) / 2) - minX;
    const oy = Math.floor((PREVIEW_SIZE - h) / 2) - minY;

    for (const [dx, dy] of offsets) {
      const px = (dx + ox) * cell;
      const py = (dy + oy) * cell;
      nextCtx.save();
      nextCtx.fillStyle = next.color;
      drawRoundedRect(nextCtx, px + 2, py + 2, cell - 4, cell - 4, 2);
      nextCtx.fill();
      nextCtx.strokeStyle = "rgba(0,0,0,0.5)";
      nextCtx.lineWidth = 1.5;
      nextCtx.stroke();
      // shine
      nextCtx.fillStyle = "rgba(255,255,255,0.25)";
      drawRoundedRect(nextCtx, px + 4, py + 4, cell - 12, 3, 1);
      nextCtx.fill();
      nextCtx.restore();
    }
  }

  /* ------------------------------ T-spin popup ----------------------------- */
  function showTSpinPopup(cleared) {
    if (!fxLayer) return;
    const labels = ["T-SPIN!", "T-SPIN SINGLE!", "T-SPIN DOUBLE!", "T-SPIN TRIPLE!"];
    const label = labels[Math.min(cleared, 3)];
    const el = document.createElement("div");
    el.className = "tspin-popup";
    el.textContent = label;
    fxLayer.appendChild(el);
    window.setTimeout(() => el.remove(), 1300);
  }

  /* ------------------------------ Movement & rotation ---------------------- */
  function tryMove(dx, dy) {
    if (!active || isPaused || isGameOver) return false;
    const nx = active.x + dx;
    const ny = active.y + dy;
    if (collides(active, active.rot, nx, ny)) return false;
    active.x = nx;
    active.y = ny;
    if (dx !== 0 || dy !== 0) lastMoveWasRotation = false;
    return true;
  }

  const KICKS = [
    [0, 0], [1, 0], [-1, 0], [2, 0], [-2, 0],
    [0, -1], [1, -1], [-1, -1],
  ];

  function tryRotate(dir) {
    if (!active || isPaused || isGameOver) return false;
    if (active.type === "O") return true;

    const oldRot = active.rot;
    const newRot = (oldRot + (dir === 1 ? 1 : 3)) % 4;

    for (let ki = 0; ki < KICKS.length; ki++) {
      const [kx, ky] = KICKS[ki];
      const nx = active.x + kx;
      const ny = active.y + ky;
      if (!collides(active, newRot, nx, ny)) {
        active.rot = newRot;
        active.x = nx;
        active.y = ny;
        lastMoveWasRotation = true;
        lastRotationKickUsed = ki > 0; // kick was needed
        beep("square", 680, 0.045, 0.025);
        return true;
      }
    }
    return false;
  }

  function hardDrop() {
    if (!active || isPaused || isGameOver) return;
    let dropped = 0;
    while (tryMove(0, 1)) dropped++;
    score += dropped * 2;
    beep("triangle", 520, 0.055, 0.035);
    pieceLanded();
  }

  function softDropStep() {
    if (!active || isPaused || isGameOver) return;
    if (tryMove(0, 1)) { score += 1; }
    else { pieceLanded(); }
  }

  /* ------------------------------ Game flow -------------------------------- */
  function spawn() {
    if (!next) next = makePiece(nextFromBag());
    active = next;
    next = makePiece(nextFromBag());

    active.x = active.type === "I" ? 3 : 3;
    active.y = -1;
    active.rot = 0;
    lastMoveWasRotation = false;
    lastRotationKickUsed = false;

    // Track piece stats
    pieceStats[active.type] = (pieceStats[active.type] || 0) + 1;

    if (collides(active)) {
      isGameOver = true;
      showGameOverOverlay(true);
      showPauseOverlay(false);
      noiseBurst(0.12, 0.08);
      saveHighScoreIfNeeded();
      updateStats();
    } else {
      beep("sine", 330, 0.04, 0.025);
    }
  }

  function pieceLanded() {
    lockPiece(active);

    if (cellsFor(active).some(([, y]) => y < 0)) {
      isGameOver = true;
      showGameOverOverlay(true);
      noiseBurst(0.14, 0.08);
      saveHighScoreIfNeeded();
      updateStats();
      return;
    }

    // Detect T-spin BEFORE clearing lines
    const isTSpin = detectTSpin();
    const cleared = clearLines();

    if (cleared > 0) {
      lines += cleared;
      combo++;

      let gained = SCORE_TABLE[cleared] * level;

      if (isTSpin && active.type === "T") {
        const tBonus = TSPIN_BONUS[Math.min(cleared, 3)] * level;
        gained += tBonus;
        showTSpinPopup(cleared);
        beep("sawtooth", 660, 0.08, 0.06);
        beep("sawtooth", 880, 0.08, 0.05);
      }

      // Combo bonus: +50 × combo × level for each consecutive clear
      if (combo > 1) {
        gained += 50 * combo * level;
      }

      score += gained;

      beep("triangle", 880, 0.055, 0.045);
      beep("sine", 990, 0.07, 0.035);
      spawnDinoBonus(cleared, gained, isTSpin);
    } else {
      combo = 0;
      beep("square", 180, 0.045, 0.025);
    }

    // HARDER level scaling: lines per level = 8 (was 10)
    const newLevel = Math.floor(lines / LINES_PER_LEVEL) + 1;
    if (newLevel !== level) {
      level = newLevel;
      beep("sawtooth", 220, 0.07, 0.025);
      beep("sawtooth", 330, 0.07, 0.025);
      beep("sawtooth", 440, 0.07, 0.025);
    }

    saveHighScoreIfNeeded();
    updateStats();
    spawn();
  }

  function togglePause() {
    if (isGameOver) return;
    isPaused = !isPaused;
    showPauseOverlay(isPaused);
    beep("sine", isPaused ? 240 : 360, 0.055, 0.025);
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
    combo = 0;
    PIECE_KEYS.forEach(k => { pieceStats[k] = 0; });
    lastMoveWasRotation = false;
    lastRotationKickUsed = false;

    isGameOver = false;
    isPaused = false;
    softDropping = false;

    showGameOverOverlay(false);
    showPauseOverlay(false);
    updateStats();
    spawn();
    beep("triangle", 520, 0.055, 0.035);
  }

  /* ------------------------------ Dinosaur bonus effect -------------------- */
  const DINO_SAYS = [
    "NICE CLEAR!",
    "PIXEL PERFECT!",
    "GG!",
    "STACKED!",
    "COMBO!",
    "LEVEL UP!",
    "CHOMP!",
  ];

  const DINO_TSPIN = [
    "T-SPIN!!",
    "TWIST!",
    "PRO MOVE!",
    "SICK SPIN!",
  ];

  function spawnDinoBonus(cleared, gained, isTSpin) {
    if (!fxLayer) return;
    const d = document.createElement("div");
    d.className = "dino";
    d.style.bottom = `${14 + Math.random() * 40}px`;

    const sprite = document.createElement("div");
    sprite.className = "dino__sprite";
    sprite.textContent = "🦖";

    const bubble = document.createElement("div");
    bubble.className = "dino__bubble";
    const sayList = isTSpin ? DINO_TSPIN : DINO_SAYS;
    const msg = sayList[Math.floor(Math.random() * sayList.length)];
    bubble.textContent = `${msg} +${gained}`;

    d.appendChild(sprite);
    d.appendChild(bubble);
    fxLayer.appendChild(d);
    window.setTimeout(() => d.remove(), 1500);
  }

  /* ------------------------------ Main loop -------------------------------- */
  function update(dtMs) {
    if (isPaused || isGameOver || !active) return;

    const interval = dropIntervalForLevel(level);
    dropAccumulator += dtMs;
    const target = softDropping ? Math.min(50, interval) : interval;

    while (dropAccumulator >= target) {
      dropAccumulator -= target;
      if (!tryMove(0, 1)) {
        pieceLanded();
        break;
      }
    }
  }

  function frame(timeMs) {
    const dt = Math.min(50, timeMs - lastTime);
    lastTime = timeMs;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  /* ------------------------------ Controls -------------------------------- */
  function onKeyDown(e) {
    ensureAudio();
    const key = e.key;
    const lower = key.toLowerCase();

    if (lower === "m") { setMuted(!isMuted); return; }
    if (lower === "r") { restart(); return; }
    if (lower === "p") { togglePause(); return; }
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
      default:
        if (lower === "x") tryRotate(1);
        else if (lower === "z") tryRotate(-1);
        break;
    }
  }

  function onKeyUp(e) {
    if (e.key === "ArrowDown") softDropping = false;
  }

  /* ------------------------------ Buttons --------------------------------- */
  btnRestart.addEventListener("click", () => { ensureAudio(); restart(); });
  btnRestart2.addEventListener("click", () => { ensureAudio(); restart(); });
  btnMute.addEventListener("click", () => { ensureAudio(); setMuted(!isMuted); });

  /* ------------------------------ Init ------------------------------------ */
  function init() {
    canvas.width = COLS * BLOCK;
    canvas.height = ROWS * BLOCK;

    loadHighScore();
    updateStats();
    refillBag();
    spawn();

    showPauseOverlay(false);
    showGameOverOverlay(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    requestAnimationFrame((t) => {
      lastTime = t;
      requestAnimationFrame(frame);
    });
  }

  init();
})();
