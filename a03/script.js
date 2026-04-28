const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const nextCanvas = document.getElementById("next");
const nextCtx = nextCanvas.getContext("2d");

const scoreEl = document.getElementById("score");
const levelEl = document.getElementById("level");
const linesEl = document.getElementById("lines");
const statusEl = document.getElementById("status");
const startOverlay = document.getElementById("startOverlay");
const scoresEl = document.getElementById("scores");
const dinoFlash = document.getElementById("dinoFlash");
const soundButton = document.getElementById("soundButton");

const BLOCK = 30;
const ROWS = 20;
const COLS = 10;

const COLORS = {
  I:"#4dd0ff",
  O:"#ffe066",
  T:"#c77dff",
  S:"#7cf29a",
  Z:"#ff7b9c",
  J:"#7aa2ff",
  L:"#ffb35c"
};

const SHAPES = {
  I:[[1,1,1,1]],
  O:[[1,1],[1,1]],
  T:[[0,1,0],[1,1,1]],
  S:[[0,1,1],[1,1,0]],
  Z:[[1,1,0],[0,1,1]],
  J:[[1,0,0],[1,1,1]],
  L:[[0,0,1],[1,1,1]],
};
const TYPES = Object.keys(SHAPES);

let board = [];
let player = null;
let nextPiece = null;
let score = 0;
let lines = 0;
let level = 1;
let dropCounter = 0;
let lastTime = 0;
let dropInterval = 700;
let running = false;
let paused = false;
let soundOn = true;
let audioCtx = null;

