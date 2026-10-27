import {
  VIEW, BEAT_SECONDS, SLOW_BEAT_EXTRA, WARMTH, EMBER, PULSE, THRESHOLDS, MELT_SECONDS, SPREAD_SECONDS, EMBERS,
  WIND, CAVE, CREVASSE,
} from './config.js';
import { groundY, floorY, inLower, lowerRoute, objectBounds, setTerrain } from './terrain.js';
import { Prologue, prologueGround } from './prologue.js';
import { POT_HEIGHT } from './character.js';
import { villagerName } from './village.js';

// The player is a child; the villagers she finds are grown-ups.
export const PLAYER_SCALE = 1.4;
export const COMPANION_SCALE = 1.6;
// The ember pot is carried this far above the feet, at scale 1.
const CHEST = POT_HEIGHT;
export const CHEST_HEIGHT = CHEST * PLAYER_SCALE;
const HUM_FREQ = { tree: 1318.51, lantern: 1567.98, wanderer: 1174.66 };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Seconds of the first stage's intro (rising from the snow) before the player can move.
export const INTRO_LOCK = 3.2;
// Later stages open with her already standing: a shorter pause while the stage name is written.
const WALK_ON_LOCK = 1.4;
const between = ([a, b]) => a + Math.random() * (b - a);

export class Game {
  constructor(levels, audio) {
    this.levels = levels;
    this.stage = 0;
    this.level = levels[0];
    this.audio = audio;
    // Who walks into a stage with her. Restarting a stage brings back the same people.
    this.companionsAtStageStart = [];
    // title (press any key, so the browser lets sound play) | prologue | play | paused | stageEnd
    this.mode = 'title';
    this.prologue = null;
    // The figure rising out of the snow as the first stage begins.
    this.intro = null;
    this.time = 0;
    this.titleFade = 1;
    this.reset();
    this.ledgerAtStageStart = JSON.parse(JSON.stringify(this.ledger));
  }

  reset() {
    const L = this.level;
    this.audio.setRest(false);
    // What the player's choices have added up to, carried from stage to stage. Restarting a stage
    // goes back to how things stood when the stage began.
    this.ledger = this.ledgerAtStageStart
      ? JSON.parse(JSON.stringify(this.ledgerAtStageStart))
      : { saved: [], lost: [], forks: {}, carry: [] };
    this.coldTimer = 0;
    // A line the frost says for a few seconds: a companion's fire going out, the wind breaking a pulse.
    this.note = null;
    this.stageRecorded = false;
    // low: down in the gully or the ice cave. wantLow: she has chosen the gully at the cairn.
    this.ember = { x: L.spawn.x, y: groundY(L.spawn.x) - CHEST_HEIGHT, vx: 0, facing: 1, warmth: WARMTH.max, low: false, wantLow: false, fall: null };
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
    this.companions = this.companionsAtStageStart.map((home, i) => {
      const x = Math.max(30, L.spawn.x - 44 * (i + 1));
      return { x, y: groundY(x) - CHEST * COMPANION_SCALE, facing: 1, phase: Math.random() * 6, home, low: false, joinedAt: -99 };
    });
    this.wind = { phase: 'calm', t: 0, next: 2, strength: 0, k: 0, exposed: false };
    this.bridge = L.crevasse ? { ...L.crevasse, intact: true, stress: 0, creaked: false } : null;
    this.route = null;
    this.windTold = false;
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
    this.hintFlags = {
      moved: false, pulsed: false, lanternLit: false, rested: false, forkChosen: false, lostLantern: false, lostWanderer: false,
      gusted: false, sheltered: false, routeChosen: false,
    };
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
      else if (this.startOverPressed(input)) this.startOver();
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
      if (this.stageEndT > 6 && this.startOverPressed(input)) {
        this.startOver();
        return;
      }
      if (this.stageEndT > 6 && input.pulsePressed) {
        if (this.hasNextStage()) {
          this.goToStage(this.stage + 1);
          return;
        }
        this.mode = 'play';
        this.freeRoam = true;
        this.holdLock = true;
      }
    }

