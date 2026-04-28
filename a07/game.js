(() => {
  const COLS = 10;
  const ROWS = 20;
  const CELL = 30; // canvas is 300x600

  const COLORS = {
    I: "#6ee7ff",
    O: "#ffd166",
    T: "#c77dff",
    S: "#23f0a7",
    Z: "#ff4d6d",
    J: "#4d7cff",
    L: "#ff9f1c",
    GARBAGE: "rgba(255,255,255,.10)"
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

  const PIECE_KEYS = Object.keys(SHAPES);

  function randInt(n) {
    return (Math.random() * n) | 0;
  }

  function cloneGrid() {
    return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
  }

  function rotateCW(mat) {
    const h = mat.length;
    const w = mat[0].length;
    const out = Array.from({ length: w }, () => Array(h).fill(0));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) out[x][h - 1 - y] = mat[y][x];
    }
    return out;
  }

  function toast(text) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 1700);
  }

  function scoreForLines(n) {
    if (n <= 0) return 0;
    // Classic-ish scoring (scaled a bit)
    if (n === 1) return 100;
    if (n === 2) return 300;
    if (n === 3) return 500;
    return 800;
  }

  function dropMsForLevel(level) {
    const l = Math.max(1, level | 0);
    // Faster each level; ramp is intentionally noticeable.
    // Starts slightly faster, then accelerates more per level.
    // Floor prevents it from becoming literally unplayable.
    const base = 720;
    const perLevel = 75;
    return Math.max(55, base - (l - 1) * perLevel);
  }

  function pieceSpawnX(shape) {
    const w = shape[0].length;
    return ((COLS - w) / 2) | 0;
  }

  function makePiece(key) {
    const shape = SHAPES[key];
    return {
      key,
      shape: shape.map((r) => r.slice()),
      x: pieceSpawnX(shape),
      y: -1
    };
  }

  function drawCell(ctx, x, y, fill, alpha = 1) {
    const px = x * CELL;
    const py = y * CELL;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
    ctx.globalAlpha = 1;
  }

  function drawGrid(ctx, grid) {
    ctx.clearRect(0, 0, COLS * CELL, ROWS * CELL);
    // subtle grid background
    ctx.fillStyle = "rgba(0,0,0,.20)";
    ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);
    ctx.strokeStyle = "rgba(255,255,255,.05)";
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL, 0);
      ctx.lineTo(x * CELL, ROWS * CELL);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL);
      ctx.lineTo(COLS * CELL, y * CELL);
      ctx.stroke();
    }

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const v = grid[y][x];
        if (!v) continue;
        drawCell(ctx, x, y, COLORS[v] || v);
      }
    }
  }

  function drawPiece(ctx, piece, alpha = 1) {
    if (!piece) return;
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (!piece.shape[y][x]) continue;
        const gx = piece.x + x;
        const gy = piece.y + y;
        if (gy < 0) continue;
        drawCell(ctx, gx, gy, COLORS[piece.key], alpha);
      }
    }
  }

  function drawGhost(ctx, state) {
    const p = state.active;
    if (!p) return;
    let gy = p.y;
    while (!collides(state.grid, { ...p, y: gy + 1 })) gy++;
    if (gy === p.y) return;
    drawPiece(ctx, { ...p, y: gy }, 0.22);
  }

  function drawNext(ctx, pieceKey) {
    ctx.clearRect(0, 0, 120, 120);
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.fillRect(0, 0, 120, 120);
    const shape = SHAPES[pieceKey];
    if (!shape) return;
    const cell = 24;
    const h = shape.length;
    const w = shape[0].length;
    const ox = ((120 - w * cell) / 2) | 0;
    const oy = ((120 - h * cell) / 2) | 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!shape[y][x]) continue;
        ctx.fillStyle = COLORS[pieceKey];
        ctx.fillRect(ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2);
      }
    }
  }

  function collides(grid, piece) {
    const s = piece.shape;
    for (let y = 0; y < s.length; y++) {
      for (let x = 0; x < s[y].length; x++) {
        if (!s[y][x]) continue;
        const gx = piece.x + x;
        const gy = piece.y + y;
        if (gx < 0 || gx >= COLS) return true;
        if (gy >= ROWS) return true;
        if (gy >= 0 && grid[gy][gx]) return true;
      }
    }
    return false;
  }

  function merge(grid, piece) {
    const s = piece.shape;
    for (let y = 0; y < s.length; y++) {
      for (let x = 0; x < s[y].length; x++) {
        if (!s[y][x]) continue;
        const gx = piece.x + x;
        const gy = piece.y + y;
        if (gy >= 0 && gy < ROWS && gx >= 0 && gx < COLS) grid[gy][gx] = piece.key;
      }
    }
  }

  function clearLines(grid) {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (grid[y].every(Boolean)) {
        grid.splice(y, 1);
        grid.unshift(Array.from({ length: COLS }, () => null));
        cleared++;
        y++;
      }
    }
    return cleared;
  }

  function dinoEat(grid) {
    // "Dino" eats a bite: clears a 3x3-ish chunk somewhere mid-board.
    // It feels like a bonus: removes blocks that might be blocking you.
    const x0 = 2 + randInt(COLS - 4);
    const y0 = 6 + randInt(ROWS - 10);
    for (let y = y0 - 1; y <= y0 + 1; y++) {
      for (let x = x0 - 1; x <= x0 + 1; x++) {
        if (y >= 0 && y < ROWS && x >= 0 && x < COLS) grid[y][x] = null;
      }
    }
    return { x0, y0 };
  }

  function makeState() {
    const bag = [];
    const refillBag = () => {
      const arr = PIECE_KEYS.slice();
      // shuffle
      for (let i = arr.length - 1; i > 0; i--) {
        const j = randInt(i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      bag.push(...arr);
    };
    refillBag();

    const nextKey = () => {
      if (bag.length < 3) refillBag();
      return bag.shift();
    };

    const s = {
      grid: cloneGrid(),
      score: 0,
      lines: 0,
      level: 1,
      active: makePiece(nextKey()),
      next: nextKey(),
      gameOver: false,
      paused: false,
      dropMs: dropMsForLevel(1),
      lastDropAt: 0,
      dinoCooldown: 0,
      dinoFlash: 0
    };
    return s;
  }

  function spawnNext(state) {
    state.active = makePiece(state.next);
    state.next = PIECE_KEYS[randInt(PIECE_KEYS.length)];
    if (collides(state.grid, state.active)) {
      state.gameOver = true;
      if (window.TetrisAudio) window.TetrisAudio.sfx.gameOver();
      toast("Game over — save your score!");
    }
  }

  function tryMove(state, dx, dy) {
    if (state.gameOver || state.paused) return false;
    const p = { ...state.active, x: state.active.x + dx, y: state.active.y + dy };
    if (collides(state.grid, p)) return false;
    state.active = p;
    return true;
  }

  function tryRotate(state) {
    if (state.gameOver || state.paused) return false;
    const rotated = rotateCW(state.active.shape);
    const kicks = [0, -1, 1, -2, 2];
    for (const k of kicks) {
      const p = { ...state.active, shape: rotated, x: state.active.x + k };
      if (!collides(state.grid, p)) {
        state.active = p;
        return true;
      }
    }
    return false;
  }

  function hardDrop(state) {
    if (state.gameOver || state.paused) return;
    while (tryMove(state, 0, 1)) {
      state.score += 1;
    }
    lockPiece(state);
  }

  function lockPiece(state) {
    merge(state.grid, state.active);
    if (window.TetrisAudio) window.TetrisAudio.sfx.lock();

    const cleared = clearLines(state.grid);
    if (cleared > 0) {
      state.lines += cleared;
      const add = scoreForLines(cleared) * state.level;
      state.score += add;
      if (window.TetrisAudio) window.TetrisAudio.sfx.lineClear(cleared);
    }

    const nextLevel = 1 + Math.floor(state.lines / 10);
    if (nextLevel !== state.level) {
      state.level = nextLevel;
      state.dropMs = dropMsForLevel(state.level);
      if (window.TetrisAudio) window.TetrisAudio.setLevel(state.level);
      if (window.TetrisAudio) window.TetrisAudio.sfx.levelUp();
      toast(`Level ${state.level}! Speed up!`);
    }

    // Dino bonus chance increases with level, but has cooldown
    if (state.dinoCooldown <= 0) {
      const chance = Math.min(0.18, 0.03 + state.level * 0.012);
      if (Math.random() < chance) {
        const bite = dinoEat(state.grid);
        state.dinoCooldown = 10 + state.level * 3;
        state.dinoFlash = 26;
        if (window.TetrisAudio) window.TetrisAudio.sfx.dino();
        toast("DINO BONUS! It ate some blocks.");
        // tiny score bonus
        state.score += 250 * state.level;
        // record bite for remote display (optional)
        state._lastDinoBite = bite;
      }
    } else {
      state.dinoCooldown--;
    }

    spawnNext(state);
  }

  function step(state, t) {
    if (state.gameOver || state.paused) return;
    if (t - state.lastDropAt >= state.dropMs) {
      state.lastDropAt = t;
      if (!tryMove(state, 0, 1)) lockPiece(state);
    }
    if (state.dinoFlash > 0) state.dinoFlash--;
  }

  function render(state, ctx, nextCtx) {
    drawGrid(ctx, state.grid);
    drawGhost(ctx, state);
    drawPiece(ctx, state.active, 1);

    if (state.dinoFlash > 0) {
      const a = Math.max(0, Math.min(1, state.dinoFlash / 26));
      ctx.fillStyle = `rgba(255,255,255,${0.10 * a})`;
      ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);

      // a big simple "dino" silhouette
      ctx.save();
      ctx.globalAlpha = 0.25 * a;
      ctx.fillStyle = "#23f0a7";
      ctx.beginPath();
      ctx.roundRect?.(18, 45, 110, 64, 18);
      ctx.fill();
      ctx.restore();
    }

    drawNext(nextCtx, state.next);
  }

  function serializeForNet(state) {
    return {
      grid: state.grid,
      active: state.active,
      next: state.next,
      score: state.score,
      lines: state.lines,
      level: state.level,
      gameOver: state.gameOver,
      paused: state.paused,
      dinoFlash: state.dinoFlash
    };
  }

  function applyRemoteState(localState, remotePayload) {
    // localState is the P2 mirror state; just replace.
    localState.grid = remotePayload.grid;
    localState.active = remotePayload.active;
    localState.next = remotePayload.next;
    localState.score = remotePayload.score;
    localState.lines = remotePayload.lines;
    localState.level = remotePayload.level;
    localState.gameOver = remotePayload.gameOver;
    localState.paused = remotePayload.paused;
    localState.dinoFlash = remotePayload.dinoFlash || 0;
  }

  // Scoreboard (local history)
  const SCORE_KEY = "tetris_dino_scores_v1";
  function loadScores() {
    try {
      const v = JSON.parse(localStorage.getItem(SCORE_KEY) || "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  function saveScores(list) {
    localStorage.setItem(SCORE_KEY, JSON.stringify(list.slice(0, 25)));
  }
  function renderScores() {
    const el = document.getElementById("scoreList");
    if (!el) return;
    const list = loadScores();
    el.innerHTML = "";
    for (const row of list) {
      const div = document.createElement("div");
      div.className = "scoreRow";
      const when = new Date(row.t).toLocaleString();
      div.innerHTML = `
        <div>
          <div class="who">${escapeHtml(row.name || "anon")}</div>
          <div class="meta">${escapeHtml(when)}</div>
        </div>
        <div style="text-align:right">
          <div><strong>${row.score}</strong></div>
          <div class="meta">L${row.level} • ${row.lines} lines</div>
        </div>
      `;
      el.appendChild(div);
    }
  }
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Main boot
  const el = {
    btnStart: document.getElementById("btnStart"),
    btnPause: document.getElementById("btnPause"),
    btnReset: document.getElementById("btnReset"),
    btnAudio: document.getElementById("btnAudio"),
    btnHost: document.getElementById("btnHost"),
    btnJoin: document.getElementById("btnJoin"),
    wsUrl: document.getElementById("wsUrl"),
    netStatus: document.getElementById("netStatus"),
    nameInput: document.getElementById("nameInput"),
    btnSaveScore: document.getElementById("btnSaveScore"),
    c1: document.getElementById("canvasP1"),
    c2: document.getElementById("canvasP2"),
    n1: document.getElementById("nextP1"),
    n2: document.getElementById("nextP2"),
    scoreP1: document.getElementById("scoreP1"),
    linesP1: document.getElementById("linesP1"),
    levelP1: document.getElementById("levelP1"),
    scoreP2: document.getElementById("scoreP2"),
    linesP2: document.getElementById("linesP2"),
    levelP2: document.getElementById("levelP2")
  };

  const ctx1 = el.c1.getContext("2d");
  const ctx2 = el.c2.getContext("2d");
  const next1 = el.n1.getContext("2d");
  const next2 = el.n2.getContext("2d");

  let p1 = makeState();
  let p2 = makeState(); // local or remote mirror
  p2.paused = true; // until connected / local 2P mode is added

  let running = false;
  let raf = 0;

  function syncHud() {
    el.scoreP1.textContent = String(p1.score);
    el.linesP1.textContent = String(p1.lines);
    el.levelP1.textContent = String(p1.level);
    el.scoreP2.textContent = String(p2.score);
    el.linesP2.textContent = String(p2.lines);
    el.levelP2.textContent = String(p2.level);
  }

  function frame(t) {
    if (running) step(p1, t);
    // p2 is either remote or frozen
    render(p1, ctx1, next1);
    render(p2, ctx2, next2);
    syncHud();

    // broadcast P1 state when hosting or joining (send our local state)
    if (window.TetrisNet && (TetrisNet.role === "host" || TetrisNet.role === "join")) {
      TetrisNet.sendState(serializeForNet(p1));
    }

    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (!running) {
      running = true;
      p1.paused = false;
      if (window.TetrisAudio) window.TetrisAudio.setLevel(p1.level);
      toast("Go!");
    }
  }

  function pauseToggle() {
    if (!running) return;
    p1.paused = !p1.paused;
    toast(p1.paused ? "Paused" : "Resume");
  }

  function reset() {
    p1 = makeState();
    p2 = makeState();
    p2.paused = true;
    running = false;
    toast("Reset.");
  }

  function audioToggle() {
    if (!window.TetrisAudio) return;
    if (TetrisAudio.enabled) {
      TetrisAudio.disable();
      el.btnAudio.textContent = "Audio: Off";
      toast("Audio off");
    } else {
      TetrisAudio.enable();
      TetrisAudio.setLevel(p1.level);
      el.btnAudio.textContent = "Audio: On";
      toast("Audio on");
    }
  }

  function saveScore() {
    const name = (el.nameInput.value || "").trim() || "anon";
    const row = { name: name.slice(0, 18), score: p1.score, lines: p1.lines, level: p1.level, t: Date.now() };
    const list = loadScores();
    list.unshift(row);
    list.sort((a, b) => b.score - a.score);
    saveScores(list);
    renderScores();
    toast("Saved!");
  }

  // Key controls
  window.addEventListener("keydown", (ev) => {
    if (ev.key === "p" || ev.key === "P") {
      ev.preventDefault();
      pauseToggle();
      return;
    }
    if (!running || p1.paused || p1.gameOver) return;

    if (ev.key === "ArrowLeft") {
      ev.preventDefault();
      if (tryMove(p1, -1, 0) && window.TetrisAudio) TetrisAudio.sfx.move();
    } else if (ev.key === "ArrowRight") {
      ev.preventDefault();
      if (tryMove(p1, 1, 0) && window.TetrisAudio) TetrisAudio.sfx.move();
    } else if (ev.key === "ArrowDown") {
      ev.preventDefault();
      if (tryMove(p1, 0, 1)) {
        p1.score += 1;
        if (window.TetrisAudio) TetrisAudio.sfx.drop();
      }
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      hardDrop(p1);
      if (window.TetrisAudio) TetrisAudio.sfx.drop();
    } else if (ev.code === "Space") {
      ev.preventDefault();
      if (tryRotate(p1) && window.TetrisAudio) TetrisAudio.sfx.rotate();
    }
  });

  // Buttons
  el.btnStart.addEventListener("click", () => start());
  el.btnPause.addEventListener("click", () => pauseToggle());
  el.btnReset.addEventListener("click", () => reset());
  el.btnAudio.addEventListener("click", () => audioToggle());
  el.btnSaveScore.addEventListener("click", () => saveScore());

  // Net
  if (window.TetrisNet) {
    TetrisNet.init({
      statusEl: el.netStatus,
      onRemoteState(payload) {
        applyRemoteState(p2, payload);
      }
    });
  }

  el.btnHost.addEventListener("click", () => {
    const url = (el.wsUrl.value || "").trim() || "ws://localhost:8787";
    if (window.TetrisNet) {
      TetrisNet.connectHost(url);
      p2.paused = true; // remote mirror
      toast("Hosting (sending your state)");
    }
  });

  el.btnJoin.addEventListener("click", () => {
    const url = (el.wsUrl.value || "").trim() || "ws://localhost:8787";
    if (window.TetrisNet) {
      TetrisNet.connectJoin(url);
      p2.paused = true;
      toast("Joined (receiving other player)");
    }
  });

  // Initial paint
  renderScores();
  syncHud();
  render(p1, ctx1, next1);
  render(p2, ctx2, next2);
  raf = requestAnimationFrame(frame);
})();

