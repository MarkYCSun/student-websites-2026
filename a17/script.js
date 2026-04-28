/**
 * Tetris — canvas game with audio, dinosaur bonus, high scores, levels.
 * Extend by tweaking CONFIG and hooking new piece types in SHAPES.
 */

const CONFIG = {
  cols: 10,
  rows: 22,
  hiddenRows: 2,
  cell: 30,
  pointsPerLevel: 500,
  /** Base points for 1–4 lines in one clear (Nintendo-style). Index = line count. */
  lineClearBaseScores: [0, 100, 300, 500, 800],
  /** Gravity at level 1 (ms between drops); lower = faster. */
  baseDropMs: 420,
  minDropMs: 52,
  dropStepMs: 36,
  /** Every time total score crosses a multiple of this (200, 400, …), chaos bonus runs. */
  chaosMilestoneInterval: 200,
  /** How long line clears are worth double points. */
  chaosBonusDurationMs: 60_000,
  /** Center “BONUS TIME” label (ms); chaos double-score uses chaosBonusDurationMs. */
  chaosDinoVisibleMs: 3000,
  chaosScoreMultiplier: 2,
  /** Green blink on full rows (ms). */
  lineClearBlinkMs: 320,
  /** Dinosaur falls to cleared rows, eats right → left, exits left (ms each). */
  lineClearDinoDropMs: 520,
  lineClearDinoEatMs: 1100,
  lineClearDinoExitMs: 420,
  /** Cap gravity steps per frame so holding ↓ cannot freeze the tab. */
  dropMaxStepsPerFrame: 22,
  storageKey: "tetrisHighScoresV1",
};

const COLORS = [
  null,
  "#00e5ff",
  "#7c4dff",
  "#ff9100",
  "#ffea00",
  "#00e676",
  "#e040fb",
  "#ff1744",
];

