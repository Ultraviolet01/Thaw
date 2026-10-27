// The street in the last stage: each villager walking with her goes to their own door and lights the window from
// their pot, then falls in behind her again. The homes of the people she lost stay dark.
import { HOME } from './config.js';
import { villagerName } from './village.js';

export function setUpHomes(g, L) {
  g.homes = (L.homes || []).map((h) => ({ ...h, lit: 0, visited: false }));
}

// Where a villager stands to light their window: just in front of their door.
export const doorX = (h) => h.x - h.w * 0.22;

export function updateHomes(g, dt) {
  const e = g.ember;
  for (const h of g.homes) {
    const c = g.companions.find((x) => x.home === h.id);
    if (!h.visited && c && !g.lightsOut && Math.abs(e.x - h.x) < HOME.reach) {
      h.visited = true;
      c.visit = { home: h, t: 0 };
      g.say(`${villagerName(h.id)} is home`, doorX(h), h.id);
    }
    if (c && c.visit && c.visit.home === h) {
      const v = c.visit;
      // The window lights once they reach the door; then they come back to walk with her.
      if (Math.abs(c.x - doorX(h)) < 14 || v.t > 0) {
        v.t += dt;
        h.lit = Math.min(1, h.lit + dt / HOME.lightSeconds);
        if (v.t > HOME.lightSeconds + HOME.linger) c.visit = null;
      }
    }
  }
}
