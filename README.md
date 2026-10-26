# Thaw

A slow, atmospheric survival game for thatgamejam #02. A small ember crosses a frozen world, thaws (melts) what it finds and gathers companions until the whole world warms.

## Controls

- Walk: Left and Right arrows, A and D, or left stick
- Pulse: hold Space or A (you cannot move while pulsing)
- Pause: Esc, P or Start
- Mute: M
- Restart: R

## Prologue: "The last fire"

- Plays after "press any key" (browsers only allow sound after a key press); Esc skips it
- 60 seconds, the length of the jam's theme track, with its moments on the track's shape
- The world before the cold: warm evening light, the great tree, people gathered with embers in their chests, small cold-country flowers
- The cold comes: color drains, frost creeps in from the edges, the fires go out one by one, the tree goes dark
- Three lines: "everyone used to carry a little fire" (written in light), "then the cold came" and "except one" (written into the frost)
- One glow is left. Out of the dark, the figure rises from the snow in Stage 1, its first pulse melts the first patch of frost, and "thaw" is written in the frost. No cut, no menu: the first key press just walks
- Music: thatgamejam #02 theme by Jason Grace, played unmodified from `audio/thatgamejam02_theme.wav`

## The character

- A small hooded figure walking through the snow, with an ember glowing in the chest
- The ember is the warmth: it dims as warmth drops and pulses with the heartbeat
- The cloak moves as cloth, swinging with each step and the wind
- Frozen wanderers are hooded figures too; once thawed they walk with you

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
- First wanderer: thaw it and it follows you, slowly restores warmth and widens your pulse
- Shimmer cue: faint motes drift toward the nearest frozen thing, matching its hum, so the game works with sound off
- Lucky embers: now and then a warm coal turns up in the snow ahead (better odds when cold). Walk over it for +15% warmth; it cools and fades after about 25 seconds
- Fire at the end: full warmth, checkpoint, closing line

## Code layout

- `src/main.js`: boot and frame loop
- `src/prologue.js`: the prologue's timeline, people, flowers and lines
- `src/game.js`: game state, warmth, pulse, thawing, companions, lights out
- `src/render.js`: Canvas drawing, the frost layer and melt mask, warmth effects, warmth bar, screens
- `src/audio.js`: synthesized audio (heartbeat, wind, hums, music layers)
- `src/character.js`: the hooded figure and its cloth cloak, used for the player and companions
- `src/input.js`: keyboard and gamepad
- `src/level1.js`: Stage 1 layout
- `src/config.js`: tuning numbers
- `src/terrain.js`: ground shape and object bounds

## Tuning

- All balance numbers live in `src/config.js`
- In the browser console, `thaw` is the live game object (for example `thaw.ember.warmth = 20`)