const SHAPES = {
  I: [
    [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    [
      [0, 0, 1, 0],
      [0, 0, 1, 0],
      [0, 0, 1, 0],
      [0, 0, 1, 0],
    ],
    [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
    ],
    [
      [0, 1, 0, 0],
      [0, 1, 0, 0],
      [0, 1, 0, 0],
      [0, 1, 0, 0],
    ],
  ],
  J: [
    [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 1, 1],
      [0, 1, 0],
      [0, 1, 0],
    ],
    [
      [0, 0, 0],
      [1, 1, 1],
      [0, 0, 1],
    ],
    [
      [0, 1, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  ],
  L: [
    [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 1],
    ],
    [
      [0, 0, 0],
      [1, 1, 1],
      [1, 0, 0],
    ],
    [
      [1, 1, 0],
      [0, 1, 0],
      [0, 1, 0],
    ],
  ],
  O: [
    [
      [1, 1],
      [1, 1],
    ],
  ],
  S: [
    [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    [
      [0, 1, 0],
      [0, 1, 1],
      [0, 0, 1],
    ],
    [
      [0, 0, 0],
      [0, 1, 1],
      [1, 1, 0],
    ],
    [
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ],
  ],
  T: [
    [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 1, 0],
      [0, 1, 1],
      [0, 1, 0],
    ],
    [
      [0, 0, 0],
      [1, 1, 1],
      [0, 1, 0],
    ],
    [
      [0, 1, 0],
      [1, 1, 0],
      [0, 1, 0],
    ],
  ],
  Z: [
    [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    [
      [0, 0, 0],
      [1, 1, 0],
      [0, 1, 1],
    ],
    [
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
  ],
};

const TYPE_ORDER = ["I", "J", "L", "O", "S", "T", "Z"];
const TYPE_TO_ID = { I: 1, J: 2, L: 3, O: 4, S: 5, T: 6, Z: 7 };

function baseLineClearPoints(lineCount) {
  const t = CONFIG.lineClearBaseScores;
  if (lineCount <= 0) return 0;
  return t[Math.min(lineCount, 4)];
}

function lineClearAnimTotalMs() {
  return (
    CONFIG.lineClearBlinkMs +
    CONFIG.lineClearDinoDropMs +
    CONFIG.lineClearDinoEatMs +
    CONFIG.lineClearDinoExitMs
  );
}

function getLineClearAnimPhase(elapsed) {
  let e = elapsed;
  const b = CONFIG.lineClearBlinkMs;
  if (e < b) return { phase: "blink", u: e / b };
  e -= b;
  const d = CONFIG.lineClearDinoDropMs;
  if (e < d) return { phase: "drop", u: e / d };
  e -= d;
  const eat = CONFIG.lineClearDinoEatMs;
  if (e < eat) return { phase: "eat", u: e / eat };
  e -= eat;
  const x = CONFIG.lineClearDinoExitMs;
  if (e < x) return { phase: "exit", u: e / x };
  return { phase: "done", u: 1 };
}

function createBag() {
  const bag = [...TYPE_ORDER];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

/** Web Audio: BGM + SFX with master gain and ducking so SFX do not blast. */
class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.enabled = true;
    this.bgmTimer = null;
    this.step = 0;
  }

  ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.12;
    this.bgmGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.45;
    this.sfxGain.connect(this.master);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.stopBgm();
    else if (this.ctx && this.ctx.state === "running") this.startBgm();
  }

  resume() {
    this.ensure();
    if (this.ctx.state === "suspended") return this.ctx.resume();
    return Promise.resolve();
  }

  beep(freq, duration, type = "sine", peak = 0.35) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  playPlace() {
    this.beep(180, 0.06, "triangle", 0.28);
  }

  playLineClear(lines) {
    const base = 320 + lines * 90;
    this.beep(base, 0.08, "square", 0.32);
    setTimeout(() => {
      if (this.enabled) this.beep(base + 140, 0.1, "square", 0.26);
    }, 70);
  }

  playGameOver() {
    this.beep(140, 0.2, "sawtooth", 0.25);
    setTimeout(() => {
      if (this.enabled) this.beep(90, 0.35, "sawtooth", 0.22);
    }, 160);
  }

  playLevelUp() {
    if (!this.enabled || !this.ctx) return;
    const freqs = [392, 494, 587, 784];
    freqs.forEach((f, i) => {
      setTimeout(() => this.beep(f, 0.11, "sine", 0.34), i * 85);
    });
  }

  playDino() {
    this.beep(95, 0.15, "triangle", 0.4);
    setTimeout(() => {
      if (this.enabled) this.beep(70, 0.2, "triangle", 0.35);
    }, 120);
  }

  /** Short growl when the line-clear dinosaur starts eating. */
  playDinoRoar() {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime;
    const dur = 0.52;
    const sr = this.ctx.sampleRate;
    const n = Math.floor(sr * dur);
    const buf = this.ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const env = (1 - i / n) ** 0.6;
      d[i] = (Math.random() * 2 - 1) * env * 0.85;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(420, t0);
    bp.frequency.exponentialRampToValueAtTime(90, t0 + dur);
    bp.Q.setValueAtTime(0.7, t0);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.52, t0 + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.08);
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(95, t0);
    osc.frequency.exponentialRampToValueAtTime(45, t0 + dur * 0.85);
    og.gain.setValueAtTime(0.0001, t0);
    og.gain.exponentialRampToValueAtTime(0.12, t0 + 0.06);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(og);
    og.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  startBgm() {
    if (!this.enabled || !this.ctx) return;
    this.stopBgm();
    const loop = () => {
      if (!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime;
      const scale = [0, 2, 4, 7, 9, 12, 14, 16];
      const n = scale[this.step % scale.length];
      const f = 220 * 2 ** (n / 12);
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(g);
      g.connect(this.bgmGain);
      osc.start(t);
      osc.stop(t + 0.25);
      this.step++;
    };
    loop();
    this.bgmTimer = setInterval(loop, 300);
  }

  stopBgm() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}

const audio = new GameAudio();

let canvas;
let ctx;
let board;
let piece;
let bag;
let score;
let linesCleared;
let level;
let dropMs;
let lastTick;
let accumulator;
let running = false;
let gameOver = false;
/** When chaos bonus ends (performance.now()). 0 = inactive. */
let chaosActiveUntil = 0;
/** Center “BONUS TIME” label visible until this time (performance.now()). */
let chaosDinoVisibleUntil = 0;
/** During line clear: { rows: number[], start: number } board row indices, sorted high→low. */
let lineClearAnim = null;
let keysDown;
let levelToastTimer = null;
let boardBgGradient = null;

function emptyBoard() {
  return Array.from({ length: CONFIG.rows }, () =>
    Array(CONFIG.cols).fill(0),
  );
}

function padMatrix(m) {
  const size = 4;
  const grid = Array.from({ length: size }, () => Array(size).fill(0));
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m[r].length; c++) {
      grid[r][c] = m[r][c];
    }
  }
  return grid;
}

