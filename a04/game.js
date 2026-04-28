/**
 * ============================================================
 * DINO-TRIX: Jurassic Chaos Edition — Game Engine
 * ============================================================
 * A fully featured Tetris game with:
 * - Canvas-based rendering at 60fps
 * - Web Audio API procedural music & SFX
 * - T-Rex power-up that eats blocks
 * - Two-player split-screen mode
 * - High score persistence (localStorage)
 * - Save & resume game state (localStorage)
 * - Meteor showers, power-ups, level themes
 * - Combo multiplier system
 * - Mobile touch + swipe controls
 * - Konami code easter egg
 * - Pause menu with dino facts
 * ============================================================
 */

// ============================================================
// CONSTANTS & CONFIG
// ============================================================
const COLS = 10;
const ROWS = 20;
const BLOCK = 28; // pixel size per cell

// Dino-themed neon colors for tetrominoes
const COLORS = {
  I: '#00e5ff', // Velociraptor blue
  O: '#ffdd00', // Amber yellow
  T: '#cc44ff', // Pterodactyl purple
  S: '#00ff66', // Triceratops green
  Z: '#ff3333', // T-Rex red
  J: '#ff8800', // Stegosaurus orange
  L: '#ff66aa', // Pink raptor
};

// Glow colors (slightly brighter)
const GLOW = {
  I: '#66f0ff', O: '#ffee66', T: '#dd88ff',
  S: '#66ffaa', Z: '#ff7777', J: '#ffaa44', L: '#ff99cc',
};

// Shape definitions (rotation states)
const SHAPES = {
  I: [[[0,0],[1,0],[2,0],[3,0]],[[0,0],[0,1],[0,2],[0,3]]],
  O: [[[0,0],[1,0],[0,1],[1,1]]],
  T: [[[0,0],[1,0],[2,0],[1,1]],[[0,0],[0,1],[0,2],[1,1]],[[1,0],[0,1],[1,1],[2,1]],[[1,0],[1,1],[1,2],[0,1]]],
  S: [[[1,0],[2,0],[0,1],[1,1]],[[0,0],[0,1],[1,1],[1,2]]],
  Z: [[[0,0],[1,0],[1,1],[2,1]],[[1,0],[0,1],[1,1],[0,2]]],
  J: [[[0,0],[0,1],[1,1],[2,1]],[[0,0],[1,0],[0,1],[0,2]],[[0,0],[1,0],[2,0],[2,1]],[[1,0],[1,1],[0,2],[1,2]]],
  L: [[[2,0],[0,1],[1,1],[2,1]],[[0,0],[0,1],[0,2],[1,2]],[[0,0],[1,0],[2,0],[0,1]],[[0,0],[1,0],[1,1],[1,2]]],
};

const PIECE_TYPES = ['I','O','T','S','Z','J','L'];

// Scoring: lines -> points
const LINE_SCORES = [0, 100, 300, 500, 800];

// Dino titles for high score names
const DINO_TITLES = [
  'T-Rex Terror', 'Velociraptor Legend', 'Dino Destroyer',
  'Fossil Fiend', 'Jurassic King', 'Cretaceous Crusher',
  'Triassic Titan', 'Mega Raptor', 'Stego Slayer',
  'Ptero Phantom', 'Dino Dynamo', 'Bone Breaker',
  'Egg Smasher', 'Canyon Champion', 'Lava Lord',
];

// Dino fun facts for pause screen
const DINO_FACTS = [
  "T-Rex had a bite force of over 12,800 pounds — enough to crush a car!",
  "Velociraptors were actually only about the size of a turkey.",
  "The word 'dinosaur' means 'terrible lizard' in Greek.",
  "Some dinosaurs had feathers, not scales!",
  "Stegosaurus had a brain the size of a walnut.",
  "Triceratops' frill may have been used to attract mates.",
  "Pterodactyls aren't actually dinosaurs — they're flying reptiles!",
  "The longest dinosaur was Argentinosaurus at ~130 feet long.",
  "T-Rex lived closer in time to us than to Stegosaurus.",
  "Dinosaurs lived on every continent, including Antarctica.",
  "Some sauropods could whip their tails faster than the speed of sound!",
  "Ankylosaurs had built-in armor plating and club tails.",
  "Most dinosaurs were herbivores, not carnivores.",
  "Birds are living dinosaurs — they evolved from theropods!",
  "The asteroid that killed the dinosaurs was about 7.5 miles wide.",
];

// Power-up types
const POWERUP_TYPES = ['slow', 'magnet', 'ghost', 'bomb', 'clear_row'];

// Konami code sequence
const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];

// localStorage keys
const LS_SCORES    = 'dinotrix_scores';
const LS_SAVE_GAME = 'dinotrix_saved_game';


// ============================================================
// AUDIO ENGINE — Web Audio API Procedural Music & SFX
// ============================================================
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicVolume = 0.5;
    this.sfxVolume = 0.7;
    this.musicGain = null;
    this.sfxGain = null;
    this.currentMusic = null;
    this.initialized = false;
  }

  /** Initialize audio context (must be called from user gesture) */
  init() {
    if (this.initialized) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.ctx.destination);
      this.initialized = true;
    } catch(e) {
      console.warn('Web Audio API not available:', e);
    }
  }

  setMusicVolume(v) {
    this.musicVolume = v;
    if (this.musicGain) this.musicGain.gain.value = v;
  }

  setSfxVolume(v) {
    this.sfxVolume = v;
    if (this.sfxGain) this.sfxGain.gain.value = v;
  }

  /** Play a note using oscillator */
  playNote(freq, duration, type = 'square', gain = 0.3, dest = null) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(g);
    g.connect(dest || this.sfxGain);
    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + duration);
  }

  /** Piece drop / lock sound */
  sfxDrop() {
    this.playNote(180, 0.1, 'square', 0.25);
    this.playNote(120, 0.15, 'triangle', 0.2);
  }

  /** Move / rotate sound */
  sfxMove() {
    this.playNote(400, 0.05, 'square', 0.1);
  }

  /** Line clear sound — ascending arpeggio */
  sfxLineClear(lines) {
    const base = 300 + lines * 50;
    for (let i = 0; i < lines + 2; i++) {
      setTimeout(() => this.playNote(base + i * 80, 0.15, 'square', 0.25), i * 60);
    }
  }

  /** Level up fanfare */
  sfxLevelUp() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      setTimeout(() => this.playNote(f, 0.2, 'square', 0.3), i * 100);
    });
  }

  /** T-Rex roar — low rumble + noise burst */
  sfxTrexRoar() {
    if (!this.ctx) return;
    // Low oscillator sweep
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.8);
    g.gain.setValueAtTime(0.5 * this.sfxVolume, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.8);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(); osc.stop(this.ctx.currentTime + 0.8);

    // Noise burst
    const bufferSize = this.ctx.sampleRate * 0.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i/bufferSize);
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.3 * this.sfxVolume, this.ctx.currentTime);
    ng.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    noise.connect(filter);
    filter.connect(ng);
    ng.connect(this.ctx.destination);
    noise.start(); noise.stop(this.ctx.currentTime + 0.5);
  }

  /** T-Rex eat sound */
  sfxTrexEat() {
    this.playNote(200, 0.08, 'square', 0.3);
    setTimeout(() => this.playNote(150, 0.1, 'sawtooth', 0.25), 80);
    setTimeout(() => this.playNote(100, 0.15, 'square', 0.2), 160);
  }

  /** Game over dramatic sound */
  sfxGameOver() {
    const notes = [400, 350, 300, 250, 200, 150];
    notes.forEach((f, i) => {
      setTimeout(() => this.playNote(f, 0.3, 'sawtooth', 0.3), i * 150);
    });
  }

  /** Meteor shower sound */
  sfxMeteor() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2000, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.6);
    g.gain.setValueAtTime(0.3, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.6);
    osc.connect(g); g.connect(this.sfxGain);
    osc.start(); osc.stop(this.ctx.currentTime + 0.6);
  }

  /** Power-up collect sound */
  sfxPowerUp() {
    const notes = [880, 1100, 1320, 1760];
    notes.forEach((f, i) => {
      setTimeout(() => this.playNote(f, 0.12, 'sine', 0.25), i * 50);
    });
  }

  /** Dino stampede sound */
  sfxStampede() {
    for (let i = 0; i < 8; i++) {
      setTimeout(() => {
        this.playNote(60 + Math.random() * 40, 0.1, 'square', 0.25);
        this.playNote(100 + Math.random() * 60, 0.08, 'triangle', 0.15);
      }, i * 70);
    }
  }

  /** Konami golden T-Rex sound */
  sfxKonami() {
    const notes = [523, 659, 784, 1047, 1319, 1568, 2093];
    notes.forEach((f, i) => {
      setTimeout(() => this.playNote(f, 0.3, 'sine', 0.3), i * 80);
    });
  }

  /** Start background music loop for a given level */
  startMusic(level) {
    this.stopMusic();
    if (!this.ctx) return;

    // Different melodies per level range
    const melodies = [
      // Level 1-4: Jungle drums + melody
      { tempo: 140, notes: [262,294,330,349,392,349,330,294,262,220,196,220,262,330,392,440], bass: [65,65,82,82,98,98,82,82] },
      // Level 5-9: Volcanic intense
      { tempo: 160, notes: [330,392,440,523,440,392,330,262,294,349,392,440,523,587,523,440], bass: [82,82,98,98,110,110,98,98] },
      // Level 10+: Ice age ethereal
      { tempo: 120, notes: [523,494,440,392,349,330,294,262,294,330,349,392,440,494,523,587], bass: [131,131,110,110,98,98,110,110] },
    ];

    const idx = level < 5 ? 0 : level < 10 ? 1 : 2;
    const m = melodies[idx];
    let noteIdx = 0;
    let bassIdx = 0;

    const interval = 60000 / m.tempo / 2; // eighth notes

    this.currentMusic = setInterval(() => {
      if (!this.ctx) return;
      // Melody
      this.playNote(m.notes[noteIdx % m.notes.length], interval / 1000 * 0.8, 'square', 0.12, this.musicGain);
      // Bass on every other note
      if (noteIdx % 2 === 0) {
        this.playNote(m.bass[bassIdx % m.bass.length], interval / 1000 * 1.5, 'triangle', 0.15, this.musicGain);
        bassIdx++;
      }
      // Drums on every 4th
      if (noteIdx % 4 === 0) {
        this.playDrum();
      }
      noteIdx++;
    }, interval);
  }

  /** Simple procedural drum hit */
  playDrum() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.1);
    g.gain.setValueAtTime(0.2, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
    osc.connect(g); g.connect(this.musicGain);
    osc.start(); osc.stop(this.ctx.currentTime + 0.15);
  }

  stopMusic() {
    if (this.currentMusic) {
      clearInterval(this.currentMusic);
      this.currentMusic = null;
    }
  }
}


