// Each stage sets its own ground shape. Lower y is higher on screen.
function defaultGround(x) {
  return 580
    + Math.sin(x * 0.0019) * 30
    + Math.sin(x * 0.0051 + 1.3) * 14
    + Math.sin(x * 0.013 + 0.4) * 5;
}

let ground = defaultGround;
// A second, lower floor under part of the stage: a gully that runs into an ice cave beneath the ridge.
// { x0, x1, floor(x), ceiling(x) }. Between x0 and x1 the main ground is the ridge above it.
let lower = null;

export function setTerrain(fn, low = null) {
  ground = fn || defaultGround;
  lower = low;
}

export function groundY(x) {
  return ground(x);
}

export function lowerRoute() {
  return lower;
}

export function inLower(x) {
  return !!lower && x > lower.x0 && x < lower.x1;
}

// The floor under x: the cave floor for anyone down in the gully, the surface for everyone else.
export function floorY(x, low) {
  return low && inLower(x) ? lower.floor(x) : ground(x);
}

const SIZES = {
  tree: { w: 132, h: 170, dx: 0 },
  lantern: { w: 56, h: 130, dx: 8 },
  wanderer: { w: 56, h: 92, dx: 0 },
  hearth: { w: 120, h: 60, dx: 0 },
};

// World-space box around a frozen object, used for pulse reach and the frost effects.
// o.low puts an object on the cave floor below the ridge.
export function objectBounds(o) {
  const s = SIZES[o.type];
  const base = floorY(o.x, o.low) + 6;
  const cx = o.x + s.dx;
  return {
    x0: cx - s.w / 2,
    x1: cx + s.w / 2,
    y0: base - s.h,
    y1: base,
    cx,
    cy: base - s.h / 2,
    // Never less than 60, so a ring that visibly touches a small figure counts as a hit.
    reach: Math.max(60, Math.max(s.w, s.h) / 2),
  };
}