function getMatrices(type) {
  const raw = SHAPES[type];
  return raw.map((m) => padMatrix(m));
}

function matrixFor(p) {
  const mats = getMatrices(p.type);
  const rots = mats.length;
  return mats[p.rot % rots];
}

function eachBlock(p, fn) {
  const m = matrixFor(p);
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m[r].length; c++) {
      if (m[r][c]) fn(p.x + c, p.y + r);
    }
  }
}

function collides(p, ox = 0, oy = 0, rotDelta = 0) {
  const test = {
    type: p.type,
    x: p.x + ox,
    y: p.y + oy,
    rot: p.rot + rotDelta,
  };
  const mats = getMatrices(test.type);
  test.rot = ((test.rot % mats.length) + mats.length) % mats.length;
  const m = matrixFor(test);
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m[r].length; c++) {
      if (!m[r][c]) continue;
      const x = test.x + c;
      const y = test.y + r;
      if (x < 0 || x >= CONFIG.cols || y >= CONFIG.rows) return true;
      if (y >= 0 && board[y][x]) return true;
    }
  }
  return false;
}

function spawnPiece() {
  if (!bag.length) bag = createBag();
  const type = bag.pop();
  const mats = getMatrices(type);
  const m = mats[0];
  let minC = CONFIG.cols;
  let maxC = 0;
  let minR = 4;
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m[r].length; c++) {
      if (m[r][c]) {
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
        minR = Math.min(minR, r);
      }
    }
  }
  const width = maxC - minC + 1;
  const spawnX = Math.floor((CONFIG.cols - width) / 2) - minC;
  const spawnY = -minR;
  piece = { type, x: spawnX, y: spawnY, rot: 0 };
  if (collides(piece)) {
    gameOver = true;
    audio.stopBgm();
    audio.playGameOver();
    showGameOver();
  }
}

function lockPiece() {
  const id = TYPE_TO_ID[piece.type];
  eachBlock(piece, (x, y) => {
    if (y >= 0 && y < CONFIG.rows && x >= 0 && x < CONFIG.cols) {
      board[y][x] = id;
    }
  });
  audio.playPlace();
}

function findFullRowIndicesSortedDesc() {
  const full = [];
  for (let r = CONFIG.hiddenRows; r < CONFIG.rows; r++) {
    if (board[r].every((cell) => cell > 0)) full.push(r);
  }
  return full.sort((a, b) => b - a);
}

function beginLineClearsOrSpawn() {
  piece = null;
  const full = findFullRowIndicesSortedDesc();
  if (full.length) {
    lineClearAnim = {
      rows: full.slice(),
      start: performance.now(),
      roarPlayed: false,
    };
  } else {
    spawnPiece();
  }
}

function finalizeLineClear(rowsDescending) {
  if (!rowsDescending.length) return;

  for (const r of rowsDescending) {
    board.splice(r, 1);
    board.unshift(Array(CONFIG.cols).fill(0));
  }

  audio.playLineClear(rowsDescending.length);

  const n = rowsDescending.length;
  const lvBefore = level;
  const oldScore = score;
  const mult = isChaosBonusActive() ? CONFIG.chaosScoreMultiplier : 1;
  const pts = baseLineClearPoints(n) * mult;
  score += pts;
  linesCleared += n;
  updateLevelFromScore();
  const leveledUp = level > lvBefore;
  maybeStartChaosFromScoreIncrease(oldScore, score, leveledUp);
  updateHud();
  refreshChaosBonusUi();

  spawnPiece();
}

function isChaosBonusActive(at = performance.now()) {
  return at < chaosActiveUntil;
}

