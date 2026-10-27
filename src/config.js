// Logical view size. The canvas scales this to fit the window.
// The view is always 720 high. Its width follows the screen's shape: 16:10 at least, up to 21:9 for wide screens,
// so the game fills the screen instead of sitting between black bars. It is an object so every module sees resizes.
export const VIEW = { w: 1280 };
export const VIEW_MIN_W = 1152;
export const VIEW_MAX_W = 1720;
export const VIEW_H = 720;

// 60 BPM at normal warmth. The heart slows below the blur threshold.
export const BEAT_SECONDS = 1;
export const SLOW_BEAT_EXTRA = 0.7;

export const WARMTH = {
  max: 100,
  drainPerSecond: 0.75,
  pulseCost: 2,
  mistDrainPerSecond: 2.2,
  lanternHealPerSecond: 6,
  // A tree once thawed gives off a little warmth: a small resting spot, about half a lantern.
  treeHealPerSecond: 3,
  treeRadius: 170,
  fireHealPerSecond: 40,
  fireRadius: 320,
  // Below this warmth for relapseAfter seconds, the last companion's fire goes out and they freeze again.
  relapseBelow: 6,
  relapseAfter: 4,
  // Warming them again takes more than the first time.
  relapsePulses: 8,
};

// The player figure: walks on the snow, no jumping.
export const EMBER = {
  accel: 520,
  maxSpeed: 92,
  damping: 4.5,
  pulseDamping: 12,
};

export const PULSE = {
  baseRadius: 150,
  perCompanion: 45,
  ringSeconds: 1.1,
};

// Warmth bands from the design doc.
export const THRESHOLDS = { frost: 60, blur: 35, heavy: 15 };

export const MELT_SECONDS = 1.6;
export const SPREAD_SECONDS = 3;

// Lucky embers: now and then a warm coal turns up in the snow ahead. Walk over it for a little warmth.
export const EMBERS = {
  rollEvery: [12, 20], // seconds between chances
  chance: 0.45, // odds on each roll
  coldChance: 0.75, // odds when warmth is below coldBelow
  coldBelow: 40,
  ahead: [500, 900], // how far ahead of the player it appears
  warmth: 15,
  life: 25, // seconds before it cools and fades
  pickupRange: 30,
  // The most that can ever appear in one stage, picked up or not. A stage can set its own with maxEmbers.
  maxPerStage: 2,
};

// Katabatic wind: calm, a warning (snow streaks sideways and the howl rises), then a gust that pushes her back,
// drains warmth and breaks a pulse. Behind a rock she is out of it. It blows from the right.
export const WIND = {
  calm: [6, 9], // seconds between gusts
  warn: 3, // seconds of warning before a gust
  guideWarn: 5.5, // with the weaver walking with her, the warning comes this early
  gust: 4.5,
  push: 300, // how hard a gust pushes her back, at strength 1
  braced: 0.08, // standing still, she braces: the push is cut to this fraction (she still loses warmth)
  gustDrain: 1.3, // extra warmth lost per second in a full gust, at strength 1
  leeBehind: 95, // shelter reaches this far to the left of a rock
  leeAhead: 8,
};

// The ice cave under the ridge: out of the wind, but dark and slowly cold, and slower going.
export const CAVE = {
  chill: 0.6, // extra warmth lost per second in the cave, unless she carries the lantern's flame
  speed: 0.75,
};

// A snow bridge over a crevasse on the ridge gives way if she stops or pulses on it.
export const CREVASSE = {
  standTime: 1.0, // seconds of standing (or being held back by the wind) before it gives way
  slowSpeed: 35, // slower than this counts as standing
  pulseStress: 0.6, // a pulse on the bridge counts as this many seconds of standing
  fallSeconds: 0.7,
  fallWarmth: 5, // the landing knocks her coal low
};

// Avalanches: a rumble and small slides first, then the snow comes down the chute and across the path.
export const AVALANCHE = {
  rumble: 4, // seconds of warning
  shepherdRumble: 6, // with the shepherd walking with her, the warning comes this early
  slide: 2.6,
  hit: [0.9, 1.9], // when, in the slide, the snow is across the path
  buryPulses: 6, // how much melting it takes to dig herself out: 6 pulses alone
  companionDig: 0.3, // each companion adds this much to every pulse while she is buried
  smithDig: 1.4, // the smith makes each pulse dig this much further
  maxDig: 2, // never more than this per pulse, so it always takes at least 3 pulses
  buriedChill: 0.8, // extra warmth lost per second while buried
  millerLoss: 4, // a new slide over the miller undoes this much digging
};

// Frost quakes: the ground shakes, then the icicles over the cliff path fall where their shadows show.
export const QUAKE = {
  tremor: 1.6,
  fall: 0.45,
  regrow: 5,
  hitRange: 26,
  hitWarmth: 8,
  stun: 0.6,
};

// The lake in Stage 4.
export const LAKE = {
  thinStand: 0.8, // seconds of standing on thin ice before it breaks
  thinSlow: 30, // slower than this counts as standing
  fallWarmth: 25, // the freezing water takes this much warmth
  climbBack: 70, // she climbs out this far back, on the side she came from
  climbStun: 1.2,
  openFor: 6, // seconds the broken ice stays open before it skins over again
  whiteoutRise: 2.5, // seconds for the whiteout to close in
  stormSlip: 1.3, // her stopping grip on the storm's glazed ice (normal ground is 4.5)
  stormDrain: 0.4,
  chill: 0.2, // the open lake at night: extra warmth lost per second anywhere on the ice
  stormThaw: 0.6, // pulses thaw this much in the freezing rain
};
