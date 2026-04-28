const canvas = document.getElementById("tetris");
const ctx = canvas.getContext("2d");
const scoreElement = document.getElementById("score");
const highScoreElement = document.getElementById("high-score");
const linesElement = document.getElementById("lines");
const levelElement = document.getElementById("level");
const gameOverOverlayElement = document.getElementById("game-over-overlay");
const finalScoreElement = document.getElementById("final-score");
const restartButton = document.getElementById("restart-button");
const muteToggleButton = document.getElementById("mute-toggle");

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;

canvas.width = COLS * BLOCK_SIZE;
canvas.height = ROWS * BLOCK_SIZE;

const COLORS = {
  I: "#a8ecff",
  O: "#ffeaa6",
  T: "#dfc1ff",
  S: "#bff7d7",
  Z: "#ffc2dd",
  J: "#bfd4ff",
  L: "#ffd7b5"
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

const PIECES = Object.keys(SHAPES);

let board = [];
let currentPiece = null;
let score = 0;
let highScore = 0;
let lines = 0;
let level = 1;
let gameOver = false;
let dropCounter = 0;
let dropInterval = 550;
let lastTime = 0;
let animationFrameId = null;

let audioContext = null;
let audioUnlocked = false;
let isMuted = false;
let musicInterval = null;
let musicStep = 0;

const MUSIC_NOTES = [523.25, 587.33, 659.25, 587.33, 493.88, 523.25, 440.0, 392.0];
const MUSIC_STEP_MS = 420;
const MAX_PARTICLES = 90;
const CLEAR_PARTICLES_PER_LINE = 10;
const clearParticles = [];
const fallingDecorLayer = document.getElementById("falling-decor");
const DECOR_SYMBOLS = ["✦", "✿", "❤"];
const HIGH_SCORE_STORAGE_KEY = "tetris-high-score";

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function loadHighScore() {
  try {
    const saved = localStorage.getItem(HIGH_SCORE_STORAGE_KEY);
    const parsed = Number(saved);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  } catch {
    return 0;
  }
}

function saveHighScore(value) {
  try {
    localStorage.setItem(HIGH_SCORE_STORAGE_KEY, String(value));
  } catch {
    // Ignore storage errors so gameplay continues normally.
  }
}

function initFallingDecor() {
  if (!fallingDecorLayer) {
    return;
  }

  const decorCount = 14;
  for (let i = 0; i < decorCount; i += 1) {
    const item = document.createElement("span");
    item.className = "decor-item";
    item.textContent = DECOR_SYMBOLS[Math.floor(Math.random() * DECOR_SYMBOLS.length)];
    item.style.setProperty("--x", `${Math.random() * 100}vw`);
    item.style.setProperty("--size", `${12 + Math.random() * 12}px`);
    item.style.setProperty("--opacity", `${0.2 + Math.random() * 0.35}`);
    item.style.setProperty("--duration", `${12 + Math.random() * 12}s`);
    item.style.setProperty("--delay", `${-Math.random() * 12}s`);
    item.style.setProperty("--drift", `${-20 + Math.random() * 40}px`);
    fallingDecorLayer.appendChild(item);
  }
}

function setMuteState(muted) {
  isMuted = muted;
  if (muteToggleButton) {
    muteToggleButton.setAttribute("aria-pressed", String(muted));
    muteToggleButton.textContent = muted ? "Sound: Off" : "Sound: On";
  }

  if (muted) {
    stopBackgroundMusic();
  } else if (audioUnlocked) {
    startBackgroundMusic();
  }
}

async function unlockAudio() {
  if (audioUnlocked) {
    return;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }

  try {
    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    audioUnlocked = audioContext.state === "running";

    if (audioUnlocked && !isMuted) {
      startBackgroundMusic();
    }
  } catch {
    // Ignore audio startup errors to avoid autoplay warnings.
  }
}

function playTone(frequency, duration = 0.12, volume = 0.06, type = "sine") {
  if (!audioUnlocked || isMuted || !audioContext) {
    return;
  }

  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);

  oscillator.start(now);
  oscillator.stop(now + duration + 0.03);
}

function playPieceDropSound() {
  playTone(392.0, 0.08, 0.045, "triangle");
}

function playLineClearSound() {
  playTone(659.25, 0.11, 0.05, "sine");
  playTone(783.99, 0.12, 0.04, "sine");
}

function playGameOverSound() {
  playTone(329.63, 0.16, 0.06, "triangle");
  window.setTimeout(() => {
    playTone(246.94, 0.2, 0.055, "triangle");
  }, 120);
}

function stopBackgroundMusic() {
  if (musicInterval) {
    clearInterval(musicInterval);
    musicInterval = null;
  }
}

