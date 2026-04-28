const COLS = 10;
const ROWS = 20;
const BLOCK = 30;
const BOARD_W = COLS * BLOCK;
const BOARD_H = ROWS * BLOCK;

const SHAPES = {
  I: [[1, 1, 1, 1]],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
  ],
};

const COLORS = ["#5fd4ff", "#ffd86f", "#c690ff", "#7cffa2", "#ff7ca8", "#7ca4ff", "#ffa77c"];
const PIECE_KEYS = Object.keys(SHAPES);

const SCORE_LINES = [0, 100, 300, 500, 800];
const CELEBRATION_SCORE_STEP = 100;
const DINO_RUN_SCORE_STEP = 150;
/** Easier pacing: slower base drop, gentler speed-ups, levels rise less often */
const LINES_PER_LEVEL = 14;
const BASE_DROP_MS = 1200;
const MIN_DROP_MS = 160;
const LEVEL_SPEED_CUT_PER_LEVEL = 40;
const SCORE_SPEED_CUT_PER_100 = 3;
const PREVIEW_BLOCK = 22;
const PREVIEW_PAD = 120;
const LEADERBOARD_KEY = "dino_tetris_leaderboard_v1";

function pieceFromKey(key) {
  const idx = PIECE_KEYS.indexOf(key);
  return {
    shape: SHAPES[key].map((r) => [...r]),
    color: COLORS[Math.max(0, idx)],
    x: 3,
    y: 0,
  };
}

function parseHexColor(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 100, g: 120, b: 160 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function mixChannel(c, delta) {
  return Math.max(0, Math.min(255, Math.round(c + delta)));
}

function drawGemBlock(ctx, px, py, size, colorHex) {
  const w = size - 1;
  const h = size - 1;
  const r = Math.max(2, Math.min(6, Math.floor(size * 0.2)));
  const base = parseHexColor(colorHex);
  const light = `rgb(${mixChannel(base.r, 48)}, ${mixChannel(base.g, 48)}, ${mixChannel(base.b, 48)})`;
  const dark = `rgb(${mixChannel(base.r, -52)}, ${mixChannel(base.g, -52)}, ${mixChannel(base.b, -52)})`;
  const grad = ctx.createLinearGradient(px, py, px + w, py + h);
  grad.addColorStop(0, light);
  grad.addColorStop(0.42, colorHex);
  grad.addColorStop(1, dark);
  ctx.beginPath();
  ctx.moveTo(px + r, py);
  ctx.lineTo(px + w - r, py);
  ctx.quadraticCurveTo(px + w, py, px + w, py + r);
  ctx.lineTo(px + w, py + h - r);
  ctx.quadraticCurveTo(px + w, py + h, px + w - r, py + h);
  ctx.lineTo(px + r, py + h);
  ctx.quadraticCurveTo(px, py + h, px, py + h - r);
  ctx.lineTo(px, py + r);
  ctx.quadraticCurveTo(px, py, px + r, py);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.38)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(px + r, py);
  ctx.lineTo(px + w - r, py);
  ctx.quadraticCurveTo(px + w, py, px + w, py + r);
  ctx.lineTo(px + w, py + h - r);
  ctx.quadraticCurveTo(px + w, py + h, px + w - r, py + h);
  ctx.lineTo(px + r, py + h);
  ctx.quadraticCurveTo(px, py + h, px, py + h - r);
  ctx.lineTo(px, py + r);
  ctx.quadraticCurveTo(px, py, px + r, py);
  ctx.closePath();
  ctx.clip();
  const shine = ctx.createLinearGradient(px, py, px + w * 0.55, py + h * 0.4);
  shine.addColorStop(0, "rgba(255,255,255,0.42)");
  shine.addColorStop(0.45, "rgba(255,255,255,0.08)");
  shine.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = shine;
  ctx.fillRect(px, py, w, h * 0.5);
  ctx.restore();
}

function drawShapeInPreview(ctx, shape, color, w, h, blockSize) {
  const rows = shape.length;
  const cols = shape[0].length;
  const ox = (w - cols * blockSize) / 2;
  const oy = (h - rows * blockSize) / 2;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (!shape[y][x]) continue;
      drawGemBlock(ctx, ox + x * blockSize, oy + y * blockSize, blockSize, color);
    }
  }
}

