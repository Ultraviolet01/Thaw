import { VIEW, VIEW_H, VIEW_MIN_W, VIEW_MAX_W, PULSE, THRESHOLDS, WIND, AVALANCHE, QUAKE, LAKE } from './config.js';
import { groundY, floorY, inLower, lowerRoute } from './terrain.js';
import { Character } from './character.js';
import { COMPANION_SCALE, PLAYER_SCALE, TRANSITION, ENDING_DONE } from './game.js';
import { HOUSES, WALKERS, STAYERS, HEARTH_X, FLOWERS, LINES, childX } from './prologue.js';
import { VILLAGE } from './village.js';
import { rumbleSeconds, shaking } from './slopes.js';
import { inStorm } from './lake.js';
import { ENDINGS } from './save.js';

// Art direction: the whole world sits behind frost, like a window in winter.
// Warmth melts clear patches in the frost. Everything else is seen blurred and pale through it.

const HAND = "'Reenie Beanie', 'Segoe Print', cursive";
const SERIF = "Spectral, Georgia, serif";

const C = {
  skyTop: '#08151c',
  skyBottom: '#2a4652',
  // Snowy ridges: the far ones pale and hazy, nearer ones deeper. Each has a darker forest along its crest.
  ridges: ['#5a7380', '#4a6471', '#3c5562', '#2f4855'],
  forests: ['#4a636f', '#3a5260', '#2c4350', '#1f3440'],
  snowRim: '#7f9fae',
  near: '#2a3c47',
  frost: '#7fb3e0',
  amber: '#f2b25c',
};

// Coats, scarves and mittens for the grown-up villagers, so each one looks like a different person.
const VILLAGERS = [
  { coat: '#4a3f36', fold: '#66574a', scarf: '#5d7a6a', stripe: '#d9d2bf', mitten: '#5d7a6a', fur: '#d8cdb9' },
  { coat: '#33424a', fold: '#4b5d66', scarf: '#b08a3c', stripe: '#efe2c0', mitten: '#7a5a3a', fur: '#e2d8c6' },
  { coat: '#4d3a3a', fold: '#6a5050', scarf: '#3f5d78', stripe: '#dbe2e8', mitten: '#3f5d78', fur: '#e8dfcf' },
  { coat: '#3d4636', fold: '#56604c', scarf: '#8c3f2f', stripe: '#ead8bf', mitten: '#8c3f2f', fur: '#ddd3c1' },
];

// The colour of the snow surface, used where feet sink into it.
const SNOW_GROUND = '#8ea5b1';

// The shrunk copy the frost is made from. Its width follows the view's.
let SMALL_W = 320;
const SMALL_H = 180;
const TILE_W = 1024;
// The frost and its melt mask are built at half size: frost is soft anyway, and this keeps frame times low.
const FROST_SCALE = 0.5;
let FW = VIEW.w * FROST_SCALE;
const FH = VIEW_H * FROST_SCALE;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth01 = (v) => {
  const k = clamp01(v);
  return k * k * (3 - 2 * k);
};
// 0 before a, easing to 1 at b.
const ease = (a, b, t) => smooth01((t - a) / (b - a));

