// Stage 3, The Slopes: mountains, rumbling, unstable.
// Teaches reacting to warnings and what a rescue costs: avalanches down the slopes, frost quakes on the cliffs,
// and the miller, buried by an avalanche beside the path.

// The path climbs: up from the foothills in steep pitches with flat landings between them, along the cliff,
// to a high point where the lantern stands, then down past the miller to the fire.
const PATH = [
  [0, 648], [500, 642], [760, 600], [1000, 590], [1250, 548], [1700, 538], [2300, 518],
  [2520, 466], [2700, 458], [2880, 424], [3900, 402], [4120, 352], [4400, 330], [4650, 336],
  [4950, 380], [5800, 452], [6250, 520], [6600, 552], [7000, 610], [8000, 640],
];

function ground(x) {
  let i = 0;
  while (i < PATH.length - 2 && x > PATH[i + 1][0]) i++;
  const [x0, y0] = PATH[i];
  const [x1, y1] = PATH[i + 1];
  const k = Math.max(0, Math.min(1, (x - x0) / (x1 - x0)));
  const eased = k * k * (3 - 2 * k);
  return y0 + (y1 - y0) * eased + Math.sin(x * 0.012 + 0.3) * 4 + Math.sin(x * 0.0041 + 1) * 6;
}

export const level3 = {
  name: 'The Slopes',
  width: 8000,
  spawn: { x: 180, y: 470 },
  // How far the night has turned toward dawn: a little more warmth low in the sky with every stage.
  dawn: 0.25,
  ground,
  // The far hills sink as she climbs, so the height can be felt.
  altitude: true,
  // What is left of the last stage's fire, where she sets off.
  camp: { x: 70 },
  objects: [
    { type: 'tree', x: 1400, pulses: 3 },
    // A lantern at the top of the climb, to rest by before the way down to the miller.
    { type: 'lantern', x: 4400, pulses: 4, radius: 230 },
    // Buried by an avalanche beside the path. Digging them out takes many pulses.
    { type: 'wanderer', x: 5330, pulses: 14, home: 'miller', buried: true },
  ],
  // Far off on the mountain, a slide of snow that cannot reach her: the warning signs, seen once in safety.
  distantSlide: { at: 600, x: 1250 },
  // Avalanche runs: a chute down the mountainside crossing the path. Under the overhang she is safe.
  // active: the stretch of path where the slope above can let go. first: seconds after she arrives before it does.
  avalanches: [
    { x0: 1750, x1: 2300, overhang: { x0: 1960, x1: 2090 }, active: [1350, 2550], first: 3, every: [11, 15] },
    // The miller's slope: it lets go again while she digs.
    { x0: 5020, x1: 5720, overhang: { x0: 5520, x1: 5650 }, active: [4800, 5950], first: 12, every: [14, 18] },
  ],
  // Frost quakes on the cliff path: the ground shakes, then the icicles above it fall where their shadows show.
  quakes: [{ x0: 2900, x1: 3900, icicles: [3050, 3200, 3330, 3480, 3620, 3760], every: [6, 9] }],
  mist: [],
  fire: { x: 7600 },
  hints: [
    { x: 700, text: 'the mountain is waking', until: 'avalanched' },
    { x: 1750, text: 'when it rumbles, get under the rock', until: 'avalanched' },
    { x: 2950, text: 'when the ground shakes, step out from under the ice', until: 'quaked' },
    { x: 5330, text: 'the miller is under the snow' },
  ],
  // The miller is this stage's choice: dig them out, or keep moving.
  forks: {
    slopes: { dug: 'You dug the miller out of the snow.', left: 'You left the miller under the snow.' },
  },
  carries: {},
  maxEmbers: 3,
  closingLine: 'The mountain is quiet again.',
};
