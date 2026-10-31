// The village from the prologue. Everyone the child can find on the way has a home here.
// The stage end shows the row of homes: lit for those she saved, dark for those she lost or left,
// and faint for the ones she has not reached yet. The ending will return here.

// wake: what they say as the ice lets them go, written in the frost. voice: the pitch of the note they wake with.
// home: what they say at a stage's fire, about the home they are walking back to.
export const VILLAGE = [
  { id: 'weaver', name: 'the weaver', wake: 'i heard you coming. the wind talks, if you listen', voice: 1.0,
    home: 'there is a cloth on my loom, half woven. i will finish it for you' },
  { id: 'baker', name: 'the baker', wake: 'your hands are so small. walk with me, and you will not cool so fast', voice: 0.84,
    home: 'when we are home, i will bake for the whole street' },
  { id: 'smith', name: 'the smith', wake: 'i was dreaming of my forge', voice: 0.75,
    home: 'my forge will take three days to wake. i will sit with it' },
  { id: 'shepherd', name: 'the shepherd', wake: 'the slopes are restless. stay close to me', voice: 1.12,
    home: 'i hope the flock found the barn before the snow did' },
  { id: 'miller', name: 'the miller', wake: 'i know the weight of ice. i will tell you where it is thin', voice: 0.89,
    home: 'the mill wheel will be frozen solid. we will thaw it together' },
  { id: 'ferryman', name: 'the ferryman', wake: 'i have crossed this lake a thousand times. walk where i walk, and you will not slip', voice: 0.7,
    home: 'from my door you can see the whole lake. it will be water again' },
  { id: 'storyteller', name: 'the old storyteller', wake: 'so this is how the story goes on. while i walk with you, no one else goes cold', voice: 0.94,
    home: 'i have a new story now. it is about a child and a coal' },
];

export function villager(id) {
  return VILLAGE.find((h) => h.id === id);
}

export function villagerName(id) {
  const v = VILLAGE.find((h) => h.id === id);
  return v ? v.name : 'someone';
}
