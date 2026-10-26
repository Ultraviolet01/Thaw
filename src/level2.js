// Stage 2, The Wind: exposed open plains.
// Teaches reading the wind's rhythm, sheltering behind rocks, and the first fall through a snow bridge.
// The key choice: cross the ridge fast in the wind, or take the long, dark way through the ice cave below it.

const smooth = (a, b, x) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

// Where the path splits: the ridge climbs up, the gully drops down into a cave beneath it. They meet again at X1.
const X0 = 3300;
const X1 = 5700;

function base(x) {
  return 592 + Math.sin(x * 0.0012) * 20 + Math.sin(x * 0.0047 + 0.5) * 9 + Math.sin(x * 0.017 + 2) * 3;
}

// 0 outside the split, rising to 1 a little way in, falling back to 0 at the far end.
const inSplit = (x, ramp) => smooth(X0, X0 + ramp, x) * (1 - smooth(X1 - ramp, X1, x));

const ridge = (x) => base(x) - 130 * inSplit(x, 280) + Math.sin(x * 0.009) * 5 * inSplit(x, 280);
const gully = (x) => base(x) + 85 * inSplit(x, 300) + Math.sin(x * 0.006 + 1) * 6 * inSplit(x, 300);
// The underside of the ridge: a thin ledge over the cave mouths, thicker in the middle.
const ceiling = (x) => ridge(x) + 18 + 42 * inSplit(x, 520);

export const level2 = {
  name: 'The Wind',
  width: 7800,
  spawn: { x: 180, y: 470 },
  ground: ridge,
  lower: { x0: X0, x1: X1, floor: gully, ceiling },
  // What is left of the first stage's fire, where she wakes.
  camp: { x: 70 },
  // The cairn marks the split: press down there for the gully.
  cairn: { x: X0 - 70 },
  objects: [
    { type: 'tree', x: 2080, pulses: 3 },
    // A lantern to rest by before the split, warmed from behind the rock beside it.
    { type: 'lantern', x: 3060, pulses: 4, radius: 230 },
    // Down in the cave: the smith. The companion is on the slow way.
    { type: 'wanderer', x: 4700, pulses: 6, home: 'smith', low: true },
    // Out in the open where the routes meet: warming the shepherd means standing in the wind, or behind the rock.
    { type: 'wanderer', x: 6050, pulses: 6, home: 'shepherd' },
  ],
  // Rocks to hide behind. The wind blows from the right, so the shelter is on their left.
  rocks: [1150, 1700, 2250, 2800, 3180, 6230],
  wind: [
    { x0: 900, x1: X0, k: 1 },
    // The ridge: stronger, and nowhere to hide. The cave below is out of the wind.
    { x0: X0, x1: X1, k: 1.4, ridge: true },
    { x0: X1, x1: 6700, k: 1 },
  ],
  // A snow bridge on the ridge over the cave. Stop or pulse on it and it gives way.
  crevasse: { x0: 4350, x1: 4480 },
  mist: [],
  fire: { x: 7450 },
  hints: [
    { x: 650, text: 'the wind comes in waves', until: 'gusted' },
    { x: 1150, text: 'hide behind the rocks', after: 'gusted', until: 'sheltered' },
    { x: X0 - 120, text: 'down for the long way, under the ice', until: 'routeChosen' },
    { x: 4700, text: 'the smith is frozen here', low: true },
    { x: 6050, text: 'the shepherd is frozen here' },
  ],
  // The route is this stage's fork. Falling through the bridge counts as its own way.
  forks: {
    wind: { ridge: 'You crossed the ridge in the wind.', gully: 'You took the long way, under the ice.', fell: 'The snow gave way, and the ice took you in.' },
  },
  carries: {},
  maxEmbers: 2,
  closingLine: 'The wind has dropped, for now.',
};
