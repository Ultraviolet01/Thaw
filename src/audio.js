// Recorded sounds come from human-made CC0 library recordings (see audio/CREDITS.md) and play through
// plain audio elements, which also work when index.html is opened straight from disk.
// The music layers are still synthesized: they start empty and each thaw unlocks one more.

const PIANO = [440, 523.25, 659.25, 587.33, 523.25, 659.25, 783.99, 659.25];
const BELLS = [1318.51, 1567.98, 1174.66, 1046.5];
const MASTER_LEVEL = 0.9;
// The jam's theme by Jason Grace, played exactly as supplied. The rules allow it only unmodified.
const THEME_SRC = 'audio/thatgamejam02_theme.wav';
// Wind through a window: the ambient wind everywhere for now. The howling storm is kept for the hazards.
const WIND_SRC = 'audio/sfx/wind-window.mp3';
const STORM_SRC = 'audio/sfx/wind-storm.mp3';
// Short cracks cut from one long recording of cracking ice.
const CRACK_SRC = [1, 2, 3, 4, 5, 6].map((i) => `audio/sfx/ice-crack-${i}.mp3`);
// Boots in snow: two crunches cut from one recorded step.
const STEP_SRC = ['audio/sfx/snow-step-1.mp3', 'audio/sfx/snow-step-2.mp3'];
// A recorded heartbeat: four single beats (lub and dub) cut from one slow recording.
const HEART_SRC = [1, 2, 3, 4].map((i) => `audio/sfx/heartbeat-${i}.mp3`);
// Her breath on the coal when she pulses: three gentle blows.
const PULSE_SRC = [1, 2, 3].map((i) => `audio/sfx/pulse-${i}.mp3`);
// Meltwater dripping as a thawed thing lets go of its ice.
const MELT_SRC = [1, 2, 3].map((i) => `audio/sfx/melt-${i}.mp3`);
// Frost closing over what she did not choose: icy branches cracking on a winter night.
const REFREEZE_SRC = ['audio/sfx/refreeze-1.mp3', 'audio/sfx/refreeze-2.mp3'];
// A candle blown out, for the moment her coal goes dark.
const LIGHTS_OUT_SRC = ['audio/sfx/lights-out.mp3'];
// A short crackle of fire for a lucky ember.
const EMBER_SRC = ['audio/sfx/ember.mp3'];
// A singing bowl struck with a soft mallet: a companion joining, the fire reached.
const CHIME_SRC = ['audio/sfx/chime.mp3'];
// A rubbed wine glass: the hum of frozen things, pitched per kind of thing.
const HUM_SRC = 'audio/sfx/glass-hum.mp3';
const HUM_BASE = 1318.51;
// The fire at the end of each stage.
const FIRE_SRC = 'audio/sfx/fire.mp3';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// A recording that loops forever. Two copies crossfade over the seam so the loop has no gap or click.
class FileLoop {
  constructor(src, fade = 2.5, rate = 1) {
    this.src = src;
    this.rate = rate;
    this.fade = fade;
    this.els = null;
    this.cur = 0;
    this.vol = 0;
    this.target = 0;
    this.muted = false;
    this.timer = null;
  }

  set(v) {
    this.target = clamp01(v);
    if (!this.timer && (this.target > 0 || this.vol > 0)) this.timer = setInterval(() => this.tick(), 50);
  }

  setMuted(m) {
    this.muted = m;
    if (this.els) this.els.forEach((e) => { e.muted = m; });
  }

