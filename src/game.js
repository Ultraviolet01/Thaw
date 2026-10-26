import {
  VIEW_W, BEAT_SECONDS, SLOW_BEAT_EXTRA, WARMTH, EMBER, PULSE, THRESHOLDS, MELT_SECONDS, SPREAD_SECONDS, EMBERS,
} from './config.js';
import { groundY, objectBounds, setTerrain } from './terrain.js';
import { Prologue, prologueGround } from './prologue.js';
import { POT_HEIGHT } from './character.js';

// The player is a child; the villagers she finds are grown-ups.
export const PLAYER_SCALE = 1.4;
export const COMPANION_SCALE = 1.6;
// The ember pot is carried this far above the feet, at scale 1.
const CHEST = POT_HEIGHT;
export const CHEST_HEIGHT = CHEST * PLAYER_SCALE;
const HUM_FREQ = { tree: 1318.51, lantern: 1567.98, wanderer: 1174.66 };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Seconds of the stage intro before the player can move.
export const INTRO_LOCK = 3.2;
const between = ([a, b]) => a + Math.random() * (b - a);

export class Game {
  constructor(level, audio) {
    this.level = level;
    this.audio = audio;
    // title (press any key, so the browser lets sound play) | prologue | play | paused | stageEnd
    this.mode = 'title';
    this.prologue = null;
    // The figure rising out of the snow as the first stage begins.
    this.intro = null;
    this.time = 0;
    this.titleFade = 1;
    this.reset();
  }

  reset() {
    const L = this.level;
    this.ember = { x: L.spawn.x, y: groundY(L.spawn.x) - CHEST_HEIGHT, vx: 0, facing: 1, warmth: WARMTH.max };
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
    this.pickups = [];
    this.embersSpawned = 0;
    this.pickupTimer = between(EMBERS.rollEvery);
    this.flare = 0;
    this.beatTimer = 0;
    this.beatIndex = 0;
    this.pulsing = false;
    this.holdLock = true; // ignore a Space press carried over from the menu
    this.camX = 0;
    this.lightsOut = null;
    this.stageEndT = 0;
    this.freeRoam = false;
    this.hintFlags = { moved: false, pulsed: false, lanternLit: false, rested: false, forkChosen: false, lostLantern: false, lostWanderer: false };
    this.choices = {};
    this.barFlash = 6;
    this.flashed = new Set();
    this.audio.resetLayers();
  }

  update(dt, input) {
    this.time += dt;
    if (this.mode === 'title') {
      if (input.anyPressed) {
        this.audio.start();
        this.mode = 'prologue';
        this.prologue = new Prologue();
        setTerrain(prologueGround);
        this.audio.playTheme();
      }
      return;
    }

    if (this.mode === 'prologue') {
      if (input.wasPressed('KeyM')) this.audio.toggleMute();
      this.prologue.update(dt, this.audio);
      if (input.pausePressed) {
        this.prologue.skip();
        this.audio.fadeTheme();
      }
      if (this.prologue.done) this.endPrologue();
      return;
    }

    this.updateIntro(dt, input);

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
      if (this.stageEndT > 6 && input.pulsePressed) {
        this.mode = 'play';
        this.freeRoam = true;
        this.holdLock = true;
      }
    }