function startBackgroundMusic() {
  if (!audioUnlocked || isMuted || musicInterval) {
    return;
  }

  musicInterval = window.setInterval(() => {
    const frequency = MUSIC_NOTES[musicStep % MUSIC_NOTES.length];
    musicStep += 1;
    playTone(frequency, 0.22, 0.025, "triangle");
  }, MUSIC_STEP_MS);
}

function spawnClearParticles(rowIndexes) {
  if (!rowIndexes.length) {
    return;
  }

  for (let i = 0; i < rowIndexes.length; i += 1) {
    const row = rowIndexes[i];
    for (let p = 0; p < CLEAR_PARTICLES_PER_LINE; p += 1) {
      clearParticles.push({
        x: Math.random() * canvas.width,
        y: row * BLOCK_SIZE + BLOCK_SIZE / 2,
        vx: (Math.random() - 0.5) * 36,
        vy: -22 - Math.random() * 30,
        life: 0.45 + Math.random() * 0.25,
        age: 0,
        size: 8 + Math.random() * 6,
        kind: Math.random() < 0.5 ? "heart" : "sparkle"
      });
    }
  }

  if (clearParticles.length > MAX_PARTICLES) {
    clearParticles.splice(0, clearParticles.length - MAX_PARTICLES);
  }
}

function drawLineClearParticles(deltaSeconds) {
  if (!clearParticles.length) {
    return;
  }

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let i = clearParticles.length - 1; i >= 0; i -= 1) {
    const particle = clearParticles[i];
    particle.age += deltaSeconds;

    if (particle.age >= particle.life) {
      clearParticles.splice(i, 1);
      continue;
    }

    particle.x += particle.vx * deltaSeconds;
    particle.y += particle.vy * deltaSeconds;
    particle.vy += 30 * deltaSeconds;

    const alpha = 1 - particle.age / particle.life;
    ctx.globalAlpha = alpha * 0.7;
    ctx.font = `${particle.size}px "Arial Rounded MT Bold", sans-serif`;
    ctx.fillStyle = particle.kind === "heart" ? "#ffc3df" : "#fff6ff";
    ctx.fillText(particle.kind === "heart" ? "❤" : "✦", particle.x, particle.y);
  }

  ctx.restore();
}

function stopGameLoop() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function startGameLoop() {
  if (animationFrameId !== null) {
    return;
  }

  animationFrameId = requestAnimationFrame(update);
}

function randomPiece() {
  const type = PIECES[Math.floor(Math.random() * PIECES.length)];
  const shape = SHAPES[type].map((row) => row.slice());
  const x = Math.floor(COLS / 2) - Math.ceil(shape[0].length / 2);
  return { type, shape, x, y: 0 };
}

function roundedRect(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawCell(x, y, color) {
  const cellX = x * BLOCK_SIZE;
  const cellY = y * BLOCK_SIZE;
  const padding = 2;
  const size = BLOCK_SIZE - padding * 2;
  const drawX = cellX + padding;
  const drawY = cellY + padding;

  ctx.save();
  ctx.shadowColor = "rgba(255, 210, 239, 0.25)";
  ctx.shadowBlur = 8;
  roundedRect(drawX, drawY, size, size, 7);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();

  const shine = ctx.createLinearGradient(drawX, drawY, drawX + size, drawY + size);
  shine.addColorStop(0, "rgba(255,255,255,0.55)");
  shine.addColorStop(1, "rgba(255,255,255,0.04)");
  roundedRect(drawX, drawY, size, size, 7);
  ctx.fillStyle = shine;
  ctx.fill();

  roundedRect(drawX, drawY, size, size, 7);
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (board[y][x]) {
        drawCell(x, y, board[y][x]);
      }
    }
  }

  if (!currentPiece) {
    return;
  }

  for (let y = 0; y < currentPiece.shape.length; y += 1) {
    for (let x = 0; x < currentPiece.shape[y].length; x += 1) {
      if (currentPiece.shape[y][x]) {
        drawCell(currentPiece.x + x, currentPiece.y + y, COLORS[currentPiece.type]);
      }
    }
  }
}

