// Height of the snow line at world x. Lower y is higher on screen.
export function groundY(x) {
  return 580
    + Math.sin(x * 0.0019) * 30
    + Math.sin(x * 0.0051 + 1.3) * 14
    + Math.sin(x * 0.013 + 0.4) * 5;
}

const SIZES = {
  tree: { w: 132, h: 170, dx: 0 },
  lantern: { w: 56, h: 130, dx: 8 },
  wanderer: { w: 50, h: 80, dx: 0 },
};

// World-space box around a frozen object, used for pulse reach and the ice shell.
export function objectBounds(o) {
  const s = SIZES[o.type];
  const base = groundY(o.x) + 6;
  const cx = o.x + s.dx;
  return {
    x0: cx - s.w / 2,
    x1: cx + s.w / 2,
    y0: base - s.h,
    y1: base,
    cx,
    cy: base - s.h / 2,
    reach: Math.max(s.w, s.h) / 2,
  };
}
