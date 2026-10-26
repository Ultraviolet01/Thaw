# Thaw

A slow, atmospheric survival game for thatgamejam #02. A small ember crosses a frozen world, thaws (melts) what it finds and gathers companions until the whole world warms.

## Play

- Serve the folder over HTTP (the game uses ES modules, so opening `index.html` straight from disk will not work):
  - `python3 -m http.server 8000`, then open http://localhost:8000
- On itch.io: zip the folder contents with `index.html` at the root and upload as an HTML game.

## Controls

- Move: Arrow keys, WASD or left stick
- Pulse: hold Space or A (you cannot move while pulsing)
- Pause: Esc, P or Start
- Mute: M
- Restart: R

## What is in this build (Stage 1, The Still)

- Warmth as HP, shown by the warmth bar (top left) and by the ember's glow
  - Amber when full, fades to frost blue, pulses with the heartbeat below 35%
- Low warmth: frost from the edges below 60%, grey and blur below 35%, heavy blur and near silence below 15%, lights out at 0%
- Lights out: wake at the last checkpoint with full warmth; thawed things and companions stay
- Pulse: one ring per heartbeat (60 BPM), each costs warmth; objects crack, glow, then melt
- Thawing spreads color out from that object and adds one layer to the music
- Frozen lantern: thaw it for a warm zone that heals, or save warmth for the path
- Frozen mist: drains warmth while inside
- First wanderer: thaw it and it follows you, slowly restores warmth and widens your pulse
- Shimmer cue: faint motes drift toward the nearest frozen thing, matching its hum, so the game works with sound off
- Fire at the end: full warmth, checkpoint, closing line

## Code layout

- `src/main.js`: boot and frame loop
- `src/game.js`: game state, warmth, pulse, thawing, companions, lights out
- `src/render.js`: Canvas drawing, warmth effects, warmth bar, screens
- `src/audio.js`: synthesized audio (heartbeat, wind, hums, music layers)
- `src/input.js`: keyboard and gamepad
- `src/level1.js`: Stage 1 layout
- `src/config.js`: tuning numbers
- `src/terrain.js`: ground shape and object bounds

## Tuning

- All balance numbers live in `src/config.js`
- In the browser console, `thaw` is the live game object (for example `thaw.ember.warmth = 20`)
