/* eslint-disable max-classes-per-file */
/**
 * TETRIS OF THE DAMNED — horror reimagining.
 * Single-file architecture, Web Audio only, Canvas 2D only, localStorage.
 */

// ============================================================
//                         CONSTANTS
// ============================================================

const GAME_STATES = {
  MENU: "MENU",
  PLAYING: "PLAYING",
  PAUSED: "PAUSED",
  GAMEOVER: "GAMEOVER",
};

const BOARD_W = 10;
const BOARD_H = 20;
const CELL = 36;

/** Tetromino shape rotations (SRS-like). */
const PIECES = {
  I: [[[1, 1, 1, 1]], [[1], [1], [1], [1]]],
  O: [[[1, 1], [1, 1]]],
  T: [[[0, 1, 0], [1, 1, 1]], [[1, 0], [1, 1], [1, 0]], [[1, 1, 1], [0, 1, 0]], [[0, 1], [1, 1], [0, 1]]],
  S: [[[0, 1, 1], [1, 1, 0]], [[1, 0], [1, 1], [0, 1]]],
  Z: [[[1, 1, 0], [0, 1, 1]], [[0, 1], [1, 1], [1, 0]]],
  J: [[[1, 0, 0], [1, 1, 1]], [[1, 1], [1, 0], [1, 0]], [[1, 1, 1], [0, 0, 1]], [[0, 1], [0, 1], [1, 1]]],
  L: [[[0, 0, 1], [1, 1, 1]], [[1, 0], [1, 0], [1, 1]], [[1, 1, 1], [1, 0, 0]], [[1, 1], [0, 1], [0, 1]]],
};

/** Horror-themed piece palette — vivid neon horror hues that glow clearly. */
const PIECE_COLORS = {
  I: "#ff1a2e",   // Arterial blood red — bright and vivid
  O: "#e8c017",   // Cursed gold — warm and glowing
  T: "#9b1fff",   // Dark magic purple — electric
  S: "#00e554",   // Toxic green — radioactive glow
  Z: "#ff6600",   // Hellfire orange — burns hot
  J: "#1a8fff",   // Ghostly blue — cold and eerie
  L: "#ff2d9b",   // Demon pink/magenta — unnatural
};

/** Evil symbol carved onto each piece face (matches piece letter). */
const PIECE_SYMBOLS = {
  I: "cross",
  O: "moon",
  T: "pentagram",
  S: "spider",
  Z: "skull",
  J: "bat",
  L: "eye",
};

const POWER_UPS = ["GARLIC", "CROSS", "WITCH_BREW", "DEATH_RATTLE", "CANDLE", "BAT_FAMILIAR"];
const POWER_DOWNS = ["BLOOD_BLOCK", "SHADOW_PIECE", "HEAVY_STONE", "COBWEB"];

/** Pre-computed musical note frequencies. */
const NOTE_FREQUENCIES = (() => {
  const map = {};
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  for (let octave = 1; octave <= 6; octave += 1) {
    for (let i = 0; i < 12; i += 1) {
      const key = `${names[i]}${octave}`;
      const n = i + 12 * (octave - 4) - 9;
      map[key] = 440 * (2 ** (n / 12));
    }
  }
  return map;
})();

// ============================================================
//                         UTILITIES
// ============================================================

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randf = (min, max) => Math.random() * (max - min) + min;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const lerp = (a, b, t) => a + (b - a) * t;
const $ = (id) => document.getElementById(id);
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];

function toRoman(n) {
  if (n <= 0) return "0";
  const map = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of map) { while (n >= v) { out += s; n -= v; } }
  return out;
}

// ============================================================
//                       SETTINGS
// ============================================================

class SettingsManager {
  static defaults() {
    return { master: 0.85, musicVolume: 0.55, sfxVolume: 0.7, shake: true, particles: true, jumpscares: true, ghost: true };
  }

  constructor() {
    this.data = SettingsManager.defaults();
    try {
      const raw = localStorage.getItem("damned.settings");
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch (_) { /* ignore */ }
  }

  save() {
    try { localStorage.setItem("damned.settings", JSON.stringify(this.data)); } catch (_) { /* ignore */ }
  }

  set(key, val) {
    this.data[key] = val;
    this.save();
  }
}

// ============================================================
//                         BOARD
// ============================================================

/**
 * 10x20 grid. Each cell is null OR a state object with:
 * { color, symbol, cursed, webbed, shadow, blood, heavy }
 */
class Board {
  constructor(w = BOARD_W, h = BOARD_H) {
    this.w = w; this.h = h;
    this.grid = Array.from({ length: h }, () => Array(w).fill(null));
  }

  reset() {
    for (let y = 0; y < this.h; y += 1) for (let x = 0; x < this.w; x += 1) this.grid[y][x] = null;
  }

  inside(x, y) { return x >= 0 && x < this.w && y >= 0 && y < this.h; }

  /** Can the given piece be placed at (ox, oy)? */
  canPlace(piece, ox, oy) {
    const shape = piece.matrix();
    for (let py = 0; py < shape.length; py += 1) {
      for (let px = 0; px < shape[py].length; px += 1) {
        if (!shape[py][px]) continue;
        const nx = ox + px;
        const ny = oy + py;
        if (nx < 0 || nx >= this.w || ny >= this.h) return false;
        if (ny >= 0 && this.grid[ny][nx]) return false;
      }
    }
    return true;
  }

  /** Lock piece into grid. Returns array of cell coords written. */
  lock(piece) {
    const shape = piece.matrix();
    const written = [];
    for (let py = 0; py < shape.length; py += 1) {
      for (let px = 0; px < shape[py].length; px += 1) {
        if (!shape[py][px]) continue;
        const nx = piece.x + px;
        const ny = piece.y + py;
        if (this.inside(nx, ny)) {
          this.grid[ny][nx] = {
            color: piece.color,
            symbol: piece.symbol,
            cursed: false, webbed: false, shadow: piece.shadow || false, blood: piece.blood || false, heavy: piece.heavy || false,
          };
          written.push([nx, ny]);
        }
      }
    }
    return written;
  }

  /** Returns indexes of rows that are fully filled (ignoring cursed/webbed which resist). */
  findFullRows() {
    const full = [];
    for (let y = 0; y < this.h; y += 1) {
      let complete = true;
      let allClearable = true;
      for (let x = 0; x < this.w; x += 1) {
        const cell = this.grid[y][x];
        if (!cell) { complete = false; break; }
        if (cell.cursed || cell.webbed) allClearable = false;
      }
      if (complete && allClearable) full.push(y);
    }
    return full;
  }

  /** Clear the given rows; rows above drop by 1 each. */
  clearRows(rows) {
    rows.sort((a, b) => a - b);
    for (const y of rows) {
      for (let yy = y; yy > 0; yy -= 1) this.grid[yy] = this.grid[yy - 1].slice();
      this.grid[0] = Array(this.w).fill(null);
    }
  }

  /** Apply gravity: let free-floating cells fall down until resting. */
  applyGravity() {
    for (let x = 0; x < this.w; x += 1) {
      const col = [];
      for (let y = 0; y < this.h; y += 1) if (this.grid[y][x]) col.push(this.grid[y][x]);
      for (let y = 0; y < this.h; y += 1) this.grid[y][x] = null;
      for (let i = 0; i < col.length; i += 1) this.grid[this.h - col.length + i][x] = col[i];
    }
  }

  /** Peak stack height from top (0 = empty, 20 = full). */
  peakHeight() {
    for (let y = 0; y < this.h; y += 1) {
      for (let x = 0; x < this.w; x += 1) if (this.grid[y][x]) return this.h - y;
    }
    return 0;
  }

  /** Destroy cells along a slash path from (x1,y1) to (x2,y2). Returns cleared count. */
  slash(x1, y1, x2, y2) {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) + 1;
    let count = 0;
    for (let i = 0; i < steps; i += 1) {
      const t = i / (steps - 1);
      const px = Math.round(lerp(x1, x2, t));
      const py = Math.round(lerp(y1, y2, t));
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const nx = px + ox; const ny = py + oy;
          if (this.inside(nx, ny) && this.grid[ny][nx] && Math.random() < 0.55) {
            this.grid[ny][nx] = null; count += 1;
          }
        }
      }
    }
    return count;
  }
}

// ============================================================
//                         PIECE
// ============================================================

class Piece {
  constructor(type, overrides = {}) {
    this.type = type;
    this.rotations = PIECES[type];
    this.rotation = 0;
    this.x = 3;
    this.y = -1;
    this.color = overrides.color || PIECE_COLORS[type];
    this.symbol = overrides.symbol || PIECE_SYMBOLS[type];
    this.special = overrides.special || null;    // power-up id
    this.negative = overrides.negative || null;  // power-down id
    this.shadow = overrides.shadow || false;
    this.blood = overrides.blood || false;
    this.heavy = overrides.heavy || false;
  }

  matrix() { return this.rotations[this.rotation]; }

  rotate(dir, board) {
    const next = (this.rotation + (dir > 0 ? 1 : this.rotations.length - 1)) % this.rotations.length;
    const oldR = this.rotation;
    this.rotation = next;
    // Basic wall-kick attempts
    const tries = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0]];
    for (const [dx, dy] of tries) {
      if (board.canPlace(this, this.x + dx, this.y + dy)) {
        this.x += dx; this.y += dy; return true;
      }
    }
    this.rotation = oldR;
    return false;
  }

  ghostY(board) {
    let gy = this.y;
    while (board.canPlace(this, this.x, gy + 1)) gy += 1;
    return gy;
  }
}

// ============================================================
//                       PIECE BAG
// ============================================================

class PieceBag {
  constructor(game) {
    this.game = game;
    this.bag = [];
    this.queue = [];
    this.pieceCount = 0;
    this.powerUpInterval = 10;
    this.powerDownInterval = 18;
    this.refill();
    while (this.queue.length < 6) this.queue.push(this.drawOne());
  }

  refill() {
    const types = ["I", "O", "T", "S", "Z", "J", "L"];
    for (let i = types.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }
    this.bag = types;
  }

  drawOne() {
    if (this.bag.length === 0) this.refill();
    const type = this.bag.pop();
    this.pieceCount += 1;
    // Chance to inject power-up
    if (this.pieceCount % this.powerUpInterval === 0 && Math.random() < 0.85) {
      const pu = choice(POWER_UPS);
      return new Piece(type, { special: pu, color: "#fff5d8", symbol: "powerup" });
    }
    // Chance to inject power-down (cursed)
    if (this.pieceCount % this.powerDownInterval === 0 && Math.random() < 0.7) {
      const pd = choice(POWER_DOWNS);
      return this.makeCursedPiece(type, pd);
    }
    return new Piece(type);
  }

  makeCursedPiece(type, kind) {
    const overrides = { negative: kind };
    if (kind === "BLOOD_BLOCK") { overrides.color = "#c51c2a"; overrides.symbol = "blood"; overrides.blood = true; }
    if (kind === "SHADOW_PIECE") { overrides.color = "#0a0308"; overrides.symbol = "shadow"; overrides.shadow = true; }
    if (kind === "HEAVY_STONE") { overrides.color = "#4a454a"; overrides.symbol = "stone"; overrides.heavy = true; }
    if (kind === "COBWEB") { overrides.color = "#e6e3d8"; overrides.symbol = "web"; }
    return new Piece(type, overrides);
  }

  next() {
    const p = this.queue.shift();
    this.queue.push(this.drawOne());
    return p;
  }

  peek(n = 1) { return this.queue.slice(0, n); }
}

// ============================================================
//                       RENDERER
// ============================================================

class Renderer {
  constructor(boardCanvas, particleCanvas) {
    this.canvas = boardCanvas;
    this.ctx = boardCanvas.getContext("2d");
    this.particleCtx = particleCanvas.getContext("2d");
    this.warp = 0;
    this.notifications = [];
    this.comicPopups = [];
  }

  /** Paint the stone-textured background of the board. */
  drawStoneBackground() {
    const c = this.ctx;
    const w = this.canvas.width; const h = this.canvas.height;
    c.save();
    const bg = c.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#120a18"); // deep purple-black
    bg.addColorStop(1, "#08050e"); // very dark with purple tint
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    // stone blocks (slight purple tint so colored pieces read better)
    for (let y = 0; y < h; y += 48) {
      for (let x = 0; x < w; x += 48) {
        c.fillStyle = `rgba(${30 + rand(0, 8)}, ${18 + rand(0, 6)}, ${35 + rand(0, 10)}, 0.4)`;
        c.fillRect(x + rand(-1, 1), y + rand(-1, 1), 46, 46);
      }
    }
    // faint cracks
    c.strokeStyle = "rgba(0,0,0,0.45)";
    c.lineWidth = 1;
    for (let i = 0; i < 8; i += 1) {
      c.beginPath();
      const sx = rand(0, w); const sy = rand(0, h);
      c.moveTo(sx, sy);
      c.lineTo(sx + rand(-20, 20), sy + rand(-20, 20));
      c.stroke();
    }
    c.restore();
  }

  /** Draw a vivid neon-glow carved stone block. */
  drawBlock(x, y, color, alpha = 1, state = {}) {
    const c = this.ctx;
    const px = x * CELL;
    const py = y * CELL;
    const pad = 1;
    c.save();
    c.globalAlpha = alpha;

    // 1. OUTER GLOW — neon aura
    c.shadowColor = color;
    c.shadowBlur = 14;
    c.fillStyle = color;
    c.fillRect(px + pad, py + pad, CELL - pad * 2, CELL - pad * 2);
    c.shadowBlur = 0;

    // 2. INNER GRADIENT — top-left bright, bottom-right dark (3D gem look)
    const grad = c.createLinearGradient(px, py, px + CELL, py + CELL);
    grad.addColorStop(0, "rgba(255,255,255,0.35)");
    grad.addColorStop(0.4, "rgba(255,255,255,0.05)");
    grad.addColorStop(1, "rgba(0,0,0,0.55)");
    c.fillStyle = grad;
    c.fillRect(px + pad, py + pad, CELL - pad * 2, CELL - pad * 2);

    // 3. BRIGHT TOP EDGE
    c.fillStyle = "rgba(255,255,255,0.55)";
    c.fillRect(px + pad + 1, py + pad + 1, CELL - pad * 2 - 2, 3);

    // 4. BRIGHT LEFT EDGE
    c.fillStyle = "rgba(255,255,255,0.3)";
    c.fillRect(px + pad + 1, py + pad + 1, 3, CELL - pad * 2 - 2);

    // 5. DARK BOTTOM EDGE
    c.fillStyle = "rgba(0,0,0,0.6)";
    c.fillRect(px + pad + 1, py + CELL - pad - 4, CELL - pad * 2 - 2, 3);

    // 6. DARK RIGHT EDGE
    c.fillStyle = "rgba(0,0,0,0.45)";
    c.fillRect(px + CELL - pad - 4, py + pad + 1, 3, CELL - pad * 2 - 2);

    // 7. EVIL SYMBOL
    c.globalAlpha = alpha;
    this._drawSymbol(c, px + CELL / 2, py + CELL / 2, state.symbol || "skull", color);

    // 8. STATE OVERLAYS
    if (state.cursed) {
      c.fillStyle = `rgba(200, 20, 40, ${0.4 + Math.sin(performance.now() * 0.008) * 0.2})`;
      c.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
      c.strokeStyle = "#ff3040";
      c.lineWidth = 1.5;
      c.strokeRect(px + 2, py + 2, CELL - 4, CELL - 4);
    }
    if (state.webbed) {
      c.strokeStyle = "rgba(240, 240, 230, 0.8)";
      c.lineWidth = 1;
      c.beginPath();
      for (let i = 0; i < 4; i += 1) {
        c.moveTo(px + 2, py + 2);
        c.lineTo(px + CELL - 2, py + 2 + i * (CELL / 4));
        c.moveTo(px + 2, py + CELL - 2);
        c.lineTo(px + CELL - 2, py + CELL - 2 - i * (CELL / 4));
      }
      c.stroke();
    }
    if (state.shadow) {
      c.fillStyle = "rgba(0,0,0,0.88)";
      c.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
    }
    if (state.blood) {
      c.fillStyle = "rgba(197, 28, 42, 0.55)";
      c.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
      c.fillStyle = "#7a0612";
      const dripX = px + CELL / 2;
      c.fillRect(dripX - 1, py + CELL - 2, 2, 6 + Math.sin(performance.now() * 0.003) * 3);
    }
    if (state.heavy) {
      c.strokeStyle = "#1a1418";
      c.lineWidth = 2;
      c.strokeRect(px + 3, py + 3, CELL - 6, CELL - 6);
    }

    c.restore();
  }

