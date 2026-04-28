/**
 * Tetris — canvas playfield, 7-bag, line clears, local hall of fame, milestone sounds.
 */

const COLS = 10;
const ROWS = 20;
const VISIBLE_ROWS = ROWS;
const BUFFER_ROWS = 4;
const TOTAL_ROWS = VISIBLE_ROWS + BUFFER_ROWS;
const CELL = 30;

const COLORS = {
  I: "#22d3ee",
  O: "#facc15",
  T: "#c084fc",
  S: "#4ade80",
  Z: "#fb7185",
  J: "#60a5fa",
  L: "#fb923c",
};

/** 4 states × 16 chars = 4×4 grid ('.' empty, letter = filled) */
const O_GRID = ".OO." + ".OO." + "...." + "....";
const SHAPES = {
  I: ["..I...I...I...I.", "....IIII........", "..I...I...I...I.", "....IIII........"],
  O: [O_GRID, O_GRID, O_GRID, O_GRID],
  T: [".T..TTT.........", ".###..#.........", "....###..#......", ".##..#.........."],
  S: [".SS.SS..........", "..S..SS..S......", ".SS.SS..........", "..S..SS..S......"],
  Z: ["ZZ...ZZ.........", "..Z..ZZ..Z......", "ZZ...ZZ.........", "..Z..ZZ..Z......"],
  J: ["JJJ...J.........", ".J...J..JJ......", "J...JJJ.........", "JJ...J...J......"],
  L: ["LLL...L.........", ".L...L..LL......", "....LLL...L.....", "LL...L...L......"],
};

const SCORE_MILESTONES = [500, 1000, 2000, 3500, 5000, 7500, 10000, 15000, 20000, 30000, 40000, 50000];

const STORAGE_KEY = "tetris-hall-of-fame";
const MAX_LEADERBOARD = 15;

/** @type {HTMLCanvasElement} */
const canvas = document.getElementById("game");
/** @type {CanvasRenderingContext2D} */
const ctx = canvas.getContext("2d");
/** @type {HTMLCanvasElement} */
const nextCanvas = document.getElementById("next");
const nextCtx = nextCanvas.getContext("2d");

const elScore = document.getElementById("score");
const elLevel = document.getElementById("level");
const elLines = document.getElementById("lines");
const elOverlay = document.getElementById("overlay");
const elOverlayTitle = document.getElementById("overlay-title");
const elOverlayMsg = document.getElementById("overlay-msg");
const btnResume = document.getElementById("btn-resume");
const btnPlayAgain = document.getElementById("btn-play-again");
const btnPlayAgainModal = document.getElementById("btn-play-again-modal");
const elLeaderboard = document.getElementById("leaderboard");
const elNameModal = document.getElementById("name-modal");
const elPlayerName = document.getElementById("player-name");
const elFinalScore = document.getElementById("final-score");
const btnSaveScore = document.getElementById("btn-save-score");
const btnSkipSave = document.getElementById("btn-skip-save");
const btnClearBoard = document.getElementById("btn-clear-board");

/** @type {number[][]} */
let board = [];
let bag = [];
let piece = null;
let nextType = null;
let score = 0;
let linesCleared = 0;
let level = 1;
let dropMs = 800;
let dropAcc = 0;
let lastTs = 0;
let paused = false;
let gameOver = false;
let lastMilestoneIndex = -1;
let pendingGameOverScore = 0;

let keysDown = new Set();
let dasLeft = 0;
let dasRight = 0;
const DAS_DELAY = 200;
const DAS_REPEAT = 62;

/** Slower gravity: base fall time and how much it speeds up per level */
const BASE_DROP_MS = 1150;
const MIN_DROP_MS = 150;
const DROP_MS_PER_LEVEL = 38;

/** Soft drop multiplier vs normal gravity (lower = less frantic) */
const SOFT_DROP_MULT = 8;

let audioCtx = null;