function buildShuffledBag() {
  const bag = [...PIECE_KEYS];
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

function rotate(shape) {
  const nRows = shape.length;
  const nCols = shape[0].length;
  const out = [];
  for (let x = 0; x < nCols; x += 1) {
    const row = [];
    for (let y = nRows - 1; y >= 0; y -= 1) row.push(shape[y][x]);
    out.push(row);
  }
  return out;
}

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.compressor = null;
    this.musicTimer = null;
    this.beat = 0;
    this.enabled = true;
  }

  ensureContext() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.compressor = this.ctx.createDynamicsCompressor();

    this.master.gain.value = 0.8;
    this.musicGain.gain.value = 0.22;
    this.sfxGain.gain.value = 0.5;
    this.compressor.threshold.value = -22;
    this.compressor.knee.value = 16;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.01;
    this.compressor.release.value = 0.3;

    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.master.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);
  }

  startMusic() {
    if (!this.enabled) return;
    this.ensureContext();
    if (this.musicTimer) return;
    const bpm = 110;
    const beatDur = (60 / bpm) * 1000;
    this.musicTimer = setInterval(() => {
      this.playBeat();
    }, beatDur);
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      this.stopMusic();
    } else {
      this.startMusic();
    }
  }

  playTone(freq, dur, gainNode, type = "sine") {
    if (!this.enabled) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(0.35, now + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(amp);
    amp.connect(gainNode);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  playBeat() {
    if (!this.enabled) return;
    const seq = [196, 220, 247, 262, 247, 220, 196, 165];
    const bass = [98, 98, 110, 110, 123, 123, 110, 98];
    const i = this.beat % seq.length;
    this.playTone(seq[i], 0.16, this.musicGain, "triangle");
    this.playTone(bass[i], 0.2, this.musicGain, "square");
    this.beat += 1;
  }

  lineClear() {
    this.playTone(440, 0.09, this.sfxGain, "square");
    this.playTone(660, 0.11, this.sfxGain, "triangle");
  }

  levelUp() {
    this.playTone(523, 0.1, this.sfxGain, "square");
    this.playTone(659, 0.1, this.sfxGain, "square");
    this.playTone(784, 0.14, this.sfxGain, "triangle");
  }

  dinoBonus() {
    this.playTone(180, 0.25, this.sfxGain, "sawtooth");
    this.playTone(120, 0.34, this.sfxGain, "sawtooth");
    this.playTone(260, 0.2, this.sfxGain, "square");
  }

  celebration() {
    this.playTone(784, 0.08, this.sfxGain, "triangle");
    this.playTone(988, 0.08, this.sfxGain, "triangle");
    this.playTone(1175, 0.12, this.sfxGain, "square");
  }

  /** Silly slide-whistle + boings while the runner crosses the screen */
  dinoRunFunny() {
    if (!this.enabled) return;
    this.ensureContext();
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const g = this.sfxGain;

    const slide = (start, end, tStart, dur) => {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(start, t0 + tStart);
      osc.frequency.exponentialRampToValueAtTime(end, t0 + tStart + dur);
      amp.gain.setValueAtTime(0.0001, t0 + tStart);
      amp.gain.exponentialRampToValueAtTime(0.22, t0 + tStart + 0.04);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + tStart + dur);
      osc.connect(amp);
      amp.connect(g);
      osc.start(t0 + tStart);
      osc.stop(t0 + tStart + dur + 0.02);
    };

    const boing = (freq, tStart) => {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, t0 + tStart);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.55, t0 + tStart + 0.07);
      amp.gain.setValueAtTime(0.0001, t0 + tStart);
      amp.gain.exponentialRampToValueAtTime(0.18, t0 + tStart + 0.01);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + tStart + 0.09);
      osc.connect(amp);
      amp.connect(g);
      osc.start(t0 + tStart);
      osc.stop(t0 + tStart + 0.1);
    };

    const squeak = (freq, tStart) => {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, t0 + tStart);
      amp.gain.setValueAtTime(0.0001, t0 + tStart);
      amp.gain.exponentialRampToValueAtTime(0.12, t0 + tStart + 0.02);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + tStart + 0.06);
      osc.connect(amp);
      amp.connect(g);
      osc.start(t0 + tStart);
      osc.stop(t0 + tStart + 0.08);
    };

    slide(220, 720, 0, 0.32);
    boing(380, 0.28);
    squeak(520, 0.45);
    slide(600, 180, 0.55, 0.25);
    boing(290, 0.82);
    squeak(640, 1.0);
    boing(420, 1.25);
    slide(300, 880, 1.45, 0.35);
    squeak(700, 1.85);
    boing(350, 2.15);
  }

  /** Classic cartoon chase-cartoon sting: xylophone run, boings, slide whistle, “wah-wah”, crash */
  gameOverCartoonFunny() {
    if (!this.enabled) return;
    this.ensureContext();
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const g = this.sfxGain;

    const pluck = (freq, tStart, dur = 0.06) => {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t0 + tStart);
      amp.gain.setValueAtTime(0.0001, t0 + tStart);
      amp.gain.exponentialRampToValueAtTime(0.2, t0 + tStart + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + tStart + dur);
      osc.connect(amp);
      amp.connect(g);
      osc.start(t0 + tStart);
      osc.stop(t0 + tStart + dur + 0.02);
    };

    const boing = (f0, f1, tStart) => {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f0, t0 + tStart);
      osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 50), t0 + tStart + 0.18);
      amp.gain.setValueAtTime(0.0001, t0 + tStart);
      amp.gain.exponentialRampToValueAtTime(0.22, t0 + tStart + 0.02);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + tStart + 0.22);
      osc.connect(amp);
      amp.connect(g);
      osc.start(t0 + tStart);
      osc.stop(t0 + tStart + 0.26);
    };

    const slide = (f0, f1, tStart, dur) => {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f0, t0 + tStart);
      osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 30), t0 + tStart + dur);
      amp.gain.setValueAtTime(0.0001, t0 + tStart);
      amp.gain.exponentialRampToValueAtTime(0.18, t0 + tStart + 0.04);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + tStart + dur);
      osc.connect(amp);
      amp.connect(g);
      osc.start(t0 + tStart);
      osc.stop(t0 + tStart + dur + 0.03);
    };

    const wahWah = (tStart) => {
      const osc = ctx.createOscillator();
      const filt = ctx.createBiquadFilter();
      const amp = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(180, t0 + tStart);
      osc.frequency.linearRampToValueAtTime(120, t0 + tStart + 0.35);
      filt.type = "bandpass";
      filt.frequency.setValueAtTime(400, t0 + tStart);
      filt.frequency.exponentialRampToValueAtTime(200, t0 + tStart + 0.35);
      filt.Q.value = 2;
      amp.gain.setValueAtTime(0.0001, t0 + tStart);
      amp.gain.exponentialRampToValueAtTime(0.14, t0 + tStart + 0.05);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + tStart + 0.4);
      osc.connect(filt);
      filt.connect(amp);
      amp.connect(g);
      osc.start(t0 + tStart);
      osc.stop(t0 + tStart + 0.42);
    };

    const cymbalCrash = (tStart) => {
      const len = Math.floor(ctx.sampleRate * 0.35);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) {
        ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.08));
      }
      const src = ctx.createBufferSource();
      const filt = ctx.createBiquadFilter();
      const amp = ctx.createGain();
      src.buffer = buf;
      filt.type = "highpass";
      filt.frequency.value = 900;
      amp.gain.setValueAtTime(0.0001, t0 + tStart);
      amp.gain.exponentialRampToValueAtTime(0.2, t0 + tStart + 0.02);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + tStart + 0.32);
      src.connect(filt);
      filt.connect(amp);
      amp.connect(g);
      src.start(t0 + tStart);
      src.stop(t0 + tStart + 0.36);
    };

    const xylo = [523, 587, 659, 784, 880];
    xylo.forEach((f, i) => pluck(f, i * 0.07, 0.07));
    boing(520, 180, 0.42);
    slide(720, 160, 0.62, 0.28);
    pluck(990, 0.95, 0.05);
    pluck(880, 1.02, 0.05);
    wahWah(1.12);
    boing(380, 95, 1.55);
    slide(480, 90, 1.82, 0.4);
    cymbalCrash(2.28);
    pluck(659, 2.58, 0.12);
  }
}

