// Stage 1, The Still: silent, dark, alone.
// Teaches movement, pulsing, warmth drain, the lights-out sequence and the first companion.
export const level1 = {
  name: 'The Still',
  width: 4400,
  spawn: { x: 160, y: 470 },
  objects: [
    { type: 'tree', x: 720, pulses: 3 },
    { type: 'lantern', x: 1350, pulses: 4, radius: 230 },
    { type: 'wanderer', x: 2850, pulses: 6 },
    { type: 'tree', x: 3300, pulses: 3 },
  ],
  // Frozen mist saps warmth while the ember is inside it.
  mist: [{ x0: 1750, x1: 2450 }],
  fire: { x: 4050 },
  hints: [
    { x: 300, text: 'Arrows or WASD to drift', until: 'moved' },
    { x: 650, text: 'Hold Space to pulse your warmth', until: 'pulsed' },
    { x: 1300, text: 'Every pulse costs warmth. Choose what to thaw.' },
    { x: 2750, text: 'Something is frozen here.' },
  ],
  closingLine: 'Somewhere ahead, something is still warm.',
};
