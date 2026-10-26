import { VIEW_W, VIEW_H, PULSE, THRESHOLDS } from './config.js';
import { groundY } from './terrain.js';

const C = {
  skyTop: '#04070d',
  skyBottom: '#0b1424',
  far: '#0a1220',
  mid: '#070e18',
  ground: '#05090f',
  frost: '#7fb3e0',
  amber: '#f2b25c',
};

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

// How warmth bends the picture: color drains below 60%, blur starts below 35%.
function warmthLook(w) {
  let sat = 1, blur = 0;
  if (w < THRESHOLDS.frost) sat = 0.55 + 0.45 * clamp01((w - THRESHOLDS.blur) / (THRESHOLDS.frost - THRESHOLDS.blur));
  if (w < THRESHOLDS.blur) {
    sat = 0.15 + 0.4 * clamp01((w - THRESHOLDS.heavy) / (THRESHOLDS.blur - THRESHOLDS.heavy));
    blur = 2.5 * (1 - clamp01((w - THRESHOLDS.heavy) / (THRESHOLDS.blur - THRESHOLDS.heavy)));
  }
  if (w < THRESHOLDS.heavy) {
    sat = 0.1;
    blur = 2.5 + 3.5 * (1 - w / THRESHOLDS.heavy);
  }
  return { sat, blur };
}

export class Renderer {
  constructor(canvas, level) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scene = document.createElement('canvas');
    this.scene.width = VIEW_W;
    this.scene.height = VIEW_H;
    this.sctx = this.scene.getContext('2d');

    const r = rng(42);
    this.stars = Array.from({ length: 140 }, () => ({
      x: r() * VIEW_W, y: r() * VIEW_H * 0.6, s: 1 + r() * 1.5, a: 0.2 + r() * 0.4, tw: 0.5 + r() * 2,
    }));
    this.snow = Array.from({ length: 120 }, () => ({
      x: r() * VIEW_W, y: r() * VIEW_H, s: 0.8 + r() * 1.8, vy: 12 + r() * 22, vx: -6 + r() * 4, par: 0.3 + r() * 0.6, ph: r() * 6,
    }));
    this.mistBlobs = level.mist.map((m) => {
      const n = Math.round((m.x1 - m.x0) / 55);
      return Array.from({ length: n }, () => ({
        x: m.x0 + r() * (m.x1 - m.x0), y: 220 + r() * 360, r: 110 + r() * 130, sp: 0.5 + r(),
      }));
    });
    this.hintAlpha = level.hints.map(() => 0);
    this.frost = this.makeFrost();

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