    this.simulate(dt, input);
  }

  startOverPressed(input) {
    return input.wasPressed('Enter') || input.wasPressed('NumpadEnter');
  }

  // Back to the title and the prologue, with every choice forgotten: the same as opening the game fresh.
  startOver() {
    location.reload();
  }

  // How many of this stage's frozen villagers are walking with her now.
  foundThisStage() {
    const homes = this.level.objects.filter((o) => o.type === 'wanderer' && o.home).map((o) => o.home);
    return this.companions.filter((c) => homes.includes(c.home)).length;
  }

  hasNextStage() {
    return this.stage + 1 < this.levels.length;
  }

  // On to the next stage: she walks on from the fire, with everyone who is with her and everything she chose.
  goToStage(i) {
    this.recordStage();
    this.ledgerAtStageStart = JSON.parse(JSON.stringify(this.ledger));
    this.companionsAtStageStart = this.companions.map((c) => c.home).filter(Boolean);
    this.stage = i;
    this.level = this.levels[i];
    setTerrain(this.level.ground, this.level.lower);
    this.reset();
    this.audio.setFire(0);
    this.mode = 'play';
    this.intro = { t: 0, pulsed: true, kind: 'walk' };
    this.titleFade = 1;
  }

  // The weaver can read the wind, but only while walking with her.
  hasGuide() {
    return this.ledger.carry.includes('guide') && this.companions.some((c) => c.home === 'weaver');
  }

  hasFlame() {
    return this.ledger.carry.includes('flame');
  }

  introLock() {
    return this.intro && this.intro.kind === 'walk' ? WALK_ON_LOCK : INTRO_LOCK;
  }

  endPrologue() {
    setTerrain(this.level.ground, this.level.lower);
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
    if (it.t > this.introLock() && (Math.abs(input.moveX) > 0.1 || it.t > (it.kind === 'walk' ? 5 : 12))) it.fading = true;
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
    const falling = e.fall && e.fall.t < CREVASSE.fallSeconds;
    const controllable = this.mode === 'play' && !this.lightsOut && !falling && !(this.intro && this.intro.t < this.introLock());

    this.updateWind(dt);
    const gust = this.wind.exposed && this.wind.phase === 'gust' ? this.wind.strength * this.wind.k : 0;

    // Pulse: hold to pulse on every heartbeat. The first pulse fires on press. A gust breaks it: let go and try again.
    if (this.holdLock && !input.pulseHeld) this.holdLock = false;
    if (gust > 0.3 && this.pulsing) {
      this.pulsing = false;
      this.holdLock = true;
      this.say('the wind breaks your pulse', e.x);
    }
    const wantPulse = controllable && !this.holdLock && input.pulseHeld && gust <= 0.3;
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
    // At the cairn, down chooses the gully; up changes her mind.
    const cairn = L.cairn;
    if (cairn && controllable && Math.abs(e.x - cairn.x) < 220) {
      if (input.moveY > 0.5) e.wantLow = true;
      else if (input.moveY < -0.5) e.wantLow = false;
    }
    const inCave = e.low && inLower(e.x);
    const top = EMBER.maxSpeed * (inCave ? CAVE.speed : 1);
    e.vx += ax * EMBER.accel * (inCave ? CAVE.speed : 1) * dt;
    // A gust pushes her back the way she came, unless she stands still and braces against it.
    e.braced = gust > 0.3 && controllable && ax === 0 && !this.pulsing;
    if (gust > 0.3 && !this.windTold) {
      this.windTold = true;
      this.say('stand still to brace', e.x);
    }
    e.vx -= WIND.push * gust * (e.braced ? WIND.braced : 1) * dt;
    e.vx *= Math.exp(-(this.pulsing ? EMBER.pulseDamping : EMBER.damping) * dt);
    e.vx = clamp(e.vx, -EMBER.maxSpeed, top);
    if (Math.abs(e.vx) > 8 && ax !== 0) e.facing = Math.sign(e.vx);
    const before = e.x;
    e.x += e.vx * dt;
    if (e.x < 20) { e.x = 20; e.vx = 0; }
    if (e.x > L.width - 20) { e.x = L.width - 20; e.vx = 0; }
    this.updateRoute(before, e.x, dt);
    e.y = floorY(e.x, e.low) - CHEST_HEIGHT;
    if (e.fall) e.fall.t += dt;

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

    const camTarget = clamp(e.x - VIEW.w * 0.42, 0, L.width - VIEW.w);
    this.camX += (camTarget - this.camX) * Math.min(1, dt * 3);

    this.updateAudio();
  }

  onBeat() {
    this.beatIndex++;
    if (!this.lightsOut) this.audio.heartbeat(this.ember.warmth);
    if (this.pulsing) this.emitPulse();
  }

  // A line written in the frost for a few seconds.
  // follow: a companion's home, so the line stays with whoever said it.
  say(text, x, follow) {
    if (this.note && this.note.text === text && this.time - this.note.t < 6) return;
    this.note = { text, x, t: this.time, follow };
  }

  // Behind a rock, out of the wind. The wind blows from the right, so the shelter is on a rock's left.
  inShelter(x) {
    return (this.level.rocks || []).some((r) => x > r - WIND.leeBehind && x < r + WIND.leeAhead);
  }

  windZone(x) {
    const e = this.ember;
    for (const z of this.level.wind || []) {
      if (x < z.x0 || x >= z.x1) continue;
      // Down in the gully or the cave there is no wind.
      if (z.ridge && e.low) return null;
      return z;
    }
    return null;
  }

  // The gust cycle: calm, a warning, a gust. It only runs while she is somewhere the wind can reach.
  updateWind(dt) {
    const w = this.wind;
    const e = this.ember;
    const zone = this.windZone(e.x);
    w.k = zone ? zone.k : 0;
    w.exposed = !!zone && !this.inShelter(e.x);
    if (!zone && w.phase === 'calm') {
      w.strength = Math.max(0, w.strength - dt);
      return;
    }
    w.t += dt;
    const warn = this.hasGuide() ? WIND.guideWarn : WIND.warn;
    if (w.phase === 'calm' && w.t >= w.next) {
      w.phase = 'warn';
      w.t = 0;
      if (this.hasGuide()) {
        const g = this.companions.find((c) => c.home === 'weaver');
        this.say('the weaver: wind is coming', g ? g.x : e.x, 'weaver');
      }
    } else if (w.phase === 'warn' && w.t >= warn) {
      w.phase = 'gust';
      w.t = 0;
    } else if (w.phase === 'gust' && w.t >= WIND.gust) {
      w.phase = 'calm';
      w.t = 0;
      w.next = between(WIND.calm);
      this.hintFlags.gusted = true;
    }
    // How hard it is blowing right now. The warning is easy to see and hear from its first moment:
    // snow starts streaking sideways and the howl rises, before the gust itself hits.
    const target = w.phase === 'gust' ? 1 : w.phase === 'warn' ? 0.2 + 0.4 * (w.t / warn) : 0;
    w.strength += (target - w.strength) * Math.min(1, dt * 3);
    if (w.phase === 'gust' && w.exposed === false && zone) this.hintFlags.sheltered = true;
  }

  // The split: which floor she is on, the choice of route, and the snow bridge on the ridge.
  updateRoute(before, x, dt) {
    const e = this.ember;
    const low = lowerRoute();
    if (!low) return;
    if (before < low.x0 && x >= low.x0) {
      e.low = e.wantLow;
      this.hintFlags.routeChosen = true;
    } else if (before >= low.x0 && x < low.x0) {
      e.low = false;
    }
    if (before <= low.x1 && x > low.x1) {
      if (!this.route) this.route = e.low ? 'gully' : 'ridge';
      this.choices.wind = this.route;
      this.ledger.forks.wind = this.route;
      e.low = false;
    } else if (before > low.x1 && x <= low.x1) {
      e.low = this.route === 'gully' || this.route === 'fell';
    }

    const b = this.bridge;
    if (!b || e.low) return;
    const on = x > b.x0 && x < b.x1;
    if (!on) {
      b.stress = Math.max(0, b.stress - dt * 0.5);
      return;
    }
    if (!b.intact) {
      this.fallThrough();
      return;
    }
    if (Math.abs(e.vx) < CREVASSE.slowSpeed) b.stress += dt;
    if (b.stress > 0.4 && !b.creaked) {
      b.creaked = true;
      this.audio.crack();
    }
    if (b.stress >= CREVASSE.standTime) {
      b.intact = false;
      this.fallThrough();
    }
  }

  // The snow bridge gives way: she drops into the ice cave below, and the people with her come down after her.
  fallThrough() {
    const e = this.ember;
    const from = groundY(e.x);
    e.low = true;
    e.wantLow = true;
    e.vx = 0;
    e.fall = { t: 0, dy: floorY(e.x, true) - from };
    e.warmth = Math.max(1, e.warmth - CREVASSE.fallWarmth);
    this.pulsing = false;
    this.holdLock = true;
    this.route = 'fell';
    this.hintFlags.routeChosen = true;
    this.audio.refreeze();
    this.audio.crack();
  }

  emitPulse() {
    const e = this.ember;
    if (this.bridge && !e.low && e.x > this.bridge.x0 && e.x < this.bridge.x1) this.bridge.stress += CREVASSE.pulseStress;
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
    this.ledger.forks[chosen.fork] = chosen.type;
    const carry = this.level.carries && this.level.carries[chosen.fork] && this.level.carries[chosen.fork][chosen.type];
    if (carry) this.ledger.carry.push(carry.id);
    for (const o of this.objects) {
      if (o === chosen || o.fork !== chosen.fork || o.state !== 'frozen') continue;
      o.state = 'lost';
      o.lostAt = this.time;
      this.hintFlags[o.type === 'lantern' ? 'lostLantern' : 'lostWanderer'] = true;
      if (o.home) this.ledger.lost.push(o.home);
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
      if (!!o.low !== (e.low && inLower(e.x))) continue;
      const d = Math.hypot(e.x - (o.x + 16), e.y - (floorY(o.x, o.low) - 92));
      const r = o.radius * (0.4 + 0.6 * o.spread);
      if (d < r) {
        delta += WARMTH.lanternHealPerSecond * (1 - d / r * 0.5);
        nearHeat = true;
        if (e.warmth >= 95) this.hintFlags.rested = true;
      }
    }

    const fd = Math.abs(e.x - this.fire.x);
    this.audio.setFire(1 - fd / 1100);
    if (fd < WARMTH.fireRadius) {
      delta += WARMTH.fireHealPerSecond * (1 - fd / WARMTH.fireRadius);
      nearHeat = true;
    }

    const inCave = e.low && inLower(e.x);
    if (!nearHeat) delta -= WARMTH.drainPerSecond;
    for (const m of this.level.mist) {
      if (e.x > m.x0 && e.x < m.x1) delta -= WARMTH.mistDrainPerSecond;
    }
    // The cave is out of the wind but slowly cold, unless she carries the lantern's flame.
    if (inCave && !nearHeat && !this.hasFlame()) delta -= CAVE.chill;
    // A gust strips warmth away. Behind a rock it does not reach her.
    if (this.wind.exposed && this.wind.phase === 'gust') delta -= WIND.gustDrain * this.wind.k * this.wind.strength;

    e.warmth = clamp(e.warmth + delta * dt, 0, WARMTH.max);

    // Flash the bar label the first time each warmth band is crossed.
    for (const th of [THRESHOLDS.frost, THRESHOLDS.blur, THRESHOLDS.heavy]) {
      if (e.warmth < th && !this.flashed.has(th)) {
        this.flashed.add(th);
        this.barFlash = 4;
      }
    }
    this.barFlash = Math.max(0, this.barFlash - dt);

    // Let your coal nearly die and the last person who joined you loses their fire.
    if (e.warmth < WARMTH.relapseBelow && this.companions.length > 0) {
      this.coldTimer += dt;
      if (this.coldTimer >= WARMTH.relapseAfter) {
        this.coldTimer = 0;
        this.relapse();
      }
    } else {
      this.coldTimer = 0;
    }

    if (e.warmth <= 0) {
      this.lightsOut = { t: 0, respawned: false };
      this.pulsing = false;
      this.audio.lightsOut();
    }
  }

  // A companion whose fire has gone out freezes again where they stand. They can be warmed again,
  // but it takes more than the first time.
  relapse() {
    const c = this.companions.pop();
    const o = {
      type: 'wanderer',
      x: c.x,
      pulses: WARMTH.relapsePulses,
      home: c.home,
      figId: c.home,
      low: c.low,
      relapsed: true,
    };
    this.objects.push({
      ...o,
      id: this.objects.length,
      progress: 0,
      state: 'frozen',
      meltT: 0,
      spread: 0,
      hit: 0,
      gone: false,
      seed: this.objects.length * 97 + 13,
      bounds: objectBounds(o),
    });
    this.note = { x: c.x, text: `${villagerName(c.home)}'s fire went out`, t: this.time };
    this.audio.refreeze();
  }

  // At the fire: everyone walking with you is saved; anyone still frozen in this stage was left in the cold.
  recordStage() {
    if (this.stageRecorded) return;
    this.stageRecorded = true;
    const L = this.ledger;
    for (const c of this.companions) if (c.home && !L.saved.includes(c.home)) L.saved.push(c.home);
    for (const o of this.objects) {
      if (o.type !== 'wanderer' || !o.home) continue;
      if (L.saved.includes(o.home) || L.lost.includes(o.home)) continue;
      L.lost.push(o.home);
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
      this.companions.push({ x: o.x, y: floorY(o.x, o.low) - CHEST * COMPANION_SCALE, facing: -1, phase: Math.random() * 6, home: o.home, low: !!o.low, joinedAt: this.time });
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
      // They follow her down into the gully, or down through the snow after her.
      c.low = e.low && inLower(c.x);
      c.y = floorY(c.x, c.low) - CHEST * COMPANION_SCALE;
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

    const lowHere = e.low && inLower(e.x);
    for (const p of this.pickups) {
      if (Math.abs(e.x - p.x) < EMBERS.pickupRange && !!p.low === lowHere) {
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
    // On whichever floor she is on, so she can reach it.
    this.pickups.push({ x, low: e.low && inLower(x), t: 0, life: EMBERS.life, taken: false, seed: Math.floor(Math.random() * 1e6) });
    this.embersSpawned++;
  }

  updateFire() {
    const e = this.ember;
    if (this.fire.reached || this.lightsOut) return;
    if (Math.abs(e.x - this.fire.x) < 110) {
      this.fire.reached = true;
      // The stage's opening title never lingers into its ending.
      this.intro = null;
      this.titleFade = 0;
      this.recordStage();
      const cx = this.fire.x - 60;
      this.checkpoint = { x: cx, y: groundY(cx) - 60 };
      this.audio.unlockLayer();
      this.audio.chime();
      this.audio.setRest(true);
      if (!this.freeRoam) {
        this.mode = 'stageEnd';
        this.stageEndT = 0;
      }
    }
  }

  updateLightsOut(dt) {
    if (this.note && this.time - this.note.t > 6) this.note = null;
    if (this.note && this.note.follow) {
      const c = this.companions.find((x) => x.home === this.note.follow);
      if (c) this.note.x = c.x;
    }
    const lo = this.lightsOut;
    if (!lo) return;
    lo.t += dt;
    if (lo.t >= 2.6 && !lo.respawned) {
      // Wake at the last fire. Thawed things stay thawed and companions stay.
      const e = this.ember;
      lo.respawned = true;
      e.x = this.checkpoint.x;
      e.low = false;
      e.wantLow = false;
      e.fall = null;
      e.y = groundY(e.x) - CHEST_HEIGHT;
      e.vx = 0;
      e.warmth = WARMTH.max;
      this.companions.forEach((c, i) => {
        c.x = Math.max(30, e.x - 44 * (i + 1));
        c.low = false;
        c.y = groundY(c.x) - CHEST * COMPANION_SCALE;
      });
      this.camX = clamp(e.x - VIEW.w * 0.42, 0, this.level.width - VIEW.w);
      this.flashed.clear();
      this.pickups = [];
    }
    if (lo.t >= 4.2) this.lightsOut = null;
  }

  updateAudio() {
    const e = this.ember;
    const w = e.warmth;
    // The music fades between 35% and 15% warmth and the cold music takes over. Silent while the light is out.
    const out = this.lightsOut && !this.lightsOut.respawned;
    const warm = out ? 0 : clamp((w - THRESHOLDS.heavy) / (THRESHOLDS.blur - THRESHOLDS.heavy), 0, 1);
    this.audio.setMusic(warm, out ? 0 : 1 - warm);
    // The howl of the storm: loud out in the open, muffled behind a rock, gone in the cave.
    const wd = this.wind;
    this.audio.setStorm(out || !wd.k ? 0 : wd.strength * Math.min(1, wd.k) * (wd.exposed ? 1 : 0.45));

    for (const o of this.objects) {
      if (o.state !== 'frozen') continue;
      const d = Math.hypot(o.bounds.cx - e.x, o.bounds.cy - e.y);
      const k = clamp(1 - d / 900, 0, 1);
      this.audio.setHum(o.id, HUM_FREQ[o.type] * (1 + o.id * 0.01), k * k * 0.04);
    }
  }
}
