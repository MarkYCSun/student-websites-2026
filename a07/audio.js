// WebAudio music + SFX (original tones only; no copyrighted tracks)
(() => {
  const Audio = {
    ctx: null,
    master: null,
    musicGain: null,
    sfxGain: null,
    enabled: false,
    level: 1,
    _music: null
  };

  function ensureCtx() {
    if (Audio.ctx) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    const musicGain = ctx.createGain();
    const sfxGain = ctx.createGain();
    master.gain.value = 0.9;
    musicGain.gain.value = 0.35;
    sfxGain.gain.value = 0.55;
    musicGain.connect(master);
    sfxGain.connect(master);
    master.connect(ctx.destination);
    Audio.ctx = ctx;
    Audio.master = master;
    Audio.musicGain = musicGain;
    Audio.sfxGain = sfxGain;
  }

  function now() {
    return Audio.ctx.currentTime;
  }

  function playTone({ type = "sine", freq = 440, dur = 0.08, gain = 0.12, detune = 0 }) {
    if (!Audio.enabled) return;
    ensureCtx();
    const t0 = now();
    const o = Audio.ctx.createOscillator();
    const g = Audio.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(Audio.sfxGain);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noiseBurst(dur = 0.10, gain = 0.10) {
    if (!Audio.enabled) return;
    ensureCtx();
    const t0 = now();
    const buf = Audio.ctx.createBuffer(1, Audio.ctx.sampleRate * dur, Audio.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = Audio.ctx.createBufferSource();
    const g = Audio.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.buffer = buf;
    src.connect(g);
    g.connect(Audio.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  function setLevel(level) {
    Audio.level = Math.max(1, level | 0);
    if (Audio.enabled) startMusic();
  }

  function stopMusic() {
    if (Audio._music) {
      try {
        Audio._music.stop();
      } catch {}
      Audio._music = null;
    }
  }

  function startMusic() {
    if (!Audio.enabled) return;
    ensureCtx();
    stopMusic();

    const t0 = now();
    const base = 92 + Math.min(40, (Audio.level - 1) * 6);

    // Simple step-sequencer using scheduled oscillator pitch changes.
    const o = Audio.ctx.createOscillator();
    const g = Audio.ctx.createGain();
    o.type = Audio.level >= 6 ? "sawtooth" : Audio.level >= 3 ? "triangle" : "sine";
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(Audio.musicGain);

    const pattern = [
      0, 7, 12, 7,
      0, 5, 12, 10,
      0, 7, 12, 14,
      0, 5, 12, 10
    ];

    const scale = [0, 2, 3, 5, 7, 10, 12]; // minor-ish
    const stepDur = Math.max(0.08, 0.16 - Audio.level * 0.01);
    const loopLen = pattern.length * stepDur;

    const pitchAt = (deg) => {
      const oct = Math.floor(deg / scale.length);
      const idx = ((deg % scale.length) + scale.length) % scale.length;
      const semis = scale[idx] + 12 * oct;
      return base * Math.pow(2, semis / 12);
    };

    // Schedule 3 loops ahead, re-schedule with setTimeout.
    const schedule = () => {
      const start = now();
      for (let rep = 0; rep < 3; rep++) {
        const repT = start + rep * loopLen;
        for (let i = 0; i < pattern.length; i++) {
          const tt = repT + i * stepDur;
          const f = pitchAt(pattern[i]);
          o.frequency.setValueAtTime(f, tt);
          g.gain.setValueAtTime(0.0001, tt);
          g.gain.exponentialRampToValueAtTime(0.16, tt + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, tt + stepDur * 0.95);
        }
      }
    };

    o.start(t0);
    schedule();

    const timer = setInterval(() => {
      if (!Audio._music || Audio._music !== o) return clearInterval(timer);
      schedule();
    }, Math.max(350, loopLen * 1000));

    Audio._music = o;
  }

  function enable() {
    ensureCtx();
    Audio.enabled = true;
    if (Audio.ctx.state === "suspended") Audio.ctx.resume();
    startMusic();
  }

  function disable() {
    Audio.enabled = false;
    stopMusic();
  }

  // Public API
  window.TetrisAudio = {
    get enabled() {
      return Audio.enabled;
    },
    enable,
    disable,
    setLevel,
    sfx: {
      move() {
        playTone({ type: "sine", freq: 520, dur: 0.04, gain: 0.06 });
      },
      rotate() {
        playTone({ type: "triangle", freq: 720, dur: 0.06, gain: 0.08, detune: -10 });
      },
      drop() {
        playTone({ type: "square", freq: 220, dur: 0.07, gain: 0.10 });
      },
      lock() {
        playTone({ type: "sine", freq: 180, dur: 0.05, gain: 0.10 });
      },
      lineClear(lines) {
        const base = 520;
        for (let i = 0; i < Math.min(4, lines); i++) {
          playTone({ type: "triangle", freq: base + i * 180, dur: 0.08, gain: 0.10 });
        }
        noiseBurst(0.08 + lines * 0.03, 0.07 + lines * 0.02);
      },
      levelUp() {
        playTone({ type: "sawtooth", freq: 440, dur: 0.09, gain: 0.13 });
        playTone({ type: "sawtooth", freq: 660, dur: 0.10, gain: 0.13 });
        playTone({ type: "sawtooth", freq: 880, dur: 0.11, gain: 0.13 });
      },
      dino() {
        playTone({ type: "square", freq: 120, dur: 0.18, gain: 0.14 });
        noiseBurst(0.16, 0.16);
      },
      gameOver() {
        playTone({ type: "sine", freq: 220, dur: 0.12, gain: 0.12 });
        playTone({ type: "sine", freq: 165, dur: 0.14, gain: 0.12 });
        playTone({ type: "sine", freq: 110, dur: 0.18, gain: 0.12 });
      }
    }
  };
})();