/** @type {GainNode | null} */
let bgmBus = null;
/** @type {ReturnType<typeof setInterval> | null} */
let bgmMelodyTimer = null;
let bgmMelodyStep = 0;
const BGM_MASTER = 0.2;

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().then(() => tryStartBackgroundMusic()).catch(() => {});
  } else {
    tryStartBackgroundMusic();
  }
}

/** Light looping pad + melody once audio is allowed (after first user gesture). */
function tryStartBackgroundMusic() {
  if (!audioCtx || audioCtx.state !== "running") return;
  initBgmInfrastructure();
  startBgmMelodyLoop();
  if (!gameOver && !paused) setBgmAudible(true);
}

function initBgmInfrastructure() {
  if (bgmBus || !audioCtx) return;
  bgmBus = audioCtx.createGain();
  bgmBus.gain.value = 0.0001;
  bgmBus.connect(audioCtx.destination);

  const bassMix = audioCtx.createGain();
  bassMix.gain.value = 0.045;
  bassMix.connect(bgmBus);
  for (const freq of [65.41, 98.0]) {
    const o = audioCtx.createOscillator();
    o.type = "sine";
    o.frequency.value = freq;
    o.connect(bassMix);
    o.start();
  }
}

function startBgmMelodyLoop() {
  if (!audioCtx || !bgmBus || bgmMelodyTimer) return;
  const melody = [392, 440, 523.25, 587.33, 659.25, 587.33, 523.25, 440, 392, 329.63, 293.66, 261.63];
  bgmMelodyTimer = setInterval(() => {
    if (!audioCtx || !bgmBus || paused || gameOver) return;
    const t = audioCtx.currentTime + 0.04;
    const f = melody[bgmMelodyStep % melody.length];
    bgmMelodyStep++;
    const o = audioCtx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(f, t);
    const ng = audioCtx.createGain();
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.055, t + 0.03);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    o.connect(ng);
    ng.connect(bgmBus);
    o.start(t);
    o.stop(t + 0.32);
  }, 540);
}

function setBgmAudible(on) {
  if (!bgmBus || !audioCtx) return;
  const target = on && !paused && !gameOver ? BGM_MASTER : 0.0001;
  const ct = audioCtx.currentTime;
  bgmBus.gain.cancelScheduledValues(ct);
  const cur = Math.max(0.0001, bgmBus.gain.value);
  bgmBus.gain.setValueAtTime(cur, ct);
  bgmBus.gain.linearRampToValueAtTime(target, ct + 0.45);
}

function stopBgmForGameOver() {
  setBgmAudible(false);
  if (bgmMelodyTimer) {
    clearInterval(bgmMelodyTimer);
    bgmMelodyTimer = null;
  }
}

/**
 * @param {number} freq
 * @param {number} when
 * @param {number} dur
 * @param {number} gain
 */
function beep(freq, when, dur, gain = 0.08) {
  ensureAudio();
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, when);
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(gain, when + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, when + dur);
  osc.connect(g);
  g.connect(audioCtx.destination);
  osc.start(when);
  osc.stop(when + dur + 0.05);
}

function playLineClearSound(lines) {
  ensureAudio();
  const t0 = audioCtx.currentTime + 0.01;
  const base = 220 + lines * 80;
  beep(base, t0, 0.12, 0.07);
  beep(base * 1.25, t0 + 0.08, 0.1, 0.06);
}

/** Soft thud + short click when a piece locks onto the stack */
function playLockSound() {
  ensureAudio();
  const t = audioCtx.currentTime + 0.005;

  const thump = audioCtx.createOscillator();
  thump.type = "triangle";
  thump.frequency.setValueAtTime(158, t);
  thump.frequency.exponentialRampToValueAtTime(58, t + 0.11);
  const gThump = audioCtx.createGain();
  gThump.gain.setValueAtTime(0, t);
  gThump.gain.linearRampToValueAtTime(0.13, t + 0.006);
  gThump.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  thump.connect(gThump);
  gThump.connect(audioCtx.destination);
  thump.start(t);
  thump.stop(t + 0.24);

  const click = audioCtx.createOscillator();
  click.type = "square";
  click.frequency.setValueAtTime(720, t + 0.003);
  const gClick = audioCtx.createGain();
  gClick.gain.setValueAtTime(0, t + 0.003);
  gClick.gain.linearRampToValueAtTime(0.052, t + 0.01);
  gClick.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  click.connect(gClick);
  gClick.connect(audioCtx.destination);
  click.start(t + 0.003);
  click.stop(t + 0.065);
}

