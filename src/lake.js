// The lake's hazards in Stage 4: thin ice that breaks under her if she stops or pulses on it, a whiteout that
// hides the cracks, and an ice storm that glazes the ice and slows every thaw.
import { LAKE, PERKS } from './config.js';

export function setUpLake(g, L) {
  g.thin = (L.thinIce || []).map(([x0, x1]) => ({ x0, x1, state: 'thin', stand: 0, t: 0, warned: false, creaked: 0 }));
  g.whiteout = 0;
}

export function inStorm(g, x) {
  return (g.level.storms || []).some((s) => x > s.x0 && x < s.x1);
}

function inWhiteout(g, x) {
  return (g.level.whiteouts || []).some((w) => x > w.x0 && x < w.x1);
}

export function thinUnder(g, x) {
  return g.thin.find((p) => x > p.x0 && x < p.x1);
}

export function updateLake(g, dt) {
  const e = g.ember;
  const target = inWhiteout(g, e.x) ? 1 : 0;
  g.whiteout += (target - g.whiteout) * Math.min(1, dt / LAKE.whiteoutRise * 2.2);
  if (g.whiteout > 0.5) g.hintFlags.whitedOut = true;
  const miller = g.companions.find((c) => c.home === 'miller');
  for (const p of g.thin) {
    if (p.state === 'open') {
      p.t += dt;
      if (p.t > LAKE.openFor) { p.state = 'thin'; p.stand = 0; }
    }
    // The miller knows the weight of things: they warn of thin ice ahead, even when it cannot be seen.
    if (miller && !p.warned && p.x0 - e.x < 260 && p.x0 - e.x > 0) {
      p.warned = true;
      g.say('the miller: the ice is thin here', miller.x, 'miller');
    }
  }
  if (g.lightsOut || e.stun > 0) return;
  const p = thinUnder(g, e.x);
  if (!p) return;
  // Open water: she stops at the edge and waits for it to skin over, rather than going straight back in.
  if (p.state === 'open') {
    e.x = e.x - p.x0 < p.x1 - e.x ? p.x0 - 1 : p.x1 + 1;
    e.vx = 0;
    g.sayOnce('openWater', 'open water. wait for it to freeze over', e.x);
    return;
  }
  if (Math.abs(e.vx) < LAKE.thinSlow) p.stand += dt;
  else p.stand = Math.max(0, p.stand - dt);
  // The ice creaks louder the longer she stands.
  const level = Math.floor(p.stand / 0.25);
  if (level > p.creaked) {
    p.creaked = level;
    g.audio.creak(p.stand / (LAKE.thinStand * (g.has('ferryman') ? PERKS.ferrymanThin : 1)));
  }
  // With the ferryman beside her, the thin ice holds a little longer.
  const holds = LAKE.thinStand * (g.has('ferryman') ? PERKS.ferrymanThin : 1);
  if (p.stand >= holds) fallIn(g, p);
}

// A pulse on thin ice breaks it at once.
export function pulseOnIce(g) {
  const p = thinUnder(g, g.ember.x);
  if (p && p.state === 'thin') fallIn(g, p);
}

// Through the ice: the freezing water takes a quarter of her warmth, and she hauls herself out a little way back.
function fallIn(g, p) {
  const e = g.ember;
  p.state = 'open';
  p.t = 0;
  p.stand = 0;
  p.creaked = 0;
  const fromLeft = e.vx >= 0 || e.facing > 0;
  e.x = fromLeft ? p.x0 - LAKE.climbBack : p.x1 + LAKE.climbBack;
  e.vx = 0;
  e.stun = LAKE.climbStun;
  e.splash = { t: 0, x: (p.x0 + p.x1) / 2 };
  e.warmth = Math.max(1, e.warmth - LAKE.fallWarmth);
  g.pulsing = false;
  g.holdLock = true;
  g.hintFlags.fellIn = true;
  g.say('the ice gave way', e.x);
  g.audio.splash();
}