// The ending, by seconds since the hearth caught: the frost clears, dawn comes, the ground greens, the window frame
// of her home closes in around the view, and the last lines are written.
function endingLook(game) {
  if (game.mode !== 'ending') return null;
  const T = game.endingT;
  return {
    clear: ease(2, 8, T),
    dawn: ease(3, 10, T),
    grow: ease(4, 12, T) * game.treesRatio(),
    frame: ease(9, 12, T),
    line: clamp01((T - 12) / 3),
    word: clamp01((T - 15.5) / 1.6),
    after: ease(17.5, 18.5, T),
    prompt: T > ENDING_DONE ? 0.55 + 0.35 * Math.sin(T * 2) : 0,
  };
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  const k = clamp01(t);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hash(seed, i) {
  const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return (v - Math.floor(v)) * 2 - 1;
}

function canvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function glow(ctx, x, y, r, color, a) {
  if (r <= 0 || a <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${color},${a})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// An irregular melted patch. The edge is lumpy and drifts slowly, like frost giving way.
function blobPath(ctx, x, y, R, seed, t) {
  const N = 36;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const j = i % N;
    const n = (hash(seed, j - 1) + 2 * hash(seed, j) + hash(seed, j + 1)) / 4;
    const a = (j / N) * Math.PI * 2;
    const r = R * (1 + 0.16 * n + 0.04 * Math.sin(t * 0.6 + j * 1.7 + seed));
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// How warmth bends the picture: color drains below 60%, blur starts below 35%.
function warmthLook(w) {
  let sat = 1, blur = 0, bright = 1;
  if (w < THRESHOLDS.frost) sat = 0.55 + 0.45 * clamp01((w - THRESHOLDS.blur) / (THRESHOLDS.frost - THRESHOLDS.blur));
  if (w < THRESHOLDS.blur) {
    const k = clamp01((w - THRESHOLDS.heavy) / (THRESHOLDS.blur - THRESHOLDS.heavy));
    sat = 0.15 + 0.4 * k;
    blur = 2.5 * (1 - k);
    // Lift the cold scene toward the frost's tone, so clear patches don't read as dark smudges.
    bright = 1 + 0.3 * (1 - k);
  }
  if (w < THRESHOLDS.heavy) {
    sat = 0.1;
    blur = 2.5 + 3.5 * (1 - w / THRESHOLDS.heavy);
    bright = 1.3;
  }
  // The frost itself thickens as warmth drops.
  const cold = clamp01((THRESHOLDS.frost - w) / THRESHOLDS.frost);
  return { sat, blur, bright, frostA: 0.86 + 0.14 * cold, tintA: 0.34 + 0.22 * cold, crystalA: 0.65 + 0.35 * cold };
}

export class Renderer {
  constructor(cv, level) {
    this.canvas = cv;
    this.ctx = cv.getContext('2d');
    // The offscreen canvases (scene, frost, masks) are built in resize(), sized to the view.
    this.crystals = this.makeCrystals();
    this.grain = [0, 1, 2].map((i) => this.makeGrain(i));
    this.grainPatterns = this.grain.map((g) => this.ctx.createPattern(g, 'repeat'));
    this.frame = 0;
    // Whether the player is down in the gully, so her feet find the cave floor.
    this.lowNow = false;
    // Each villager keeps one figure from frozen to companion and from stage to stage, so they stay the same person.
    this.figures = {};

    const r = rng(42);
    this.stars = Array.from({ length: 110 }, () => ({
      x: r() * VIEW_MAX_W, y: r() * VIEW_H * 0.55, s: 1 + r() * 1.4, a: 0.15 + r() * 0.35, tw: 0.5 + r() * 2,
    }));
    this.snow = Array.from({ length: 140 }, () => ({
      x: r() * VIEW_MAX_W, y: r() * VIEW_H, s: 0.8 + r() * 2, vy: 14 + r() * 24, vx: -8 + r() * 5, par: 0.3 + r() * 0.7, ph: r() * 6,
    }));
    this.setLevel(level);

    this.resize();
    addEventListener('resize', () => this.resize());
  }

  // Everything that belongs to one stage: the player's figure, the frozen villagers, mist, the drifts in front.
  setLevel(level) {
    this.levelRef = level;
    this.player = new Character(level.spawn.x, PLAYER_SCALE, {}, 1, (fx) => floorY(fx, this.lowNow));
    level.objects.forEach((o) => {
      if (o.type === 'wanderer' && o.home) this.figureFor(o.home, o.x, !!o.low, -1);
    });
    const r = rng(42 + level.width);
    this.mistBlobs = level.mist.map((m) => {
      const n = Math.round((m.x1 - m.x0) / 55);
      return Array.from({ length: n }, () => ({
        x: m.x0 + r() * (m.x1 - m.x0), y: 240 + r() * 340, r: 110 + r() * 130, sp: 0.5 + r(),
      }));
    });
    // Dark drifts and dead branches that slide past in front of the camera.
    this.near = [];
    for (let x = 200; x < level.width * 1.5; x += 380 + r() * 420) {
      this.near.push({ x, kind: r() < 0.65 ? 'drift' : 'branch', w: 120 + r() * 160, h: 40 + r() * 50, seed: Math.floor(r() * 1e6) });
    }
    this.hintAlpha = level.hints.map(() => 0);
  }

  // A villager's figure, made the first time they are seen. Its floor follows whether they are down in the cave.
  figureFor(home, x, low, facing) {
    let fig = this.figures[home];
    if (fig && Math.abs(fig.x - x) > 200) fig = null;
    if (!fig) {
      const ref = this.figures[home] ? this.figures[home].ref : { low };
      const i = Math.max(0, VILLAGE.findIndex((v) => v.id === home));
      // The weaver and the baker keep the coats they had before villagers had homes.
      const colors = this.figures[home] ? this.figures[home].c : VILLAGERS[(i + 2) % VILLAGERS.length];
      fig = new Character(x, COMPANION_SCALE, colors, facing, (fx) => floorY(fx, ref.low));
      fig.ref = ref;
      this.figures[home] = fig;
    }
    return fig;
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(innerWidth * dpr);
    this.canvas.height = Math.round(innerHeight * dpr);
    // Widen the view to the screen's shape (within limits), then rebuild the offscreen canvases to match.
    const w = Math.round(Math.max(VIEW_MIN_W, Math.min(VIEW_MAX_W, (VIEW_H * innerWidth) / Math.max(1, innerHeight))) / 2) * 2;
    if (w !== VIEW.w || !this.scene) {
      VIEW.w = w;
      FW = VIEW.w * FROST_SCALE;
      SMALL_W = Math.round(VIEW.w / 4);
      this.scene = canvas(VIEW.w, VIEW_H);
      this.sctx = this.scene.getContext('2d');
      this.small = canvas(SMALL_W, SMALL_H);
      this.smctx = this.small.getContext('2d');
      this.frost = canvas(FW, FH);
      this.fctx = this.frost.getContext('2d');
      this.mask = canvas(FW, FH);
      this.mctx = this.mask.getContext('2d');
      // Writing gets its own mask so it stays sharp while melt edges are feathered.
      this.textMask = canvas(FW, FH);
      this.tctx = this.textMask.getContext('2d');
      // The frost that closes over the whole window between stages, and the mask that melts it open.
      this.cover = canvas(FW, FH);
      this.cctx = this.cover.getContext('2d');
      this.coverMask = canvas(FW, FH);
      this.cmctx = this.coverMask.getContext('2d');
      this.coverImg = null;
      this.growth = null;
    }
    this.scale = Math.min(this.canvas.width / VIEW.w, this.canvas.height / VIEW_H);
    this.ox = (this.canvas.width - VIEW.w * this.scale) / 2;
    this.oy = (this.canvas.height - VIEW_H * this.scale) / 2;
  }

  // Screen pixels (as the mouse reports them) to view coordinates.
  toView(clientX, clientY) {
    const dpr = this.canvas.width / Math.max(1, innerWidth);
    return { x: (clientX * dpr - this.ox) / this.scale, y: (clientY * dpr - this.oy) / this.scale };
  }

  // The full-screen button sits in the top-right corner of the view.
  fullscreenRect() {
    return { x: VIEW.w - 50, y: 16, w: 30, h: 30 };
  }

  fullscreenHit(clientX, clientY) {
    const p = this.toView(clientX, clientY);
    const r = this.fullscreenRect();
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  // Drawn on top of every screen: four corner marks, pointing out (go full screen) or in (leave it).
  drawFullscreenButton(pointer) {
    const c = this.ctx;
    const r = this.fullscreenRect();
    const hover = pointer && this.fullscreenHit(pointer.x, pointer.y);
    this.canvas.style.cursor = hover ? 'pointer' : 'default';
    const full = !!(document.fullscreenElement || document.webkitFullscreenElement);
    c.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    c.strokeStyle = `rgba(225,236,244,${hover ? 0.9 : 0.4})`;
    c.lineWidth = 2;
    c.lineCap = 'round';
    const k = 7;
    const x0 = r.x + 6, y0 = r.y + 6, x1 = r.x + r.w - 6, y1 = r.y + r.h - 6;
    const corners = [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]];
    c.beginPath();
    for (const [x, y, dx, dy] of corners) {
      if (full) {
        // Pointing inward: the corner sits k in from its spot.
        c.moveTo(x + dx * k, y);
        c.lineTo(x + dx * k, y + dy * k);
        c.lineTo(x, y + dy * k);
      } else {
        c.moveTo(x, y + dy * k);
        c.lineTo(x, y);
        c.lineTo(x + dx * k, y);
      }
    }
    c.stroke();
    c.lineCap = 'butt';
  }

  // Window frost: uneven thickness, fine speckle, and clusters of feathery fronds. Tiles seamlessly left to right.
  makeCrystals() {
    const cv = canvas(TILE_W, VIEW_H);
    const ctx = cv.getContext('2d');
    const r = rng(11);
    const wrap = (fn) => { for (const ox of [-TILE_W, 0, TILE_W]) fn(ox); };

    // Thicker and thinner patches of frost.
    for (let i = 0; i < 70; i++) {
      const x = r() * TILE_W, y = r() * VIEW_H, rad = 60 + r() * 180, a = 0.03 + r() * 0.06;
      wrap((ox) => glow(ctx, x + ox, y, rad, '240,248,255', a));
    }
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = `rgba(240,248,255,${0.03 + r() * 0.12})`;
      ctx.fillRect(r() * TILE_W, r() * VIEW_H, 1, 1);
    }

    ctx.lineCap = 'round';
    // One frond: a slightly curved stem with side barbs that shorten toward the tip.
    // Each frond draws from its own seeded sequence, so its wrapped copies match exactly.
    const frond = (x, y, a, len, alpha, depth, rr) => {
      const bend = (rr() - 0.5) * 0.5;
      let px = x, py = y, ang = a;
      const steps = Math.max(3, Math.round(len / 5));
      for (let i = 0; i < steps; i++) {
        const f = i / steps;
        ang += bend / steps;
        const nx = px + Math.cos(ang) * (len / steps);
        const ny = py + Math.sin(ang) * (len / steps);
        ctx.strokeStyle = `rgba(240,249,255,${alpha * (1 - f * 0.5)})`;
        ctx.lineWidth = 0.6 + (1 - f) * (depth > 0 ? 0.9 : 0.4);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        if (depth > 0 && i > 0) {
          const bl = len * 0.32 * (1 - f) * (0.7 + rr() * 0.5);
          if (bl > 2.5) {
            frond(nx, ny, ang - 1.0 - rr() * 0.2, bl, alpha * 0.85, depth - 1, rr);
            frond(nx, ny, ang + 1.0 + rr() * 0.2, bl, alpha * 0.85, depth - 1, rr);
          }
        }
        px = nx;
        py = ny;
      }
    };
    // Frost grows thickest from the bottom and top of the window and thins toward the middle.
    const edgeY = () => {
      const u = r();
      return u < 0.45 ? VIEW_H - Math.pow(r(), 1.8) * VIEW_H * 0.45 : u < 0.75 ? Math.pow(r(), 1.8) * VIEW_H * 0.35 : r() * VIEW_H;
    };
    for (let c = 0; c < 60; c++) {
      const cx = r() * TILE_W, cy = edgeY();
      const big = r() < 0.18;
      // Fronds lean away from the nearest edge, the way frost grows inward.
      const base = (cy > VIEW_H / 2 ? -Math.PI / 2 : Math.PI / 2) + (r() - 0.5) * 2.2;
      const n = big ? 5 + Math.floor(r() * 5) : 2 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) {
        const a = base + (r() - 0.5) * 1.8;
        const len = big ? 60 + r() * 120 : 8 + r() * 40;
        const alpha = (big ? 0.06 : 0.14) + r() * (big ? 0.06 : 0.12);
        const seed = Math.floor(r() * 1e9);
        wrap((ox) => frond(cx + ox, cy, a, len, alpha, big ? 1 : 2, rng(seed)));
      }
    }
    return cv;
  }

  makeGrain(seed) {
    const cv = canvas(256, 256);
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(256, 256);
    const r = rng(seed * 7 + 3);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(r() * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  draw(game, dt) {
    this.frame++;
    if (game.mode === 'title') return this.drawGate(game);
    if (game.mode === 'prologue') return this.drawPrologue(game, dt);
    if (game.level !== this.levelRef) this.setLevel(game.level);
    this.lowNow = game.ember.low;
    const w = game.displayWarmth();
    const look = warmthLook(w);

    this.drawScene(game, dt);
    const holes = this.holes(game);
    this.buildMask(game, holes, dt);
    this.buildFrost(game, holes, look);

    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#000';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    c.save();
    c.beginPath();
    c.rect(0, 0, VIEW.w, VIEW_H);
    c.clip();
    // The ground shaking: before an avalanche, as it comes down, and in a frost quake.
    const shake = game.avalanches ? shaking(game) : 0;
    if (shake > 0.02) c.translate((Math.random() - 0.5) * 7 * shake, (Math.random() - 0.5) * 5 * shake);

    if (look.blur > 0.05 || look.sat < 0.99) {
      c.filter = `blur(${(look.blur * this.scale).toFixed(2)}px) saturate(${look.sat.toFixed(2)}) brightness(${look.bright.toFixed(2)})`;
    }
    c.drawImage(this.scene, 0, 0);
    c.filter = 'none';
    const end = endingLook(game);
    c.globalAlpha = look.frostA * (end ? 1 - end.clear : 1);
    c.drawImage(this.frost, 0, 0, VIEW.w, VIEW_H);
    c.globalAlpha = 1;
    this.drawDawnOnGlass(c, game);

    c.save();
    c.translate(-game.camX, 0);
    this.drawRingsOnGlass(c, game);
    this.drawShimmers(c, game);
    c.restore();

    if (game.transition) this.drawCover(c, game);

    // Film grain keeps the picture from looking too clean and digital.
    c.globalAlpha = 0.06;
    c.fillStyle = this.grainPatterns[Math.floor(this.frame / 2) % 3];
    c.fillRect(0, 0, VIEW.w, VIEW_H);
    c.globalAlpha = 1;

    if (w < THRESHOLDS.heavy && game.mode !== 'title') {
      c.fillStyle = `rgba(2,4,8,${((THRESHOLDS.heavy - w) / THRESHOLDS.heavy) * 0.45})`;
      c.fillRect(0, 0, VIEW.w, VIEW_H);
    }
    const lo = game.lightsOutAlpha();
    if (lo > 0) {
      c.fillStyle = `rgba(0,0,0,${lo})`;
      c.fillRect(0, 0, VIEW.w, VIEW_H);
    }
    // Out of black as the first stage begins.
    if (game.intro && game.intro.kind !== 'walk' && game.intro.t < 1.6) {
      c.fillStyle = `rgba(0,0,0,${1 - game.intro.t / 1.6})`;
      c.fillRect(0, 0, VIEW.w, VIEW_H);
    }
    if (game.ember.burial || game.ember.unburied) this.drawBurial(c, game);
    if (!(game.intro && game.intro.t < game.introLock()) && game.mode !== 'ending') this.drawBar(c, game);
    if (game.intro && game.intro.kind !== 'walk' && game.titleFade > 0) this.drawTitleText(c, game);
    if (game.mode === 'paused') this.drawPause(c);
    if (game.mode === 'stageEnd') {
      this.drawStageEndText(c, game);
      // Ready the frost pattern for the walk on, while nothing is moving.
      if (!this.growth) this.growthMask(0);
    }
    // Setting off: the end screen fades as the frost comes in.
    if (game.mode === 'transition') {
      c.save();
      c.globalAlpha = 1 - clamp01(game.transition.t / 0.8);
      this.drawStageEndText(c, game);
      c.restore();
    }
    if (end) this.drawEnding(c, game, end);
    if (game.audio.muted) {
      c.font = `13px ${SERIF}`;
      c.fillStyle = 'rgba(200,215,230,0.55)';
      c.textAlign = 'left';
      c.fillText('muted (M)', 28, VIEW_H - 24);
    }
    c.restore();
  }

  // ---------- The world behind the glass ----------

  drawScene(game, dt) {
    const s = this.sctx;
    const cam = game.camX;
    const t = game.time;
    // High on a mountain the far hills sit lower on the screen.
    const lift = game.level.altitude ? Math.max(0, Math.min(320, 600 - groundY(cam + VIEW.w * 0.42))) * 0.8 : 0;
    this.drawSky(s, cam, t, lift);
    s.save();
    s.translate(-cam, 0);
    this.drawMountainside(s, game, t);
    this.drawGround(s, cam);
    this.drawStageGround(s, cam, game, t);
    for (const o of game.objects) this.drawObject(s, o, t);
    this.drawPickups(s, game, t);
    if (!game.fire.cold) this.drawFire(s, game.fire, t);
    // The avalanche pours down behind the figures; anyone it reaches outside the overhang is buried.
    this.drawSlides(s, game, t);
    this.drawFigures(s, game, dt, t);
    this.drawSplash(s, game, t);
    this.drawCliffs(s, game, t);
    this.drawCaveDark(s, game, t);
    this.drawLakeDark(s, game, t);
    // On the dark lake a lucky ember and the far fire still show as themselves, not as a muddy haze.
    if (game.level.dark) {
      this.drawPickups(s, game, t);
      // Close by, her own light already shows it; drawn twice it would burn too bright.
      if (Math.abs(game.fire.x - game.ember.x) > 200) this.drawFire(s, game.fire, t);
    }
    this.drawLights(s, game, t);
    this.drawMist(s, t);
    this.drawWhiteout(s, game, t);
    s.restore();
    this.drawRain(s, game, t);
    const end = endingLook(game);
    if (end) this.drawDawn(s, end);
    this.snowFade = end ? 1 - end.dawn * 0.85 : 1;
    this.drawSnow(s, cam, dt, t, game.wind.strength);
    this.drawNear(s, cam, !!game.level.lake);
  }

  // The dawn on the frosted glass itself: the frost is drawn from the scene with its colour drained, so the sky's
  // warmth would not show through it. A warm cast low in the sky, ahead of her, stronger with every stage.
  drawDawnOnGlass(c, game) {
    const dawn = game.level.dawn || 0;
    if (dawn <= 0 || game.mode === 'ending') return;
    const g = c.createLinearGradient(0, 120, 0, 600);
    g.addColorStop(0, 'rgba(240,150,105,0)');
    g.addColorStop(0.75, `rgba(240,150,105,${0.42 * dawn})`);
    g.addColorStop(1, 'rgba(240,150,105,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, VIEW.w, VIEW_H);
    glow(c, VIEW.w * 0.92, 480, 600, '245,165,110', 0.3 * dawn);
  }

  // Dawn over the village at the end: the sky warms from the horizon up.
  drawDawn(s, end) {
    if (end.dawn <= 0.01) return;
    const g = s.createLinearGradient(0, 0, 0, VIEW_H * 0.85);
    g.addColorStop(0, `rgba(120,150,190,${0.12 * end.dawn})`);
    g.addColorStop(0.6, `rgba(250,190,150,${0.28 * end.dawn})`);
    g.addColorStop(1, `rgba(255,215,160,${0.4 * end.dawn})`);
    s.fillStyle = g;
    s.fillRect(0, 0, VIEW.w, VIEW_H);
    s.save();
    s.globalCompositeOperation = 'lighter';
    glow(s, VIEW.w * 0.78, 470, 520, '255,190,120', 0.22 * end.dawn);
    s.restore();
  }

  // The snow melting off the ground, and as much green coming back as trees were warmed on the walk.
  drawSpring(s, game, x0, x1, t, end) {
    const along = () => {
      s.beginPath();
      s.moveTo(x0, VIEW_H);
      for (let x = x0; x <= x1; x += 10) s.lineTo(x, groundY(x) + 1);
      s.lineTo(x1, VIEW_H);
      s.closePath();
    };
    along();
    s.fillStyle = `rgba(112,98,76,${0.3 * end.dawn})`;
    s.fill();
    const green = end.grow;
    if (green <= 0.01) return;
    along();
    s.fillStyle = `rgba(92,124,66,${0.55 * green})`;
    s.fill();
    s.strokeStyle = `rgba(120,156,78,${0.9 * green})`;
    s.lineWidth = 1.2;
    s.beginPath();
    for (let x = Math.floor(x0 / 6) * 6; x < x1; x += 6) {
      if ((hash(211, x) + 1) / 2 > green) continue;
      const h = (5 + (hash(213, x) + 1) * 5) * green;
      const lean = hash(217, x) * 3 + Math.sin(t * 1.3 + x * 0.05) * 1.5;
      s.moveTo(x, groundY(x) + 2);
      s.lineTo(x + lean, groundY(x) - h);
    }
    s.stroke();
    // Small cold-country flowers, as in the prologue, once the green is well in.
    for (let x = Math.floor(x0 / 37) * 37; x < x1; x += 37) {
      if ((hash(223, x) + 1) / 2 > green * 0.8) continue;
      const gy = groundY(x) - 9 * green;
      s.fillStyle = hash(227, x) > 0.3 ? '#f1cf62' : '#f4efe4';
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + x;
        s.beginPath();
        s.arc(x + Math.cos(a) * 2.4, gy + Math.sin(a) * 2.4, 1.8, 0, Math.PI * 2);
        s.fill();
      }
    }
  }

  // The end: the frosted glass the whole walk was seen through was the window of her own home. Its frame closes in
  // around the view, her pot sits on the sill, and the last lines are written.
  drawEnding(c, game, end) {
    const f = end.frame;
    if (f > 0) {
      const b = 62 * f;
      const m = 13 * f;
      const hy = VIEW_H * 0.44;
      c.fillStyle = '#17100c';
      c.fillRect(0, 0, VIEW.w, b);
      c.fillRect(0, VIEW_H - b, VIEW.w, b);
      c.fillRect(0, 0, b, VIEW_H);
      c.fillRect(VIEW.w - b, 0, b, VIEW_H);
      c.fillStyle = '#3a281c';
      c.fillRect(VIEW.w / 2 - m / 2, b, m, VIEW_H - 2 * b);
      c.fillRect(b, hy - m / 2, VIEW.w - 2 * b, m);
      c.strokeStyle = '#4a3424';
      c.lineWidth = 9 * f;
      c.strokeRect(b, b, VIEW.w - 2 * b, VIEW_H - 2 * b);
      // The sill, and her clay pot on it with the coal still glowing.
      c.fillStyle = '#4e3828';
      c.fillRect(b - 14 * f, VIEW_H - b, VIEW.w - 2 * b + 28 * f, 12 * f);
      const px = VIEW.w / 2 + 250;
      const py = VIEW_H - b;
      c.globalAlpha = f;
      c.fillStyle = '#8a5a3a';
      c.beginPath();
      c.moveTo(px - 16, py - 26);
      c.quadraticCurveTo(px - 22, py - 6, px - 12, py);
      c.lineTo(px + 12, py);
      c.quadraticCurveTo(px + 22, py - 6, px + 16, py - 26);
      c.closePath();
      c.fill();
      c.save();
      c.globalCompositeOperation = 'lighter';
      glow(c, px, py - 28, 46, '255,170,90', 0.45 + 0.08 * Math.sin(game.time * 3));
      c.restore();
      c.globalAlpha = 1;
    }
    c.textAlign = 'center';
    c.shadowColor = 'rgba(20,12,8,0.6)';
    c.shadowBlur = 8;
    c.fillStyle = 'rgba(255,240,218,0.96)';
    const lines = game.level.endingLines || {};
    c.font = `58px ${HAND}`;
    this.writeReveal(c, (lines[game.ending] || '').toLowerCase(), VIEW.w / 2, 140, end.line);
    c.font = `150px ${HAND}`;
    this.writeReveal(c, 'thaw', VIEW.w / 2, 268, end.word);
    c.shadowBlur = 0;
    if (end.after > 0) {
      const sv = game.saved;
      const brought = `${game.ledger.saved.length} of ${game.totalVillagers()} brought home   ·   trees warmed: ${game.ledger.trees || 0} of ${game.totalTrees()}`;
      const found = `endings found: ${sv.endings.length} of ${ENDINGS.length}`;
      c.font = `italic 300 16px ${SERIF}`;
      c.fillStyle = `rgba(255,236,210,${0.9 * end.after})`;
      c.fillText(brought, VIEW.w / 2, 352);
      c.fillText(game.endingNew ? `a new ending   ·   ${found}` : found, VIEW.w / 2, 378);
    }
    if (end.prompt > 0) {
      c.font = `300 14px ${SERIF}`;
      c.fillStyle = `rgba(220,200,180,${end.prompt})`;
      c.fillText('press any key', VIEW.w / 2, VIEW_H - 24);
    }
  }

  drawSky(s, cam, t, lift = 0) {
    const g = s.createLinearGradient(0, 0, 0, VIEW_H * 0.7);
    g.addColorStop(0, C.skyTop);
    g.addColorStop(1, C.skyBottom);
    s.fillStyle = g;
    s.fillRect(0, 0, VIEW.w, VIEW_H);
    // The night turning toward dawn over the walk: warmth low in the sky ahead of her, the way she is going,
    // a little more with every stage. The stars fade as it grows.
    const dawn = (this.levelRef && this.levelRef.dawn) || 0;
    if (dawn > 0) {
      const h = s.createLinearGradient(0, VIEW_H * 0.2, 0, VIEW_H * 0.75);
      h.addColorStop(0, 'rgba(210,150,130,0)');
      h.addColorStop(0.7, `rgba(214,156,128,${0.16 * dawn})`);
      h.addColorStop(1, `rgba(236,176,128,${0.34 * dawn})`);
      s.fillStyle = h;
      s.fillRect(0, 0, VIEW.w, VIEW_H);
      s.save();
      s.globalCompositeOperation = 'lighter';
      glow(s, VIEW.w * 0.88, VIEW_H * 0.62, 620, '230,160,110', 0.16 * dawn);
      s.restore();
    }
    for (const st of this.stars) {
      const x = (((st.x - cam * 0.04) % VIEW.w) + VIEW.w) % VIEW.w;
      const a = st.a * (0.6 + 0.4 * Math.sin(t * st.tw + st.x)) * (1 - 0.8 * dawn);
      s.fillStyle = `rgba(215,232,245,${a})`;
      s.fillRect(x, st.y, st.s, st.s);
    }
    const ridges = [
      [0.12, 9, (x) => 330 - Math.abs(Math.sin(x * 0.0024)) * 120 - Math.sin(x * 0.009) * 16],
      [0.25, 12, (x) => 395 - Math.abs(Math.sin(x * 0.0033 + 0.7)) * 95 - Math.sin(x * 0.013) * 10],
      [0.45, 16, (x) => 455 - Math.abs(Math.sin(x * 0.0046 + 2)) * 65 - Math.sin(x * 0.019) * 7],
      [0.7, 22, (x) => 515 - Math.abs(Math.sin(x * 0.006 + 1)) * 42 - Math.sin(x * 0.027) * 5],
    ];
    ridges.forEach(([par, treeH, fn0], i) => {
      const fn = (x) => fn0(x) + lift * (0.4 + par);
      const off = cam * par;
      s.fillStyle = C.ridges[i];
      s.beginPath();
      s.moveTo(0, VIEW_H);
      for (let x = 0; x <= VIEW.w + 12; x += 12) s.lineTo(x, fn(x + off));
      s.lineTo(VIEW.w, VIEW_H);
      s.closePath();
      s.fill();
      // Forest patches along the crest: small pines, smaller and hazier with distance.
      s.fillStyle = C.forests[i];
      const step = 3 + i * 1.5;
      const start = Math.floor(off / step) * step;
      for (let wx = start; wx < off + VIEW.w + step; wx += step) {
        const k = Math.floor(wx / step);
        const patch = Math.sin(k * 0.05 + i * 3) + Math.sin(k * 0.013 + i) * 0.8;
        if (patch < 0.25) continue;
        const sx = wx - off;
        const h = treeH * (0.5 + 0.5 * (hash(i + 31, k) + 1) / 2) * Math.min(1, (patch - 0.25) * 2);
        const base = fn(wx) + 3 + i;
        const half = h * 0.28;
        s.beginPath();
        s.moveTo(sx - half, base);
        s.lineTo(sx, base - h);
        s.lineTo(sx + half, base);
        s.closePath();
        s.fill();
      }
      // The body of the forest below the tree tops.
      s.beginPath();
      for (let x = 0; x <= VIEW.w + 12; x += 12) {
        if (x === 0) s.moveTo(x, fn(x + off) + 2 + i);
        else s.lineTo(x, fn(x + off) + 2 + i);
      }
      for (let x = VIEW.w + 12; x >= 0; x -= 12) {
        const k = Math.floor((x + off) / step);
        const patch = Math.sin(k * 0.05 + i * 3) + Math.sin(k * 0.013 + i) * 0.8;
        const depth = patch < 0.25 ? 0 : Math.min(1, (patch - 0.25) * 2) * treeH * 0.6;
        s.lineTo(x, fn(x + off) + 2 + i + depth);
      }
      s.closePath();
      s.fill();
    });
  }

  // Snow is the brightest thing in a snow scene, so the ground is pale and the figures read dark against it.
  drawGround(s, cam) {
    const x0 = cam - 40;
    const x1 = cam + VIEW.w + 40;
    const top = () => {
      s.beginPath();
      for (let x = x0; x <= x1; x += 10) {
        if (x === x0) s.moveTo(x, groundY(x));
        else s.lineTo(x, groundY(x));
      }
    };
    s.beginPath();
    s.moveTo(x0, VIEW_H);
    for (let x = x0; x <= x1; x += 10) s.lineTo(x, groundY(x));
    s.lineTo(x1, VIEW_H);
    s.closePath();
    const g = s.createLinearGradient(0, 545, 0, VIEW_H);
    g.addColorStop(0, '#93aab6');
    g.addColorStop(0.35, '#6f8794');
    g.addColorStop(1, '#3f5561');
    s.fillStyle = g;
    s.fill();
    top();
    s.strokeStyle = 'rgba(225,238,245,0.55)';
    s.lineWidth = 2;
    s.stroke();

    // Wind-cut ridges and soft hollows in the snow.
    for (let x = Math.floor(x0 / 70) * 70; x < x1; x += 70) {
      const y = groundY(x) + 12 + (hash(3, x) + 1) * 16;
      s.strokeStyle = `rgba(60,85,100,${0.18 + 0.12 * hash(9, x)})`;
      s.lineWidth = 1.2;
      s.beginPath();
      s.moveTo(x, y);
      s.quadraticCurveTo(x + 30, y - 4, x + 55 + hash(5, x) * 18, y + 1);
      s.stroke();
      s.strokeStyle = 'rgba(230,242,248,0.22)';
      s.beginPath();
      s.moveTo(x + 2, y - 1.5);
      s.quadraticCurveTo(x + 30, y - 5.5, x + 50 + hash(5, x) * 18, y - 0.5);
      s.stroke();
    }

    // Rocks and dry grass poking through the snow.
    for (let x = Math.floor(x0 / 110) * 110; x < x1; x += 110) {
      const h = hash(17, x);
      const px = x + hash(19, x) * 40;
      const gy = groundY(px);
      if (h > 0.35) {
        const rw = 8 + (h - 0.35) * 26;
        s.fillStyle = '#1d2a32';
        s.beginPath();
        s.ellipse(px, gy + 2, rw, rw * 0.45, 0, Math.PI, 0);
        s.fill();
        s.fillStyle = 'rgba(220,234,242,0.85)';
        s.beginPath();
        s.ellipse(px - rw * 0.15, gy + 2 - rw * 0.38, rw * 0.7, rw * 0.16, 0, Math.PI, 0);
        s.fill();
      } else if (h < -0.2) {
        s.strokeStyle = 'rgba(40,50,48,0.8)';
        s.lineWidth = 1;
        for (let k = 0; k < 7; k++) {
          const bx = px + (k - 3) * 2.2;
          const lean = hash(23, x + k) * 5;
          const bh = 6 + (hash(29, x + k) + 1) * 6;
          s.beginPath();
          s.moveTo(bx, gy + 1);
          s.quadraticCurveTo(bx + lean * 0.3, gy - bh * 0.6, bx + lean, gy - bh);
          s.stroke();
        }
      }
    }
  }

  // ---------- Stage 3: the mountain ----------

  // The mountainside above the path: a slope of snow and rock rising off the top of the screen, with a paler
  // chute down its middle to each avalanche run. Early on, a far-off slide that cannot reach her.
  drawMountainside(s, game, t) {
    const d = game.distant;
    if (d && d.t >= 0 && d.t < 6) {
      const a = Math.min(1, d.t / 0.6) * Math.min(1, (6 - d.t) / 1.5);
      const k = Math.min(1, d.t / 3);
      s.save();
      for (let i = 0; i < 22; i++) {
        const q = i / 21;
        if (q > k) break;
        const x = d.x - 160 + q * 220 + Math.sin(i * 1.3) * 8;
        const y = 300 + q * 120;
        s.fillStyle = `rgba(236,243,248,${0.28 * a * (1 - 0.5 * q)})`;
        s.beginPath();
        s.ellipse(x, y, 10 + 22 * q, 5 + 10 * q, -0.5, 0, Math.PI * 2);
        s.fill();
      }
      s.restore();
    }
    for (const av of game.avalanches || []) {
      if (av.x1 < game.camX - 500 || av.x0 > game.camX + VIEW.w + 500) continue;
      const cx = (av.x0 + av.x1) / 2;
      const half = (av.x1 - av.x0) / 2;
      // Uneven, lopsided shoulders: a long slope on one side, a steeper one on the other.
      const rough = (y, k) => Math.sin(y * 0.021 + k) * 22 + Math.sin(y * 0.063 + k * 2) * 9;
      const spread = (y) => Math.pow(Math.max(0, (y + 160) / 760), 0.85);
      const left = (y) => cx + 40 - (half + 420) * spread(y) + rough(y, av.x0 * 0.01);
      const right = (y) => cx + 40 + (half + 230) * spread(y) + rough(y, av.x1 * 0.01);
      const g = s.createLinearGradient(0, -60, 0, 620);
      g.addColorStop(0, '#3a5260');
      g.addColorStop(1, '#68818e');
      s.fillStyle = g;
      s.beginPath();
      s.moveTo(left(620), 640);
      for (let y = 600; y >= -60; y -= 30) s.lineTo(left(y), y);
      for (let y = -60; y <= 600; y += 30) s.lineTo(right(y), y);
      s.lineTo(right(620), 640);
      s.closePath();
      s.fill();
      // Rock showing through here and there, mostly on the steeper side.
      s.fillStyle = 'rgba(24,36,45,0.4)';
      for (let i = 0; i < 8; i++) {
        const y = 30 + ((hash(131, i) + 1) / 2) * 470;
        const steep = i % 3 !== 0;
        const x0 = steep ? right(y) : left(y);
        const x = x0 + (steep ? -1 : 1) * (20 + ((hash(137, i) + 1) / 2) * 70);
        const w = 14 + ((hash(139, i) + 1) / 2) * 26;
        s.beginPath();
        s.moveTo(x - w, y + 4);
        s.lineTo(x - w * 0.3, y - 6 - w * 0.2);
        s.lineTo(x + w * 0.6, y - 3);
        s.lineTo(x + w, y + 5);
        s.closePath();
        s.fill();
      }
      // The chute: a smooth, paler groove of snow down the middle.
      for (const [w, a] of [[1, 0.1], [0.7, 0.12], [0.42, 0.14]]) {
        s.fillStyle = `rgba(214,228,236,${a})`;
        s.beginPath();
        s.moveTo(cx - 40 * w, -60);
        s.quadraticCurveTo(cx - (half + 30) * w * 0.6, 300, cx - (half + 30) * w, groundY(cx - half * w));
        s.lineTo(cx + (half + 30) * w, groundY(cx + half * w));
        s.quadraticCurveTo(cx + (half + 30) * w * 0.6, 300, cx + 40 * w, -60);
        s.closePath();
        s.fill();
      }
      // The warning: small slides trickling down the chute while it rumbles.
      if (av.phase === 'rumble') {
        const k = av.t / rumbleSeconds(game);
        const n = Math.round(4 + 14 * k);
        for (let i = 0; i < n; i++) {
          const q = (t * (0.5 + 0.4 * hash(103, i)) + i / n) % 1;
          const x = cx + hash(107, i) * half * 0.8 * q;
          const y = q * (groundY(x) - 60);
          s.fillStyle = `rgba(240,246,250,${0.8 * (1 - q * 0.5)})`;
          s.beginPath();
          s.ellipse(x, y, 4 + 6 * k, 2.5 + 3 * k, 0.3, 0, Math.PI * 2);
          s.fill();
        }
      }
    }
  }

  // The avalanche itself: a white front pouring down the chute, then a wall of snow and powder across the path.
  // The rock overhang is drawn over it: the snow goes over the top, and the hollow beneath stays clear.
  drawSlides(s, game, t) {
    for (const av of game.avalanches || []) {
      if (av.x1 < game.camX - 300 || av.x0 > game.camX + VIEW.w + 300) continue;
      if (av.phase === 'slide') {
        const T = av.t;
        const cx = (av.x0 + av.x1) / 2;
        const fade = T < AVALANCHE.hit[1] ? 1 : Math.max(0, 1 - (T - AVALANCHE.hit[1]) / (AVALANCHE.slide - AVALANCHE.hit[1]));
        const down = Math.min(1, T / AVALANCHE.hit[0]);
        const spread = Math.min(1, Math.max(0, (T - AVALANCHE.hit[0] * 0.7) / 0.5));
        s.save();
        s.globalAlpha = fade;
        const frontY = down * (groundY(cx) - 20);
        for (let i = 0; i < 26; i++) {
          const q = i / 26;
          if (q > down) break;
          const y = -40 + q * (frontY + 40);
          const x = cx + Math.sin(i * 2.3 + t * 3) * 30 * q;
          glow(s, x, y, 50 + 70 * q, '244,248,251', 0.9);
        }
        if (spread > 0) {
          const w = (av.x1 - av.x0 + 160) * spread;
          for (let i = 0; i < 30; i++) {
            const q = i / 29;
            const x = cx - w / 2 + q * w;
            const h = 90 + 60 * Math.sin(i * 1.9 + t * 4);
            glow(s, x, groundY(x) - h * 0.4, h, '246,249,252', 0.95);
          }
          s.fillStyle = 'rgba(236,243,247,0.92)';
          s.beginPath();
          s.moveTo(cx - w / 2, VIEW_H);
          for (let x = cx - w / 2; x <= cx + w / 2; x += 12) s.lineTo(x, groundY(x) - 70 - 25 * Math.sin(x * 0.05 + t * 6));
          s.lineTo(cx + w / 2, VIEW_H);
          s.closePath();
          s.fill();
        }
        s.restore();
      }
      if (av.overhang) this.drawOverhang(s, av, av.phase === 'slide' && av.t > AVALANCHE.hit[0] * 0.7 ? 1 : 0);
    }
  }

  // A rock arch over the path: a slab overhead, held up by a pillar on its downhill side.
  drawOverhang(s, av, pouring) {
    const o = av.overhang;
    const gy = groundY(o.x1);
    const top = groundY(o.x0) - 118;
    // While the snow pours past, the hollow under the rock stays dark and clear.
    if (pouring) {
      const g = s.createLinearGradient(o.x0 - 20, 0, o.x1, 0);
      g.addColorStop(0, 'rgba(40,60,72,0)');
      g.addColorStop(0.35, 'rgba(40,60,72,0.85)');
      g.addColorStop(1, 'rgba(40,60,72,0.9)');
      s.fillStyle = g;
      s.beginPath();
      s.moveTo(o.x0 - 20, top + 12);
      s.quadraticCurveTo(o.x0 + 40, top + 24, o.x1, top + 10);
      s.lineTo(o.x1, groundY(o.x1) + 2);
      s.lineTo(o.x0 - 20, groundY(o.x0 - 20) + 2);
      s.closePath();
      s.fill();
    }
    s.fillStyle = '#1c2a33';
    s.beginPath();
    s.moveTo(o.x0 - 40, top - 10);
    s.quadraticCurveTo(o.x0 + 30, top - 34, o.x1 + 40, top - 18);
    s.lineTo(o.x1 + 44, top + 10);
    s.quadraticCurveTo(o.x0 + 40, top + 22, o.x0 - 34, top + 14);
    s.closePath();
    s.fill();
    s.beginPath();
    s.moveTo(o.x1 - 2, top + 6);
    s.lineTo(o.x1 + 34, top + 4);
    s.quadraticCurveTo(o.x1 + 46, gy - 30, o.x1 + 42, gy + 4);
    s.lineTo(o.x1 - 6, gy + 4);
    s.quadraticCurveTo(o.x1 - 12, gy - 40, o.x1 - 2, top + 6);
    s.fill();
    s.fillStyle = 'rgba(224,237,244,0.9)';
    s.beginPath();
    s.moveTo(o.x0 - 36, top - 12);
    s.quadraticCurveTo(o.x0 + 30, top - 44, o.x1 + 38, top - 22);
    s.quadraticCurveTo(o.x0 + 30, top - 30, o.x0 - 36, top - 12);
    s.fill();
  }

  // The cliff path: a ledge of rock overhead with icicles. Before they fall, their shadows show on the snow.
  drawCliffs(s, game, t) {
    for (const q of game.quakes || []) {
      if (q.x1 < game.camX - 200 || q.x0 > game.camX + VIEW.w + 200) continue;
      // On the mountain the icicles hang from a cliff; in the street, from the eaves of the homes.
      const ledge = q.eaves ? (x) => groundY(x) - 74 : (x) => groundY(x) - 178;
      if (!q.eaves) {
        // An overhanging cliff: rock rising off the top of the screen, its underside over the path.
        const a0 = q.x0 - 140;
        const a1 = q.x1 + 140;
        const g = s.createLinearGradient(0, -40, 0, 440);
        g.addColorStop(0, '#2c3d48');
        g.addColorStop(1, '#1a2730');
        s.fillStyle = g;
        s.beginPath();
        s.moveTo(a0 - 60, -40);
        s.quadraticCurveTo(a0 - 30, ledge(a0) - 120, a0, ledge(a0) - 30);
        for (let x = a0; x <= a1; x += 20) s.lineTo(x, ledge(x) - 4 + hash(109, x) * 6);
        s.quadraticCurveTo(a1 + 40, ledge(a1) - 140, a1 + 90, -40);
        s.closePath();
        s.fill();
        // Strata in the rock, and snow caught on its ledges.
        s.strokeStyle = 'rgba(120,150,165,0.18)';
        s.lineWidth = 2;
        for (let i = 1; i <= 4; i++) {
          s.beginPath();
          for (let x = a0 + 20 * i; x <= a1 - 20 * i; x += 30) (x === a0 + 20 * i ? s.moveTo : s.lineTo).call(s, x, ledge(x) - 40 * i + hash(113, x + i) * 8);
          s.stroke();
        }
      }

      for (const ic of q.icicles) {
        const top = ledge(ic.x);
        const gy = groundY(ic.x);
        // Shadows on the snow while the ground shakes and as they fall.
        if (q.phase === 'tremor' || (q.phase === 'fall' && ic.state === 'falling')) {
          const k = q.phase === 'tremor' ? q.t / QUAKE.tremor : 1;
          s.fillStyle = `rgba(20,35,45,${0.15 + 0.35 * k})`;
          s.beginPath();
          s.ellipse(ic.x, gy + 2, 16 + 8 * k, 4, 0, 0, Math.PI * 2);
          s.fill();
        }
        if (ic.state === 'broken') {
          if (ic.t < 1.5) {
            s.fillStyle = `rgba(210,235,245,${0.8 * (1 - ic.t / 1.5)})`;
            for (let i = 0; i < 5; i++) s.fillRect(ic.x - 12 + i * 6, gy - 2 - (i % 2) * 2, 4, 2);
          }
          continue;
        }
        let y = top;
        if (ic.state === 'falling') y += Math.pow(q.t / QUAKE.fall, 2) * (gy - top - 30);
        const shiver = q.phase === 'tremor' ? Math.sin(t * 60 + ic.x) * 1.5 : 0;
        s.fillStyle = 'rgba(200,232,245,0.9)';
        s.beginPath();
        s.moveTo(ic.x - 6 + shiver, y);
        s.lineTo(ic.x + shiver, y + 34);
        s.lineTo(ic.x + 6 + shiver, y);
        s.closePath();
        s.fill();
      }
    }
  }

  // Someone buried by an avalanche: a mound of snow over them, the glow of their pot showing through.
  // It wears down as she digs, and is gone as they thaw.
  drawBuried(s, o, fig, warm, t) {
    if (fig) fig.draw(s, { frozen: 1 - warm, glow: 0, pot: false, t, ground: SNOW_GROUND });
    const k = o.state === 'frozen' ? 1 - o.progress / o.pulses : o.state === 'melting' ? 0.15 * (1 - o.meltT) : 0;
    if (k <= 0) return;
    const gy = groundY(o.x) + 4;
    const h = 28 + 92 * k;
    s.fillStyle = '#dbe8ef';
    s.beginPath();
    s.moveTo(o.x - 70, gy);
    s.quadraticCurveTo(o.x - 40, gy - h, o.x + 5, gy - h * 0.95);
    s.quadraticCurveTo(o.x + 50, gy - h * 0.9, o.x + 80, gy);
    s.closePath();
    s.fill();
    s.strokeStyle = 'rgba(150,180,195,0.6)';
    s.lineWidth = 1.5;
    s.stroke();
    s.save();
    s.globalCompositeOperation = 'lighter';
    glow(s, o.x + 4, gy - h * 0.45, 26, '255,170,90', 0.35 + 0.1 * Math.sin(t * 2));
    s.restore();
  }

  // Buried: snow all around her, and a pocket of air that her coal melts wider with each pulse. Each pulse sends
  // a warm ring into the snow; the pocket's edge is wet and darker, and meltwater runs down from it. When she is
  // free, the last of the snow melts away outward from her.
  drawBurial(c, game) {
    const e = game.ember;
    const b = e.burial;
    const x = e.x - game.camX;
    const y = e.y;
    const t = game.time;
    let R;
    let a = 0.95;
    if (b) {
      const target = b.done / b.need;
      const dt = Math.max(0, t - (this.burialT ?? t));
      this.burialT = t;
      this.burialShown = (this.burialShown || 0) + (target - (this.burialShown || 0)) * Math.min(1, dt * 5);
      R = 34 + 130 * this.burialShown + 8 * (b.hit || 0);
    } else {
      const k = smooth01(e.unburied.t / 0.9);
      R = 170 + VIEW.w * 1.1 * k;
      a = 0.95 * (1 - k);
      this.burialShown = 0;
    }
    c.save();
    c.fillStyle = `rgba(214,228,236,${a})`;
    blobPath(c, x, y, R, 7, t);
    c.rect(0, 0, VIEW.w, VIEW_H);
    c.fill('evenodd');
    if (b) {
      // The wet edge of the melt.
      c.strokeStyle = 'rgba(120,150,165,0.55)';
      c.lineWidth = 7;
      blobPath(c, x, y, R + 3, 7, t);
      c.stroke();
      // Meltwater running down from the pocket.
      c.strokeStyle = 'rgba(150,180,195,0.6)';
      c.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const ang = Math.PI * (0.15 + 0.7 * (i / 6));
        const sx = x + Math.cos(ang) * R;
        const sy = y + Math.sin(ang) * R * 0.95;
        const len = (10 + 30 * this.burialShown) * (0.6 + 0.4 * Math.sin(i * 2.1 + t));
        c.lineWidth = 2.5;
        c.beginPath();
        c.moveTo(sx, sy);
        c.lineTo(sx + Math.sin(i) * 2, sy + len);
        c.stroke();
      }
      c.lineCap = 'butt';
      // Her coal glowing inside the pocket, brighter on each pulse.
      c.globalCompositeOperation = 'lighter';
      glow(c, x, y, R * 0.9, '255,170,90', 0.18 + 0.25 * (b.hit || 0));
      c.globalCompositeOperation = 'source-over';
      // Each pulse's warmth pushing out into the snow.
      for (const r of game.rings) {
        if (!r.strong) continue;
        const p = r.t / PULSE.ringSeconds;
        const rr = R * (0.6 + 0.9 * (1 - Math.pow(1 - p, 3)));
        c.strokeStyle = `rgba(255,190,120,${0.55 * (1 - p)})`;
        c.lineWidth = 4 * (1 - p) + 1;
        c.beginPath();
        c.arc(x, y, rr, 0, Math.PI * 2);
        c.stroke();
      }
      c.font = `56px ${HAND}`;
      c.textAlign = 'center';
      c.fillStyle = 'rgba(30,50,62,0.7)';
      c.fillText('pulse to dig yourself out', VIEW.w / 2, 200);
    }
    c.restore();
  }

  // ---------- Stage 4: the lake ----------

  // The frozen lake: a band of dark, glassy ice along the path, glazed and glinting in the ice storm. Thin patches
  // are darker with hairline cracks (hidden in the whiteout); broken ones are open black water with floating shards.
  drawIce(s, game, x0, x1, t) {
    const lake = game.level.lake;
    const a = Math.max(x0, lake.x0);
    const b = Math.min(x1, lake.x1);
    if (a < b) {
      s.fillStyle = 'rgba(52,80,96,0.8)';
      s.beginPath();
      s.moveTo(a, groundY(a) - 1);
      for (let x = a; x <= b; x += 16) s.lineTo(x, groundY(x) - 1);
      for (let x = b; x >= a; x -= 16) s.lineTo(x, groundY(x) + 34);
      s.closePath();
      s.fill();
      // Long pale streaks of reflection in the ice.
      for (let x = Math.floor(a / 90) * 90; x < b; x += 90) {
        const glaze = inStorm(game, x) ? 0.7 + 0.3 * Math.sin(t * 3 + x) : 0.35;
        s.strokeStyle = `rgba(210,232,242,${glaze * (0.5 + 0.5 * hash(151, x))})`;
        s.lineWidth = 1.2;
        s.beginPath();
        const y = groundY(x) + 6 + (hash(157, x) + 1) * 10;
        s.moveTo(x, y);
        s.lineTo(x + 40 + hash(163, x) * 20, y + 1);
        s.stroke();
      }
    }
    const e = game.ember;
    const flame = game.hasFlame();
    for (const p of game.thin) {
      if (p.x1 < x0 || p.x0 > x1) continue;
      const gy = groundY((p.x0 + p.x1) / 2);
      if (p.state === 'open') {
        s.fillStyle = '#0b161d';
        s.beginPath();
        s.ellipse((p.x0 + p.x1) / 2, gy + 6, (p.x1 - p.x0) / 2, 9, 0, 0, Math.PI * 2);
        s.fill();
        s.fillStyle = 'rgba(200,225,235,0.7)';
        for (let i = 0; i < 6; i++) {
          const sx = p.x0 + 10 + ((hash(167, i + p.x0) + 1) / 2) * (p.x1 - p.x0 - 20);
          s.fillRect(sx + Math.sin(t * 2 + i) * 2, gy + 3 + (i % 3), 8 + (i % 3) * 3, 2);
        }
        // Over its last seconds the water skins over with new ice, closing in from the edges.
        const skin = clamp01((p.t - (LAKE.openFor - 2.5)) / 2.5);
        if (skin > 0) {
          s.fillStyle = `rgba(70,96,110,${0.85 * skin})`;
          s.beginPath();
          s.ellipse((p.x0 + p.x1) / 2, gy + 6, (p.x1 - p.x0) / 2, 9, 0, 0, Math.PI * 2);
          s.fill();
        }
        continue;
      }
      // Seen clearly unless the whiteout hides it; the lantern's flame shows what is close to her even then.
      const near = flame && Math.abs(e.x - (p.x0 + p.x1) / 2) < 160 ? 1 : 0;
      const see = Math.max(near, 1 - 0.95 * game.whiteout);
      const k = Math.min(1, p.stand / 0.8);
      // Thin ice is dark and clear, with the black water showing through it.
      s.fillStyle = `rgba(14,30,40,${0.75 * see})`;
      s.beginPath();
      s.ellipse((p.x0 + p.x1) / 2, gy + 9, (p.x1 - p.x0) / 2, 9, 0, 0, Math.PI * 2);
      s.fill();
      s.strokeStyle = `rgba(150,190,210,${0.6 * see})`;
      s.lineWidth = 1;
      s.stroke();
      s.strokeStyle = `rgba(235,246,252,${(0.75 + 0.25 * k) * see})`;
      s.lineWidth = 1.4 + 1.6 * k;
      s.beginPath();
      for (let i = 0; i < 4; i++) {
        let x = p.x0 + 12 + i * ((p.x1 - p.x0 - 24) / 3);
        let y = gy + 4;
        s.moveTo(x, y);
        for (let j = 0; j < 3; j++) {
          x += 8 + hash(173, i * 7 + j + p.x0) * 10;
          y += hash(179, i * 5 + j + p.x0) * 4;
          s.lineTo(x, y);
        }
      }
      s.stroke();
    }
  }

  // Breaking through: water thrown up and ice shards.
  drawSplash(s, game, t) {
    const sp = game.ember.splash;
    if (!sp) return;
    const k = sp.t / 1.6;
    const gy = groundY(sp.x);
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI * (0.15 + 0.7 * (i / 13));
      const d = 20 + 90 * k * (0.6 + 0.4 * hash(181, i));
      const x = sp.x + Math.cos(a) * d;
      const y = gy + Math.sin(a) * d * (1.2 - k) + 60 * k * k;
      s.fillStyle = `rgba(210,232,242,${0.8 * (1 - k)})`;
      s.fillRect(x, y, 3, 3);
    }
  }

  // The lake at night is darker than anywhere else: she sees by her own coal, and further with the lantern's flame.
  drawLakeDark(s, game, t) {
    if (!game.level.dark) return;
    const e = game.ember;
    const R = (game.hasFlame() ? 330 : 190) + game.glowRadius();
    const g = s.createRadialGradient(e.x, e.y, R * 0.2, e.x, e.y, R);
    g.addColorStop(0, 'rgba(2,5,9,0)');
    g.addColorStop(0.6, 'rgba(2,5,9,0.55)');
    g.addColorStop(1, 'rgba(2,5,9,0.86)');
    s.fillStyle = g;
    s.fillRect(game.camX - 20, 0, VIEW.w + 40, VIEW_H);
  }

  // The whiteout: blowing snow closes in until almost nothing shows but a little space around her.
  drawWhiteout(s, game, t) {
    const w = game.whiteout || 0;
    if (w < 0.01) return;
    const e = game.ember;
    const R = 70 + game.glowRadius() * 0.4;
    const g = s.createRadialGradient(e.x, e.y, R * 0.3, e.x, e.y, R * 2.2);
    g.addColorStop(0, `rgba(226,236,242,${0.15 * w})`);
    g.addColorStop(1, `rgba(226,236,242,${0.93 * w})`);
    s.fillStyle = g;
    s.fillRect(game.camX - 20, 0, VIEW.w + 40, VIEW_H);
  }

  // Freezing rain in the ice storm: fast, slanting streaks that glint.
  drawRain(s, game, t) {
    const e = game.ember;
    let k = 0;
    for (const st of game.level.storms || []) {
      const d = Math.min(e.x - st.x0, st.x1 - e.x);
      k = Math.max(k, Math.max(0, Math.min(1, d / 300 + 0.3)));
    }
    if (k <= 0.01) return;
    s.strokeStyle = `rgba(215,232,242,${0.7 * k})`;
    s.lineWidth = 1.4;
    s.beginPath();
    for (let i = 0; i < 160; i++) {
      const x = ((hash(191, i) + 1) / 2) * (VIEW.w + 200) - 100;
      const y = (((hash(193, i) + 1) / 2) * VIEW_H + t * (900 + 300 * hash(197, i))) % (VIEW_H + 40) - 20;
      s.moveTo(x - ((y * 0.18) % 60), y);
      s.lineTo(x - ((y * 0.18) % 60) - 6, y + 18);
    }
    s.stroke();
  }

  // ---------- Stage features: the ice cave, the snow bridge, rocks, the cairn, the old camp ----------

  drawStageGround(s, cam, game, t) {
    const L = game.level;
    const x0 = cam - 60;
    const x1 = cam + VIEW.w + 60;
    this.drawCave(s, x0, x1, game, t);
    if (game.bridge) this.drawBridge(s, game.bridge, t);
    for (const rx of L.rocks || []) if (rx > x0 - 100 && rx < x1 + 100) this.drawRock(s, rx);
    if (L.cairn) this.drawCairn(s, L.cairn.x, t, game.wind.strength);
    if (L.camp) this.drawCamp(s, L.camp.x, t);
    if (L.lake) this.drawIce(s, game, x0, x1, t);
    const end = endingLook(game);
    if (end) this.drawSpring(s, game, x0, x1, t, end);
    for (const h of game.homes || []) {
      if (h.x + h.w < x0 || h.x - h.w > x1) continue;
      this.drawHouse(s, h, h.lit, 1 - 0.45 * h.lit, t, game.wind.strength);
    }
  }

  // The cave under the ridge: the space between the ridge's underside and the gully floor.
  cavePath(s, a, b) {
    const low = lowerRoute();
    s.beginPath();
    for (let x = a; x <= b; x += 8) {
      const y = Math.min(low.ceiling(x), low.floor(x));
      if (x === a) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    for (let x = b; x >= a; x -= 8) s.lineTo(x, low.floor(x));
    s.closePath();
  }

  drawCave(s, x0, x1, game, t) {
    const low = lowerRoute();
    if (!low) return;
    const a = Math.max(x0, low.x0);
    const b = Math.min(x1, low.x1);
    if (a >= b) return;
    this.cavePath(s, a, b);
    const g = s.createLinearGradient(0, 430, 0, 700);
    g.addColorStop(0, '#2a4655');
    g.addColorStop(0.5, '#1c3240');
    g.addColorStop(1, '#122430');
    s.fillStyle = g;
    s.fill();
    s.save();
    this.cavePath(s, a, b);
    s.clip();
    // Pale seams of old ice in the walls.
    for (let x = Math.floor(a / 60) * 60; x < b; x += 60) {
      const h = hash(61, x);
      s.strokeStyle = `rgba(150,200,220,${0.08 + 0.06 * h})`;
      s.lineWidth = 1;
      s.beginPath();
      s.moveTo(x, low.ceiling(x) + 10);
      s.quadraticCurveTo(x + 20 * h, (low.ceiling(x) + low.floor(x)) / 2, x - 10, low.floor(x) - 6);
      s.stroke();
    }
    s.restore();
    // Icicles hanging from the ridge's underside.
    s.fillStyle = 'rgba(190,225,240,0.55)';
    for (let x = Math.floor(a / 23) * 23; x < b; x += 23) {
      const c = low.ceiling(x);
      const room = low.floor(x) - c;
      if (room < 70) continue;
      const len = 8 + (hash(67, x) + 1) * 14;
      s.beginPath();
      s.moveTo(x - 3, c);
      s.lineTo(x, c + len);
      s.lineTo(x + 3, c);
      s.closePath();
      s.fill();
    }
    // The cave floor: hard, pale ice.
    s.strokeStyle = 'rgba(200,232,245,0.45)';
    s.lineWidth = 2;
    s.beginPath();
    for (let x = a; x <= b; x += 8) (x === a ? s.moveTo : s.lineTo).call(s, x, low.floor(x));
    s.stroke();
  }

  // The snow bridge on the ridge: a hairline crack that widens as it takes weight, then a hole into the cave.
  drawBridge(s, br, t) {
    const low = lowerRoute();
    if (!br.intact) {
      s.beginPath();
      for (let x = br.x0; x <= br.x1; x += 6) {
        const y = groundY(x) - 2 + hash(71, x) * 4;
        if (x === br.x0) s.moveTo(x, y);
        else s.lineTo(x, y);
      }
      for (let x = br.x1; x >= br.x0; x -= 6) s.lineTo(x, low.ceiling(x) + 2);
      s.closePath();
      s.fillStyle = '#16293a';
      s.fill();
      return;
    }
    const k = Math.min(1, br.stress / 1.0);
    // The snow over the gap sags a little and is a shade darker: thin snow with nothing under it.
    s.fillStyle = 'rgba(70,95,110,0.28)';
    s.beginPath();
    s.moveTo(br.x0, groundY(br.x0));
    for (let x = br.x0; x <= br.x1; x += 6) s.lineTo(x, groundY(x) + 1 + Math.sin(((x - br.x0) / (br.x1 - br.x0)) * Math.PI) * 3);
    for (let x = br.x1; x >= br.x0; x -= 6) s.lineTo(x, groundY(x) + 9);
    s.closePath();
    s.fill();
    s.strokeStyle = `rgba(20,36,46,${0.6 + 0.4 * k})`;
    s.lineWidth = 1.4 + 2.2 * k;
    s.beginPath();
    for (let x = br.x0 + 6; x <= br.x1 - 6; x += 9) {
      const y = groundY(x) + 2 + hash(73, x) * (1.5 + 3 * k);
      if (x === br.x0 + 6) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    s.stroke();
    // The tell: a faint glint where the snow is thin.
    const g = Math.pow(Math.max(0, Math.sin(t * 1.3 + 2)), 10);
    if (g > 0.02) {
      const gx = (br.x0 + br.x1) / 2 + Math.sin(t * 0.7) * 30;
      const gy = groundY(gx) + 1;
      s.strokeStyle = `rgba(240,250,255,${0.8 * g})`;
      s.lineWidth = 1;
      s.beginPath();
      s.moveTo(gx - 6, gy);
      s.lineTo(gx + 6, gy);
      s.moveTo(gx, gy - 6);
      s.lineTo(gx, gy + 6);
      s.stroke();
    }
  }

  // A boulder to hide behind. Snow drifts up on its sheltered (left) side.
  drawRock(s, x) {
    const gy = groundY(x);
    const r = rng(Math.floor(x));
    s.fillStyle = '#1b2830';
    s.beginPath();
    s.moveTo(x - 62, gy + 4);
    s.quadraticCurveTo(x - 58, gy - 52 - r() * 10, x - 18, gy - 70 - r() * 8);
    s.quadraticCurveTo(x + 22, gy - 76, x + 44, gy - 40 - r() * 8);
    s.quadraticCurveTo(x + 58, gy - 14, x + 56, gy + 4);
    s.closePath();
    s.fill();
    // Wind-polished face on the right, snow cap on top.
    s.strokeStyle = 'rgba(160,190,205,0.25)';
    s.lineWidth = 2;
    s.beginPath();
    s.moveTo(x + 10, gy - 72);
    s.quadraticCurveTo(x + 46, gy - 50, x + 54, gy - 6);
    s.stroke();
    s.fillStyle = 'rgba(222,236,244,0.92)';
    s.beginPath();
    s.moveTo(x - 46, gy - 50);
    s.quadraticCurveTo(x - 12, gy - 84, x + 20, gy - 72);
    s.quadraticCurveTo(x - 10, gy - 70, x - 46, gy - 50);
    s.fill();
    // The drift in its lee.
    s.fillStyle = '#9fb6c2';
    s.beginPath();
    s.moveTo(x - 60, gy - 30);
    s.quadraticCurveTo(x - 90, gy - 6, x - 140, gy + 3);
    s.lineTo(x - 56, gy + 4);
    s.closePath();
    s.fill();
  }

  // Stones stacked where the path splits, with a strip of cloth snapping in the wind.
  drawCairn(s, x, t, ws) {
    const gy0 = groundY(x);
    // Drawn large, so the split reads from a distance against the snow.
    s.save();
    s.translate(x, gy0);
    s.scale(1.7, 1.7);
    s.translate(-x, -gy0);
    const gy = gy0;
    const stones = [[0, 0, 17, 9], [2, -15, 13, 8], [-1, -28, 10, 7], [1, -38, 7, 5]];
    for (const [dx, dy, rx, ry] of stones) {
      s.fillStyle = '#25343d';
      s.beginPath();
      s.ellipse(x + dx, gy + dy - ry + 2, rx, ry, 0, 0, Math.PI * 2);
      s.fill();
      s.fillStyle = 'rgba(220,234,242,0.8)';
      s.beginPath();
      s.ellipse(x + dx - 2, gy + dy - ry * 1.6 + 2, rx * 0.7, ry * 0.3, 0, Math.PI, 0);
      s.fill();
    }
    s.strokeStyle = '#2a1c14';
    s.lineWidth = 2;
    s.beginPath();
    s.moveTo(x + 1, gy - 42);
    s.lineTo(x + 1, gy - 70);
    s.stroke();
    s.fillStyle = '#c4492c';
    s.beginPath();
    s.moveTo(x + 1, gy - 70);
    for (let i = 1; i <= 5; i++) {
      const q = i / 5;
      s.lineTo(x + 1 - q * (22 + 18 * ws), gy - 70 + Math.sin(t * (4 + 8 * ws) + q * 5) * (2 + 3 * q));
    }
    s.lineTo(x + 1 - (22 + 18 * ws), gy - 62 + Math.sin(t * (4 + 8 * ws) + 5) * 4);
    s.lineTo(x + 1, gy - 63);
    s.closePath();
    s.fill();
    s.restore();
  }

  // What is left of the fire she rested by at the end of the last stage: charred logs, a few live coals, smoke.
  drawCamp(s, x, t) {
    const b = groundY(x) + 4;
    s.strokeStyle = '#1c130c';
    s.lineWidth = 7;
    s.lineCap = 'round';
    s.beginPath();
    s.moveTo(x - 26, b - 2);
    s.lineTo(x + 22, b - 9);
    s.moveTo(x + 26, b - 2);
    s.lineTo(x - 22, b - 9);
    s.stroke();
    s.lineCap = 'butt';
    for (let i = 0; i < 5; i++) {
      const hot = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
      s.fillStyle = `rgba(255,${120 + 60 * hot},60,${0.5 + 0.4 * hot})`;
      s.fillRect(x - 14 + i * 7, b - 8 + (i % 2) * 2, 3, 2);
    }
    for (let i = 0; i < 5; i++) {
      const q = (t * 0.25 + i / 5) % 1;
      s.fillStyle = `rgba(190,200,206,${0.22 * (1 - q)})`;
      s.beginPath();
      s.arc(x + Math.sin(q * 5 + i) * 8 - q * 30, b - 14 - q * 90, 4 + q * 10, 0, Math.PI * 2);
      s.fill();
    }
  }

  // The cave is dark. Inside, she sees only by her own light, or by the lantern's flame if she carries it.
  drawCaveDark(s, game, t) {
    const low = lowerRoute();
    if (!low) return;
    const a = Math.max(game.camX - 60, low.x0);
    const b = Math.min(game.camX + VIEW.w + 60, low.x1);
    if (a >= b) return;
    const e = game.ember;
    const inside = e.low && inLower(e.x);
    const flame = game.hasFlame();
    s.save();
    this.cavePath(s, a, b);
    // The broken bridge opens the cave to the surface: the hole is part of the dark too.
    const br = game.bridge;
    if (br && !br.intact) {
      s.moveTo(br.x0, groundY(br.x0) - 2);
      for (let x = br.x0; x <= br.x1; x += 6) s.lineTo(x, groundY(x) - 2);
      for (let x = br.x1; x >= br.x0; x -= 6) s.lineTo(x, low.ceiling(x) + 2);
      s.closePath();
    }
    s.clip();
    if (inside) {
      const R = flame ? 440 : 90 + game.glowRadius() * 0.7;
      const g = s.createRadialGradient(e.x, e.y, R * 0.2, e.x, e.y, R);
      g.addColorStop(0, 'rgba(3,7,10,0)');
      g.addColorStop(1, `rgba(3,7,10,${flame ? 0.5 : 0.95})`);
      s.fillStyle = g;
    } else {
      s.fillStyle = 'rgba(3,7,10,0.72)';
    }
    s.fillRect(a, 0, b - a, VIEW_H);
    if (inside && flame) {
      s.globalCompositeOperation = 'lighter';
      glow(s, e.x, e.y - 30, 360, '255,160,80', 0.16 + 0.03 * Math.sin(t * 7));
    }
    s.restore();
  }

  drawObject(s, o, t) {
    if (o.state === 'lost') {
      this.drawLost(s, o, t);
      return;
    }
    if (o.gone) return;
    const warm = o.state === 'thawed' ? 1 : o.state === 'melting' ? o.meltT : 0;
    if (o.type === 'tree') this.drawPine(s, o.x, floorY(o.x, o.low) + 6, 175, o.seed, warm);
    else if (o.type === 'lantern') this.drawLantern(s, o, warm, t);
    else if (o.type === 'wanderer') this.drawWanderer(s, o, warm, t);
    else if (o.type === 'hearth') this.drawHearth(s, o, warm, t);
  }

  // The village hearth: the ring of stones from the prologue, crusted with ice. Each pulse leaves the stones
  // glowing a little more; as it catches, the fire grows out of them.
  drawHearth(s, o, warm, t) {
    const hb = groundY(o.x) + 4;
    for (let k = -3; k <= 3; k++) {
      s.fillStyle = mix('#7d909b', '#5b5047', warm);
      s.beginPath();
      s.ellipse(o.x + k * 11, hb - 2 + Math.abs(k) * 0.6, 6.5, 4.5, 0, 0, Math.PI * 2);
      s.fill();
    }
    // Ice over the stones and the dead ashes, thinning as it is warmed.
    const ice = o.state === 'frozen' ? 1 - 0.7 * (o.progress / o.pulses) : 1 - warm;
    if (ice > 0.02) {
      s.fillStyle = `rgba(220,236,244,${0.75 * ice})`;
      s.beginPath();
      s.ellipse(o.x, hb - 6, 44, 9 + 4 * ice, 0, Math.PI, 0);
      s.fill();
    }
    const heat = o.state === 'frozen' ? o.progress / o.pulses : 1;
    if (heat > 0) {
      s.save();
      s.globalCompositeOperation = 'lighter';
      glow(s, o.x, hb - 6, 30 + 40 * heat, '255,140,60', 0.15 + 0.3 * heat);
      s.restore();
    }
    if (o.state === 'melting') {
      s.save();
      s.translate(o.x, hb);
      s.scale(o.meltT, o.meltT);
      s.translate(-o.x, -hb);
      this.drawFire(s, { x: o.x }, t);
      s.restore();
    }
  }

  // What the cold took at a fork sinks into the snow and is gone, leaving only a low drift.
  drawLost(s, o, t) {
    const age = t - o.lostAt;
    const sink = clamp01((age - 1) / 2.6);
    if (sink < 1) {
      s.save();
      // Clip to above the snow line, so the part that has sunk is hidden.
      s.beginPath();
      s.moveTo(o.x - 200, -10);
      s.lineTo(o.x + 200, -10);
      for (let x = o.x + 200; x >= o.x - 200; x -= 10) s.lineTo(x, groundY(x) + 2);
      s.closePath();
      s.clip();
      s.translate(0, sink * sink * 150);
      s.globalAlpha = 1 - 0.5 * sink;
      if (o.type === 'lantern') this.drawLantern(s, o, 0, t);
      else if (o.type === 'wanderer') this.drawWanderer(s, o, 0, t);
      s.restore();
    }
    const m = clamp01((age - 1) / 2);
    if (m > 0) {
      s.fillStyle = 'rgba(208,224,234,0.95)';
      s.beginPath();
      s.ellipse(o.x, groundY(o.x) + 3, 22 + 16 * m, 8 * m, 0, Math.PI, 0);
      s.fill();
    }
  }

  // A layered pine with drooping, uneven branches and snow on each tier.
  drawPine(s, x, base, h, seed, warm) {
    const r = rng(seed);
    s.fillStyle = mix('#0f1b22', '#2b1a10', warm);
    s.fillRect(x - 3.5, base - 30, 7, 30);
    const body = mix('#152730', '#1f3d2e', warm);
    const snow = mix('#9fbccb', '#f4d79e', warm);
    const tiers = 7;
    for (let k = 0; k < tiers; k++) {
      const f = k / tiers;
      const y = base - 22 - f * (h - 34);
      const half = (1 - f) * h * 0.34 + 8;
      const apex = y - (h / tiers) * 1.5;
      const droop = 6 + (1 - f) * 6;
      s.beginPath();
      s.moveTo(x, apex);
      for (let i = 1; i <= 3; i++) {
        const p = i / 3;
        s.lineTo(x + half * p * (0.86 + r() * 0.12), apex + (y - apex) * p + droop * 0.4);
        if (i < 3) s.lineTo(x + half * p * 0.78, apex + (y - apex) * p - 2);
      }
      s.quadraticCurveTo(x, y + droop * 0.6, x - half * (0.9 + r() * 0.08), y + droop * 0.4);
      for (let i = 2; i >= 1; i--) {
        const p = i / 3;
        s.lineTo(x - half * p * 0.78, apex + (y - apex) * p - 2);
        s.lineTo(x - half * p * (0.86 + r() * 0.12), apex + (y - apex) * p + droop * 0.4);
      }
      s.closePath();
      s.fillStyle = body;
      s.fill();
      // Snow sits on the upper left of each tier; warm light catches the right edge once thawed.
      s.strokeStyle = snow;
      s.lineWidth = 2.5;
      s.beginPath();
      s.moveTo(x, apex + 1);
      s.lineTo(x - half * 0.62, apex + (y - apex) * 0.66);
      s.stroke();
      if (warm > 0) {
        s.strokeStyle = `rgba(255,190,110,${0.7 * warm})`;
        s.lineWidth = 1.5;
        s.beginPath();
        s.moveTo(x + 1, apex + 2);
        s.lineTo(x + half * 0.8, apex + (y - apex) * 0.9);
        s.stroke();
      }
    }
  }

  drawLantern(s, o, warm, t) {
    const x = o.x;
    const b = floorY(x, o.low) + 6;
    s.fillStyle = mix('#13222b', '#3a2715', warm);
    s.fillRect(x - 3, b - 118, 6, 118);
    s.fillRect(x - 3, b - 118, 24, 4);
    s.fillRect(x + 14, b - 114, 2, 6);
    const lx = o.x + 16;
    const ly = floorY(o.x, o.low) - 92;
    const flicker = 0.85 + 0.15 * Math.sin(t * 9 + o.seed);
    s.fillStyle = warm > 0 ? `rgba(255,212,130,${warm * flicker})` : 'rgba(110,150,170,0.35)';
    roundRect(s, lx - 8, ly - 11, 16, 22, 3);
    s.fill();
    s.strokeStyle = mix('#233a47', '#6b4520', warm);
    s.lineWidth = 2;
    s.stroke();
    // A cap of snow on the lamp.
    s.fillStyle = mix('#9fbccb', '#f4d79e', warm);
    roundRect(s, lx - 10, ly - 15, 20, 5, 2);
    s.fill();
  }

  // How visible a lucky ember is: it warms up into view, then cools and fades near the end of its life.
  pickupFade(p) {
    return clamp01(p.t / 0.8) * clamp01((p.life - p.t) / 4);
  }

  // A coal half-buried in the snow: dark stone, glowing cracks, a thread of smoke and the odd spark.
  drawPickups(s, game, t) {
    for (const p of game.pickups) {
      const k = this.pickupFade(p);
      if (k <= 0) continue;
      const x = p.x;
      const y = floorY(x, p.low) + 1;
      const r = rng(p.seed);
      s.globalAlpha = k;
      s.fillStyle = '#1a1410';
      s.beginPath();
      s.ellipse(x, y, 11, 6.5, 0, Math.PI, 0);
      s.fill();
      s.beginPath();
      s.ellipse(x + 7, y + 0.5, 6, 4, 0.2, Math.PI, 0);
      s.fill();
      const hot = 0.75 + 0.25 * Math.sin(t * 6 + p.seed);
      s.strokeStyle = `rgba(255,${Math.round(150 + 60 * hot)},70,${hot})`;
      s.lineWidth = 1.3;
      s.beginPath();
      for (let i = 0; i < 3; i++) {
        const sx = x - 7 + r() * 14;
        s.moveTo(sx, y - 1);
        s.lineTo(sx + (r() - 0.5) * 6, y - 3 - r() * 3);
      }
      s.stroke();
      s.fillStyle = `rgba(255,190,110,${0.9 * hot})`;
      s.beginPath();
      s.ellipse(x - 1, y - 1.5, 4, 1.6, 0, 0, Math.PI * 2);
      s.fill();
      for (let i = 0; i < 4; i++) {
        const q = (t * 0.5 + i / 4 + p.seed * 0.001) % 1;
        s.fillStyle = `rgba(200,205,210,${0.25 * (1 - q)})`;
        s.beginPath();
        s.arc(x + Math.sin(q * 6 + i) * 4, y - 8 - q * 40, 2 + q * 4, 0, Math.PI * 2);
        s.fill();
        if (i < 2) {
          s.fillStyle = `rgba(255,190,100,${0.8 * (1 - q)})`;
          s.fillRect(x + Math.sin(q * 9 + i * 2) * 6, y - 4 - q * 30, 1.5, 1.5);
        }
      }
      s.globalAlpha = 1;
    }
  }

  // A frozen wanderer: the same figure as a companion, still and drained of color.
  drawWanderer(s, o, warm, t) {
    // A companion who froze again keeps the body they had.
    const fig = this.figures[o.figId ?? o.home];
    if (fig) fig.ref.low = !!o.low;
    if (o.buried && !o.relapsed) {
      this.drawBuried(s, o, fig, warm, t);
      return;
    }
    // Their fire went out with everyone else's: no pot, arms wrapped round themselves.
    if (fig) fig.draw(s, { frozen: 1 - warm, glow: 0, pot: false, t, ground: SNOW_GROUND });
  }

  drawFire(s, f, t) {
    const x = f.x;
    const b = groundY(x) + 4;
    s.strokeStyle = '#24160c';
    s.lineWidth = 7;
    s.lineCap = 'round';
    s.beginPath();
    s.moveTo(x - 26, b - 2);
    s.lineTo(x + 22, b - 13);
    s.moveTo(x + 26, b - 2);
    s.lineTo(x - 22, b - 13);
    s.stroke();
    s.lineCap = 'butt';
    s.save();
    s.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 5; k++) {
      const h = 70 + 18 * Math.sin(t * 6 + k * 1.7) - Math.abs(k - 2) * 12;
      const fw = 26 - Math.abs(k - 2) * 4;
      const xo = x + (k - 2) * 9 + Math.sin(t * 4 + k) * 3;
      const g = s.createLinearGradient(0, b, 0, b - h);
      g.addColorStop(0, 'rgba(255,130,40,0.85)');
      g.addColorStop(0.6, 'rgba(255,185,90,0.5)');
      g.addColorStop(1, 'rgba(255,225,150,0)');
      s.fillStyle = g;
      s.beginPath();
      s.moveTo(xo - fw / 2, b - 8);
      s.quadraticCurveTo(xo - fw / 2, b - h * 0.6, xo, b - h);
      s.quadraticCurveTo(xo + fw / 2, b - h * 0.6, xo + fw / 2, b - 8);
      s.closePath();
      s.fill();
    }
    for (let i = 0; i < 10; i++) {
      const p = (t * 0.6 + i / 10) % 1;
      const sx = x + Math.sin(i * 3.1 + t * 2) * 18 * p;
      s.fillStyle = `rgba(255,190,100,${0.8 * (1 - p)})`;
      s.fillRect(sx, b - 30 - p * 140, 2, 2);
    }
    s.restore();
  }

  drawLights(s, game, t) {
    s.save();
    s.globalCompositeOperation = 'lighter';
    const f = game.fire;
    const fb = groundY(f.x) - 30;
    if (!f.cold) {
      glow(s, f.x, fb, 340 * (1 + 0.04 * Math.sin(t * 7)), '255,150,60', 0.3);
      glow(s, f.x, fb, 120, '255,200,120', 0.35);
    }
    // Lit windows in the street.
    for (const h of game.homes || []) {
      if (h.lit > 0) glow(s, h.x + h.w * 0.19, groundY(h.x) - h.h * 0.4, 80, '255,190,110', 0.34 * h.lit);
    }
    for (const o of game.objects) {
      const b = o.bounds;
      if (o.state === 'melting') glow(s, b.cx, b.cy, 60 + 60 * o.meltT, '240,170,80', 0.2 * o.meltT);
      if (o.state !== 'thawed') continue;
      if (o.type === 'lantern') {
        glow(s, o.x + 16, floorY(o.x, o.low) - 92, o.radius * (0.4 + 0.6 * o.spread) * (1 + 0.03 * Math.sin(t * 8)), '255,190,100', 0.38);
      } else {
        glow(s, b.cx, b.cy, 60 + 200 * o.spread, '240,170,80', (o.gone ? 0.14 : 0.18) * o.spread);
      }
    }
    for (const c of game.companions) glow(s, c.x, c.y, 46, '255,215,160', 0.3);
    for (const p of game.pickups) {
      const k = this.pickupFade(p) * (0.85 + 0.15 * Math.sin(t * 7 + p.seed));
      glow(s, p.x, floorY(p.x, p.low) - 6, 70, '255,150,60', 0.4 * k);
    }
    const e = game.ember;
    const dim = 1 - game.lightsOutAlpha();
    glow(s, e.x, e.y, game.glowRadius(), '255,200,140', 0.28 * dim);
    glow(s, e.x, floorY(e.x, e.low), game.glowRadius() * 0.7, '255,190,120', 0.18 * dim);
    s.restore();
  }

  drawMist(s, t) {
    this.mistBlobs.forEach((blobs) => {
      for (const m of blobs) glow(s, m.x + Math.sin(t * 0.2 * m.sp + m.x) * 30, m.y, m.r, '200,218,230', 0.14);
    });
  }

  // Sparks arcing from one pot to another as fire is shared.
  drawSparkTrail(s, from, to, p) {
    s.save();
    s.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const q = clamp01(p * 1.25 - i * 0.04);
      if (q <= 0 || q >= 1) continue;
      const x = from.x + (to.x - from.x) * q;
      const y = from.y + (to.y - from.y) * q - Math.sin(q * Math.PI) * 26;
      s.fillStyle = `rgba(255,${190 - i * 8},110,${0.9 - i * 0.1})`;
      s.beginPath();
      s.arc(x, y, 2.4 - i * 0.25, 0, Math.PI * 2);
      s.fill();
    }
    s.restore();
  }

  // The player and companions: bundled villagers carrying their fire in clay pots.
  drawFigures(s, game, dt, t) {
    const e = game.ember;
    const w = game.displayWarmth();
    const dim = 1 - game.lightsOutAlpha();
    // Cloaks and scarves stream out in a gust; the wind blows from the right.
    const wind = -70 - 520 * game.wind.strength * (game.wind.exposed ? 1 : 0.3);
    if (Math.abs(this.player.x - e.x) > 200) this.player = new Character(e.x, PLAYER_SCALE, {}, e.facing, (fx) => floorY(fx, this.lowNow));
    // Falling through the snow bridge: drawn above the cave floor at first, dropping to it.
    const fall = e.fall && e.fall.t < 0.7 ? e.fall : null;
    const drop = fall ? -fall.dy * (1 - (fall.t / 0.7) ** 2) : 0;
    for (const c of game.companions) {
      const fig = this.figureFor(c.home, c.x, c.low, c.facing);
      fig.ref.low = c.low;
      fig.update(dt, c.x, c.facing, wind, t);
      // The fire passes from her pot to theirs as they join: a few sparks, then their own coal glows.
      const since = t - (c.joinedAt ?? -99);
      const lit = clamp01((since - 0.7) / 0.5);
      s.save();
      if (drop && c.low) s.translate(0, drop);
      fig.draw(s, { glow: 0.55 * dim * lit, t, dt, pot: true, pulsing: game.pulsing, beat: game.pulsing ? game.beatEnvelope() : 0, ground: SNOW_GROUND });
      s.restore();
      if (since < 1.3) this.drawSparkTrail(s, this.player.chest(), fig.chest(), since / 1.3);
    }
    const steps = this.player.footfalls;
    this.player.update(dt, e.x, e.facing, wind, t);
    if (this.player.footfalls > steps) game.audio.footstep();
    let glow = Math.min(1.4, (w < THRESHOLDS.heavy ? 0.15 + 0.35 * (w / THRESHOLDS.heavy) : 0.5 + 0.5 * (w / 100)) + 0.6 * game.flare) * dim;
    const it = game.intro;
    if (it && it.kind !== 'walk' && it.t < game.introLock()) {
      // Rising out of the snow: hidden below the snow line, lifting up, the ember brightening as it comes.
      const k = smooth01((it.t - 0.4) / 2.2);
      glow *= 0.25 + 0.75 * smooth01((it.t - 1.4) / 1.2);
      s.save();
      s.beginPath();
      s.moveTo(e.x - 120, -10);
      s.lineTo(e.x + 120, -10);
      for (let x = e.x + 120; x >= e.x - 120; x -= 10) s.lineTo(x, groundY(x) + 2);
      s.closePath();
      s.clip();
      s.translate(0, (1 - k) * 100);
      this.player.draw(s, { glow, t, dt, pulsing: false, beat: 0, ground: SNOW_GROUND });
      s.restore();
      return;
    }
    // Bracing against a gust: she crouches and leans into the wind.
    this.brace = (this.brace || 0) + ((e.braced ? 1 : 0) - (this.brace || 0)) * Math.min(1, dt * 8);
    s.save();
    if (drop) s.translate(0, drop);
    if (this.brace > 0.01) {
      const fy = floorY(e.x, e.low);
      s.translate(e.x, fy);
      s.rotate(0.14 * this.brace);
      s.scale(1, 1 - 0.14 * this.brace);
      s.translate(-e.x, -fy);
    }
    this.player.draw(s, { glow, t, dt, pulsing: game.pulsing, beat: game.beatEnvelope(), ground: SNOW_GROUND });
    s.restore();
  }

  // Falling snow. In the wind it is driven sideways into streaks: the first warning that a gust is coming.
  drawSnow(s, cam, dt, t, ws = 0) {
    for (const f of this.snow) {
      f.y += f.vy * (1 - 0.6 * ws) * dt;
      f.x += (f.vx - 900 * ws * f.par + Math.sin(t + f.ph) * 8) * dt;
      if (f.y > VIEW_H) f.y -= VIEW_H;
      const x = (((f.x - cam * f.par) % VIEW.w) + VIEW.w) % VIEW.w;
      s.fillStyle = `rgba(225,238,248,${0.22 * f.s * (1 + ws) * (this.snowFade ?? 1)})`;
      if (ws > 0.12) s.fillRect(x, f.y, f.s + 40 * ws * f.par, Math.max(0.8, f.s * 0.6));
      else s.fillRect(x, f.y, f.s, f.s);
    }
    // Spindrift: long low streaks of blown snow.
    if (ws > 0.05) {
      for (let i = 0; i < 18; i++) {
        const sp = 1400 + hash(83, i) * 900;
        const x = VIEW.w - (((t * sp + hash(89, i) * 5000) % (VIEW.w + 400)));
        const y = 380 + (hash(97, i) + 1) * 150;
        s.fillStyle = `rgba(230,242,250,${0.18 * ws})`;
        s.fillRect(x, y, 120 + 160 * ws, 1.5);
      }
    }
  }

  drawNear(s, cam, open = false) {
    s.strokeStyle = '#151f26';
    for (const n of this.near) {
      const x = n.x - cam * 1.35;
      if (x < -300 || x > VIEW.w + 300) continue;
      // Out on the open lake nothing grows; only the drifts are left.
      if (open && n.kind !== 'drift') continue;
      if (n.kind === 'drift') {
        s.fillStyle = C.near;
        s.beginPath();
        s.ellipse(x, VIEW_H + 18, n.w, n.h, 0, Math.PI, 0);
        s.fill();
        s.strokeStyle = 'rgba(200,220,232,0.35)';
        s.lineWidth = 2;
        s.beginPath();
        s.ellipse(x, VIEW_H + 18, n.w, n.h, 0, Math.PI * 1.15, Math.PI * 1.85);
        s.stroke();
        s.strokeStyle = '#151f26';
      } else {
        const r = rng(n.seed);
        s.lineCap = 'round';
        s.lineWidth = 6;
        s.beginPath();
        s.moveTo(x, VIEW_H + 10);
        let px = x, py = VIEW_H + 10;
        for (let i = 0; i < 4; i++) {
          const nx = px + (r() - 0.4) * 40;
          const ny = py - 30 - r() * 30;
          s.lineTo(nx, ny);
          s.lineWidth = 6 - i;
          px = nx;
          py = ny;
          if (r() < 0.7) {
            s.moveTo(px, py);
            s.lineTo(px + (r() - 0.5) * 60, py - 10 - r() * 25);
            s.moveTo(px, py);
          }
        }
        s.stroke();
        s.lineCap = 'butt';
      }
    }
  }

  // ---------- The frost on the glass ----------

  // Every clear patch: the ember's own warmth, thawed things, the fire and companions.
  holes(game) {
    const t = game.time;
    const e = game.ember;
    const w = game.displayWarmth();
    const fadeAll = game.mode === 'stageEnd' || game.mode === 'transition' ? 1 - 0.85 * clamp01((game.stageEndT - 2.5) / 1.5) : 1;
    const out = [];

    let breath = 0;
    for (const r of game.rings) if (r.strong) breath = Math.max(breath, 1 - (r.t / PULSE.ringSeconds) * 1.4);
    let er = w < THRESHOLDS.heavy ? 14 + 18 * (w / THRESHOLDS.heavy) : 40 + 75 * (w / 100);
    if (game.intro && game.intro.kind !== 'walk') er *= smooth01((game.intro.t - 2.0) / 1.4);
    out.push({ x: e.x, y: e.y, R: er + 34 * Math.max(0, breath), seed: 1, a: (1 - game.lightsOutAlpha()) * fadeAll });

    // As the cold takes hold, frost creeps back over what was thawed.
    const regrow = 0.1 + 0.9 * clamp01((w - THRESHOLDS.heavy) / (THRESHOLDS.frost - THRESHOLDS.heavy));
    for (const p of game.pickups) out.push({ x: p.x, y: floorY(p.x, p.low) - 10, R: 34, seed: p.seed % 97, a: fadeAll * this.pickupFade(p) });
    for (const c of game.companions) out.push({ x: c.x, y: c.y, R: 30, seed: 2 + c.phase, a: fadeAll * regrow });

    for (const o of game.objects) {
      const b = o.bounds;
      let R = 0;
      if (o.state === 'frozen') R = o.progress > 0 ? b.reach * 0.45 * (o.progress / o.pulses) : 0;
      else if (o.state === 'melting') R = b.reach * 0.45 + (b.reach * 0.55 + 30) * o.meltT;
      else if (o.state === 'lost') R = 0;
      else R = b.reach + 30 + (o.type === 'lantern' ? o.radius * 0.6 : 150) * o.spread;
      const thin = o.state === 'frozen' ? 0.4 : regrow;
      if (R > 0) out.push({ x: b.cx, y: b.cy, R, seed: o.seed, a: fadeAll * thin, obj: o });
    }

    const f = game.fire;
    // The fire always shows through, even when everything else has frosted back over.
    out.push({ x: f.x, y: groundY(f.x) - 70, R: 200 + 8 * Math.sin(t * 3), seed: 77, a: fadeAll * Math.max(0.45, regrow) });
    return out;
  }

  buildMask(game, holes, dt) {
    const m = this.mctx;
    const t = game.time;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.clearRect(0, 0, FW, FH);
    m.setTransform(FROST_SCALE, 0, 0, FROST_SCALE, 0, 0);
    m.save();
    m.translate(-game.camX, 0);
    m.fillStyle = '#fff';
    m.strokeStyle = '#fff';
    for (const h of holes) {
      if (h.a <= 0) continue;
      for (const [k, a] of [[1.1, 0.35], [1, 1]]) {
        m.globalAlpha = a * h.a;
        blobPath(m, h.x, h.y, h.R * k, h.seed, t);
        m.fill();
      }
      // Meltwater runs down from patches that have thawed.
      const o = h.obj;
      if (o && o.state === 'thawed' && o.thawedAt !== undefined) {
        const age = t - o.thawedAt;
        m.lineCap = 'round';
        for (let i = 0; i < 5; i++) {
          const dx = hash(o.seed, i + 10) * h.R * 0.6;
          const len = Math.min(40 + 70 * (hash(o.seed, i + 20) + 1), age * (18 + 10 * hash(o.seed, i + 30)));
          const y0 = h.y + Math.sqrt(Math.max(0, h.R * h.R - dx * dx)) - 6;
          m.globalAlpha = 0.85 * h.a;
          m.lineWidth = 2.5 + hash(o.seed, i + 40);
          m.beginPath();
          m.moveTo(h.x + dx, y0);
          m.lineTo(h.x + dx + Math.sin(i) * 2, y0 + len);
          m.stroke();
          m.beginPath();
          m.arc(h.x + dx + Math.sin(i) * 2, y0 + len, 3.2, 0, Math.PI * 2);
          m.fill();
        }
        m.lineCap = 'butt';
      }
    }

    // A pulse sweeps a ring of clarity through the frost, which then closes back over.
    for (const r of game.rings) {
      const p = r.t / PULSE.ringSeconds;
      const ease = 1 - Math.pow(1 - p, 3);
      m.globalAlpha = (1 - p) * (r.strong ? 0.5 : 0.3);
      m.lineWidth = 3 + 14 * (1 - p);
      m.beginPath();
      m.arc(r.x, r.y, Math.max(1, r.r * ease), 0, Math.PI * 2);
      m.stroke();
    }

    m.restore();

    // Hints are written into the frost, like a finger on a cold window.
    const tm = this.tctx;
    tm.setTransform(1, 0, 0, 1, 0, 0);
    tm.clearRect(0, 0, FW, FH);
    tm.setTransform(FROST_SCALE, 0, 0, FROST_SCALE, 0, 0);
    tm.fillStyle = '#fff';
    tm.save();
    tm.translate(-game.camX, 0);
    const e = game.ember;
    tm.font = `50px ${HAND}`;
    tm.textAlign = 'center';
    // Only one line is written at a time: the nearest hint that applies right now, so lines never run together.
    // A hint marked low is only for someone down in the cave, and the others only for the surface.
    const lowHere = e.low && inLower(e.x);
    const live = (h) => !(h.until && game.hintFlags[h.until]) && !(h.after && !game.hintFlags[h.after])
      && (h.low === undefined || !!h.low === lowHere || !inLower(h.x));
    let nearest = null;
    // When a companion's fire goes out, that is what the frost says, for a few seconds.
    // At a stage's end, between stages and in the ending, the frost is left to the closing words.
    const closing = game.mode === 'stageEnd' || game.mode === 'transition' || game.mode === 'ending';
    const note = !closing && game.note && game.time - game.note.t < 6 ? game.note : null;
    for (const h of game.level.hints) {
      if (closing) break;
      if (note) break;
      if (live(h) && Math.abs(e.x - h.x) < 420 && (!nearest || Math.abs(e.x - h.x) < Math.abs(e.x - nearest.x))) nearest = h;
    }
    // A note clears the hint away quickly, and is only written once the hint has gone, so the two never overlap.
    let shown = 0;
    game.level.hints.forEach((h, i) => {
      const target = (game.intro && game.titleFade > 0.05) || h !== nearest ? 0 : clamp01(1 - Math.abs(e.x - h.x) / 420);
      this.hintAlpha[i] += (target - this.hintAlpha[i]) * Math.min(1, dt * (note ? 8 : 2));
      if (this.hintAlpha[i] < 0.01) return;
      shown = Math.max(shown, this.hintAlpha[i]);
      tm.globalAlpha = 0.9 * this.hintAlpha[i];
      tm.fillText(h.text, h.x, 175);
    });
    if (note) {
      const age = game.time - note.t;
      const a = 0.9 * Math.min(1, age / 0.8) * Math.min(1, (6 - age) / 1) * clamp01(1 - shown * 4);
      if (a > 0.01) {
        tm.globalAlpha = a;
        tm.fillText(note.text, note.x, 175);
      }
    }
    tm.restore();

    // Title and closing line, in screen space.
    tm.textAlign = 'center';
    if (game.intro && game.titleFade > 0) {
      tm.globalAlpha = game.titleFade;
      tm.font = `190px ${HAND}`;
      if (game.intro.kind === 'walk') {
        // Later stages: the stage's name, written as she sets off.
        tm.font = `120px ${HAND}`;
        this.writeReveal(tm, game.level.name.toLowerCase(), VIEW.w / 2, 200, clamp01((game.intro.t - 0.6) / 1.6));
      } else {
        this.writeReveal(tm, 'thaw', VIEW.w / 2, 215, clamp01((game.intro.t - 2.8) / 1.6));
      }
    }
    if (game.mode === 'stageEnd' || game.mode === 'transition') {
      const T = game.stageEndT;
      tm.globalAlpha = game.mode === 'transition' ? 1 - clamp01(game.transition.t / 0.8) : 1;
      tm.font = `64px ${HAND}`;
      this.writeReveal(tm, game.level.closingLine.toLowerCase(), VIEW.w / 2, 190, clamp01((T - 3.2) / 2.6));
    }
    m.globalAlpha = 1;
  }

  // Text that appears left to right, as if being written.
  writeReveal(m, text, x, y, p) {
    if (p <= 0) return;
    const w = m.measureText(text).width;
    m.save();
    m.beginPath();
    m.rect(x - w / 2 - 10, 0, (w + 20) * p, VIEW_H);
    m.clip();
    m.fillText(text, x, y);
    m.restore();
  }

  buildFrost(game, holes, look) {
    const f = this.fctx;
    const t = game.time;
    const cam = game.camX;

    // The frost is the scene itself, shrunk and blown back up (a blur that works in every browser), then whitened.
    this.smctx.imageSmoothingQuality = 'high';
    this.smctx.filter = 'saturate(0.35) brightness(1.25)';
    this.smctx.drawImage(this.scene, 0, 0, SMALL_W, SMALL_H);
    this.smctx.filter = 'none';
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = 'source-over';
    f.globalAlpha = 1;
    f.clearRect(0, 0, FW, FH);
    f.setTransform(FROST_SCALE, 0, 0, FROST_SCALE, 0, 0);
    f.imageSmoothingQuality = 'high';
    f.drawImage(this.small, 0, 0, VIEW.w, VIEW_H);
    f.fillStyle = `rgba(178,202,214,${look.tintA})`;
    f.fillRect(0, 0, VIEW.w, VIEW_H);

    // Crystals are fixed to the world, so they scroll with it.
    f.globalAlpha = look.crystalA;
    const off = -(((cam % TILE_W) + TILE_W) % TILE_W);
    for (let x = off; x < VIEW.w; x += TILE_W) f.drawImage(this.crystals, x, 0);
    f.globalAlpha = 1;

    f.save();
    f.translate(-cam, 0);
    for (const o of game.objects) {
      if (o.state === 'thawed' || o.gone) continue;
      const b = o.bounds;
      if (o.state === 'lost') {
        // What the cold took: the frost closes over it, thick and pale, its cracks sealed.
        // Then it fades away with what it covered.
        const k = clamp01((t - o.lostAt) / 2) * (1 - clamp01((t - o.lostAt - 3) / 1.5));
        glow(f, b.cx, b.cy, b.reach + 50, '238,246,252', 0.55 * k);
        glow(f, b.cx, b.cy, b.reach * 0.6, '245,250,255', 0.35 * k);
        if (k < 1 && o.progress > 0) this.drawCracks(f, o);
        continue;
      }
      if (o.hit > 0) glow(f, b.cx, b.cy, b.reach + 40, '255,190,120', 0.3 * o.hit);
      if (o.progress > 0) this.drawCracks(f, o);
      if (o.state === 'frozen') {
        // Frozen things glint faintly through the frost.
        const g = Math.pow(Math.max(0, Math.sin(t * 1.7 + o.seed)), 8);
        if (g > 0.01) {
          const gx = b.cx - b.reach * 0.3;
          const gy = b.y0 + 10;
          f.strokeStyle = `rgba(245,252,255,${0.9 * g})`;
          f.lineWidth = 1.2;
          f.beginPath();
          f.moveTo(gx - 8, gy);
          f.lineTo(gx + 8, gy);
          f.moveTo(gx, gy - 8);
          f.lineTo(gx, gy + 8);
          f.stroke();
        }
      }
    }
    // The snow bridge glints through the frost like frozen things do, so the tell can be seen from a way off.
    const br = game.bridge;
    if (br && br.intact) {
      const g = Math.pow(Math.max(0, Math.sin(t * 1.3 + 2)), 6);
      if (g > 0.02) {
        const gx = (br.x0 + br.x1) / 2 + Math.sin(t * 0.7) * 30;
        const gy = groundY(gx) - 2;
        f.strokeStyle = `rgba(245,252,255,${0.95 * g})`;
        f.lineWidth = 1.4;
        f.beginPath();
        f.moveTo(gx - 10, gy);
        f.lineTo(gx + 10, gy);
        f.moveTo(gx, gy - 10);
        f.lineTo(gx, gy + 10);
        f.stroke();
      }
    }
    // A wet, bright rim where the frost has melted back.
    for (const h of holes) {
      if (h.a <= 0.02 || h.R < 6) continue;
      f.strokeStyle = `rgba(245,252,255,${0.3 * h.a})`;
      f.lineWidth = 1.2;
      blobPath(f, h.x, h.y, h.R * 1.06, h.seed, t);
      f.stroke();
    }
    f.restore();

    f.globalCompositeOperation = 'destination-out';
    f.setTransform(1, 0, 0, 1, 0, 0);
    // A small blur feathers the melt edge (browsers without canvas filters just get a harder edge).
    f.filter = 'blur(3px)';
    f.drawImage(this.mask, 0, 0);
    f.filter = 'none';
    f.drawImage(this.textMask, 0, 0);
    f.globalCompositeOperation = 'source-over';
  }

  drawCracks(f, o) {
    const b = o.bounds;
    const r = rng(o.seed + 5);
    const k = o.state === 'melting' ? 1 : o.progress / o.pulses;
    const n = 4 + Math.round(k * 6);
    f.strokeStyle = `rgba(245,252,255,${0.55 + 0.4 * o.hit})`;
    f.lineWidth = 1.3;
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      let x = b.cx + Math.cos(a) * b.reach * 0.3;
      let y = b.cy + Math.sin(a) * b.reach * 0.3;
      f.beginPath();
      f.moveTo(x, y);
      const len = b.reach * (0.4 + 0.8 * k);
      for (let j = 0; j < 4; j++) {
        const aa = a + (r() - 0.5) * 0.9;
        x += Math.cos(aa) * len / 4;
        y += Math.sin(aa) * len / 4;
        f.lineTo(x, y);
      }
      f.stroke();
    }
  }

  // ---------- On top of the glass ----------

  drawRingsOnGlass(c, game) {
    for (const r of game.rings) {
      const p = r.t / PULSE.ringSeconds;
      const ease = 1 - Math.pow(1 - p, 3);
      // In time with her heart, the ring is brighter and gold.
      c.strokeStyle = r.inTime ? `rgba(255,214,120,${(1 - p) * (r.strong ? 0.6 : 0.3)})` : `rgba(255,205,140,${(1 - p) * (r.strong ? 0.3 : 0.18)})`;
      c.lineWidth = r.inTime && r.strong ? 2.5 : 1.5;
      c.beginPath();
      c.arc(r.x, r.y, Math.max(1, r.r * ease), 0, Math.PI * 2);
      c.stroke();
    }
  }

  // The shimmer cue: frost sparkles that drift toward the nearest frozen thing.
  drawShimmers(c, game) {
    for (const m of game.shimmers) {
      const a = Math.sin(Math.PI * (m.t / m.life)) * 0.75;
      const s = 2 + Math.sin(m.t * 9 + m.ph) * 1.2;
      c.strokeStyle = `rgba(235,247,255,${a})`;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(m.x - s, m.y);
      c.lineTo(m.x + s, m.y);
      c.moveTo(m.x, m.y - s);
      c.lineTo(m.x, m.y + s);
      c.stroke();
    }
  }

  // The warmth bar: amber when full, frost blue as it drains, pulsing with the heartbeat below 35%.
  drawBar(c, game) {
    const w = game.ember.warmth;
    const x = 28, y = 30, bw = 180, bh = 5;
    const low = w < THRESHOLDS.blur;
    const beat = game.beatEnvelope();
    const col = mix(C.frost, C.amber, (w - THRESHOLDS.heavy) / (THRESHOLDS.frost - THRESHOLDS.heavy));
    const fade = 1 - game.lightsOutAlpha() * 0.7;
    c.globalAlpha = fade;
    c.fillStyle = 'rgba(10,20,26,0.35)';
    roundRect(c, x - 1, y - 1, bw + 2, bh + 2, 3);
    c.fill();
    c.fillStyle = 'rgba(235,246,255,0.18)';
    roundRect(c, x, y, bw, bh, 2.5);
    c.fill();
    if (w > 0.2) {
      c.save();
      if (low) {
        c.shadowColor = col;
        c.shadowBlur = 14 * beat;
        c.globalAlpha = fade * (0.55 + 0.45 * beat);
      }
      c.fillStyle = col;
      roundRect(c, x, y, bw * (w / 100), bh, 2.5);
      c.fill();
      c.restore();
    }
    // A failing coal: the part of the bar it can no longer reach is shut off.
    const cap = game.warmthCap();
    if (cap < 100) {
      c.fillStyle = 'rgba(10,20,26,0.55)';
      c.fillRect(x + bw * (cap / 100), y - 1, bw * (1 - cap / 100), bh + 2);
      c.fillStyle = 'rgba(235,246,255,0.5)';
      c.fillRect(x + bw * (cap / 100) - 1, y - 3, 2, bh + 6);
    }
    if (game.barFlash > 0 || low) {
      const a = low ? 0.8 : Math.min(1, game.barFlash);
      c.font = `italic 300 15px ${SERIF}`;
      c.textAlign = 'left';
      c.fillStyle = `rgba(20,34,42,${a * fade})`;
      c.fillText('warmth', x + bw + 12, y + 7);
    }
    c.globalAlpha = 1;
  }

  drawTitleText(c, game) {
    const a = game.titleFade;
    const t = game.intro.t;
    c.textAlign = 'center';
    c.font = `italic 300 21px ${SERIF}`;
    c.fillStyle = `rgba(22,40,50,${a * clamp01((t - 4.2) / 1)})`;
    c.fillText('a small warmth in a frozen world', VIEW.w / 2, 270);
    c.font = `300 14px ${SERIF}`;
    c.fillStyle = `rgba(22,40,50,${0.75 * a * clamp01((t - 5) / 1)})`;
    c.fillText('walk: arrows or A and D   ·   pulse: hold space   ·   pause: esc   ·   mute: M   ·   full screen: F', VIEW.w / 2, VIEW_H - 40);
    c.font = `italic 300 13px ${SERIF}`;
    c.fillStyle = `rgba(22,40,50,${0.6 * a * clamp01((t - 5) / 1)})`;
    c.fillText('music: thatgamejam #02 theme by Jason Grace', VIEW.w / 2, VIEW_H - 62);
  }

  // A cleared-area mask for frost growing in from the edges. Each pixel freezes once fr passes its threshold:
  // low near the edges, high in the middle, broken up by noise so the front is ragged, not a circle.
  growthMask(fr) {
    if (!this.growth) {
      const g = new Float32Array(FW * FH);
      const r = rng(29);
      const blobs = Array.from({ length: 40 }, () => ({ x: r() * FW, y: r() * FH, rad: 20 + r() * 90, w: r() - 0.5 }));
      for (let y = 0; y < FH; y++) {
        for (let x = 0; x < FW; x++) {
          const edge = Math.min(x, FW - x, y * 1.4, (FH - y) * 1.1) / (FH * 0.55);
          let n = 0;
          for (const b of blobs) {
            const d = Math.hypot(x - b.x, y - b.y);
            if (d < b.rad) n += b.w * (1 - d / b.rad);
          }
          n += 0.12 * Math.sin(x * 0.09 + Math.sin(y * 0.05) * 3) * Math.sin(y * 0.07 + x * 0.013);
          g[y * FW + x] = Math.min(1, Math.max(0, edge * 0.8 + n * 0.35 + 0.05));
        }
      }
      this.growth = g;
      this.growthImg = this.mctx.createImageData(FW, FH);
    }
    const g = this.growth;
    const d = this.growthImg.data;
    for (let i = 0; i < g.length; i++) {
      // Cleared (no frost yet) where the threshold is still above fr, with a soft edge.
      const a = Math.max(0, Math.min(1, (g[i] - fr) / 0.12));
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255;
      d[i * 4 + 3] = a * 255;
    }
    return this.growthImg;
  }

  // ---------- Between stages ----------

  // Where the thaw has reached: it spreads out from her coal with a ragged edge, using the same noise as the
  // frost's growth. k runs 0 (all frost) to 1 (all clear). Returns a mask, opaque where the frost has melted.
  revealMask(k, px, py) {
    if (!this.growth) this.growthMask(0);
    if (!this.coverImg) this.coverImg = this.cmctx.createImageData(FW, FH);
    const g = this.growth;
    const d = this.coverImg.data;
    const far = Math.hypot(Math.max(px, FW - px), Math.max(py, FH - py));
    let i = 0;
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < FW; x++, i++) {
        const th = 0.72 * (Math.hypot(x - px, y - py) / far) + 0.28 * g[i];
        const a = Math.max(0, Math.min(1, (k - th) / 0.08));
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255;
        d[i * 4 + 3] = a * 255;
      }
    }
    return this.coverImg;
  }

  // The window frosting over as she walks on, then melting open from her coal on the next stage.
  drawCover(c, game) {
    const tr = game.transition;
    const f = this.cctx;
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = 'source-over';
    f.clearRect(0, 0, FW, FH);
    // The frost itself: the scene behind, blurred and whitened, with crystals in it.
    f.setTransform(FROST_SCALE, 0, 0, FROST_SCALE, 0, 0);
    f.drawImage(this.small, 0, 0, VIEW.w, VIEW_H);
    f.fillStyle = 'rgba(196,216,228,0.62)';
    f.fillRect(0, 0, VIEW.w, VIEW_H);
    f.globalAlpha = 0.9;
    const off = -(((game.camX % TILE_W) + TILE_W) % TILE_W);
    for (let x = off; x < VIEW.w; x += TILE_W) f.drawImage(this.crystals, x, 0);
    f.globalAlpha = 1;
    // Cut away what is not frosted (yet), or what has melted.
    const m = this.cmctx;
    m.setTransform(1, 0, 0, 1, 0, 0);
    if (tr.phase === 'out') {
      m.putImageData(this.growthMask(smooth01(tr.t / TRANSITION.frostIn)), 0, 0);
    } else {
      const e = game.ember;
      const k = smooth01((tr.t - 0.3) / (TRANSITION.thaw - 0.5)) * 1.04;
      m.putImageData(this.revealMask(k, (e.x - game.camX) * FROST_SCALE, e.y * FROST_SCALE), 0, 0);
    }
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = 'destination-out';
    f.filter = 'blur(2px)';
    f.drawImage(this.coverMask, 0, 0);
    f.filter = 'none';
    // The next stage's name, written into the frost as it melts.
    if (tr.phase === 'in' && game.intro) {
      f.setTransform(FROST_SCALE, 0, 0, FROST_SCALE, 0, 0);
      f.fillStyle = '#fff';
      f.font = `120px ${HAND}`;
      f.textAlign = 'center';
      this.writeReveal(f, game.level.name.toLowerCase(), VIEW.w / 2, 200, clamp01((game.intro.t - 0.6) / 1.6));
    }
    f.globalCompositeOperation = 'source-over';
    f.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.cover, 0, 0, VIEW.w, VIEW_H);
  }

  // ---------- Before play ----------

  // A dark screen asking for a key: browsers only allow sound after the player has pressed something.
  drawGate(game) {
    const c = this.ctx;
    const t = game.time;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#000';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    c.save();
    c.beginPath();
    c.rect(0, 0, VIEW.w, VIEW_H);
    c.clip();
    // The title is the frosted glass itself, close up: the night hills faint behind it, and the warmth of her coal
    // rising from below, melting a little patch in time with her heart. The window it belongs to is kept for the end.
    const sky = c.createLinearGradient(0, 0, 0, VIEW_H);
    sky.addColorStop(0, '#1c2a31');
    sky.addColorStop(1, '#3d5260');
    c.fillStyle = sky;
    c.fillRect(0, 0, VIEW.w, VIEW_H);
    [['#2c3e49', 430, 90, 0.0031], ['#34495a', 500, 60, 0.0047], ['#3f5666', 575, 36, 0.0068]].forEach(([col, base, amp, f], i) => {
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(0, VIEW_H);
      for (let x = 0; x <= VIEW.w + 12; x += 12) c.lineTo(x, base - Math.abs(Math.sin(x * f + i * 1.7)) * amp);
      c.lineTo(VIEW.w, VIEW_H);
      c.closePath();
      c.fill();
    });
    c.fillStyle = 'rgba(178,202,214,0.66)';
    c.fillRect(0, 0, VIEW.w, VIEW_H);
    c.globalAlpha = 0.9;
    for (let x = 0; x < VIEW.w; x += TILE_W) c.drawImage(this.crystals, x, 0);
    c.globalAlpha = 1;
    const beat = Math.exp(-((t % 1) * 5));
    const px = VIEW.w * 0.62;
    // Her coal's light comes up through the frost, warm and soft; just above it the glass has melted clear.
    glow(c, px, VIEW_H + 40, 330 + 20 * beat, '255,186,120', 0.34 + 0.08 * beat);
    const melt = c.createRadialGradient(px, VIEW_H + 20, 10, px, VIEW_H + 20, 120 + 10 * beat);
    melt.addColorStop(0, 'rgba(40,46,48,0.55)');
    melt.addColorStop(1, 'rgba(40,46,48,0)');
    c.fillStyle = melt;
    c.fillRect(0, 0, VIEW.w, VIEW_H);
    c.save();
    c.globalCompositeOperation = 'lighter';
    glow(c, px, VIEW_H + 10, 70 + 8 * beat, '255,170,90', 0.35 + 0.15 * beat);
    c.restore();

    // Written into the frost, as every line in the game is.
    c.textAlign = 'center';
    const cx = VIEW.w / 2;
    c.font = `150px ${HAND}`;
    c.fillStyle = 'rgba(22,40,50,0.82)';
    this.writeReveal(c, 'thaw', cx, 232, clamp01((t - 0.6) / 1.6));
    const sv = game.saved;
    const cur = sv.current && game.levels[sv.current.stage];
    const fade = clamp01((t - 1.6) / 1.2);
    const cy = 340;
    c.font = `300 18px ${SERIF}`;
    c.fillStyle = `rgba(22,40,50,${fade * (0.6 + 0.3 * Math.sin(t * 2))})`;
    c.fillText(cur ? 'press any key to continue' : 'press any key to begin', cx, cy);
    c.font = `italic 300 15px ${SERIF}`;
    c.fillStyle = `rgba(22,40,50,${0.8 * fade})`;
    if (cur) {
      c.fillText(`stage ${sv.current.stage + 1}, ${cur.name.toLowerCase()}`, cx, cy + 28);
      c.fillText('N for a new walk, from the beginning', cx, cy + 54);
    }
    // Any stage reached before can be walked again, as things stood when it began.
    if (sv.reached > 0) {
      const names = game.levels.slice(0, sv.reached + 1).map((L, i) => `${i + 1}  ${L.name.toLowerCase()}`);
      c.font = `300 14px ${SERIF}`;
      c.fillStyle = `rgba(22,40,50,${0.72 * fade})`;
      c.fillText('or press the number of a stage:', cx, cy + 100);
      c.fillText(names.join('      '), cx, cy + 122);
    }
    // The record of finished walks: the best one, and how many of the endings have been seen.
    if (sv.finished > 0 && sv.best) {
      const trees = game.levels.reduce((n, L) => n + L.objects.filter((o) => o.type === 'tree').length, 0);
      c.font = `italic 300 14px ${SERIF}`;
      c.fillStyle = `rgba(92,52,22,${0.85 * fade})`;
      c.fillText(`your best walk: ${sv.best.saved} of ${sv.best.all} brought home   ·   trees warmed: ${sv.best.trees} of ${trees}`, cx, cy + 166);
      c.fillText(`endings found: ${sv.endings.length} of ${ENDINGS.length}`, cx, cy + 188);
    }
    c.font = `italic 300 14px ${SERIF}`;
    c.fillStyle = `rgba(22,40,50,${0.6 * fade})`;
    c.fillText('best with sound on   ·   F for full screen', cx, VIEW_H - 30);
    c.restore();
    // Out of black.
    if (t < 1.5) {
      c.fillStyle = `rgba(0,0,0,${1 - t / 1.5})`;
      c.fillRect(0, 0, VIEW.w, VIEW_H);
    }
  }

  // The prologue: the world before the cold, then the cold, drawn with the same pieces as the game.
  drawPrologue(game, dt) {
    const P = game.prologue;
    const t = P.t;
    const cold = P.cold();
    const cam = P.cam();
    if (!this.prologueFigs) {
      this.prologueFigs = {
        child: new Character(childX(0), PLAYER_SCALE, {}, 1),
        walkers: WALKERS.map((w) => new Character(w.from, COMPANION_SCALE, VILLAGERS[w.coat], 1)),
        stayers: STAYERS.map((p) => new Character(p.x, COMPANION_SCALE, VILLAGERS[p.coat], p.facing)),
      };
    }
    const figs = this.prologueFigs;
    const s = this.sctx;
    const wind = -70 - 520 * P.wind();

    // Sky: an amber evening before, the frozen night after.
    const sky = s.createLinearGradient(0, 0, 0, VIEW_H * 0.75);
    sky.addColorStop(0, mix('#1c2a31', C.skyTop, cold));
    sky.addColorStop(1, mix('#d9a265', C.skyBottom, cold));
    s.fillStyle = sky;
    s.fillRect(0, 0, VIEW.w, VIEW_H);
    glow(s, 300 - cam * 0.15, 455, 440, '255,196,120', 0.42 * (1 - cold));
    const ridge = (par, color, fn) => {
      s.fillStyle = color;
      s.beginPath();
      s.moveTo(0, VIEW_H);
      for (let x = 0; x <= VIEW.w + 12; x += 12) s.lineTo(x, fn(x + cam * par));
      s.lineTo(VIEW.w, VIEW_H);
      s.closePath();
      s.fill();
    };
    ridge(0.2, mix('#8f7556', C.ridges[0], cold), (x) => 400 - Math.abs(Math.sin(x * 0.0028)) * 105 - Math.sin(x * 0.011) * 12);
    ridge(0.5, mix('#6d5940', C.ridges[2], cold), (x) => 490 - Math.abs(Math.sin(x * 0.0051 + 1)) * 50 - Math.sin(x * 0.019) * 6);

    s.save();
    s.translate(-cam, 0);
    // Golden grass that the snow covers.
    const x0 = cam - 40, x1 = cam + VIEW.w + 40;
    s.beginPath();
    s.moveTo(x0, VIEW_H);
    for (let x = x0; x <= x1; x += 10) s.lineTo(x, groundY(x));
    s.lineTo(x1, VIEW_H);
    s.closePath();
    const gg = s.createLinearGradient(0, 560, 0, VIEW_H);
    gg.addColorStop(0, mix('#b8924f', '#93aab6', cold));
    gg.addColorStop(1, mix('#5a4628', '#3f5561', cold));
    s.fillStyle = gg;
    s.fill();
    if (cold < 0.95) {
      s.strokeStyle = `rgba(214,182,104,${0.65 * (1 - cold)})`;
      s.lineWidth = 1;
      for (let x = Math.floor(x0 / 7) * 7; x < x1; x += 7) {
        if (Math.abs(x - HEARTH_X) < 60) continue;
        const h = 6 + (hash(41, x) + 1) * 5;
        const lean = hash(43, x) * 3 + Math.sin(t * 1.3 + x * 0.05) * 1.5 - 4 * P.wind();
        s.beginPath();
        s.moveTo(x, groundY(x) + 2);
        s.lineTo(x + lean, groundY(x) - h);
        s.stroke();
      }
    }
    s.strokeStyle = mix('#d9bd7c', '#e1eef5', cold);
    s.lineWidth = 1.6;
    s.beginPath();
    for (let x = x0; x <= x1; x += 10) (x === x0 ? s.moveTo : s.lineTo).call(s, x, groundY(x));
    s.stroke();

    for (const h of HOUSES) this.drawHouse(s, h, P.windowLit(h), cold, t, P.wind());

    // Small cold-country flowers; the frost takes them with everything else.
    for (const f of FLOWERS) {
      const gy = groundY(f.x);
      const sway = Math.sin(t * 1.6 + f.seed) * 2 * (1 - cold) - 3 * P.wind() * (1 - cold);
      s.strokeStyle = mix('#5c6b3a', '#8aa0ac', cold);
      s.lineWidth = 1.2;
      s.beginPath();
      s.moveTo(f.x, gy + 1);
      s.quadraticCurveTo(f.x + sway * 0.4, gy - 8, f.x + sway, gy - 15);
      s.stroke();
      s.fillStyle = mix(f.yellow ? '#f1cf62' : '#f4efe4', '#cfdde5', cold);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + f.seed;
        s.beginPath();
        s.arc(f.x + sway + Math.cos(a) * 2.6, gy - 15 + Math.sin(a) * 2.6, 2, 0, Math.PI * 2);
        s.fill();
      }
    }

    // The shared hearth in the square: a ring of stones round the village's one fire.
    const hb = groundY(HEARTH_X) + 4;
    s.fillStyle = mix('#5b5047', '#7d909b', cold);
    for (let k = -3; k <= 3; k++) {
      s.beginPath();
      s.ellipse(HEARTH_X + k * 11, hb - 2 + Math.abs(k) * 0.6, 6.5, 4.5, 0, 0, Math.PI * 2);
      s.fill();
    }
    const fireK = P.hearth();
    if (fireK > 0.02) {
      s.save();
      s.translate(HEARTH_X, hb);
      s.scale(fireK * 1.25, fireK * 1.25);
      s.translate(-HEARTH_X, -hb);
      this.drawFire(s, { x: HEARTH_X }, t);
      s.restore();
    }

    // Villagers taking coals home, those who stay by the fire, and the child setting off.
    const groundTone = mix('#b08c4d', '#90a7b3', cold);
    WALKERS.forEach((w, i) => {
      const st = P.walker(w);
      if (st.inside) return;
      const fig = figs.walkers[i];
      fig.update(dt, st.x, t < w.start ? -1 : st.facing, wind, t);
      fig.draw(s, { glow: 1, t, dt, pot: true, ground: groundTone });
    });
    STAYERS.forEach((p, i) => {
      const fig = figs.stayers[i];
      fig.update(dt, p.x, p.facing, wind, t);
      fig.draw(s, { frozen: P.stayerFrozen(p), glow: P.stayerGlow(p), t, dt, pot: true, ground: groundTone });
    });
    const cx = childX(t);
    figs.child.update(dt, cx, 1, wind, t);
    figs.child.draw(s, { frozen: P.childFrozen(), glow: P.childGlow(), t, dt, pot: true, ground: groundTone });

    s.save();
    s.globalCompositeOperation = 'lighter';
    glow(s, HEARTH_X, hb - 30, 1 + 400 * fireK, '255,150,60', 0.38 * fireK);
    for (const h of HOUSES) {
      const lit = P.windowLit(h);
      if (lit > 0) glow(s, h.x + h.w * 0.18, groundY(h.x) - h.h * 0.45, 70, '255,190,110', 0.3 * lit);
    }
    WALKERS.forEach((w, i) => {
      if (!P.walker(w).inside) {
        const ch = figs.walkers[i].chest();
        glow(s, ch.x, ch.y, 46, '255,200,140', 0.3);
      }
    });
    STAYERS.forEach((p, i) => {
      const ch = figs.stayers[i].chest();
      glow(s, ch.x, ch.y, 46, '255,200,140', 0.3 * P.stayerGlow(p));
    });
    const cc = figs.child.chest();
    glow(s, cc.x, cc.y, 56, '255,200,140', 0.34 * P.childGlow());
    s.restore();
    s.restore();

    // Snow arrives with the cold, driven by the wind.
    const count = Math.floor(this.snow.length * cold);
    for (let i = 0; i < this.snow.length; i++) {
      const f = this.snow[i];
      f.y += f.vy * dt * (1 + cold);
      f.x += (f.vx - 220 * P.wind()) * dt;
      if (f.y > VIEW_H) f.y -= VIEW_H;
      if (i >= count) continue;
      const x = (((f.x - cam * f.par) % VIEW.w) + VIEW.w) % VIEW.w;
      s.fillStyle = `rgba(225,238,248,${0.22 * f.s})`;
      s.fillRect(x, f.y, f.s, f.s);
    }

    // The frost grows in from the edges until it covers everything; two of the lines are written into it.
    const fr = P.frost();
    const px = cc.x - cam;
    const py = cc.y;
    if (fr > 0) {
      this.smctx.filter = 'saturate(0.35) brightness(1.25)';
      this.smctx.drawImage(this.scene, 0, 0, SMALL_W, SMALL_H);
      this.smctx.filter = 'none';
      const f = this.fctx;
      f.setTransform(1, 0, 0, 1, 0, 0);
      f.globalCompositeOperation = 'source-over';
      f.clearRect(0, 0, FW, FH);
      f.setTransform(FROST_SCALE, 0, 0, FROST_SCALE, 0, 0);
      f.drawImage(this.small, 0, 0, VIEW.w, VIEW_H);
      f.fillStyle = 'rgba(178,202,214,0.42)';
      f.fillRect(0, 0, VIEW.w, VIEW_H);
      f.globalAlpha = 0.85;
      const off = -(((cam % TILE_W) + TILE_W) % TILE_W);
      for (let x = off; x < VIEW.w; x += TILE_W) f.drawImage(this.crystals, x, 0);
      f.globalAlpha = 1;

      const m = this.mctx;
      m.setTransform(1, 0, 0, 1, 0, 0);
      m.clearRect(0, 0, FW, FH);
      // Frost creeps in unevenly: it starts at the edges and reaches the middle last.
      if (fr < 1) m.putImageData(this.growthMask(fr), 0, 0);
      m.setTransform(FROST_SCALE, 0, 0, FROST_SCALE, 0, 0);
      // The one coal the frost cannot close over.
      const g = P.childGlow();
      m.fillStyle = '#fff';
      m.globalAlpha = 0.9;
      blobPath(m, px, py, (10 + 10 * g) * P.zoom(), 5, t);
      m.fill();
      m.globalAlpha = 1;
      m.font = `60px ${HAND}`;
      m.textAlign = 'center';
      for (const l of LINES) {
        if (!l.frost) continue;
        const { p, a } = P.line(l);
        if (p <= 0 || a <= 0) continue;
        m.globalAlpha = a;
        this.writeReveal(m, l.text, VIEW.w / 2, 190, p);
      }
      m.globalAlpha = 1;
      f.setTransform(1, 0, 0, 1, 0, 0);
      f.globalCompositeOperation = 'destination-out';
      f.drawImage(this.mask, 0, 0);
      f.globalCompositeOperation = 'source-over';
    }

    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#000';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    c.save();
    c.beginPath();
    c.rect(0, 0, VIEW.w, VIEW_H);
    c.clip();
    // The world zooms toward the last coal; the frost on the glass does not.
    const z = P.zoom();
    c.save();
    c.translate(px, py);
    c.scale(z, z);
    c.translate(-px, -py);
    c.filter = `saturate(${(1 - 0.85 * cold).toFixed(2)})`;
    c.drawImage(this.scene, 0, 0);
    c.filter = 'none';
    c.restore();
    if (fr > 0) {
      c.globalAlpha = 0.95;
      c.drawImage(this.frost, 0, 0, VIEW.w, VIEW_H);
      c.globalAlpha = 1;
    }
    const d = P.dark();
    if (d > 0) {
      const dg = c.createRadialGradient(px, py, 20, px, py, 560);
      dg.addColorStop(0, `rgba(0,0,0,${d * 0.35})`);
      dg.addColorStop(1, `rgba(0,0,0,${d})`);
      c.fillStyle = dg;
      c.fillRect(0, 0, VIEW.w, VIEW_H);
    }
    // The last coal shows as warm light through the frost, not as a hole in it.
    if (fr > 0.3) {
      const g = P.childGlow();
      const pulse = 0.85 + 0.15 * Math.sin(t * 3.2);
      c.save();
      c.globalCompositeOperation = 'lighter';
      glow(c, px, py, (70 + 40 * g) * z * pulse, '255,170,90', 0.32 * g * clamp01((fr - 0.3) / 0.3));
      glow(c, px, py, 12 * z, '255,230,190', 0.7 * g);
      c.restore();
    }
    // The first line is written in warm light, before there is any frost.
    const first = LINES[0];
    const l0 = P.line(first);
    if (l0.p > 0 && l0.a > 0) {
      c.font = `54px ${HAND}`;
      c.textAlign = 'center';
      c.fillStyle = `rgba(255,226,178,${0.92 * l0.a})`;
      this.writeReveal(c, first.text, VIEW.w / 2, 170, l0.p);
    }
    c.globalAlpha = 0.06;
    c.fillStyle = this.grainPatterns[Math.floor(this.frame / 2) % 3];
    c.fillRect(0, 0, VIEW.w, VIEW_H);
    c.globalAlpha = 1;
    const b = P.black();
    if (b > 0) {
      c.fillStyle = `rgba(0,0,0,${b})`;
      c.fillRect(0, 0, VIEW.w, VIEW_H);
    }
    if (t > 3 && t < 55) {
      c.font = `300 13px ${SERIF}`;
      c.textAlign = 'right';
      c.fillStyle = `rgba(200,212,222,${0.35 * clamp01((t - 3) / 2)})`;
      c.fillText('esc to skip', VIEW.w - 28, VIEW_H - 24);
    }
    c.restore();
  }

  // A village house: timber walls, a pitched roof that gathers snow as the cold comes,
  // one warm window and a chimney that smokes while the window is lit.
  drawHouse(s, h, lit, cold, t, wind) {
    const gy = groundY(h.x) + 4;
    const x0 = h.x - h.w / 2;
    const wallTop = gy - h.h;
    s.fillStyle = mix('#6e4d36', '#5c6f7a', cold * 0.8);
    s.fillRect(x0, wallTop, h.w, h.h);
    // Timber boards.
    s.strokeStyle = mix('#5a3d2a', '#4e5f69', cold * 0.8);
    s.lineWidth = 1;
    for (let y = wallTop + 9; y < gy; y += 9) {
      s.beginPath();
      s.moveTo(x0, y);
      s.lineTo(x0 + h.w, y);
      s.stroke();
    }
    // Roof.
    const peak = wallTop - h.w * 0.42;
    s.fillStyle = mix('#3c2b22', '#3a4a54', cold * 0.8);
    s.beginPath();
    s.moveTo(x0 - 10, wallTop + 2);
    s.lineTo(h.x, peak);
    s.lineTo(x0 + h.w + 10, wallTop + 2);
    s.closePath();
    s.fill();
    if (cold > 0.05) {
      s.strokeStyle = `rgba(232,242,248,${Math.min(1, cold * 1.4)})`;
      s.lineWidth = 2 + 4 * cold;
      s.beginPath();
      s.moveTo(x0 - 8, wallTop);
      s.lineTo(h.x, peak + 2);
      s.lineTo(x0 + h.w + 8, wallTop);
      s.stroke();
    }
    // Chimney, smoking while there is fire inside.
    const chx = h.x + h.w * 0.24;
    s.fillStyle = mix('#4a3a30', '#46565f', cold * 0.8);
    s.fillRect(chx - 6, peak + h.w * 0.12, 12, h.w * 0.2);
    if (lit > 0.05) {
      for (let i = 0; i < 5; i++) {
        const q = (t * 0.25 + i / 5 + h.x * 0.001) % 1;
        s.fillStyle = `rgba(190,180,170,${0.22 * (1 - q) * lit})`;
        s.beginPath();
        s.arc(chx + q * 30 - wind * 60 * q + Math.sin(q * 6 + i) * 4, peak + h.w * 0.1 - q * 70, 4 + q * 9, 0, Math.PI * 2);
        s.fill();
      }
    }
    // Door and window.
    s.fillStyle = mix('#3a281d', '#3a4a54', cold * 0.8);
    s.fillRect(h.x - h.w * 0.32, gy - h.h * 0.62, h.w * 0.2, h.h * 0.62);
    const wx = h.x + h.w * 0.08, wy = gy - h.h * 0.62, ww = h.w * 0.22, wh = h.h * 0.3;
    s.fillStyle = lit > 0 ? `rgba(255,${Math.round(196 + 20 * lit)},120,${0.25 + 0.75 * lit})` : 'rgba(40,52,60,0.9)';
    if (lit <= 0.01) s.fillStyle = mix('#2b3238', '#2f3b44', cold);
    s.fillRect(wx, wy, ww, wh);
    s.strokeStyle = mix('#3a281d', '#3a4a54', cold * 0.8);
    s.lineWidth = 2;
    s.strokeRect(wx, wy, ww, wh);
    s.beginPath();
    s.moveTo(wx + ww / 2, wy);
    s.lineTo(wx + ww / 2, wy + wh);
    s.stroke();
  }

  // The village from the prologue: a lit window for everyone saved so far, a dark one for those lost
  // or left behind, and a faint outline for homes not reached yet.
  drawVillage(c, game, a) {
    const L = game.ledger;
    const n = VILLAGE.length;
    const gap = 92;
    const x0 = VIEW.w / 2 - ((n - 1) * gap) / 2;
    const base = 420;
    VILLAGE.forEach((v, i) => {
      const saved = L.saved.includes(v.id);
      const lost = L.lost.includes(v.id);
      const known = saved || lost;
      const x = x0 + i * gap;
      const alpha = a * (known ? 0.95 : 0.3);
      c.fillStyle = `rgba(22,40,50,${alpha})`;
      c.fillRect(x - 17, base - 22, 34, 22);
      c.beginPath();
      c.moveTo(x - 22, base - 21);
      c.lineTo(x, base - 38);
      c.lineTo(x + 22, base - 21);
      c.closePath();
      c.fill();
      // The window.
      c.fillStyle = saved ? `rgba(255,205,120,${a})` : `rgba(120,140,152,${alpha * 0.6})`;
      c.fillRect(x - 5, base - 15, 10, 8);
      if (saved) {
        c.save();
        c.globalCompositeOperation = 'lighter';
        glow(c, x, base - 11, 26, '255,190,110', 0.35 * a);
        c.restore();
      }
      if (known) {
        c.font = `italic 300 12px ${SERIF}`;
        c.textAlign = 'center';
        c.fillStyle = `rgba(22,40,50,${0.85 * a})`;
        c.fillText(v.name, x, base + 18);
      }
    });
  }

  drawPause(c) {
    c.fillStyle = 'rgba(200,222,235,0.6)';
    c.fillRect(0, 0, VIEW.w, VIEW_H);
    c.textAlign = 'center';
    c.fillStyle = '#17303b';
    c.font = `70px ${HAND}`;
    c.fillText('paused', VIEW.w / 2, VIEW_H / 2 - 70);
    c.font = `300 18px ${SERIF}`;
    const lines = [
      'move: arrows, WASD or left stick   ·   at a cairn, down takes the low way',
      'pulse: hold space or A',
      'mute: M   ·   replay this stage: R   ·   full screen: F',
      'enter to start over from the beginning',
      'esc or start to resume',
    ];
    lines.forEach((l, i) => c.fillText(l, VIEW.w / 2, VIEW_H / 2 - 10 + i * 32));
  }

  drawStageEndText(c, game) {
    const T = game.stageEndT;
    const a = clamp01((T - 1) / 1);
    c.textAlign = 'center';
    // Said plainly first: the stage is done.
    c.font = `300 16px ${SERIF}`;
    c.fillStyle = `rgba(22,40,50,${0.9 * a})`;
    c.fillText(`STAGE ${game.stage + 1} COMPLETE`.split('').join(' '), VIEW.w / 2, 96);
    c.font = `300 14px ${SERIF}`;
    c.fillStyle = `rgba(22,40,50,${0.7 * a})`;
    c.fillText(game.level.name.toUpperCase().split('').join(' '), VIEW.w / 2, 122);
    const b = clamp01((T - 5.8) / 1);
    c.font = `italic 300 17px ${SERIF}`;
    c.fillStyle = `rgba(22,40,50,${b})`;
    const trees = game.treesThisStage();
    const treeLine = trees.total ? `   ·   trees warmed: ${trees.warmed} of ${trees.total}` : '';
    c.fillText(`companions found: ${game.foundThisStage()} of ${game.totalWanderers}${treeLine}`, VIEW.w / 2, 250);
    // What was chosen at each fork in this stage.
    const forks = game.level.forks || {};
    const said = Object.keys(game.choices).map((k) => forks[k] && forks[k][game.choices[k]]).filter(Boolean);
    if (said.length) c.fillText(said.join('  '), VIEW.w / 2, 280);
    // What the choice gives you for the road ahead.
    const carries = game.level.carries || {};
    const carried = Object.keys(game.choices).map((k) => carries[k] && carries[k][game.choices[k]]).filter(Boolean);
    if (carried.length) {
      c.font = `italic 300 15px ${SERIF}`;
      c.fillText(carried.map((x) => x.text).join('  '), VIEW.w / 2, 308);
    }
    this.drawVillage(c, game, b);
    // At the end of the whole walk: how many of the endings have now been seen.
    if (game.ending) {
      c.font = `italic 300 15px ${SERIF}`;
      c.fillStyle = `rgba(22,40,50,${0.8 * b})`;
      const found = `endings found: ${game.saved.endings.length} of ${ENDINGS.length}`;
      c.fillText(game.endingNew ? `a new ending   ·   ${found}` : found, VIEW.w / 2, 474);
    }
    c.font = `300 14px ${SERIF}`;
    c.fillStyle = `rgba(22,40,50,${0.75 * b})`;
    const on = game.hasNextStage() ? 'space to walk on' : 'space to keep wandering';
    // Along the bottom, clear of the group standing at the fire.
    c.fillText(`${on}   ·   R to replay this stage   ·   enter to start over from the beginning`, VIEW.w / 2, VIEW_H - 34);
  }
}
