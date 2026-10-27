// The village from the prologue. Everyone the child can find on the way has a home here.
// The stage end shows the row of homes: lit for those she saved, dark for those she lost or left,
// and faint for the ones she has not reached yet. The ending will return here.

// wake: what they say as the ice lets them go, written in the frost. voice: the pitch of the note they wake with.
export const VILLAGE = [
  { id: 'weaver', name: 'the weaver', wake: 'i heard you coming. the wind talks, if you listen', voice: 1.0 },
  { id: 'baker', name: 'the baker', wake: 'your hands are so small. walk with me', voice: 0.84 },
  { id: 'smith', name: 'the smith', wake: 'i was dreaming of my forge', voice: 0.75 },
  { id: 'shepherd', name: 'the shepherd', wake: 'the slopes are restless. stay close to me', voice: 1.12 },
  { id: 'miller', name: 'the miller', wake: 'i know the weight of ice. i will tell you where it is thin', voice: 0.89 },
  { id: 'ferryman', name: 'the ferryman', wake: 'i have crossed this lake a thousand times', voice: 0.7 },
  { id: 'storyteller', name: 'the old storyteller', wake: 'so this is how the story goes on', voice: 0.94 },
];

export function villager(id) {
  return VILLAGE.find((h) => h.id === id);
}

export function villagerName(id) {
  const v = VILLAGE.find((h) => h.id === id);
  return v ? v.name : 'someone';
}
