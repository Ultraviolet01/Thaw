import {
  VIEW_W, BEAT_SECONDS, SLOW_BEAT_EXTRA, WARMTH, EMBER, PULSE, THRESHOLDS, MELT_SECONDS, SPREAD_SECONDS,
} from './config.js';
import { groundY, objectBounds } from './terrain.js';

const HUM_FREQ = { tree: 1318.51, lantern: 1567.98, wanderer: 1174.66 };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Game {
  constructor(level, audio) {
    this.level = level;
    this.audio = audio;
    this.mode = 'title'; // title | play | paused | stageEnd
    this.time = 0;
    this.titleFade = 1;
    this.reset();
  }

  reset() {
    const L = this.level;
    this.ember = { x: L.spawn.x, y: L.spawn.y, vx: 0, vy: 0, facing: 1, warmth: WARMTH.max };
    this.checkpoint = { ...L.spawn };
    this.objects = L.objects.map((o, i) => ({
      ...o,
      id: i,
      progress: 0,
      state: 'frozen', // frozen | melting | thawed
      meltT: 0,
      spread: 0,
      hit: 0,
      gone: false,
      seed: i * 97 + 13,
      bounds: objectBounds(o),
    }));
    this.totalWanderers = this.objects.filter((o) => o.type === 'wanderer').length;
    this.fire = { ...L.fire, reached: false };
    this.companions = [];
    this.rings = [];
    this.shimmers = [];
    this.shimmerTimer = 0;
    this.beatTimer = 0;
    this.beatIndex = 0;
    this.pulsing = false;
    this.holdLock = true; // ignore a Space press carried over from the menu
    this.camX = 0;
    this.lightsOut = null;
    this.stageEndT = 0;
    this.freeRoam = false;
    this.hintFlags = { moved: false, pulsed: false };
    this.barFlash = 6;
    this.flashed = new Set();
    this.audio.resetLayers();
  }

  update(dt, input) {
    this.time += dt;
    if (this.mode !== 'title') this.titleFade = Math.max(0, this.titleFade - dt * 1.5);

    if (this.mode === 'title') {
      if (input.anyPressed) {
        this.audio.start();
        this.mode = 'play';
        this.holdLock = true;
      }
      return;
    }

    if (input.wasPressed('KeyM')) this.audio.toggleMute();

    if (this.mode === 'paused') {
      if (input.pausePressed) this.mode = 'play';
      return;
    }
    if (input.pausePressed && this.mode === 'play') {
      this.mode = 'paused';
      return;
    }
    if (input.wasPressed('KeyR')) {
      this.reset();
      this.mode = 'play';
      return;
    }
    if (this.mode === 'stageEnd') {
      this.stageEndT += dt;
      if (this.stageEndT > 4 && input.pulsePressed) {
        this.mode = 'play';
        this.freeRoam = true;
        this.holdLock = true;
      }
    }

    this.simulate(dt, input);
  }

  beatInterval() {
    const w = this.ember.warmth;
    if (w >= THRESHOLDS.blur) return BEAT_SECONDS;
    return BEAT_SECONDS + ((THRESHOLDS.blur - w) / THRESHOLDS.blur) * SLOW_BEAT_EXTRA;
  }

  // 1 right on a beat, decaying toward 0 before the next one.
  beatEnvelope() {
    return Math.exp(-(this.beatTimer / this.beatInterval()) * 5);
  }

  pulseRadius() {
    return PULSE.baseRadius + PULSE.perCompanion * this.companions.length;
  }

  glowRadius() {
    const w = this.ember.warmth;
    if (w >= THRESHOLDS.heavy) return 40 + 110 * (w / 100);
    return 8 + 48 * (w / THRESHOLDS.heavy);
  }

  displayWarmth() {
    return this.mode === 'title' ? WARMTH.max : this.ember.warmth;
  }

  lightsOutAlpha() {
    const lo = this.lightsOut;
    if (!lo) return 0;
    if (lo.t < 1.6) return lo.t / 1.6;
    if (lo.t < 2.6) return 1;
    return clamp(1 - (lo.t - 2.6) / 1.6, 0, 1);
  }

  simulate(dt, input) {
    const e = this.ember;
    const L = this.level;
    const controllable = this.mode === 'play' && !this.lightsOut;

    // Pulse: hold to pulse on every heartbeat. The first pulse fires on press.
    if (this.holdLock && !input.pulseHeld) this.holdLock = false;
    const wantPulse = controllable && !this.holdLock && input.pulseHeld;
    if (wantPulse && !this.pulsing) {
      this.pulsing = true;
      this.beatTimer = this.beatInterval();
    }
    if (!wantPulse) this.pulsing = false;

    // Movement. The ember cannot move while pulsing.
    let ax = 0, ay = 0;
    if (controllable && !this.pulsing) {
      ax = input.moveX;
      ay = input.moveY;
      const len = Math.hypot(ax, ay);
      if (len > 1) { ax /= len; ay /= len; }
      if (len > 0.1) this.hintFlags.moved = true;
    }
    e.vx += ax * EMBER.accel * dt;
    e.vy += ay * EMBER.accel * dt;
    const damp = Math.exp(-(this.pulsing ? EMBER.pulseDamping : EMBER.damping) * dt);
    e.vx *= damp;
    e.vy *= damp;
    const speed = Math.hypot(e.vx, e.vy);
    if (speed > EMBER.maxSpeed) {
      e.vx *= EMBER.maxSpeed / speed;
      e.vy *= EMBER.maxSpeed / speed;
    }
    if (Math.abs(e.vx) > 10) e.facing = Math.sign(e.vx);
    e.x += e.vx * dt;
    e.y += e.vy * dt + Math.sin(this.time * 1.3) * 4 * dt;
    const floor = groundY(e.x) - EMBER.radius - 8;
    if (e.x < 20) { e.x = 20; e.vx = 0; }
    if (e.x > L.width - 20) { e.x = L.width - 20; e.vx = 0; }
    if (e.y < EMBER.ceiling) { e.y = EMBER.ceiling; e.vy = 0; }
    if (e.y > floor) { e.y = floor; e.vy = Math.min(0, e.vy); }

    // Heartbeat clock.
    this.beatTimer += dt;
    const interval = this.beatInterval();
    if (this.beatTimer >= interval) {
      this.beatTimer = Math.min(this.beatTimer - interval, interval);
      this.onBeat();
    }

    this.updateWarmth(dt);
    this.updateObjects(dt);
    this.updateCompanions(dt);
    this.updateEffects(dt);
    this.updateFire();
    this.updateLightsOut(dt);

    const camTarget = clamp(e.x - VIEW_W * 0.42, 0, L.width - VIEW_W);
    this.camX += (camTarget - this.camX) * Math.min(1, dt * 3);

    this.updateAudio();
  }

  onBeat() {
    this.beatIndex++;
    if (!this.lightsOut) this.audio.heartbeat(this.ember.warmth);
    this.audio.onBeat(this.beatIndex);
    if (this.pulsing) this.emitPulse();
  }

  emitPulse() {
    const e = this.ember;
    e.warmth = Math.max(0, e.warmth - WARMTH.pulseCost);
    const r = this.pulseRadius();
    this.rings.push({ x: e.x, y: e.y, t: 0, r, strong: true });
    for (const c of this.companions) this.rings.push({ x: c.x, y: c.y, t: 0, r: r * 0.45, strong: false });
    this.audio.pulse();
    this.hintFlags.pulsed = true;

    for (const o of this.objects) {
      if (o.state !== 'frozen') continue;
      const b = o.bounds;
      if (Math.hypot(e.x - b.cx, e.y - b.cy) > r + b.reach) continue;
      o.progress++;
      o.hit = 1;
      this.audio.crack();
      if (o.progress >= o.pulses) {
        o.state = 'melting';
        o.meltT = 0;
        this.audio.melt();
      }
    }
  }

  updateWarmth(dt) {
    if (this.lightsOut) return;
    const e = this.ember;
    let delta = 0;
    let nearHeat = false;

    for (const o of this.objects) {
      if (o.type !== 'lantern' || o.state !== 'thawed') continue;
      const d = Math.hypot(e.x - (o.x + 16), e.y - (groundY(o.x) - 92));
      const r = o.radius * (0.4 + 0.6 * o.spread);
      if (d < r) {
        delta += WARMTH.lanternHealPerSecond * (1 - d / r * 0.5);
        nearHeat = true;
      }
    }

    const fd = Math.abs(e.x - this.fire.x);
    if (fd < WARMTH.fireRadius) {
      delta += WARMTH.fireHealPerSecond * (1 - fd / WARMTH.fireRadius);
      nearHeat = true;
    }

    if (!nearHeat) delta -= WARMTH.drainPerSecond;
    for (const m of this.level.mist) {
      if (e.x > m.x0 && e.x < m.x1) delta -= WARMTH.mistDrainPerSecond;
    }
    for (const c of this.companions) {
      if (Math.hypot(e.x - c.x, e.y - c.y) < WARMTH.companionRange) delta += WARMTH.companionRegenPerSecond;
    }

    e.warmth = clamp(e.warmth + delta * dt, 0, WARMTH.max);

    // Flash the bar label the first time each warmth band is crossed.
    for (const th of [THRESHOLDS.frost, THRESHOLDS.blur, THRESHOLDS.heavy]) {
      if (e.warmth < th && !this.flashed.has(th)) {
        this.flashed.add(th);
        this.barFlash = 4;
      }
    }
    this.barFlash = Math.max(0, this.barFlash - dt);

    if (e.warmth <= 0) {
      this.lightsOut = { t: 0, respawned: false };
      this.pulsing = false;
      this.audio.lightsOut();
    }
  }

  updateObjects(dt) {
    for (const o of this.objects) {
      o.hit = Math.max(0, o.hit - dt * 2);
      if (o.state === 'melting') {
        o.meltT += dt / MELT_SECONDS;
        if (o.meltT >= 1) {
          o.meltT = 1;
          o.state = 'thawed';
          this.onThawed(o);
        }
      } else if (o.state === 'thawed') {
        o.spread = Math.min(1, o.spread + dt / SPREAD_SECONDS);
      }
    }
  }

  onThawed(o) {
    this.audio.unlockLayer();
    this.audio.chime();
    this.audio.setHum(o.id, 0, 0);
    if (o.type === 'wanderer') {
      o.gone = true;
      this.companions.push({ x: o.x, y: groundY(o.x) - 30, phase: Math.random() * 6 });
    }
  }

  updateCompanions(dt) {
    const e = this.ember;
    this.companions.forEach((c, i) => {
      const tx = e.x - e.facing * 36 * (i + 1);
      const ty = e.y - 8 + Math.sin(this.time * 1.6 + c.phase) * 8;
      const k = Math.min(1, dt * 2.2);
      c.x += (tx - c.x) * k;
      c.y += (ty - c.y) * k;
      c.y = Math.min(c.y, groundY(c.x) - 14);
    });
  }

  // Rings, plus the shimmer cue: faint motes that drift from the ember toward the nearest frozen thing.
  // It shows on screen what the hums say by ear, so the game is playable with sound off.
  updateEffects(dt) {
    const e = this.ember;
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < PULSE.ringSeconds);

    this.shimmerTimer -= dt;
    if (this.shimmerTimer <= 0 && !this.lightsOut) {
      this.shimmerTimer = 0.22;
      const target = this.shimmerTarget();
      if (target) {
        const dx = target.x - e.x;
        const dy = target.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        this.shimmers.push({
          x: e.x + (Math.random() - 0.5) * 40,
          y: e.y + (Math.random() - 0.5) * 40,
          vx: (dx / d) * 55,
          vy: (dy / d) * 55,
          t: 0,
          life: 2.4,
          ph: Math.random() * 6,
        });
      }
    }
    for (const s of this.shimmers) {
      s.t += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt + Math.sin(this.time * 3 + s.ph) * 6 * dt;
    }
    this.shimmers = this.shimmers.filter((s) => s.t < s.life);
  }

  shimmerTarget() {
    const e = this.ember;
    let best = null;
    let bestD = 1200;
    for (const o of this.objects) {
      if (o.state !== 'frozen') continue;
      const d = Math.hypot(o.bounds.cx - e.x, o.bounds.cy - e.y);
      if (d < bestD && d > 60) {
        bestD = d;
        best = { x: o.bounds.cx, y: o.bounds.cy };
      }
    }
    if (!best && !this.fire.reached) best = { x: this.fire.x, y: groundY(this.fire.x) - 40 };
    return best;
  }

  updateFire() {
    const e = this.ember;
    if (this.fire.reached || this.lightsOut) return;
    if (Math.abs(e.x - this.fire.x) < 110) {
      this.fire.reached = true;
      const cx = this.fire.x - 60;
      this.checkpoint = { x: cx, y: groundY(cx) - 60 };
      this.audio.unlockLayer();
      this.audio.chime();
      if (!this.freeRoam) {
        this.mode = 'stageEnd';
        this.stageEndT = 0;
      }
    }
  }

  updateLightsOut(dt) {
    const lo = this.lightsOut;
    if (!lo) return;
    lo.t += dt;
    if (lo.t >= 2.6 && !lo.respawned) {
      // Wake at the last fire. Thawed things stay thawed and companions stay.
      const e = this.ember;
      lo.respawned = true;
      e.x = this.checkpoint.x;
      e.y = this.checkpoint.y;
      e.vx = 0;
      e.vy = 0;
      e.warmth = WARMTH.max;
      this.companions.forEach((c, i) => {
        c.x = e.x - 36 * (i + 1);
        c.y = e.y;
      });
      this.camX = clamp(e.x - VIEW_W * 0.42, 0, this.level.width - VIEW_W);
      this.flashed.clear();
    }
    if (lo.t >= 4.2) this.lightsOut = null;
  }

  updateAudio() {
    const e = this.ember;
    const w = e.warmth;
    const u = this.audio.unlocked;
    // Layers drop out one by one between 35% and 15%, and are silent below that.
    let allowed = 99;
    if (this.lightsOut && !this.lightsOut.respawned) allowed = 0;
    else if (w < THRESHOLDS.heavy) allowed = 0;
    else if (w < THRESHOLDS.blur) allowed = Math.ceil(((w - THRESHOLDS.heavy) / (THRESHOLDS.blur - THRESHOLDS.heavy)) * u);
    this.audio.setMusic(allowed);

    for (const o of this.objects) {
      if (o.state !== 'frozen') continue;
      const d = Math.hypot(o.bounds.cx - e.x, o.bounds.cy - e.y);
      const k = clamp(1 - d / 900, 0, 1);
      this.audio.setHum(o.id, HUM_FREQ[o.type] * (1 + o.id * 0.01), k * k * 0.04);
    }
  }
}