function maybeStartChaosFromScoreIncrease(
  oldScore,
  newScore,
  skipChaosDino = false,
) {
  const step = CONFIG.chaosMilestoneInterval;
  const prevBracket = Math.floor(oldScore / step);
  const nextBracket = Math.floor(newScore / step);
  if (nextBracket <= prevBracket) return;
  chaosActiveUntil = performance.now() + CONFIG.chaosBonusDurationMs;
  if (!skipChaosDino) {
    chaosDinoVisibleUntil = performance.now() + CONFIG.chaosDinoVisibleMs;
    audio.playDino();
  }
}

function updateLevelFromScore() {
  const next = 1 + Math.floor(score / CONFIG.pointsPerLevel);
  if (next <= level) return;
  level = next;
  dropMs = Math.max(
    CONFIG.minDropMs,
    CONFIG.baseDropMs - (level - 1) * CONFIG.dropStepMs,
  );
  flashLevelBanner(level);
  audio.playLevelUp();
}

function flashLevelBanner(newLevel) {
  const wrap = document.getElementById("levelToast");
  const inner = wrap?.querySelector(".level-toast__inner");
  const numEl = document.getElementById("levelToastNum");
  if (!wrap || !inner || !numEl) return;
  numEl.textContent = String(newLevel);
  wrap.classList.add("is-visible");
  inner.classList.remove("level-pop");
  void inner.offsetWidth;
  inner.classList.add("level-pop");
  if (levelToastTimer) clearTimeout(levelToastTimer);
  levelToastTimer = setTimeout(() => {
    wrap.classList.remove("is-visible");
    inner.classList.remove("level-pop");
  }, 2100);
}

function tryMove(dx, dy) {
  if (!piece || gameOver) return false;
  if (!collides(piece, dx, dy)) {
    piece.x += dx;
    piece.y += dy;
    return true;
  }
  return false;
}

function tryRotate() {
  if (!piece || gameOver) return;
  const kicks = [0, -1, 1, -2, 2];
  for (const k of kicks) {
    if (!collides(piece, k, 0, 1)) {
      piece.x += k;
      piece.rot += 1;
      return;
    }
  }
}

function hardDrop() {
  if (!piece || gameOver || lineClearAnim) return;
  while (tryMove(0, 1)) continue;
  lockPiece();
  beginLineClearsOrSpawn();
  accumulator = 0;
  updateHud();
}

function softDropStep() {
  if (!piece || gameOver || lineClearAnim) return;
  if (!tryMove(0, 1)) {
    lockPiece();
    beginLineClearsOrSpawn();
    accumulator = 0;
  }
  updateHud();
}

function tickDrop(dt) {
  if (!running || gameOver || lineClearAnim) return;
  accumulator += dt;
  const mult = keysDown.has("ArrowDown") ? 12 : 1;
  let steps = 0;
  while (
    steps < CONFIG.dropMaxStepsPerFrame &&
    accumulator >= dropMs / mult
  ) {
    accumulator -= dropMs / mult;
    softDropStep();
    steps += 1;
    if (gameOver) break;
  }
}

function refreshChaosBonusUi(now = performance.now()) {
  const chaosOn = now < chaosActiveUntil;
  const dinoOn = now < chaosDinoVisibleUntil;
  const layer = document.getElementById("dinosaurLayer");
  const cd = document.getElementById("chaosCountdown");
  const badge = document.getElementById("chaosBadge");

  if (dinoOn) {
    layer?.classList.add("is-visible");
    layer?.setAttribute("aria-hidden", "false");
  } else {
    layer?.classList.remove("is-visible");
    layer?.setAttribute("aria-hidden", "true");
  }

  if (chaosOn) {
    if (cd) {
      cd.hidden = false;
      const sec = Math.max(0, Math.ceil((chaosActiveUntil - now) / 1000));
      cd.textContent = `${sec}s left`;
    }
    if (badge) badge.hidden = false;
  } else {
    if (cd) cd.hidden = true;
    if (badge) badge.hidden = true;
    chaosDinoVisibleUntil = 0;
  }
}