  tick() {
    if (!this.els) {
      this.els = [new Audio(this.src), new Audio(this.src)];
      this.els.forEach((e) => {
        e.volume = 0;
        e.muted = this.muted;
        e.preservesPitch = false;
        e.playbackRate = this.rate;
      });
      this.els[0].play().catch(() => {});
    }
    this.vol += (this.target - this.vol) * 0.12;
    if (Math.abs(this.target - this.vol) < 0.002) this.vol = this.target;
    const a = this.els[this.cur];
    const b = this.els[1 - this.cur];
    // Measured in the recording's own seconds, so the crossfade lasts this.fade at any playback rate.
    const d = a.duration;
    const fade = this.fade * this.rate;
    let ka = 1;
    let kb = 0;
    if (d && a.currentTime > d - fade) {
      if (b.paused) {
        b.currentTime = 0;
        b.play().catch(() => {});
      }
      ka = clamp01((d - a.currentTime) / fade);
      kb = 1 - ka;
    }
    if (a.ended || (d && a.currentTime >= d - 0.05)) {
      a.pause();
      this.cur = 1 - this.cur;
      ka = 0;
      kb = 1;
    }
    a.volume = clamp01(this.vol * ka);
    b.volume = clamp01(this.vol * kb);
    if (this.vol === 0 && this.target === 0) {
      this.els.forEach((e) => e.pause());
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.unlocked = 0;
    this.layers = [];
    this.hums = new Map();
    this.wind = new FileLoop(WIND_SRC);
    this.storm = new FileLoop(STORM_SRC);
    this.fire = new FileLoop(FIRE_SRC);
  }

  // Must run from a user gesture so the browser allows playback.
  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_LEVEL;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.musicBus = this.gainNode(1, this.master);
    this.sfxBus = this.gainNode(1, this.master);
    this.buildLayers();
  }

  gainNode(value, dest) {
    const g = this.ctx.createGain();
    g.gain.value = value;
    g.connect(dest);
    return g;
  }

  buildLayers() {
    const ctx = this.ctx;
    const layer = (peak) => ({ gain: this.gainNode(0, this.musicBus), peak, target: 0 });

    // 0: low drone
    const drone = layer(0.06);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    lp.connect(drone.gain);
    for (const f of [110, 110.7, 164.81]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.33;
      o.connect(g);
      g.connect(lp);
      o.start();
    }

    // 1: soft piano line, one note per beat
    const piano = layer(1);
    piano.onBeat = (t, b) => this.tone(piano.gain, PIANO[b % PIANO.length], t, 2.2, 'triangle', 0.09);

    // 2: high pad
    const pad = layer(0.03);
    for (const f of [659.25, 987.77]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(pad.gain);
      o.start();
    }

    // 3: bass every four beats
    const bass = layer(1);
    bass.onBeat = (t, b) => {
      if (b % 4 === 0) this.tone(bass.gain, b % 8 === 0 ? 55 : 65.41, t, 3.5, 'sine', 0.35);
    };

    // 4: bells on off-beats
    const bells = layer(1);
    bells.onBeat = (t, b) => {
      if (b % 2 === 1) this.tone(bells.gain, BELLS[(b >> 1) % BELLS.length], t, 3, 'sine', 0.05);
    };

    this.layers = [drone, piano, pad, bass, bells];
  }

  tone(dest, freq, t, dur, type, peak) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // 0 = a breath of wind, 1 = a gale.
  setWind(amount) {
    this.wind.set(0.18 + 0.62 * clamp01(amount));
  }

  // The howling storm, for the hazards: 0 = none, 1 = full.
  setStorm(amount) {
    this.storm.set(0.9 * clamp01(amount));
  }