function collides(piece, moveX = 0, moveY = 0, shape = piece.shape) {
  for (let y = 0; y < shape.length; y += 1) {
    for (let x = 0; x < shape[y].length; x += 1) {
      if (!shape[y][x]) {
        continue;
      }

      const newX = piece.x + x + moveX;
      const newY = piece.y + y + moveY;

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
  for (let y = 0; y < currentPiece.shape.length; y += 1) {
    for (let x = 0; x < currentPiece.shape[y].length; x += 1) {
      if (currentPiece.shape[y][x]) {
        const boardY = currentPiece.y + y;
        const boardX = currentPiece.x + x;

        if (boardY >= 0) {
          board[boardY][boardX] = COLORS[currentPiece.type];
        }
      }
    }
  }
}

function updateStats() {
  scoreElement.textContent = score;
  highScoreElement.textContent = highScore;
  linesElement.textContent = lines;
  levelElement.textContent = level;
}

function updateHighScoreIfNeeded() {
  if (score <= highScore) {
    return;
  }

  highScore = score;
  saveHighScore(highScore);
}

function updateLevelFromLines() {
  level = Math.floor(lines / 10) + 1;
}

function calculateLineClearScore(linesCleared, currentLevel) {
  // Simple classic-like scoring scaled by level.
  if (linesCleared === 1) {
    return 100 * currentLevel;
  }
  if (linesCleared === 2) {
    return 300 * currentLevel;
  }
  if (linesCleared === 3) {
    return 500 * currentLevel;
  }
  if (linesCleared === 4) {
    return 800 * currentLevel;
  }
  return 0;
}

function applyLineClearResults(linesCleared) {
  if (linesCleared <= 0) {
    return;
  }

  lines += linesCleared;
  updateLevelFromLines();
  score += calculateLineClearScore(linesCleared, level);
  updateHighScoreIfNeeded();
  updateStats();
}

function clearLines() {
  let linesCleared = 0;
  const clearedRows = [];

  for (let y = ROWS - 1; y >= 0; y -= 1) {
    if (board[y].every((cell) => cell !== 0)) {
      clearedRows.push(y);
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(0));
      linesCleared += 1;
      y += 1;
    }
  }

  if (linesCleared > 0) {
    applyLineClearResults(linesCleared);
    playLineClearSound();
    spawnClearParticles(clearedRows);
  }
}

function spawnPiece() {
  currentPiece = randomPiece();
  if (collides(currentPiece, 0, 0)) {
    gameOver = true;
    playGameOverSound();
    if (finalScoreElement) {
      finalScoreElement.textContent = score;
    }
    if (gameOverOverlayElement) {
      gameOverOverlayElement.classList.remove("hidden");
    }
    stopGameLoop();
  }
}

function rotateMatrix(matrix) {
  const size = matrix.length;
  const rotated = Array.from({ length: size }, () => Array(size).fill(0));

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      rotated[x][size - 1 - y] = matrix[y][x];
    }
  }

  return rotated;
}

function moveDown() {
  if (!collides(currentPiece, 0, 1)) {
    currentPiece.y += 1;
    return;
  }

  playPieceDropSound();
  mergePiece();
  clearLines();
  spawnPiece();
}

function handleKeyDown(event) {
  const key = event.key;
  unlockAudio();

  if (key.toLowerCase() === "r") {
    restartGame();
    return;
  }

  if (gameOver || !currentPiece) {
    return;
  }

  if (key === "ArrowLeft") {
    if (!collides(currentPiece, -1, 0)) {
      currentPiece.x -= 1;
    }
  } else if (key === "ArrowRight") {
    if (!collides(currentPiece, 1, 0)) {
      currentPiece.x += 1;
    }
  } else if (key === "ArrowDown") {
    moveDown();
  } else if (key === "ArrowUp") {
    const rotated = rotateMatrix(currentPiece.shape);
    if (!collides(currentPiece, 0, 0, rotated)) {
      currentPiece.shape = rotated;
    }
  } else {
    return;
  }

  event.preventDefault();
}

function update(time = 0) {
  const delta = time - lastTime;
  const deltaSeconds = Math.min(0.05, delta / 1000);
  lastTime = time;

  if (!gameOver) {
    dropCounter += delta;
    if (dropCounter >= dropInterval) {
      moveDown();
      dropCounter = 0;
    }
  }

  drawBoard();
  drawLineClearParticles(deltaSeconds);
  if (gameOver) {
    animationFrameId = null;
    return;
  }

  animationFrameId = requestAnimationFrame(update);
}

function restartGame() {
  stopGameLoop();
  board = createBoard();
  score = 0;
  lines = 0;
  updateLevelFromLines();
  gameOver = false;
  dropCounter = 0;
  lastTime = 0;
  clearParticles.length = 0;
  highScore = loadHighScore();
  updateStats();
  if (gameOverOverlayElement) {
    gameOverOverlayElement.classList.add("hidden");
  }
  spawnPiece();
  startGameLoop();
}

window.addEventListener("keydown", handleKeyDown);
window.addEventListener("pointerdown", unlockAudio, { once: true });
if (muteToggleButton) {
  muteToggleButton.addEventListener("click", async () => {
    await unlockAudio();
    setMuteState(!isMuted);
  });
}
if (restartButton) {
  restartButton.addEventListener("click", restartGame);
}

setMuteState(false);
initFallingDecor();
restartGame();
