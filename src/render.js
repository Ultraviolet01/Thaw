import { VIEW_W, VIEW_H, PULSE, THRESHOLDS } from './config.js';
import { groundY } from './terrain.js';
import { Character } from './character.js';
import { COMPANION_SCALE, PLAYER_SCALE, INTRO_LOCK } from './game.js';
import { HOUSES, WALKERS, STAYERS, HEARTH_X, FLOWERS, LINES, childX } from './prologue.js';

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

const SMALL_W = 320;
const SMALL_H = 180;
const TILE_W = 1024;
// The frost and its melt mask are built at half size: frost is soft anyway, and this keeps frame times low.
const FROST_SCALE = 0.5;
const FW = VIEW_W * FROST_SCALE;
const FH = VIEW_H * FROST_SCALE;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth01 = (v) => {
  const k = clamp01(v);
  return k * k * (3 - 2 * k);
};

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
    this.scene = canvas(VIEW_W, VIEW_H);
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
    this.crystals = this.makeCrystals();
    this.grain = [0, 1, 2].map((i) => this.makeGrain(i));
    this.grainPatterns = this.grain.map((g) => this.ctx.createPattern(g, 'repeat'));
    this.frame = 0;
    this.player = new Character(level.spawn.x, PLAYER_SCALE);
    // Each wanderer keeps its figure from frozen to companion, so the thaw is one continuous body.
    this.figures = {};
    level.objects.forEach((o, i) => {
      if (o.type === 'wanderer') this.figures[i] = new Character(o.x, COMPANION_SCALE, VILLAGERS[i % VILLAGERS.length], -1);
    });

    const r = rng(42);
    this.stars = Array.from({ length: 110 }, () => ({
      x: r() * VIEW_W, y: r() * VIEW_H * 0.55, s: 1 + r() * 1.4, a: 0.15 + r() * 0.35, tw: 0.5 + r() * 2,
    }));
    this.snow = Array.from({ length: 140 }, () => ({
      x: r() * VIEW_W, y: r() * VIEW_H, s: 0.8 + r() * 2, vy: 14 + r() * 24, vx: -8 + r() * 5, par: 0.3 + r() * 0.7, ph: r() * 6,
    }));
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

    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(innerWidth * dpr);
    this.canvas.height = Math.round(innerHeight * dpr);
    this.scale = Math.min(this.canvas.width / VIEW_W, this.canvas.height / VIEW_H);
    this.ox = (this.canvas.width - VIEW_W * this.scale) / 2;
    this.oy = (this.canvas.height - VIEW_H * this.scale) / 2;
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
    c.rect(0, 0, VIEW_W, VIEW_H);
    c.clip();

    if (look.blur > 0.05 || look.sat < 0.99) {
      c.filter = `blur(${(look.blur * this.scale).toFixed(2)}px) saturate(${look.sat.toFixed(2)}) brightness(${look.bright.toFixed(2)})`;
    }
    c.drawImage(this.scene, 0, 0);
    c.filter = 'none';
    c.globalAlpha = look.frostA;
    c.drawImage(this.frost, 0, 0, VIEW_W, VIEW_H);
    c.globalAlpha = 1;

    c.save();
    c.translate(-game.camX, 0);
    this.drawRingsOnGlass(c, game);
    this.drawShimmers(c, game);
    c.restore();

    // Film grain keeps the picture from looking too clean and digital.
    c.globalAlpha = 0.06;
    c.fillStyle = this.grainPatterns[Math.floor(this.frame / 2) % 3];
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    c.globalAlpha = 1;

    if (w < THRESHOLDS.heavy && game.mode !== 'title') {
      c.fillStyle = `rgba(2,4,8,${((THRESHOLDS.heavy - w) / THRESHOLDS.heavy) * 0.45})`;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    const lo = game.lightsOutAlpha();
    if (lo > 0) {
      c.fillStyle = `rgba(0,0,0,${lo})`;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    // Out of black as the first stage begins.
    if (game.intro && game.intro.t < 1.6) {
      c.fillStyle = `rgba(0,0,0,${1 - game.intro.t / 1.6})`;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (!(game.intro && game.intro.t < INTRO_LOCK)) this.drawBar(c, game);
    if (game.intro && game.titleFade > 0) this.drawTitleText(c, game);
    if (game.mode === 'paused') this.drawPause(c);
    if (game.mode === 'stageEnd') this.drawStageEndText(c, game);
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
    this.drawSky(s, cam, t);
    s.save();
    s.translate(-cam, 0);
    this.drawGround(s, cam);
    for (const o of game.objects) this.drawObject(s, o, t);
    this.drawPickups(s, game, t);
    this.drawFire(s, game.fire, t);
    this.drawFigures(s, game, dt, t);
    this.drawLights(s, game, t);
    this.drawMist(s, t);
    s.restore();
    this.drawSnow(s, cam, dt, t);
    this.drawNear(s, cam);
  }

  drawSky(s, cam, t) {
    const g = s.createLinearGradient(0, 0, 0, VIEW_H * 0.7);
    g.addColorStop(0, C.skyTop);
    g.addColorStop(1, C.skyBottom);
    s.fillStyle = g;
    s.fillRect(0, 0, VIEW_W, VIEW_H);
    for (const st of this.stars) {
      const x = (((st.x - cam * 0.04) % VIEW_W) + VIEW_W) % VIEW_W;
      const a = st.a * (0.6 + 0.4 * Math.sin(t * st.tw + st.x));
      s.fillStyle = `rgba(215,232,245,${a})`;
      s.fillRect(x, st.y, st.s, st.s);
    }
    const ridges = [
      [0.12, 9, (x) => 330 - Math.abs(Math.sin(x * 0.0024)) * 120 - Math.sin(x * 0.009) * 16],
      [0.25, 12, (x) => 395 - Math.abs(Math.sin(x * 0.0033 + 0.7)) * 95 - Math.sin(x * 0.013) * 10],
      [0.45, 16, (x) => 455 - Math.abs(Math.sin(x * 0.0046 + 2)) * 65 - Math.sin(x * 0.019) * 7],
      [0.7, 22, (x) => 515 - Math.abs(Math.sin(x * 0.006 + 1)) * 42 - Math.sin(x * 0.027) * 5],
    ];
    ridges.forEach(([par, treeH, fn], i) => {
      const off = cam * par;
      s.fillStyle = C.ridges[i];
      s.beginPath();
      s.moveTo(0, VIEW_H);
      for (let x = 0; x <= VIEW_W + 12; x += 12) s.lineTo(x, fn(x + off));
      s.lineTo(VIEW_W, VIEW_H);
      s.closePath();
      s.fill();
      // Forest patches along the crest: small pines, smaller and hazier with distance.
      s.fillStyle = C.forests[i];
      const step = 3 + i * 1.5;
      const start = Math.floor(off / step) * step;
      for (let wx = start; wx < off + VIEW_W + step; wx += step) {
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
      for (let x = 0; x <= VIEW_W + 12; x += 12) {
        if (x === 0) s.moveTo(x, fn(x + off) + 2 + i);
        else s.lineTo(x, fn(x + off) + 2 + i);
      }
      for (let x = VIEW_W + 12; x >= 0; x -= 12) {
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
    const x1 = cam + VIEW_W + 40;
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

  drawObject(s, o, t) {
    if (o.state === 'lost') {
      this.drawLost(s, o, t);
      return;
    }
    if (o.gone) return;
    const warm = o.state === 'thawed' ? 1 : o.state === 'melting' ? o.meltT : 0;
    if (o.type === 'tree') this.drawPine(s, o.x, groundY(o.x) + 6, 175, o.seed, warm);
    else if (o.type === 'lantern') this.drawLantern(s, o, warm, t);
    else if (o.type === 'wanderer') this.drawWanderer(s, o, warm, t);
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
    const b = groundY(x) + 6;
    s.fillStyle = mix('#13222b', '#3a2715', warm);
    s.fillRect(x - 3, b - 118, 6, 118);
    s.fillRect(x - 3, b - 118, 24, 4);
    s.fillRect(x + 14, b - 114, 2, 6);
    const lx = o.x + 16;
    const ly = groundY(o.x) - 92;
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
      const y = groundY(x) + 1;
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
    const fig = this.figures[o.id];
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
    glow(s, f.x, fb, 340 * (1 + 0.04 * Math.sin(t * 7)), '255,150,60', 0.3);
    glow(s, f.x, fb, 120, '255,200,120', 0.35);
    for (const o of game.objects) {
      const b = o.bounds;
      if (o.state === 'melting') glow(s, b.cx, b.cy, 60 + 60 * o.meltT, '240,170,80', 0.2 * o.meltT);
      if (o.state !== 'thawed') continue;
      if (o.type === 'lantern') {
        glow(s, o.x + 16, groundY(o.x) - 92, o.radius * (0.4 + 0.6 * o.spread) * (1 + 0.03 * Math.sin(t * 8)), '255,190,100', 0.38);
      } else {
        glow(s, b.cx, b.cy, 60 + 200 * o.spread, '240,170,80', (o.gone ? 0.14 : 0.18) * o.spread);
      }
    }
    for (const c of game.companions) glow(s, c.x, c.y, 46, '255,215,160', 0.3);
    for (const p of game.pickups) {
      const k = this.pickupFade(p) * (0.85 + 0.15 * Math.sin(t * 7 + p.seed));
      glow(s, p.x, groundY(p.x) - 6, 70, '255,150,60', 0.4 * k);
    }
    const e = game.ember;
    const dim = 1 - game.lightsOutAlpha();
    glow(s, e.x, e.y, game.glowRadius(), '255,200,140', 0.28 * dim);
    glow(s, e.x, groundY(e.x), game.glowRadius() * 0.7, '255,190,120', 0.18 * dim);
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
    const wind = -70;
    if (Math.abs(this.player.x - e.x) > 200) this.player = new Character(e.x, PLAYER_SCALE, {}, e.facing);
    for (const c of game.companions) {
      const fig = this.figures[c.objId];
      if (!fig) continue;
      if (Math.abs(fig.x - c.x) > 200) this.figures[c.objId] = new Character(c.x, COMPANION_SCALE, fig.c, c.facing);
      this.figures[c.objId].update(dt, c.x, c.facing, wind, t);
      // The fire passes from her pot to theirs as they join: a few sparks, then their own coal glows.
      const since = t - (c.joinedAt ?? -99);
      const lit = clamp01((since - 0.7) / 0.5);
      this.figures[c.objId].draw(s, { glow: 0.55 * dim * lit, t, dt, pot: true, pulsing: game.pulsing, beat: game.pulsing ? game.beatEnvelope() : 0, ground: SNOW_GROUND });
      if (since < 1.3) this.drawSparkTrail(s, this.player.chest(), this.figures[c.objId].chest(), since / 1.3);
    }
    this.player.update(dt, e.x, e.facing, wind, t);
    let glow = Math.min(1.4, (w < THRESHOLDS.heavy ? 0.15 + 0.35 * (w / THRESHOLDS.heavy) : 0.5 + 0.5 * (w / 100)) + 0.6 * game.flare) * dim;
    const it = game.intro;
    if (it && it.t < INTRO_LOCK) {
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
    this.player.draw(s, { glow, t, dt, pulsing: game.pulsing, beat: game.beatEnvelope(), ground: SNOW_GROUND });
  }

  drawSnow(s, cam, dt, t) {
    for (const f of this.snow) {
      f.y += f.vy * dt;
      f.x += (f.vx + Math.sin(t + f.ph) * 8) * dt;
      if (f.y > VIEW_H) f.y -= VIEW_H;
      const x = (((f.x - cam * f.par) % VIEW_W) + VIEW_W) % VIEW_W;
      s.fillStyle = `rgba(225,238,248,${0.22 * f.s})`;
      s.fillRect(x, f.y, f.s, f.s);
    }
  }

  drawNear(s, cam) {
    s.strokeStyle = '#151f26';
    for (const n of this.near) {
      const x = n.x - cam * 1.35;
      if (x < -300 || x > VIEW_W + 300) continue;
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
    const fadeAll = game.mode === 'stageEnd' ? 1 - 0.85 * clamp01((game.stageEndT - 2.5) / 1.5) : 1;
    const out = [];

    let breath = 0;
    for (const r of game.rings) if (r.strong) breath = Math.max(breath, 1 - (r.t / PULSE.ringSeconds) * 1.4);
    let er = w < THRESHOLDS.heavy ? 14 + 18 * (w / THRESHOLDS.heavy) : 40 + 75 * (w / 100);
    if (game.intro) er *= smooth01((game.intro.t - 2.0) / 1.4);
    out.push({ x: e.x, y: e.y, R: er + 34 * Math.max(0, breath), seed: 1, a: (1 - game.lightsOutAlpha()) * fadeAll });

    // As the cold takes hold, frost creeps back over what was thawed.
    const regrow = 0.1 + 0.9 * clamp01((w - THRESHOLDS.heavy) / (THRESHOLDS.frost - THRESHOLDS.heavy));
    for (const p of game.pickups) out.push({ x: p.x, y: groundY(p.x) - 10, R: 34, seed: p.seed % 97, a: fadeAll * this.pickupFade(p) });
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
    const live = (h) => !(h.until && game.hintFlags[h.until]) && !(h.after && !game.hintFlags[h.after]);
    let nearest = null;
    for (const h of game.level.hints) {
      if (live(h) && Math.abs(e.x - h.x) < 420 && (!nearest || Math.abs(e.x - h.x) < Math.abs(e.x - nearest.x))) nearest = h;
    }
    game.level.hints.forEach((h, i) => {
      const target = (game.intro && game.titleFade > 0.05) || h !== nearest ? 0 : clamp01(1 - Math.abs(e.x - h.x) / 420);
      this.hintAlpha[i] += (target - this.hintAlpha[i]) * Math.min(1, dt * 2);
      if (this.hintAlpha[i] < 0.01) return;
      tm.globalAlpha = 0.9 * this.hintAlpha[i];
      tm.fillText(h.text, h.x, 175);
    });
    tm.restore();

    // Title and closing line, in screen space.
    tm.textAlign = 'center';
    if (game.intro && game.titleFade > 0) {
      tm.globalAlpha = game.titleFade;
      tm.font = `190px ${HAND}`;
      this.writeReveal(tm, 'thaw', VIEW_W / 2, 215, clamp01((game.intro.t - 2.8) / 1.6));
    }
    if (game.mode === 'stageEnd') {
      const T = game.stageEndT;
      tm.globalAlpha = 1;
      tm.font = `64px ${HAND}`;
      this.writeReveal(tm, game.level.closingLine.toLowerCase(), VIEW_W / 2, 190, clamp01((T - 3.2) / 2.6));
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
    f.drawImage(this.small, 0, 0, VIEW_W, VIEW_H);
    f.fillStyle = `rgba(178,202,214,${look.tintA})`;
    f.fillRect(0, 0, VIEW_W, VIEW_H);

    // Crystals are fixed to the world, so they scroll with it.
    f.globalAlpha = look.crystalA;
    const off = -(((cam % TILE_W) + TILE_W) % TILE_W);
    for (let x = off; x < VIEW_W; x += TILE_W) f.drawImage(this.crystals, x, 0);
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
      c.strokeStyle = `rgba(255,205,140,${(1 - p) * (r.strong ? 0.3 : 0.18)})`;
      c.lineWidth = 1.5;
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
    c.fillText('a small warmth in a frozen world', VIEW_W / 2, 270);
    c.font = `300 14px ${SERIF}`;
    c.fillStyle = `rgba(22,40,50,${0.75 * a * clamp01((t - 5) / 1)})`;
    c.fillText('walk: arrows or A and D   ·   pulse: hold space   ·   pause: esc   ·   mute: M', VIEW_W / 2, VIEW_H - 40);
    c.font = `italic 300 13px ${SERIF}`;
    c.fillStyle = `rgba(22,40,50,${0.6 * a * clamp01((t - 5) / 1)})`;
    c.fillText('music: thatgamejam #02 theme by Jason Grace', VIEW_W / 2, VIEW_H - 62);
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

  // ---------- Before play ----------

  // A dark screen asking for a key: browsers only allow sound after the player has pressed something.
  drawGate(game) {
    const c = this.ctx;
    const t = game.time;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#000';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    c.textAlign = 'center';
    c.font = `300 17px ${SERIF}`;
    c.fillStyle = `rgba(214,226,234,${clamp01(t / 1.5) * (0.55 + 0.35 * Math.sin(t * 2))})`;
    c.fillText('press any key to begin', VIEW_W / 2, VIEW_H / 2);
    c.font = `italic 300 14px ${SERIF}`;
    c.fillStyle = `rgba(160,178,190,${0.6 * clamp01((t - 0.8) / 1.5)})`;
    c.fillText('best with sound on', VIEW_W / 2, VIEW_H / 2 + 34);
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
    s.fillRect(0, 0, VIEW_W, VIEW_H);
    glow(s, 300 - cam * 0.15, 455, 440, '255,196,120', 0.42 * (1 - cold));
    const ridge = (par, color, fn) => {
      s.fillStyle = color;
      s.beginPath();
      s.moveTo(0, VIEW_H);
      for (let x = 0; x <= VIEW_W + 12; x += 12) s.lineTo(x, fn(x + cam * par));
      s.lineTo(VIEW_W, VIEW_H);
      s.closePath();
      s.fill();
    };
    ridge(0.2, mix('#8f7556', C.ridges[0], cold), (x) => 400 - Math.abs(Math.sin(x * 0.0028)) * 105 - Math.sin(x * 0.011) * 12);
    ridge(0.5, mix('#6d5940', C.ridges[2], cold), (x) => 490 - Math.abs(Math.sin(x * 0.0051 + 1)) * 50 - Math.sin(x * 0.019) * 6);

    s.save();
    s.translate(-cam, 0);
    // Golden grass that the snow covers.
    const x0 = cam - 40, x1 = cam + VIEW_W + 40;
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
      const x = (((f.x - cam * f.par) % VIEW_W) + VIEW_W) % VIEW_W;
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
      f.drawImage(this.small, 0, 0, VIEW_W, VIEW_H);
      f.fillStyle = 'rgba(178,202,214,0.42)';
      f.fillRect(0, 0, VIEW_W, VIEW_H);
      f.globalAlpha = 0.85;
      const off = -(((cam % TILE_W) + TILE_W) % TILE_W);
      for (let x = off; x < VIEW_W; x += TILE_W) f.drawImage(this.crystals, x, 0);
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
        this.writeReveal(m, l.text, VIEW_W / 2, 190, p);
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
    c.rect(0, 0, VIEW_W, VIEW_H);
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
      c.drawImage(this.frost, 0, 0, VIEW_W, VIEW_H);
      c.globalAlpha = 1;
    }
    const d = P.dark();
    if (d > 0) {
      const dg = c.createRadialGradient(px, py, 20, px, py, 560);
      dg.addColorStop(0, `rgba(0,0,0,${d * 0.35})`);
      dg.addColorStop(1, `rgba(0,0,0,${d})`);
      c.fillStyle = dg;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
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
      this.writeReveal(c, first.text, VIEW_W / 2, 170, l0.p);
    }
    c.globalAlpha = 0.06;
    c.fillStyle = this.grainPatterns[Math.floor(this.frame / 2) % 3];
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    c.globalAlpha = 1;
    const b = P.black();
    if (b > 0) {
      c.fillStyle = `rgba(0,0,0,${b})`;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (t > 3 && t < 55) {
      c.font = `300 13px ${SERIF}`;
      c.textAlign = 'right';
      c.fillStyle = `rgba(200,212,222,${0.35 * clamp01((t - 3) / 2)})`;
      c.fillText('esc to skip', VIEW_W - 28, VIEW_H - 24);
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

  drawPause(c) {
    c.fillStyle = 'rgba(200,222,235,0.6)';
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    c.textAlign = 'center';
    c.fillStyle = '#17303b';
    c.font = `70px ${HAND}`;
    c.fillText('paused', VIEW_W / 2, VIEW_H / 2 - 70);
    c.font = `300 18px ${SERIF}`;
    const lines = [
      'move: arrows, WASD or left stick',
      'pulse: hold space or A',
      'mute: M   ·   restart: R',
      'esc or start to resume',
    ];
    lines.forEach((l, i) => c.fillText(l, VIEW_W / 2, VIEW_H / 2 - 10 + i * 32));
  }

  drawStageEndText(c, game) {
    const T = game.stageEndT;
    const a = clamp01((T - 2.8) / 1);
    c.textAlign = 'center';
    c.font = `300 14px ${SERIF}`;
    c.fillStyle = `rgba(22,40,50,${0.8 * a})`;
    c.fillText(game.level.name.toUpperCase().split('').join(' '), VIEW_W / 2, 112);
    const b = clamp01((T - 5.8) / 1);
    c.font = `italic 300 17px ${SERIF}`;
    c.fillStyle = `rgba(22,40,50,${b})`;
    c.fillText(`companions found: ${game.companions.length} of ${game.totalWanderers}`, VIEW_W / 2, 250);
    // What was chosen at each fork in this stage.
    const forks = game.level.forks || {};
    const said = Object.keys(game.choices).map((k) => forks[k] && forks[k][game.choices[k]]).filter(Boolean);
    if (said.length) c.fillText(said.join('  '), VIEW_W / 2, 280);
    c.font = `300 14px ${SERIF}`;
    c.fillStyle = `rgba(22,40,50,${0.75 * b})`;
    c.fillText('space to keep wandering   ·   R to restart', VIEW_W / 2, 320);
  }
}
