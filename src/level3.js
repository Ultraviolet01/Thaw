// Stage 3, The Slopes: mountains, rumbling, unstable.
// Teaches reacting to warnings and what a rescue costs: avalanches down the slopes, frost quakes on the cliffs,
// and the miller, buried by an avalanche beside the path.

function ground(x) {
  return 588
    + Math.sin(x * 0.0011 + 0.6) * 42
    + Math.sin(x * 0.0037 + 1) * 15
    + Math.sin(x * 0.012 + 0.3) * 4;
}

export const level3 = {
  name: 'The Slopes',
  width: 8000,
  spawn: { x: 180, y: 470 },
  ground,
  // What is left of the last stage's fire, where she sets off.
  camp: { x: 70 },
  objects: [
    { type: 'tree', x: 1400, pulses: 3 },
    // A lantern to rest by before the miller.
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
