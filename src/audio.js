// All sound is synthesized with the Web Audio API, so the build ships no audio files.
// The music starts empty and each thaw unlocks one more layer.

const PIANO = [440, 523.25, 659.25, 587.33, 523.25, 659.25, 783.99, 659.25];
const BELLS = [1318.51, 1567.98, 1174.66, 1046.5];
const MASTER_LEVEL = 0.9;

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.unlocked = 0;
    this.layers = [];
    this.hums = new Map();
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
    this.noise = this.makeNoise(2);
    this.startWind();
    this.buildLayers();
  }

  gainNode(value, dest) {
    const g = this.ctx.createGain();
    g.gain.value = value;
    g.connect(dest);
    return g;
  }

  makeNoise(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  startWind() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 380;
    band.Q.value = 0.6;
    const g = this.gainNode(0.05, this.sfxBus);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const depth = ctx.createGain();
    depth.gain.value = 0.03;
    lfo.connect(depth);
    depth.connect(g.gain);
    src.connect(band);
    band.connect(g);
    src.start();
    lfo.start();
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

  noiseBurst(t, dur, freq, peak, type = 'highpass') {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
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
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.02;
    const vol = warmth < 35 ? 0.5 : 0.35;
    this.thump(t, 62, vol);
    this.thump(t + 0.2, 52, vol * 0.6);
  }

  thump(t, freq, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g);
    g.connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.3);
  }

  pulse() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    for (const f of [196, 293.66]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      o.connect(g);
      g.connect(this.sfxBus);
      o.start(t);
      o.stop(t + 1.3);
    }
    this.noiseBurst(t, 0.6, 900, 0.03, 'lowpass');
  }

  crack() {
    if (!this.ctx) return;
    this.noiseBurst(this.ctx.currentTime + 0.05, 0.07, 2500, 0.12);
  }

  melt() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 10; i++) {
      this.noiseBurst(t + Math.random() * 1.4, 0.05 + Math.random() * 0.05, 2000 + Math.random() * 2000, 0.04 + Math.random() * 0.08);
    }
  }

  chime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.05;
    [880, 1318.51, 1760].forEach((f, i) => this.tone(this.sfxBus, f, t + i * 0.08, 2.5, 'triangle', 0.06));
  }

  lightsOut() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 1.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(g);
    g.connect(this.sfxBus);
    o.start(t);
    o.stop(t + 1.7);
  }

  // A quiet tone per frozen object that grows louder as the ember gets close.
  setHum(id, freq, level) {
    if (!this.ctx) return;
    let h = this.hums.get(id);
    if (!h) {
      if (level <= 0.0005) return;
      const g = this.gainNode(0, this.sfxBus);
      const oscs = [freq, freq * 1.004].map((f) => {
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        o.connect(g);
        o.start();
        return o;
      });
      h = { g, oscs, level: 0 };
      this.hums.set(id, h);
    }
    if (Math.abs(h.level - level) > 0.001) {
      h.level = level;
      h.g.gain.setTargetAtTime(level, this.ctx.currentTime, 0.15);
    }
    if (level === 0) {
      const stopAt = this.ctx.currentTime + 1;
      h.oscs.forEach((o) => o.stop(stopAt));
      this.hums.delete(id);
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER_LEVEL, this.ctx.currentTime, 0.05);
  }
}
