// The prologue, "The last coal": a village that shares one fire, the night the cold came, and the coal one child carried.
// No menus and no cut into play: it ends in darkness, and the first stage rises out of it.
// It runs the length of the jam's theme track (60 s) and its moments sit on the track's shape:
// a quiet start, a slow build, a full swell, then a fade to silence.

export const PROLOGUE_LENGTH = 60;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, t) => {
  const k = clamp01((t - a) / (b - a));
  return k * k * (3 - 2 * k);
};

export const prologueGround = (x) => 600 + Math.sin(x * 0.0031) * 9 + Math.sin(x * 0.011 + 1) * 3;

// The village square and its one shared fire.
export const HEARTH_X = 760;

// The houses. Each window goes dark in turn when the cold comes. litAt is when a coal reaches home:
// for the two houses a walker goes to, it is the walker's start plus the walk (distance / 45 px per second).
export const HOUSES = [
  { x: 330, w: 118, h: 78, litAt: 0, darkAt: 25 },
  { x: 535, w: 100, h: 70, litAt: 8.6, darkAt: 29.5 },
  { x: 1010, w: 112, h: 80, litAt: 12.2, darkAt: 27 },
  { x: 1340, w: 104, h: 74, litAt: 0, darkAt: 32 },
];

// Villagers taking a coal home: they leave the fire, walk to a door, and that window lights.
export const WALKERS = [
  { from: 720, house: 1, start: 4.5, coat: 0 },
  { from: 800, house: 2, start: 7.5, coat: 1 },
];

// Villagers who stay by the fire. Their coals go out when the hearth does.
export const STAYERS = [
  { x: 690, facing: 1, outAt: 23, coat: 2 },
  { x: 838, facing: -1, outAt: 25.5, coat: 3 },
  { x: 890, facing: -1, outAt: 28, coat: 0 },
];

// The child takes her coal from the fire and sets off for home. The storm catches her on the way.
export function childX(t) {
  if (t < 14) return 735;
  return Math.min(1170, 735 + (t - 14) * 32);
}

// Small cold-country flowers in the grass. The frost takes them with everything else.
export const FLOWERS = [415, 470, 600, 655, 900, 945, 1085, 1135, 1230, 1270].map((x, i) => ({ x, seed: i * 31 + 7, yellow: i % 3 === 0 }));

// The three lines. The first is written in warm light; the others are written into the frost.
export const LINES = [
  { text: 'every night, the village shared one fire', write: [8, 11.8], fade: [17, 19.5], frost: false },
  { text: 'then the cold came, and every hearth went out', write: [36, 40], fade: [44, 46], frost: true },
  { text: 'except the coal she carried', write: [51, 53.8], fade: [56.4, 57.9], frost: true },
];

export class Prologue {
  constructor() {
    this.t = 0;
    this.done = false;
    this.nextBeat = 0.5;
  }

  update(dt, audio) {
    this.t += dt;
    const t = this.t;
    // With the theme track playing, the heartbeat only frames it: in the dark before, and as it fades.
    // Without it, the heartbeat and the game's own music carry the whole prologue.
    const theme = audio.themePlaying();
    if (t >= this.nextBeat && t < PROLOGUE_LENGTH - 0.5) {
      if (!theme || t < 5 || t > 54) audio.heartbeat(100);
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
  hearth() { return 1 - smooth(21, 29, this.t); }
  dark() { return 0.78 * smooth(45, 56, this.t); }
  // Black at the very start and the very end.
  black() {
    const t = this.t;
    if (t < 3) return 1;
    if (t < 7) return 1 - (t - 3) / 4;
    return smooth(57.5, 60, t);
  }
  // The camera drifts with the child, then pushes in on her coal.
  cam() { return 160 + 220 * smooth(10, 40, this.t); }
  zoom() { return 1 + 0.85 * smooth(46, 59, this.t); }

  windowLit(h) { return clamp01((this.t - h.litAt) / 0.6) * (1 - smooth(h.darkAt, h.darkAt + 1.2, this.t)); }
  stayerFrozen(p) { return smooth(p.outAt, p.outAt + 1.6, this.t); }
  stayerGlow(p) { return 1 - smooth(p.outAt, p.outAt + 1.2, this.t); }
  childFrozen() { return 0.5 * smooth(34, 44, this.t); }
  childGlow() { return 0.95 - 0.7 * smooth(34, 44, this.t); }

  // A walker's position and whether they are still outside.
  walker(w) {
    const h = HOUSES[w.house];
    const dur = Math.abs(h.x - w.from) / 45;
    const p = clamp01((this.t - w.start) / dur);
    return { x: w.from + (h.x - w.from) * p, inside: p >= 1, facing: Math.sign(h.x - w.from) || 1 };
  }

  // How much of a line is written (0..1) and how visible it is.
  line(l) {
    return { p: clamp01((this.t - l.write[0]) / (l.write[1] - l.write[0])), a: 1 - clamp01((this.t - l.fade[0]) / (l.fade[1] - l.fade[0])) };
  }
}