  // Frost crystals packed toward the screen edges.
  makeFrost() {
    const cv = document.createElement('canvas');
    cv.width = VIEW_W;
    cv.height = VIEW_H;
    const ctx = cv.getContext('2d');
    const r = rng(7);
    ctx.strokeStyle = 'rgba(205,232,255,0.22)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 1100; i++) {
      const d = r() * r() * 190;
      const side = Math.floor(r() * 4);
      const along = r();
      const x = side === 0 ? d : side === 1 ? VIEW_W - d : along * VIEW_W;
      const y = side === 2 ? d : side === 3 ? VIEW_H - d : along * VIEW_H;
      const len = 4 + r() * 10;
      for (let k = 0; k < 3; k++) {
        const a = r() * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        ctx.stroke();
      }
    }
    return cv;
  }

  draw(game, dt) {
    const s = this.sctx;
    const cam = game.camX;
    const t = game.time;
    const w = game.displayWarmth();

    this.drawSky(s, cam, t);
    s.save();
    s.translate(-cam, 0);
    this.drawGround(s, cam);
    for (const o of game.objects) this.drawObject(s, o, t);
    this.drawFire(s, game.fire, t);
    this.drawLights(s, game, t);
    this.drawMist(s, game, t);
    this.drawRings(s, game);
    this.drawShimmers(s, game);
    this.drawCompanions(s, game);
    this.drawEmber(s, game, t);
    this.drawHints(s, game, dt);
    s.restore();
    this.drawSnow(s, cam, dt, t);

    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#000';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    c.save();
    c.beginPath();
    c.rect(0, 0, VIEW_W, VIEW_H);
    c.clip();

    const look = warmthLook(w);
    if (look.blur > 0.05 || look.sat < 0.99) {
      c.filter = `blur(${(look.blur * this.scale).toFixed(2)}px) saturate(${look.sat.toFixed(2)})`;
    }
    c.drawImage(this.scene, 0, 0);
    c.filter = 'none';

    this.drawFrost(c, w);
    const lo = game.lightsOutAlpha();
    if (lo > 0) {
      c.fillStyle = `rgba(0,0,0,${lo})`;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (game.mode !== 'title') this.drawBar(c, game);
    if (game.mode === 'title' || game.titleFade > 0) this.drawTitle(c, game, t);
    if (game.mode === 'paused') this.drawPause(c);
    if (game.mode === 'stageEnd') this.drawStageEnd(c, game, t);
    if (game.audio.muted) {
      c.font = '12px Georgia, serif';
      c.fillStyle = 'rgba(200,215,230,0.5)';
      c.textAlign = 'left';
      c.fillText('muted (M)', 28, VIEW_H - 24);
    }
    c.restore();
  }

  drawSky(s, cam, t) {
    const g = s.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, C.skyTop);
    g.addColorStop(1, C.skyBottom);
    s.fillStyle = g;
    s.fillRect(0, 0, VIEW_W, VIEW_H);

    for (const st of this.stars) {
      const x = (((st.x - cam * 0.04) % VIEW_W) + VIEW_W) % VIEW_W;
      const a = st.a * (0.6 + 0.4 * Math.sin(t * st.tw + st.x));
      s.fillStyle = `rgba(190,215,240,${a})`;
      s.fillRect(x, st.y, st.s, st.s);
    }

    this.ridge(s, cam * 0.25, C.far, (x) => 390 - Math.abs(Math.sin(x * 0.003)) * 95 - Math.sin(x * 0.011) * 14);
    this.ridge(s, cam * 0.5, C.mid, (x) => 480 - Math.abs(Math.sin(x * 0.0047 + 1)) * 55 - Math.sin(x * 0.017) * 8);
  }

  ridge(s, offset, color, fn) {
    s.fillStyle = color;
    s.beginPath();
    s.moveTo(0, VIEW_H);
    for (let x = 0; x <= VIEW_W + 16; x += 16) s.lineTo(x, fn(x + offset));
    s.lineTo(VIEW_W, VIEW_H);
    s.closePath();
    s.fill();
  }

  drawGround(s, cam) {
    const x0 = cam - 40;
    const x1 = cam + VIEW_W + 40;
    s.beginPath();
    s.moveTo(x0, VIEW_H);
    for (let x = x0; x <= x1; x += 12) s.lineTo(x, groundY(x));
    s.lineTo(x1, VIEW_H);
    s.closePath();
    s.fillStyle = C.ground;
    s.fill();

    s.beginPath();
    for (let x = x0; x <= x1; x += 12) {
      if (x === x0) s.moveTo(x, groundY(x));
      else s.lineTo(x, groundY(x));
    }
    s.strokeStyle = 'rgba(120,170,220,0.35)';
    s.lineWidth = 2;
    s.stroke();
  }

  drawObject(s, o, t) {
    if (o.gone) return;
    const warm = o.state === 'thawed' ? 1 : o.state === 'melting' ? o.meltT : 0;
    if (o.type === 'tree') this.drawTree(s, o, warm);
    else if (o.type === 'lantern') this.drawLantern(s, o, warm, t);
    else if (o.type === 'wanderer') this.drawWanderer(s, o, warm, t);
    if (o.state !== 'thawed') this.drawIce(s, o, t);
  }

  drawTree(s, o, warm) {
    const x = o.x;
    const b = groundY(x) + 6;
    s.fillStyle = mix('#141e2c', '#4a2e17', warm);
    s.fillRect(x - 4, b - 34, 8, 34);
    const body = mix('#1c2b40', '#b9772f', warm);
    const tiers = [[118, b - 28, 62], [92, b - 70, 58], [64, b - 108, 54]];
    for (const [tw, by, th] of tiers) {
      s.beginPath();
      s.moveTo(x - tw / 2, by);
      s.quadraticCurveTo(x, by + 8, x + tw / 2, by);
      s.lineTo(x, by - th);
      s.closePath();
      s.fillStyle = body;
      s.fill();
      s.lineWidth = 2;
      s.strokeStyle = `rgba(170,210,245,${0.45 * (1 - warm)})`;
      s.beginPath();
      s.moveTo(x - tw / 2 + 4, by - 2);
      s.lineTo(x, by - th + 2);
      s.stroke();
      s.strokeStyle = `rgba(255,205,130,${0.55 * warm})`;
      s.beginPath();
      s.moveTo(x + tw / 2 - 4, by - 2);
      s.lineTo(x, by - th + 2);
      s.stroke();
    }
  }

  drawLantern(s, o, warm, t) {
    const x = o.x;
    const b = groundY(x) + 6;
    s.fillStyle = mix('#18243a', '#3a2715', warm);
    s.fillRect(x - 3, b - 118, 6, 118);
    s.fillRect(x - 3, b - 118, 22, 4);
    const lx = o.x + 16;
    const ly = groundY(o.x) - 92;
    const flicker = 0.85 + 0.15 * Math.sin(t * 9 + o.seed);
    s.fillStyle = warm > 0 ? `rgba(255,210,127,${warm * flicker})` : 'rgba(70,110,150,0.45)';
    roundRect(s, lx - 8, ly - 11, 16, 22, 3);
    s.fill();
    s.strokeStyle = mix('#2a3c58', '#6b4520', warm);
    s.lineWidth = 2;
    s.stroke();
  }

  drawWanderer(s, o, warm, t) {
    const x = o.x;
    const b = groundY(x) + 6;
    const sway = warm > 0 ? Math.sin(t * 2) * 2 : 0;
    s.fillStyle = mix('#2e4664', '#e8c48a', warm);
    s.beginPath();
    s.ellipse(x + sway, b - 20, 11, 18, 0, 0, Math.PI * 2);
    s.fill();
    s.beginPath();
    s.arc(x + sway, b - 44, 8, 0, Math.PI * 2);
    s.fill();
  }

  // The ice shell: cracks grow with each pulse, then it fades while melting.
  drawIce(s, o, t) {
    const b = o.bounds;
    const k = o.state === 'melting' ? 1 - o.meltT : 1;
    const pad = 8;
    roundRect(s, b.x0 - pad, b.y0 - pad, b.x1 - b.x0 + pad * 2, b.y1 - b.y0 + pad, 10);
    s.fillStyle = `rgba(150,200,240,${0.1 * k})`;
    s.fill();
    s.strokeStyle = `rgba(190,225,255,${0.45 * k})`;
    s.lineWidth = 1.5;
    s.stroke();
    if (o.hit > 0) {
      s.fillStyle = `rgba(255,200,130,${0.18 * o.hit})`;
      s.fill();
    }

    const r = rng(o.seed);
    const n = Math.round((o.progress / o.pulses) * 7);
    s.strokeStyle = `rgba(235,248,255,${(0.5 + 0.5 * o.hit) * k})`;
    s.lineWidth = 1.2;
    for (let i = 0; i < 7; i++) {
      let x = b.x0 + r() * (b.x1 - b.x0);
      let y = b.y0 + r() * (b.y1 - b.y0);
      const segs = [];
      for (let j = 0; j < 3; j++) segs.push([r() * Math.PI * 2, 14 + r() * 16]);
      if (i >= n) continue;
      s.beginPath();
      s.moveTo(x, y);
      for (const [a, len] of segs) {
        x += Math.cos(a) * len;
        y += Math.sin(a) * len;
        s.lineTo(x, y);
      }
      s.stroke();
    }

    if (o.state === 'frozen') {
      // A faint glint so frozen things read in the dark.
      const g = Math.pow(Math.max(0, Math.sin(t * 1.7 + o.seed)), 8);
      if (g > 0.01) {
        const gx = b.x0 + 10;
        const gy = b.y0 + 6;
        s.strokeStyle = `rgba(230,245,255,${0.8 * g})`;
        s.lineWidth = 1;
        s.beginPath();
        s.moveTo(gx - 6, gy);
        s.lineTo(gx + 6, gy);
        s.moveTo(gx, gy - 6);
        s.lineTo(gx, gy + 6);
        s.stroke();
      }
    } else {
      s.fillStyle = `rgba(200,230,255,${0.6 * k})`;
      for (let i = 0; i < 6; i++) {
        const dx = b.x0 + ((i + 0.5) / 6) * (b.x1 - b.x0);
        const dy = b.y1 - 20 + ((t * 60 + i * 23) % 30);
        s.fillRect(dx, dy, 2, 4);
      }
    }
  }

  drawFire(s, f, t) {
    const x = f.x;
    const b = groundY(x) + 4;
    s.strokeStyle = '#2a1a0e';
    s.lineWidth = 7;
    s.lineCap = 'round';
    s.beginPath();
    s.moveTo(x - 24, b - 2);
    s.lineTo(x + 20, b - 12);
    s.moveTo(x + 24, b - 2);
    s.lineTo(x - 20, b - 12);
    s.stroke();
    s.lineCap = 'butt';

    s.save();
    s.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 5; k++) {
      const h = 70 + 18 * Math.sin(t * 6 + k * 1.7) - Math.abs(k - 2) * 12;
      const fw = 26 - Math.abs(k - 2) * 4;
      const xo = x + (k - 2) * 9 + Math.sin(t * 4 + k) * 3;
      const g = s.createLinearGradient(0, b, 0, b - h);
      g.addColorStop(0, 'rgba(255,140,40,0.85)');
      g.addColorStop(0.6, 'rgba(255,190,90,0.5)');
      g.addColorStop(1, 'rgba(255,225,150,0)');
      s.fillStyle = g;
      s.beginPath();
      s.moveTo(xo - fw / 2, b - 8);
      s.quadraticCurveTo(xo - fw / 2, b - h * 0.6, xo, b - h);
      s.quadraticCurveTo(xo + fw / 2, b - h * 0.6, xo + fw / 2, b - 8);
      s.closePath();
      s.fill();
    }
    for (let i = 0; i < 8; i++) {
      const p = (t * 0.6 + i / 8) % 1;
      const sx = x + Math.sin(i * 3.1 + t * 2) * 16 * p;
      s.fillStyle = `rgba(255,190,100,${0.8 * (1 - p)})`;
      s.fillRect(sx, b - 30 - p * 120, 2, 2);
    }
    s.restore();
  }

  drawLights(s, game, t) {
    s.save();
    s.globalCompositeOperation = 'lighter';
    const f = game.fire;
    const fb = groundY(f.x) - 30;
    glow(s, f.x, fb, 340 * (1 + 0.04 * Math.sin(t * 7)), '255,150,60', 0.32);
    glow(s, f.x, fb, 120, '255,200,120', 0.4);

    for (const o of game.objects) {
      const b = o.bounds;
      if (o.state === 'melting') glow(s, b.cx, b.cy, 60 + 60 * o.meltT, '240,170,80', 0.2 * o.meltT);
      if (o.state !== 'thawed') continue;
      if (o.type === 'lantern') {
        const lx = o.x + 16;
        const ly = groundY(o.x) - 92;
        glow(s, lx, ly, o.radius * (0.4 + 0.6 * o.spread) * (1 + 0.03 * Math.sin(t * 8)), '255,190,100', 0.4);
      } else if (!o.gone) {
        // Color spreads out from the thawed thing itself, never as a whole-screen wash.
        glow(s, b.cx, b.cy, 60 + 240 * o.spread, '240,170,80', 0.22 * o.spread);
      }
    }

    for (const c of game.companions) glow(s, c.x, c.y, 50, '255,215,160', 0.35);

    const e = game.ember;
    const dim = 1 - game.lightsOutAlpha();
    glow(s, e.x, e.y, game.glowRadius(), '255,180,90', 0.55 * dim);
    glow(s, e.x, e.y, 22, '255,235,200', 0.9 * dim);
    s.restore();
  }

  drawMist(s, game, t) {
    this.mistBlobs.forEach((blobs) => {
      for (const m of blobs) {
        const x = m.x + Math.sin(t * 0.2 * m.sp + m.x) * 30;
        glow(s, x, m.y, m.r, '185,205,225', 0.13);
      }
    });
  }

  drawRings(s, game) {
    for (const r of game.rings) {
      const p = r.t / PULSE.ringSeconds;
      const ease = 1 - Math.pow(1 - p, 3);
      s.strokeStyle = `rgba(255,200,130,${(1 - p) * (r.strong ? 0.6 : 0.35)})`;
      s.lineWidth = r.strong ? 2.5 : 1.5;
      s.beginPath();
      s.arc(r.x, r.y, Math.max(1, r.r * ease), 0, Math.PI * 2);
      s.stroke();
    }
  }

  drawShimmers(s, game) {
    for (const m of game.shimmers) {
      const a = Math.sin(Math.PI * (m.t / m.life)) * 0.55;
      s.fillStyle = `rgba(200,230,255,${a})`;
      s.beginPath();
      s.arc(m.x, m.y, 1.6, 0, Math.PI * 2);
      s.fill();
    }
  }

  drawCompanions(s, game) {
    for (const c of game.companions) {
      s.fillStyle = '#ffe6bf';
      s.beginPath();
      s.arc(c.x, c.y, 5, 0, Math.PI * 2);
      s.fill();
    }
  }

  drawEmber(s, game, t) {
    const e = game.ember;
    const w = game.displayWarmth();
    const dim = 1 - game.lightsOutAlpha();
    if (dim <= 0) return;
    const r = w < THRESHOLDS.heavy ? 2.5 + 3.5 * (w / THRESHOLDS.heavy) : 6 + 3 * (w / 100);
    const flick = 1 + 0.06 * Math.sin(t * 11);
    const g = s.createRadialGradient(e.x, e.y, 0, e.x, e.y, r * flick);
    g.addColorStop(0, `rgba(255,248,230,${dim})`);
    g.addColorStop(1, `rgba(255,170,80,${dim})`);
    s.fillStyle = g;
    s.beginPath();
    s.arc(e.x, e.y, r * flick, 0, Math.PI * 2);
    s.fill();
  }

  drawHints(s, game, dt) {
    const e = game.ember;
    s.font = 'italic 20px Georgia, serif';
    s.textAlign = 'center';
    game.level.hints.forEach((h, i) => {
      const done = h.until && game.hintFlags[h.until];
      const target = game.mode === 'title' || done ? 0 : clamp01(1 - Math.abs(e.x - h.x) / 380);
      this.hintAlpha[i] += (target - this.hintAlpha[i]) * Math.min(1, dt * 2);
      if (this.hintAlpha[i] < 0.01) return;
      s.fillStyle = `rgba(200,220,240,${0.75 * this.hintAlpha[i]})`;
      s.fillText(h.text, h.x, groundY(h.x) - 240);
    });
  }

  drawSnow(s, cam, dt, t) {
    for (const f of this.snow) {
      f.y += f.vy * dt;
      f.x += (f.vx + Math.sin(t + f.ph) * 8) * dt;
      if (f.y > VIEW_H) f.y -= VIEW_H;
      const x = (((f.x - cam * f.par) % VIEW_W) + VIEW_W) % VIEW_W;
      s.fillStyle = `rgba(210,228,245,${0.2 * f.s})`;
      s.fillRect(x, f.y, f.s, f.s);
    }
  }

  drawFrost(c, w) {
    if (w >= THRESHOLDS.frost) return;
    const a = clamp01((THRESHOLDS.frost - w) / THRESHOLDS.frost);
    c.globalAlpha = Math.min(1, a * 1.4);
    c.drawImage(this.frost, 0, 0);
    c.globalAlpha = 1;
    const g = c.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.3, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.9);
    g.addColorStop(0, 'rgba(140,180,215,0)');
    g.addColorStop(1, `rgba(150,190,225,${0.45 * a})`);
    c.fillStyle = g;
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    if (w < THRESHOLDS.heavy) {
      c.fillStyle = `rgba(2,4,8,${((THRESHOLDS.heavy - w) / THRESHOLDS.heavy) * 0.45})`;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  // The warmth bar: amber when full, frost blue as it drains, pulsing with the heartbeat below 35%.
  drawBar(c, game) {
    const w = game.ember.warmth;
    const x = 28, y = 30, bw = 180, bh = 6;
    const low = w < THRESHOLDS.blur;
    const beat = game.beatEnvelope();
    const col = mix(C.frost, C.amber, (w - THRESHOLDS.heavy) / (THRESHOLDS.frost - THRESHOLDS.heavy));
    const fade = 1 - game.lightsOutAlpha() * 0.7;

    c.globalAlpha = fade;
    c.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(c, x, y, bw, bh, 3);
    c.fill();
    if (w > 0.2) {
      c.save();
      if (low) {
        c.shadowColor = col;
        c.shadowBlur = 14 * beat;
        c.globalAlpha = fade * (0.55 + 0.45 * beat);
      }
      c.fillStyle = col;
      roundRect(c, x, y, bw * (w / 100), bh, 3);
      c.fill();
      c.restore();
    }
    if (game.barFlash > 0 || low) {
      const a = low ? 0.75 : Math.min(1, game.barFlash);
      c.font = '13px Georgia, serif';
      c.textAlign = 'left';
      c.fillStyle = `rgba(220,230,240,${a * fade})`;
      c.fillText('warmth', x + bw + 12, y + 7);
    }
    c.globalAlpha = 1;
  }

  drawTitle(c, game, t) {
    const a = game.mode === 'title' ? 1 : game.titleFade;
    c.fillStyle = `rgba(3,6,11,${0.6 * a})`;
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    c.textAlign = 'center';
    c.fillStyle = `rgba(242,194,123,${a})`;
    c.font = '300 96px Georgia, serif';
    c.fillText('Thaw', VIEW_W / 2, VIEW_H / 2 - 30);
    c.font = 'italic 20px Georgia, serif';
    c.fillStyle = `rgba(157,182,207,${a})`;
    c.fillText('a small ember in a frozen world', VIEW_W / 2, VIEW_H / 2 + 14);
    c.font = '16px Georgia, serif';
    c.fillStyle = `rgba(220,230,240,${a * (0.5 + 0.5 * Math.sin(t * 2.5))})`;
    c.fillText('Press any key to wake', VIEW_W / 2, VIEW_H / 2 + 90);
    c.font = '13px Georgia, serif';
    c.fillStyle = `rgba(127,149,171,${a})`;
    c.fillText('Move: Arrows or WASD   ·   Pulse: hold Space   ·   Pause: Esc   ·   Mute: M', VIEW_W / 2, VIEW_H - 40);
  }

  drawPause(c) {
    c.fillStyle = 'rgba(3,6,11,0.72)';
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    c.textAlign = 'center';
    c.fillStyle = '#f2c27b';
    c.font = '40px Georgia, serif';
    c.fillText('Paused', VIEW_W / 2, VIEW_H / 2 - 70);
    c.font = '17px Georgia, serif';
    c.fillStyle = '#c9d6e3';
    const lines = [
      'Move: Arrows, WASD or left stick',
      'Pulse: hold Space or A',
      'Mute: M   ·   Restart: R',
      'Esc or Start to resume',
    ];
    lines.forEach((l, i) => c.fillText(l, VIEW_W / 2, VIEW_H / 2 - 10 + i * 32));
  }

  drawStageEnd(c, game, t) {
    const T = game.stageEndT;
    const a = clamp01((T - 2.5) / 1.5);
    if (a <= 0) return;
    c.fillStyle = `rgba(5,9,16,${0.9 * a})`;
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    for (const st of this.stars) {
      c.fillStyle = `rgba(190,215,240,${st.a * a * (0.6 + 0.4 * Math.sin(t * st.tw + st.x))})`;
      c.fillRect(st.x, st.y * 1.6, st.s, st.s);
    }
    c.textAlign = 'center';
    c.font = '15px Georgia, serif';
    c.fillStyle = `rgba(157,182,207,${a})`;
    c.fillText(game.level.name.toUpperCase(), VIEW_W / 2, VIEW_H / 2 - 70);
    c.font = 'italic 30px Georgia, serif';
    c.fillStyle = `rgba(242,194,123,${a})`;
    c.fillText(game.level.closingLine, VIEW_W / 2, VIEW_H / 2 - 16);
    c.font = '16px Georgia, serif';
    c.fillStyle = `rgba(201,214,227,${a})`;
    c.fillText(`Companions found: ${game.companions.length} of ${game.totalWanderers}`, VIEW_W / 2, VIEW_H / 2 + 34);
    const b = clamp01((T - 4) / 1);
    c.font = '14px Georgia, serif';
    c.fillStyle = `rgba(127,149,171,${b})`;
    c.fillText('Space to keep wandering   ·   R to restart', VIEW_W / 2, VIEW_H / 2 + 90);
  }
}
