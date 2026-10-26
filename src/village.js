// The village from the prologue. Everyone the child can find on the way has a home here.
// The stage end shows the row of homes: lit for those she saved, dark for those she lost or left,
// and faint for the ones she has not reached yet. The ending will return here.

export const VILLAGE = [
  { id: 'weaver', name: 'the weaver' },
  { id: 'baker', name: 'the baker' },
  { id: 'smith', name: 'the smith' },
  { id: 'shepherd', name: 'the shepherd' },
  { id: 'miller', name: 'the miller' },
  { id: 'ferryman', name: 'the ferryman' },
  { id: 'storyteller', name: 'the old storyteller' },
];

export function villagerName(id) {
  const v = VILLAGE.find((h) => h.id === id);
  return v ? v.name : 'someone';
}
