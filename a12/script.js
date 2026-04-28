const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const nextCanvas = document.getElementById("nextCanvas");
const nextCtx = nextCanvas.getContext("2d");
const scoreEl = document.getElementById("score");
const linesEl = document.getElementById("lines");
const levelEl = document.getElementById("level");
const statusEl = document.getElementById("status");
const restartBtn = document.getElementById("restartBtn");
const gameOverOverlay = document.getElementById("gameOverOverlay");
const finalScoreEl = document.getElementById("finalScore");
const overlayRestartBtn = document.getElementById("overlayRestartBtn");
const levelUpBurst = document.getElementById("levelUpBurst");
const levelCard = document.getElementById("levelCard");
const musicToggle = document.getElementById("musicToggle");

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;
const PREVIEW_GRID = 4;
const PREVIEW_BLOCK = nextCanvas.width / PREVIEW_GRID;
const NEXT_BG = "#fffef8";
const LINE_FLASH_MS = 420;
/** BGM master gain — keep below SFX peaks so effects stay clearly audible over the bed */
const MUSIC_GAIN = 0.26;
const BGM_LOOP_SEC = 8;
/** Bump when BGM synthesis changes so cached buffer is rebuilt */
const BGM_SYNTH_REVISION = 2;
const GAMEOVER_SFX_FILE = "pixie.gameover.mp3";

// Pastel palette: distinct hues (blue / yellow / purple / green / pink / indigo / coral) for readability.
const COLORS = {
  I: "#bae6fd",
  O: "#fff59a",
  T: "#ddd6fe",
  S: "#aaf0d1",
  Z: "#ffb3d9",
  J: "#fbcfe8",
  L: "#f6ebfc"
};

const SHAPES = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  O: [
    [1, 1],
    [1, 1]
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0]
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0]
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0]
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0]
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0]
  ]
};

let board = createBoard();
let currentPiece = null;
/** @type {{ kind: string, matrix: number[][] } | null} */
let nextPiece = null;
let score = 0;
let totalLines = 0;
/** @type {{ rows: number[], startTime: number } | null} */
let lineFlashState = null;
let dropCounter = 0;
let lastTime = 0;
const BASE_DROP_INTERVAL = 600;
const MIN_DROP_INTERVAL = 140;
const SPEED_STEP_SCORE = 200;
const SPEED_STEP_MS = 35;
const SOFT_DROP_MULTIPLIER = 0.2;
let dropInterval = BASE_DROP_INTERVAL;
let softDropActive = false;
let gameOver = false;
let animationId = null;
/** @type {AudioContext | null} */
let audioCtx = null;
let musicEnabled = true;
/** True after first user gesture (click/tap or key press) — required for BGM in browsers */
let bgmUserUnlocked = false;
/** @type {AudioBuffer | null} */
let bgmBuffer = null;
let bgmSynthRevisionBuilt = 0;
/** @type {AudioBufferSourceNode | null} */
let bgmSource = null;
/** @type {GainNode | null} */
let bgmGainNode = null;
/** @type {HTMLAudioElement | null} */
let gameOverAudio = null;

function getAudioContext() {
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

function resumeAudioContext() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      ctx.resume();
    }
  } catch {
    /* ignore */
  }
}

function unlockAudioFromUserGesture() {
  if (bgmUserUnlocked) {
    return;
  }
  bgmUserUnlocked = true;
  try {
    const ctx = getAudioContext();
    void ctx.resume().then(() => {
      startBgmIfPossible();
    });
  } catch {
    /* ignore */
  }
}

function updateMusicToggleUi() {
  if (!musicToggle) {
    return;
  }
  musicToggle.setAttribute("aria-pressed", musicEnabled ? "true" : "false");
  musicToggle.textContent = musicEnabled ? "Music: On" : "Music: Off";
  musicToggle.setAttribute(
    "aria-label",
    musicEnabled ? "Turn background music off" : "Turn background music on"
  );
}

