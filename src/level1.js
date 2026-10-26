// Stage 1, The Still: silent, dark, alone.
// Teaches movement, pulsing, warmth drain, the lights-out sequence and the first companion.
export const level1 = {
  name: 'The Still',
  width: 4400,
  spawn: { x: 160, y: 470 },
  objects: [
    { type: 'tree', x: 720, pulses: 3 },
    { type: 'lantern', x: 1350, pulses: 4, radius: 230 },
    { type: 'wanderer', x: 3150, pulses: 6 },
    { type: 'tree', x: 3550, pulses: 3 },
  ],
  // Frozen mist saps warmth while the figure is inside it. It starts just past the lantern's light,
  // and is long enough that crossing it cold leaves almost nothing. Then a calm stretch before the wanderer.
  mist: [{ x0: 1650, x1: 2600 }],
  fire: { x: 4050 },
  hints: [
    { x: 300, text: 'arrows to walk', until: 'moved' },
    { x: 650, text: 'hold space to pulse', until: 'pulsed' },
    { x: 1300, text: 'every pulse costs warmth', until: 'lanternLit' },
    // Shown once the lantern is lit, until the player has warmed up beside it.
    { x: 1350, text: 'rest by the light', after: 'lanternLit', until: 'rested' },
    { x: 3050, text: 'someone is frozen here' },
  ],
  closingLine: 'Somewhere ahead, something is still warm.',
};
