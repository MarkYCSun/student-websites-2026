const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.scale(20, 20);

const arena = createMatrix(12, 20);
const player = { pos: { x: 0, y: 0 }, matrix: null, score: 0 };

let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;
let isPaused = false;

/* MATRIX */
function createMatrix(w, h) {
  const matrix = [];
  while (h--) matrix.push(new Array(w).fill(0));
  return matrix;
}

/* PIECES */
function createPiece(type) {
  if (type === 'T') return [[0,1,0],[1,1,1],[0,0,0]];
  if (type === 'O') return [[2,2],[2,2]];
  if (type === 'L') return [[0,0,3],[3,3,3],[0,0,0]];
}

/* DRAW */
function drawMatrix(matrix, offset) {
  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        ctx.fillStyle = 'hsl(' + (value * 60) + ',70%,60%)';
        ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
      }
    });
  });
}

function draw() {
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawMatrix(arena, { x: 0, y: 0 });
  drawMatrix(player.matrix, player.pos);
}

/* FLASH */
function flashBorder() {
  canvas.classList.add("flash");
  setTimeout(() => canvas.classList.remove("flash"), 200);
}

/* MERGE */
function merge(arena, player) {
  player.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        arena[y + player.pos.y][x + player.pos.x] = value;
      }
    });
  });
}

/* COLLIDE */
function collide(arena, player) {
  const [m, o] = [player.matrix, player.pos];
  for (let y = 0; y < m.length; y++) {
    for (let x = 0; x < m[y].length; x++) {
      if (m[y][x] !== 0 &&
        (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) {
        return true;
      }
    }
  }
  return false;
}

/* RESET */
function playerReset() {
  const pieces = 'TOL';
  player.matrix = createPiece(pieces[Math.floor(Math.random() * pieces.length)]);
  player.pos.y = 0;
  player.pos.x = 5;

  if (collide(arena, player)) {
    const name = prompt("💀 Game Over! Enter your name:");
    if (name) {
      const scores = JSON.parse(localStorage.getItem("scores") || "[]");
      scores.push({ name, score: player.score });
      scores.sort((a, b) => b.score - a.score);
      localStorage.setItem("scores", JSON.stringify(scores));
      displayScores();
    }

    arena.forEach(row => row.fill(0));
    player.score = 0;
    updateScore();
  }
}

/* DROP */
function playerDrop() {
  if (isPaused) return;

  player.pos.y++;

  if (collide(arena, player)) {
    player.pos.y--;
    player.score += 1;
    updateScore();

    merge(arena, player);
    playerReset();
    arenaSweep();
  }

  dropCounter = 0;
}

/* CLEAR ROWS */
function arenaSweep() {
  let rowCount = 1;
  outer: for (let y = arena.length - 1; y >= 0; y--) {
    for (let x = 0; x < arena[y].length; x++) {
      if (arena[y][x] === 0) continue outer;
    }
    arena.splice(y, 1);
    arena.unshift(new Array(12).fill(0));
    player.score += rowCount * 10;
    rowCount *= 2;
    updateScore();
  }
}

/* SCORE */
function updateScore() {
  document.getElementById("score").innerText = player.score;
}

/* LOOP */
function update(time = 0) {
  const delta = time - lastTime;
  lastTime = time;

  if (!isPaused) {
    dropCounter += delta;
    if (dropCounter > dropInterval) {
      playerDrop();
    }
  }

  draw();
  requestAnimationFrame(update);
}

/* CONTROLS */
document.addEventListener('keydown', e => {
  if (isPaused) return;

  const hitSound = document.getElementById("hitSound");

  if (e.key === 'ArrowLeft') {
    player.pos.x--;
    if (collide(arena, player)) {
      player.pos.x++;
      hitSound.currentTime = 0;
      hitSound.play();
      flashBorder();
    }
  }

  if (e.key === 'ArrowRight') {
    player.pos.x++;
    if (collide(arena, player)) {
      player.pos.x--;
      hitSound.currentTime = 0;
      hitSound.play();
      flashBorder();
    }
  }

  if (e.key === 'ArrowDown') playerDrop();
});

/* PAUSE / RESUME */
document.getElementById("pauseBtn").addEventListener("click", () => {
  isPaused = !isPaused;
  document.getElementById("pauseBtn").innerText =
    isPaused ? "▶ Resume" : "⏸ Pause";
});

/* RESTART */
document.getElementById("restartBtn").addEventListener("click", () => {
  arena.forEach(row => row.fill(0));
  player.score = 0;
  updateScore();
  playerReset();
});

/* LEADERBOARD */
function saveScore() {
  const name = document.getElementById("playerName").value;
  const scores = JSON.parse(localStorage.getItem("scores") || "[]");
  scores.push({ name, score: player.score });
  scores.sort((a, b) => b.score - a.score);
  localStorage.setItem("scores", JSON.stringify(scores));
  displayScores();
}

function displayScores() {
  const scores = JSON.parse(localStorage.getItem("scores") || "[]");
  const list = document.getElementById("leaderboard");
  list.innerHTML = "";
  scores.slice(0, 5).forEach(s => {
    const li = document.createElement("li");
    li.textContent = `${s.name}: ${s.score}`;
    list.appendChild(li);
  });
}

/* CLEAR */
document.getElementById("clr").addEventListener("click", () => {
  localStorage.removeItem("scores");
  displayScores();
});

/* START */
document.getElementById("startBtn").addEventListener("click", () => {
  document.getElementById("startScreen").style.display = "none";
  document.getElementById("bgMusic").play();
});

/* INIT */
playerReset();
updateScore();
displayScores();
update();