class TetrisGame {
  constructor(canvas, statsEl, isRemote = false, previewCanvas = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.statsEl = statsEl;
    this.isRemote = isRemote;
    this.previewCanvas = previewCanvas;
    this.previewCtx = previewCanvas ? previewCanvas.getContext("2d") : null;
    this.remoteNextKey = null;
    this.reset();
  }

  reset() {
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.bag = [];
    this.piece = this.takePiece();
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.gameOver = false;
    this.dropInterval = BASE_DROP_MS;
    this.dropAccumulator = 0;
    this.lastMilestone = 0;
    this.nextCelebrationScore = CELEBRATION_SCORE_STEP;
    this.nextDinoRunScore = DINO_RUN_SCORE_STEP;
    this.dinoTicks = 0;
    this.updateSpeed();
    this.render();
  }

  collision(offsetX = 0, offsetY = 0, shape = this.piece.shape) {
    for (let y = 0; y < shape.length; y += 1) {
      for (let x = 0; x < shape[y].length; x += 1) {
        if (!shape[y][x]) continue;
        const bx = this.piece.x + x + offsetX;
        const by = this.piece.y + y + offsetY;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && this.board[by][bx]) return true;
      }
    }
    return false;
  }

  mergePiece() {
    const { shape, color } = this.piece;
    for (let y = 0; y < shape.length; y += 1) {
      for (let x = 0; x < shape[y].length; x += 1) {
        if (!shape[y][x]) continue;
        const by = this.piece.y + y;
        const bx = this.piece.x + x;
        if (by >= 0) this.board[by][bx] = color;
      }
    }
  }

  clearLines() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y -= 1) {
      if (this.board[y].every(Boolean)) {
        this.board.splice(y, 1);
        this.board.unshift(Array(COLS).fill(null));
        cleared += 1;
        y += 1;
      }
    }
    if (!cleared) return 0;
    this.lines += cleared;
    this.score += SCORE_LINES[cleared] * this.level;
    const prevLevel = this.level;
    this.level = Math.floor(this.lines / LINES_PER_LEVEL) + 1;
    this.updateSpeed();
    return prevLevel !== this.level ? 2 : 1;
  }

  updateSpeed() {
    const levelSpeedCut = (this.level - 1) * LEVEL_SPEED_CUT_PER_LEVEL;
    const scoreSpeedCut = Math.floor(this.score / CELEBRATION_SCORE_STEP) * SCORE_SPEED_CUT_PER_100;
    this.dropInterval = Math.max(MIN_DROP_MS, BASE_DROP_MS - levelSpeedCut - scoreSpeedCut);
  }

  peekNextKey() {
    if (!this.bag.length) this.bag = buildShuffledBag();
    return this.bag[this.bag.length - 1];
  }

  drawNextPreview() {
    if (!this.previewCanvas || !this.previewCtx) return;
    const pctx = this.previewCtx;
    const w = PREVIEW_PAD;
    const h = PREVIEW_PAD;
    pctx.clearRect(0, 0, w, h);
    pctx.fillStyle = "#0a1430";
    pctx.fillRect(0, 0, w, h);

    let key = null;
    if (this.isRemote) {
      key = this.remoteNextKey;
    } else {
      key = this.peekNextKey();
    }
    if (!key || !SHAPES[key]) {
      pctx.fillStyle = "#5a6a8a";
      pctx.font = "13px system-ui, sans-serif";
      pctx.textAlign = "center";
      pctx.fillText(this.isRemote ? "…" : "—", w / 2, h / 2);
      pctx.textAlign = "left";
      return;
    }
    const { shape, color } = pieceFromKey(key);
    drawShapeInPreview(pctx, shape, color, w, h, PREVIEW_BLOCK);
  }

  spawn() {
    this.piece = this.takePiece();
    if (this.collision(0, 0)) this.gameOver = true;
  }

  takePiece() {
    if (!this.bag.length) this.bag = buildShuffledBag();
    const key = this.bag.pop();
    return pieceFromKey(key);
  }

  hardDrop() {
    while (!this.collision(0, 1)) this.piece.y += 1;
    this.tickLock();
  }

  tickLock() {
    this.mergePiece();
    const clearType = this.clearLines();
    this.spawn();
    return clearType;
  }

  move(dir) {
    if (!this.collision(dir, 0)) this.piece.x += dir;
  }

  softDrop() {
    if (!this.collision(0, 1)) {
      this.piece.y += 1;
      return 0;
    }
    return this.tickLock();
  }

  rotatePiece() {
    const r = rotate(this.piece.shape);
    if (!this.collision(0, 0, r)) this.piece.shape = r;
  }

  applyDinoBonus() {
    const occupied = [];
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (this.board[y][x]) occupied.push([x, y]);
      }
    }
    const bite = Math.min(14, occupied.length);
    for (let i = 0; i < bite; i += 1) {
      const pick = Math.floor(Math.random() * occupied.length);
      const [x, y] = occupied[pick];
      this.board[y][x] = null;
      occupied.splice(pick, 1);
    }
    this.dinoTicks = 48;
  }

  checkDinoTrigger(lineEventType) {
    let trigger = false;
    const milestone = Math.floor(this.score / 800);
    if (milestone > this.lastMilestone) {
      this.lastMilestone = milestone;
      trigger = true;
    }
    if (lineEventType === 2) trigger = true;
    if (trigger) this.applyDinoBonus();
    return trigger;
  }

  checkCelebrationTriggers() {
    const milestones = [];
    while (this.score >= this.nextCelebrationScore) {
      milestones.push(this.nextCelebrationScore);
      this.nextCelebrationScore += CELEBRATION_SCORE_STEP;
    }
    return milestones;
  }

  checkDinoRunTriggers() {
    const milestones = [];
    while (this.score >= this.nextDinoRunScore) {
      milestones.push(this.nextDinoRunScore);
      this.nextDinoRunScore += DINO_RUN_SCORE_STEP;
    }
    return milestones;
  }

  update(dt) {
    if (this.gameOver)
      return { lineEventType: 0, dino: false, celebrationMilestones: [], dinoRunMilestones: [] };
    this.dropAccumulator += dt;
    let lineEventType = 0;
    while (this.dropAccumulator > this.dropInterval) {
      this.dropAccumulator -= this.dropInterval;
      lineEventType = this.softDrop() || lineEventType;
    }
    const dino = this.checkDinoTrigger(lineEventType);
    const celebrationMilestones = this.checkCelebrationTriggers();
    const dinoRunMilestones = this.checkDinoRunTriggers();
    if (this.dinoTicks > 0) this.dinoTicks -= 1;
    return { lineEventType, dino, celebrationMilestones, dinoRunMilestones };
  }

  serializeState(name) {
    return {
      name,
      score: this.score,
      lines: this.lines,
      level: this.level,
      board: this.board,
      gameOver: this.gameOver,
      nextKey: this.peekNextKey(),
    };
  }

  applyRemoteState(state) {
    this.board = state.board || this.board;
    this.score = state.score || 0;
    this.lines = state.lines || 0;
    this.level = state.level || 1;
    this.gameOver = !!state.gameOver;
    this.remoteNextKey = state.nextKey != null ? state.nextKey : null;
    this.render(state.name || "Remote");
  }

  drawCell(x, y, color) {
    drawGemBlock(this.ctx, x * BLOCK, y * BLOCK, BLOCK, color);
  }

  drawBoardGrid() {
    this.ctx.save();
    this.ctx.strokeStyle = "rgba(90, 160, 255, 0.32)";
    this.ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x += 1) {
      const px = x * BLOCK + 0.5;
      this.ctx.beginPath();
      this.ctx.moveTo(px, 0);
      this.ctx.lineTo(px, BOARD_H);
      this.ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y += 1) {
      const py = y * BLOCK + 0.5;
      this.ctx.beginPath();
      this.ctx.moveTo(0, py);
      this.ctx.lineTo(BOARD_W, py);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  drawDinoOverlay() {
    if (this.dinoTicks <= 0) return;
    const phase = 48 - this.dinoTicks;
    const px = -80 + (phase / 48) * (BOARD_W + 120);
    const py = 190 + Math.sin(phase / 4) * 8;
    this.ctx.save();
    this.ctx.globalAlpha = 0.92;
    this.ctx.fillStyle = "#ffcf4f";
    this.ctx.fillRect(px - 6, py - 6, 96, 64);
    this.ctx.font = "58px serif";
    this.ctx.fillText("\uD83E\uDD96", px, py + 50);
    this.ctx.restore();
  }

  render(remoteName = "Invited Player") {
    this.ctx.clearRect(0, 0, BOARD_W, BOARD_H);
    this.drawBoardGrid();
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (this.board[y][x]) this.drawCell(x, y, this.board[y][x]);
      }
    }
    if (!this.isRemote) {
      for (let y = 0; y < this.piece.shape.length; y += 1) {
        for (let x = 0; x < this.piece.shape[y].length; x += 1) {
          if (!this.piece.shape[y][x]) continue;
          this.drawCell(this.piece.x + x, this.piece.y + y, this.piece.color);
        }
      }
    }
    this.drawDinoOverlay();

    this.statsEl.textContent = this.isRemote
      ? `${remoteName} | Score ${this.score} | Lines ${this.lines} | Lv ${this.level}`
      : `Score ${this.score} | Lines ${this.lines} | Lv ${this.level}`;
    this.drawNextPreview();
  }
}

