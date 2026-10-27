// Stage 1, The Still: silent, dark, alone.
// Teaches movement, pulsing, warmth drain, the lights-out sequence and the first companion.
export const level1 = {
  name: 'The Still',
  width: 4600,
  spawn: { x: 160, y: 470 },
  // The far landmark that marks this stage.
  landmark: 'moon',
  objects: [
    { type: 'tree', x: 720, pulses: 3 },
    // The fork: warm the light (safety now) or the wanderer beside it (connection later). Only one.
    { type: 'lantern', x: 1300, pulses: 4, radius: 230, fork: 'still' },
    // Far enough from the lantern that no single spot reaches both.
    { type: 'wanderer', x: 1780, pulses: 6, fork: 'still', home: 'weaver' },
    { type: 'wanderer', x: 3300, pulses: 6, home: 'baker' },
    { type: 'tree', x: 3700, pulses: 3 },
  ],
  // Frozen mist saps warmth while the figure is inside it. It starts past the fork,
  // and is long enough that crossing it with nothing leaves almost nothing. Then a calm stretch before the wanderer.
  mist: [{ x0: 1980, x1: 2880 }],
  fire: { x: 4200 },
  hints: [
    { x: 300, text: 'arrows to walk', until: 'moved' },
    { x: 650, text: 'hold space to pulse', until: 'pulsed' },
    { x: 980, text: 'every pulse costs warmth', after: 'pulsed' },
    { x: 1540, text: 'the light, or the one beside it?', until: 'forkChosen' },
    // Shown once the lantern is lit, until the player has warmed up beside it.
    { x: 1300, text: 'rest by the light', after: 'lanternLit', until: 'rested' },
    // What the cold took, written where it happened.
    { x: 1300, text: 'the light stays dark', after: 'lostLantern' },
    { x: 1780, text: 'the weaver stayed frozen', after: 'lostWanderer' },
    { x: 3020, text: 'pulse in time with her heart', after: 'pulsed', until: 'inTime' },
    { x: 3200, text: 'the baker is frozen here' },
  ],
  // What the stage end says about the fork.
  forks: {
    still: { lantern: 'You warmed the light.', wanderer: 'You warmed the weaver instead of the light.' },
  },
  // What each choice gives you to take into the next stage.
  carries: {
    still: {
      lantern: { id: 'flame', text: 'You carry a flame from the lantern. It will light the dark ahead.' },
      wanderer: { id: 'guide', text: 'The weaver knows the way through the wind.' },
    },
  },
  // Only one lucky ember can turn up in the opening stage.
  maxEmbers: 1,
  closingLine: 'Somewhere ahead, something is still warm.',
};
