import { VIEW_W, VIEW_H, PULSE, THRESHOLDS } from './config.js';
import { groundY } from './terrain.js';

// Art direction: the whole world sits behind frost, like a window in winter.
// Warmth melts clear patches in the frost. Everything else is seen blurred and pale through it.

const HAND = "'Reenie Beanie', 'Segoe Print', cursive";
const SERIF = "Spectral, Georgia, serif";

const C = {
  skyTop: '#0d1f28',
  skyBottom: '#1f3d48',
  ridges: ['#2a4855', '#213c48', '#1a323d', '#142832'],
  snowRim: '#7f9fae',
  near: '#03070a',
  frost: '#7fb3e0',
  amber: '#f2b25c',
};

const SMALL_W = 320;
const SMALL_H = 180;
const TILE_W = 1024;
// The frost and its melt mask are built at half size: frost is soft anyway, and this keeps frame times low.
const FROST_SCALE = 0.5;
const FW = VIEW_W * FROST_SCALE;
const FH = VIEW_H * FROST_SCALE;

const clamp01 = (v) => Math.max(0, Math.min(1, v));

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
  let sat = 1, blur = 0;
  if (w < THRESHOLDS.frost) sat = 0.55 + 0.45 * clamp01((w - THRESHOLDS.blur) / (THRESHOLDS.frost - THRESHOLDS.blur));
  if (w < THRESHOLDS.blur) {
    const k = clamp01((w - THRESHOLDS.heavy) / (THRESHOLDS.blur - THRESHOLDS.heavy));
    sat = 0.15 + 0.4 * k;
    blur = 2.5 * (1 - k);
  }
  if (w < THRESHOLDS.heavy) {
    sat = 0.1;
    blur = 2.5 + 3.5 * (1 - w / THRESHOLDS.heavy);
  }
  // The frost itself thickens as warmth drops.
  const cold = clamp01((THRESHOLDS.frost - w) / THRESHOLDS.frost);
  return { sat, blur, frostA: 0.86 + 0.14 * cold, tintA: 0.28 + 0.25 * cold, crystalA: 0.65 + 0.35 * cold };
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
    this.crystals = this.makeCrystals();
    this.grain = [0, 1, 2].map((i) => this.makeGrain(i));
    this.grainPatterns = this.grain.map((g) => this.ctx.createPattern(g, 'repeat'));
    this.frame = 0;
    this.trail = [];

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
    for (let c = 0; c < 26; c++) {
      const cx = r() * TILE_W, cy = r() * VIEW_H;
      const base = r() * Math.PI * 2;
      const n = 4 + Math.floor(r() * 6);
      for (let k = 0; k < n; k++) {
        const a = base + (r() - 0.5) * 1.6;
        const len = 25 + r() * 70;
        const alpha = 0.12 + r() * 0.14;
        const seed = Math.floor(r() * 1e9);
        wrap((ox) => frond(cx + ox, cy, a, len, alpha, 2, rng(seed)));
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
    const w = game.displayWarmth();
    const look = warmthLook(w);
    this.updateTrail(game);

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
      c.filter = `blur(${(look.blur * this.scale).toFixed(2)}px) saturate(${look.sat.toFixed(2)})`;
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
    if (game.mode !== 'title') this.drawBar(c, game);
    if (game.mode === 'title' || game.titleFade > 0) this.drawTitleText(c, game, game.time);
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
    this.drawFire(s, game.fire, t);
    this.drawLights(s, game, t);
    this.drawMist(s, t);
    this.drawCompanions(s, game);
    this.drawEmber(s, game, t);
    s.restore();
    this.drawSnow(s, cam, dt, t);
    this.drawNear(s, cam);
  }

  drawSky(s, cam, t) {
    const g = s.createLinearGradient(0, 0, 0, VIEW_H * 0.75);
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
    // Four ridges, each nearer one darker and sharper: atmospheric depth.
    const ridges = [
      [0.12, (x) => 330 - Math.abs(Math.sin(x * 0.0024)) * 120 - Math.sin(x * 0.009) * 16],
      [0.25, (x) => 395 - Math.abs(Math.sin(x * 0.0033 + 0.7)) * 95 - Math.sin(x * 0.013) * 10],
      [0.45, (x) => 455 - Math.abs(Math.sin(x * 0.0046 + 2)) * 65 - Math.sin(x * 0.019) * 7],
      [0.7, (x) => 515 - Math.abs(Math.sin(x * 0.006 + 1)) * 42 - Math.sin(x * 0.027) * 5],
    ];
    ridges.forEach(([par, fn], i) => {
      s.fillStyle = C.ridges[i];
      s.beginPath();
      s.moveTo(0, VIEW_H);
      for (let x = 0; x <= VIEW_W + 12; x += 12) s.lineTo(x, fn(x + cam * par));
      s.lineTo(VIEW_W, VIEW_H);
      s.closePath();
      s.fill();
      // A pale snow line on each ridge top.
      s.strokeStyle = `rgba(170,200,215,${0.1 - i * 0.015})`;
      s.lineWidth = 1.5;
      s.stroke();
    });
  }

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
    const g = s.createLinearGradient(0, 540, 0, VIEW_H);
    g.addColorStop(0, '#2a4553');
    g.addColorStop(0.3, '#1a2f3a');
    g.addColorStop(1, '#0c171d');
    s.fillStyle = g;
    s.fill();
    top();
    s.strokeStyle = 'rgba(120,160,180,0.18)';
    s.lineWidth = 9;
    s.stroke();
    top();
    s.strokeStyle = C.snowRim;
    s.lineWidth = 2;
    s.stroke();
    // Wind-cut ridges in the snow.
    s.strokeStyle = 'rgba(110,150,170,0.16)';
    s.lineWidth = 1;
    for (let x = Math.floor(x0 / 90) * 90; x < x1; x += 90) {
      const y = groundY(x) + 14 + (hash(3, x) + 1) * 10;
      s.beginPath();
      s.moveTo(x, y);
      s.quadraticCurveTo(x + 30, y - 4, x + 60 + hash(5, x) * 15, y + 1);
      s.stroke();
    }
  }

  drawObject(s, o, t) {
    if (o.gone) return;
    const warm = o.state === 'thawed' ? 1 : o.state === 'melting' ? o.meltT : 0;
    if (o.type === 'tree') this.drawPine(s, o.x, groundY(o.x) + 6, 175, o.seed, warm);
    else if (o.type === 'lantern') this.drawLantern(s, o, warm, t);
    else if (o.type === 'wanderer') this.drawWanderer(s, o, warm, t);
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

  drawWanderer(s, o, warm, t) {
    const x = o.x;
    const b = groundY(x) + 6;
    const sway = warm > 0 ? Math.sin(t * 2) * 2 : 0;
    // A small hooded figure, curled against the cold.
    s.fillStyle = mix('#29404d', '#e8c48a', warm);
    s.beginPath();
    s.moveTo(x - 13 + sway, b);
    s.quadraticCurveTo(x - 15 + sway, b - 30, x - 2 + sway, b - 52);
    s.quadraticCurveTo(x + 3 + sway, b - 58, x + 6 + sway, b - 50);
    s.quadraticCurveTo(x + 15 + sway, b - 30, x + 13 + sway, b);
    s.closePath();
    s.fill();
    s.fillStyle = mix('#0e1a21', '#5a3a1c', warm);
    s.beginPath();
    s.ellipse(x + 2 + sway, b - 42, 4.5, 5.5, 0.2, 0, Math.PI * 2);
    s.fill();
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
    const e = game.ember;
    const dim = 1 - game.lightsOutAlpha();
    glow(s, e.x, e.y, game.glowRadius(), '255,170,80', 0.45 * dim);
    if (game.mode === 'title' || game.titleFade > 0) {
      const a = game.mode === 'title' ? 1 : game.titleFade;
      glow(s, game.camX + VIEW_W / 2, VIEW_H / 2 - 40, 420, '255,170,80', 0.35 * a);
    }
    s.restore();
  }

  drawMist(s, t) {
    this.mistBlobs.forEach((blobs) => {
      for (const m of blobs) glow(s, m.x + Math.sin(t * 0.2 * m.sp + m.x) * 30, m.y, m.r, '200,218,230', 0.14);
    });
  }

  drawCompanions(s, game) {
    for (const c of game.companions) {
      s.fillStyle = '#ffe6bf';
      s.beginPath();
      s.arc(c.x, c.y, 4.5, 0, Math.PI * 2);
      s.fill();
    }
  }

  updateTrail(game) {
    const e = game.ember;
    const last = this.trail[this.trail.length - 1];
    if (last && Math.hypot(e.x - last.x, e.y - last.y) > 200) this.trail = [];
    this.trail.push({ x: e.x, y: e.y });
    const max = Math.round(6 + 22 * (game.displayWarmth() / 100));
    while (this.trail.length > max) this.trail.shift();
  }

  // The ember: a flame with a tail. The tail is long when warm and shrinks as warmth runs out.
  drawEmber(s, game, t) {
    const e = game.ember;
    const w = game.displayWarmth();
    const dim = 1 - game.lightsOutAlpha();
    if (dim <= 0) return;
    const r = w < THRESHOLDS.heavy ? 2.5 + 3.5 * (w / THRESHOLDS.heavy) : 6 + 3 * (w / 100);
    s.save();
    s.globalCompositeOperation = 'lighter';
    const n = this.trail.length;
    for (let i = 0; i < n - 1; i++) {
      const p = this.trail[i];
      const k = (i + 1) / n;
      const wob = Math.sin(t * 8 + i * 0.7) * (1 - k) * 3;
      s.fillStyle = `rgba(${Math.round(255)},${Math.round(110 + 90 * k)},${Math.round(40 + 60 * k)},${0.28 * k * dim})`;
      s.beginPath();
      s.arc(p.x, p.y + wob, r * (0.35 + 0.65 * k), 0, Math.PI * 2);
      s.fill();
    }
    s.restore();

    const speed = Math.hypot(e.vx, e.vy);
    const stretch = 1 + Math.min(0.5, speed / 260);
    const ang = Math.atan2(e.vy, e.vx);
    const flick = 1 + 0.07 * Math.sin(t * 11) + 0.04 * Math.sin(t * 23);
    s.save();
    s.translate(e.x, e.y);
    s.rotate(ang);
    s.scale(stretch, 1 / Math.sqrt(stretch));
    const g = s.createRadialGradient(0, 0, 0, 0, 0, r * flick);
    g.addColorStop(0, `rgba(255,250,235,${dim})`);
    g.addColorStop(0.55, `rgba(255,205,120,${dim})`);
    g.addColorStop(1, `rgba(255,140,60,${dim})`);
    s.fillStyle = g;
    s.beginPath();
    s.arc(0, 0, r * flick, 0, Math.PI * 2);
    s.fill();
    s.restore();
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
    s.fillStyle = C.near;
    s.strokeStyle = C.near;
    for (const n of this.near) {
      const x = n.x - cam * 1.35;
      if (x < -300 || x > VIEW_W + 300) continue;
      if (n.kind === 'drift') {
        s.beginPath();
        s.ellipse(x, VIEW_H + 18, n.w, n.h, 0, Math.PI, 0);
        s.fill();
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
    const er = w < THRESHOLDS.heavy ? 8 + 14 * (w / THRESHOLDS.heavy) : 26 + 64 * (w / 100);
    out.push({ x: e.x, y: e.y, R: er + 34 * Math.max(0, breath), seed: 1, a: (1 - game.lightsOutAlpha()) * fadeAll });

    for (const c of game.companions) out.push({ x: c.x, y: c.y, R: 26, seed: 2 + c.phase, a: fadeAll });

    for (const o of game.objects) {
      const b = o.bounds;
      let R = 0;
      if (o.state === 'frozen') R = o.progress > 0 ? b.reach * 0.45 * (o.progress / o.pulses) : 0;
      else if (o.state === 'melting') R = b.reach * 0.45 + (b.reach * 0.55 + 30) * o.meltT;
      else R = b.reach + 30 + (o.type === 'lantern' ? o.radius * 0.6 : 150) * o.spread;
      if (R > 0) out.push({ x: b.cx, y: b.cy, R, seed: o.seed, a: fadeAll, obj: o });
    }

    const f = game.fire;
    out.push({ x: f.x, y: groundY(f.x) - 70, R: 200 + 8 * Math.sin(t * 3), seed: 77, a: fadeAll });
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

    // Hints are written into the frost, like a finger on a cold window.
    const e = game.ember;
    m.font = `50px ${HAND}`;
    m.textAlign = 'center';
    game.level.hints.forEach((h, i) => {
      const done = h.until && game.hintFlags[h.until];
      const target = game.mode === 'title' || done ? 0 : clamp01(1 - Math.abs(e.x - h.x) / 420);
      this.hintAlpha[i] += (target - this.hintAlpha[i]) * Math.min(1, dt * 2);
      if (this.hintAlpha[i] < 0.01) return;
      m.globalAlpha = 0.9 * this.hintAlpha[i];
      m.fillText(h.text, h.x, groundY(h.x) - 250);
    });
    m.restore();

    // Title and closing line, in screen space.
    m.textAlign = 'center';
    if (game.mode === 'title' || game.titleFade > 0) {
      const a = game.mode === 'title' ? 1 : game.titleFade;
      m.globalAlpha = a;
      m.font = `190px ${HAND}`;
      this.writeReveal(m, 'thaw', VIEW_W / 2, VIEW_H / 2 - 10, Math.min(1, t / 1.6));
    }
    if (game.mode === 'stageEnd') {
      const T = game.stageEndT;
      m.globalAlpha = 1;
      m.font = `64px ${HAND}`;
      this.writeReveal(m, game.level.closingLine.toLowerCase(), VIEW_W / 2, VIEW_H / 2 - 10, clamp01((T - 3.2) / 2.6));
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
    f.fillStyle = `rgba(160,190,205,${look.tintA})`;
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

  drawTitleText(c, game, t) {
    const a = game.mode === 'title' ? 1 : game.titleFade;
    c.textAlign = 'center';
    c.font = `italic 300 21px ${SERIF}`;
    c.fillStyle = `rgba(22,40,50,${a * clamp01((t - 1.2) / 1)})`;
    c.fillText('a small ember in a frozen world', VIEW_W / 2, VIEW_H / 2 + 60);
    c.font = `300 16px ${SERIF}`;
    c.fillStyle = `rgba(22,40,50,${a * clamp01((t - 2) / 1) * (0.55 + 0.45 * Math.sin(t * 2.5))})`;
    c.fillText('press any key to wake', VIEW_W / 2, VIEW_H / 2 + 130);
    c.font = `300 14px ${SERIF}`;
    c.fillStyle = `rgba(22,40,50,${0.75 * a})`;
    c.fillText('move: arrows or WASD   ·   pulse: hold space   ·   pause: esc   ·   mute: M', VIEW_W / 2, VIEW_H - 40);
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
    c.fillText(game.level.name.toUpperCase().split('').join(' '), VIEW_W / 2, VIEW_H / 2 - 92);
    const b = clamp01((T - 5.8) / 1);
    c.font = `italic 300 17px ${SERIF}`;
    c.fillStyle = `rgba(22,40,50,${b})`;
    c.fillText(`companions found: ${game.companions.length} of ${game.totalWanderers}`, VIEW_W / 2, VIEW_H / 2 + 50);
    c.font = `300 14px ${SERIF}`;
    c.fillStyle = `rgba(22,40,50,${0.75 * b})`;
    c.fillText('space to keep wandering   ·   R to restart', VIEW_W / 2, VIEW_H / 2 + 100);
  }
}
