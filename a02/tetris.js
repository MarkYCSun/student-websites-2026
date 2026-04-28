(() => {
  "use strict";

  const COLS = 10;
  const ROWS = 20;
  const BLOCK = 30; // px (canvas is 300x600)

  const COLORS = {
    I: "#59d9ff",
    O: "#ffd23f",
    T: "#b388ff",
    S: "#4dffb5",
    Z: "#ff5c7a",
    J: "#4ea1ff",
    L: "#ff9f4a",
    GHOST: "rgba(255,255,255,0.18)",
    GRID: "rgba(255,255,255,0.06)",
  };

  // 4x4 matrices.
  const SHAPES = {
    I: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    O: [
      [0, 1, 1, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    T: [
      [0, 1, 0, 0],
      [1, 1, 1, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    S: [
      [0, 1, 1, 0],
      [1, 1, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    Z: [
      [1, 1, 0, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    J: [
      [1, 0, 0, 0],
      [1, 1, 1, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    L: [
      [0, 0, 1, 0],
      [1, 1, 1, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  };

  const PIECES = /** @type {const} */ (["I", "O", "T", "S", "Z", "J", "L"]);

  function cloneMatrix(m) {
    return m.map((row) => row.slice());
  }

  function rotateCW(m) {
    const N = m.length;
    const out = Array.from({ length: N }, () => Array(N).fill(0));
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        out[x][N - 1 - y] = m[y][x];
      }
    }
    return out;
  }

  function makeEmptyBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  // 7-bag randomizer
  function makeBag() {
    const bag = PIECES.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    return bag;
  }

  function createPiece(type) {
    return {
      type,
      matrix: cloneMatrix(SHAPES[type]),
      x: 3,
      y: -1,
    };
  }

  function collides(board, piece, dx = 0, dy = 0, matrix = piece.matrix) {
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        if (!matrix[y][x]) continue;
        const bx = piece.x + x + dx;
        const by = piece.y + y + dy;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && board[by][bx]) return true;
      }
    }
    return false;
  }

  function lockPiece(board, piece) {
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        if (!piece.matrix[y][x]) continue;
        const bx = piece.x + x;
        const by = piece.y + y;
        if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) {
          board[by][bx] = piece.type;
        }
      }
    }
  }

  function clearLines(board) {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (board[y].every((c) => c)) {
        board.splice(y, 1);
        board.unshift(Array(COLS).fill(null));
        cleared++;
        y++;
      }
    }
    return cleared;
  }

  function findFullRows(board) {
    /** @type {number[]} */
    const rows = [];
    for (let y = 0; y < ROWS; y++) {
      if (board[y].every((c) => c)) rows.push(y);
    }
    return rows;
  }

  function applyClearRows(board, rows) {
    if (rows.length === 0) return 0;
    // Remove from bottom to top so indices stay valid.
    const sorted = rows.slice().sort((a, b) => b - a);
    for (const y of sorted) {
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(null));
    }
    return rows.length;
  }

  function computeDropY(board, piece) {
    let dy = 0;
    while (!collides(board, piece, 0, dy + 1)) dy++;
    return piece.y + dy;
  }

  function scoreForLines(lines, level) {
    // classic-ish scoring: 1=100,2=300,3=500,4=800 * level
    const base = [0, 100, 300, 500, 800][lines] || 0;
    return base * level;
  }

  function tickMsForLevel(level) {
    // simple speed curve
    return Math.max(80, 650 - (level - 1) * 55);
  }

  function drawCell(ctx, x, y, size, color, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    const pad = 1.2;
    const r = 6;
    const px = x * size + pad;
    const py = y * size + pad;
    const w = size - pad * 2;
    const h = size - pad * 2;
    roundRect(ctx, px, py, w, h, r);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = "rgba(0,0,0,0.22)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawBoard(ctx, board) {
    ctx.clearRect(0, 0, COLS * BLOCK, ROWS * BLOCK);

    // subtle grid
    ctx.strokeStyle = COLORS.GRID;
    ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * BLOCK + 0.5, 0);
      ctx.lineTo(x * BLOCK + 0.5, ROWS * BLOCK);
      ctx.stroke();
    }
    for (let y = 1; y < ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * BLOCK + 0.5);
      ctx.lineTo(COLS * BLOCK, y * BLOCK + 0.5);
      ctx.stroke();
    }

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = board[y][x];
        if (!cell) continue;
        drawCell(ctx, x, y, BLOCK, COLORS[cell]);
      }
    }
  }

  function drawPiece(ctx, piece, overrideY = null, colorOverride = null, alpha = 1) {
    const color = colorOverride || COLORS[piece.type];
    const py = overrideY ?? piece.y;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        if (!piece.matrix[y][x]) continue;
        const bx = piece.x + x;
        const by = py + y;
        if (by < 0) continue;
        drawCell(ctx, bx, by, BLOCK, color, alpha);
      }
    }
  }

  function drawNext(ctx, nextPiece) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const size = 24;
    const ox = 1;
    const oy = 1;

    // background grid
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    for (let i = 0; i <= 5; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * size + 0.5);
      ctx.lineTo(5 * size, i * size + 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i * size + 0.5, 0);
      ctx.lineTo(i * size + 0.5, 5 * size);
      ctx.stroke();
    }

    const mat = nextPiece.matrix;
    const color = COLORS[nextPiece.type];
    // center in a 5x5 area visually
    const offsetX = nextPiece.type === "I" ? 0 : 0.5;
    const offsetY = nextPiece.type === "I" ? 0.5 : 0.5;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        if (!mat[y][x]) continue;
        const px = (x + ox + offsetX) * size;
        const py = (y + oy + offsetY) * size;
        ctx.fillStyle = color;
        roundRect(ctx, px + 1, py + 1, size - 2, size - 2, 6);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.22)";
        ctx.stroke();
      }
    }
  }

  const gameCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById("game"));
  const nextCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById("next"));
  const fxCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById("fx"));
  const scoreEl = document.getElementById("score");
  const highScoreEl = document.getElementById("highScore");
  const linesEl = document.getElementById("lines");
  const levelEl = document.getElementById("level");
  const timeEl = document.getElementById("time");
  const piecesEl = document.getElementById("pieces");
  const speedEl = document.getElementById("speed");
  const overlayEl = document.getElementById("overlay");
  const overlayTitleEl = document.getElementById("overlayTitle");
  const overlayHintEl = document.getElementById("overlayHint");
  const toastEl = document.getElementById("toast");
  const panelEl = document.getElementById("panel");

  const ctx = gameCanvas.getContext("2d");
  const nctx = nextCanvas.getContext("2d");
  const fx = fxCanvas ? fxCanvas.getContext("2d") : null;
  if (!ctx || !nctx) return;

  gameCanvas.tabIndex = 0;

  let board = makeEmptyBoard();
  let bag = makeBag();
  let current = createPiece(bag.pop());
  let next = (() => {
    if (bag.length === 0) bag = makeBag();
    return createPiece(bag.pop());
  })();

  let score = 0;
  let lines = 0;
  let level = 1;
  let paused = false;
  let gameOver = false;

  let piecesPlaced = 0;
  let elapsedMs = 0;
  const HIGH_SCORE_KEY = "tetris_high_score_v1";
  let highScore = 0;
  let hudClockMs = 0;

  let dropTimerMs = 0;
  let lastTs = 0;

  const MILESTONES = [500, 1000, 2000, 4000, 8000, 16000, 32000];
  let nextMilestoneIdx = 0;
  let fxPulseMs = 0;

  /** @type {{x:number,y:number,vx:number,vy:number,rot:number,vr:number,size:number,color:string,life:number,maxLife:number}[]} */
  let confetti = [];

  /** @type {{x:number,y:number,vx:number,vy:number,r:number,life:number,maxLife:number,color:string}[]} */
  let impact = [];

  /** @type {{rows:number[],t:number,duration:number} | null} */
  let clearFx = null;

  function updateHud() {
    if (score > highScore) {
      highScore = score;
      try {
        localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
      } catch {}
    }
    scoreEl.textContent = String(score);
    if (highScoreEl) highScoreEl.textContent = String(highScore);
    linesEl.textContent = String(lines);
    levelEl.textContent = String(level);
    if (piecesEl) piecesEl.textContent = String(piecesPlaced);
    if (speedEl) speedEl.textContent = `${Math.round(1000 / tickMsForLevel(level))}x`;
    if (timeEl) timeEl.textContent = formatTime(elapsedMs);
  }

  function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function showToast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.remove("isVisible");
    // restart animation
    // eslint-disable-next-line no-unused-expressions
    toastEl.offsetHeight;
    toastEl.classList.add("isVisible");
  }

  function burstConfetti() {
    if (!fx) return;
    const w = fx.canvas.width;
    const h = fx.canvas.height;
    const colors = ["#59d9ff", "#b388ff", "#ffd23f", "#4dffb5", "#ff5c7a", "#4ea1ff", "#ff9f4a"];
    const count = 110;
    const originX = w * 0.5;
    const originY = h * 0.22;
    for (let i = 0; i < count; i++) {
      const a = (-Math.PI / 2) + (Math.random() - 0.5) * 1.4;
      const sp = 240 + Math.random() * 280;
      confetti.push({
        x: originX,
        y: originY,
        vx: Math.cos(a) * sp + (Math.random() - 0.5) * 70,
        vy: Math.sin(a) * sp - Math.random() * 120,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 10,
        size: 5 + Math.random() * 6,
        color: colors[(Math.random() * colors.length) | 0],
        life: 0,
        maxLife: 900 + Math.random() * 550,
      });
    }
  }

  function triggerMilestone(milestone) {
    if (panelEl) {
      panelEl.classList.remove("milestone");
      // restart animation
      // eslint-disable-next-line no-unused-expressions
      panelEl.offsetHeight;
      panelEl.classList.add("milestone");
    }
    showToast(`Milestone: ${milestone.toLocaleString()}!`);
    burstConfetti();
    fxPulseMs = 420;
  }

  function checkMilestones() {
    while (nextMilestoneIdx < MILESTONES.length && score >= MILESTONES[nextMilestoneIdx]) {
      triggerMilestone(MILESTONES[nextMilestoneIdx]);
      nextMilestoneIdx++;
    }
    if (nextMilestoneIdx >= MILESTONES.length) {
      const last = MILESTONES[MILESTONES.length - 1];
      const nextVal = Math.pow(2, Math.floor(Math.log2(Math.max(score, last)))) * 2;
      if (score >= nextVal) triggerMilestone(nextVal);
    }
  }

  function stepFx(dt) {
    if (!fx) return;
    const w = fx.canvas.width;
    const h = fx.canvas.height;
    fx.clearRect(0, 0, w, h);

    if (fxPulseMs > 0) {
      fxPulseMs = Math.max(0, fxPulseMs - dt);
      const t = 1 - fxPulseMs / 420;
      const a = Math.sin(Math.min(1, t) * Math.PI);
      fx.globalAlpha = 0.24 * a;
      const grd = fx.createRadialGradient(w * 0.5, h * 0.22, 10, w * 0.5, h * 0.22, w * 0.86);
      grd.addColorStop(0, "rgba(255,210,63,0.45)");
      grd.addColorStop(0.35, "rgba(179,136,255,0.22)");
      grd.addColorStop(1, "rgba(89,217,255,0)");
      fx.fillStyle = grd;
      fx.fillRect(0, 0, w, h);
      fx.globalAlpha = 1;
    }

    const g = 780; // px/s^2
    const drag = 0.992;
    for (let i = confetti.length - 1; i >= 0; i--) {
      const p = confetti[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        confetti.splice(i, 1);
        continue;
      }

      const dts = dt / 1000;
      p.vx *= Math.pow(drag, dt / 16);
      p.vy += g * dts;
      p.x += p.vx * dts;
      p.y += p.vy * dts;
      p.rot += p.vr * dts;

      const fade = 1 - p.life / p.maxLife;
      fx.save();
      fx.translate(p.x, p.y);
      fx.rotate(p.rot);
      fx.globalAlpha = Math.max(0, Math.min(1, fade));
      fx.fillStyle = p.color;
      fx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      fx.restore();
    }

    // impact puffs
    for (let i = impact.length - 1; i >= 0; i--) {
      const p = impact[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        impact.splice(i, 1);
        continue;
      }
      const dts = dt / 1000;
      p.x += p.vx * dts;
      p.y += p.vy * dts;
      p.vy += 900 * dts;
      p.r += 28 * dts;
      const a = 1 - p.life / p.maxLife;
      fx.globalAlpha = 0.55 * a;
      fx.fillStyle = p.color;
      fx.beginPath();
      fx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      fx.fill();
      fx.globalAlpha = 1;
    }

    // laser row clear
    if (clearFx) {
      clearFx.t += dt;
      const tt = Math.min(1, clearFx.t / clearFx.duration);
      const beamX = -40 + (w + 80) * tt;
      for (const row of clearFx.rows) {
        const y = row * BLOCK + BLOCK / 2;
        // glow line
        fx.globalAlpha = 0.85;
        const grad = fx.createLinearGradient(beamX - 80, 0, beamX + 80, 0);
        grad.addColorStop(0, "rgba(89,217,255,0)");
        grad.addColorStop(0.35, "rgba(255,210,63,0.35)");
        grad.addColorStop(0.5, "rgba(255,255,255,0.95)");
        grad.addColorStop(0.65, "rgba(179,136,255,0.35)");
        grad.addColorStop(1, "rgba(89,217,255,0)");
        fx.strokeStyle = grad;
        fx.lineWidth = 5;
        fx.beginPath();
        fx.moveTo(0, y);
        fx.lineTo(w, y);
        fx.stroke();

        // beam head
        fx.globalAlpha = 0.75;
        const rg = fx.createRadialGradient(beamX, y, 6, beamX, y, 46);
        rg.addColorStop(0, "rgba(255,255,255,0.95)");
        rg.addColorStop(0.45, "rgba(255,210,63,0.35)");
        rg.addColorStop(1, "rgba(89,217,255,0)");
        fx.fillStyle = rg;
        fx.beginPath();
        fx.arc(beamX, y, 46, 0, Math.PI * 2);
        fx.fill();
        fx.globalAlpha = 1;
      }
    }
  }

  function triggerImpact(piece) {
    if (!fx) return;
    // Estimate contact y (bottom-most occupied cell)
    let maxY = -999;
    let minX = 999;
    let maxX = -999;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        if (!piece.matrix[y][x]) continue;
        maxY = Math.max(maxY, piece.y + y);
        minX = Math.min(minX, piece.x + x);
        maxX = Math.max(maxX, piece.x + x);
      }
    }
    if (maxY < 0) return;

    const w = fx.canvas.width;
    const xCenter = ((minX + maxX + 1) / 2) * BLOCK;
    const yPix = (maxY + 1) * BLOCK;
    const baseColor = COLORS[piece.type] || "rgba(255,255,255,0.7)";
    // little ground shock glow
    fxPulseMs = Math.max(fxPulseMs, 160);
    for (let i = 0; i < 16; i++) {
      const vx = (Math.random() - 0.5) * 240;
      const vy = -120 - Math.random() * 260;
      impact.push({
        x: Math.max(0, Math.min(w, xCenter + (Math.random() - 0.5) * 40)),
        y: yPix - 4 + Math.random() * 6,
        vx,
        vy,
        r: 6 + Math.random() * 6,
        life: 0,
        maxLife: 260 + Math.random() * 160,
        color: baseColor,
      });
    }
  }

  function startLaserClear(rows) {
    if (rows.length === 0) return;
    clearFx = { rows: rows.slice(), t: 0, duration: 340 };
  }

  function clearLaserDone() {
    return !clearFx || clearFx.t >= clearFx.duration;
  }

  function showOverlay(title, hint) {
    overlayTitleEl.textContent = title;
    overlayHintEl.textContent = hint;
    overlayEl.classList.add("isVisible");
  }
  function hideOverlay() {
    overlayEl.classList.remove("isVisible");
  }

  function spawnNext() {
    piecesPlaced++;
    current = next;
    current.x = 3;
    current.y = -1;

    if (bag.length === 0) bag = makeBag();
    next = createPiece(bag.pop());
    drawNext(nctx, next);

    if (collides(board, current, 0, 0)) {
      gameOver = true;
      showOverlay("Game Over", "Press R to restart");
    }

    updateHud();
  }

  function hardOrSoftLockIfNeeded() {
    if (!collides(board, current, 0, 1)) return false;
    lockPiece(board, current);
    triggerImpact(current);

    const fullRows = findFullRows(board);
    if (fullRows.length > 0) {
      startLaserClear(fullRows);
      // Delay actual removal until laser passes.
      // We keep the piece locked on board so it looks like the laser deletes it.
    } else {
      spawnNext();
    }
    return true;
  }

  function tryMove(dx, dy) {
    if (paused || gameOver || clearFx) return;
    if (!collides(board, current, dx, dy)) {
      current.x += dx;
      current.y += dy;
    } else if (dy === 1 && dx === 0) {
      hardOrSoftLockIfNeeded();
    }
  }

  function tryRotate() {
    if (paused || gameOver || clearFx) return;
    const rotated = rotateCW(current.matrix);
    if (!collides(board, current, 0, 0, rotated)) {
      current.matrix = rotated;
      return;
    }
    // basic wall-kicks
    const kicks = [-1, 1, -2, 2];
    for (const k of kicks) {
      if (!collides(board, current, k, 0, rotated)) {
        current.x += k;
        current.matrix = rotated;
        return;
      }
    }
  }

  function restart() {
    board = makeEmptyBoard();
    bag = makeBag();
    current = createPiece(bag.pop());
    if (bag.length === 0) bag = makeBag();
    next = createPiece(bag.pop());
    score = 0;
    lines = 0;
    level = 1;
    paused = false;
    gameOver = false;
    piecesPlaced = 0;
    elapsedMs = 0;
    hudClockMs = 0;
    dropTimerMs = 0;
    lastTs = 0;
    nextMilestoneIdx = 0;
    confetti = [];
    impact = [];
    fxPulseMs = 0;
    clearFx = null;
    updateHud();
    hideOverlay();
    drawNext(nctx, next);
  }

  function togglePause() {
    if (gameOver) return;
    paused = !paused;
    if (paused) showOverlay("Paused", "Press P to resume");
    else {
      hideOverlay();
      // Ensure we keep receiving key events after resuming.
      gameCanvas.focus();
    }
  }

  function render() {
    drawBoard(ctx, board);
    // ghost
    const ghostY = computeDropY(board, current);
    drawPiece(ctx, current, ghostY, COLORS.GHOST, 1);
    // active
    drawPiece(ctx, current);
  }

  function frame(ts) {
    if (!lastTs) lastTs = ts;
    const dt = ts - lastTs;
    lastTs = ts;

    if (!paused && !gameOver) {
      elapsedMs += dt;
      hudClockMs += dt;
      if (hudClockMs >= 250) {
        hudClockMs = 0;
        updateHud();
      }
      // If we're showing the laser row-clear, freeze gravity/moves until it's done,
      // then actually remove rows and continue.
      if (clearFx && clearLaserDone()) {
        const cleared = applyClearRows(board, clearFx.rows);
        clearFx = null;
        if (cleared > 0) {
          score += scoreForLines(cleared, level);
          lines += cleared;
          level = Math.floor(lines / 10) + 1;
          checkMilestones();
          updateHud();
        }
        spawnNext();
      }

      const freezeForClear = !!clearFx;
      if (!freezeForClear) {
      dropTimerMs += dt;
      const interval = tickMsForLevel(level);
      while (dropTimerMs >= interval) {
        dropTimerMs -= interval;
        tryMove(0, 1);
      }
      }
    }

    render();
    stepFx(dt);
    requestAnimationFrame(frame);
  }

  function onKeyDown(e) {
    const key = e.key;
    if (key === "ArrowLeft") {
      e.preventDefault();
      tryMove(-1, 0);
      return;
    }
    if (key === "ArrowRight") {
      e.preventDefault();
      tryMove(1, 0);
      return;
    }
    if (key === "ArrowDown") {
      e.preventDefault();
      // soft drop + tiny score
      if (!paused && !gameOver && !collides(board, current, 0, 1)) {
        current.y += 1;
        score += 1;
        updateHud();
        checkMilestones();
      } else if (!paused && !gameOver) {
        hardOrSoftLockIfNeeded();
      }
      return;
    }
    if (key === " " || key === "Spacebar") {
      e.preventDefault();
      tryRotate();
      return;
    }
    if (key === "p" || key === "P") {
      e.preventDefault();
      togglePause();
      return;
    }
    if (key === "r" || key === "R") {
      e.preventDefault();
      restart();
      return;
    }
  }

  window.addEventListener("keydown", onKeyDown, { passive: false });

  // start
  try {
    const saved = localStorage.getItem(HIGH_SCORE_KEY);
    highScore = saved ? Number(saved) || 0 : 0;
  } catch {
    highScore = 0;
  }
  updateHud();
  drawNext(nctx, next);
  hideOverlay();
  gameCanvas.focus();
  requestAnimationFrame(frame);
})();