/** Descending phrase when the game ends */
function playGameOverChime() {
  ensureAudio();
  const t0 = audioCtx.currentTime + 0.02;
  const freqs = [523.25, 466.16, 392.0, 349.23, 293.66];
  freqs.forEach((f, i) => {
    const when = t0 + i * 0.16;
    const osc = audioCtx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(f, when);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.095, when + 0.035);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.65);
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start(when);
    osc.stop(when + 0.7);
  });
}

/** Play richer tone when crossing a score milestone */
function playMilestoneSound(index) {
  ensureAudio();
  const t0 = audioCtx.currentTime + 0.02;
  const steps = [523.25, 659.25, 783.99, 1046.5];
  const spread = 0.11;
  steps.forEach((f, i) => {
    const vol = 0.055 + index * 0.004;
    beep(f, t0 + i * spread, 0.22, Math.min(0.12, vol));
  });
  beep(1318.5, t0 + steps.length * spread, 0.35, 0.08);
}

function checkScoreMilestones() {
  for (let i = lastMilestoneIndex + 1; i < SCORE_MILESTONES.length; i++) {
    if (score >= SCORE_MILESTONES[i]) {
      lastMilestoneIndex = i;
      playMilestoneSound(i);
    } else {
      break;
    }
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function refillBag() {
  bag = shuffle(["I", "O", "T", "S", "Z", "J", "L"]);
}

function nextFromBag() {
  if (bag.length === 0) refillBag();
  return bag.pop();
}

function parseShape(type, rot) {
  const s = SHAPES[type][rot % 4];
  const cells = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const ch = s[r * 4 + c];
      if (ch !== "." && ch !== " ") cells.push({ r, c });
    }
  }
  return cells;
}

function spawnPiece(type) {
  const rot = 0;
  const cells = parseShape(type, rot);
  const baseR = 0;
  const baseC = 3;
  return {
    type,
    rot,
    r: baseR,
    c: baseC,
    cells,
  };
}

function rotateCells(p, dir) {
  const newRot = (p.rot + dir + 4) % 4;
  return { rot: newRot, cells: parseShape(p.type, newRot) };
}

function collides(pr, pc, cells) {
  for (const { r, c } of cells) {
    const br = pr + r;
    const bc = pc + c;
    if (bc < 0 || bc >= COLS || br >= TOTAL_ROWS) return true;
    if (br >= 0 && board[br][bc]) return true;
  }
  return false;
}

const KICKS = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [-1, -1],
  [1, -1],
  [-2, 0],
  [2, 0],
];

function tryRotate(dir) {
  if (!piece || gameOver || paused) return;
  const { rot, cells } = rotateCells(piece, dir);
  for (const [dx, dy] of KICKS) {
    const nr = piece.r + dy;
    const nc = piece.c + dx;
    if (!collides(nr, nc, cells)) {
      piece.rot = rot;
      piece.cells = cells;
      piece.r = nr;
      piece.c = nc;
      return;
    }
  }
}

/**
 * @param {number} dx
 * @param {number} dy
 * @param {boolean} [softScore] count 1 point per cell for player soft drop only
 */
function tryMove(dx, dy, softScore = false) {
  if (!piece || gameOver || paused) return false;
  const nr = piece.r + dy;
  const nc = piece.c + dx;
  if (collides(nr, nc, piece.cells)) return false;
  piece.r = nr;
  piece.c = nc;
  if (dy > 0 && softScore) {
    score += 1;
    checkScoreMilestones();
  }
  return true;
}