class Leaderboard {
  constructor(listEl) {
    this.listEl = listEl;
    this.scores = this.load();
    this.render();
  }

  load() {
    try {
      const raw = localStorage.getItem(LEADERBOARD_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  save() {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(this.scores));
  }

  add(name, score, level, lines) {
    this.scores.push({ name, score, level, lines, at: Date.now() });
    this.scores.sort((a, b) => b.score - a.score);
    this.scores = this.scores.slice(0, 10);
    this.save();
    this.render();
  }

  render() {
    this.listEl.innerHTML = "";
    if (!this.scores.length) {
      const li = document.createElement("li");
      li.textContent = "No scores yet. Play to claim rank #1.";
      this.listEl.appendChild(li);
      return;
    }
    this.scores.forEach((entry) => {
      const li = document.createElement("li");
      li.textContent = `${entry.name} - ${entry.score} pts (Lv ${entry.level}, ${entry.lines} lines)`;
      this.listEl.appendChild(li);
    });
  }
}

class MultiplayerClient {
  constructor(statusEl) {
    this.statusEl = statusEl;
    this.socket = null;
    this.joined = false;
    this.remoteName = "Invited Player";
    this.onRemoteState = null;
  }

  connect(url, room, nick, mode) {
    if (this.socket) this.socket.close();
    this.socket = new WebSocket(url);
    this.statusEl.textContent = "Connecting...";
    this.socket.addEventListener("open", () => {
      this.statusEl.textContent = "Connected";
      this.send({ type: "join", room, nick, mode });
      this.joined = true;
    });
    this.socket.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        this.handle(msg);
      } catch {
        this.statusEl.textContent = "Protocol error";
      }
    });
    this.socket.addEventListener("close", () => {
      this.statusEl.textContent = "Disconnected";
      this.joined = false;
    });
    this.socket.addEventListener("error", () => {
      this.statusEl.textContent = "Connection failed";
      this.joined = false;
    });
  }

  handle(msg) {
    if (msg.type === "peer-joined") {
      this.statusEl.textContent = "Peer joined";
    }
    if (msg.type === "state" && this.onRemoteState) {
      this.remoteName = msg.state.name || "Invited Player";
      this.onRemoteState(msg.state);
    }
  }

  send(payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(payload));
  }
}

