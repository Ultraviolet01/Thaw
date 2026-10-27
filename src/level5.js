// Stage 5, Home: the finale, and the hardest stage. The village from the prologue, at the end of the walk.
// Her coal is failing: it never burns past 70% again. Every hazard of the walk comes back on the way in: the wind on
// the road, an avalanche and a frost quake on the pass above the village, thin ice and a whiteout on the millpond,
// and an ice storm in the street, with icicles falling from the eaves. Everyone she saved goes home and lights their
// window; the homes of those she lost stay dark. In the square, the shared hearth that went out in the prologue:
// lighting it ends the walk.

// The way home: the road, the climb over the pass, down to the millpond (flat), then the street and the square.
const PATH = [
  [0, 596], [800, 592], [1600, 588], [2400, 594], [3000, 590],
  [3250, 556], [3500, 548], [3950, 512], [4200, 478], [4950, 466], [5200, 458],
  [5450, 520], [5650, 604], [6950, 604],
  [7150, 592], [9300, 590], [10300, 592],
];
const POND = { x0: 5650, x1: 6950 };

function ground(x) {
  let i = 0;
  while (i < PATH.length - 2 && x > PATH[i + 1][0]) i++;
  const [x0, y0] = PATH[i];
  const [x1, y1] = PATH[i + 1];
  const k = Math.max(0, Math.min(1, (x - x0) / (x1 - x0)));
  const eased = k * k * (3 - 2 * k);
  // The pond lies flat; everywhere else the ground is a little uneven.
  const rough = x > POND.x0 && x < POND.x1 ? 0 : Math.sin(x * 0.012 + 0.3) * 3 + Math.sin(x * 0.0041 + 1) * 5;
  return y0 + (y1 - y0) * eased + rough;
}

// The street: one home for each villager, in the order they are met on the walk.
const HOMES = [
  { id: 'weaver', x: 7300, w: 112, h: 76 },
  { id: 'baker', x: 7580, w: 104, h: 72 },
  { id: 'smith', x: 7860, w: 118, h: 80 },
  { id: 'shepherd', x: 8140, w: 100, h: 70 },
  { id: 'miller', x: 8420, w: 116, h: 82 },
  { id: 'ferryman', x: 8700, w: 104, h: 74 },
  { id: 'storyteller', x: 8980, w: 110, h: 78 },
];

export const level5 = {
  name: 'Home',
  width: 10300,
  spawn: { x: 180, y: 470 },
  // How far the night has turned toward dawn: a little more warmth low in the sky with every stage.
  dawn: 0.5,
  // The far landmark that marks this stage.
  landmark: 'village',
  ground,
  altitude: true,
  camp: { x: 70 },
  // The coal is failing: nothing warms her past this again, not the lantern, not an ember.
  warmthCap: 70,
  homes: HOMES,
  objects: [
    { type: 'tree', x: 1650, pulses: 3 },
    // The only lantern, at the top of the pass: the last place to rest before the village.
    { type: 'lantern', x: 5150, pulses: 4, radius: 230 },
    // The village tree in the square, beside the hearth. Warmed, it keeps her going while she lights the fire,
    // and it is where she wakes if her light goes out in the square.
    { type: 'tree', x: 9380, pulses: 3, checkpoint: true },
    // The shared hearth that went out the night the cold came. Every companion's fire joins the pulse.
    { type: 'hearth', x: 9640, pulses: 30 },
  ],
  // The road: the wind is back, and the rocks are further apart than on the plains.
  rocks: [1200, 1800, 2450],
  wind: [
    { x0: 800, x1: 3000, k: 1.5 },
    // The square is open to the wind: a gust breaks the pulse at the hearth.
    { x0: 9200, x1: 10300, k: 1.25 },
  ],
  // The pass above the village: one avalanche run with a rock to shelter under, then the cliff path.
  avalanches: [
    { x0: 3300, x1: 3900, overhang: { x0: 3560, x1: 3690 }, active: [3000, 4150], first: 4, every: [10, 13] },
  ],
  quakes: [
    { x0: 4250, x1: 4900, icicles: [4330, 4460, 4590, 4720, 4850], every: [5, 8] },
    // In the street the icicles hang from the eaves of the homes. The doors and the gaps between homes are clear.
    { x0: 7200, x1: 9080, eaves: true, icicles: HOMES.flatMap((h) => [h.x - h.w / 2 - 6, h.x + h.w / 2 + 6]), every: [6, 9] },
  ],
  // The millpond: thin ice under a whiteout.
  lake: POND,
  thinIce: [[5780, 5900], [6000, 6130], [6230, 6330], [6450, 6590], [6700, 6800]],
  whiteouts: [{ x0: 5900, x1: 6650 }],
  // An ice storm over the street.
  storms: [{ x0: 7100, x1: 9100 }],
  mist: [],
  // The hearth is the stage's fire, but it is cold until she lights it.
  fire: { x: 9640, hearth: true },
  hints: [
    { x: 330, text: 'her coal is fading. it will not burn full again' },
    { x: 3150, text: 'the slope above the village is waking', until: 'avalanched' },
    { x: 5850, text: 'thin ice, and the snow coming down', until: 'fellIn' },
    { x: 7150, text: 'home' },
    { x: 9300, text: 'light the hearth' },
  ],
  forks: {},
  carries: {},
  maxEmbers: 3,
  // What the window shows at the end, by how many came home. Provisional until approved.
  endingLines: {
    everyone: 'every window in the village is lit again',
    most: 'most of the windows are lit again',
    few: 'a few windows are lit. it is enough to begin',
    alone: 'one fire, and one window. it is a start',
  },
  closingLine: 'Home.',
};