function lockPiece() {
  if (!piece) return;
  for (const { r, c } of piece.cells) {
    const br = piece.r + r;
    const bc = piece.c + c;
    if (br < 0) {
      endGame();
      return;
    }
    if (br >= 0 && br < TOTAL_ROWS && bc >= 0 && bc < COLS) {
      board[br][bc] = piece.type;
    }
  }
  playLockSound();
  piece = null;
  clearLines();
  spawnNext();
}

function hardDrop() {
  if (!piece || gameOver || paused) return;
  let drops = 0;
  while (!collides(piece.r + 1, piece.c, piece.cells)) {
    piece.r += 1;
    drops += 1;
  }
  score += drops * 2;
  checkScoreMilestones();
  lockPiece();
}

function clearLines() {
  let cleared = 0;
  for (let r = TOTAL_ROWS - 1; r >= 0; ) {
    if (board[r].every((cell) => cell !== 0)) {
      board.splice(r, 1);
      board.unshift(Array(COLS).fill(0));
      cleared += 1;
    } else {
      r -= 1;
    }
  }
  if (cleared > 0) {
    playLineClearSound(cleared);
    const table = { 1: 100, 2: 300, 3: 500, 4: 800 };
    score += (table[cleared] || 800) * level;
    linesCleared += cleared;
    const newLevel = Math.floor(linesCleared / 10) + 1;
    if (newLevel !== level) {
      level = newLevel;
      dropMs = Math.max(MIN_DROP_MS, BASE_DROP_MS - (level - 1) * DROP_MS_PER_LEVEL);
    }
    checkScoreMilestones();
  }
}

function spawnNext() {
  const t = nextType ?? nextFromBag();
  nextType = nextFromBag();
  piece = spawnPiece(t);
  if (collides(piece.r, piece.c, piece.cells)) {
    endGame();
  }
}

function emptyBoard() {
  board = Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(0));
}

function resetGame() {
  emptyBoard();
  refillBag();
  nextType = null;
  score = 0;
  linesCleared = 0;
  level = 1;
  dropMs = BASE_DROP_MS;
  dropAcc = 0;
  lastTs = 0;
  gameOver = false;
  paused = false;
  lastMilestoneIndex = -1;
  piece = null;
  spawnNext();
  hideOverlay();
  elNameModal.classList.add("hidden");
  updateHud();
  tryStartBackgroundMusic();
  setBgmAudible(true);
}

function endGame() {
  gameOver = true;
  piece = null;
  stopBgmForGameOver();
  playGameOverChime();
  pendingGameOverScore = score;
  elFinalScore.textContent = String(score);
  elPlayerName.value = "";
  elNameModal.classList.remove("hidden");
  setTimeout(() => elPlayerName.focus(), 100);
}

function updateHud() {
  elScore.textContent = String(score);
  elLevel.textContent = String(level);
  elLines.textContent = String(linesCleared);
}

function readLeaderboard() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter((e) => e && typeof e.name === "string" && typeof e.score === "number")
      .slice(0, MAX_LEADERBOARD * 2);
  } catch {
    return [];
  }
}

function writeLeaderboard(entries) {
  const sorted = [...entries].sort((a, b) => b.score - a.score).slice(0, MAX_LEADERBOARD);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
  renderLeaderboard(sorted);
}

function renderLeaderboard(entries) {
  elLeaderboard.innerHTML = "";
  if (entries.length === 0) {
    const li = document.createElement("li");
    li.className = "lb-empty";
    li.textContent = "No scores yet — finish a game and save your name.";
    elLeaderboard.appendChild(li);
    return;
  }
  for (const e of entries) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "lb-name";
    name.textContent = e.name;
    const sc = document.createElement("span");
    sc.className = "lb-score";
    sc.textContent = String(e.score);
    li.appendChild(name);
    li.appendChild(sc);
    elLeaderboard.appendChild(li);
  }
}