const ui = {
  startBtn: document.getElementById("startBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  musicBtn: document.getElementById("musicBtn"),
  inviteBtn: document.getElementById("inviteBtn"),
  hostBtn: document.getElementById("hostBtn"),
  joinBtn: document.getElementById("joinBtn"),
  netStatus: document.getElementById("netStatus"),
  serverUrl: document.getElementById("serverUrl"),
  roomCode: document.getElementById("roomCode"),
  nickname: document.getElementById("nickname"),
  modal: document.getElementById("nameModal"),
  scoreNameInput: document.getElementById("scoreNameInput"),
  saveScoreBtn: document.getElementById("saveScoreBtn"),
  closeModalBtn: document.getElementById("closeModalBtn"),
};

const localGame = new TetrisGame(
  document.getElementById("boardLocal"),
  document.getElementById("statsLocal"),
  false,
  document.getElementById("nextLocal"),
);
const remoteGame = new TetrisGame(
  document.getElementById("boardRemote"),
  document.getElementById("statsRemote"),
  true,
  document.getElementById("nextRemote"),
);
const audio = new AudioEngine();
const leaderboard = new Leaderboard(document.getElementById("leaderboard"));
const net = new MultiplayerClient(ui.netStatus);

let lastRemoteCelebrationMark = 0;
let lastRemoteDinoRunMark = 0;

net.onRemoteState = (state) => {
  remoteGame.applyRemoteState(state);
  const sc = state.score || 0;

  const band = Math.floor(sc / CELEBRATION_SCORE_STEP);
  lastRemoteCelebrationMark = Math.min(lastRemoteCelebrationMark, band);
  let delay = 0;
  while (lastRemoteCelebrationMark < band) {
    lastRemoteCelebrationMark += 1;
    const milestone = lastRemoteCelebrationMark * CELEBRATION_SCORE_STEP;
    const d = delay;
    delay += 90;
    setTimeout(() => {
      showCelebrationAnimation(milestone, { board: "remote", playerName: state.name || "Player" });
    }, d);
  }

  const dinoBand = Math.floor(sc / DINO_RUN_SCORE_STEP);
  lastRemoteDinoRunMark = Math.min(lastRemoteDinoRunMark, dinoBand);
  let dinoDelay = delay;
  while (lastRemoteDinoRunMark < dinoBand) {
    lastRemoteDinoRunMark += 1;
    const milestone = lastRemoteDinoRunMark * DINO_RUN_SCORE_STEP;
    const d = dinoDelay;
    dinoDelay += 2800;
    setTimeout(() => {
      showDinoRunnerAnimation(milestone, { board: "remote", playerName: state.name || "Player" });
    }, d);
  }
};

let lastTs = 0;
let running = false;
let paused = false;
let lastNetPush = 0;
const BG_DANCE_MS = 5000;
let bgDanceTimerId = null;

function triggerBackgroundDance() {
  const scene = document.querySelector(".game-bg-scene");
  if (!scene) return;
  scene.classList.add("bg-scene-dancing");
  if (bgDanceTimerId != null) clearTimeout(bgDanceTimerId);
  bgDanceTimerId = setTimeout(() => {
    scene.classList.remove("bg-scene-dancing");
    bgDanceTimerId = null;
  }, BG_DANCE_MS);
}

function stopBackgroundDance() {
  if (bgDanceTimerId != null) {
    clearTimeout(bgDanceTimerId);
    bgDanceTimerId = null;
  }
  document.querySelector(".game-bg-scene")?.classList.remove("bg-scene-dancing");
}

function showDinoBanner() {
  const b = document.createElement("div");
  b.className = "dino-banner";
  b.innerHTML = '<span class="emoji">\uD83E\uDD96</span> Bonus Dinosaur Rampage! It ate part of the stack!';
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 1700);
}