function createBoard(){
  board = Array.from({length: ROWS}, () => Array(COLS).fill(null));
}
function cloneMatrix(m){
  return m.map(row => [...row]);
}
function randomType(){
  return TYPES[Math.floor(Math.random() * TYPES.length)];
}
function buildPiece(type){
  return { type, matrix: cloneMatrix(SHAPES[type]), x: 0, y: 0 };
}
function spawnPlayer(){
  if(!nextPiece) nextPiece = buildPiece(randomType());
  player = nextPiece;
  nextPiece = buildPiece(randomType());
  player.x = Math.floor(COLS / 2) - Math.ceil(player.matrix[0].length / 2);
  player.y = 0;
  drawNext();
  if(collision(player.x, player.y, player.matrix)){
    gameOver();
  }
}
function drawCell(x, y, color, context = ctx, size = BLOCK){
  context.fillStyle = color;
  context.fillRect(x * size, y * size, size - 1, size - 1);

  context.fillStyle = "rgba(255,255,255,.22)";
  context.fillRect(x * size + 3, y * size + 3, size - 12, 5);

  context.fillStyle = "rgba(0,0,0,.18)";
  context.fillRect(x * size + 6, y * size + size - 8, size - 12, 3);
}
function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

  for(let y=0; y<ROWS; y++){
    for(let x=0; x<COLS; x++){
      const cell = board[y][x];
      if(cell) drawCell(x, y, COLORS[cell]);
    }
  }
  if(player){
    for(let y=0; y<player.matrix.length; y++){
      for(let x=0; x<player.matrix[y].length; x++){
        if(player.matrix[y][x]){
          drawCell(player.x + x, player.y + y, COLORS[player.type]);
        }
      }
    }
  }
}
function drawNext(){
  nextCtx.clearRect(0,0,nextCanvas.width,nextCanvas.height);
  const size = 24;
  if(!nextPiece) return;
  const matrix = nextPiece.matrix;
  const offsetX = Math.floor((5 - matrix[0].length) / 2);
  const offsetY = Math.floor((5 - matrix.length) / 2);
  for(let y=0; y<matrix.length; y++){
    for(let x=0; x<matrix[y].length; x++){
      if(matrix[y][x]){
        drawCell(offsetX + x, offsetY + y, COLORS[nextPiece.type], nextCtx, size);
      }
    }
  }
}
function collision(nx, ny, matrix){
  for(let y=0; y<matrix.length; y++){
    for(let x=0; x<matrix[y].length; x++){
      if(!matrix[y][x]) continue;
      const px = nx + x;
      const py = ny + y;
      if(px < 0 || px >= COLS || py >= ROWS) return true;
      if(py >= 0 && board[py][px]) return true;
    }
  }
  return false;
}
function merge(){
  for(let y=0; y<player.matrix.length; y++){
    for(let x=0; x<player.matrix[y].length; x++){
      if(player.matrix[y][x]){
        board[player.y + y][player.x + x] = player.type;
      }
    }
  }
}
function rotate(matrix){
  return matrix[0].map((_, i) => matrix.map(row => row[i]).reverse());
}
function tryRotate(){
  const rotated = rotate(player.matrix);
  if(!collision(player.x, player.y, rotated)){
    player.matrix = rotated;
    beep(620, 0.04, "triangle");
    return;
  }
  if(!collision(player.x - 1, player.y, rotated)){
    player.x -= 1;
    player.matrix = rotated;
    beep(620, 0.04, "triangle");
    return;
  }
  if(!collision(player.x + 1, player.y, rotated)){
    player.x += 1;
    player.matrix = rotated;
    beep(620, 0.04, "triangle");
  }
}
function clearLines(){
  let cleared = 0;
  outer: for(let y = ROWS - 1; y >= 0; y--){
    for(let x = 0; x < COLS; x++){
      if(!board[y][x]) continue outer;
    }
    board.splice(y, 1);
    board.unshift(Array(COLS).fill(null));
    cleared++;
    y++;
  }
  if(cleared){
    const points = [0, 100, 300, 500, 800][cleared] || 800;
    score += points * level;
    lines += cleared;
    level = Math.floor(lines / 8) + 1;
    dropInterval = Math.max(140, 700 - (level - 1) * 55);
    updateStats();
    beep(220 + cleared * 100, 0.07, "square");
    setTimeout(() => beep(350 + cleared * 140, 0.06, "square"), 60);

    if(score > 0 && score % 500 < points * level){
      dinoBonus();
    }
  }
}
function dinoBonus(){
  let changed = false;
  for(let y = ROWS - 1; y >= Math.max(ROWS - 5, 0); y--){
    for(let x = 0; x < COLS; x++){
      if(board[y][x] && Math.random() < 0.45){
        board[y][x] = null;
        changed = true;
      }
    }
  }
  if(changed){
    dinoFlash.classList.add("show");
    setTimeout(() => dinoFlash.classList.remove("show"), 1400);
    beep(180, 0.12, "sawtooth");
    setTimeout(() => beep(140, 0.12, "sawtooth"), 90);
  }
}
function move(dx){
  if(!running || paused) return;
  if(!collision(player.x + dx, player.y, player.matrix)){
    player.x += dx;
    draw();
  }
}
function softDrop(){
  if(!running || paused) return;
  stepDown();
}
function stepDown(){
  player.y++;
  if(collision(player.x, player.y, player.matrix)){
    player.y--;
    merge();
    clearLines();
    spawnPlayer();
    beep(110, 0.05, "sine");
  }
  draw();
}
function updateStats(){
  scoreEl.textContent = score;
  levelEl.textContent = level;
  linesEl.textContent = lines;
  statusEl.textContent = !running ? "Ready" : paused ? "Paused" : "Playing";
}
function startGame(){
  if(!audioCtx && soundOn) initAudio();
  if(!running){
    createBoard();
    score = 0;
    lines = 0;
    level = 1;
    dropInterval = 700;
    nextPiece = buildPiece(randomType());
    spawnPlayer();
    running = true;
    paused = false;
    lastTime = 0;
    updateStats();
    startOverlay.classList.add("hidden");
    requestAnimationFrame(loop);
    draw();
  } else if(paused){
    paused = false;
    updateStats();
    requestAnimationFrame(loop);
  }
}
function restartGame(){
  running = false;
  paused = false;
  startOverlay.classList.remove("hidden");
  startOverlay.querySelector("h2").textContent = "Game Reset";
  startOverlay.querySelector("p").innerHTML = "Press <strong>Start</strong> to play again.";
  createBoard();
  nextPiece = null;
  player = null;
  score = 0;
  lines = 0;
  level = 1;
  dropInterval = 700;
  updateStats();
  draw();
  drawNext();
}
function togglePause(){
  if(!running) return;
  paused = !paused;
  updateStats();
  if(!paused) requestAnimationFrame(loop);
}
function gameOver(){
  running = false;
  paused = false;
  updateStats();
  saveScore();
  beep(120, 0.18, "sawtooth");
  setTimeout(() => beep(90, 0.22, "sawtooth"), 120);
  startOverlay.classList.remove("hidden");
  startOverlay.querySelector("h2").textContent = "Game Over";
  startOverlay.querySelector("p").innerHTML = "Final score: <strong>" + score + "</strong><br>Press <strong>Restart</strong> then <strong>Start</strong> to play again.";
}
function loop(time = 0){
  if(!running || paused) return;
  const delta = time - lastTime;
  lastTime = time;
  dropCounter += delta;
  if(dropCounter > dropInterval){
    stepDown();
    dropCounter = 0;
  }
  draw();
  requestAnimationFrame(loop);
}
document.addEventListener("keydown", e => {
  if(e.key === "ArrowLeft") move(-1);
  else if(e.key === "ArrowRight") move(1);
  else if(e.key === "ArrowDown") softDrop();
  else if(e.key === "ArrowUp" || e.key === " "){
    if(running && !paused){
      tryRotate();
      draw();
    }
  } else if(e.key.toLowerCase() === "p"){
    togglePause();
  }
});

function saveScore(){
  const name = prompt("Enter your name for the leaderboard:", "Player") || "Player";
  const item = { name: name.trim().slice(0,12) || "Player", score };
  const scores = JSON.parse(localStorage.getItem("dino_tetris_scores") || "[]");
  scores.push(item);
  scores.sort((a,b) => b.score - a.score);
  localStorage.setItem("dino_tetris_scores", JSON.stringify(scores.slice(0,5)));
  renderScores();
}
function renderScores(){
  const scores = JSON.parse(localStorage.getItem("dino_tetris_scores") || "[]");
  scoresEl.innerHTML = "";
  if(!scores.length){
    scoresEl.innerHTML = "<li>No scores yet</li>";
    return;
  }
  scores.forEach(s => {
    const li = document.createElement("li");
    li.textContent = s.name + " — " + s.score;
    scoresEl.appendChild(li);
  });
}
function initAudio(){
  try{
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch(e){
    soundOn = false;
    if (soundButton) soundButton.textContent = "Sound: Off";
  }
}
function beep(freq=440, duration=0.06, type="sine"){
  if(!soundOn) return;
  if(!audioCtx) initAudio();
  if(!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration);
}
function toggleSound(){
  soundOn = !soundOn;
  if (soundButton) soundButton.textContent = "Sound: " + (soundOn ? "On" : "Off");
  if(soundOn && !audioCtx) initAudio();
}

createBoard();
draw();
drawNext();
renderScores();
updateStats();