function saveScoreEntry() {
  const name = elPlayerName.value.trim() || "Anonymous";
  const entry = {
    name: name.slice(0, 24),
    score: pendingGameOverScore,
    at: new Date().toISOString(),
  };
  const list = readLeaderboard();
  list.push(entry);
  writeLeaderboard(list);
  elNameModal.classList.add("hidden");
  showOverlay(
    "Game over",
    "Press Play again or Enter to start a new round.",
    "gameover"
  );
}

function skipSave() {
  elNameModal.classList.add("hidden");
  showOverlay(
    "Game over",
    "Press Play again or Enter to start a new round.",
    "gameover"
  );
}

/** @param {"pause" | "gameover"} [variant] */
function showOverlay(title, msg, variant = "pause") {
  elOverlayTitle.textContent = title;
  elOverlayMsg.textContent = msg;
  const isGameOver = variant === "gameover";
  btnResume.classList.toggle("hidden", isGameOver);
  btnPlayAgain.classList.toggle("hidden", !isGameOver);
  elOverlay.classList.remove("hidden");
}

function startNewGameFromGameOver() {
  resetGame();
  canvas.focus();
}

function hideOverlay() {
  elOverlay.classList.add("hidden");
  btnResume.classList.remove("hidden");
  btnPlayAgain.classList.add("hidden");
}

function drawCell(x, y, color, size = CELL) {
  const pad = 1;
  ctx.fillStyle = color;
  ctx.fillRect(x * size + pad, y * size + pad, size - pad * 2, size - pad * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x * size + pad, y * size + pad, size - pad * 2, size - pad * 2);
}

function drawBoard() {
  const offsetY = BUFFER_ROWS;
  for (let r = offsetY; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = board[r][c];
      const vr = r - offsetY;
      if (t) drawCell(c, vr, COLORS[t] || "#888");
      else {
        ctx.fillStyle = "#1a1f2e";
        ctx.fillRect(c * CELL, vr * CELL, CELL, CELL);
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        ctx.strokeRect(c * CELL + 0.5, vr * CELL + 0.5, CELL - 1, CELL - 1);
      }
    }
  }
  if (piece) {
    for (const { r, c } of piece.cells) {
      const br = piece.r + r - offsetY;
      const bc = piece.c + c;
      /* Allow br < 0 so pieces spawning in the buffer row clip into view at the top */
      if (br < VISIBLE_ROWS && bc >= 0 && bc < COLS && br > -6) {
        drawCell(bc, br, COLORS[piece.type]);
      }
    }
  }
}

function drawNext() {
  const s = 24;
  nextCtx.fillStyle = "#f0e8ff";
  nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (!nextType) return;
  const cells = parseShape(nextType, 0);
  let minR = 4,
    minC = 4,
    maxR = 0,
    maxC = 0;
  for (const { r, c } of cells) {
    minR = Math.min(minR, r);
    minC = Math.min(minC, c);
    maxR = Math.max(maxR, r);
    maxC = Math.max(maxC, c);
  }
  const w = (maxC - minC + 1) * s;
  const h = (maxR - minR + 1) * s;
  const ox = (nextCanvas.width - w) / 2 - minC * s;
  const oy = (nextCanvas.height - h) / 2 - minR * s;
  for (const { r, c } of cells) {
    const x = ox + c * s;
    const y = oy + r * s;
    nextCtx.fillStyle = COLORS[nextType];
    nextCtx.fillRect(x + 1, y + 1, s - 2, s - 2);
  }
}