    this.simulate(dt, input);
  }

  endPrologue() {
    setTerrain(this.level.ground);
    this.audio.setPrologueMusic(0);
    this.audio.setWind(0);
    this.audio.resetLayers();
    this.prologue = null;
    this.mode = 'play';
    this.intro = { t: 0, pulsed: false };
    this.titleFade = 1;
    this.holdLock = true;
  }

  // The first seconds of the stage: out of black, the figure rises from the snow, its ember pulses once and
  // melts the first patch of frost, and "thaw" is written in the frost. Then the player has control.
  updateIntro(dt, input) {
    const it = this.intro;
    if (!it) return;
    it.t += dt;
    if (!it.pulsed && it.t > 2.2) {
      it.pulsed = true;
      const e = this.ember;
      this.rings.push({ x: e.x, y: e.y, t: 0, r: this.pulseRadius(), strong: true });
      this.audio.pulse();
    }
    // The title stays until the player starts walking (or a while passes), then fades.
    if (it.t > INTRO_LOCK && (Math.abs(input.moveX) > 0.1 || it.t > 12)) it.fading = true;
    if (it.fading) this.titleFade = Math.max(0, this.titleFade - dt * 0.6);
    if (this.titleFade <= 0) this.intro = null;
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
    const controllable = this.mode === 'play' && !this.lightsOut && !(this.intro && this.intro.t < INTRO_LOCK);

    // Pulse: hold to pulse on every heartbeat. The first pulse fires on press.
    if (this.holdLock && !input.pulseHeld) this.holdLock = false;
    const wantPulse = controllable && !this.holdLock && input.pulseHeld;
    if (wantPulse && !this.pulsing) {
      this.pulsing = true;
      this.beatTimer = this.beatInterval();
    }
    if (!wantPulse) this.pulsing = false;

    // Walking. The figure cannot move while pulsing. e.x is the feet, e.y the ember in the chest.
    let ax = 0;
    if (controllable && !this.pulsing) {
      ax = Math.max(-1, Math.min(1, input.moveX));
      if (Math.abs(ax) > 0.1) this.hintFlags.moved = true;
    }
    e.vx += ax * EMBER.accel * dt;
    e.vx *= Math.exp(-(this.pulsing ? EMBER.pulseDamping : EMBER.damping) * dt);
    e.vx = clamp(e.vx, -EMBER.maxSpeed, EMBER.maxSpeed);
    if (Math.abs(e.vx) > 8) e.facing = Math.sign(e.vx);
    e.x += e.vx * dt;
    if (e.x < 20) { e.x = 20; e.vx = 0; }
    if (e.x > L.width - 20) { e.x = L.width - 20; e.vx = 0; }
    e.y = groundY(e.x) - CHEST_HEIGHT;

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
    this.updatePickups(dt);
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
      // At a fork, whatever you crack first is your choice: the other side no longer takes your warmth.
      if (o.fork && o.progress === 0 && this.objects.some((x) => x !== o && x.fork === o.fork && x.state === 'frozen' && x.progress > 0)) continue;
      // Every companion's fire joins your pulse, so thawing takes fewer pulses the more of you there are.
      o.progress += 1 + this.companions.length;
      o.hit = 1;
      this.audio.crack();
      o.progress = Math.min(o.progress, o.pulses);
      if (o.progress >= o.pulses) {
        o.state = 'melting';
        o.meltT = 0;
        this.audio.melt();
        if (o.fork) this.chooseFork(o);
      }
    }
  }

  // A fork: warming one thing lets the cold take the others in the same fork. They can no longer be thawed.
  chooseFork(chosen) {
    if (this.choices[chosen.fork]) return;
    this.choices[chosen.fork] = chosen.type;
    this.hintFlags.forkChosen = true;
    for (const o of this.objects) {
      if (o === chosen || o.fork !== chosen.fork || o.state !== 'frozen') continue;
      o.state = 'lost';
      o.lostAt = this.time;
      this.hintFlags[o.type === 'lantern' ? 'lostLantern' : 'lostWanderer'] = true;
      this.audio.setHum(o.id, 0, 0);
      this.audio.refreeze();
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
        if (e.warmth >= 95) this.hintFlags.rested = true;
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
      } else if (o.state === 'lost' && !o.gone && this.time - o.lostAt > 3.6) {
        // The cold has taken it: it is gone from the world.
        o.gone = true;
      }
    }
  }

  onThawed(o) {
    o.thawedAt = this.time;
    if (o.type === 'lantern') this.hintFlags.lanternLit = true;
    this.audio.unlockLayer();
    this.audio.chime();
    this.audio.setHum(o.id, 0, 0);
    if (o.type === 'wanderer') {
      o.gone = true;
      // They light a pot of their own from yours. Their fire widens your pulse; it does not warm you.
      this.companions.push({ x: o.x, y: groundY(o.x) - CHEST * COMPANION_SCALE, facing: -1, phase: Math.random() * 6, objId: o.id, joinedAt: this.time });
    }
  }

  updateCompanions(dt) {
    const e = this.ember;
    // Companions walk a few steps behind.
    this.companions.forEach((c, i) => {
      const tx = e.x - e.facing * 44 * (i + 1);
      const step = (tx - c.x) * Math.min(1, dt * 1.8);
      if (Math.abs(tx - c.x) > 6) c.facing = Math.sign(tx - c.x);
      else c.facing = e.facing;
      c.x += clamp(step, -EMBER.maxSpeed * 1.2 * dt, EMBER.maxSpeed * 1.2 * dt);
      c.y = groundY(c.x) - CHEST * COMPANION_SCALE;
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

  // Lucky embers. A roll every so often; better odds when cold. One at a time, always ahead, never past the fire.
  updatePickups(dt) {
    const e = this.ember;
    this.flare = Math.max(0, this.flare - dt * 1.5);
    for (const p of this.pickups) p.t += dt;
    this.pickups = this.pickups.filter((p) => p.t < p.life && !p.taken);
    if (this.mode !== 'play' || this.lightsOut) return;

    for (const p of this.pickups) {
      if (Math.abs(e.x - p.x) < EMBERS.pickupRange) {
        p.taken = true;
        e.warmth = Math.min(WARMTH.max, e.warmth + EMBERS.warmth);
        this.flare = 1;
        this.rings.push({ x: e.x, y: e.y, t: 0, r: 70, strong: false });
        this.audio.ember();
      }
    }

    this.pickupTimer -= dt;
    if (this.pickupTimer > 0) return;
    this.pickupTimer = between(EMBERS.rollEvery);
    if (this.pickups.length > 0) return;
    const max = this.level.maxEmbers ?? EMBERS.maxPerStage;
    if (this.embersSpawned >= max) return;
    const odds = e.warmth < EMBERS.coldBelow ? EMBERS.coldChance : EMBERS.chance;
    if (Math.random() > odds) return;
    const limit = this.fire.reached ? this.level.width - 100 : this.fire.x - 150;
    const x = e.x + e.facing * between(EMBERS.ahead);
    if (x < 200 || x > limit) return;
    this.pickups.push({ x, t: 0, life: EMBERS.life, taken: false, seed: Math.floor(Math.random() * 1e6) });
    this.embersSpawned++;
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
      e.y = groundY(e.x) - CHEST_HEIGHT;
      e.vx = 0;
      e.warmth = WARMTH.max;
      this.companions.forEach((c, i) => {
        c.x = e.x - 44 * (i + 1);
        c.y = groundY(c.x) - CHEST * COMPANION_SCALE;
      });
      this.camX = clamp(e.x - VIEW_W * 0.42, 0, this.level.width - VIEW_W);
      this.flashed.clear();
      this.pickups = [];
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