  // The prologue's warm music: the first three layers together, faded by k. Gameplay takes the layers back after.
  setPrologueMusic(k) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.layers.forEach((l, i) => {
      const target = i < 3 ? l.peak * k : 0;
      if (Math.abs(target - l.target) > 0.001 || (target === 0 && l.target !== 0)) {
        l.target = target;
        l.gain.gain.setTargetAtTime(target, now, 0.8);
      }
    });
  }

  onBeat(beat) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.03;
    for (const l of this.layers) {
      if (l.onBeat && l.target > 0) l.onBeat(t, beat);
    }
  }

  // allowed: how many unlocked layers the current warmth lets through.
  setMusic(allowed) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.layers.forEach((l, i) => {
      const target = i < this.unlocked && i < allowed ? l.peak : 0;
      if (target !== l.target) {
        l.target = target;
        l.gain.gain.setTargetAtTime(target, now, target > 0 ? 1.2 : 0.6);
      }
    });
  }

  unlockLayer() {
    this.unlocked = Math.min(this.unlocked + 1, 5);
  }

  resetLayers() {
    this.unlocked = 0;
    for (const id of [...this.hums.keys()]) this.setHum(id, 0, 0);
  }

  heartbeat(warmth) {
    if (this.muted) return;
    const el = new Audio(HEART_SRC[Math.floor(Math.random() * HEART_SRC.length)]);
    el.volume = warmth < 35 ? 0.8 : 0.55;
    el.play().catch(() => {});
  }


  pulse() {
    this.playOne(PULSE_SRC, 0.5);
  }

  // One recording from a list, with a little variation in pitch so repeats do not sound identical.
  playOne(list, volume, spread = 0.08) {
    if (this.muted) return;
    const el = new Audio(list[Math.floor(Math.random() * list.length)]);
    el.preservesPitch = false;
    el.playbackRate = 1 - spread + Math.random() * 2 * spread;
    el.volume = clamp01(volume);
    el.play().catch(() => {});
  }

  // The fire crackles louder as she nears it: 0 = out of earshot, 1 = beside it.
  setFire(amount) {
    this.fire.set(0.85 * clamp01(amount));
  }

  // One boot landing in the snow. Each step varies a little in pitch and weight.
  footstep() {
    if (this.muted) return;
    const el = new Audio(STEP_SRC[Math.floor(Math.random() * STEP_SRC.length)]);
    el.preservesPitch = false;
    el.playbackRate = 0.9 + Math.random() * 0.2;
    el.volume = 0.22 + Math.random() * 0.12;
    el.play().catch(() => {});
  }

  crack() {
    if (this.muted) return;
    const el = new Audio(CRACK_SRC[Math.floor(Math.random() * CRACK_SRC.length)]);
    el.volume = 0.55 + Math.random() * 0.25;
    el.play().catch(() => {});
  }

  melt() {
    this.playOne(MELT_SRC, 0.8, 0.05);
  }

  // The cold closing over what you didn't choose: a low, hardening crackle.
  // The cold closing over what you didn't choose.
  refreeze() {
    this.playOne(REFREEZE_SRC, 0.9, 0.05);
  }

  // Picking up an ember: a soft crackle and a low warm note.
  // Picking up an ember: a short crackle of fire.
  ember() {
    this.playOne(EMBER_SRC, 0.8, 0.06);
  }

  chime() {
    this.playOne(CHIME_SRC, 0.6, 0.03);
  }

  lightsOut() {
    this.playOne(LIGHTS_OUT_SRC, 0.9, 0);
  }

  // A quiet tone per frozen object that grows louder as the ember gets close.
  // Each frozen thing hums as she nears it. freq sets the pitch; level 0.04 is right beside it.
  setHum(id, freq, level) {
    let h = this.hums.get(id);
    if (!h) {
      if (level <= 0.0005) return;
      h = new FileLoop(HUM_SRC, 2.5, freq / HUM_BASE);
      h.setMuted(this.muted);
      this.hums.set(id, h);
    }
    h.set(level * 12);
  }

  // Played with a plain audio element, which also works when index.html is opened straight from disk.
  // If the file is missing, the prologue falls back to the game's own music.
  playTheme() {
    if (this.theme) return;
    const el = new Audio(THEME_SRC);
    el.volume = 0.85;
    el.muted = this.muted;
    el.addEventListener('error', () => { this.themeFailed = true; });
    el.addEventListener('ended', () => { this.themeEnded = true; });
    el.play().catch(() => { this.themeFailed = true; });
    this.theme = el;
  }

  themePlaying() {
    return !!this.theme && !this.themeFailed && !this.themeEnded;
  }

  // Skipping the prologue: let the theme fade out instead of stopping dead.
  fadeTheme() {
    const el = this.theme;
    if (!el || this.themeEnded) return;
    const step = () => {
      el.volume = Math.max(0, el.volume - 0.06);
      if (el.volume > 0) setTimeout(step, 50);
      else { el.pause(); this.themeEnded = true; }
    };
    step();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.theme) this.theme.muted = this.muted;
    this.wind.setMuted(this.muted);
    this.storm.setMuted(this.muted);
    this.fire.setMuted(this.muted);
    this.hums.forEach((h) => h.setMuted(this.muted));
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER_LEVEL, this.ctx.currentTime, 0.05);
  }
}