function draw() {
  const { cols, rows, cell, hiddenRows } = CONFIG;
  ctx.fillStyle = boardBgGradient || "#14082c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const clearSet =
    lineClearAnim && lineClearAnim.rows.length
      ? new Set(lineClearAnim.rows)
      : null;
  const elapsed = lineClearAnim ? performance.now() - lineClearAnim.start : 0;
  const ph = lineClearAnim ? getLineClearAnimPhase(elapsed) : null;

  let colsHideRight = 0;
  if (clearSet && ph) {
    if (ph.phase === "eat") {
      colsHideRight = Math.min(cols, Math.floor(ph.u * cols));
    } else if (ph.phase === "exit") {
      colsHideRight = cols;
    }
  }

  for (let r = hiddenRows; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (clearSet?.has(r) && c >= cols - colsHideRight) continue;
      const id = board[r][c];
      const x = c * cell;
      const y = (r - hiddenRows) * cell;
      if (id) {
        ctx.fillStyle = COLORS[id];
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      }
    }
  }

  if (lineClearAnim && ph?.phase === "blink") {
    const pulse = Math.sin((elapsed / CONFIG.lineClearBlinkMs) * Math.PI);
    const alpha = 0.28 + 0.55 * pulse;
    ctx.fillStyle = `rgba(0, 230, 120, ${alpha})`;
    for (const br of lineClearAnim.rows) {
      if (br < hiddenRows) continue;
      const y = (br - hiddenRows) * cell;
      ctx.fillRect(0, y, cols * cell, cell);
    }
  }

  if (lineClearAnim && ph && ph.phase !== "blink" && ph.phase !== "done") {
    const rows = lineClearAnim.rows;
    const yVis = rows
      .filter((br) => br >= hiddenRows)
      .map((br) => (br - hiddenRows) * cell + cell / 2);
    if (yVis.length) {
      const yDino = (Math.min(...yVis) + Math.max(...yVis)) / 2;
      const easeOut = (t) => 1 - (1 - t) * (1 - t);
      const w = cols * cell;
      let x;
      let y;
      if (ph.phase === "drop") {
        const u = easeOut(ph.u);
        y = -40 + u * (yDino + 40);
        x = w / 2;
      } else if (ph.phase === "eat") {
        const gone = Math.min(cols, Math.floor(ph.u * cols));
        x = w - gone * cell - cell * 0.35;
        y = yDino;
      } else {
        const startX = cell * 0.45;
        x = startX - ph.u * (startX + w * 0.35);
        y = yDino;
      }
      const fs = Math.round(cell * 1.35);
      ctx.font = `${fs}px "Segoe UI Emoji","Apple Color Emoji",sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🦖", x, y);
    }
  }

  if (piece && !gameOver) {
    eachBlock(piece, (bx, by) => {
      if (by < hiddenRows) return;
      const x = bx * cell;
      const y = (by - hiddenRows) * cell;
      const id = TYPE_TO_ID[piece.type];
      ctx.fillStyle = COLORS[id];
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    });
  }
}

function updateHud() {
  document.getElementById("score").textContent = String(score);
  document.getElementById("level").textContent = String(level);
  document.getElementById("lines").textContent = String(linesCleared);
  const hint = document.getElementById("nextLevelHint");
  if (hint) {
    const nextAt = level * CONFIG.pointsPerLevel;
    hint.textContent = `Next level at ${nextAt} pts`;
  }
}

function loadScores() {
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveScores(list) {
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(list));
}

function renderHighScores() {
  const ol = document.getElementById("highScores");
  const list = loadScores()
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  ol.innerHTML = "";
  if (!list.length) {
    const li = document.createElement("li");
    li.textContent = "No scores yet";
    ol.appendChild(li);
    return;
  }
  for (const row of list) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = row.name || "Player";
    const pts = document.createElement("span");
    pts.className = "pts";
    pts.textContent = String(row.score);
    li.appendChild(name);
    li.appendChild(pts);
    ol.appendChild(li);
  }
}

function showGameOver() {
  running = false;
  chaosActiveUntil = 0;
  chaosDinoVisibleUntil = 0;
  lineClearAnim = null;
  refreshChaosBonusUi();
  const wrap = document.getElementById("levelToast");
  if (wrap) {
    wrap.classList.remove("is-visible");
    const inner = wrap.querySelector(".level-toast__inner");
    if (inner) inner.classList.remove("level-pop");
  }
  if (levelToastTimer) {
    clearTimeout(levelToastTimer);
    levelToastTimer = null;
  }
  document.getElementById("finalScore").textContent = String(score);
  const go = document.getElementById("gameOverScreen");
  go.hidden = false;
  const input = document.getElementById("nameInput");
  input.value = "";
  input.focus();
}

function hideGameOver() {
  document.getElementById("gameOverScreen").hidden = true;
}

function showStart() {
  document.getElementById("startScreen").hidden = false;
}

function hideStart() {
  document.getElementById("startScreen").hidden = true;
}

function resetGame() {
  board = emptyBoard();
  bag = createBag();
  piece = null;
  score = 0;
  linesCleared = 0;
  level = 1;
  dropMs = CONFIG.baseDropMs;
  lastTick = performance.now();
  accumulator = 0;
  gameOver = false;
  chaosActiveUntil = 0;
  chaosDinoVisibleUntil = 0;
  lineClearAnim = null;
  keysDown = new Set();
  spawnPiece();
  updateHud();
  refreshChaosBonusUi();
}

function loop(now) {
  if (running && !gameOver) {
    const dt = now - lastTick;
    lastTick = now;

    if (lineClearAnim) {
      const eatStart =
        CONFIG.lineClearBlinkMs + CONFIG.lineClearDinoDropMs;
      if (
        !lineClearAnim.roarPlayed &&
        now - lineClearAnim.start >= eatStart
      ) {
        lineClearAnim.roarPlayed = true;
        audio.playDinoRoar();
      }
      if (now - lineClearAnim.start >= lineClearAnimTotalMs()) {
        finalizeLineClear(lineClearAnim.rows);
        lineClearAnim = null;
      }
    } else {
      tickDrop(dt);
    }

    refreshChaosBonusUi(now);
  } else {
    lastTick = now;
  }

  draw();
  requestAnimationFrame(loop);
}

function startGame() {
  hideStart();
  hideGameOver();
  const soundOn = document.getElementById("soundToggle").checked;
  audio.enabled = soundOn;
  resetGame();
  running = true;
  audio.ensure();
  audio.resume().then(() => {
    if (audio.enabled) audio.startBgm();
  });
}

function bindUi() {
  document.getElementById("btnPlay").addEventListener("click", () => {
    startGame();
  });

  document.getElementById("soundToggle").addEventListener("change", (e) => {
    audio.ensure();
    audio.setEnabled(e.target.checked);
    if (e.target.checked && running && !gameOver) {
      audio.resume().then(() => audio.startBgm());
    }
  });

  document.getElementById("btnSaveScore").addEventListener("click", () => {
    const name =
      document.getElementById("nameInput").value.trim() || "Player";
    const list = loadScores();
    list.push({ name: name.slice(0, 16), score });
    list.sort((a, b) => b.score - a.score);
    saveScores(list.slice(0, 50));
    renderHighScores();
    hideGameOver();
    showStart();
  });

  document.getElementById("btnRestart").addEventListener("click", () => {
    hideGameOver();
    startGame();
  });
}

function bindKeys() {
  window.addEventListener("keydown", (e) => {
    if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
    }
    if (!running || gameOver || lineClearAnim) return;

    if (e.key === "ArrowLeft") tryMove(-1, 0);
    else if (e.key === "ArrowRight") tryMove(1, 0);
    else if (e.key === "ArrowUp") tryRotate();
    else if (e.key === "ArrowDown") keysDown.add("ArrowDown");

    if (e.key === " ") {
      e.preventDefault();
      hardDrop();
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowDown") keysDown.delete("ArrowDown");
  });
}

function init() {
  canvas = document.getElementById("board");
  ctx = canvas.getContext("2d");
  canvas.width = CONFIG.cols * CONFIG.cell;
  canvas.height = (CONFIG.rows - CONFIG.hiddenRows) * CONFIG.cell;
  boardBgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  boardBgGradient.addColorStop(0, "#1a0a32");
  boardBgGradient.addColorStop(1, "#0a1628");

  renderHighScores();
  bindUi();
  bindKeys();
  resetGame();
  requestAnimationFrame((t) => {
    lastTick = t;
    loop(t);
  });
}

init();