function getBoardWrap(board) {
  const id = board === "remote" ? "boardRemote" : "boardLocal";
  return document.getElementById(id)?.closest(".board-wrap");
}

function showCelebrationAnimation(milestone, options = {}) {
  const { board = "local", playerName = null } = options;
  audio.celebration();

  const wrap = document.createElement("div");
  wrap.className = "celebration-overlay";
  wrap.setAttribute("aria-hidden", "true");

  const burst = document.createElement("div");
  burst.className = "celebration-burst";
  const n = 18;
  for (let i = 0; i < n; i += 1) {
    const p = document.createElement("span");
    p.className = "celebration-particle";
    const rot = (i / n) * 360 + Math.random() * 18;
    const dist = 52 + Math.random() * 48;
    p.style.setProperty("--rot", `${rot}deg`);
    p.style.setProperty("--dist", `${dist}px`);
    p.style.setProperty("--delay", `${i * 12}ms`);
    p.style.setProperty("--hue", `${(i * 47) % 360}`);
    burst.appendChild(p);
  }

  const card = document.createElement("div");
  card.className = "celebration-card";
  const prefix = playerName ? `${playerName} — ` : "";
  card.innerHTML = `<span class="celebration-spark">\u2728</span><span class="celebration-pts">${prefix}${milestone} pts!</span>`;

  wrap.appendChild(burst);
  wrap.appendChild(card);
  document.body.appendChild(wrap);

  const boardWrap = getBoardWrap(board);
  if (boardWrap) boardWrap.classList.add("board-celebration-pulse");

  const remove = () => {
    wrap.remove();
    if (boardWrap) boardWrap.classList.remove("board-celebration-pulse");
  };
  setTimeout(remove, 950);
}

