// The prologue, "The last fire": the world before the cold, the cold coming, and the one ember left.
// No menus and no cut into play: it ends in darkness, and the first stage rises out of it.
// It runs the length of the jam's theme track (60 s) and its moments sit on the track's shape:
// a quiet start, a slow build, a full swell, then a fade to silence.

export const PROLOGUE_LENGTH = 60;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, t) => {
  const k = clamp01((t - a) / (b - a));
  return k * k * (3 - 2 * k);
};

// The place by the great tree, before the cold. The same tree waits at the end of the game.
export const prologueGround = (x) => 600 + Math.sin(x * 0.0031) * 10 + Math.sin(x * 0.011 + 1) * 3;
export const TREE_X = 800;

// The people gathered round the tree. Each fire goes out in turn; the last figure is the player.
export const PEOPLE = [
  { x: 560, facing: 1, cloak: '#3b3230', fold: '#5d4d46', outAt: 23 },
  { x: 640, facing: 1, cloak: '#2f3a3a', fold: '#4b5c5c', outAt: 26.6 },
  { x: 705, facing: 1, cloak: '#3a3328', fold: '#5c5140', outAt: 30.2 },
  { x: 895, facing: -1, cloak: '#33302e', fold: '#504a46', outAt: 24.7 },
  { x: 962, facing: -1, cloak: '#2c3438', fold: '#465258', outAt: 28.4 },
  { x: 1042, facing: -1, cloak: '#3b3230', fold: '#5d4d46', outAt: 32 },
  { x: 1190, facing: -1, player: true },
];

// Small cold-country flowers in the grass. The frost takes them with everything else.
export const FLOWERS = [470, 515, 600, 676, 742, 858, 930, 1005, 1080, 1130, 1255].map((x, i) => ({ x, seed: i * 31 + 7, yellow: i % 3 === 0 }));

// The three lines. The first is written in warm light; the others are written into the frost.
export const LINES = [
  { text: 'everyone used to carry a little fire', write: [8, 11.5], fade: [17, 19.5], frost: false },
  { text: 'then the cold came', write: [36, 38.5], fade: [43.5, 45.5], frost: true },
  { text: 'except one', write: [51, 53], fade: [56, 57.8], frost: true },
];

export class Prologue {
  constructor() {
    this.t = 0;
    this.done = false;
    this.nextBeat = 0.5;
    this.beats = 0;
  }

  update(dt, audio) {
    this.t += dt;
    const t = this.t;
    // With the theme track playing, the heartbeat only frames it: in the dark before, and as it fades.
    // Without it, the heartbeat and the game's own music carry the whole prologue.
    const theme = audio.themePlaying();
    if (t >= this.nextBeat && t < PROLOGUE_LENGTH - 0.5) {
      if (!theme || t < 5 || t > 54) audio.heartbeat(100);
      if (!theme) audio.onBeat(++this.beats);
      this.nextBeat += 1 + 0.45 * this.cold();
    }
    audio.setWind(this.wind() * (theme ? 0.5 : 1));
    audio.setPrologueMusic(theme ? 0 : smooth(3, 9, t) * (1 - smooth(20, 30, t)));
    if (t >= PROLOGUE_LENGTH) this.done = true;
  }

  skip() {
    this.t = PROLOGUE_LENGTH;
    this.done = true;
  }

  // 0 = warm, 1 = frozen.
  cold() { return smooth(20, 44, this.t); }
  wind() { return 0.08 + 0.92 * smooth(20, 32, this.t) * (1 - 0.6 * smooth(46, 56, this.t)); }
  // How far the frost has grown in from the edges of the screen.
  frost() { return smooth(28, 47, this.t); }
  fire() { return 1 - smooth(21, 29, this.t); }
  tree() { return 1 - smooth(22, 38, this.t); }
  dark() { return 0.78 * smooth(45, 56, this.t); }
  // Black at the very start and the very end.
  black() {
    const t = this.t;
    if (t < 3) return 1;
    if (t < 7) return 1 - (t - 3) / 4;
    return smooth(57.5, 60, t);
  }
  // The camera drifts, then pushes in on the last glow.
  cam() { return 150 + 110 * smooth(3, 46, this.t); }
  zoom() { return 1 + 0.85 * smooth(46, 59, this.t); }

  frozenOf(p) { return p.player ? 0.5 * smooth(34, 44, this.t) : smooth(p.outAt, p.outAt + 1.6, this.t); }
  glowOf(p) { return p.player ? 0.95 - 0.7 * smooth(34, 44, this.t) : 1 - smooth(p.outAt, p.outAt + 1.2, this.t); }

  // How much of a line is written (0..1) and how visible it is.
  line(l) {
    return { p: clamp01((this.t - l.write[0]) / (l.write[1] - l.write[0])), a: 1 - clamp01((this.t - l.fade[0]) / (l.fade[1] - l.fade[0])) };
  }
}