// PARTICLE SYSTEM — Explosions, Fireflies, Meteors
class Particle {
  constructor(x, y, vx, vy, color, life, size, type = 'circle') {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.color = color;
    this.life = life;
    this.maxLife = life;
    this.size = size;
    this.type = type;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += 80 * dt; // gravity
    this.life -= dt;
  }
  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    if (this.type === 'circle') {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'spark') {
      ctx.fillRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size * 2);
    }
    ctx.globalAlpha = 1;
  }
}

class ParticleSystem {
  constructor() {
    this.particles = [];
  }
  emit(x, y, count, color, speed = 200, life = 1, size = 3) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = speed * (0.3 + Math.random() * 0.7);
      this.particles.push(new Particle(
        x, y,
        Math.cos(angle) * spd,
        Math.sin(angle) * spd - 50,
        color, life * (0.5 + Math.random() * 0.5),
        size * (0.5 + Math.random()),
        Math.random() > 0.5 ? 'circle' : 'spark'
      ));
    }
  }
  update(dt) {
    this.particles = this.particles.filter(p => { p.update(dt); return p.life > 0; });
  }
  draw(ctx) {
    this.particles.forEach(p => p.draw(ctx));
  }
}


// BACKGROUND RENDERER — Parallax Jungle Scene
class BackgroundRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    this.fireflies = [];
    this.pterodactyls = [];
    this.time = 0;
    // Init fireflies
    for (let i = 0; i < 40; i++) {
      this.fireflies.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        vx: (Math.random() - 0.5) * 30,
        vy: (Math.random() - 0.5) * 20,
        phase: Math.random() * Math.PI * 2,
        size: 1.5 + Math.random() * 2,
      });
    }
    // Init pterodactyls
    for (let i = 0; i < 3; i++) {
      this.pterodactyls.push({
        x: Math.random() * this.w,
        y: 30 + Math.random() * 120,
        speed: 15 + Math.random() * 25,
        wingPhase: Math.random() * Math.PI * 2,
        size: 15 + Math.random() * 15,
      });
    }
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.w = this.canvas.width = window.innerWidth;
    this.h = this.canvas.height = window.innerHeight;
  }

  update(dt) {
    this.time += dt;
    // Fireflies
    this.fireflies.forEach(f => {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vx += (Math.random() - 0.5) * 60 * dt;
      f.vy += (Math.random() - 0.5) * 40 * dt;
      f.vx = Math.max(-30, Math.min(30, f.vx));
      f.vy = Math.max(-20, Math.min(20, f.vy));
      if (f.x < 0) f.x = this.w;
      if (f.x > this.w) f.x = 0;
      if (f.y < 0) f.y = this.h;
      if (f.y > this.h) f.y = 0;
    });
    // Pterodactyls
    this.pterodactyls.forEach(p => {
      p.x += p.speed * dt;
      p.wingPhase += 4 * dt;
      if (p.x > this.w + 50) { p.x = -50; p.y = 30 + Math.random() * 120; }
    });
  }

  draw(levelTheme = 'normal') {
    const ctx = this.ctx;
    const w = this.w, h = this.h;

    // Sky gradient based on level theme
    let skyGrad;
    if (levelTheme === 'volcanic') {
      skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0, '#1a0500');
      skyGrad.addColorStop(0.4, '#3d0a00');
      skyGrad.addColorStop(1, '#0a0200');
    } else if (levelTheme === 'ice') {
      skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0, '#0a1525');
      skyGrad.addColorStop(0.5, '#0d2040');
      skyGrad.addColorStop(1, '#050a15');
    } else {
      skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0, '#050510');
      skyGrad.addColorStop(0.3, '#0a0a20');
      skyGrad.addColorStop(0.7, '#0d1a0d');
      skyGrad.addColorStop(1, '#0a0a05');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // Stars
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    for (let i = 0; i < 80; i++) {
      const sx = (i * 137.5 + this.time * 0.5) % w;
      const sy = (i * 97.3) % (h * 0.4);
      const ss = 0.5 + (Math.sin(this.time * 2 + i) * 0.5 + 0.5) * 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, ss, 0, Math.PI * 2);
      ctx.fill();
    }

    // Far volcanoes (parallax layer 1)
    this.drawVolcano(ctx, w * 0.15, h, w * 0.22, h * 0.5, '#1a0808', '#2d0505', levelTheme === 'volcanic');
    this.drawVolcano(ctx, w * 0.7, h, w * 0.28, h * 0.55, '#1a0505', '#250808', levelTheme === 'volcanic');
    this.drawVolcano(ctx, w * 0.45, h, w * 0.18, h * 0.42, '#150a0a', '#200505', levelTheme === 'volcanic');

    // Jungle trees (parallax layer 2)
    this.drawJungle(ctx, w, h);

    // Pterodactyl silhouettes
    this.pterodactyls.forEach(p => this.drawPterodactyl(ctx, p));

    // Fireflies
    this.fireflies.forEach(f => {
      const glow = 0.3 + Math.sin(this.time * 3 + f.phase) * 0.35 + 0.35;
      const color = levelTheme === 'ice' ? `rgba(100,200,255,${glow})` :
                    levelTheme === 'volcanic' ? `rgba(255,150,50,${glow})` :
                    `rgba(180,255,100,${glow})`;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size * glow, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Lava glow at bottom for volcanic theme
    if (levelTheme === 'volcanic') {
      const lavaGrad = ctx.createLinearGradient(0, h - 60, 0, h);
      lavaGrad.addColorStop(0, 'rgba(255,50,0,0)');
      lavaGrad.addColorStop(0.5, 'rgba(255,80,0,0.15)');
      lavaGrad.addColorStop(1, 'rgba(255,50,0,0.3)');
      ctx.fillStyle = lavaGrad;
      ctx.fillRect(0, h - 60, w, 60);
    }

    // Ice frost overlay
    if (levelTheme === 'ice') {
      ctx.fillStyle = 'rgba(100,180,255,0.03)';
      ctx.fillRect(0, 0, w, h);
    }
  }

  drawVolcano(ctx, x, baseY, width, height, c1, c2, active) {
    ctx.beginPath();
    ctx.moveTo(x - width, baseY);
    ctx.lineTo(x - width * 0.15, baseY - height);
    ctx.lineTo(x + width * 0.15, baseY - height);
    ctx.lineTo(x + width, baseY);
    ctx.closePath();
    const grad = ctx.createLinearGradient(x, baseY - height, x, baseY);
    grad.addColorStop(0, c2);
    grad.addColorStop(1, c1);
    ctx.fillStyle = grad;
    ctx.fill();

    if (active) {
      const glowIntensity = 0.3 + Math.sin(this.time * 2) * 0.2;
      ctx.fillStyle = `rgba(255,80,0,${glowIntensity})`;
      ctx.beginPath();
      ctx.arc(x, baseY - height, width * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawJungle(ctx, w, h) {
    ctx.fillStyle = '#0a1a08';
    for (let i = 0; i < 12; i++) {
      const tx = (i * w / 11) + Math.sin(this.time * 0.3 + i) * 5;
      const th = 60 + Math.sin(i * 1.7) * 30;
      ctx.fillStyle = '#1a0d05';
      ctx.fillRect(tx - 3, h - th, 6, th);
      ctx.fillStyle = `rgba(${10 + i * 3},${30 + i * 5},${8 + i * 2},0.8)`;
      ctx.beginPath();
      ctx.arc(tx, h - th, 18 + Math.sin(i * 2.3) * 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#0a0d05';
    ctx.fillRect(0, h - 20, w, 20);
  }

  drawPterodactyl(ctx, p) {
    ctx.fillStyle = 'rgba(20,20,30,0.6)';
    ctx.save();
    ctx.translate(p.x, p.y);
    const wingY = Math.sin(p.wingPhase) * p.size * 0.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.size * 0.5, p.size * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(p.size * 0.45, -p.size * 0.05, p.size * 0.18, p.size * 0.1, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-p.size * 0.1, 0);
    ctx.lineTo(-p.size * 0.7, wingY);
    ctx.lineTo(-p.size * 0.3, p.size * 0.05);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-p.size * 0.1, 0);
    ctx.lineTo(-p.size * 0.7, -wingY);
    ctx.lineTo(-p.size * 0.3, -p.size * 0.05);
    ctx.fill();
    ctx.restore();
  }
}



// T-REX CHARACTER — Animated Canvas Dinosaur
class TRex {
  constructor() {
    this.expression = 'happy'; // happy, angry, surprised
    this.eating = false;
    this.eatTimer = 0;
    this.roaring = false;
    this.roarTimer = 0;
    this.jawAngle = 0;
    this.eyeSize = 1;
    this.bobPhase = 0;
    this.particles = new ParticleSystem();
  }

  update(dt) {
    this.bobPhase += dt * 2;
    this.particles.update(dt);
    if (this.eating) {
      this.eatTimer -= dt;
      this.jawAngle = Math.sin(this.eatTimer * 12) * 0.4;
      if (this.eatTimer <= 0) { this.eating = false; this.jawAngle = 0; }
    }
    if (this.roaring) {
      this.roarTimer -= dt;
      this.jawAngle = 0.5 + Math.sin(this.roarTimer * 15) * 0.15;
      if (this.roarTimer <= 0) { this.roaring = false; this.jawAngle = 0; }
    }
  }

  roar() {
    this.roaring = true;
    this.roarTimer = 0.8;
    this.expression = 'angry';
    this.particles.emit(80, 350, 20, '#aa8866', 100, 1, 3);
    setTimeout(() => { if (!this.eating) this.expression = 'happy'; }, 1200);
  }

  eat() {
    this.eating = true;
    this.eatTimer = 0.6;
    this.expression = 'happy';
    this.particles.emit(110, 200, 10, '#ff6600', 80, 0.8, 2);
  }

  /** Draw the T-Rex on given canvas context */
  draw(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    const bob = Math.sin(this.bobPhase) * 3;
    const cx = w / 2;

    ctx.save();
    ctx.translate(0, bob);

    // Legs
    const legPhase = Math.sin(this.bobPhase * 2);
    ctx.fillStyle = '#cc3300';
    ctx.save();
    ctx.translate(cx - 18, h - 100);
    ctx.rotate(legPhase * 0.1);
    ctx.fillRect(-6, 0, 12, 50);
    ctx.fillStyle = '#992200';
    ctx.beginPath(); ctx.ellipse(0, 52, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffddaa';
    for (let c = -1; c <= 1; c++) {
      ctx.beginPath(); ctx.moveTo(c * 5, 55); ctx.lineTo(c * 7, 62); ctx.lineTo(c * 3, 58); ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = '#cc3300';
    ctx.save();
    ctx.translate(cx + 18, h - 100);
    ctx.rotate(-legPhase * 0.1);
    ctx.fillRect(-6, 0, 12, 50);
    ctx.fillStyle = '#992200';
    ctx.beginPath(); ctx.ellipse(0, 52, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffddaa';
    for (let c = -1; c <= 1; c++) {
      ctx.beginPath(); ctx.moveTo(c * 5, 55); ctx.lineTo(c * 7, 62); ctx.lineTo(c * 3, 58); ctx.fill();
    }
    ctx.restore();

    // Tail
    ctx.fillStyle = '#cc3300';
    ctx.beginPath();
    ctx.moveTo(cx - 25, h - 130);
    ctx.quadraticCurveTo(cx - 60, h - 110 + Math.sin(this.bobPhase * 1.5) * 8, cx - 70, h - 80);
    ctx.quadraticCurveTo(cx - 65, h - 80, cx - 55, h - 100);
    ctx.quadraticCurveTo(cx - 40, h - 120, cx - 20, h - 125);
    ctx.fill();

    // Body
    ctx.fillStyle = '#dd3300';
    ctx.beginPath(); ctx.ellipse(cx, h - 140, 30, 42, 0, 0, Math.PI * 2); ctx.fill();

    // Belly
    ctx.fillStyle = '#ffcc88';
    ctx.beginPath(); ctx.ellipse(cx + 5, h - 130, 18, 30, 0.1, 0, Math.PI * 2); ctx.fill();

    // Small arms
    ctx.fillStyle = '#cc3300';
    const armWave = Math.sin(this.bobPhase * 3) * 0.2;
    ctx.save();
    ctx.translate(cx - 20, h - 155); ctx.rotate(-0.5 + armWave);
    ctx.fillRect(0, 0, 5, 18);
    ctx.fillStyle = '#ffddaa'; ctx.beginPath(); ctx.arc(2, 20, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#cc3300';
    ctx.save();
    ctx.translate(cx + 20, h - 155); ctx.rotate(0.5 - armWave);
    ctx.fillRect(-5, 0, 5, 18);
    ctx.fillStyle = '#ffddaa'; ctx.beginPath(); ctx.arc(-2, 20, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Neck
    ctx.fillStyle = '#dd3300';
    ctx.beginPath();
    ctx.moveTo(cx + 10, h - 170);
    ctx.quadraticCurveTo(cx + 25, h - 200, cx + 20, h - 220);
    ctx.quadraticCurveTo(cx + 10, h - 225, cx, h - 215);
    ctx.quadraticCurveTo(cx - 5, h - 195, cx, h - 170);
    ctx.fill();

    // Head
    ctx.save();
    ctx.translate(cx + 15, h - 235);
    ctx.fillStyle = '#dd3300';
    ctx.beginPath(); ctx.ellipse(10, 0, 25, 15, 0.1, 0, Math.PI * 2); ctx.fill();

    // Lower jaw (animated)
    ctx.save();
    ctx.translate(10, 10); ctx.rotate(this.jawAngle);
    ctx.fillStyle = '#cc2800';
    ctx.beginPath(); ctx.ellipse(5, 5, 22, 8, 0.1, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#fff';
    for (let t = 0; t < 5; t++) {
      ctx.beginPath(); ctx.moveTo(-8 + t * 6, 0); ctx.lineTo(-6 + t * 6, -5); ctx.lineTo(-4 + t * 6, 0); ctx.fill();
    }
    if (this.jawAngle > 0.2) {
      ctx.fillStyle = '#ff6688';
      ctx.beginPath(); ctx.ellipse(5, 6, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Upper teeth
    ctx.fillStyle = '#fff';
    for (let t = 0; t < 5; t++) {
      ctx.beginPath(); ctx.moveTo(-6 + t * 7, 10); ctx.lineTo(-4 + t * 7, 16); ctx.lineTo(-2 + t * 7, 10); ctx.fill();
    }

    // Eye
    const eyeX = -2, eyeY = -5;
    const es = this.eyeSize;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(eyeX, eyeY, 6 * es, 5 * es, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#220000';
    const pupilSize = this.expression === 'surprised' ? 2 : 3.5;
    ctx.beginPath(); ctx.ellipse(eyeX + 1, eyeY, pupilSize * es, pupilSize * es, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(eyeX - 1, eyeY - 2, 1.5, 0, Math.PI * 2); ctx.fill();

    // Eyebrow
    ctx.strokeStyle = '#881100'; ctx.lineWidth = 2;
    ctx.beginPath();
    if (this.expression === 'angry') { ctx.moveTo(eyeX - 7, eyeY - 8); ctx.lineTo(eyeX + 5, eyeY - 10); }
    else if (this.expression === 'surprised') { ctx.moveTo(eyeX - 7, eyeY - 12); ctx.lineTo(eyeX + 5, eyeY - 12); }
    else { ctx.moveTo(eyeX - 7, eyeY - 10); ctx.lineTo(eyeX + 5, eyeY - 9); }
    ctx.stroke();

    // Nostrils
    ctx.fillStyle = '#881100';
    ctx.beginPath(); ctx.arc(28, -2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(30, 2, 1.5, 0, Math.PI * 2); ctx.fill();

    // Head crest
    ctx.fillStyle = '#bb2200';
    ctx.beginPath(); ctx.arc(-5, -14, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3, -16, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Spinal ridges
    ctx.fillStyle = '#aa2200';
    for (let i = 0; i < 6; i++) {
      const sx = cx - 5 - i * 4, sy = h - 170 + i * 7;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 4, sy - 8 - Math.sin(this.bobPhase + i) * 2); ctx.lineTo(sx + 2, sy); ctx.fill();
    }

    ctx.restore();
    this.particles.draw(ctx);
  }
}


// GAME BOARD — Core Tetris Logic
class Board {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.grid = this.createGrid();
    this.particles = new ParticleSystem();
  }

  createGrid() {
    return Array.from({length: this.rows}, () => Array(this.cols).fill(null));
  }

  reset() {
    this.grid = this.createGrid();
    this.particles = new ParticleSystem();
  }

  isBlocked(x, y) {
    if (x < 0 || x >= this.cols || y >= this.rows) return true;
    if (y < 0) return false;
    return this.grid[y][x] !== null;
  }

  canPlace(piece, px, py) {
    return piece.every(([bx, by]) => {
      const x = px + bx, y = py + by;
      return !this.isBlocked(x, y);
    });
  }

  lockPiece(piece, px, py, type) {
    piece.forEach(([bx, by]) => {
      const x = px + bx, y = py + by;
      if (y >= 0 && y < this.rows && x >= 0 && x < this.cols) {
        this.grid[y][x] = type;
      }
    });
  }

  clearLines() {
    const cleared = [];
    for (let y = this.rows - 1; y >= 0; y--) {
      if (this.grid[y].every(cell => cell !== null)) {
        cleared.push(y);
      }
    }
    if (cleared.length > 0) {
      cleared.forEach(y => {
        for (let x = 0; x < this.cols; x++) {
          const color = COLORS[this.grid[y][x]] || '#fff';
          this.particles.emit(x * BLOCK + BLOCK / 2, y * BLOCK + BLOCK / 2, 6, color, 200, 1.2, 3);
        }
      });
      this.grid = this.grid.filter((_, i) => !cleared.includes(i));
      while (this.grid.length < this.rows) {
        this.grid.unshift(Array(this.cols).fill(null));
      }
    }
    return cleared;
  }

  addGarbage(count) {
    for (let i = 0; i < count; i++) {
      this.grid.shift();
      const garbageLine = Array(this.cols).fill('Z');
      const gap = Math.floor(Math.random() * this.cols);
      garbageLine[gap] = null;
      this.grid.push(garbageLine);
    }
  }

  eatBlocks(count) {
    let eaten = 0;
    const candidates = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (this.grid[y][x]) candidates.push({x, y});
      }
    }
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const toEat = candidates.slice(0, Math.min(count, candidates.length));
    toEat.forEach(({x, y}) => {
      const color = COLORS[this.grid[y][x]] || '#ff6600';
      this.particles.emit(x * BLOCK + BLOCK/2, y * BLOCK + BLOCK/2, 8, color, 150, 1, 3);
      this.grid[y][x] = null;
      eaten++;
    });
    return eaten;
  }

  deleteColumn(col) {
    for (let y = 0; y < this.rows; y++) {
      if (this.grid[y][col]) {
        const color = COLORS[this.grid[y][col]] || '#fff';
        this.particles.emit(col * BLOCK + BLOCK/2, y * BLOCK + BLOCK/2, 4, color, 100, 0.8, 2);
        this.grid[y][col] = null;
      }
    }
  }

  clearAll() {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (this.grid[y][x]) {
          this.particles.emit(x * BLOCK + BLOCK/2, y * BLOCK + BLOCK/2, 4, '#ffd700', 150, 1.5, 3);
          this.grid[y][x] = null;
        }
      }
    }
  }

  /** Serialize board state for saving */
  toJSON() {
    return { grid: this.grid };
  }

  /** Restore board state from saved data */
  static fromJSON(data) {
    const board = new Board(COLS, ROWS);
    board.grid = data.grid;
    return board;
  }
}


// ============================================================
// TETRIS GAME INSTANCE — One per player
// ============================================================
class TetrisGame {
  constructor(playerIndex) {
    this.playerIndex = playerIndex;
    this.board = new Board(COLS, ROWS);
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.combo = 0;
    this.gameOver = false;
    this.paused = false;

    // Piece state
    this.currentPiece = null;
    this.currentType = null;
    this.currentRotation = 0;
    this.pieceX = 0;
    this.pieceY = 0;
    this.ghostY = 0;
    this.heldPiece = null;
    this.canHold = true;
    this.bag = [];

    // Timing
    this.dropInterval = 1000;
    this.dropTimer = 0;
    this.lockDelay = 500;
    this.lockTimer = 0;
    this.isLocking = false;

    // Power-ups
    this.activePowerUp = null;
    this.powerUpTimer = 0;
    this.isPowerUpPiece = false;

    // Events to send to opponent
    this.pendingGarbage = 0;

    // Meteor cooldown
    this.meteorCooldown = 0;

    // T-Rex milestones
    this.lastMilestone = 0;

    this.nextPieces = [];
    this.fillBag();
    this.spawnPiece();
  }

  fillBag() {
    if (this.bag.length <= 1) {
      const newBag = [...PIECE_TYPES];
      for (let i = newBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newBag[i], newBag[j]] = [newBag[j], newBag[i]];
      }
      this.bag.push(...newBag);
    }
  }

  getNextType() {
    this.fillBag();
    return this.bag.shift();
  }

  spawnPiece() {
    this.isPowerUpPiece = this.level >= 3 && Math.random() < 0.05;
    this.currentType = this.getNextType();
    this.currentRotation = 0;
    this.currentPiece = SHAPES[this.currentType][0];
    this.pieceX = Math.floor((COLS - 4) / 2);
    this.pieceY = -1;
    this.canHold = true;
    this.isLocking = false;
    this.lockTimer = 0;

    while (this.nextPieces.length < 3) {
      this.nextPieces.push(this.getNextType());
    }
    this.updateGhost();

    if (!this.board.canPlace(this.currentPiece, this.pieceX, this.pieceY)) {
      this.gameOver = true;
    }
  }

  updateGhost() {
    this.ghostY = this.pieceY;
    while (this.board.canPlace(this.currentPiece, this.pieceX, this.ghostY + 1)) {
      this.ghostY++;
    }
  }

  move(dx) {
    if (this.gameOver || this.paused) return false;
    if (this.board.canPlace(this.currentPiece, this.pieceX + dx, this.pieceY)) {
      this.pieceX += dx;
      this.updateGhost();
      if (this.isLocking) { this.lockTimer = 0; }
      return true;
    }
    return false;
  }

  rotate(dir = 1) {
    if (this.gameOver || this.paused) return false;
    const rotations = SHAPES[this.currentType];
    const newRot = ((this.currentRotation + dir) % rotations.length + rotations.length) % rotations.length;
    const newPiece = rotations[newRot];
    const kicks = [[0,0],[1,0],[-1,0],[0,-1],[2,0],[-2,0],[1,-1],[-1,-1]];
    for (const [kx, ky] of kicks) {
      if (this.board.canPlace(newPiece, this.pieceX + kx, this.pieceY + ky)) {
        this.pieceX += kx;
        this.pieceY += ky;
        this.currentRotation = newRot;
        this.currentPiece = newPiece;
        this.updateGhost();
        if (this.isLocking) { this.lockTimer = 0; }
        return true;
      }
    }
    return false;
  }

  softDrop() {
    if (this.gameOver || this.paused) return false;
    if (this.board.canPlace(this.currentPiece, this.pieceX, this.pieceY + 1)) {
      this.pieceY++;
      this.score += 1;
      this.isLocking = false;
      return true;
    }
    return false;
  }

  hardDrop() {
    if (this.gameOver || this.paused) return;
    let distance = 0;
    while (this.board.canPlace(this.currentPiece, this.pieceX, this.pieceY + 1)) {
      this.pieceY++;
      distance++;
    }
    this.score += distance * 2;
    this.lockCurrentPiece();
  }

  hold() {
    if (this.gameOver || this.paused || !this.canHold) return;
    this.canHold = false;
    if (this.heldPiece) {
      const tmp = this.heldPiece;
      this.heldPiece = this.currentType;
      this.currentType = tmp;
      this.currentRotation = 0;
      this.currentPiece = SHAPES[this.currentType][0];
      this.pieceX = Math.floor((COLS - 4) / 2);
      this.pieceY = -1;
      this.updateGhost();
    } else {
      this.heldPiece = this.currentType;
      this.spawnPiece();
    }
  }

  lockCurrentPiece() {
    this.board.lockPiece(this.currentPiece, this.pieceX, this.pieceY, this.currentType);

    if (this.isPowerUpPiece) {
      this.activatePowerUp();
    }

    const cleared = this.board.clearLines();
    if (cleared.length > 0) {
      this.combo++;
      const comboBonus = this.combo > 1 ? this.combo * 50 : 0;
      this.score += LINE_SCORES[Math.min(cleared.length, 4)] * this.level + comboBonus;
      this.lines += cleared.length;

      const newLevel = Math.floor(this.lines / 10) + 1;
      if (newLevel > this.level) {
        this.level = newLevel;
        this.updateDropSpeed();
      }

      if (cleared.length >= 2) {
        this.pendingGarbage += cleared.length - 1;
      }

      return { linesCleared: cleared.length, combo: this.combo, comboBonus, levelUp: newLevel > this.level };
    } else {
      this.combo = 0;
    }

    // Spawn next piece
    this.currentType = this.nextPieces.shift();
    this.currentRotation = 0;
    this.currentPiece = SHAPES[this.currentType][0];
    this.pieceX = Math.floor((COLS - 4) / 2);
    this.pieceY = -1;
    this.isPowerUpPiece = this.level >= 3 && Math.random() < 0.05;
    this.canHold = true;
    this.isLocking = false;
    this.lockTimer = 0;
    this.fillBag();
    while (this.nextPieces.length < 3) {
      this.nextPieces.push(this.getNextType());
    }
    this.updateGhost();

    if (!this.board.canPlace(this.currentPiece, this.pieceX, this.pieceY)) {
      this.gameOver = true;
    }

    return { linesCleared: cleared.length };
  }

  activatePowerUp() {
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    this.activePowerUp = type;
    this.powerUpTimer = 10;

    if (type === 'bomb') {
      this.board.eatBlocks(8);
      this.activePowerUp = null;
      this.powerUpTimer = 0;
    } else if (type === 'clear_row') {
      const lastRow = this.board.rows - 1;
      for (let x = 0; x < this.board.cols; x++) {
        if (this.board.grid[lastRow][x]) {
          this.board.particles.emit(x * BLOCK + BLOCK/2, lastRow * BLOCK + BLOCK/2, 4, '#ffd700', 100, 0.8, 2);
          this.board.grid[lastRow][x] = null;
        }
      }
      this.activePowerUp = null;
      this.powerUpTimer = 0;
    }
  }

  updateDropSpeed() {
    const speed = this.activePowerUp === 'slow' ? 1.5 : 1;
    this.dropInterval = Math.max(50, 1000 - (this.level - 1) * 75) * speed;
  }

  update(dt) {
    if (this.gameOver || this.paused) return null;

    if (this.activePowerUp && this.powerUpTimer > 0) {
      this.powerUpTimer -= dt;
      if (this.powerUpTimer <= 0) {
        this.activePowerUp = null;
        this.updateDropSpeed();
      }
    }

    if (this.meteorCooldown > 0) this.meteorCooldown -= dt;

    this.dropTimer += dt * 1000;
    this.updateDropSpeed();

    if (this.dropTimer >= this.dropInterval) {
      this.dropTimer = 0;
      if (!this.board.canPlace(this.currentPiece, this.pieceX, this.pieceY + 1)) {
        if (!this.isLocking) {
          this.isLocking = true;
          this.lockTimer = 0;
        }
      } else {
        this.pieceY++;
        this.isLocking = false;
      }
    }

    if (this.isLocking) {
      this.lockTimer += dt * 1000;
      if (this.lockTimer >= this.lockDelay) {
        return this.lockCurrentPiece();
      }
    }

    this.board.particles.update(dt);

    const milestone = Math.floor(this.score / 5000);
    if (milestone > this.lastMilestone) {
      this.lastMilestone = milestone;
      return { trexEvent: true, milestone };
    }

    if (this.meteorCooldown <= 0 && this.level >= 2 && Math.random() < 0.0003) {
      this.meteorCooldown = 30;
      return { meteorShower: true };
    }

    return null;
  }

  getLevelTheme() {
    if (this.level >= 10) return 'ice';
    if (this.level >= 5) return 'volcanic';
    return 'normal';
  }

  // ============================================================
  // SAVE / RESTORE — Serialize game state to/from plain objects
  // ============================================================

  /** Serialize the entire game state into a JSON-safe object */
  toJSON() {
    return {
      playerIndex: this.playerIndex,
      board: this.board.toJSON(),
      score: this.score,
      level: this.level,
      lines: this.lines,
      combo: this.combo,
      currentType: this.currentType,
      currentRotation: this.currentRotation,
      pieceX: this.pieceX,
      pieceY: this.pieceY,
      heldPiece: this.heldPiece,
      bag: this.bag,
      nextPieces: this.nextPieces,
      lastMilestone: this.lastMilestone,
      activePowerUp: this.activePowerUp,
      powerUpTimer: this.powerUpTimer,
    };
  }

  /** Create a TetrisGame instance from saved data */
  static fromJSON(data) {
    const g = Object.create(TetrisGame.prototype);
    g.playerIndex = data.playerIndex;
    g.board = Board.fromJSON(data.board);
    g.score = data.score;
    g.level = data.level;
    g.lines = data.lines;
    g.combo = data.combo || 0;
    g.gameOver = false;
    g.paused = false;
    g.currentType = data.currentType;
    g.currentRotation = data.currentRotation;
    g.currentPiece = SHAPES[data.currentType][data.currentRotation];
    g.pieceX = data.pieceX;
    g.pieceY = data.pieceY;
    g.ghostY = 0;
    g.heldPiece = data.heldPiece;
    g.canHold = true;
    g.bag = data.bag || [];
    g.nextPieces = data.nextPieces || [];
    g.dropInterval = 1000;
    g.dropTimer = 0;
    g.lockDelay = 500;
    g.lockTimer = 0;
    g.isLocking = false;
    g.activePowerUp = data.activePowerUp || null;
    g.powerUpTimer = data.powerUpTimer || 0;
    g.isPowerUpPiece = false;
    g.pendingGarbage = 0;
    g.meteorCooldown = 0;
    g.lastMilestone = data.lastMilestone || 0;
    g.fillBag();
    while (g.nextPieces.length < 3) g.nextPieces.push(g.getNextType());
    g.updateGhost();
    g.updateDropSpeed();
    return g;
  }
}


// ============================================================
// GAME RENDERER — Canvas Drawing
// ============================================================
class GameRenderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.canvas.width = COLS * BLOCK;
    this.canvas.height = ROWS * BLOCK;
    this.lineClearFlash = 0;
  }

  draw() {
    const ctx = this.ctx;
    const g = this.game;
    const theme = g.getLevelTheme();

    let bgColor = 'rgba(5,5,15,0.95)';
    if (theme === 'volcanic') bgColor = 'rgba(20,5,0,0.95)';
    if (theme === 'ice') bgColor = 'rgba(5,10,20,0.95)';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Grid lines
    ctx.strokeStyle = theme === 'volcanic' ? 'rgba(255,50,0,0.08)' :
                      theme === 'ice' ? 'rgba(100,180,255,0.08)' :
                      'rgba(255,106,0,0.06)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x * BLOCK, 0); ctx.lineTo(x * BLOCK, ROWS * BLOCK); ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * BLOCK); ctx.lineTo(COLS * BLOCK, y * BLOCK); ctx.stroke();
    }

    // Locked blocks
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (g.board.grid[y][x]) {
          this.drawBlock(ctx, x, y, g.board.grid[y][x], 1);
        }
      }
    }

    // Ghost piece
    if (g.currentPiece && !g.gameOver) {
      g.currentPiece.forEach(([bx, by]) => {
        const gx = g.pieceX + bx;
        const gy = g.ghostY + by;
        if (gy >= 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.1)';
          ctx.strokeStyle = COLORS[g.currentType] || '#fff';
          ctx.globalAlpha = 0.3;
          ctx.fillRect(gx * BLOCK + 1, gy * BLOCK + 1, BLOCK - 2, BLOCK - 2);
          ctx.strokeRect(gx * BLOCK + 1, gy * BLOCK + 1, BLOCK - 2, BLOCK - 2);
          ctx.globalAlpha = 1;
        }
      });
    }

    // Current piece
    if (g.currentPiece && !g.gameOver) {
      g.currentPiece.forEach(([bx, by]) => {
        const px = g.pieceX + bx;
        const py = g.pieceY + by;
        if (py >= 0) {
          if (g.isPowerUpPiece) {
            this.drawPowerUpBlock(ctx, px, py);
          } else {
            this.drawBlock(ctx, px, py, g.currentType, 1);
          }
        }
      });
    }

    // Particles
    g.board.particles.draw(ctx);

    // Line clear flash
    if (this.lineClearFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.lineClearFlash * 0.3})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.lineClearFlash -= 0.05;
    }

    // Power-up overlay effects
    if (g.activePowerUp === 'ghost') {
      ctx.fillStyle = 'rgba(100,0,200,0.05)';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    if (g.activePowerUp === 'slow') {
      ctx.fillStyle = 'rgba(0,100,255,0.05)';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    if (theme === 'ice') {
      ctx.fillStyle = 'rgba(150,200,255,0.03)';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /** Draw a single tetromino block with neon glow effect */
  drawBlock(ctx, x, y, type, alpha = 1) {
    const px = x * BLOCK;
    const py = y * BLOCK;
    const color = COLORS[type] || '#888';
    const glow = GLOW[type] || '#aaa';
    const inset = 2;

    ctx.globalAlpha = alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;

    ctx.fillStyle = color;
    ctx.fillRect(px + inset, py + inset, BLOCK - inset * 2, BLOCK - inset * 2);

    ctx.fillStyle = glow;
    ctx.fillRect(px + inset, py + inset, BLOCK - inset * 2, 3);
    ctx.fillRect(px + inset, py + inset, 3, BLOCK - inset * 2);

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(px + BLOCK - inset - 3, py + inset, 3, BLOCK - inset * 2);
    ctx.fillRect(px + inset, py + BLOCK - inset - 3, BLOCK - inset * 2, 3);

    // Fossil pattern
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(px + BLOCK/2, py + BLOCK/2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(px + BLOCK/2, py + BLOCK/2, 7, 0, Math.PI * 2); ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  /** Draw a power-up block (glowing golden egg) */
  drawPowerUpBlock(ctx, x, y) {
    const px = x * BLOCK;
    const py = y * BLOCK;
    const time = Date.now() / 1000;

    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 12;

    const grad = ctx.createRadialGradient(px + BLOCK/2, py + BLOCK/2, 2, px + BLOCK/2, py + BLOCK/2, BLOCK/2);
    grad.addColorStop(0, '#fff8dc');
    grad.addColorStop(0.5, '#ffd700');
    grad.addColorStop(1, '#ff8c00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(px + BLOCK/2, py + BLOCK/2 + 2, BLOCK/2 - 3, BLOCK/2 - 1, 0, 0, Math.PI * 2);
    ctx.fill();

    const sparkle = 0.5 + Math.sin(time * 5) * 0.5;
    ctx.fillStyle = `rgba(255,255,255,${sparkle * 0.7})`;
    ctx.beginPath(); ctx.arc(px + BLOCK/3, py + BLOCK/3, 2, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#8b4513';
    ctx.font = 'bold 12px Orbitron';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', px + BLOCK/2, py + BLOCK/2 + 1);

    ctx.shadowBlur = 0;
  }

  /** Draw a mini piece preview */
  drawPreview(previewCtx, type, w, h) {
    previewCtx.clearRect(0, 0, w, h);
    if (!type) return;
    const piece = SHAPES[type][0];
    const blockSize = 16;
    let minX = 9999, minY = 9999, maxX = -9999, maxY = -9999;
    piece.forEach(([bx, by]) => {
      minX = Math.min(minX, bx); maxX = Math.max(maxX, bx);
      minY = Math.min(minY, by); maxY = Math.max(maxY, by);
    });
    const pw = (maxX - minX + 1) * blockSize;
    const ph = (maxY - minY + 1) * blockSize;
    const ox = (w - pw) / 2 - minX * blockSize;
    const oy = (h - ph) / 2 - minY * blockSize;

    const color = COLORS[type];
    const glow = GLOW[type];
    previewCtx.shadowColor = color;
    previewCtx.shadowBlur = 4;
    piece.forEach(([bx, by]) => {
      const px = ox + bx * blockSize;
      const py = oy + by * blockSize;
      previewCtx.fillStyle = color;
      previewCtx.fillRect(px + 1, py + 1, blockSize - 2, blockSize - 2);
      previewCtx.fillStyle = glow;
      previewCtx.fillRect(px + 1, py + 1, blockSize - 2, 2);
      previewCtx.fillRect(px + 1, py + 1, 2, blockSize - 2);
    });
    previewCtx.shadowBlur = 0;
  }

  flashLineClear() {
    this.lineClearFlash = 1;
  }
}


// ============================================================
// MAIN GAME CONTROLLER — Orchestrates everything
// ============================================================
class GameController {
  constructor() {
    // Audio
    this.audio = new AudioEngine();

    // Background
    this.bg = new BackgroundRenderer(document.getElementById('bgCanvas'));

    // T-Rex
    this.trex = new TRex();

    // Game instances (1 or 2)
    this.games = [];
    this.renderers = [];
    this.mode = 'single'; // 'single' or 'two'

    // UI elements
    this.screens = {
      start: document.getElementById('startScreen'),
      game: document.getElementById('gameScreen'),
      gameOver: document.getElementById('gameOverScreen'),
      hall: document.getElementById('hallScreen'),
      pause: document.getElementById('pauseOverlay'),
    };

    // State
    this.running = false;
    this.lastTime = 0;

    // Konami code tracking
    this.konamiIndex = 0;
    this.konamiUsed = false;

    // Swipe gesture tracking
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchStartTime = 0;

    // High scores
    this.highScores = this.loadHighScores();
    this.pendingSaveScore = null;

    this.setupEventListeners();
    this.updateResumeButton();   // Check for saved game on load
    this.showScreen('start');

    // Start background animation
    this.bgLoop();
  }

  // --- Screen Management ---
  showScreen(name) {
    Object.values(this.screens).forEach(s => s.classList.remove('active'));
    if (name === 'start') {
      this.screens.start.classList.add('active');
      this.updateResumeButton();
    }
    else if (name === 'game') this.screens.game.classList.add('active');
    else if (name === 'gameOver') this.screens.gameOver.classList.add('active');
    else if (name === 'hall') {
      this.screens.hall.classList.add('active');
      this.renderHighScores();
    }
    else if (name === 'pause') this.screens.pause.classList.add('active');
  }

  // --- Background Animation Loop ---
  bgLoop() {
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const theme = this.games.length > 0 ? this.games[0].getLevelTheme() : 'normal';
      this.bg.update(dt);
      this.bg.draw(theme);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ============================================================
  // SAVE & RESUME — Persist game state to localStorage
  // ============================================================

  /** Save current game state to localStorage */
  saveGame() {
    if (this.games.length === 0 || this.mode === 'two') return; // Only save single player
    const g = this.games[0];
    if (g.gameOver) return; // Don't save a finished game

    const saveData = {
      mode: this.mode,
      game: g.toJSON(),
      konamiUsed: this.konamiUsed,
      timestamp: Date.now(),
    };
    try {
      localStorage.setItem(LS_SAVE_GAME, JSON.stringify(saveData));
    } catch (e) {
      console.warn('Failed to save game:', e);
    }
  }

  /** Check if a saved game exists */
  hasSavedGame() {
    try {
      const raw = localStorage.getItem(LS_SAVE_GAME);
      if (!raw) return false;
      const data = JSON.parse(raw);
      return data && data.game && !data.game.gameOver;
    } catch { return false; }
  }

  /** Load and resume a saved game */
  resumeGame() {
    try {
      const raw = localStorage.getItem(LS_SAVE_GAME);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !data.game) return false;

      this.audio.init();
      this.mode = data.mode || 'single';
      this.games = [];
      this.renderers = [];
      this.konamiUsed = data.konamiUsed || false;
      this.konamiIndex = 0;

      // Restore game instance
      const restoredGame = TetrisGame.fromJSON(data.game);

      // Build game screen DOM
      const gs = document.getElementById('gameScreen');
      gs.innerHTML = '';

      // Create panel (but don't create a new TetrisGame — inject the restored one)
      const panel = this._createGamePanelForExisting(restoredGame, 'Survivor');
      gs.appendChild(panel);

      // T-Rex container
      const trexDiv = document.createElement('div');
      trexDiv.id = 'trexContainer';
      const trexCanvas = document.createElement('canvas');
      trexCanvas.id = 'trexCanvas';
      trexCanvas.width = 160;
      trexCanvas.height = 400;
      trexDiv.appendChild(trexCanvas);
      gs.appendChild(trexDiv);

      // In-game MENU button
      this._addMenuButton(gs);

      this.showScreen('game');
      this.running = true;
      this.audio.startMusic(restoredGame.level);
      this.lastTime = performance.now();

      // Clear the saved game since we've resumed
      this.deleteSavedGame();

      this.gameLoop();
      return true;
    } catch (e) {
      console.warn('Failed to resume game:', e);
      this.deleteSavedGame();
      return false;
    }
  }

  /** Delete the saved game from localStorage */
  deleteSavedGame() {
    localStorage.removeItem(LS_SAVE_GAME);
    this.updateResumeButton();
  }

  /** Show / hide the resume button on the start screen */
  updateResumeButton() {
    const btn = document.getElementById('btnResumeGame');
    const info = document.getElementById('savedGameInfo');
    if (!btn) return;

    if (this.hasSavedGame()) {
      btn.style.display = '';
      try {
        const data = JSON.parse(localStorage.getItem(LS_SAVE_GAME));
        const score = data.game.score.toLocaleString();
        const level = data.game.level;
        const date = new Date(data.timestamp).toLocaleString();
        if (info) {
          info.style.display = '';
          info.textContent = `Score: ${score} · Level ${level} · ${date}`;
        }
      } catch {
        if (info) info.style.display = 'none';
      }
    } else {
      btn.style.display = 'none';
      if (info) info.style.display = 'none';
    }
  }

  /** Create a game panel for an existing (restored) TetrisGame instance */
  _createGamePanelForExisting(game, label) {
    this.games.push(game);

    const panel = document.createElement('div');
    panel.className = 'game-panel';
    panel.id = `panel${game.playerIndex}`;

    const side = document.createElement('div');
    side.className = 'side-info';

    const lbl = document.createElement('div');
    lbl.className = `player-label p1`;
    lbl.textContent = label;
    side.appendChild(lbl);

    const scoreBox = document.createElement('div');
    scoreBox.className = 'info-box';
    scoreBox.innerHTML = `<div class="label">SCORE</div><div class="value" id="score${game.playerIndex}">${game.score.toLocaleString()}</div>`;
    side.appendChild(scoreBox);

    const levelBox = document.createElement('div');
    levelBox.className = 'info-box';
    levelBox.innerHTML = `<div class="label">LEVEL</div><div class="value" id="level${game.playerIndex}">${game.level}</div>`;
    side.appendChild(levelBox);

    const linesBox = document.createElement('div');
    linesBox.className = 'info-box';
    linesBox.innerHTML = `<div class="label">LINES</div><div class="value" id="lines${game.playerIndex}">${game.lines}</div>`;
    side.appendChild(linesBox);

    const nextBox = document.createElement('div');
    nextBox.className = 'info-box';
    nextBox.innerHTML = `<div class="label">NEXT</div>`;
    const nextCanvas = document.createElement('canvas');
    nextCanvas.className = 'next-piece-canvas';
    nextCanvas.width = 100; nextCanvas.height = 80;
    nextCanvas.id = `next${game.playerIndex}`;
    nextBox.appendChild(nextCanvas);
    side.appendChild(nextBox);

    const holdBox = document.createElement('div');
    holdBox.className = 'info-box';
    holdBox.innerHTML = `<div class="label">HOLD</div>`;
    const holdCanvas = document.createElement('canvas');
    holdCanvas.className = 'held-piece-canvas';
    holdCanvas.width = 100; holdCanvas.height = 80;
    holdCanvas.id = `hold${game.playerIndex}`;
    holdBox.appendChild(holdCanvas);
    side.appendChild(holdBox);

    panel.appendChild(side);

    const boardWrapper = document.createElement('div');
    boardWrapper.className = 'board-wrapper';
    const boardCanvas = document.createElement('canvas');
    boardCanvas.id = `board${game.playerIndex}`;
    boardCanvas.width = COLS * BLOCK;
    boardCanvas.height = ROWS * BLOCK;
    boardWrapper.appendChild(boardCanvas);
    panel.appendChild(boardWrapper);

    const renderer = new GameRenderer(boardCanvas, game);
    this.renderers.push(renderer);

    return panel;
  }

  // --- Start Game ---
  startGame(mode) {
    this.audio.init();
    this.mode = mode;
    this.games = [];
    this.renderers = [];
    this.konamiUsed = false;
    this.konamiIndex = 0;

    // Clear any saved game when starting fresh
    this.deleteSavedGame();

    const gs = document.getElementById('gameScreen');
    gs.innerHTML = '';

    if (mode === 'single') {
      const panel = this.createGamePanel(0, 'Survivor');
      gs.appendChild(panel);

      const trexDiv = document.createElement('div');
      trexDiv.id = 'trexContainer';
      const trexCanvas = document.createElement('canvas');
      trexCanvas.id = 'trexCanvas';
      trexCanvas.width = 160;
      trexCanvas.height = 400;
      trexDiv.appendChild(trexCanvas);
      gs.appendChild(trexDiv);
    } else {
      const p1 = this.createGamePanel(0, 'Player 1 (WASD)');
      const vs = document.createElement('div');
      vs.className = 'vs-divider';
      vs.textContent = 'VS';
      const p2 = this.createGamePanel(1, 'Player 2 (Arrows)');
      gs.appendChild(p1);
      gs.appendChild(vs);
      gs.appendChild(p2);
    }

    // In-game MENU button (always visible)
    this._addMenuButton(gs);

    this.showScreen('game');
    this.running = true;
    this.audio.startMusic(1);
    this.lastTime = performance.now();
    this.gameLoop();
  }


  createGamePanel(index, label) {
    const game = new TetrisGame(index);
    this.games.push(game);

    const panel = document.createElement('div');
    panel.className = 'game-panel';
    panel.id = `panel${index}`;

    const side = document.createElement('div');
    side.className = 'side-info';

    const lbl = document.createElement('div');
    lbl.className = `player-label ${index === 0 ? 'p1' : 'p2'}`;
    lbl.textContent = label;
    side.appendChild(lbl);

    const scoreBox = document.createElement('div');
    scoreBox.className = 'info-box';
    scoreBox.innerHTML = `<div class="label">SCORE</div><div class="value" id="score${index}">0</div>`;
    side.appendChild(scoreBox);

    const levelBox = document.createElement('div');
    levelBox.className = 'info-box';
    levelBox.innerHTML = `<div class="label">LEVEL</div><div class="value" id="level${index}">1</div>`;
    side.appendChild(levelBox);

    const linesBox = document.createElement('div');
    linesBox.className = 'info-box';
    linesBox.innerHTML = `<div class="label">LINES</div><div class="value" id="lines${index}">0</div>`;
    side.appendChild(linesBox);

    const nextBox = document.createElement('div');
    nextBox.className = 'info-box';
    nextBox.innerHTML = `<div class="label">NEXT</div>`;
    const nextCanvas = document.createElement('canvas');
    nextCanvas.className = 'next-piece-canvas';
    nextCanvas.width = 100; nextCanvas.height = 80;
    nextCanvas.id = `next${index}`;
    nextBox.appendChild(nextCanvas);
    side.appendChild(nextBox);

    const holdBox = document.createElement('div');
    holdBox.className = 'info-box';
    holdBox.innerHTML = `<div class="label">HOLD</div>`;
    const holdCanvas = document.createElement('canvas');
    holdCanvas.className = 'held-piece-canvas';
    holdCanvas.width = 100; holdCanvas.height = 80;
    holdCanvas.id = `hold${index}`;
    holdBox.appendChild(holdCanvas);
    side.appendChild(holdBox);

    panel.appendChild(side);

    const boardWrapper = document.createElement('div');
    boardWrapper.className = 'board-wrapper';
    const boardCanvas = document.createElement('canvas');
    boardCanvas.id = `board${index}`;
    boardCanvas.width = COLS * BLOCK;
    boardCanvas.height = ROWS * BLOCK;
    boardWrapper.appendChild(boardCanvas);
    panel.appendChild(boardWrapper);

    const renderer = new GameRenderer(boardCanvas, game);
    this.renderers.push(renderer);

    return panel;
  }

  // --- Main Game Loop ---
  gameLoop() {
    if (!this.running) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    let anyAlive = false;

    this.games.forEach((game, i) => {
      if (game.gameOver) return;
      anyAlive = true;

      const event = game.update(dt);

      if (event) {
        if (event.linesCleared > 0) {
          this.audio.sfxLineClear(event.linesCleared);
          this.renderers[i].flashLineClear();

          if (event.combo > 1) {
            this.showComboPopup(event.combo, i);
          }

          if (this.mode === 'two' && game.pendingGarbage > 0) {
            const opponent = this.games[1 - i];
            if (opponent && !opponent.gameOver) {
              opponent.board.addGarbage(game.pendingGarbage);
              this.audio.sfxStampede();
            }
            game.pendingGarbage = 0;
          }
        }

        if (event.trexEvent && this.mode === 'single') {
          this.triggerTrexEvent(game, event.milestone);
        }

        if (event.meteorShower) {
          this.triggerMeteorShower(game, i);
        }

        if (event.levelUp) {
          this.audio.sfxLevelUp();
          this.audio.startMusic(game.level);
        }
      }

      // Update UI
      const scoreEl = document.getElementById(`score${i}`);
      const levelEl = document.getElementById(`level${i}`);
      const linesEl = document.getElementById(`lines${i}`);
      if (scoreEl) scoreEl.textContent = game.score.toLocaleString();
      if (levelEl) levelEl.textContent = game.level;
      if (linesEl) linesEl.textContent = game.lines;

      // Draw
      this.renderers[i].draw();

      const nextCanvas = document.getElementById(`next${i}`);
      if (nextCanvas && game.nextPieces.length > 0) {
        const nctx = nextCanvas.getContext('2d');
        this.renderers[i].drawPreview(nctx, game.nextPieces[0], 100, 80);
      }

      const holdCanvas = document.getElementById(`hold${i}`);
      if (holdCanvas) {
        const hctx = holdCanvas.getContext('2d');
        this.renderers[i].drawPreview(hctx, game.heldPiece, 100, 80);
      }
    });

    // T-Rex animation (single player only)
    if (this.mode === 'single') {
      this.trex.update(dt);
      const trexCanvas = document.getElementById('trexCanvas');
      if (trexCanvas) {
        const tctx = trexCanvas.getContext('2d');
        this.trex.draw(tctx, trexCanvas.width, trexCanvas.height);
      }
    }

    if (!anyAlive) {
      this.endGame();
      return;
    }

    requestAnimationFrame(() => this.gameLoop());
  }

  // --- T-Rex Event ---
  triggerTrexEvent(game, milestone) {
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 500);
    this.audio.sfxTrexRoar();
    this.trex.roar();

    setTimeout(() => {
      const blocksToEat = Math.min(3, 1 + Math.floor(milestone / 2));
      game.board.eatBlocks(blocksToEat * 4);
      this.audio.sfxTrexEat();
      this.trex.eat();

      if (game.score > 20000) this.trex.expression = 'angry';
      else if (game.score > 10000) this.trex.expression = 'surprised';
      else this.trex.expression = 'happy';
    }, 800);
  }

  // --- Meteor Shower ---
  triggerMeteorShower(game, playerIndex) {
    this.audio.sfxMeteor();
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 300);

    const colsToDelete = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < colsToDelete; i++) {
      const col = Math.floor(Math.random() * COLS);
      game.board.deleteColumn(col);
    }

    this.showComboPopup(0, playerIndex, '☄️ METEOR!');
  }

  // --- Combo Popup ---
  showComboPopup(combo, playerIndex, customText = null) {
    const popup = document.createElement('div');
    popup.className = 'combo-popup';
    popup.textContent = customText || `ROAR ×${combo}`;

    const panel = document.getElementById(`panel${playerIndex}`);
    if (panel) {
      const rect = panel.getBoundingClientRect();
      popup.style.left = (rect.left + rect.width / 2 - 60) + 'px';
      popup.style.top = (rect.top + rect.height / 2) + 'px';
    } else {
      popup.style.left = '40%';
      popup.style.top = '40%';
    }

    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 1200);
  }

  // --- Konami Code: Golden T-Rex ---
  triggerKonami() {
    if (this.konamiUsed || this.games.length === 0) return;
    this.konamiUsed = true;

    this.audio.sfxKonami();
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 800);

    this.games[0].board.clearAll();
    this.games[0].score += 10000;

    const canvas = document.getElementById('board0');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(255,215,0,0.4)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    this.showComboPopup(0, 0, '🌟 GOLDEN T-REX! 🌟');

    if (this.mode === 'single') {
      this.trex.expression = 'surprised';
      this.trex.roar();
    }
  }

  // --- End Game ---
  endGame() {
    this.running = false;
    this.audio.stopMusic();
    this.audio.sfxGameOver();

    // Delete saved game on game over (no point resuming a finished game)
    this.deleteSavedGame();

    const score1 = this.games[0].score;
    document.getElementById('goScore').textContent = score1.toLocaleString();
    document.getElementById('goLevel').textContent = `Level ${this.games[0].level} • ${this.games[0].lines} lines`;

    if (this.mode === 'two') {
      document.getElementById('goP2').style.display = 'block';
      document.getElementById('goScoreP2').textContent = this.games[1].score.toLocaleString();
      const winnerEl = document.getElementById('goWinner');
      winnerEl.style.display = 'block';
      if (!this.games[0].gameOver) winnerEl.textContent = '🏆 Player 1 Wins! 🏆';
      else if (!this.games[1].gameOver) winnerEl.textContent = '🏆 Player 2 Wins! 🏆';
      else winnerEl.textContent = this.games[0].score >= this.games[1].score ? '🏆 Player 1 Wins! 🏆' : '🏆 Player 2 Wins! 🏆';
    } else {
      document.getElementById('goP2').style.display = 'none';
      document.getElementById('goWinner').style.display = 'none';
    }

    this.pendingSaveScore = {
      score: this.mode === 'two' ? Math.max(this.games[0].score, this.games[1].score) : this.games[0].score,
      level: this.games[0].level,
    };

    this.showScreen('gameOver');
  }

  // --- Pause ---
  togglePause() {
    if (this.games.length === 0 || !this.running) return;
    const game = this.games[0];
    game.paused = !game.paused;
    if (this.games[1]) this.games[1].paused = game.paused;

    if (game.paused) {
      this.audio.stopMusic();
      this.screens.pause.classList.add('active');
      document.getElementById('dinoFactText').textContent =
        DINO_FACTS[Math.floor(Math.random() * DINO_FACTS.length)];
      this.drawPauseDino();
    } else {
      this.screens.pause.classList.remove('active');
      this.audio.startMusic(game.level);
      this.lastTime = performance.now();
    }
  }

  drawPauseDino() {
    const canvas = document.getElementById('pauseDinoCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 120, 100);

    ctx.fillStyle = '#66ff88';
    ctx.fillRect(30, 40, 40, 30);
    ctx.fillRect(60, 20, 30, 25);
    ctx.fillStyle = '#fff';
    ctx.fillRect(78, 26, 6, 6);
    ctx.fillStyle = '#000';
    ctx.fillRect(80, 28, 3, 3);
    ctx.fillStyle = '#44cc66';
    ctx.fillRect(35, 70, 8, 15);
    ctx.fillRect(55, 70, 8, 15);
    ctx.fillStyle = '#66ff88';
    ctx.fillRect(18, 45, 15, 8);
    ctx.fillRect(10, 40, 10, 8);
    ctx.fillStyle = '#226633';
    ctx.fillRect(72, 38, 12, 2);
    ctx.fillStyle = '#44dd66';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(40 + i * 10, 40);
      ctx.lineTo(45 + i * 10, 30);
      ctx.lineTo(50 + i * 10, 40);
      ctx.fill();
    }
  }

  // --- Exit Mid-Game (Save & Quit) ---
  saveAndQuit() {
    // Save current state before quitting
    this.saveGame();
    // Clean up
    this.games.forEach(g => g.paused = false);
    this.screens.pause.classList.remove('active');
    this.running = false;
    this.audio.stopMusic();
    this.games = [];
    this.renderers = [];
    this.showScreen('start');
  }

  // --- Go To Menu (saves game, then exits) ---
  goToMenu() {
    this.saveGame();
    this.games.forEach(g => g.paused = false);
    this.screens.pause.classList.remove('active');
    this.running = false;
    this.audio.stopMusic();
    this.games = [];
    this.renderers = [];
    this.showScreen('start');
  }

  /** Inject a floating MENU button onto the game screen */
  _addMenuButton(container) {
    const btn = document.createElement('button');
    btn.id = 'btnMenuIngame';
    btn.className = 'btn btn-secondary btn-ingame-menu';
    btn.textContent = '🏠 MENU';
    btn.addEventListener('click', () => this.goToMenu());
    container.appendChild(btn);
  }

  // --- High Scores ---
  loadHighScores() {
    try {
      return JSON.parse(localStorage.getItem(LS_SCORES) || '[]');
    } catch { return []; }
  }

  saveHighScores() {
    localStorage.setItem(LS_SCORES, JSON.stringify(this.highScores));
  }

  addHighScore(name, score, level) {
    const title = DINO_TITLES[Math.floor(Math.random() * DINO_TITLES.length)];
    const entry = {
      name: `${title} ${name}`,
      score,
      level,
      date: new Date().toLocaleDateString(),
      avatar: PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)],
    };
    this.highScores.push(entry);
    this.highScores.sort((a, b) => b.score - a.score);
    this.highScores = this.highScores.slice(0, 10);
    this.saveHighScores();
  }

  renderHighScores() {
    const tbody = document.getElementById('scoreTableBody');
    tbody.innerHTML = '';
    if (this.highScores.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#666;">No fossils yet... go play!</td></tr>';
      return;
    }
    this.highScores.forEach((s, i) => {
      const tr = document.createElement('tr');
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
      const avatarColor = COLORS[s.avatar] || '#888';
      tr.innerHTML = `
        <td>${medal}</td>
        <td><span class="dino-avatar" style="background:${avatarColor};border-radius:3px;"></span>${s.name}</td>
        <td>${s.score.toLocaleString()}</td>
        <td>${s.level}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // --- Share Score ---
  shareScore() {
    const top = this.highScores[0];
    if (!top) return;
    const text = `🦖 DINO-TRIX: Jurassic Chaos Edition 🦕\n` +
      `I scored ${top.score.toLocaleString()} points as "${top.name}"!\n` +
      `Level ${top.level} — Can you beat that?! 🔥\n` +
      `#DinoTrix #TetrisEvolved`;
    navigator.clipboard.writeText(text).then(() => {
      alert('Score copied to clipboard! Share it with friends! 🦖');
    }).catch(() => {
      prompt('Copy this text to share:', text);
    });
  }

  // --- Event Listeners ---
  setupEventListeners() {
    // --- Menu Buttons ---
    document.getElementById('btnSinglePlayer').addEventListener('click', () => this.startGame('single'));
    document.getElementById('btnTwoPlayer').addEventListener('click', () => this.startGame('two'));
    document.getElementById('btnResumeGame').addEventListener('click', () => this.resumeGame());
    document.getElementById('btnHighScores').addEventListener('click', () => {
      this.pendingSaveScore = null;
      document.getElementById('nameInputArea').style.display = 'none';
      this.showScreen('hall');
    });
    document.getElementById('btnSettings').addEventListener('click', () => {
      const sp = document.getElementById('settingsPanel');
      sp.style.display = sp.style.display === 'none' ? 'flex' : 'none';
    });
    document.getElementById('btnSettingsBack').addEventListener('click', () => {
      document.getElementById('settingsPanel').style.display = 'none';
    });

    // Volume sliders
    document.getElementById('musicVolume').addEventListener('input', (e) => {
      this.audio.setMusicVolume(e.target.value / 100);
    });
    document.getElementById('sfxVolume').addEventListener('input', (e) => {
      this.audio.setSfxVolume(e.target.value / 100);
    });

    // Pause buttons
    document.getElementById('btnResume').addEventListener('click', () => this.togglePause());
    document.getElementById('btnSaveQuit').addEventListener('click', () => this.saveAndQuit());
    document.getElementById('btnQuit').addEventListener('click', () => {
      // Quit without saving — discard the game
      this.deleteSavedGame();
      this.games.forEach(g => g.paused = false);
      this.screens.pause.classList.remove('active');
      this.running = false;
      this.audio.stopMusic();
      this.games = [];
      this.renderers = [];
      this.showScreen('start');
    });

    // Game over buttons
    document.getElementById('btnSaveScore').addEventListener('click', () => {
      if (this.pendingSaveScore) {
        document.getElementById('nameInputArea').style.display = 'flex';
        this.showScreen('hall');
        document.getElementById('playerNameInput').focus();
      }
    });
    document.getElementById('btnPlayAgain').addEventListener('click', () => this.startGame(this.mode));
    document.getElementById('btnGoMenu').addEventListener('click', () => {
      this.games = [];
      this.showScreen('start');
    });

    // Hall buttons
    document.getElementById('btnConfirmName').addEventListener('click', () => {
      const name = document.getElementById('playerNameInput').value.trim() || 'Anonymous';
      if (this.pendingSaveScore) {
        this.addHighScore(name, this.pendingSaveScore.score, this.pendingSaveScore.level);
        this.pendingSaveScore = null;
      }
      document.getElementById('nameInputArea').style.display = 'none';
      document.getElementById('playerNameInput').value = '';
      this.renderHighScores();
    });
    document.getElementById('btnShareScore').addEventListener('click', () => this.shareScore());
    document.getElementById('btnHallBack').addEventListener('click', () => this.showScreen('start'));

    // --- Keyboard Input ---
    document.addEventListener('keydown', (e) => {
      // Konami code check
      if (e.key === KONAMI[this.konamiIndex]) {
        this.konamiIndex++;
        if (this.konamiIndex >= KONAMI.length) {
          this.triggerKonami();
          this.konamiIndex = 0;
        }
      } else {
        this.konamiIndex = 0;
        if (e.key === KONAMI[0]) this.konamiIndex = 1;
      }

      if (!this.running) return;

      // Pause
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        this.togglePause();
        return;
      }

      if (this.games[0]?.paused) return;

      // Player 1 controls
      const g1 = this.games[0];
      if (g1 && !g1.gameOver) {
        if (this.mode === 'single') {
          switch (e.key) {
            case 'ArrowLeft': case 'a': case 'A': g1.move(-1); this.audio.sfxMove(); break;
            case 'ArrowRight': case 'd': case 'D': g1.move(1); this.audio.sfxMove(); break;
            case 'ArrowDown': case 's': case 'S': g1.softDrop(); break;
            case 'ArrowUp': case 'w': case 'W': g1.rotate(1); this.audio.sfxMove(); break;
            case ' ': e.preventDefault(); g1.hardDrop(); this.audio.sfxDrop(); break;
            case 'c': case 'C': case 'Shift': g1.hold(); this.audio.sfxMove(); break;
            case 'z': case 'Z': g1.rotate(-1); this.audio.sfxMove(); break;
          }
        } else {
          switch (e.key) {
            case 'a': case 'A': g1.move(-1); this.audio.sfxMove(); break;
            case 'd': case 'D': g1.move(1); this.audio.sfxMove(); break;
            case 's': case 'S': g1.softDrop(); break;
            case 'w': case 'W': g1.rotate(1); this.audio.sfxMove(); break;
            case ' ': e.preventDefault(); g1.hardDrop(); this.audio.sfxDrop(); break;
            case 'c': case 'C': g1.hold(); this.audio.sfxMove(); break;
          }
        }
      }

      // Player 2 controls
      const g2 = this.games[1];
      if (g2 && !g2.gameOver && this.mode === 'two') {
        switch (e.key) {
          case 'ArrowLeft': g2.move(-1); this.audio.sfxMove(); break;
          case 'ArrowRight': g2.move(1); this.audio.sfxMove(); break;
          case 'ArrowDown': g2.softDrop(); break;
          case 'ArrowUp': g2.rotate(1); this.audio.sfxMove(); break;
          case 'Enter': g2.hardDrop(); this.audio.sfxDrop(); break;
          case '/': g2.hold(); this.audio.sfxMove(); break;
        }
      }

      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) {
        e.preventDefault();
      }
    });

    // --- Mobile Touch Controls ---
    document.getElementById('touchLeft').addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.games[0] && !this.games[0].gameOver) { this.games[0].move(-1); this.audio.sfxMove(); }
    });
    document.getElementById('touchRight').addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.games[0] && !this.games[0].gameOver) { this.games[0].move(1); this.audio.sfxMove(); }
    });
    document.getElementById('touchDown').addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.games[0] && !this.games[0].gameOver) this.games[0].softDrop();
    });
    document.getElementById('touchRotate').addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.games[0] && !this.games[0].gameOver) { this.games[0].rotate(1); this.audio.sfxMove(); }
    });
    document.getElementById('touchDrop').addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.games[0] && !this.games[0].gameOver) { this.games[0].hardDrop(); this.audio.sfxDrop(); }
    });
    document.getElementById('touchHold').addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.games[0] && !this.games[0].gameOver) { this.games[0].hold(); this.audio.sfxMove(); }
    });

    // --- Swipe Gestures ---
    document.addEventListener('touchstart', (e) => {
      if (e.target.classList.contains('touch-btn') || e.target.classList.contains('btn')) return;
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
      this.touchStartTime = Date.now();
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      if (!this.running || !this.games[0] || this.games[0].gameOver) return;
      const dx = e.changedTouches[0].clientX - this.touchStartX;
      const dy = e.changedTouches[0].clientY - this.touchStartY;
      const dt = Date.now() - this.touchStartTime;
      const g = this.games[0];

      if (dt > 500) return;

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx > 30 && absDx > absDy) {
        g.move(dx > 0 ? 1 : -1);
        this.audio.sfxMove();
      } else if (dy > 50 && absDy > absDx) {
        g.hardDrop();
        this.audio.sfxDrop();
      } else if (dy < -30 && absDy > absDx) {
        g.rotate(1);
        this.audio.sfxMove();
      }
    }, { passive: true });

    // Init audio on first interaction
    document.addEventListener('click', () => this.audio.init(), { once: true });
    document.addEventListener('touchstart', () => this.audio.init(), { once: true });

    // Auto-save when user closes/navigates away from the page
    window.addEventListener('beforeunload', () => {
      if (this.running && this.games.length > 0 && !this.games[0].gameOver) {
        this.saveGame();
      }
    });
  }
}


// ============================================================
// LAUNCH THE GAME!
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  window.game = new GameController();
});