const DINO_RUN_ANIM_MS = 2600;

function showDinoRunnerAnimation(milestone, options = {}) {
  const { board = "local", playerName = null } = options;
  audio.dinoRunFunny();

  const layer = document.createElement("div");
  layer.className = "dino-runner-layer";
  layer.setAttribute("aria-hidden", "true");

  const sprite = document.createElement("div");
  sprite.className = "dino-runner-sprite";

  const emoji = document.createElement("span");
  emoji.className = "dino-runner-emoji";
  emoji.textContent = "\uD83E\uDD96";
  sprite.appendChild(emoji);

  const cap = document.createElement("div");
  cap.className = "dino-runner-caption";
  cap.textContent = playerName ? `${playerName} — ${milestone} pts!` : `${milestone} pts — go dino go!`;

  layer.appendChild(sprite);
  layer.appendChild(cap);
  document.body.appendChild(layer);

  const boardWrap = getBoardWrap(board);
  if (boardWrap) boardWrap.classList.add("board-dino-run-pulse");

  setTimeout(() => {
    layer.remove();
    if (boardWrap) boardWrap.classList.remove("board-dino-run-pulse");
  }, DINO_RUN_ANIM_MS + 400);
}

function gameOverFlow() {
  ui.modal.classList.remove("hidden");
  ui.modal.setAttribute("aria-hidden", "false");
  ui.scoreNameInput.value = ui.nickname.value || "";
  ui.scoreNameInput.focus();
}

const GAME_OVER_DONKEY_MS = 3000;

function showGameOverDonkeyAnimation(onDone) {
  const layer = document.createElement("div");
  layer.className = "game-over-donkey-layer";
  layer.setAttribute("role", "presentation");

  const inner = document.createElement("div");
  inner.className = "game-over-donkey-inner";

  const emoji = document.createElement("div");
  emoji.className = "game-over-donkey-emoji";
  emoji.setAttribute("aria-hidden", "true");
  emoji.textContent = String.fromCodePoint(0x1facf);

  const tears = document.createElement("div");
  tears.className = "game-over-donkey-tears";
  tears.innerHTML = "<span class=\"tear tear-l\"></span><span class=\"tear tear-r\"></span>";

  const bubble = document.createElement("p");
  bubble.className = "game-over-donkey-bubble";
  bubble.textContent = "Oops — try again!";

  const sub = document.createElement("p");
  sub.className = "game-over-donkey-sub";
  sub.textContent = "Game over";

  inner.appendChild(emoji);
  inner.appendChild(tears);
  inner.appendChild(bubble);
  inner.appendChild(sub);
  layer.appendChild(inner);
  document.body.appendChild(layer);

  audio.gameOverCartoonFunny();

  setTimeout(() => {
    layer.remove();
    if (typeof onDone === "function") onDone();
  }, GAME_OVER_DONKEY_MS);
}