function tick(ts) {
  if (!lastTs) lastTs = ts;
  const dt = Math.min(ts - lastTs, 120);
  lastTs = ts;

  if (!gameOver && !paused && piece) {
    if (keysDown.has("ArrowLeft")) {
      dasLeft += dt;
      if (!keysDown.has("_movedLeft")) {
        tryMove(-1, 0);
        keysDown.add("_movedLeft");
        dasLeft = 0;
      } else if (dasLeft > DAS_DELAY) {
        dasLeft -= DAS_REPEAT;
        tryMove(-1, 0);
      }
    } else {
      dasLeft = 0;
      keysDown.delete("_movedLeft");
    }
    if (keysDown.has("ArrowRight")) {
      dasRight += dt;
      if (!keysDown.has("_movedRight")) {
        tryMove(1, 0);
        keysDown.add("_movedRight");
        dasRight = 0;
      } else if (dasRight > DAS_DELAY) {
        dasRight -= DAS_REPEAT;
        tryMove(1, 0);
      }
    } else {
      dasRight = 0;
      keysDown.delete("_movedRight");
    }

    if (keysDown.has("ArrowDown")) {
      if (tryMove(0, 1, true)) {
        dropAcc = 0;
      }
    }

    dropAcc += dt;
    const mult = keysDown.has("ArrowDown") ? SOFT_DROP_MULT : 1;
    while (dropAcc >= dropMs / mult) {
      dropAcc -= dropMs / mult;
      if (!tryMove(0, 1, false)) {
        lockPiece();
        dropAcc = 0;
        break;
      }
    }
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBoard();
  drawNext();
  updateHud();
  requestAnimationFrame(tick);
}

canvas.addEventListener("keydown", (e) => {
  ensureAudio();
  if (e.code === "Space") e.preventDefault();

  if (gameOver && !elNameModal.classList.contains("hidden")) {
    return;
  }

  if (gameOver && (e.code === "Enter" || e.code === "NumpadEnter")) {
    e.preventDefault();
    startNewGameFromGameOver();
    return;
  }

  if (e.code === "KeyP") {
    e.preventDefault();
    if (gameOver) return;
    paused = !paused;
    if (paused) {
      showOverlay("Paused", "Press P or Resume to continue.", "pause");
      setBgmAudible(false);
    } else {
      hideOverlay();
      setBgmAudible(true);
    }
    return;
  }

  if (paused || gameOver) return;

  if (e.repeat) {
    keysDown.add(e.code);
    return;
  }

  if (e.code === "ArrowLeft" || e.code === "ArrowRight" || e.code === "ArrowDown") {
    e.preventDefault();
    keysDown.add(e.code);
    if (e.code === "ArrowLeft") tryMove(-1, 0);
    if (e.code === "ArrowRight") tryMove(1, 0);
    if (e.code === "ArrowDown") tryMove(0, 1, true);
  }
  if (e.code === "ArrowUp") {
    e.preventDefault();
    hardDrop();
  }
  if (e.code === "Space") {
    e.preventDefault();
    tryRotate(1);
  }
});

canvas.addEventListener("keyup", (e) => {
  keysDown.delete(e.code);
  keysDown.delete("_movedLeft");
  keysDown.delete("_movedRight");
});

window.addEventListener("blur", () => {
  keysDown.clear();
});

canvas.addEventListener("mousedown", () => {
  canvas.focus();
  ensureAudio();
});

btnResume.addEventListener("click", () => {
  paused = false;
  hideOverlay();
  canvas.focus();
  setBgmAudible(true);
});

btnPlayAgain.addEventListener("click", () => {
  startNewGameFromGameOver();
});

btnPlayAgainModal.addEventListener("click", () => {
  elNameModal.classList.add("hidden");
  startNewGameFromGameOver();
});

btnSaveScore.addEventListener("click", () => {
  saveScoreEntry();
});

btnSkipSave.addEventListener("click", () => {
  skipSave();
});

elPlayerName.addEventListener("keydown", (e) => {
  if (e.code === "Enter") {
    e.preventDefault();
    saveScoreEntry();
  }
});

btnClearBoard.addEventListener("click", () => {
  if (confirm("Remove all saved scores from the hall of fame on this device?")) {
    localStorage.removeItem(STORAGE_KEY);
    renderLeaderboard([]);
  }
});

canvas.setAttribute("tabindex", "0");
resetGame();
renderLeaderboard(readLeaderboard());
canvas.focus();
requestAnimationFrame(tick);