function ensureBgmBuffer(ctx) {
  if (bgmBuffer && bgmSynthRevisionBuilt === BGM_SYNTH_REVISION) {
    return;
  }
  bgmBuffer = null;
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * BGM_LOOP_SEC);
  const buffer = ctx.createBuffer(2, len, rate);
  const notes = [261.63, 293.66, 329.63, 392.0, 440.0, 493.88, 523.25];
  const tempo = 3.2;
  for (let i = 0; i < len; i += 1) {
    const t = i / rate;
    const cyclePos = (t % tempo) / tempo;
    const noteIdx = Math.floor(cyclePos * notes.length);
    const f = notes[noteIdx % notes.length];
    const stepPhase = (cyclePos * notes.length) % 1;
    const pluck = Math.sin(stepPhase * Math.PI) * Math.exp(-stepPhase * 2.2);
    let m = pluck * 0.095 * Math.sin(2 * Math.PI * f * t);
    m += 0.022 * Math.sin(2 * Math.PI * 196 * t);
    m += 0.022 * Math.sin(2 * Math.PI * 329.63 * t) * (0.55 + 0.45 * Math.sin((2 * Math.PI * t) / 9));
    m += 0.014 * Math.sin(2 * Math.PI * 1046.5 * t) * (0.5 + 0.5 * Math.sin(2 * Math.PI * t * 3.7));
    const masterSlow = 0.68 + 0.32 * Math.sin((2 * Math.PI * t) / 18);
    m *= masterSlow * 1.32;
    m = Math.max(-0.95, Math.min(0.95, m));
    const pan = 0.18 * Math.sin((2 * Math.PI * t) / 14);
    buffer.getChannelData(0)[i] = m * (1 - pan);
    buffer.getChannelData(1)[i] = m * (1 + pan);
  }
  const fade = Math.min(2400, Math.floor(len * 0.06));
  for (let ch = 0; ch < 2; ch += 1) {
    const d = buffer.getChannelData(ch);
    for (let k = 0; k < fade; k += 1) {
      const a = k / fade;
      d[len - fade + k] = d[len - fade + k] * (1 - a) + d[k] * a;
    }
  }
  bgmBuffer = buffer;
  bgmSynthRevisionBuilt = BGM_SYNTH_REVISION;
}

function stopBgm() {
  if (!bgmSource) {
    return;
  }
  try {
    bgmSource.stop();
    bgmSource.disconnect();
  } catch {
    /* ignore */
  }
  bgmSource = null;
}

function stopGameOverSound() {
  if (!gameOverAudio) {
    return;
  }
  try {
    gameOverAudio.pause();
    gameOverAudio.currentTime = 0;
  } catch {
    /* ignore */
  }
}

function playGameOverSound() {
  try {
    if (!gameOverAudio) {
      gameOverAudio = new Audio(GAMEOVER_SFX_FILE);
      gameOverAudio.loop = false;
    } else {
      gameOverAudio.pause();
      gameOverAudio.currentTime = 0;
    }
    void gameOverAudio.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

function startBgmIfPossible() {
  if (!musicEnabled || !bgmUserUnlocked || gameOver) {
    return;
  }
  try {
    const ctx = getAudioContext();
    if (ctx.state !== "running") {
      return;
    }
    if (bgmSource) {
      return;
    }
    ensureBgmBuffer(ctx);
    if (!bgmBuffer) {
      return;
    }
    if (!bgmGainNode) {
      bgmGainNode = ctx.createGain();
      bgmGainNode.connect(ctx.destination);
    }
    bgmGainNode.gain.value = MUSIC_GAIN;
    const src = ctx.createBufferSource();
    src.buffer = bgmBuffer;
    src.loop = true;
    src.connect(bgmGainNode);
    src.start(0);
    bgmSource = src;
  } catch {
    /* ignore */
  }
}

function playLandSound() {
  try {
    const ctx = getAudioContext();
    if (ctx.state !== "running") {
      return;
    }
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(168, t);
    osc.frequency.exponentialRampToValueAtTime(128, t + 0.07);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.78, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.11);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.14);
  } catch {
    /* ignore */
  }
}