function endGame() {
  running = false;
  audio.stopMusic();
  stopBackgroundDance();
  showGameOverDonkeyAnimation(() => {
    gameOverFlow();
  });
}

function frame(ts) {
  if (!running) return;
  const dt = ts - lastTs;
  lastTs = ts;
  if (!paused) {
    const events = localGame.update(dt);
    if (events.lineEventType === 1) audio.lineClear();
    if (events.lineEventType === 2) {
      audio.lineClear();
      audio.levelUp();
    }
    if (events.dino) {
      audio.dinoBonus();
      showDinoBanner();
    }
    if (events.celebrationMilestones.length > 0) {
      triggerBackgroundDance();
    }
    for (let i = 0; i < events.celebrationMilestones.length; i += 1) {
      const m = events.celebrationMilestones[i];
      setTimeout(() => showCelebrationAnimation(m, { board: "local" }), i * 85);
    }
    for (let i = 0; i < events.dinoRunMilestones.length; i += 1) {
      const m = events.dinoRunMilestones[i];
      setTimeout(() => showDinoRunnerAnimation(m, { board: "local" }), i * (DINO_RUN_ANIM_MS + 200));
    }
    localGame.render();

    if (localGame.gameOver) {
      localGame.render();
      endGame();
      return;
    }

    if (net.joined && ts - lastNetPush > 60) {
      net.send({ type: "state", state: localGame.serializeState(ui.nickname.value || "Player") });
      lastNetPush = ts;
    }
  }
  requestAnimationFrame(frame);
}

function startGame() {
  localGame.reset();
  lastRemoteCelebrationMark = 0;
  lastRemoteDinoRunMark = 0;
  running = true;
  paused = false;
  lastTs = performance.now();
  audio.startMusic();
  requestAnimationFrame(frame);
}

function setupControls() {
  window.addEventListener("keydown", (ev) => {
    if (!running || paused) return;
    if (ev.key === "ArrowLeft") localGame.move(-1);
    if (ev.key === "ArrowRight") localGame.move(1);
    if (ev.key === "ArrowDown") localGame.softDrop();
    if (ev.key === "ArrowUp" || ev.code === "Space") {
      ev.preventDefault();
      localGame.rotatePiece();
    }
    if (ev.key === "Enter") localGame.hardDrop();
    localGame.render();
  });
}

ui.startBtn.addEventListener("click", () => {
  audio.ensureContext();
  startGame();
});

ui.pauseBtn.addEventListener("click", () => {
  paused = !paused;
  ui.pauseBtn.textContent = paused ? "Resume" : "Pause";
});

ui.musicBtn.addEventListener("click", () => {
  const on = ui.musicBtn.textContent.endsWith("On");
  audio.setEnabled(!on);
  ui.musicBtn.textContent = `Music: ${!on ? "On" : "Off"}`;
});

const networkPanel = document.getElementById("networkPanel");
const remotePlayArea = document.getElementById("remotePlayArea");
const gameLayout = document.getElementById("gameLayout");

ui.inviteBtn.addEventListener("click", () => {
  networkPanel.classList.toggle("hidden");
  const isOpen = !networkPanel.classList.contains("hidden");
  remotePlayArea.classList.toggle("hidden", !isOpen);
  remotePlayArea.setAttribute("aria-hidden", String(!isOpen));
  gameLayout.classList.toggle("game-layout--multi", isOpen);
  ui.inviteBtn.textContent = isOpen ? "Hide invite" : "Invite";
});

ui.hostBtn.addEventListener("click", () => {
  net.connect(ui.serverUrl.value.trim(), ui.roomCode.value.trim(), ui.nickname.value.trim() || "Host", "host");
});

ui.joinBtn.addEventListener("click", () => {
  net.connect(ui.serverUrl.value.trim(), ui.roomCode.value.trim(), ui.nickname.value.trim() || "Guest", "join");
});

ui.saveScoreBtn.addEventListener("click", () => {
  const name = ui.scoreNameInput.value.trim() || "Anonymous";
  leaderboard.add(name, localGame.score, localGame.level, localGame.lines);
  ui.modal.classList.add("hidden");
  ui.modal.setAttribute("aria-hidden", "true");
});

ui.closeModalBtn.addEventListener("click", () => {
  ui.modal.classList.add("hidden");
  ui.modal.setAttribute("aria-hidden", "true");
});

setupControls();
localGame.render();
remoteGame.render();
