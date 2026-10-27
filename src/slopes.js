// The mountain's hazards in Stage 3: avalanches down the chutes, frost quakes on the cliff path,
// and being buried. Each is warned of before it hits, and each can be survived.
import { AVALANCHE, QUAKE } from './config.js';

const between = ([a, b]) => a + Math.random() * (b - a);

export function setUpSlopes(g, L) {
  g.avalanches = (L.avalanches || []).map((a) => ({ ...a, phase: 'idle', t: 0, next: a.first, mound: 0, hitMiller: false }));
  g.quakes = (L.quakes || []).map((q) => ({
    ...q, phase: 'calm', t: 0, next: between(q.every), icicles: q.icicles.map((x) => ({ x, state: 'hang', t: 0 })),
  }));
  g.distant = L.distantSlide ? { ...L.distantSlide, t: -1 } : null;
}

export function underOverhang(a, x) {
  return !!a.overhang && x > a.overhang.x0 && x < a.overhang.x1;
}

export function rumbleSeconds(g) {
  return g.companions.some((c) => c.home === 'shepherd') ? AVALANCHE.shepherdRumble : AVALANCHE.rumble;
}

export function updateSlopes(g, dt) {
  const e = g.ember;
  const d = g.distant;
  if (d && d.t < 0 && e.x >= d.at) d.t = 0;
  if (d && d.t >= 0) d.t += dt;
  for (const a of g.avalanches) updateAvalanche(g, a, dt);
  for (const q of g.quakes) updateQuake(g, q, dt);
}

function updateAvalanche(g, a, dt) {
  const e = g.ember;
  const near = e.x > a.active[0] && e.x < a.active[1];
  if (a.phase === 'idle') {
    if (!near) return;
    a.t += dt;
    if (a.t < a.next) return;
    a.phase = 'rumble';
    a.t = 0;
    const s = g.companions.find((c) => c.home === 'shepherd');
    if (s) g.say('the shepherd: the slope is moving', s.x, 'shepherd');
    return;
  }
  a.t += dt;
  if (a.phase === 'rumble') {
    if (a.t >= rumbleSeconds(g)) {
      a.phase = 'slide';
      a.t = 0;
      a.hitMiller = false;
      g.audio.avalanche();
    }
    return;
  }
  // The slide: while the snow is across the path, anyone in it who is not under the rock is buried.
  const across = a.t > AVALANCHE.hit[0] && a.t < AVALANCHE.hit[1];
  if (across && !e.burial && !e.low && e.x > a.x0 && e.x < a.x1 && !underOverhang(a, e.x)) bury(g);
  if (across && !a.hitMiller) {
    for (const o of g.objects) {
      if (!o.buried || o.state !== 'frozen' || o.x < a.x0 || o.x > a.x1 || o.progress === 0) continue;
      o.progress = Math.max(0, o.progress - AVALANCHE.millerLoss);
      a.hitMiller = true;
      g.say('the snow covers the miller again', o.x);
    }
  }
  if (a.t >= AVALANCHE.slide) {
    a.phase = 'idle';
    a.t = 0;
    a.next = between(a.every);
    a.mound = Math.min(1, a.mound + 0.5);
    if (near) g.hintFlags.avalanched = true;
  }
}

// Caught by the snow: she cannot move until she has pulsed her way out.
function bury(g) {
  const e = g.ember;
  e.burial = { need: AVALANCHE.buryPulses, done: 0, t: 0 };
  e.vx = 0;
  g.pulsing = false;
  g.holdLock = true;
}

// One pulse while buried: the melt digs. Companions help a little and the smith a little more, but it always
// takes a few pulses, so the melting can be seen.
export function digOut(g) {
  const e = g.ember;
  const b = e.burial;
  const smith = g.companions.some((c) => c.home === 'smith') ? AVALANCHE.smithDig : 1;
  b.done += Math.min(AVALANCHE.maxDig, (1 + AVALANCHE.companionDig * g.companions.length) * smith);
  b.hit = 1;
  g.audio.crack();
  g.audio.melt();
  if (b.done >= b.need) {
    e.burial = null;
    // The last of the snow melts away outward from her.
    e.unburied = { t: 0 };
    g.rings.push({ x: e.x, y: e.y, t: 0, r: 120, strong: true });
  }
}

function updateQuake(g, q, dt) {
  const e = g.ember;
  const near = e.x > q.x0 - 150 && e.x < q.x1 + 150;
  for (const ic of q.icicles) {
    if (ic.state !== 'broken') continue;
    ic.t += dt;
    if (ic.t > QUAKE.regrow) ic.state = 'hang';
  }
  if (q.phase === 'calm') {
    if (!near) return;
    q.t += dt;
    if (q.t < q.next) return;
    q.phase = 'tremor';
    q.t = 0;
    g.audio.quake();
    return;
  }
  q.t += dt;
  if (q.phase === 'tremor') {
    if (q.t >= QUAKE.tremor) {
      q.phase = 'fall';
      q.t = 0;
      for (const ic of q.icicles) if (ic.state === 'hang') ic.state = 'falling';
    }
    return;
  }
  // The icicles land: anyone standing on a shadow is hit.
  if (q.t >= QUAKE.fall) {
    for (const ic of q.icicles) {
      if (ic.state !== 'falling') continue;
      ic.state = 'broken';
      ic.t = 0;
      if (Math.abs(e.x - ic.x) < QUAKE.hitRange && !e.burial) {
        e.warmth = Math.max(1, e.warmth - QUAKE.hitWarmth);
        e.vx = -140;
        e.stun = QUAKE.stun;
        g.say('step out from under the ice', e.x);
      }
    }
    g.audio.icicles();
    q.phase = 'calm';
    q.t = 0;
    q.next = between(q.every);
    if (near) g.hintFlags.quaked = true;
  }
}

// How hard the ground is shaking at the moment, for the screen and the rumble.
export function shaking(g) {
  let k = 0;
  const e = g.ember;
  for (const a of g.avalanches) {
    if (!(e.x > a.active[0] - 400 && e.x < a.active[1] + 400)) continue;
    if (a.phase === 'rumble') k = Math.max(k, 0.25 + 0.35 * (a.t / rumbleSeconds(g)));
    if (a.phase === 'slide') k = Math.max(k, a.t < AVALANCHE.hit[1] ? 1 : 1 - (a.t - AVALANCHE.hit[1]) / (AVALANCHE.slide - AVALANCHE.hit[1]));
  }
  for (const q of g.quakes) if (q.phase === 'tremor' || q.phase === 'fall') k = Math.max(k, 0.7);
  const d = g.distant;
  if (d && d.t >= 0 && d.t < 4) k = Math.max(k, 0.3 * Math.sin((d.t / 4) * Math.PI));
  return k;
}
