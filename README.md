# Thaw

A slow, atmospheric survival game for thatgamejam #02. A child carries her village's last coal across a frozen world, thaws (melts) what she finds and gathers companions until the whole world warms.

## Controls

- Walk: Left and Right arrows, A and D, or left stick
- Pulse: hold Space or A (you cannot move while pulsing)
- Pause: Esc, P or Start
- Mute: M
- Restart: R
- Full screen: F, or the button in the top-right corner

## Prologue: "The last coal"

- Plays after "press any key" (browsers only allow sound after a key press); Esc skips it
- 60 seconds, the length of the jam's theme track, with its moments on the track's shape
- A village on a warm evening: houses with lit windows and smoking chimneys, one shared hearth in the square, villagers carrying coals home in clay pots, a child taking hers and setting off
- The cold comes: snow on the roofs, the hearth dies, the villagers by the fire freeze, the windows go dark one by one, frost creeps in from the edges
- Three lines: "every night, the village shared one fire" (written in light), "then the cold came, and every hearth went out" and "except the coal she carried" (written into the frost)
- Out of the dark, the child rises from the snow in Stage 1, blows on her coal, its first pulse melts the first patch of frost, and "thaw" is written in the frost. No cut, no menu: the first key press just walks
- Music: thatgamejam #02 theme by Jason Grace, played unmodified from `audio/thatgamejam02_theme.wav`

## The character

- A child bundled against the cold: quilted coat with a fur hem, fur-trimmed hood, a knitted striped scarf, mittens and boots
- She carries the village's last coal in a small clay pot, held in both hands. The coal's glow is her warmth
- Pulsing: she lifts the pot to her face and blows on the coal
- The coat and the short scarf end move as cloth, swinging with each step and the wind
- Frozen villagers have no pot (their fire went out) and hug themselves against the cold
- When one is thawed, a spark carries fire from her pot to a pot of their own, and they walk with her
- Companions do not warm her. Their fire joins her pulse instead: each companion adds to every pulse, so thawing takes fewer pulses

## Art direction: frosted glass

- The whole world sits behind frost, like a window in winter
- The ember's warmth melts a clear patch around it; the patch shrinks as warmth drops
- Thawed things leave permanent clear patches, with meltwater running down from them
- Each pulse sweeps a ring of clarity through the frost, which closes back over
- Hints, the title and closing lines are written into the frost, like a finger on a cold window
- Frozen things show only as blurred shapes and faint glints through the frost
- Depth: four snowy ridges with forests along their crests, the play layer, and drifts and branches in the foreground
- Snow is the brightest thing on screen, so figures and trees read as dark shapes against it
- Rocks and dry grass poke through the snow
- Film grain on top so the picture never looks too clean
- Fonts: Reenie Beanie (handwriting) and Spectral (small text), both from Google Fonts under the Open Font License

## What is in this build (Stage 1, The Still)

- Warmth as HP, shown by the warmth bar (top left) and by the ember's glow
  - Amber when full, fades to frost blue, pulses with the heartbeat below 35%
- Low warmth: frost from the edges below 60%, grey and blur below 35%, heavy blur and near silence below 15%, lights out at 0%
- Lights out: wake at the last checkpoint with full warmth; thawed things and companions stay
- Pulse: one ring per heartbeat (60 BPM), each costs warmth; objects crack, glow, then melt
- Thawing spreads color out from that object and adds one layer to the music
- The fork: the lantern and a frozen wanderer stand just before the mist, and the frost asks "the light, or the one beside it?"
  - Warm one and the cold takes the other: its frost thickens and the frost writes what was lost
  - The light lets you rest to full before the mist; the wanderer walks with you and counts toward the ending
  - The stage end says what you chose
- Frozen mist: drains warmth while inside
- Wanderers: thaw one and they walk with you, their fire joining your pulse
- Shimmer cue: faint motes drift toward the nearest frozen thing, matching its hum, so the game works with sound off
- Choices that last: the game keeps a record of who you saved, who you lost and what you chose, carried from stage to stage
  - Every villager has a name and a home in the prologue's village; the stage end shows the row of homes, lit for those saved, dark for those lost or left, faint for those not reached yet
  - Each fork gives something for the next stage: the light gives a flame for the dark ahead; the weaver knows the way through the wind
  - If your coal stays below 6% for 4 seconds, the last companion to join loses their fire and freezes where they stand ("the weaver's fire went out"); warming them again takes 8 pulses
  - The ending (not built yet) returns to the village and lights the windows of everyone saved
- Lucky embers: now and then a warm coal turns up in the snow ahead (better odds when cold). Walk over it for +15% warmth; it cools and fades after about 25 seconds
- Fire at the end: full warmth, checkpoint, closing line

## Code layout

- `src/main.js`: boot and frame loop
- `src/prologue.js`: the prologue's timeline, village, people, flowers and lines
- `src/village.js`: the villagers' homes and names, shown at each stage end
- `src/game.js`: game state, warmth, pulse, thawing, companions, lights out
- `src/render.js`: Canvas drawing, the frost layer and melt mask, warmth effects, warmth bar, screens
- `src/audio.js`: synthesized audio (heartbeat, wind, hums, music layers)
- `src/character.js`: the bundled villagers (coat, hood, scarf, mittens, ember pot), used for the player, companions and the prologue
- `src/input.js`: keyboard and gamepad
- `src/level1.js`: Stage 1 layout
- `src/config.js`: tuning numbers
- `src/terrain.js`: ground shape and object bounds

## Tuning

- All balance numbers live in `src/config.js`
- In the browser console, `thaw` is the live game object (for example `thaw.ember.warmth = 20`)
