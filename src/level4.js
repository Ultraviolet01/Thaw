// Stage 4, The Lake: the darkest point before the warmth.
// Thin ice, a whiteout and an ice storm, no lantern anywhere, and the stage's choice: spend most of your warmth to
// free the ferryman and the old storyteller, frozen together out on the ice, or cross alone and keep it.

function ground(x) {
  // A shore at each end; between them the lake lies almost flat.
  const ice = 604 + Math.sin(x * 0.0021) * 3;
  if (x < 650) return 584 + (ice - 584) * Math.max(0, Math.min(1, (x - 300) / 350)) + Math.sin(x * 0.01) * 3;
  if (x > 7650) return ice - Math.min(1, (x - 7650) / 400) * 30 + Math.sin(x * 0.01) * 3;
  return ice;
}

export const level4 = {
  name: 'The Lake',
  width: 8300,
  spawn: { x: 180, y: 470 },
  // How far the night has turned toward dawn: a little more warmth low in the sky with every stage.
  dawn: 0.32,
  ground,
  // The darkest stage: only her coal, her companions' pots and lucky embers light it.
  dark: true,
  lake: { x0: 600, x1: 7700 },
  camp: { x: 70 },
  objects: [
    // Frozen together on a patch of thick ice in the middle of the lake. Old, deep ice: many pulses each.
    { type: 'wanderer', x: 5200, pulses: 10, home: 'ferryman' },
    { type: 'wanderer', x: 5300, pulses: 10, home: 'storyteller' },
  ],
  // Thin ice: stop or pulse on it and it breaks. Between the patches the ice is thick and safe.
  thinIce: [
    [1000, 1100], [1500, 1640], [1800, 1900], [2050, 2230], [2400, 2500],
    [2900, 3020], [3300, 3460], [3750, 3850],
    [4600, 4720], [5600, 5720], [6700, 6800],
  ],
  // A whiteout over the middle of the lake: almost nothing can be seen, the cracks least of all.
  whiteouts: [{ x0: 2700, x1: 4200 }],
  // An ice storm: freezing rain makes the ice slippery and every thaw slower.
  storms: [{ x0: 4400, x1: 6200 }],
  mist: [],
  fire: { x: 8000 },
  hints: [
    { x: 880, text: 'never stop on thin ice', until: 'fellIn' },
    { x: 2620, text: 'listen to the ice', until: 'whitedOut' },
    { x: 5250, text: 'the ferryman and the storyteller, frozen together' },
  ],
  // The group is this stage's choice.
  forks: {
    lake: {
      both: 'You freed the ferryman and the storyteller.',
      one: 'You freed one of them, and left the other on the ice.',
      none: 'You crossed the lake alone.',
    },
  },
  carries: {},
  maxEmbers: 3,
  closingLine: 'The far shore. Something warm is close now.',
};
