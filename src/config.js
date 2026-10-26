// Logical view size. The canvas scales this to fit the window.
export const VIEW_W = 1280;
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
  fireHealPerSecond: 40,
  fireRadius: 320,
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