function playLineClearSound(lineCount) {
  try {
    const ctx = getAudioContext();
    if (ctx.state !== "running") {
      return;
    }
    const notes = [523.25, 587.33, 659.25, 783.99];
    const n = Math.min(Math.max(lineCount, 1), 4);
    const t0 = ctx.currentTime;
    const spacing = 0.036;
    for (let i = 0; i < n; i += 1) {
      const t = t0 + i * spacing;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(notes[i], t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.7, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    }
  } catch {
    /* ignore */
  }
}

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function createNextPiecePreview() {
  const kinds = Object.keys(SHAPES);
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  return {
    kind,
    matrix: SHAPES[kind].map((row) => [...row])
  };
}

function pieceFromPreview(preview) {
  const matrix = preview.matrix.map((row) => [...row]);
  return {
    x: Math.floor((COLS - matrix[0].length) / 2),
    y: 0,
    kind: preview.kind,
    matrix
  };
}

function drawNextPreview() {
  nextCtx.fillStyle = NEXT_BG;
  nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

  if (!nextPiece || gameOver) {
    return;
  }

  const { matrix, kind } = nextPiece;
  const mh = matrix.length;
  const mw = matrix[0].length;
  const ox = (PREVIEW_GRID - mw) / 2;
  const oy = (PREVIEW_GRID - mh) / 2;

  for (let y = 0; y < mh; y += 1) {
    for (let x = 0; x < mw; x += 1) {
      if (!matrix[y][x]) {
        continue;
      }
      const px = (ox + x) * PREVIEW_BLOCK;
      const py = (oy + y) * PREVIEW_BLOCK;
      nextCtx.fillStyle = COLORS[kind];
      nextCtx.fillRect(px, py, PREVIEW_BLOCK, PREVIEW_BLOCK);
      nextCtx.strokeStyle = "rgba(126, 34, 206, 0.35)";
      nextCtx.strokeRect(px, py, PREVIEW_BLOCK, PREVIEW_BLOCK);
    }
  }
}

function drawCell(x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  ctx.strokeStyle = "rgba(126, 34, 206, 0.35)";
  ctx.strokeRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
}

function getLevelFromScore(value) {
  return 1 + Math.floor(value / SPEED_STEP_SCORE);
}

function findFullRows() {
  const rows = [];
  for (let y = 0; y < ROWS; y += 1) {
    if (board[y].every((cell) => cell !== 0)) {
      rows.push(y);
    }
  }
  return rows;
}

function removeFullRows(rowIndices) {
  const sorted = [...rowIndices].sort((a, b) => b - a);
  for (const y of sorted) {
    board.splice(y, 1);
    board.unshift(Array(COLS).fill(0));
  }
}

function drawBoard() {
  ctx.fillStyle = "#fff8ff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (board[y][x]) {
        drawCell(x, y, board[y][x]);
      }
    }
  }

  if (lineFlashState) {
    const elapsed = performance.now() - lineFlashState.startTime;
    const p = Math.min(elapsed / LINE_FLASH_MS, 1);
    const pulse = 0.32 + 0.42 * Math.sin(p * Math.PI);
    for (const rowY of lineFlashState.rows) {
      const gy = rowY * BLOCK_SIZE;
      const grad = ctx.createLinearGradient(0, gy, 0, gy + BLOCK_SIZE);
      grad.addColorStop(0, `rgba(255, 255, 255, ${0.42 * pulse})`);
      grad.addColorStop(0.45, `rgba(255, 210, 238, ${0.38 * pulse})`);
      grad.addColorStop(1, `rgba(230, 210, 255, ${0.48 * pulse})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, gy, canvas.width, BLOCK_SIZE);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.55 * pulse})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(1, gy + 1, canvas.width - 2, BLOCK_SIZE - 2);
      ctx.lineWidth = 1;
    }
  }
}

function drawPiece(piece) {
  piece.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) {
        drawCell(piece.x + x, piece.y + y, COLORS[piece.kind]);
      }
    });
  });
}

function collides(piece, offsetX = 0, offsetY = 0, testMatrix = piece.matrix) {
  for (let y = 0; y < testMatrix.length; y += 1) {
    for (let x = 0; x < testMatrix[y].length; x += 1) {
      if (!testMatrix[y][x]) {
        continue;
      }
      const newX = piece.x + x + offsetX;
      const newY = piece.y + y + offsetY;

      if (newX < 0 || newX >= COLS || newY >= ROWS) {
        return true;
      }

      if (newY >= 0 && board[newY][newX]) {
        return true;
      }
    }
  }
  return false;
}

function mergePiece() {
  currentPiece.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) {
        const boardY = currentPiece.y + y;
        if (boardY >= 0) {
          board[boardY][currentPiece.x + x] = COLORS[currentPiece.kind];
        }
      }
    });
  });
}

function updateDropInterval() {
  const speedLevel = Math.floor(score / SPEED_STEP_SCORE);
  dropInterval = Math.max(MIN_DROP_INTERVAL, BASE_DROP_INTERVAL - speedLevel * SPEED_STEP_MS);
}

function completeLineClear() {
  if (!lineFlashState) {
    return;
  }
  const rows = lineFlashState.rows;
  const linesCleared = rows.length;
  const prevLevel = getLevelFromScore(score);
  removeFullRows(rows);
  score += linesCleared * 100;
  totalLines += linesCleared;
  const newLevel = getLevelFromScore(score);
  scoreEl.textContent = String(score);
  linesEl.textContent = String(totalLines);
  levelEl.textContent = String(newLevel);
  updateDropInterval();
  if (newLevel > prevLevel) {
    showLevelUpSparkles();
  }
  lineFlashState = null;
  spawnPiece();
}

function showLevelUpSparkles() {
  if (!levelUpBurst) {
    return;
  }
  levelUpBurst.replaceChildren();
  const symbols = ["✦", "✧", "·", "❀", "♡"];
  for (let i = 0; i < 12; i += 1) {
    const s = document.createElement("span");
    s.className = "fx-sparkle";
    s.textContent = symbols[i % symbols.length];
    s.style.left = `${6 + Math.random() * 88}%`;
    s.style.top = `${10 + Math.random() * 75}%`;
    s.style.animationDelay = `${i * 0.035}s`;
    levelUpBurst.appendChild(s);
  }
  levelUpBurst.hidden = false;
  levelUpBurst.classList.add("is-active");
  if (levelCard) {
    levelCard.classList.add("level-up");
  }
  window.setTimeout(() => {
    levelUpBurst.classList.remove("is-active");
    levelUpBurst.hidden = true;
    levelUpBurst.replaceChildren();
    if (levelCard) {
      levelCard.classList.remove("level-up");
    }
  }, 1000);
}

function getCurrentDropInterval() {
  if (!softDropActive) {
    return dropInterval;
  }
  return Math.max(50, Math.floor(dropInterval * SOFT_DROP_MULTIPLIER));
}

function rotateMatrix(matrix) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      rotated[x][rows - 1 - y] = matrix[y][x];
    }
  }
  return rotated;
}

function tryRotatePiece() {
  if (!currentPiece || lineFlashState) {
    return;
  }
  const rotated = rotateMatrix(currentPiece.matrix);
  const kicks = [0, -1, 1, -2, 2];

  for (const kick of kicks) {
    if (!collides(currentPiece, kick, 0, rotated)) {
      currentPiece.x += kick;
      currentPiece.matrix = rotated;
      return;
    }
  }
}

function spawnPiece() {
  if (!nextPiece) {
    nextPiece = createNextPiecePreview();
  }
  currentPiece = pieceFromPreview(nextPiece);
  nextPiece = createNextPiecePreview();
  if (collides(currentPiece)) {
    endGame();
  }
}

function movePiece(dx) {
  if (gameOver || lineFlashState || !currentPiece) {
    return;
  }
  if (!collides(currentPiece, dx, 0)) {
    currentPiece.x += dx;
  }
}

function dropPiece() {
  if (gameOver || lineFlashState) {
    return;
  }

  if (!collides(currentPiece, 0, 1)) {
    currentPiece.y += 1;
    return;
  }

  mergePiece();
  currentPiece = null;
  const fullRows = findFullRows();
  if (fullRows.length > 0) {
    lineFlashState = { rows: fullRows, startTime: performance.now() };
    playLineClearSound(fullRows.length);
    return;
  }

  playLandSound();
  spawnPiece();
}

function endGame() {
  gameOver = true;
  stopBgm();
  playGameOverSound();
  statusEl.textContent = "";
  if (finalScoreEl) {
    finalScoreEl.textContent = String(score);
  }
  if (gameOverOverlay) {
    gameOverOverlay.hidden = false;
  }
  if (overlayRestartBtn) {
    overlayRestartBtn.focus();
  }
  drawNextPreview();
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
}

function update(time = 0) {
  if (lineFlashState) {
    if (performance.now() - lineFlashState.startTime >= LINE_FLASH_MS) {
      completeLineClear();
    }
    drawBoard();
    if (currentPiece) {
      drawPiece(currentPiece);
    }
    drawNextPreview();
    if (!gameOver) {
      animationId = requestAnimationFrame(update);
    }
    return;
  }

  const delta = time - lastTime;
  lastTime = time;
  dropCounter += delta;
  const currentDropInterval = getCurrentDropInterval();

  if (dropCounter >= currentDropInterval) {
    dropPiece();
    dropCounter = 0;
  }

  drawBoard();
  if (currentPiece) {
    drawPiece(currentPiece);
  }
  drawNextPreview();

  if (!gameOver) {
    animationId = requestAnimationFrame(update);
  }
}

function resetGame() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  stopGameOverSound();
  board = createBoard();
  score = 0;
  totalLines = 0;
  scoreEl.textContent = "0";
  linesEl.textContent = "0";
  levelEl.textContent = "1";
  dropCounter = 0;
  lastTime = 0;
  dropInterval = BASE_DROP_INTERVAL;
  softDropActive = false;
  gameOver = false;
  lineFlashState = null;
  currentPiece = null;
  statusEl.textContent = "";
  nextPiece = null;
  if (gameOverOverlay) {
    gameOverOverlay.hidden = true;
  }
  spawnPiece();
  update();
  startBgmIfPossible();
}

document.addEventListener("pointerdown", unlockAudioFromUserGesture, { passive: true });
document.addEventListener("keydown", unlockAudioFromUserGesture);

document.addEventListener("keydown", (event) => {
  resumeAudioContext();
  if (gameOver) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      resetGame();
    }
    return;
  }

  switch (event.key) {
    case "ArrowLeft":
      event.preventDefault();
      movePiece(-1);
      break;
    case "ArrowRight":
      event.preventDefault();
      movePiece(1);
      break;
    case "ArrowDown":
      event.preventDefault();
      softDropActive = true;
      break;
    case " ":
    case "Spacebar":
      event.preventDefault();
      tryRotatePiece();
      break;
    default:
      if (event.code === "Space") {
        event.preventDefault();
        tryRotatePiece();
      }
      break;
  }
});

document.addEventListener("keyup", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    softDropActive = false;
  }
});

function bindRestart() {
  resetGame();
}

restartBtn.addEventListener("click", bindRestart);
if (overlayRestartBtn) {
  overlayRestartBtn.addEventListener("click", bindRestart);
}

if (musicToggle) {
  musicToggle.addEventListener("click", () => {
    musicEnabled = !musicEnabled;
    updateMusicToggleUi();
    if (!musicEnabled) {
      stopBgm();
    } else {
      startBgmIfPossible();
    }
  });
  updateMusicToggleUi();
}

canvas.addEventListener("pointerdown", () => {
  resumeAudioContext();
});

resetGame();