  /** Tiny evil symbol carved on block face. */
  _drawSymbol(c, cx, cy, sym, color) {
    c.save();
    c.translate(cx, cy);
    c.globalAlpha = 0.38;
    c.strokeStyle = "rgba(0,0,0,0.85)";
    c.fillStyle = "rgba(0,0,0,0.75)";
    c.lineWidth = 1.5;
    const r = 9;
    c.beginPath();
    switch (sym) {
      case "skull":
        c.arc(0, -2, r, 0, Math.PI * 2); c.stroke();
        c.beginPath();
        c.arc(-3, -2, 1.5, 0, Math.PI * 2); c.fill();
        c.beginPath();
        c.arc(3, -2, 1.5, 0, Math.PI * 2); c.fill();
        c.beginPath();
        c.moveTo(-3, 5); c.lineTo(-1, 8); c.moveTo(1, 8); c.lineTo(3, 5); c.stroke();
        break;
      case "pentagram": {
        c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();
        c.beginPath();
        for (let i = 0; i < 5; i += 1) {
          const a = -Math.PI / 2 + i * (Math.PI * 2 * 2 / 5);
          const px = Math.cos(a) * r; const py = Math.sin(a) * r;
          if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
        }
        c.closePath(); c.stroke();
        break;
      }
      case "eye":
        c.beginPath();
        c.ellipse(0, 0, r, r * 0.55, 0, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.arc(0, 0, 2.5, 0, Math.PI * 2); c.fill();
        break;
      case "moon":
        c.beginPath(); c.arc(0, 0, r - 1, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.arc(3, -1, r - 2, 0, Math.PI * 2); c.fill();
        break;
      case "bat":
        c.beginPath();
        c.moveTo(-r, 0); c.quadraticCurveTo(-r / 2, -6, 0, -2);
        c.quadraticCurveTo(r / 2, -6, r, 0);
        c.quadraticCurveTo(r / 2, 2, 2, 4);
        c.lineTo(0, 2); c.lineTo(-2, 4);
        c.quadraticCurveTo(-r / 2, 2, -r, 0); c.closePath();
        c.fill();
        break;
      case "cross":
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(0, -r); c.lineTo(0, r); c.moveTo(-r * 0.6, -2); c.lineTo(r * 0.6, -2); c.stroke();
        break;
      case "spider":
        c.beginPath(); c.arc(0, 0, 4, 0, Math.PI * 2); c.fill();
        c.lineWidth = 1;
        for (let i = 0; i < 8; i += 1) {
          const a = i / 8 * Math.PI * 2;
          c.beginPath();
          c.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
          c.quadraticCurveTo(Math.cos(a) * 8, Math.sin(a) * 8, Math.cos(a) * 10, Math.sin(a) * 10);
          c.stroke();
        }
        break;
      case "powerup":
        c.globalAlpha = 0.85;
        c.fillStyle = `hsl(${(performance.now() / 8) % 360}, 80%, 60%)`;
        c.beginPath(); c.arc(0, 0, 6, 0, Math.PI * 2); c.fill();
        break;
      case "blood":
        c.fillStyle = "rgba(0,0,0,0.8)";
        c.beginPath();
        c.ellipse(0, 2, 5, 6, 0, 0, Math.PI * 2); c.fill();
        break;
      default:
        c.beginPath(); c.arc(0, 0, 3, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }

  _darken(hex, factor) {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgb(${Math.floor(r * factor)},${Math.floor(g * factor)},${Math.floor(b * factor)})`;
  }

  /** Full draw of board + piece + ghost. */
  draw(board, piece, ghostY, drawGhost = true) {
    const c = this.ctx;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawStoneBackground();

    // grid lines (purple-tinted for contrast with vivid pieces)
    c.strokeStyle = "rgba(80, 40, 90, 0.25)";
    c.lineWidth = 1;
    for (let x = 0; x <= board.w; x += 1) {
      c.beginPath(); c.moveTo(x * CELL, 0); c.lineTo(x * CELL, board.h * CELL); c.stroke();
    }
    for (let y = 0; y <= board.h; y += 1) {
      c.beginPath(); c.moveTo(0, y * CELL); c.lineTo(board.w * CELL, y * CELL); c.stroke();
    }

    // locked cells
    for (let y = 0; y < board.h; y += 1) {
      for (let x = 0; x < board.w; x += 1) {
        const cell = board.grid[y][x];
        if (cell) this.drawBlock(x, y, cell.color, 1, cell);
      }
    }

    // ghost piece — colored translucent fill + neon outline
    if (piece && drawGhost && !piece.shadow) {
      const mat = piece.matrix();
      const ghostColor = piece.color || "#d9ccb0";
      c.save();
      for (let py = 0; py < mat.length; py += 1) {
        for (let px = 0; px < mat[py].length; px += 1) {
          if (!mat[py][px]) continue;
          const gx = piece.x + px; const gy = ghostY + py;
          if (gy < 0) continue;
          const rx = gx * CELL + 2;
          const ry = gy * CELL + 2;
          const rw = CELL - 4;
          // ghost fill
          c.globalAlpha = 0.12;
          c.fillStyle = ghostColor;
          c.fillRect(rx, ry, rw, rw);
          // ghost border
          c.globalAlpha = 0.5;
          c.strokeStyle = ghostColor;
          c.shadowColor = ghostColor;
          c.shadowBlur = 8;
          c.lineWidth = 1.5;
          c.setLineDash([5, 3]);
          c.strokeRect(rx, ry, rw, rw);
          c.setLineDash([]);
          c.shadowBlur = 0;
        }
      }
      c.restore();
    }

    // falling piece
    if (piece) {
      const mat = piece.matrix();
      for (let py = 0; py < mat.length; py += 1) {
        for (let px = 0; px < mat[py].length; px += 1) {
          if (!mat[py][px]) continue;
          const gx = piece.x + px; const gy = piece.y + py;
          if (gy < 0) continue;
          const state = { symbol: piece.symbol, shadow: piece.shadow, blood: piece.blood, heavy: piece.heavy };
          const color = piece.special ? `hsl(${(performance.now() / 4) % 360}, 85%, 60%)` : piece.color;
          this.drawBlock(gx, gy, color, 1, state);
          if (piece.special) this._drawPowerUpAura(gx, gy);
        }
      }
    }

    // comic popups are drawn in DOM; nothing to do here
  }

  _drawPowerUpAura(x, y) {
    const c = this.ctx;
    c.save();
    c.globalAlpha = 0.55 + Math.sin(performance.now() * 0.01) * 0.25;
    c.strokeStyle = `hsl(${(performance.now() / 4) % 360}, 100%, 65%)`;
    c.lineWidth = 2;
    c.strokeRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
    c.restore();
  }

  /** Draw preview piece into a given 2D context, centered. */
  drawPreviewPiece(ctx, piece, slotW, slotH) {
    ctx.clearRect(0, 0, slotW, slotH);
    if (!piece) return;
    const mat = piece.matrix();
    const cell = Math.min(28, Math.floor(slotW / (mat[0].length + 1)));
    const pw = mat[0].length * cell;
    const ph = mat.length * cell;
    const ox = (slotW - pw) / 2;
    const oy = (slotH - ph) / 2;
    const color = piece.special ? `hsl(${(performance.now() / 4) % 360}, 85%, 60%)` : piece.color;
    for (let py = 0; py < mat.length; py += 1) {
      for (let px = 0; px < mat[py].length; px += 1) {
        if (!mat[py][px]) continue;
        const bx = ox + px * cell; const by = oy + py * cell;
        const g = ctx.createLinearGradient(bx, by, bx + cell, by + cell);
        g.addColorStop(0, "#4a3a38");
        g.addColorStop(0.18, color);
        g.addColorStop(1, "#060306");
        ctx.fillStyle = g;
        ctx.fillRect(bx + 1, by + 1, cell - 2, cell - 2);
        ctx.strokeStyle = "rgba(240,220,180,0.18)";
        ctx.strokeRect(bx + 1.5, by + 1.5, cell - 3, cell - 3);
      }
    }
  }
}

// ============================================================
//                     PARTICLE SYSTEM
// ============================================================

class ParticleSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.pool = [];
    this.enabled = true;
  }

  spawn(type, x, y, count = 20, opts = {}) {
    if (!this.enabled) return;
    // Enforce minimum counts per type for punchy one-shot bursts.
    // Skip the floor when the caller explicitly wants a small trail/drip via opts.raw.
    const minCounts = { SKULL: 20, BLOOD: 35, BAT: 25, FIRE: 30, SHATTER: 40, HOLY: 20, SPARKLE: 16, GREEN: 20 };
    const finalCount = opts.raw ? count : Math.max(count, minCounts[type] || count);
    for (let i = 0; i < finalCount; i += 1) {
      const p = this._acquire();
      p.type = type;
      p.x = x + randf(-4, 4);
      p.y = y + randf(-4, 4);
      p.rotation = randf(0, Math.PI * 2);
      p.spin = randf(-0.2, 0.2);

      switch (type) {
        case "ASH":
          p.vx = randf(-0.8, 0.8); p.vy = randf(-1.2, -0.2);
          p.color = `rgba(${rand(80,140)},${rand(80,140)},${rand(80,140)},1)`;
          p.size = randf(2, 5); p.life = randf(800, 1600);
          break;
        case "SKULL":
          p.vx = randf(-6, 6); p.vy = randf(-9, -2);
          p.color = "#e8e2cf"; p.size = randf(10, 22); p.life = 2400;
          break;
        case "BAT":
          p.vx = randf(-5, 5); p.vy = randf(-4, 1);
          p.color = "#0a070a"; p.size = randf(12, 24); p.life = 2200;
          break;
        case "BLOOD":
          p.vx = randf(-5, 5); p.vy = randf(-7, -1);
          p.color = `rgb(${rand(160, 230)}, ${rand(10, 40)}, ${rand(20, 55)})`;
          p.size = randf(6, 14); p.life = 2000;
          break;
        case "HOLY":
          p.vx = randf(-1.5, 1.5); p.vy = randf(-2.5, -0.5);
          p.color = `hsl(${rand(35, 55)}, 90%, ${rand(70, 90)}%)`;
          p.size = randf(5, 11); p.life = 1800;
          break;
        case "FIRE":
          p.vx = randf(-1, 1); p.vy = randf(-6, -2);
          p.color = `hsl(${rand(5, 30)}, 90%, ${rand(45, 65)}%)`;
          p.size = randf(7, 16); p.life = 1600;
          break;
        case "GREEN":
          p.vx = randf(-2.5, 2.5); p.vy = randf(-3, -0.8);
          p.color = `hsl(${rand(85, 115)}, 80%, ${rand(40, 60)}%)`;
          p.size = randf(5, 12); p.life = 1800;
          break;
        case "SPARKLE":
          p.vx = randf(-0.8, 0.8); p.vy = randf(-1, -0.2);
          p.color = "#f2ede0"; p.size = randf(3, 7); p.life = 1600;
          break;
        case "SHATTER":
          p.vx = randf(-10, 10); p.vy = randf(-12, -3);
          p.color = "#d9ccb0"; p.size = randf(6, 14); p.life = 2200;
          break;
        default:
          p.vx = randf(-2, 2); p.vy = randf(-3, -1);
          p.color = "#fff"; p.size = randf(2, 6); p.life = 1200;
      }
      if (opts.life) p.life = opts.life;
      p.maxLife = p.life;
      if (opts.size) p.size = opts.size;
      if (opts.color) p.color = opts.color;
    }
  }

  _acquire() {
    for (const p of this.pool) if (!p.alive) { p.alive = true; return p; }
    const p = { alive: true };
    this.pool.push(p);
    return p;
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      if (p.type === "FIRE") p.vy -= 0.04; // fire floats up
      else p.vy += 0.08; // normal gravity
      p.x += p.vx; p.y += p.vy;
      p.rotation += p.spin;
    }
  }

  draw() {
    const c = this.ctx;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const p of this.pool) {
      if (!p.alive) continue;
      const a = Math.max(0, p.life / p.maxLife);
      c.save();
      c.globalAlpha = a;
      c.translate(p.x, p.y);
      c.rotate(p.rotation);
      if (p.type === "SKULL") this._drawSkull(c, p.size);
      else if (p.type === "BAT") this._drawBatShape(c, p.size);
      else if (p.type === "SPARKLE") {
        c.fillStyle = p.color;
        c.fillRect(-1, -p.size, 2, p.size * 2);
        c.fillRect(-p.size, -1, p.size * 2, 2);
      } else if (p.type === "FIRE") {
        this._drawFlame(c, p.size, a);
      } else {
        c.fillStyle = p.color;
        c.beginPath();
        c.arc(0, 0, p.size, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }
  }

  /** Real-looking flame: teardrop shape, yellow core, orange body, red edge, additive blend. */
  _drawFlame(c, s, life) {
    const flicker = 0.85 + Math.sin(performance.now() * 0.03 + s) * 0.15;
    const h = s * 1.8 * flicker;
    c.globalCompositeOperation = "lighter";

    // Outer red halo
    const halo = c.createRadialGradient(0, -h * 0.25, 0, 0, -h * 0.25, s * 1.8);
    halo.addColorStop(0, "rgba(255, 80, 20, 0.55)");
    halo.addColorStop(0.5, "rgba(200, 30, 0, 0.25)");
    halo.addColorStop(1, "rgba(100, 0, 0, 0)");
    c.fillStyle = halo;
    c.beginPath(); c.arc(0, -h * 0.25, s * 1.8, 0, Math.PI * 2); c.fill();

    // Flame teardrop body — tapered point upward
    const bodyGrad = c.createLinearGradient(0, -h, 0, s * 0.4);
    bodyGrad.addColorStop(0, "rgba(255, 245, 180, 0.95)"); // hot tip
    bodyGrad.addColorStop(0.35, "rgba(255, 170, 40, 0.9)");
    bodyGrad.addColorStop(0.75, "rgba(230, 70, 10, 0.75)");
    bodyGrad.addColorStop(1, "rgba(120, 0, 0, 0)");
    c.fillStyle = bodyGrad;
    c.beginPath();
    c.moveTo(0, -h);
    c.quadraticCurveTo(s * 0.95, -h * 0.3, s * 0.55, s * 0.15);
    c.quadraticCurveTo(s * 0.2, s * 0.5, 0, s * 0.35);
    c.quadraticCurveTo(-s * 0.2, s * 0.5, -s * 0.55, s * 0.15);
    c.quadraticCurveTo(-s * 0.95, -h * 0.3, 0, -h);
    c.closePath(); c.fill();

    // White-hot core
    const core = c.createRadialGradient(0, -h * 0.1, 0, 0, -h * 0.1, s * 0.45);
    core.addColorStop(0, "rgba(255, 255, 240, 0.95)");
    core.addColorStop(0.7, "rgba(255, 210, 100, 0.45)");
    core.addColorStop(1, "rgba(255, 160, 30, 0)");
    c.fillStyle = core;
    c.beginPath(); c.arc(0, -h * 0.1, s * 0.45, 0, Math.PI * 2); c.fill();

    c.globalCompositeOperation = "source-over";
  }

  _drawSkull(c, s) {
    c.fillStyle = "#e8e2cf";
    c.beginPath(); c.arc(0, 0, s, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#000";
    c.beginPath(); c.arc(-s * 0.33, -s * 0.1, s * 0.2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(s * 0.33, -s * 0.1, s * 0.2, 0, Math.PI * 2); c.fill();
    c.fillRect(-s * 0.15, s * 0.25, s * 0.3, s * 0.35);
  }

  _drawBatShape(c, s) {
    c.fillStyle = "#0a070a";
    c.beginPath();
    c.moveTo(-s, 0); c.quadraticCurveTo(-s * 0.5, -s * 0.6, 0, -s * 0.2);
    c.quadraticCurveTo(s * 0.5, -s * 0.6, s, 0);
    c.quadraticCurveTo(s * 0.5, s * 0.2, s * 0.2, s * 0.4);
    c.lineTo(0, s * 0.2); c.lineTo(-s * 0.2, s * 0.4);
    c.quadraticCurveTo(-s * 0.5, s * 0.2, -s, 0);
    c.closePath(); c.fill();
  }
}

// ============================================================
//                       AUDIO ENGINE
// ============================================================

class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.started = false;
    this.ambienceNodes = [];
    this.musicStep = 0;
    this.musicTimer = 0;
    this.bpm = 110;
    this.muted = false;
  }

  ensure() {
    if (this.started) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.settings.data.master;
      // Compressor glues everything and boosts perceived loudness
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 8;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.18;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      this.started = true;
      this.startAmbience();
    } catch (e) { console.warn("Audio unavailable", e); }
  }

  setMasterVolume(v) {
    this.settings.set("master", v);
    if (this.master) this.master.gain.value = v;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.settings.data.master;
    return this.muted;
  }

  tone(freq, type = "sine", dur = 0.1, vol = 0.28) {
    if (!this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol * this.settings.data.sfxVolume, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.connect(g).connect(this.master);
    o.start(now); o.stop(now + dur + 0.05);
  }

  noise(dur = 0.2, vol = 0.18, filterFreq = 1200, type = "bandpass") {
    if (!this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq; f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * this.settings.data.sfxVolume, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(now);
  }

  /** Start looping ambient drone + wind. */
  startAmbience() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    // deep drone
    const drone = ctx.createOscillator();
    drone.type = "sine"; drone.frequency.value = 55;
    const droneG = ctx.createGain();
    droneG.gain.value = 0.15 * this.settings.data.musicVolume;
    drone.connect(droneG).connect(this.master);
    drone.start();

    const drone2 = ctx.createOscillator();
    drone2.type = "sine"; drone2.frequency.value = 82.5;
    const drone2G = ctx.createGain(); drone2G.gain.value = 0.1 * this.settings.data.musicVolume;
    drone2.connect(drone2G).connect(this.master);
    drone2.start();

    // wind: filtered noise with LFO
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, sr * 4, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const wind = ctx.createBufferSource(); wind.buffer = buf; wind.loop = true;
    const windF = ctx.createBiquadFilter(); windF.type = "bandpass"; windF.frequency.value = 500; windF.Q.value = 0.6;
    const windG = ctx.createGain(); windG.gain.value = 0.08 * this.settings.data.musicVolume;
    const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.15;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.02;
    lfo.connect(lfoG).connect(windG.gain);
    wind.connect(windF).connect(windG).connect(this.master);
    wind.start(); lfo.start();

    this.ambienceNodes.push(drone, drone2, wind, lfo);
  }

  /** Play horror organ music step — BPM scales with level (driven externally). */
  updateMusic(dt, level) {
    if (!this.started) return;
    const stepDur = (60 / this.bpm) / 2;
    this.musicTimer += dt / 1000;
    if (this.musicTimer < stepDur) return;
    this.musicTimer = 0;
    this.musicStep += 1;
    const intensity = clamp(Math.ceil(level / 2), 1, 7);
    const melody = ["A4", "C5", "E5", "C5", "D5", "C5", "B4", "A4", "G4", "A4", "C5", "E5", "D5", "C5", "B4", "G#4"];
    const bass = ["A2", "A2", "E2", "E2", "F2", "F2", "E2", "G2"];
    const pipe = ["A3", "E4", "A4", "E4"];
    const vol = 0.14 * this.settings.data.musicVolume;
    this.tone(NOTE_FREQUENCIES[melody[this.musicStep % melody.length]], "sine", 0.38, vol);
    if (intensity >= 2 && this.musicStep % 2 === 0) this.tone(NOTE_FREQUENCIES[bass[(this.musicStep / 2) % bass.length]], "sawtooth", 0.42, vol * 1.2);
    if (intensity >= 3) this.tone(NOTE_FREQUENCIES[pipe[this.musicStep % pipe.length]] * 0.5, "square", 0.28, vol * 0.6);
    if (intensity >= 4 && this.musicStep % 4 === 0) this.noise(0.15, vol * 0.8, 180, "lowpass");
    if (intensity >= 5 && this.musicStep % 8 === 4) this.tone(NOTE_FREQUENCIES["D#5"], "sawtooth", 0.3, vol * 1.1);
    if (intensity >= 6 && this.musicStep % 16 === 8) this.tone(NOTE_FREQUENCIES["A5"] * 1.06, "sawtooth", 0.5, vol * 0.9);
  }

  // ==================== SOUND EFFECTS ====================
  sfx(name) {
    if (!this.started) return;
    const s = this.settings.data.sfxVolume;
    switch (name) {
      case "move": this.noise(0.05, 0.04 * s, 400, "highpass"); break;
      case "rotate": this.noise(0.05, 0.05 * s, 800, "bandpass"); this.tone(420, "triangle", 0.04, 0.03 * s); break;
      case "lock": this.tone(140, "sawtooth", 0.08, 0.1 * s); this.noise(0.08, 0.05 * s, 160, "lowpass"); break;
      case "lineClear":
        this._wail(600, 1000, 0.4, 0.22 * s); break;
      case "tetris": this._horrorSting(1.0 * s); break;
      case "tSpin": this.tone(740, "sawtooth", 0.15, 0.2 * s); break;
      case "levelUp": this._thunderclap(0.35 * s); this.tone(440, "triangle", 0.6, 0.12 * s); break;
      case "hardDrop": this.tone(95, "square", 0.1, 0.28 * s); this.noise(0.22, 0.18 * s, 100, "lowpass"); break;
      case "hold": this.tone(320, "square", 0.06, 0.14 * s); break;
      case "gameOver": this._descendingMinor(0.32 * s); break;
      case "draculaAppear": this._pipeOrganChord(0.28 * s); break;
      case "draculaRoar": this.noise(1.4, 0.3 * s, 120, "lowpass"); this.tone(90, "sawtooth", 1.0, 0.22 * s); this.tone(55, "sine", 1.2, 0.2 * s); break;
      case "draculaDefeat": this.noise(0.5, 0.22 * s, 2400, "highpass"); break;
      case "werewolfHowl": this._howl(0.32 * s); break;
      case "ghost": this._whisper(0.2 * s); break;
      case "spider": for (let i = 0; i < 6; i += 1) setTimeout(() => this.noise(0.02, 0.14 * s, 3200, "bandpass"), i * 40); break;
      case "garlic": this._angelicBell(0.28 * s); break;
      case "cross": this._churchBell(0.28 * s); break;
      case "witchBrew": for (let i = 0; i < 10; i += 1) setTimeout(() => this.noise(0.05, 0.12 * s, 200 + Math.random() * 400, "bandpass"), i * 50); break;
      case "deathRattle": this.tone(70, "sawtooth", 0.4, 0.26 * s); this.noise(0.25, 0.2 * s, 120, "lowpass"); break;
      case "candle": this.noise(0.35, 0.18 * s, 1200, "highpass"); break;
      case "bat": this.noise(0.03, 0.14 * s, 4000, "highpass"); break;
      case "bloodSplat": this.tone(60, "sawtooth", 0.2, 0.2 * s); this.noise(0.18, 0.2 * s, 400, "lowpass"); break;
      case "shadow": this.tone(30, "sine", 0.6, 0.14 * s); break;
      case "heavyStone": this.tone(45, "sawtooth", 0.5, 0.28 * s); this.noise(0.3, 0.2 * s, 80, "lowpass"); break;
      case "cobweb": this.noise(0.2, 0.14 * s, 3000, "bandpass"); break;
      case "heartbeat": this._heartbeat(0.32 * s); break;
      case "jumpscare": this.noise(0.35, 0.5 * s, 2400, "bandpass"); this.tone(1200, "sawtooth", 0.2, 0.3 * s); break;
      case "wolfDistant": this._howl(0.05 * s, true); break;
      case "creak": this._creak(0.05 * s); break;
      case "drip": this.tone(900, "sine", 0.08, 0.05 * s); break;
      default: this.tone(300, "sine", 0.08, 0.05 * s);
    }
  }

  _wail(startF, endF, dur, vol) {
    const ctx = this.ctx; const now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(startF, now);
    o.frequency.exponentialRampToValueAtTime(endF, now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(this.master);
    o.start(now); o.stop(now + dur + 0.1);
  }

  _horrorSting(vol) {
    // Psycho shower chord: dissonant high cluster
    [622, 740, 880, 1046].forEach((f, i) => {
      const ctx = this.ctx; const now = ctx.currentTime + i * 0.03;
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(vol * 1.0, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      o.connect(g).connect(this.master);
      o.start(now); o.stop(now + 0.4);
    });
  }

  _thunderclap(vol) {
    this.noise(0.7, vol * 1.6, 150, "lowpass");
    setTimeout(() => this.noise(0.3, vol * 0.8, 3000, "highpass"), 60);
  }

  _descendingMinor(vol) {
    const notes = ["A4", "F4", "D4", "A3"];
    notes.forEach((n, i) => setTimeout(() => this.tone(NOTE_FREQUENCIES[n], "sine", 0.6, vol), i * 220));
  }

  _pipeOrganChord(vol) {
    // D minor chord on "organ" (stacked square/saw)
    [146.83, 220, 293.66].forEach((f) => {
      this.tone(f, "sawtooth", 1.2, vol * 0.55);
      this.tone(f * 2, "square", 1.2, vol * 0.25);
    });
  }

  _howl(vol, distant = false) {
    const ctx = this.ctx; const now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = "sawtooth";
    const startF = distant ? 200 : 260;
    const peakF = distant ? 600 : 900;
    o.frequency.setValueAtTime(startF, now);
    o.frequency.exponentialRampToValueAtTime(peakF, now + 0.6);
    o.frequency.exponentialRampToValueAtTime(startF * 0.7, now + 1.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.7);
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = distant ? 400 : 900; f.Q.value = 2;
    o.connect(f).connect(g).connect(this.master);
    o.start(now); o.stop(now + 1.8);
  }

  _whisper(vol) {
    const ctx = this.ctx; const now = ctx.currentTime;
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, Math.floor(sr * 1.2), sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      const env = Math.sin((i / data.length) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1100; f.Q.value = 4;
    const am = ctx.createOscillator(); am.type = "sine"; am.frequency.value = 6;
    const amG = ctx.createGain(); amG.gain.value = 0.5;
    const g = ctx.createGain(); g.gain.value = vol;
    am.connect(amG); amG.connect(g.gain);
    src.connect(f).connect(g).connect(this.master);
    src.start(now); am.start(now);
  }

  _angelicBell(vol) {
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => this.tone(f, "sine", 0.6, vol * (1 - i * 0.1)), i * 80);
    });
  }

  _churchBell(vol) {
    this.tone(196, "sine", 1.2, vol);
    this.tone(392, "sine", 1.2, vol * 0.7);
    this.tone(588, "sine", 1.2, vol * 0.3);
  }

  _heartbeat(vol) {
    const ctx = this.ctx; const now = ctx.currentTime;
    const beat = (t) => {
      const o = ctx.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(70, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 0.22);
    };
    beat(now);
    beat(now + 0.18);
  }

  _creak(vol) {
    const ctx = this.ctx; const now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(180 + Math.random() * 60, now);
    o.frequency.linearRampToValueAtTime(120 + Math.random() * 40, now + 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol * 0.4, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 700; f.Q.value = 3;
    o.connect(f).connect(g).connect(this.master);
    o.start(now); o.stop(now + 0.7);
  }
}

// ============================================================
//                       BAT SWARM (background canvas)
// ============================================================

class BatSwarm {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.bats = [];
    this._resize();
    window.addEventListener("resize", () => this._resize());
    for (let i = 0; i < 8; i += 1) this.bats.push(this._spawn());
  }

  _resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  _spawn() {
    return {
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height * 0.7,
      vx: randf(0.4, 2) * (Math.random() < 0.5 ? -1 : 1),
      vy: randf(-0.3, 0.3),
      wing: Math.random() * Math.PI * 2,
      wingSpeed: randf(0.2, 0.5),
      size: randf(6, 14),
      life: randf(6000, 15000),
    };
  }

  update(dt, countBoost = 0) {
    while (this.bats.length < 8 + countBoost) this.bats.push(this._spawn());
    for (const b of this.bats) {
      b.x += b.vx; b.y += b.vy; b.wing += b.wingSpeed; b.life -= dt;
      if (b.x < -40) b.x = this.canvas.width + 40;
      if (b.x > this.canvas.width + 40) b.x = -40;
      b.vy += (Math.random() - 0.5) * 0.08;
      b.vy = clamp(b.vy, -0.8, 0.8);
    }
    this.bats = this.bats.filter((b) => b.life > 0);
  }

  draw() {
    const c = this.ctx;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const b of this.bats) {
      c.save();
      c.translate(b.x, b.y);
      const w = Math.sin(b.wing) * 0.5 + 0.8;
      c.scale(b.vx < 0 ? -1 : 1, 1);
      c.fillStyle = "rgba(5,3,6,0.95)";
      c.beginPath();
      const s = b.size;
      c.moveTo(-s * w, 0);
      c.quadraticCurveTo(-s * 0.5, -s * 0.6, 0, -s * 0.25);
      c.quadraticCurveTo(s * 0.5, -s * 0.6, s * w, 0);
      c.quadraticCurveTo(s * 0.5, s * 0.2, s * 0.2, s * 0.45);
      c.lineTo(0, s * 0.2); c.lineTo(-s * 0.2, s * 0.45);
      c.quadraticCurveTo(-s * 0.5, s * 0.2, -s * w, 0);
      c.closePath(); c.fill();
      c.restore();
    }
  }
}

// ============================================================
//                    ATMOSPHERE SYSTEM
// ============================================================

/** Handles random horror events: jumpscares, candle flicker, whispers, floating skulls, creaks. */
class AtmosphereSystem {
  constructor(game) {
    this.game = game;
    // First jumpscare lands relatively early so the player actually sees one
    this.jumpscareTimer = randf(20000, 45000);
    this.whisperTimer = randf(25000, 60000);
    this.creakTimer = randf(8000, 22000);
    this.floatTimer = randf(12000, 30000);
    this.lightningTimer = randf(30000, 60000);
    this.wolfTimer = randf(45000, 90000);
    this.floatingSkulls = [];
    this.overlayCtx = $("overlay-canvas").getContext("2d");
  }

  update(dt) {
    this.jumpscareTimer -= dt;
    this.whisperTimer -= dt;
    this.creakTimer -= dt;
    this.floatTimer -= dt;
    this.lightningTimer -= dt;
    this.wolfTimer -= dt;

    // Gate: never during a boss, the line-clear freeze, or off-gameplay screens.
    // If any of those, just delay the attempt a few seconds and retry.
    if (this.jumpscareTimer <= 0) {
      const canFire = this.game.settings.data.jumpscares
        && this.game.state === GAME_STATES.PLAYING
        && !this.game.isEventOnScreen()
        && !this.game.lineClearLock;
      if (canFire) {
        this.triggerJumpscare();
        this.jumpscareTimer = randf(60000, 110000);
      } else {
        this.jumpscareTimer = 4000; // try again shortly
      }
    }
    if (this.whisperTimer <= 0) {
      this.game.audio.sfx("ghost");
      this.whisperTimer = randf(30000, 80000);
    }
    if (this.creakTimer <= 0) {
      this.game.audio.sfx("creak");
      this.creakTimer = randf(10000, 26000);
    }
    if (this.lightningTimer <= 0) {
      this.triggerLightning();
      this.lightningTimer = randf(30000, 65000);
    }
    if (this.wolfTimer <= 0) {
      this.game.audio.sfx("wolfDistant");
      this.wolfTimer = randf(45000, 110000);
    }
    if (this.floatTimer <= 0) {
      this.floatingSkulls.push({
        x: -40, y: randf(60, window.innerHeight - 200),
        vx: randf(0.3, 0.9),
        size: randf(20, 40),
        stare: 0, stareT: randf(4000, 9000),
        opacity: randf(0.08, 0.2),
      });
      this.floatTimer = randf(15000, 34000);
    }
    // update floating skulls
    for (const s of this.floatingSkulls) {
      s.x += s.vx;
      s.stareT -= dt;
      if (s.stareT < 0 && s.stare === 0) { s.stare = 800; s.stareT = 999999; }
      if (s.stare > 0) s.stare -= dt;
    }
    this.floatingSkulls = this.floatingSkulls.filter((s) => s.x < window.innerWidth + 80);

    // render drips on overlay canvas
    this._drawDrips();
    // render floating skulls on bat canvas (background)
    this._drawFloatingSkulls();
  }

  triggerLightning() {
    const l = $("world"); const node = l && l.querySelector(".lightning");
    if (!node) return;
    node.classList.remove("strike"); void node.offsetWidth; node.classList.add("strike");
    this.game.audio.sfx("levelUp"); // light thunder
  }

  triggerJumpscare() {
    const el = $("jumpscare");
    const cv = $("jumpscare-canvas");
    if (!el || !cv) return;
    cv.width = window.innerWidth; cv.height = window.innerHeight;
    // Randomly pick one of several horror subjects
    const kinds = [
      "screaming",
      "skull",
      "hanged",
      "demon",
      "rotten",
      "eyes",
      "bloody-child",
      "witch",
    ];
    const pick = choice(kinds);
    this._drawHorrorScene(cv, pick);
    el.classList.remove("fire"); void el.offsetWidth; el.classList.add("fire");
    setTimeout(() => el.classList.remove("fire"), 870);
    // Screen shake sells the scare
    this.game.shake("lg");
    this.game.audio.sfx("jumpscare");
  }

  _drawHorrorScene(cv, kind) {
    const c = cv.getContext("2d");
    const w = cv.width; const h = cv.height;
    // Black base + moody red vignette
    c.fillStyle = "#000"; c.fillRect(0, 0, w, h);
    const vg = c.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, Math.max(w, h) * 0.7);
    vg.addColorStop(0, "rgba(60, 0, 0, 0)");
    vg.addColorStop(1, "rgba(80, 0, 0, 0.85)");
    c.fillStyle = vg; c.fillRect(0, 0, w, h);

    const cx = w / 2; const cy = h / 2;
    const r = Math.min(w, h) * 0.24;

    switch (kind) {
      case "screaming":    this._faceScreaming(c, cx, cy, r); break;
      case "skull":        this._faceSkull(c, cx, cy, r); break;
      case "hanged":       this._faceHanged(c, cx, cy, r); break;
      case "demon":        this._faceDemon(c, cx, cy, r); break;
      case "rotten":       this._faceRotten(c, cx, cy, r); break;
      case "eyes":         this._faceEyesInDark(c, w, h); break;
      case "bloody-child": this._faceBloodyChild(c, cx, cy, r); break;
      case "witch":        this._faceWitch(c, cx, cy, r); break;
      default:             this._faceScreaming(c, cx, cy, r); break;
    }

    // Blood drip streaks down the screen
    c.fillStyle = "#6a0410";
    for (let i = 0; i < 18; i += 1) {
      const dx = Math.random() * w;
      const dh = 40 + Math.random() * 180;
      c.fillRect(dx, 0, 2 + Math.random() * 3, dh);
      c.beginPath(); c.arc(dx + 1, dh, 3 + Math.random() * 3, 0, Math.PI * 2); c.fill();
    }

    // Scratches across the lens
    c.strokeStyle = "rgba(200, 180, 170, 0.35)"; c.lineWidth = 1;
    for (let i = 0; i < 12; i += 1) {
      const sx = Math.random() * w; const sy = Math.random() * h;
      const sx2 = sx + (Math.random() - 0.5) * 180;
      const sy2 = sy + (Math.random() - 0.5) * 60;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx2, sy2); c.stroke();
    }
  }

  // Classic screaming woman — gaunt, bloody mouth
  _faceScreaming(c, cx, cy, r) {
    c.fillStyle = "#c7b396";
    c.beginPath(); c.ellipse(cx, cy, r * 0.9, r * 1.2, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#1a0a0a"; c.lineWidth = 4; c.stroke();
    // Hollow eyes with red pinpoints
    c.fillStyle = "#050203";
    c.beginPath(); c.ellipse(cx - r * 0.35, cy - r * 0.2, r * 0.18, r * 0.28, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + r * 0.35, cy - r * 0.2, r * 0.18, r * 0.28, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#ff1a2e"; c.shadowColor = "#ff1a2e"; c.shadowBlur = 18;
    c.beginPath(); c.arc(cx - r * 0.35, cy - r * 0.18, r * 0.035, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(cx + r * 0.35, cy - r * 0.18, r * 0.035, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;
    // Screaming mouth
    c.fillStyle = "#050203";
    c.beginPath(); c.ellipse(cx, cy + r * 0.55, r * 0.35, r * 0.52, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#9a0814"; c.lineWidth = 4;
    c.beginPath(); c.ellipse(cx, cy + r * 0.55, r * 0.35, r * 0.52, 0, 0, Math.PI * 2); c.stroke();
    // Gore dripping
    for (let i = 0; i < 8; i += 1) {
      c.fillStyle = "#a10a17";
      c.fillRect(cx + (i - 4) * r * 0.1, cy + r, 3, r * 0.4 + Math.random() * r * 0.3);
    }
  }

  // Grinning skull
  _faceSkull(c, cx, cy, r) {
    c.shadowColor = "#1a0a0a"; c.shadowBlur = 22;
    const grad = c.createRadialGradient(cx - r * 0.2, cy - r * 0.3, r * 0.1, cx, cy, r * 1.3);
    grad.addColorStop(0, "#f5eede");
    grad.addColorStop(1, "#8a7d62");
    c.fillStyle = grad;
    c.beginPath(); c.ellipse(cx, cy - r * 0.1, r * 0.95, r * 1.1, 0, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;
    // Jaw
    c.fillStyle = "#cfc3a6";
    c.beginPath(); c.ellipse(cx, cy + r * 0.55, r * 0.55, r * 0.4, 0, 0, Math.PI * 2); c.fill();
    // Eye sockets
    c.fillStyle = "#050203";
    c.beginPath(); c.ellipse(cx - r * 0.32, cy - r * 0.12, r * 0.22, r * 0.28, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + r * 0.32, cy - r * 0.12, r * 0.22, r * 0.28, 0, 0, Math.PI * 2); c.fill();
    // Glowing pinpoints
    c.fillStyle = "#ff2030"; c.shadowColor = "#ff2030"; c.shadowBlur = 22;
    c.beginPath(); c.arc(cx - r * 0.32, cy - r * 0.05, r * 0.04, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(cx + r * 0.32, cy - r * 0.05, r * 0.04, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;
    // Nose triangle
    c.fillStyle = "#050203";
    c.beginPath();
    c.moveTo(cx, cy + r * 0.1);
    c.lineTo(cx - r * 0.08, cy + r * 0.28);
    c.lineTo(cx + r * 0.08, cy + r * 0.28);
    c.closePath(); c.fill();
    // Teeth
    c.fillStyle = "#3a2a22";
    c.fillRect(cx - r * 0.35, cy + r * 0.45, r * 0.7, r * 0.18);
    c.fillStyle = "#f0e5cc";
    for (let i = 0; i < 8; i += 1) {
      c.fillRect(cx - r * 0.34 + i * r * 0.088, cy + r * 0.46, r * 0.07, r * 0.16);
    }
  }

  // Hanged man — noose + swinging silhouette
  _faceHanged(c, cx, cy, r) {
    c.strokeStyle = "#2a1a0e"; c.lineWidth = 5;
    c.beginPath(); c.moveTo(cx, 0); c.lineTo(cx, cy - r * 1.05); c.stroke();
    // Noose loop
    c.beginPath(); c.ellipse(cx, cy - r * 0.95, r * 0.22, r * 0.14, 0, 0, Math.PI * 2); c.stroke();
    // Body silhouette — tilted
    c.save();
    c.translate(cx, cy - r * 0.6);
    c.rotate(0.1);
    c.fillStyle = "#08050a";
    c.shadowColor = "#000"; c.shadowBlur = 20;
    c.beginPath(); c.ellipse(0, 0, r * 0.4, r * 0.5, 0, 0, Math.PI * 2); c.fill();
    c.fillRect(-r * 0.3, r * 0.3, r * 0.6, r * 1.4);
    // Limp arms
    c.fillRect(-r * 0.55, r * 0.4, r * 0.2, r * 0.9);
    c.fillRect(r * 0.35, r * 0.4, r * 0.2, r * 0.9);
    c.shadowBlur = 0;
    // Gaunt face on silhouette
    c.fillStyle = "#5a3f3a";
    c.beginPath(); c.ellipse(0, -r * 0.1, r * 0.3, r * 0.38, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#050203";
    c.beginPath(); c.arc(-r * 0.1, -r * 0.15, r * 0.06, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(r * 0.1, -r * 0.15, r * 0.06, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#050203"; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-r * 0.1, r * 0.08); c.lineTo(r * 0.1, r * 0.08); c.stroke();
    c.restore();
  }

  // Red-eyed demon
  _faceDemon(c, cx, cy, r) {
    // Horns
    c.fillStyle = "#1a0408";
    c.beginPath();
    c.moveTo(cx - r * 0.5, cy - r * 0.8);
    c.lineTo(cx - r * 0.7, cy - r * 1.5);
    c.lineTo(cx - r * 0.2, cy - r * 0.9);
    c.closePath(); c.fill();
    c.beginPath();
    c.moveTo(cx + r * 0.5, cy - r * 0.8);
    c.lineTo(cx + r * 0.7, cy - r * 1.5);
    c.lineTo(cx + r * 0.2, cy - r * 0.9);
    c.closePath(); c.fill();
    // Face — charcoal + ember skin
    const grad = c.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.3);
    grad.addColorStop(0, "#3a1a18");
    grad.addColorStop(0.7, "#160608");
    grad.addColorStop(1, "#050203");
    c.fillStyle = grad;
    c.beginPath(); c.ellipse(cx, cy, r * 0.95, r * 1.2, 0, 0, Math.PI * 2); c.fill();
    // Ember cracks
    c.strokeStyle = "#ff4010"; c.lineWidth = 2;
    c.shadowColor = "#ff6020"; c.shadowBlur = 12;
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.4);
      c.lineTo(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.9);
      c.stroke();
    }
    c.shadowBlur = 0;
    // Glowing red eyes
    c.fillStyle = "#ff1020"; c.shadowColor = "#ff1020"; c.shadowBlur = 28;
    c.beginPath(); c.ellipse(cx - r * 0.33, cy - r * 0.15, r * 0.14, r * 0.08, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + r * 0.33, cy - r * 0.15, r * 0.14, r * 0.08, 0, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;
    // Fanged grin
    c.fillStyle = "#050203";
    c.beginPath();
    c.moveTo(cx - r * 0.45, cy + r * 0.4);
    c.quadraticCurveTo(cx, cy + r * 0.75, cx + r * 0.45, cy + r * 0.4);
    c.lineTo(cx + r * 0.4, cy + r * 0.5);
    c.quadraticCurveTo(cx, cy + r * 0.85, cx - r * 0.4, cy + r * 0.5);
    c.closePath(); c.fill();
    // Fangs
    c.fillStyle = "#f8efd0";
    for (let i = 0; i < 7; i += 1) {
      const tx = cx - r * 0.35 + i * r * 0.11;
      c.beginPath(); c.moveTo(tx, cy + r * 0.5); c.lineTo(tx + r * 0.04, cy + r * 0.68); c.lineTo(tx + r * 0.09, cy + r * 0.5); c.closePath(); c.fill();
    }
  }

  // Rotten zombie face — sunken, patches of exposed muscle
  _faceRotten(c, cx, cy, r) {
    c.fillStyle = "#6a6b4a";
    c.beginPath(); c.ellipse(cx, cy, r * 0.95, r * 1.2, 0, 0, Math.PI * 2); c.fill();
    // Decay patches
    c.fillStyle = "#8a2418";
    c.beginPath(); c.ellipse(cx - r * 0.5, cy + r * 0.1, r * 0.18, r * 0.12, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + r * 0.3, cy + r * 0.4, r * 0.2, r * 0.14, 0.4, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + r * 0.5, cy - r * 0.3, r * 0.14, r * 0.1, 0, 0, Math.PI * 2); c.fill();
    // Exposed bone fleck
    c.fillStyle = "#e8dcc0";
    c.beginPath(); c.ellipse(cx - r * 0.5, cy + r * 0.1, r * 0.05, r * 0.03, 0, 0, Math.PI * 2); c.fill();
    // Milky sunken eyes
    c.fillStyle = "#1a1a14";
    c.beginPath(); c.ellipse(cx - r * 0.32, cy - r * 0.18, r * 0.2, r * 0.18, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + r * 0.32, cy - r * 0.18, r * 0.2, r * 0.18, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#c0b098";
    c.beginPath(); c.arc(cx - r * 0.3, cy - r * 0.18, r * 0.08, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(cx + r * 0.3, cy - r * 0.18, r * 0.08, 0, Math.PI * 2); c.fill();
    // Lipless snarl
    c.strokeStyle = "#050203"; c.lineWidth = 3;
    c.beginPath();
    c.moveTo(cx - r * 0.4, cy + r * 0.55);
    c.lineTo(cx + r * 0.4, cy + r * 0.55);
    c.stroke();
    c.fillStyle = "#050203";
    c.fillRect(cx - r * 0.4, cy + r * 0.5, r * 0.8, r * 0.15);
    c.fillStyle = "#806a4a";
    for (let i = 0; i < 10; i += 1) {
      c.fillRect(cx - r * 0.38 + i * r * 0.08, cy + r * 0.52, r * 0.05, r * 0.1);
    }
  }

  // Floating red eyes in pitch darkness
  _faceEyesInDark(c, w, h) {
    c.fillStyle = "#000"; c.fillRect(0, 0, w, h);
    const pairs = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < pairs; i += 1) {
      const ex = Math.random() * w;
      const ey = Math.random() * h;
      const sz = 6 + Math.random() * 14;
      c.fillStyle = "#ff1a2e"; c.shadowColor = "#ff1a2e"; c.shadowBlur = 24;
      c.beginPath(); c.ellipse(ex - sz * 2, ey, sz, sz * 0.55, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(ex + sz * 2, ey, sz, sz * 0.55, 0, 0, Math.PI * 2); c.fill();
      // Slit pupils
      c.shadowBlur = 0;
      c.fillStyle = "#000";
      c.fillRect(ex - sz * 2 - 1, ey - sz * 0.5, 2, sz);
      c.fillRect(ex + sz * 2 - 1, ey - sz * 0.5, 2, sz);
    }
    c.shadowBlur = 0;
  }

  // Pale bloody child — unsettling small face, dark hair, tears of blood
  _faceBloodyChild(c, cx, cy, r) {
    // Long black hair behind
    c.fillStyle = "#0a0608";
    c.beginPath();
    c.moveTo(cx - r * 0.95, cy - r * 0.4);
    c.quadraticCurveTo(cx - r * 1.05, cy + r * 1.4, cx - r * 0.3, cy + r * 1.6);
    c.lineTo(cx + r * 0.3, cy + r * 1.6);
    c.quadraticCurveTo(cx + r * 1.05, cy + r * 1.4, cx + r * 0.95, cy - r * 0.4);
    c.quadraticCurveTo(cx + r * 0.6, cy - r * 1.2, cx, cy - r * 1.25);
    c.quadraticCurveTo(cx - r * 0.6, cy - r * 1.2, cx - r * 0.95, cy - r * 0.4);
    c.closePath(); c.fill();
    // Pale face
    c.fillStyle = "#e0d6c4";
    c.beginPath(); c.ellipse(cx, cy, r * 0.68, r * 0.9, 0, 0, Math.PI * 2); c.fill();
    // Tiny dead eyes
    c.fillStyle = "#050203";
    c.beginPath(); c.ellipse(cx - r * 0.22, cy - r * 0.1, r * 0.1, r * 0.08, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + r * 0.22, cy - r * 0.1, r * 0.1, r * 0.08, 0, 0, Math.PI * 2); c.fill();
    // Blood tears
    c.fillStyle = "#9a0814";
    for (const ex of [-0.22, 0.22]) {
      c.fillRect(cx + ex * r - 1, cy - r * 0.05, 2, r * 0.8);
      c.beginPath(); c.arc(cx + ex * r, cy + r * 0.78, 4, 0, Math.PI * 2); c.fill();
    }
    // Small grim mouth smeared with blood
    c.fillStyle = "#6a0410";
    c.beginPath(); c.ellipse(cx, cy + r * 0.45, r * 0.22, r * 0.12, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#a10a17";
    c.fillRect(cx - r * 0.3, cy + r * 0.55, r * 0.6, r * 0.04);
  }

  // Hooded witch with glowing green eyes
  _faceWitch(c, cx, cy, r) {
    // Pointed hat silhouette
    c.fillStyle = "#050203";
    c.beginPath();
    c.moveTo(cx, cy - r * 1.7);
    c.lineTo(cx - r * 0.9, cy - r * 0.5);
    c.lineTo(cx + r * 0.9, cy - r * 0.5);
    c.closePath(); c.fill();
    // Hat brim
    c.fillRect(cx - r * 1.2, cy - r * 0.55, r * 2.4, r * 0.15);
    // Face
    c.fillStyle = "#5a6a4a";
    c.beginPath(); c.ellipse(cx, cy + r * 0.1, r * 0.75, r * 0.95, 0, 0, Math.PI * 2); c.fill();
    // Warts
    c.fillStyle = "#3a4430";
    c.beginPath(); c.arc(cx + r * 0.3, cy - r * 0.1, r * 0.06, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(cx - r * 0.1, cy + r * 0.35, r * 0.04, 0, Math.PI * 2); c.fill();
    // Glowing green eyes
    c.fillStyle = "#62f04a"; c.shadowColor = "#62f04a"; c.shadowBlur = 22;
    c.beginPath(); c.ellipse(cx - r * 0.28, cy - r * 0.1, r * 0.12, r * 0.08, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + r * 0.28, cy - r * 0.1, r * 0.12, r * 0.08, 0, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;
    c.fillStyle = "#050203";
    c.beginPath(); c.arc(cx - r * 0.28, cy - r * 0.1, r * 0.05, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(cx + r * 0.28, cy - r * 0.1, r * 0.05, 0, Math.PI * 2); c.fill();
    // Crooked nose
    c.fillStyle = "#445030";
    c.beginPath();
    c.moveTo(cx, cy - r * 0.05);
    c.lineTo(cx - r * 0.15, cy + r * 0.3);
    c.lineTo(cx + r * 0.05, cy + r * 0.35);
    c.closePath(); c.fill();
    // Cackling mouth
    c.fillStyle = "#050203";
    c.beginPath(); c.ellipse(cx, cy + r * 0.6, r * 0.28, r * 0.16, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#806a4a";
    for (let i = 0; i < 4; i += 1) {
      c.fillRect(cx - r * 0.22 + i * r * 0.13, cy + r * 0.55, r * 0.07, r * 0.12);
    }
  }

  _drawDrips() {
    // currently decorative via CSS
  }

  _drawFloatingSkulls() {
    const cv = $("bat-canvas");
    if (!cv) return;
    const c = cv.getContext("2d");
    for (const s of this.floatingSkulls) {
      c.save();
      c.globalAlpha = s.opacity + (s.stare > 0 ? 0.3 : 0);
      c.translate(s.x, s.y);
      c.fillStyle = "#e8e2cf";
      c.beginPath(); c.arc(0, 0, s.size * 0.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = s.stare > 0 ? "#ff2030" : "#1a0a0a";
      c.beginPath(); c.arc(-s.size * 0.18, -s.size * 0.05, s.size * 0.08, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(s.size * 0.18, -s.size * 0.05, s.size * 0.08, 0, Math.PI * 2); c.fill();
      c.restore();
    }
  }
}

// ============================================================
//                      DRACULA SYSTEM
// ============================================================

/** Dracula boss with 4 attacks. */
class DraculaSystem {
  constructor(game) {
    this.game = game;
    this.state = "IDLE"; // IDLE | REVEAL | ATTACK | LEAVE
    this.timer = 0;
    this.cooldown = 0;
    this.bob = 0;
    this.capeWave = 0;
    this.attack = null;
    this.attackTimer = 0;
    this.defeatCounter = 0;
    this.active = false;
    this.linesWhileActive = 0;
    this.bossBanner = $("boss-banner");
    this.monsterCtx = $("monster-canvas").getContext("2d");
    this.nextScoreTrigger = 5000;
    // Position anchors (set per-canvas at run time)
    this.offscreenX = this.monsterCtx.canvas.width + 80;
    this.attackX = this.monsterCtx.canvas.width / 2.5 + 60; // right side when scaled 2.5x
    this.x = this.offscreenX;
    this.y = 260;
  }

  update(dt) {
    this.cooldown -= dt;
    this.bob += dt * 0.003;
    this.capeWave += dt * 0.004;
    if (this.state === "IDLE") {
      if (this.game.score >= this.nextScoreTrigger && this.cooldown <= 0 && !this.game.isAnyEventActive()) this.trigger();
      return;
    }

    this.timer += dt;
    const ctx = this.monsterCtx;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    if (this.state === "REVEAL") {
      this._drawEyesReveal(ctx, this.timer);
      if (this.timer >= 2200) {
        this._setBanner("YOUR BLOCKS ARE MINE!");
        this.state = "ATTACK";
        this.timer = 0;
        this.x = this.offscreenX;
        this._darkenBoard(false);
        this.game.particles.spawn("BAT", ctx.canvas.width / 2, ctx.canvas.height / 2, 16);
        this.pickAttack();
      }
    } else if (this.state === "ATTACK") {
      // Slide in from the right edge during the first 700ms of ATTACK
      const slideT = clamp(this.timer / 700, 0, 1);
      const ease = 1 - (1 - slideT) ** 3;
      this.x = lerp(this.offscreenX, this.attackX, ease);
      this._drawDracula(ctx, this.x, this.y + Math.sin(this.bob) * 8);
      this.attackTimer -= dt;
      if (this.attackTimer <= 0 && this.attack) this.executeAttackEffect();
      if (this.timer >= 6000 || this.defeated) {
        this.state = "LEAVE";
        this.timer = 0;
      }
    } else if (this.state === "LEAVE") {
      const t = clamp(this.timer / 900, 0, 1);
      this.x = lerp(this.attackX, this.offscreenX, t);
      this._drawDracula(ctx, this.x, this.y + Math.sin(this.bob) * 8);
      if (t >= 1) {
        this.state = "IDLE";
        this.active = false;
        this.defeated = false;
        this.cooldown = 20000;
        this.nextScoreTrigger = this.game.score + 6000;
        this.game.globalBossCooldown = Math.max(this.game.globalBossCooldown, 18000);
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        this._clearBanner();
        this._setVignette(false);
        this.game.flags.garlic = false;
      }
    }
  }

  trigger() {
    if (this.game.flags.garlic) {
      // Garlic shield: skip attack, award bonus
      this.game.addScore(2000);
      this.game.renderer && this.game.showPopup("GARLIC REPELLED DRACULA +2000");
      this.game.flags.garlic = false;
      this.game.updateStatusEffects();
      this.game.audio.sfx("garlic");
      this.cooldown = 20000;
      this.nextScoreTrigger = this.game.score + 6000;
      this.game.globalBossCooldown = Math.max(this.game.globalBossCooldown, 12000);
      return;
    }
    this.active = true;
    this.defeated = false;
    this.linesWhileActive = 0;
    this.state = "REVEAL";
    this.timer = 0;
    this.game.audio.sfx("draculaAppear");
    this._darkenBoard(true);
    this._setVignette(true);
    this.game.stats.monstersEncountered += 1;
    this._setBanner("DRACULA RISES");
    this.game.announceEvent(
      "boss",
      "DRACULA, LORD OF THE CRYPT",
      "The Count rises to drain your souls and curse your stack.",
      "Clear 3 lines while he's on screen to banish him (+2000). Holy Garlic also repels him.",
      6000,
    );
  }

  _setVignette(on) {
    const tint = $("screen-tint");
    if (!tint) return;
    if (on) {
      tint.style.transition = "opacity 0.8s ease";
      tint.style.background = "radial-gradient(ellipse at center, transparent 35%, rgba(160,0,0,0.4) 100%)";
      tint.style.opacity = "1";
    } else {
      tint.style.transition = "opacity 1.2s ease";
      tint.style.opacity = "0";
      setTimeout(() => { if (tint) tint.style.background = ""; }, 1300);
    }
  }

  onLineClearedDuringAttack(n) {
    if (!this.active) return;
    this.linesWhileActive += n;
    if (this.linesWhileActive >= 3) {
      this.defeated = true;
      this.game.addScore(2000);
      this.game.showPopup("MONSTER SLAYER +2000");
      this.game.audio.sfx("draculaDefeat");
      this.game.stats.monstersDefeated += 1;
      this.game.particles.spawn("BAT", this.game.canvas.width / 2, this.game.canvas.height / 2, 24);
    }
  }

  pickAttack() {
    const pool = ["BLOOD_CURSE", "BAT_SWARM", "DARK_VEIL", "SOUL_DRAIN"];
    this.attack = choice(pool);
    this.attackTimer = 1200;
    this._setBanner(({
      BLOOD_CURSE: "BLOOD CURSE — CURSED ROW",
      BAT_SWARM:   "BAT SWARM — BLOCKS SCRAMBLED",
      DARK_VEIL:   "DARK VEIL — GO BLIND",
      SOUL_DRAIN:  "SOUL DRAIN — SCORE STOLEN",
    })[this.attack]);
  }

  executeAttackEffect() {
    const g = this.game;
    this.attackTimer = 99999; // one-shot
    switch (this.attack) {
      case "BLOOD_CURSE": {
        // Cursed row: pick a random row with blocks
        const rows = [];
        for (let y = 0; y < g.board.h; y += 1) {
          if (g.board.grid[y].some((c) => c)) rows.push(y);
        }
        if (rows.length) {
          const y = choice(rows);
          for (let x = 0; x < g.board.w; x += 1) {
            const cell = g.board.grid[y][x] || { color: "#c51c2a", symbol: "blood" };
            cell.cursed = true; cell.color = "#c51c2a"; cell.symbol = "blood";
            g.board.grid[y][x] = cell;
          }
          g.flags.curseTimer = 15000;
        }
        g.audio.sfx("bloodSplat");
        g.particles.spawn("BLOOD", g.canvas.width / 2, g.canvas.height / 2, 40);
        break;
      }
      case "BAT_SWARM": {
        // Scramble ~8 blocks
        const cells = [];
        for (let y = 0; y < g.board.h; y += 1) for (let x = 0; x < g.board.w; x += 1) if (g.board.grid[y][x]) cells.push([x, y]);
        for (let i = 0; i < Math.min(10, cells.length); i += 1) {
          const [ax, ay] = cells[rand(0, cells.length - 1)];
          const [bx, by] = cells[rand(0, cells.length - 1)];
          const tmp = g.board.grid[ay][ax];
          g.board.grid[ay][ax] = g.board.grid[by][bx];
          g.board.grid[by][bx] = tmp;
        }
        g.particles.spawn("BAT", g.canvas.width / 2, g.canvas.height / 2, 40);
        g.audio.sfx("draculaRoar");
        break;
      }
      case "DARK_VEIL": {
        g.flags.darkVeilTimer = 4000;
        g.audio.sfx("draculaRoar");
        break;
      }
      case "SOUL_DRAIN": {
        const amt = Math.min(500, g.score);
        g.addScore(-amt);
        g.showPopup(`SOUL DRAIN -${amt}`);
        g.audio.sfx("ghost");
        g.particles.spawn("SPARKLE", g.canvas.width / 2, g.canvas.height / 2, 28);
        break;
      }
      default: break;
    }
    g.updateStatusEffects();
  }

  _setBanner(text) {
    if (!this.bossBanner) return;
    this.bossBanner.textContent = text;
    this.bossBanner.classList.add("on");
  }

  _clearBanner() {
    if (!this.bossBanner) return;
    this.bossBanner.classList.remove("on");
  }

  _darkenBoard(on) {
    const el = $("board-darken");
    if (el) el.classList.toggle("on", on && this.state === "REVEAL");
  }

  _drawEyesReveal(c, t) {
    const cx = c.canvas.width / 2;
    const cy = c.canvas.height / 2;
    const prog = clamp(t / 2200, 0, 1);
    c.save();
    c.fillStyle = `rgba(0,0,0,${0.92 * prog})`;
    c.fillRect(0, 0, c.canvas.width, c.canvas.height);
    const blink = Math.sin(t * 0.006) > -0.3 ? 1 : 0.2;
    c.fillStyle = `rgba(255,30,50,${blink})`;
    c.shadowColor = "#ff1020"; c.shadowBlur = 30;
    c.beginPath(); c.arc(cx - 30, cy, 10 + prog * 20, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(cx + 30, cy, 10 + prog * 20, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  _drawDracula(c, x, y) {
    c.save();
    c.translate(x, y);
    c.scale(2.5, 2.5);
    const cw = this.capeWave;

    // Aura glow behind him so he pops off the dark board
    c.shadowColor = "#ff1a2e"; c.shadowBlur = 22;

    // Cape — deep crimson with a fleshy gradient
    const capeGrad = c.createLinearGradient(0, 30, 0, 220);
    capeGrad.addColorStop(0, "#6a0a1a");
    capeGrad.addColorStop(0.5, "#3f0812");
    capeGrad.addColorStop(1, "#1a0308");
    c.fillStyle = capeGrad;
    c.beginPath();
    c.moveTo(-30, 30);
    c.quadraticCurveTo(-50 + Math.sin(cw) * 10, 120, -40, 220);
    c.quadraticCurveTo(0, 240, 40, 220);
    c.quadraticCurveTo(50 + Math.sin(cw + 1) * 10, 120, 30, 30);
    c.closePath(); c.fill();
    c.shadowBlur = 0;

    // Blood-red cape inner lining
    c.fillStyle = "#a1121e";
    c.beginPath();
    c.moveTo(-22, 34);
    c.quadraticCurveTo(-14, 120, -22, 200);
    c.quadraticCurveTo(0, 218, 22, 200);
    c.quadraticCurveTo(14, 120, 22, 34);
    c.closePath(); c.fill();

    // Shirt — ruffled bone-white with purple tint
    c.fillStyle = "#e8dccf";
    c.fillRect(-18, 60, 36, 80);
    c.fillStyle = "#1a0a1a";
    c.fillRect(-3, 60, 6, 80); // buttons strip

    // Blood stain on shirt
    c.fillStyle = "#c51c2a";
    c.beginPath();
    c.ellipse(6, 105, 10, 14, 0.2, 0, Math.PI * 2); c.fill();

    // Head — pale vampire skin with a purple undertone
    const headGrad = c.createRadialGradient(0, 30, 4, 0, 30, 28);
    headGrad.addColorStop(0, "#f5e7d2");
    headGrad.addColorStop(1, "#c8b29c");
    c.fillStyle = headGrad;
    c.beginPath(); c.ellipse(0, 30, 22, 28, 0, 0, Math.PI * 2); c.fill();

    // Hair — dark violet widow's peak (visible, not black)
    c.fillStyle = "#2a0f3a";
    c.beginPath();
    c.moveTo(-22, 18); c.lineTo(0, 10); c.lineTo(22, 18);
    c.quadraticCurveTo(24, 38, 22, 50); c.lineTo(-22, 50);
    c.quadraticCurveTo(-24, 38, -22, 18); c.closePath(); c.fill();
    // Hair highlight
    c.fillStyle = "#4a1f5a";
    c.beginPath();
    c.moveTo(-10, 14); c.lineTo(0, 12); c.lineTo(10, 14);
    c.lineTo(6, 22); c.lineTo(-6, 22); c.closePath(); c.fill();

    // Brows — dark violet
    c.strokeStyle = "#2a0f3a"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-12, 24); c.lineTo(-4, 28); c.moveTo(12, 24); c.lineTo(4, 28); c.stroke();

    // Glowing red eyes
    c.shadowColor = "#ff1020"; c.shadowBlur = 14;
    c.fillStyle = "#ff3040";
    c.beginPath(); c.arc(-8, 32, 2.8, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(8, 32, 2.8, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;

    // Fangs
    c.fillStyle = "#f8f2d8";
    c.beginPath(); c.moveTo(-4, 44); c.lineTo(-2, 52); c.lineTo(0, 44); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(4, 44); c.lineTo(2, 52); c.lineTo(0, 44); c.closePath(); c.fill();

    // Blood drip from mouth
    c.fillStyle = "#c51c2a";
    c.fillRect(-1, 46, 2, 8 + Math.sin(performance.now() * 0.004) * 2);

    // Arm pointing out with clawed hand
    c.fillStyle = "#e8dccf";
    c.fillRect(18, 70, 40, 6);
    c.strokeStyle = "#2a0f3a"; c.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      c.beginPath(); c.moveTo(58 + i * 3, 72); c.lineTo(66 + i * 4, 76 + i); c.stroke();
    }
    c.restore();
  }

  _drawDefeatExplosion(c) {
    // noop: particles handled via system
  }
}

// ============================================================
//                      WEREWOLF SYSTEM
// ============================================================

class WerewolfSystem {
  constructor(game) {
    this.game = game;
    this.cooldown = 120000 + randf(0, 60000);
    this.state = "IDLE"; // IDLE | CRASH | HOWL | LEAP
    this.timer = 0;
    this.x = 400; this.y = 500;
    this.slashCount = 0;
    this.ctx = $("monster-canvas").getContext("2d");
  }

  update(dt) {
    this.cooldown -= dt;
    if (this.state === "IDLE") {
      if (this.cooldown <= 0 && this.game.level >= 1 && !this.game.isAnyEventActive()) {
        this.trigger();
      }
      return;
    }
    this.timer += dt;
    const c = this.ctx;
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    if (this.state === "CRASH") {
      const t = clamp(this.timer / 650, 0, 1);
      this.x = lerp(420, 280, t);
      this._drawWolf(c, this.x, this.y);
      if (t >= 1) { this.state = "HOWL"; this.timer = 0; this.game.audio.sfx("werewolfHowl"); }
    } else if (this.state === "HOWL") {
      this._drawWolf(c, this.x, this.y, true);
      if (this.timer >= 800) { this.state = "SLASH"; this.timer = 0; this.slashCount = 0; }
    } else if (this.state === "SLASH") {
      this._drawWolf(c, this.x, this.y, false);
      if (this.timer >= 220) {
        this._doSlash();
        this.timer = 0;
        this.slashCount += 1;
        if (this.slashCount >= 3) { this.state = "LEAP"; this.timer = 0; }
      }
    } else if (this.state === "LEAP") {
      const t = clamp(this.timer / 650, 0, 1);
      this.x = lerp(280, 560, t);
      this.y = lerp(500, 100, t);
      this._drawWolf(c, this.x, this.y);
      if (t >= 1) {
        this.state = "IDLE";
        this.cooldown = 150000 + randf(0, 60000);
        this.game.globalBossCooldown = Math.max(this.game.globalBossCooldown, 18000);
        c.clearRect(0, 0, c.canvas.width, c.canvas.height);
        if (this.game.bossBanner) this.game.bossBanner.classList.remove("on");
      }
    }
  }

  trigger() {
    if (this.game.flags.garlic) {
      this.game.flags.garlic = false;
      this.game.showPopup("GARLIC WARDED THE WOLF");
      this.cooldown = 120000;
      this.game.globalBossCooldown = Math.max(this.game.globalBossCooldown, 12000);
      this.game.updateStatusEffects();
      return;
    }
    this.state = "CRASH"; this.timer = 0;
    this.game.stats.monstersEncountered += 1;
    if (this.game.bossBanner) {
      this.game.bossBanner.textContent = "WEREWOLF RAMPAGE!";
      this.game.bossBanner.classList.add("on");
    }
    this.game.shake("lg");
    this.game.audio.sfx("werewolfHowl");
    this.game.announceEvent(
      "boss",
      "WEREWOLF RAMPAGE",
      "A cursed beast leaps onto the board and slashes your blocks.",
      "Ride it out — the slashes can actually clear troublesome rows. Garlic wards him off.",
      5500,
    );
  }

  _doSlash() {
    const g = this.game;
    const y1 = rand(4, BOARD_H - 2);
    const slashCol = [0, BOARD_W - 1];
    const cleared = g.board.slash(slashCol[0], y1, slashCol[1], y1 + rand(-2, 2));
    g.addScore(cleared * 400);
    if (cleared) g.showPopup(`SLASHED ${cleared} +${cleared * 400}`);
    g.particles.spawn("ASH", g.canvas.width / 2, y1 * CELL, 24);
    g.audio.sfx("heavyStone");
    g.shake("md");
    g.board.applyGravity();
  }

  _drawWolf(c, x, y, howling = false) {
    c.save();
    c.translate(x, y);
    c.scale(-1, 1);

    // Moonlit silver-grey fur gradient so he's actually visible
    c.shadowColor = "#3a4a6a"; c.shadowBlur = 16;
    const furGrad = c.createLinearGradient(0, -22, 0, 42);
    furGrad.addColorStop(0, "#6a7084");
    furGrad.addColorStop(0.5, "#3a3f4f");
    furGrad.addColorStop(1, "#1f2030");
    c.fillStyle = furGrad;
    c.beginPath();
    c.ellipse(0, 10, 60, 32, 0, 0, Math.PI * 2); c.fill();
    // head
    c.beginPath(); c.ellipse(-46, -10, 26, 22, 0, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;

    // Fur streaks for texture
    c.strokeStyle = "#2a3040"; c.lineWidth = 1;
    for (let i = 0; i < 8; i += 1) {
      c.beginPath();
      c.moveTo(-30 + i * 8, -5 + (i % 2) * 3);
      c.lineTo(-26 + i * 8, 18 + (i % 2) * 4);
      c.stroke();
    }

    // Snout — darker
    c.fillStyle = "#2f1f2a";
    c.beginPath(); c.moveTo(-70, -2); c.lineTo(-90, howling ? -14 : -4); c.lineTo(-90, 8); c.lineTo(-70, 10); c.closePath(); c.fill();

    // Bloody fangs
    c.fillStyle = "#f8efd0";
    for (let i = 0; i < 5; i += 1) {
      const tx = -88 + i * 4;
      c.beginPath(); c.moveTo(tx, 0); c.lineTo(tx + 1, 4); c.lineTo(tx + 2, 0); c.closePath(); c.fill();
    }
    c.fillStyle = "#c51c2a";
    c.fillRect(-84, 3, 2, 4 + Math.sin(performance.now() * 0.005) * 2);

    // Eyes — brighter yellow-green glow
    c.fillStyle = "#f7ee3b"; c.shadowColor = "#f7ee3b"; c.shadowBlur = 14;
    c.beginPath(); c.arc(-54, -14, 3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(-40, -14, 3, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;

    // Ears
    c.fillStyle = "#2a2f3f";
    c.beginPath(); c.moveTo(-60, -26); c.lineTo(-54, -40); c.lineTo(-50, -26); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-44, -26); c.lineTo(-38, -40); c.lineTo(-32, -26); c.closePath(); c.fill();
    // Inner ear
    c.fillStyle = "#a1121e";
    c.beginPath(); c.moveTo(-56, -28); c.lineTo(-54, -36); c.lineTo(-52, -28); c.closePath(); c.fill();

    // Legs
    c.fillStyle = "#1a1a26";
    c.fillRect(30, 28, 8, 22);
    c.fillRect(10, 28, 8, 22);
    c.fillRect(-20, 28, 8, 22);
    c.fillRect(-40, 28, 8, 22);

    // Raised claws
    c.fillStyle = "#f8efd0";
    for (let i = 0; i < 3; i += 1) {
      c.beginPath(); c.moveTo(-10 + i * 4, -30); c.lineTo(-6 + i * 4, -50); c.lineTo(-2 + i * 4, -30); c.closePath(); c.fill();
    }
    c.restore();
  }
}

// ============================================================
//                       GHOST SYSTEM
// ============================================================

class GhostSystem {
  constructor(game) {
    this.game = game;
    this.cooldown = 90000 + randf(0, 60000);
    this.active = false;
    this.y = BOARD_H * CELL + 40;
    this.ctx = $("monster-canvas").getContext("2d");
    this.touchedPiece = false;
  }

  update(dt) {
    this.cooldown -= dt;
    if (!this.active && this.cooldown <= 0 && !this.game.isAnyEventActive()) {
      this.trigger();
      return;
    }
    if (!this.active) return;
    // Ascend quickly — the old speed took ~16s to cross the board which
    // dragged on. Now it takes ~5s and feels like a proper pass-through.
    this.y -= 2.4 * (dt / 16);
    const c = this.ctx;
    this._drawGhost(c, this.game.canvas.width / 2, this.y);
    // check touching piece
    const p = this.game.currentPiece;
    if (p && !this.touchedPiece) {
      const piY = p.y * CELL + CELL;
      if (Math.abs(piY - this.y) < 18) {
        this.touchedPiece = true;
        this.game.flags.inverted = 5000;
        this.game.audio.sfx("ghost");
        const tint = $("screen-tint"); if (tint) tint.classList.add("blue");
        setTimeout(() => tint && tint.classList.remove("blue"), 5000);
        this.game.updateStatusEffects();
      }
    }
    if (this.y < -40) {
      this.active = false;
      this.cooldown = 120000 + randf(0, 60000);
      this.game.globalBossCooldown = Math.max(this.game.globalBossCooldown, 15000);
      this.touchedPiece = false;
      this.game.particles.spawn("SPARKLE", this.game.canvas.width / 2, 20, 24);
    }
  }

  trigger() {
    this.active = true;
    this.y = BOARD_H * CELL + 40;
    this.touchedPiece = false;
    this.game.showPopup("A SPIRIT PASSES THROUGH");
    this.game.audio.sfx("ghost");
    this.game.stats.monstersEncountered += 1;
    this.game.announceEvent(
      "boss",
      "RESTLESS SPIRIT",
      "A phantom drifts up through the board, seeking a living piece to touch.",
      "Move your piece out of its column. If it touches you, controls invert for 5 seconds.",
      5500,
    );
  }

  _drawGhost(c, x, y) {
    c.save();
    c.scale ? null : null;
    const t = performance.now() * 0.003;

    // Cyan ectoplasm aura
    c.shadowColor = "#8adfff"; c.shadowBlur = 26;
    c.globalAlpha = 0.72 + Math.sin(t) * 0.15;

    // Body — pale blue-white with luminous gradient
    const bodyGrad = c.createRadialGradient(x, y - 20, 6, x, y - 10, 40);
    bodyGrad.addColorStop(0, "#ffffff");
    bodyGrad.addColorStop(0.5, "#c8e0ff");
    bodyGrad.addColorStop(1, "#6a8fcc");
    c.fillStyle = bodyGrad;
    c.beginPath();
    c.moveTo(x - 28, y - 10);
    c.quadraticCurveTo(x - 36, y - 46, x, y - 50);
    c.quadraticCurveTo(x + 36, y - 46, x + 28, y - 10);
    // wavy bottom tendrils
    for (let i = 0; i < 4; i += 1) {
      const wx = x + 28 - i * 18;
      c.quadraticCurveTo(wx - 5, y + 12 + Math.sin(t + i) * 4, wx - 9, y - 4);
    }
    c.closePath(); c.fill();

    // Eyes — hollow black voids with cyan glow
    c.shadowBlur = 0;
    c.globalAlpha = 0.95;
    c.fillStyle = "#050510";
    c.beginPath(); c.ellipse(x - 9, y - 26, 3, 6, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(x + 9, y - 26, 3, 6, 0, 0, Math.PI * 2); c.fill();
    // eye glow pinpoints
    c.fillStyle = "#8adfff"; c.shadowColor = "#8adfff"; c.shadowBlur = 8;
    c.beginPath(); c.arc(x - 9, y - 26, 0.8, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x + 9, y - 26, 0.8, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;
    // Mouth — screaming O
    c.fillStyle = "#050510";
    c.beginPath(); c.ellipse(x, y - 14, 4, 7, 0, 0, Math.PI * 2); c.fill();

    // Trail sparkles
    if (Math.random() < 0.3) this.game.particles.spawn("SPARKLE", x + randf(-16, 16), y + 10, 1, { raw: true });
    c.restore();
  }
}

// ============================================================
//                       SPIDER SYSTEM
// ============================================================

class SpiderSystem {
  constructor(game) {
    this.game = game;
    this.cooldown = 135000 + randf(0, 60000);
    this.state = "IDLE"; // IDLE | DESCEND | WEB | ASCEND
    this.timer = 0;
    this.y = -30; this.x = 0;
    this.targetBlocks = [];
    this.spread = 5000;
    this.ctx = $("monster-canvas").getContext("2d");
  }

  update(dt) {
    this.cooldown -= dt;
    if (this.state === "IDLE") {
      if (this.game.level >= 2 && this.cooldown <= 0 && !this.game.isAnyEventActive()) this.trigger();
      // spread web to adjacent
      this.spread -= dt;
      if (this.spread <= 0) {
        this._spreadWebs();
        this.spread = 5000;
      }
      return;
    }
    this.timer += dt;
    const c = this.ctx; c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    if (this.state === "DESCEND") {
      const t = clamp(this.timer / 1200, 0, 1);
      this.y = lerp(-30, 400, t);
      this._drawSpider(c, this.x, this.y);
      this._drawWebThread(c, this.x, this.y);
      if (t >= 1) { this.state = "WEB"; this.timer = 0; this._webBlocks(); }
    } else if (this.state === "WEB") {
      this._drawSpider(c, this.x, this.y);
      this._drawWebThread(c, this.x, this.y);
      if (this.timer > 900) { this.state = "ASCEND"; this.timer = 0; }
    } else if (this.state === "ASCEND") {
      const t = clamp(this.timer / 1000, 0, 1);
      this.y = lerp(400, -40, t);
      this._drawSpider(c, this.x, this.y);
      this._drawWebThread(c, this.x, this.y);
      if (t >= 1) {
        this.state = "IDLE";
        this.cooldown = 150000 + randf(0, 60000);
        this.game.globalBossCooldown = Math.max(this.game.globalBossCooldown, 15000);
        c.clearRect(0, 0, c.canvas.width, c.canvas.height);
        if (this.game.bossBanner) this.game.bossBanner.classList.remove("on");
      }
    }
  }

  trigger() {
    if (this.game.flags.garlic) {
      this.game.flags.garlic = false;
      this.game.showPopup("GARLIC BURNED THE WEB");
      this.cooldown = 120000;
      this.game.globalBossCooldown = Math.max(this.game.globalBossCooldown, 12000);
      this.game.updateStatusEffects();
      return;
    }
    this.state = "DESCEND"; this.timer = 0;
    this.x = rand(2, BOARD_W - 3) * CELL + CELL / 2;
    this.targetBlocks = [];
    if (this.game.bossBanner) {
      this.game.bossBanner.textContent = "SPIDER INFESTATION!";
      this.game.bossBanner.classList.add("on");
    }
    this.game.audio.sfx("spider");
    this.game.stats.monstersEncountered += 1;
    this.game.announceEvent(
      "boss",
      "SPIDER INFESTATION",
      "Webs bind your blocks — webbed cells don't count toward line clears.",
      "Clear webbed rows fast, or cleanse with a Silver Cross power-up.",
      5500,
    );
  }

  _webBlocks() {
    const g = this.game;
    const candidates = [];
    for (let y = 0; y < g.board.h; y += 1) for (let x = 0; x < g.board.w; x += 1) if (g.board.grid[y][x] && !g.board.grid[y][x].webbed) candidates.push([x, y]);
    for (let i = 0; i < Math.min(4, candidates.length); i += 1) {
      const [x, y] = candidates.splice(rand(0, candidates.length - 1), 1)[0];
      g.board.grid[y][x].webbed = true;
      this.targetBlocks.push([x, y]);
    }
    g.flags.webTimer = 20000;
    g.updateStatusEffects();
  }

  _spreadWebs() {
    const g = this.game;
    for (let y = 0; y < g.board.h; y += 1) {
      for (let x = 0; x < g.board.w; x += 1) {
        const c = g.board.grid[y][x];
        if (c && c.webbed) {
          const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          for (const [dx, dy] of dirs) {
            const nx = x + dx; const ny = y + dy;
            if (g.board.inside(nx, ny)) {
              const n = g.board.grid[ny][nx];
              if (n && !n.webbed && Math.random() < 0.35) n.webbed = true;
            }
          }
        }
      }
    }
  }

  _drawSpider(c, x, y) {
    c.save();
    c.translate(x, y);
    c.scale(1.6, 1.6); // bigger so he's readable

    // Purple aura so the dark shape pops
    c.shadowColor = "#9b1fff"; c.shadowBlur = 14;

    // Long legs in dark purple
    c.strokeStyle = "#3a1252"; c.lineWidth = 2.5;
    c.lineCap = "round";
    for (let i = 0; i < 8; i += 1) {
      const a = -Math.PI / 2 + (i - 4) * 0.25;
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(Math.cos(a) * 14, Math.sin(a) * 14 + 4, Math.cos(a) * 22, Math.sin(a) * 22 + 10);
      c.stroke();
    }

    // Abdomen — deep purple with red hourglass marking
    const bodyGrad = c.createRadialGradient(0, 0, 2, 0, 0, 18);
    bodyGrad.addColorStop(0, "#6a1f8c");
    bodyGrad.addColorStop(0.6, "#3a1252");
    bodyGrad.addColorStop(1, "#1a0828");
    c.fillStyle = bodyGrad;
    c.beginPath(); c.ellipse(0, 0, 14, 18, 0, 0, Math.PI * 2); c.fill();

    // Red hourglass marking (black widow style)
    c.fillStyle = "#ff2a44";
    c.beginPath();
    c.moveTo(-4, 2); c.lineTo(4, 2);
    c.lineTo(2, 6); c.lineTo(4, 12);
    c.lineTo(-4, 12); c.lineTo(-2, 6);
    c.closePath(); c.fill();
    c.shadowBlur = 0;

    // Head segment
    c.fillStyle = "#2a0f3a";
    c.beginPath(); c.ellipse(0, -10, 8, 6, 0, 0, Math.PI * 2); c.fill();

    // Glowing red eyes (8 in a cluster)
    c.fillStyle = "#ff3040"; c.shadowColor = "#ff1020"; c.shadowBlur = 6;
    for (let i = 0; i < 8; i += 1) {
      const ex = (i % 4 - 1.5) * 2.5;
      const ey = Math.floor(i / 4) * 3 - 11;
      c.beginPath(); c.arc(ex, ey, 1.2, 0, Math.PI * 2); c.fill();
    }
    c.shadowBlur = 0;
    c.restore();
  }

  _drawWebThread(c, x, y) {
    c.strokeStyle = "rgba(240,240,230,0.6)"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x, -30); c.lineTo(x, y - 18); c.stroke();
  }
}

// ============================================================
//                       REAPER SYSTEM
// ============================================================

class ReaperSystem {
  constructor(game) {
    this.game = game;
    this.visible = false;
    this.rise = 0;
    this.ctx = $("reaper-canvas").getContext("2d");
    this.overlay = $("reaper-overlay");
    this._resize();
    window.addEventListener("resize", () => this._resize());
  }

  _resize() {
    const cv = $("reaper-canvas");
    cv.width = window.innerWidth; cv.height = window.innerHeight;
  }

  update() {
    const height = this.game.board.peakHeight();
    const danger = Math.max(0, height - 14) / 6; // 0 when peak<=14, 1 when peak=20
    const c = this.ctx;
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    if (danger <= 0) {
      this.overlay.classList.remove("on");
      this._announced = false;
      return;
    }
    // Only announce when nothing else is demanding attention — the Reaper is
    // a passive build-up effect so we don't want him stepping on a boss card.
    if (!this._announced && !this.game.isEventOnScreen()) {
      this._announced = true;
      this.game.announceEvent(
        "boss",
        "THE REAPER WATCHES",
        "Your stack has climbed too high — Death rises from the crypt below.",
        "Clear lines NOW to drive him back. He only fades when your peak drops below row 14.",
        5500,
      );
    }
    this.overlay.classList.add("on");
    const rise = clamp(danger, 0, 1);
    const baseY = c.canvas.height + 200;
    const y = lerp(baseY, c.canvas.height * 0.35, rise);
    const x = c.canvas.width * 0.5;
    this._drawReaper(c, x, y);
  }

  _drawReaper(c, x, y) {
    c.save();
    c.translate(x, y);

    // Ominous red aura behind him
    c.shadowColor = "#ff1020"; c.shadowBlur = 24;

    // Robe — deep purple-grey gradient (visible, not pitch black)
    const robeGrad = c.createLinearGradient(0, -50, 0, 400);
    robeGrad.addColorStop(0, "#3a2f4a");
    robeGrad.addColorStop(0.5, "#1f1828");
    robeGrad.addColorStop(1, "#0a0812");
    c.fillStyle = robeGrad;
    c.beginPath();
    c.moveTo(-100, 0);
    c.quadraticCurveTo(-160, 180, -120, 400);
    c.lineTo(120, 400);
    c.quadraticCurveTo(160, 180, 100, 0);
    c.quadraticCurveTo(60, -40, 0, -50);
    c.quadraticCurveTo(-60, -40, -100, 0);
    c.closePath(); c.fill();
    c.shadowBlur = 0;

    // Robe folds highlights
    c.strokeStyle = "rgba(130, 110, 160, 0.35)"; c.lineWidth = 2;
    for (let i = -80; i <= 80; i += 40) {
      c.beginPath();
      c.moveTo(i, 20);
      c.quadraticCurveTo(i + 10, 200, i + 14, 380);
      c.stroke();
    }

    // Hood interior — darker void
    c.fillStyle = "rgba(5, 2, 10, 0.92)";
    c.beginPath();
    c.moveTo(-60, -10); c.quadraticCurveTo(0, -30, 60, -10);
    c.quadraticCurveTo(60, 40, 0, 60);
    c.quadraticCurveTo(-60, 40, -60, -10); c.closePath(); c.fill();

    // Hood rim highlight
    c.strokeStyle = "#4a3a5a"; c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-60, -10); c.quadraticCurveTo(0, -30, 60, -10); c.stroke();

    // Glowing red eyes
    c.fillStyle = "#ff3040"; c.shadowColor = "#ff1020"; c.shadowBlur = 20;
    c.beginPath(); c.arc(-14, 20, 4, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(14, 20, 4, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;

    // Skeletal hand holding scythe
    c.fillStyle = "#e8dcc4";
    c.beginPath(); c.ellipse(110, 30, 10, 8, 0.4, 0, Math.PI * 2); c.fill();

    // Scythe handle — weathered wood
    c.strokeStyle = "#6a4f3a"; c.lineWidth = 7;
    c.beginPath(); c.moveTo(120, 30); c.lineTo(160, 420); c.stroke();
    c.strokeStyle = "#3a2a1a"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(122, 30); c.lineTo(162, 420); c.stroke();

    // Scythe blade — bright silver with red blood edge
    c.strokeStyle = "#d8d4c6"; c.lineWidth = 5;
    c.beginPath(); c.moveTo(120, 30); c.quadraticCurveTo(220, 0, 200, -80); c.stroke();
    c.strokeStyle = "#c51c2a"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(122, 32); c.quadraticCurveTo(220, 2, 198, -78); c.stroke();
    c.restore();
  }
}

// ============================================================
//                       COMBO SYSTEM
// ============================================================

class ComboSystem {
  constructor(game) {
    this.game = game;
    this.combo = 0;
    this.panel = $("combo-panel");
    this.value = $("combo-value");
  }

  onClear(lines) {
    if (lines > 0) this.combo += 1; else this.reset();
    if (this.combo >= 2) {
      this.value.textContent = `×${this.combo}`;
      this.panel.classList.toggle("hot", this.combo >= 5);
      const text = this._comboLabel(this.combo);
      if (text) this.game.showPopup(text);
      if (this.combo === 5) this.game.audio.sfx("draculaAppear");
      if (this.combo >= 10) {
        this.game.shake("lg");
        this.game.particles.spawn("FIRE", this.game.canvas.width / 2, this.game.canvas.height / 2, 60);
        this.game.particles.spawn("BAT", this.game.canvas.width / 2, this.game.canvas.height / 2, 20);
        this.game.addScore(this.combo * 200);
      }
    }
  }

  _comboLabel(c) {
    if (c === 2) return "DOUBLE CURSE!";
    if (c === 3) return "TRIPLE DAMNATION!";
    if (c === 5) return "CRYPT IS ON FIRE";
    if (c === 7) return "RAVENS SWARM!";
    if (c >= 10) return "UNLEASH HELL!";
    return null;
  }

  reset() {
    this.combo = 0;
    this.value.textContent = "—";
    this.panel.classList.remove("hot");
  }
}

// ============================================================
//                       POWER-UP SYSTEM
// ============================================================

class PowerUpSystem {
  constructor(game) { this.game = game; }

  /** Flash the screen tint briefly to signal a power phase. */
  _flash(color, dur = 260) {
    const tint = $("screen-tint");
    if (!tint) return;
    const prevBg = tint.style.background;
    const prevTrans = tint.style.transition;
    tint.style.transition = "opacity 0.08s";
    tint.style.background = color;
    tint.style.opacity = "1";
    setTimeout(() => {
      tint.style.transition = "opacity 0.35s";
      tint.style.opacity = "0";
      setTimeout(() => { tint.style.background = prevBg; tint.style.transition = prevTrans; }, 400);
    }, dur);
  }

  /** Apply the effect of a power-up piece on lock. */
  apply(kind, piece) {
    const g = this.game;
    const px = (piece.x + 1) * CELL;
    const py = (piece.y + 1) * CELL;
    switch (kind) {
      case "GARLIC":
        g.flags.garlic = true;
        g.showPopup("✞ GARLIC SHIELD ✞");
        g.audio.sfx("garlic");
        g.particles.spawn("HOLY", px, py, 40);
        g.particles.spawn("SPARKLE", px, py, 20);
        this._flash("rgba(255, 220, 120, 0.35)");
        g.announceEvent(
          "powerup",
          "HOLY GARLIC",
          "A shield of sacred cloves hangs over your soul.",
          "The next monster (Dracula, Werewolf or Spider) is banished instantly for +2000.",
        );
        break;
      case "CROSS": {
        let cleared = 0;
        for (let y = 0; y < g.board.h; y += 1) {
          for (let x = 0; x < g.board.w; x += 1) {
            const c = g.board.grid[y][x];
            if (c && (c.cursed || c.webbed)) {
              g.board.grid[y][x] = null; cleared += 1;
              g.particles.spawn("HOLY", x * CELL + CELL / 2, y * CELL + CELL / 2, 6);
            }
          }
        }
        g.board.applyGravity();
        g.addScore(cleared * 300);
        g.showPopup(`SILVER CROSS +${cleared * 300}`);
        g.audio.sfx("cross");
        g.particles.spawn("SPARKLE", g.canvas.width / 2, g.canvas.height / 2, 30);
        this._flash("rgba(200, 230, 255, 0.4)");
        g.announceEvent(
          "powerup",
          "SILVER CROSS",
          `Purged ${cleared} cursed or webbed cell${cleared === 1 ? "" : "s"} from the board.`,
          "Best played while a Blood Curse row or Spider webs are active on the stack.",
        );
        break;
      }
      case "WITCH_BREW":
        this._witchBrew(piece);
        g.announceEvent(
          "powerup",
          "WITCH'S BREW",
          "A glass phial of roiling green liquid — blessing or curse, no telling.",
          "60% chance of a boon (score / slow fall / clean rows), 40% curse. Pray.",
        );
        break;
      case "DEATH_RATTLE": {
        let cleared = 0;
        for (let y = g.board.h - 5; y < g.board.h; y += 1) {
          for (let x = 0; x < g.board.w; x += 1) {
            if (g.board.grid[y][x]) cleared += 1;
            g.board.grid[y][x] = null;
          }
        }
        g.addScore(-1000);
        g.addScore(cleared * 60);
        g.showPopup(`DEATH RATTLE -1000 · ${cleared} souls freed`);
        g.particles.spawn("SKULL", g.canvas.width / 2, g.canvas.height - 80, 25);
        g.particles.spawn("BLOOD", g.canvas.width / 2, g.canvas.height - 80, 35);
        g.audio.sfx("deathRattle");
        g.board.applyGravity();
        g.shake("md");
        this._flash("rgba(40, 40, 60, 0.55)");
        g.announceEvent(
          "powerup",
          "DEATH RATTLE",
          `Wiped the bottom 5 rows (${cleared} cells) at a cost of 1000 souls.`,
          "Use only when buried — net positive if you freed a lot of cells.",
        );
        break;
      }
      case "CANDLE":
        g.flags.candleBurn = 5000;
        g.flags.candleStep = -1;
        g.flags.candleRow = g.board.h - 1;
        g.showPopup("CURSED CANDLE — FLAMES RISE");
        g.audio.sfx("candle");
        g.particles.spawn("FIRE", g.canvas.width / 2, g.canvas.height - 20, 40);
        this._flash("rgba(255, 120, 30, 0.4)");
        g.announceEvent(
          "powerup",
          "CURSED CANDLE",
          "A flame wave will sweep upward — burning one row every second for 5 rows.",
          "Stack garbage or cursed blocks near the bottom FIRST — every burned cell is +200.",
          5500,
        );
        break;
      case "BAT_FAMILIAR":
        g.flags.batFamiliar = { time: 30000, cooldown: 0 };
        g.showPopup("BAT FAMILIAR — 30s");
        g.audio.sfx("bat");
        g.particles.spawn("BAT", px, py, 30);
        this._flash("rgba(80, 20, 120, 0.4)");
        g.announceEvent(
          "powerup",
          "BAT FAMILIAR",
          "A loyal bat circles the board, devouring a random block every 5 seconds.",
          "Great against heavy / cursed / webbed cells you can't reach. Lasts 30s.",
        );
        break;
      default: break;
    }
    g.stats.powerUpsUsed += 1;
    g.updateStatusEffects();
  }

  _witchBrew(piece) {
    const g = this.game;
    const good = Math.random() < 0.6;
    if (good) {
      const pick = rand(0, 3);
      if (pick === 0) {
        for (let y = g.board.h - 3; y < g.board.h; y += 1) for (let x = 0; x < g.board.w; x += 1) g.board.grid[y][x] = null;
        g.addScore(1500);
        g.showPopup("WITCH BLESSING +1500");
      } else if (pick === 1) {
        g.flags.slowFall = 10000;
        g.showPopup("WITCH BLESSING — TIME SLOWED");
      } else if (pick === 2) {
        const color = PIECE_COLORS[choice(Object.keys(PIECE_COLORS))];
        for (let y = 0; y < g.board.h; y += 1) for (let x = 0; x < g.board.w; x += 1) if (g.board.grid[y][x]) g.board.grid[y][x].color = color;
        g.showPopup("WITCH BLESSING — HARMONY");
      } else {
        g.addScore(800); g.showPopup("WITCH BLESSING +800 ESSENCE");
      }
      g.particles.spawn("GREEN", (piece.x + 1) * CELL, (piece.y + 1) * CELL, 24);
    } else {
      const pick = rand(0, 3);
      if (pick === 0) {
        for (let i = 0; i < 3; i += 1) {
          for (let y = 0; y < g.board.h - 1; y += 1) g.board.grid[y] = g.board.grid[y + 1].slice();
          g.board.grid[g.board.h - 1] = Array.from({ length: g.board.w }, () => ({
            color: "#4a454a", symbol: "stone", cursed: false, webbed: false, shadow: false, blood: false, heavy: false,
          }));
        }
        g.showPopup("WITCH CURSE — GARBAGE");
      } else if (pick === 1) {
        g.flags.inverted = 8000;
        g.showPopup("WITCH CURSE — BACKWARDS");
      } else if (pick === 2) {
        let n = 0;
        for (let i = 0; i < 20 && n < 5; i += 1) {
          const y = rand(0, g.board.h - 1); const x = rand(0, g.board.w - 1);
          if (g.board.grid[y][x] && !g.board.grid[y][x].cursed) { g.board.grid[y][x].cursed = true; g.board.grid[y][x].color = "#c51c2a"; n += 1; }
        }
        g.flags.curseTimer = 15000;
        g.showPopup("WITCH CURSE — FLESH TURNED BLOOD");
      } else {
        // rotate board
        const rotated = Array.from({ length: g.board.h }, () => Array(g.board.w).fill(null));
        for (let y = 0; y < g.board.h; y += 1) for (let x = 0; x < g.board.w; x += 1) rotated[y][x] = g.board.grid[y][g.board.w - 1 - x];
        g.board.grid = rotated;
        g.showPopup("WITCH CURSE — MIRROR WORLD");
      }
      g.particles.spawn("GREEN", (piece.x + 1) * CELL, (piece.y + 1) * CELL, 24);
    }
    g.audio.sfx("witchBrew");
    g.updateStatusEffects();
  }
}

// ============================================================
//                    POWER-DOWN SYSTEM
// ============================================================

class PowerDownSystem {
  constructor(game) { this.game = game; }

  _flash(color, dur = 280) {
    const tint = $("screen-tint");
    if (!tint) return;
    const prevBg = tint.style.background;
    const prevTrans = tint.style.transition;
    tint.style.transition = "opacity 0.08s";
    tint.style.background = color;
    tint.style.opacity = "1";
    setTimeout(() => {
      tint.style.transition = "opacity 0.4s";
      tint.style.opacity = "0";
      setTimeout(() => { tint.style.background = prevBg; tint.style.transition = prevTrans; }, 450);
    }, dur);
  }

  /** Apply power-down effect after piece locks. */
  apply(kind, piece, writtenCells) {
    const g = this.game;
    switch (kind) {
      case "BLOOD_BLOCK": {
        for (const [x, y] of writtenCells) {
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const nx = x + dx; const ny = y + dy;
              if (g.board.inside(nx, ny) && g.board.grid[ny][nx]) {
                g.board.grid[ny][nx].cursed = true;
                g.board.grid[ny][nx].color = "#c51c2a";
                g.board.grid[ny][nx].blood = true;
                g.particles.spawn("BLOOD", nx * CELL + CELL / 2, ny * CELL + CELL / 2, 4, { raw: true });
              }
            }
          }
        }
        g.flags.curseTimer = Math.max(g.flags.curseTimer || 0, 10000);
        g.showPopup("BLOOD BLOCK — CORRUPTED");
        g.audio.sfx("bloodSplat");
        g.shake("sm");
        this._flash("rgba(180, 0, 24, 0.55)");
        g.announceEvent(
          "powerdown",
          "BLOOD BLOCK",
          "Blood splatters across every adjacent cell, cursing them in place.",
          "Clear the lines these cursed cells sit on to cleanse them — or use a Silver Cross.",
        );
        break;
      }
      case "SHADOW_PIECE":
        for (const [x, y] of writtenCells) {
          if (g.board.grid[y][x]) { g.board.grid[y][x].shadow = true; g.board.grid[y][x].color = "#0a0308"; }
        }
        g.showPopup("SHADOW BLOCK PLACED — CAN YOU FIND IT?");
        g.audio.sfx("shadow");
        this._flash("rgba(0, 0, 0, 0.75)", 400);
        g.announceEvent(
          "powerdown",
          "SHADOW PIECE",
          "This piece has melted into the board — nearly invisible against the stone.",
          "Squint at where it landed and plan around it. Line clears remove it normally.",
        );
        break;
      case "HEAVY_STONE":
        for (const [x, y] of writtenCells) if (g.board.grid[y][x]) { g.board.grid[y][x].heavy = true; g.board.grid[y][x].color = "#4a454a"; }
        g.shake("lg");
        g.audio.sfx("heavyStone");
        g.showPopup("CURSED STONE LANDS");
        g.particles.spawn("ASH", g.canvas.width / 2, g.canvas.height - 40, 30);
        this._flash("rgba(90, 90, 110, 0.5)");
        g.announceEvent(
          "powerdown",
          "HEAVY STONE",
          "A dead-weight stone block crashes down and refuses to budge.",
          "You can only clear it by completing the row it's on — plan your stack around it.",
        );
        break;
      case "COBWEB": {
        for (const [x, y] of writtenCells) {
          if (g.board.grid[y][x]) g.board.grid[y][x].webbed = true;
        }
        g.flags.webTimer = 10000;
        g.showPopup("COBWEB TRAP SPRUNG!");
        g.audio.sfx("cobweb");
        g.particles.spawn("SPARKLE", (piece.x + 1) * CELL, (piece.y + 1) * CELL, 20);
        this._flash("rgba(220, 220, 200, 0.35)");
        g.announceEvent(
          "powerdown",
          "COBWEB PIECE",
          "Sticky webs coat this piece — webbed cells don't count toward line clears.",
          "Clear the row, or a Silver Cross wipes all webs instantly.",
        );
        break;
      }
      default: break;
    }
    g.updateStatusEffects();
  }
}

// ============================================================
//                    BOOK OF THE DEAD
// ============================================================

class BookOfTheDead {
  constructor() {
    this.key = "damned.book";
    this.entries = this.load();
  }

  load() {
    try { const raw = localStorage.getItem(this.key); if (raw) return JSON.parse(raw); } catch (_) { /* ignore */ }
    return [];
  }

  save() { try { localStorage.setItem(this.key, JSON.stringify(this.entries)); } catch (_) { /* ignore */ } }

  submit(entry) {
    this.entries.push(entry);
    this.entries.sort((a, b) => b.score - a.score);
    this.entries = this.entries.slice(0, 10);
    this.save();
    return this.entries.indexOf(entry);
  }

  clear() { this.entries = []; this.save(); }

  topSoul() { return this.entries[0] || null; }

  render(tbody) {
    tbody.innerHTML = "";
    if (this.entries.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--bone-dark);padding:2rem;">— The Book is empty. Walk, and fall, and write. —</td></tr>`;
      return;
    }
    this.entries.forEach((e, i) => {
      const tr = document.createElement("tr");
      tr.className = i === 0 ? "rank-1" : "";
      tr.style.animationDelay = `${i * 0.07}s`;
      tr.innerHTML = `
        <td>${i === 0 ? "♛" : i + 1}</td>
        <td>${(e.name || "Unknown").substring(0, 16)}</td>
        <td>${e.score.toLocaleString()}</td>
        <td>${toRoman(e.level || 1)}</td>
        <td>${e.lines || 0}</td>
        <td>${e.monsters || 0}</td>`;
      tbody.appendChild(tr);
    });
  }
}

// ============================================================
//                       INPUT MANAGER
// ============================================================

class InputManager {
  constructor(game) {
    this.game = game;
    this.keys = new Map();
    this.das = 160; this.arr = 35;
    this._installListeners();
  }

  _installListeners() {
    window.addEventListener("keydown", (e) => {
      const inField = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
      if (!inField && (e.key === " " || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
      }
      if (inField) return;
      if (e.repeat) return;
      this.keys.set(e.key, { pressed: true, held: 0 });
      this._onKey(e);
    });
    window.addEventListener("keyup", (e) => { this.keys.delete(e.key); });
  }

  _onKey(e) {
    const g = this.game;
    if (e.key === "Escape") { if (g.state === GAME_STATES.PLAYING) g.togglePause(); return; }
    if (e.key === "p" || e.key === "P") { if (g.state === GAME_STATES.PLAYING || g.state === GAME_STATES.PAUSED) g.togglePause(); return; }
    if (g.state !== GAME_STATES.PLAYING) return;
    const k = e.key.toLowerCase();
    const inv = g.flags.inverted > 0;
    if (e.key === "ArrowLeft") g.tryMove(inv ? 1 : -1);
    else if (e.key === "ArrowRight") g.tryMove(inv ? -1 : 1);
    else if (e.key === "ArrowDown") g.softDrop();
    else if (e.key === "ArrowUp") g.rotate(1);
    else if (e.key === " ") g.hardDrop();
    else if (k === "z") g.rotate(-1);
    else if (k === "c" || e.key === "Shift") g.hold();
  }

  update(dt) {
    if (this.game.state !== GAME_STATES.PLAYING) return;
    const inv = this.game.flags.inverted > 0;
    this._handleAutoShift("ArrowLeft", inv ? 1 : -1, dt);
    this._handleAutoShift("ArrowRight", inv ? -1 : 1, dt);
  }

  _handleAutoShift(k, dir, dt) {
    const key = this.keys.get(k);
    if (!key) return;
    key.held += dt;
    if (key.held > this.das) {
      const repeats = Math.floor((key.held - this.das) / this.arr);
      for (let i = 0; i < repeats; i += 1) this.game.tryMove(dir);
      key.held -= repeats * this.arr;
    }
  }
}

// ============================================================
//                           GAME
// ============================================================

class Game {
  constructor() {
    this.settings = new SettingsManager();
    this.audio = new AudioEngine(this.settings);
    this.book = new BookOfTheDead();

    this.canvas = $("board-canvas");
    this.particleCanvas = $("particle-canvas");
    this.renderer = new Renderer(this.canvas, this.particleCanvas);
    this.particles = new ParticleSystem(this.particleCanvas);

    this.board = new Board();
    this.bag = new PieceBag(this);
    this.currentPiece = null;
    this.holdPiece = null;
    this.canHold = true;

    this.score = 0; this.level = 1; this.lines = 0;
    this.dropTimer = 0; this.dropInterval = 1000;
    this.state = GAME_STATES.MENU;
    this.globalBossCooldown = 0;

    this.flags = {
      garlic: false,
      inverted: 0,
      curseTimer: 0,
      webTimer: 0,
      darkVeilTimer: 0,
      slowFall: 0,
      candleBurn: 0,
      candleRow: BOARD_H - 1,
      candleStep: -1,
      batFamiliar: null,
    };

    this.stats = {
      monstersEncountered: 0,
      monstersDefeated: 0,
      powerUpsUsed: 0,
      tetrisCount: 0,
    };

    this.bats = new BatSwarm($("bat-canvas"));
    this.dracula = new DraculaSystem(this);
    this.werewolf = new WerewolfSystem(this);
    this.ghost = new GhostSystem(this);
    this.spider = new SpiderSystem(this);
    this.reaper = new ReaperSystem(this);
    this.atmosphere = new AtmosphereSystem(this);
    this.combo = new ComboSystem(this);
    this.powerups = new PowerUpSystem(this);
    this.powerdowns = new PowerDownSystem(this);

    this.input = new InputManager(this);
    this.bossBanner = $("boss-banner");

    this.lastFrame = performance.now();
    this._hookUI();
    this._renderHud();
    this._updateHighestVictim();
    setTimeout(() => {
      $("loading-screen").classList.remove("active");
      this._showScreen("main-menu");
    }, 1100);

    requestAnimationFrame((t) => this._loop(t));
  }

  isDraculaActive() { return this.dracula && this.dracula.active; }

  /** True if ANY monster/boss event is currently running OR the crypt is
   *  still "resting" from the last one. Used to gate ALL new event triggers
   *  so two bosses never overlap and the player gets breathing room. */
  isAnyEventActive() {
    if (this.globalBossCooldown > 0) return true;
    if (this.dracula && this.dracula.active) return true;
    if (this.werewolf && this.werewolf.state !== "IDLE") return true;
    if (this.ghost && (this.ghost.active || this.ghost.state !== "IDLE")) return true;
    if (this.spider && (this.spider.active || (this.spider.state && this.spider.state !== "IDLE"))) return true;
    return false;
  }

  /** True if a boss is ACTUALLY on-screen right now (ignores the resting
   *  cooldown). Useful for gating visual stuff like jumpscares. */
  isEventOnScreen() {
    if (this.dracula && this.dracula.active) return true;
    if (this.werewolf && this.werewolf.state !== "IDLE") return true;
    if (this.ghost && (this.ghost.active || this.ghost.state !== "IDLE")) return true;
    if (this.spider && (this.spider.active || (this.spider.state && this.spider.state !== "IDLE"))) return true;
    return false;
  }

  // ==================== UI HOOKS ====================
  _hookUI() {
    $("btn-start").addEventListener("click", () => this.newGame());
    $("btn-start-2p").addEventListener("click", () => {
      alert("The veil is silent tonight. Two players must wait for the next blood moon.");
    });
    $("btn-leaderboard").addEventListener("click", () => this.openLeaderboard());
    $("btn-settings").addEventListener("click", () => this._showScreen("settings-screen"));
    $("btn-how").addEventListener("click", () => this._showScreen("howtoplay-screen"));

    $("btn-pause").addEventListener("click", () => this.togglePause());
    $("btn-mute").addEventListener("click", () => {
      this.audio.ensure();
      const muted = this.audio.toggleMute();
      $("btn-mute").innerHTML = muted ? '<i class="fa-solid fa-volume-xmark"></i>' : '<i class="fa-solid fa-volume-high"></i>';
    });
    $("btn-home").addEventListener("click", () => this._returnToMenu());
    $("btn-resume").addEventListener("click", () => this.togglePause());
    $("btn-restart").addEventListener("click", () => this.newGame());
    $("btn-pause-settings").addEventListener("click", () => this._showScreen("settings-screen"));
    $("btn-pause-menu").addEventListener("click", () => this._returnToMenu());
    $("btn-save").addEventListener("click", () => this.saveScore());
    $("btn-again").addEventListener("click", () => this.newGame());
    $("btn-flee").addEventListener("click", () => this._returnToMenu());
    $("btn-clear-records").addEventListener("click", () => {
      if (confirm("ARE YOU SURE? THE SOULS WILL BE LOST FOREVER.")) {
        this.book.clear(); this.book.render($("leaderboard-body")); this._updateHighestVictim();
      }
    });
    $("btn-back-lb").addEventListener("click", () => this._showScreen("main-menu"));
    $("btn-back-settings").addEventListener("click", () => this._showScreen(this.state === GAME_STATES.PAUSED ? "pause-screen" : "main-menu"));
    $("btn-back-how").addEventListener("click", () => this._showScreen("main-menu"));
    $("btn-reset-settings").addEventListener("click", () => { this.settings.data = SettingsManager.defaults(); this.settings.save(); this._syncSettings(); });

    // settings inputs
    ["master", "music", "sfx"].forEach((k) => {
      const map = { master: "master", music: "musicVolume", sfx: "sfxVolume" };
      const el = $(`set-${k}`);
      el.value = this.settings.data[map[k]];
      el.addEventListener("input", () => {
        this.settings.set(map[k], parseFloat(el.value));
        if (k === "master") this.audio.setMasterVolume(parseFloat(el.value));
      });
    });
    ["shake", "particles", "jumpscares", "ghost"].forEach((k) => {
      const el = $(`set-${k}`);
      el.checked = this.settings.data[k];
      el.addEventListener("change", () => { this.settings.set(k, el.checked); });
    });

    // Press any key on main menu to start audio
    window.addEventListener("click", () => this.audio.ensure(), { once: true });
    window.addEventListener("keydown", () => this.audio.ensure(), { once: true });
  }

  _syncSettings() {
    $("set-master").value = this.settings.data.master;
    $("set-music").value = this.settings.data.musicVolume;
    $("set-sfx").value = this.settings.data.sfxVolume;
    $("set-shake").checked = this.settings.data.shake;
    $("set-particles").checked = this.settings.data.particles;
    $("set-jumpscares").checked = this.settings.data.jumpscares;
    $("set-ghost").checked = this.settings.data.ghost;
    this.particles.enabled = this.settings.data.particles;
    this.audio.setMasterVolume(this.settings.data.master);
  }

  _updateHighestVictim() {
    const top = this.book.topSoul();
    const el = $("galactic-record");
    if (el) el.textContent = top ? `The Most Damned Soul: ${top.name} · ${top.score.toLocaleString()}` : "The Most Damned Soul: — · 0";
  }

  _showScreen(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $(id).classList.add("active");
  }

  // ==================== GAME LIFE CYCLE ====================
  newGame() {
    this.board.reset();
    this.bag = new PieceBag(this);
    this.score = 0; this.level = 1; this.lines = 0;
    this.dropTimer = 0; this.dropInterval = 1000;
    this.globalBossCooldown = 0;
    this.flags = {
      garlic: false, inverted: 0, curseTimer: 0, webTimer: 0, darkVeilTimer: 0,
      slowFall: 0, candleBurn: 0, candleRow: BOARD_H - 1, candleStep: -1, batFamiliar: null,
    };
    this.stats = { monstersEncountered: 0, monstersDefeated: 0, powerUpsUsed: 0, tetrisCount: 0 };
    this.combo.reset();
    this.holdPiece = null; this.canHold = true;
    this.lineClearAnim = null;
    this.lineClearLock = false;
    const overlayClear = $("overlay-canvas");
    if (overlayClear) overlayClear.getContext("2d").clearRect(0, 0, overlayClear.width, overlayClear.height);
    this.spawnPiece();
    this.state = GAME_STATES.PLAYING;
    this._showScreen("game-screen");
    this._renderHud();
    this.audio.ensure();
    $("board-darken").classList.remove("on");
  }

  _returnToMenu() {
    this.state = GAME_STATES.MENU;
    this._updateHighestVictim();
    this._showScreen("main-menu");
  }

  openLeaderboard() {
    this.book.render($("leaderboard-body"));
    this._showScreen("leaderboard-screen");
  }

  togglePause() {
    if (this.state === GAME_STATES.PLAYING) { this.state = GAME_STATES.PAUSED; this._showScreen("pause-screen"); }
    else if (this.state === GAME_STATES.PAUSED) { this.state = GAME_STATES.PLAYING; this._showScreen("game-screen"); }
  }

  spawnPiece() {
    this.currentPiece = this.bag.next();
    this.currentPiece.x = Math.floor((this.board.w - this.currentPiece.matrix()[0].length) / 2);
    this.currentPiece.y = -1;
    this.canHold = true;
    // check game over
    if (!this.board.canPlace(this.currentPiece, this.currentPiece.x, this.currentPiece.y + 1)) {
      this.gameOver();
    }
    // heavy stone pre-warning
    if (this.currentPiece.heavy) {
      this.showPopup("CURSED STONE!");
      this.audio.sfx("heavyStone");
    }
  }

  tryMove(dx) {
    if (!this.currentPiece) return;
    if (this.board.canPlace(this.currentPiece, this.currentPiece.x + dx, this.currentPiece.y)) {
      this.currentPiece.x += dx;
      this.audio.sfx("move");
    }
  }

  rotate(dir) {
    if (!this.currentPiece) return;
    if (this.currentPiece.rotate(dir, this.board)) this.audio.sfx("rotate");
  }

  softDrop() {
    if (!this.currentPiece) return;
    if (this.board.canPlace(this.currentPiece, this.currentPiece.x, this.currentPiece.y + 1)) {
      this.currentPiece.y += 1;
      this.score += 1;
      this._renderHud();
    }
  }

  hardDrop() {
    if (!this.currentPiece || this.lineClearLock) return;
    const startY = this.currentPiece.y;
    let dropped = 0;
    while (this.board.canPlace(this.currentPiece, this.currentPiece.x, this.currentPiece.y + 1)) {
      this.currentPiece.y += 1; dropped += 1;
    }
    const landY = this.currentPiece.y;

    // Subtle fire trail only if the piece actually fell some distance.
    // Spawn a few embers at the bottom cells of the piece along ~4 sample points.
    if (dropped >= 2) {
      const mat = this.currentPiece.matrix();
      const bottomCols = [];
      for (let col = 0; col < mat[0].length; col += 1) {
        for (let row = mat.length - 1; row >= 0; row -= 1) {
          if (mat[row][col]) { bottomCols.push({ col, row }); break; }
        }
      }
      const samples = Math.min(4, dropped);
      for (let s = 0; s < samples; s += 1) {
        const trailY = startY + (dropped * (s + 1)) / (samples + 1);
        for (const { col, row } of bottomCols) {
          const px = (this.currentPiece.x + col) * CELL + CELL / 2;
          const py = (trailY + row) * CELL + CELL / 2;
          this.particles.spawn("FIRE", px, py, 2, { raw: true });
        }
      }
    }

    this.score += dropped; // reduced from dropped*2 — earn less for dropping
    this.audio.sfx("hardDrop");
    this.lockPiece();
  }

  hold() {
    if (!this.canHold || !this.currentPiece || this.lineClearLock) return;
    this.audio.sfx("hold");
    if (this.holdPiece) {
      const tmp = this.holdPiece;
      this.holdPiece = new Piece(this.currentPiece.type);
      this.currentPiece = tmp;
      this.currentPiece.x = Math.floor((this.board.w - this.currentPiece.matrix()[0].length) / 2);
      this.currentPiece.y = -1;
    } else {
      this.holdPiece = new Piece(this.currentPiece.type);
      this.spawnPiece();
    }
    this.canHold = false;
  }

  lockPiece() {
    const p = this.currentPiece;
    if (!p) return;
    const written = this.board.lock(p);
    this.audio.sfx("lock");

    // power-ups & power-downs
    if (p.special) this.powerups.apply(p.special, p);
    if (p.negative) this.powerdowns.apply(p.negative, p, written);

    const full = this.board.findFullRows();
    if (full.length) {
      // Kick off the staggered line-clear animation. The actual row removal,
      // scoring, combo, level-up and next-piece spawn are all deferred to
      // `_finishLineClear()` so the player sees each row break individually.
      this.currentPiece = null;
      this.lineClearLock = true;
      this._beginLineClearAnimation(full);
    } else {
      this.combo.onClear(0);
      this.spawnPiece();
      this._renderHud();
    }
  }

  // ========================================================================
  // LINE CLEAR ANIMATION
  // Stages per row (t = time since row started):
  //   0-90ms      : bright flash (white → orange)
  //   90-230ms    : cracks + lateral shake
  //   230-400ms   : shatter — cells nullified, debris + blood burst, label
  // Multi-line clears stagger rows top-down at 140ms apart so each line
  // pops with its own sound/label before the next one goes.
  // ========================================================================

  _beginLineClearAnimation(rows) {
    const sorted = rows.slice().sort((a, b) => a - b);
    const snap = sorted.map((y) => this.board.grid[y].map((cell) => (cell ? {
      color: cell.color,
      symbol: cell.symbol,
      cursed: !!cell.cursed,
      webbed: !!cell.webbed,
      blood: !!cell.blood,
      heavy: !!cell.heavy,
    } : null)));
    this.lineClearAnim = {
      rows: sorted,
      snap,
      startTime: performance.now(),
      perRowDelay: sorted.length > 1 ? 140 : 0,
      rowDur: 400,
      exploded: new Set(),
      labeled: new Set(),
    };
    // Initial subtle global shake to sell the hit
    this.shake("sm");
  }

  _updateLineClearAnimation(now) {
    const a = this.lineClearAnim;
    if (!a) return;
    const overlayCtx = $("overlay-canvas").getContext("2d");
    overlayCtx.clearRect(0, 0, BOARD_W * CELL, BOARD_H * CELL);

    const tGlobal = now - a.startTime;
    let stillAnimating = false;
    for (let i = 0; i < a.rows.length; i += 1) {
      const row = a.rows[i];
      const rowT = tGlobal - i * a.perRowDelay;
      if (rowT < 0) { stillAnimating = true; continue; }
      if (rowT > a.rowDur) continue;
      stillAnimating = true;
      this._drawClearingRow(overlayCtx, row, rowT, a);
      // Explode at ~60% of rowDur — this is the moment the row "breaks"
      if (rowT >= a.rowDur * 0.58 && !a.exploded.has(row)) {
        a.exploded.add(row);
        this._explodeClearedRow(row, a.snap[i], i, a.rows.length);
      }
    }
    // Keep rows that have already exploded visually empty (black) so the
    // background shows through and later rows appear to fall.
    overlayCtx.fillStyle = "rgba(5, 3, 8, 0.92)";
    a.exploded.forEach((row) => {
      overlayCtx.fillRect(0, row * CELL, BOARD_W * CELL, CELL);
    });

    if (!stillAnimating) {
      overlayCtx.clearRect(0, 0, BOARD_W * CELL, BOARD_H * CELL);
      this._finishLineClear();
    }
  }

  _drawClearingRow(ctx, row, rowT, anim) {
    const dur = anim.rowDur;
    const y = row * CELL;
    ctx.save();

    if (rowT < 90) {
      // PHASE 1 — flash: blazing white ramping down to orange
      const p = rowT / 90;
      const r = 255;
      const g = Math.floor(255 - p * 110);
      const b = Math.floor(255 - p * 200);
      const alpha = 0.9 - p * 0.3;
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.fillRect(0, y, BOARD_W * CELL, CELL);
      // Bright horizontal scanline racing across the row
      const sweepX = p * BOARD_W * CELL;
      ctx.fillStyle = "rgba(255, 255, 220, 0.9)";
      ctx.fillRect(sweepX - 10, y, 20, CELL);
    } else if (rowT < 230) {
      // PHASE 2 — shake + cracks
      const p = (rowT - 90) / 140;
      const shakeX = Math.sin(rowT * 0.08) * (3 - p * 2);
      ctx.translate(shakeX, 0);
      // Reddish heat haze
      ctx.fillStyle = `rgba(180, 30, 30, ${0.35 + p * 0.2})`;
      ctx.fillRect(0, y, BOARD_W * CELL, CELL);
      // Cracks — jagged black lightning across each cell
      ctx.strokeStyle = `rgba(0, 0, 0, ${0.85})`;
      ctx.lineWidth = 1.6;
      for (let x = 0; x < BOARD_W; x += 1) {
        const cx = x * CELL;
        ctx.beginPath();
        ctx.moveTo(cx + 3, y + 2);
        ctx.lineTo(cx + CELL * 0.3, y + CELL * 0.5);
        ctx.lineTo(cx + CELL * 0.5, y + CELL * 0.2);
        ctx.lineTo(cx + CELL * 0.7, y + CELL * 0.7);
        ctx.lineTo(cx + CELL - 3, y + CELL - 2);
        ctx.stroke();
      }
      // Bright hot line along the middle of the row
      const heat = 1 - p;
      ctx.fillStyle = `rgba(255, 180, 60, ${heat * 0.7})`;
      ctx.fillRect(0, y + CELL / 2 - 2, BOARD_W * CELL, 4);
    } else {
      // PHASE 3 — shatter fade-out
      const p = Math.min(1, (rowT - 230) / (dur - 230));
      const alpha = 1 - p;
      ctx.globalAlpha = alpha;
      // Smoldering ember line fading
      ctx.fillStyle = "rgba(80, 10, 10, 0.9)";
      ctx.fillRect(0, y, BOARD_W * CELL, CELL);
      // Final bright ember at center
      ctx.fillStyle = `rgba(255, 140, 40, ${alpha})`;
      ctx.fillRect(0, y + CELL / 2 - 1, BOARD_W * CELL, 2);
    }
    ctx.restore();
  }

  _explodeClearedRow(row, snapRow, rowIndex, totalRows) {
    // Remove cells from board so renderer stops drawing them next frame.
    for (let x = 0; x < BOARD_W; x += 1) {
      const cx = x * CELL + CELL / 2;
      const cy = row * CELL + CELL / 2;
      const color = (snapRow[x] && snapRow[x].color) || "#c51c2a";
      this.particles.spawn("BLOOD", cx, cy, 3);
      if (x % 2 === 0) this.particles.spawn("ASH", cx, cy, 1, { raw: true });
      if (Math.random() < 0.25) this.particles.spawn("SKULL", cx, cy, 1, { raw: true });
      // Tiny colored debris chunks that match the piece color
      for (let k = 0; k < 2; k += 1) {
        this.particles.spawn("BLOOD", cx + randf(-6, 6), cy + randf(-6, 6), 1, { raw: true });
      }
      this.board.grid[row][x] = null;
      // Subtle flash of the cell's original color as it shatters
      void color;
    }

    this.audio.sfx(totalRows === 4 && rowIndex === totalRows - 1 ? "tetris" : "lineClear");
    this.shake(totalRows >= 3 ? "md" : "sm");

    // Per-row label floating at the row's y-position
    this._showLineClearLabel(row, rowIndex, totalRows);
  }

  _showLineClearLabel(row, rowIndex, totalRows) {
    const boardStack = document.querySelector(".board-stack");
    if (!boardStack) return;
    const pct = ((row + 0.5) * CELL) / (BOARD_H * CELL) * 100;
    const el = document.createElement("div");
    el.className = `comic-popup tier-${Math.min(4, totalRows)} line-clear-label`;
    el.style.left = "50%";
    el.style.top = `${pct}%`;
    el.style.transform = "translate(-50%,-50%)";
    let text;
    const isLast = rowIndex === totalRows - 1;
    if (totalRows === 1) text = "SOUL FREED";
    else if (totalRows === 2) text = isLast ? "DOUBLE DAMNATION" : "SOUL FREED";
    else if (totalRows === 3) text = isLast ? "TRIPLE DAMNATION" : "SOUL CONSUMED";
    else text = isLast ? "TETRIS OF THE DAMNED!" : "SOUL CONSUMED";
    el.innerHTML = `<span>${text}</span>`;
    boardStack.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  _finishLineClear() {
    const a = this.lineClearAnim;
    if (!a) return;
    this.lineClearAnim = null;
    this.lineClearLock = false;

    // Compact board (rows above shift down, one pass per cleared row)
    this.board.clearRows(a.rows);
    this.lines += a.rows.length;
    this.stats.tetrisCount += a.rows.length === 4 ? 1 : 0;
    const mult = [0, 40, 120, 300, 600][a.rows.length] || 600;
    this.addScore(mult * this.level);

    // Big-finish effects scaled to clear size
    if (a.rows.length >= 3) {
      this.particles.spawn("SKULL", BOARD_W * CELL / 2, BOARD_H * CELL / 2, 20);
      this.particles.spawn("BLOOD", BOARD_W * CELL / 2, BOARD_H * CELL / 2, 20);
    }
    if (a.rows.length === 4) {
      const overlayCtx = $("overlay-canvas").getContext("2d");
      overlayCtx.fillStyle = "rgba(180, 0, 0, 0.7)";
      overlayCtx.fillRect(0, 0, BOARD_W * CELL, BOARD_H * CELL);
      setTimeout(() => overlayCtx.clearRect(0, 0, BOARD_W * CELL, BOARD_H * CELL), 180);
      for (let i = 0; i < 6; i += 1) {
        this.particles.spawn("SKULL", randf(0, BOARD_W * CELL), randf(0, BOARD_H * CELL), 8);
        this.particles.spawn("BLOOD", randf(0, BOARD_W * CELL), randf(0, BOARD_H * CELL), 8);
        this.particles.spawn("FIRE", randf(0, BOARD_W * CELL), BOARD_H * CELL, 6);
      }
      const banner = $("level-up-banner");
      if (banner) {
        banner.querySelector(".descent-label").textContent = "TETRIS OF THE DAMNED";
        banner.querySelector(".descent-numeral").textContent = "☠";
        banner.classList.remove("active"); void banner.offsetWidth;
        banner.classList.add("active");
        setTimeout(() => banner.classList.remove("active"), 2800);
      }
      this.shake("lg");
    }

    this.combo.onClear(a.rows.length);
    this.dracula.onLineClearedDuringAttack(a.rows.length);

    // Level up (lines-only progression)
    const nextLevel = 1 + Math.floor(this.lines / 15);
    if (nextLevel > this.level) this._showLevelUp(nextLevel);
    this.level = nextLevel;
    this.dropInterval = clamp(1000 - (this.level - 1) * 85, 80, 1000);

    this.spawnPiece();
    this._renderHud();
  }

  addScore(n) { this.score = Math.max(0, this.score + n); this._renderHud(); }

  _showLevelUp(n) {
    const el = $("level-up-banner");
    if (!el) return;
    // Update audio BPM scaled with level
    this.audio.bpm = Math.min(190, 110 + (n - 1) * 9);

    el.querySelector(".descent-label").textContent = "DESCENT INTO NIGHT";
    el.querySelector(".descent-numeral").textContent = toRoman(n);
    el.classList.remove("active"); void el.offsetWidth; el.classList.add("active");
    setTimeout(() => el.classList.remove("active"), 2500);

    this.audio.sfx("levelUp");
    this.atmosphere.triggerLightning();
    this.particles.spawn("HOLY", this.canvas.width / 2, this.canvas.height / 2, 40);

    // White flash tint
    const tint = $("screen-tint");
    if (tint) {
      const prevBg = tint.style.background;
      const prevTrans = tint.style.transition;
      tint.style.transition = "opacity 0.12s";
      tint.style.background = "rgba(255,255,255,0.35)";
      tint.style.opacity = "1";
      setTimeout(() => {
        tint.style.opacity = "0";
        setTimeout(() => { tint.style.background = prevBg; tint.style.transition = prevTrans; }, 250);
      }, 120);
    }

    // Lightning strike in the background
    const lightning = document.querySelector(".lightning");
    if (lightning) {
      lightning.classList.remove("strike");
      void lightning.offsetWidth;
      lightning.classList.add("strike");
    }

    // Big shake
    const app = $("app");
    app.classList.remove("shake-sm", "shake-md", "shake-lg");
    void app.offsetWidth;
    app.classList.add("shake-lg");
    setTimeout(() => app.classList.remove("shake-lg"), 650);
  }

  showPopup(text, tier = 1) {
    const board = document.querySelector(".board-stack");
    if (!board) return;
    const el = document.createElement("div");
    el.className = `comic-popup tier-${Math.min(4, tier)}`;
    el.style.left = "50%";
    el.style.top = "40%";
    el.style.transform = "translate(-50%,-50%)";
    el.innerHTML = `<span>${text}</span>`;
    board.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  /**
   * Show an event briefing card: kind tag, name, 1-line lore, and a
   * tactical tip for how to deal with it. `kind` is "boss" | "powerup" | "powerdown".
   */
  announceEvent(kind, title, desc, tip, dur = 5200) {
    const card = $("event-card");
    if (!card) return;
    card.classList.remove("on", "kind-boss", "kind-powerup", "kind-powerdown");
    card.classList.add(`kind-${kind}`);
    const kindLabel = {
      boss: "✝ CURSED ENCOUNTER ✝",
      powerup: "✦ BLESSING ✦",
      powerdown: "☠ AFFLICTION ☠",
    }[kind] || "";
    card.querySelector(".event-card-kind").textContent = kindLabel;
    card.querySelector(".event-card-title").textContent = title;
    card.querySelector(".event-card-desc").textContent = desc;
    card.querySelector(".tip-text").textContent = tip;
    void card.offsetWidth;
    card.classList.add("on");
    clearTimeout(this._eventCardTimer);
    this._eventCardTimer = setTimeout(() => card.classList.remove("on"), dur);
  }

  shake(intensity = "sm") {
    if (!this.settings.data.shake) return;
    const app = $("app");
    app.classList.remove("screen-shake-sm", "screen-shake-md", "screen-shake-lg");
    void app.offsetWidth;
    app.classList.add(`screen-shake-${intensity}`);
  }

  _renderHud() {
    $("score-value").textContent = this.score.toLocaleString();
    $("lines-value").textContent = this.lines;
    $("level-label").textContent = `NIGHT ${toRoman(this.level)}`;
    $("moon-phase").querySelector(".moon-numeral").textContent = toRoman(this.level);
    const shadow = $("moon-phase").querySelector(".moon-shadow");
    if (shadow) {
      const pct = clamp(1 - (this.level / 10), 0, 1);
      shadow.style.width = `${pct * 100}%`;
    }
    // draw hold + next
    if (this.holdPiece) this.renderer.drawPreviewPiece($("hold-canvas").getContext("2d"), this.holdPiece, 144, 144);
    else $("hold-canvas").getContext("2d").clearRect(0, 0, 144, 144);
    const nextCtx = $("next-canvas").getContext("2d");
    nextCtx.clearRect(0, 0, 144, 432);
    const peek = this.bag.peek(3);
    peek.forEach((p, i) => {
      nextCtx.save();
      nextCtx.translate(0, i * 144);
      this.renderer.drawPreviewPiece(nextCtx, p, 144, 144);
      nextCtx.restore();
    });
  }

  updateStatusEffects() {
    const el = $("status-effects");
    if (!el) return;
    el.innerHTML = "";
    const add = (text) => {
      const d = document.createElement("div");
      d.className = "status-effect";
      d.textContent = text; el.appendChild(d);
    };
    if (this.flags.garlic) add("GARLIC");
    if (this.flags.inverted > 0) add(`INVERTED ${(this.flags.inverted / 1000).toFixed(1)}s`);
    if (this.flags.curseTimer > 0) add(`CURSE ${(this.flags.curseTimer / 1000).toFixed(1)}s`);
    if (this.flags.webTimer > 0) add(`WEBBED ${(this.flags.webTimer / 1000).toFixed(1)}s`);
    if (this.flags.darkVeilTimer > 0) add(`BLIND ${(this.flags.darkVeilTimer / 1000).toFixed(1)}s`);
    if (this.flags.slowFall > 0) add("SLOW FALL");
    if (this.flags.batFamiliar) add(`BAT ${(this.flags.batFamiliar.time / 1000).toFixed(0)}s`);
  }

  // ==================== GAME OVER ====================
  gameOver() {
    this.state = GAME_STATES.GAMEOVER;

    // 1. Kill heartbeat if active
    if (this._heartbeatInterval) { clearInterval(this._heartbeatInterval); this._heartbeatInterval = null; }

    // 1b. Force-cleanup any active monster effects so they don't linger after death
    if (this.dracula) {
      this.dracula.state = "IDLE";
      this.dracula.active = false;
      this.dracula.defeated = false;
      this.dracula._clearBanner();
      this.dracula._darkenBoard(false);
      this.dracula._setVignette(false);
      const mc = $("monster-canvas").getContext("2d");
      mc.clearRect(0, 0, $("monster-canvas").width, $("monster-canvas").height);
    }
    if (this.werewolf) { this.werewolf.state = "IDLE"; }
    if (this.ghost) { this.ghost.state = "IDLE"; }
    if (this.spider) { this.spider.state = "IDLE"; }
    if (this.reaper && this.reaper.overlay) {
      this.reaper.overlay.classList.remove("on");
      this.reaper.ctx.clearRect(0, 0, this.reaper.ctx.canvas.width, this.reaper.ctx.canvas.height);
      this.reaper._announced = false;
    }
    // Clear lingering status/flag effects
    this.flags.darkVeilTimer = 0;
    this.flags.inverted = 0;
    this.flags.curseTimer = 0;
    this.flags.webTimer = 0;
    this.flags.candleBurn = 0;
    this.flags.candleStep = -1;
    this.flags.slowFall = 0;
    this.lineClearAnim = null;
    this.lineClearLock = false;
    if (this.bossBanner) this.bossBanner.classList.remove("on");
    const eventCard = $("event-card"); if (eventCard) eventCard.classList.remove("on");
    clearTimeout(this._eventCardTimer);
    const boardDarken = $("board-darken"); if (boardDarken) boardDarken.classList.remove("on");

    // 2. Big screen shake
    const app = $("app");
    app.classList.remove("shake-sm", "shake-md", "shake-lg");
    void app.offsetWidth;
    app.classList.add("shake-lg");

    // 3. Red screen flood
    const tint = $("screen-tint");
    if (tint) {
      tint.style.transition = "opacity 0.1s";
      tint.style.background = "rgba(160,0,0,0.85)";
      tint.style.opacity = "1";
    }

    // 4. Play death sound + shatter
    this.audio.sfx("gameOver");
    this._shatterScreen();

    // 5. Physics-based debris from every filled board cell
    const overlayCtx = $("overlay-canvas").getContext("2d");
    const debris = [];
    for (let row = 0; row < this.board.h; row += 1) {
      for (let col = 0; col < this.board.w; col += 1) {
        const cell = this.board.grid[row][col];
        if (cell) {
          debris.push({
            x: col * CELL + CELL / 2,
            y: row * CELL + CELL / 2,
            vx: randf(-4, 4),
            vy: randf(-3, 2),
            rot: 0,
            rotV: randf(-0.15, 0.15),
            color: cell.color || "#c51c2a",
            life: 1.0,
          });
        }
      }
    }
    // Clear the logical board & wipe the board canvas so debris is the only visible motion
    for (let r = 0; r < this.board.h; r += 1) this.board.grid[r] = new Array(this.board.w).fill(null);
    const bc = $("board-canvas").getContext("2d");
    bc.clearRect(0, 0, BOARD_W * CELL, BOARD_H * CELL);
    this.renderer.drawStoneBackground();

    let debrisFrame;
    const animateDebris = () => {
      overlayCtx.clearRect(0, 0, BOARD_W * CELL, BOARD_H * CELL);
      let alive = false;
      for (const d of debris) {
        d.vy += 0.18;
        d.x += d.vx; d.y += d.vy;
        d.rot += d.rotV;
        d.life -= 0.018;
        if (d.life <= 0) continue;
        alive = true;
        overlayCtx.save();
        overlayCtx.globalAlpha = Math.max(0, d.life);
        overlayCtx.translate(d.x, d.y);
        overlayCtx.rotate(d.rot);
        overlayCtx.shadowColor = d.color;
        overlayCtx.shadowBlur = 8;
        overlayCtx.fillStyle = d.color;
        overlayCtx.fillRect(-CELL / 2 + 2, -CELL / 2 + 2, CELL - 4, CELL - 4);
        overlayCtx.restore();
      }
      if (alive) debrisFrame = requestAnimationFrame(animateDebris);
    };
    animateDebris();

    // Epitaph
    $("go-level").textContent = toRoman(this.level);
    $("go-lines").textContent = this.lines;
    $("go-monsters").textContent = this.stats.monstersDefeated;
    $("go-score").textContent = this.score.toLocaleString();

    // 6. After 1400ms show the rise-from-void game over screen
    setTimeout(() => {
      cancelAnimationFrame(debrisFrame);
      overlayCtx.clearRect(0, 0, BOARD_W * CELL, BOARD_H * CELL);
      app.classList.remove("shake-lg");
      if (tint) {
        tint.style.transition = "opacity 1.2s";
        tint.style.opacity = "0";
        setTimeout(() => { tint.style.background = ""; }, 1300);
      }
      this._showScreen("gameover-screen");
    }, 1400);
  }

  _shatterScreen() {
    const cv = $("shatter-canvas");
    cv.width = window.innerWidth; cv.height = window.innerHeight;
    const c = cv.getContext("2d");
    cv.classList.add("on");
    c.clearRect(0, 0, cv.width, cv.height);
    // draw jagged shatter lines
    c.strokeStyle = "rgba(255,255,255,0.85)";
    c.lineWidth = 2;
    for (let i = 0; i < 40; i += 1) {
      const sx = cv.width / 2; const sy = cv.height / 2;
      c.beginPath(); c.moveTo(sx, sy);
      let x = sx; let y = sy;
      for (let j = 0; j < 8; j += 1) {
        x += Math.cos(i / 40 * Math.PI * 2) * 40 + randf(-15, 15);
        y += Math.sin(i / 40 * Math.PI * 2) * 40 + randf(-15, 15);
        c.lineTo(x, y);
      }
      c.stroke();
    }
    setTimeout(() => cv.classList.remove("on"), 2200);
  }

  saveScore() {
    const nameEl = $("player-name");
    const name = (nameEl.value || "Unnamed Wretch").substring(0, 16);
    this.book.submit({
      name, score: this.score, level: this.level, lines: this.lines,
      monsters: this.stats.monstersDefeated, date: new Date().toISOString(),
    });
    this.openLeaderboard();
  }

  // ==================== GAME LOOP ====================
  _loop(t) {
    const dt = Math.min(50, t - this.lastFrame);
    this.lastFrame = t;

    this.bats.update(dt, this.level >= 5 ? 6 : 0);
    this.bats.draw();
    this.atmosphere.update(dt);
    this.particles.update(dt);

    // Clear the monster canvas once per frame so any transient monster (ghost, dracula, etc.)
    // doesn't leave accumulated trails when idle.
    const mc = $("monster-canvas").getContext("2d");
    mc.clearRect(0, 0, $("monster-canvas").width, $("monster-canvas").height);

    if (this.state === GAME_STATES.PLAYING) {
      this.input.update(dt);
      this.audio.updateMusic(dt, this.level);

      // Heartbeat driven by stack height — faster as the Reaper closes in
      const danger = this.board.peakHeight();
      if (danger >= 12) {
        const interval = Math.max(300, 1200 - (danger - 12) * 112);
        if (!this._heartbeatInterval || this._lastHeartbeatInterval !== interval) {
          clearInterval(this._heartbeatInterval);
          this._lastHeartbeatInterval = interval;
          this._heartbeatInterval = setInterval(() => {
            if (this.state === GAME_STATES.PLAYING) this.audio.sfx("heartbeat");
            else { clearInterval(this._heartbeatInterval); this._heartbeatInterval = null; }
          }, interval);
        }
      } else if (this._heartbeatInterval) {
        clearInterval(this._heartbeatInterval);
        this._heartbeatInterval = null;
        this._lastHeartbeatInterval = null;
      }

      // Drive the staggered per-row line-clear animation if one is in progress
      if (this.lineClearAnim) this._updateLineClearAnimation(t);

      // Gravity / auto-lock is paused during the line-clear freeze frame
      if (!this.lineClearLock) {
        this.dropTimer += dt;
        const slow = this.flags.slowFall > 0 ? 0.35 : 1;
        const heavy = this.currentPiece && this.currentPiece.heavy ? 3 : 1;
        const threshold = this.dropInterval / (heavy * slow);
        if (this.dropTimer > threshold) {
          this.dropTimer = 0;
          if (this.currentPiece && this.board.canPlace(this.currentPiece, this.currentPiece.x, this.currentPiece.y + 1)) this.currentPiece.y += 1;
          else if (this.currentPiece) this.lockPiece();
        }
      }

      // decrement flag timers
      ["inverted", "curseTimer", "webTimer", "darkVeilTimer", "slowFall", "candleBurn"].forEach((k) => {
        if (this.flags[k] > 0) this.flags[k] = Math.max(0, this.flags[k] - dt);
      });
      // Global rest between bosses — breathing room for the player
      if (this.globalBossCooldown > 0) this.globalBossCooldown = Math.max(0, this.globalBossCooldown - dt);
      // expire cursed/webbed blocks
      if (this.flags.curseTimer === 0) {
        for (let y = 0; y < this.board.h; y += 1) for (let x = 0; x < this.board.w; x += 1) {
          const c = this.board.grid[y][x]; if (c && c.cursed) c.cursed = false;
        }
      }
      if (this.flags.webTimer === 0) {
        for (let y = 0; y < this.board.h; y += 1) for (let x = 0; x < this.board.w; x += 1) {
          const c = this.board.grid[y][x]; if (c && c.webbed) c.webbed = false;
        }
      }
      // Cursed candle flame wave — 5 rows, bottom-up, 1s each.
      // A single-step flame sweep: on entering each new row we burn its blocks
      // (with bonus + particles + shake), then every frame a few embers drift
      // off the row that's currently on fire so the wave reads visually.
      if (this.flags.candleBurn > 0) {
        const TOTAL = 5000;
        const STEP_DUR = 1000;
        const elapsed = TOTAL - this.flags.candleBurn;
        const step = Math.min(4, Math.floor(elapsed / STEP_DUR));
        const y = this.board.h - 1 - step;

        if (step !== this.flags.candleStep) {
          this.flags.candleStep = step;
          this.flags.candleRow = y;
          let burned = 0;
          if (y >= 0 && y < this.board.h) {
            for (let x = 0; x < this.board.w; x += 1) {
              // Heavy "cursed" flames across the whole row for the wave visual
              this.particles.spawn(
                "FIRE",
                x * CELL + CELL / 2,
                y * CELL + CELL - 2,
                5,
              );
              if (this.board.grid[y][x]) {
                burned += 1;
                // Debris shoots UP as the cell is consumed by flame
                this.particles.spawn(
                  "ASH",
                  x * CELL + CELL / 2,
                  y * CELL + CELL / 2,
                  3,
                  { raw: true },
                );
                this.board.grid[y][x] = null;
              }
            }
          }
          if (burned > 0) {
            this.addScore(burned * 200);
            this.showPopup(`CANDLE BURN +${burned * 200}`);
            this.shake("sm");
            this.audio.sfx("candle");
            // Blocks above the scorched row drop down like classic Tetris
            // gravity, so the stack actually settles after each burn.
            this.board.applyGravity();
          }
        } else if (y >= 0 && y < this.board.h) {
          // Embers drifting off the currently burning row each frame
          if (Math.random() < 0.6) {
            const ex = rand(0, this.board.w - 1) * CELL + CELL / 2;
            this.particles.spawn(
              "FIRE",
              ex,
              y * CELL + CELL - 2,
              1,
              { raw: true },
            );
          }
        }
      }
      // bat familiar
      if (this.flags.batFamiliar) {
        this.flags.batFamiliar.time -= dt;
        this.flags.batFamiliar.cooldown -= dt;
        if (this.flags.batFamiliar.cooldown <= 0) {
          const cells = [];
          for (let y = 0; y < this.board.h; y += 1) for (let x = 0; x < this.board.w; x += 1) if (this.board.grid[y][x]) cells.push([x, y]);
          if (cells.length) {
            const [x, y] = choice(cells);
            this.board.grid[y][x] = null;
            this.addScore(150);
            this.particles.spawn("BAT", x * CELL + CELL / 2, y * CELL + CELL / 2, 6);
            this.audio.sfx("bat");
            this.board.applyGravity();
          }
          this.flags.batFamiliar.cooldown = 5000;
        }
        if (this.flags.batFamiliar.time <= 0) this.flags.batFamiliar = null;
      }

      this.dracula.update(dt);
      this.werewolf.update(dt);
      this.ghost.update(dt);
      this.spider.update(dt);
      this.reaper.update();
      this.updateStatusEffects();

      // draw board
      if (this.flags.darkVeilTimer > 0) {
        // hide locked blocks: clear and draw only active piece
        const c = this.canvas.getContext("2d");
        c.clearRect(0, 0, this.canvas.width, this.canvas.height);
        c.fillStyle = "#05030a"; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
        if (this.currentPiece) {
          const mat = this.currentPiece.matrix();
          for (let py = 0; py < mat.length; py += 1) {
            for (let px = 0; px < mat[py].length; px += 1) {
              if (!mat[py][px]) continue;
              const gx = this.currentPiece.x + px; const gy = this.currentPiece.y + py;
              if (gy < 0) continue;
              this.renderer.drawBlock(gx, gy, this.currentPiece.color, 1, { symbol: this.currentPiece.symbol });
            }
          }
        }
      } else {
        const gy = this.currentPiece ? this.currentPiece.ghostY(this.board) : 0;
        this.renderer.draw(this.board, this.currentPiece, gy, this.settings.data.ghost);
      }
      this.particles.draw();
    } else if (this.state === GAME_STATES.MENU || this.state === GAME_STATES.PAUSED || this.state === GAME_STATES.GAMEOVER) {
      // keep particles drawing but no gameplay
      this.particles.draw();
    }

    requestAnimationFrame((tt) => this._loop(tt));
  }
}

// ============================================================
//                           BOOT
// ============================================================

window.addEventListener("DOMContentLoaded", () => {
  const game = new Game();
  window.__game = game; // handy for debugging
  game._syncSettings();
});
