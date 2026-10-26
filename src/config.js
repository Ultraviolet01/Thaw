// Logical view size. The canvas scales this to fit the window.
export const VIEW_W = 1280;
export const VIEW_H = 720;

// 60 BPM at normal warmth. The heart slows below the blur threshold.
export const BEAT_SECONDS = 1;
export const SLOW_BEAT_EXTRA = 0.7;

export const WARMTH = {
  max: 100,
  drainPerSecond: 0.9,
  pulseCost: 2,
  mistDrainPerSecond: 3.5,
  lanternHealPerSecond: 6,
  fireHealPerSecond: 40,
  fireRadius: 320,
  // More than the cold drains, so walking with a companion slowly warms you.
  companionRegenPerSecond: 1.2,
  companionRange: 220,
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
