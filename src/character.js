import { groundY } from './terrain.js';

// A small hooded figure with a cloak that moves as cloth: two chains of points
// (the front and back edges of the cloak) that swing with walking and the wind.
// The figure's warmth is an ember in the chest.

const GRAVITY = 620;
const ICE = '#7d95a3';

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`;
}

// A path through points, rounded at each joint.
function smooth(ctx, pts, start) {
  if (start) ctx.moveTo(pts[0].x, pts[0].y);
  else ctx.lineTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

export class Character {
  constructor(x, scale = 1, colors = {}, facing = 1) {
    this.s = scale;
    this.x = x;
    this.facing = facing;
    this.phase = 0;
    this.speed = 0;
    this.c = { cloak: '#1c222b', fold: '#3a4757', rim: '#9db7c6', skin: '#c7ad98', hair: '#141318', legs: '#101318', ...colors };
    this.back = this.chain(7, 6.8);
    this.front = this.chain(6, 6.6);
    for (let i = 0; i < 90; i++) this.update(1 / 60, x, facing, 0, i / 60);
  }

  chain(n, len) {
    const top = groundY(this.x) - 47 * this.s;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const y = top + i * len * this.s;
      pts.push({ x: this.x, y, px: this.x, py: y });
    }
    return { pts, len: len * this.s };
  }

  bob() {
    return Math.abs(Math.sin(this.phase)) * 1.4 * this.s * Math.min(1, this.speed / 50);
  }

  anchors() {
    const s = this.s, f = this.facing, g = groundY(this.x), b = this.bob();
    return {
      g,
      b,
      back: { x: this.x - f * 5 * s, y: g - 47 * s - b },
      front: { x: this.x + f * 5.5 * s, y: g - 46 * s - b },
    };
  }

  chest() {
    const a = this.anchors();
    return { x: this.x + this.facing * 3 * this.s, y: a.g - 41 * this.s - a.b };
  }

  update(dt, x, facing, wind, t) {
    if (dt <= 0) return;
    const moved = x - this.x;
    this.speed = Math.abs(moved) / dt;
    this.x = x;
    if (facing) this.facing = facing;
    this.phase += (Math.abs(moved) * 0.12) / this.s;
    const a = this.anchors();
    this.step(this.back, a.back, dt, wind, t, 1, true, -this.facing * 10 * this.s);
    this.step(this.front, a.front, dt, wind, t, 0.55, false, this.facing * 6 * this.s);
  }

  // flare: how far the hem sits out from the shoulder at rest, so the cloak hangs in an A shape.
  step(ch, anchor, dt, wind, t, flutter, isBack, flare) {
    const p = ch.pts;
    const s = this.s, f = this.facing;
    p[0].x = p[0].px = anchor.x;
    p[0].y = p[0].py = anchor.y;
    const dt2 = dt * dt;
    for (let i = 1; i < p.length; i++) {
      const q = p[i];
      const k = i / (p.length - 1);
      const vx = (q.x - q.px) * 0.94;
      const vy = (q.y - q.py) * 0.94;
      q.px = q.x;
      q.py = q.y;
      const ax = (wind + Math.sin(t * 2.7 + i * 0.8 + this.x * 0.01) * 70 * flutter) * k;
      q.x += vx + ax * dt2;
      q.y += vy + GRAVITY * dt2;
      q.x += (anchor.x + flare * k - q.x) * 0.06;
    }
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < p.length; i++) {
        const a = p[i - 1], b = p[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const diff = (d - ch.len) / d;
        b.x -= dx * diff;
        b.y -= dy * diff;
      }
      for (let i = 1; i < p.length; i++) {
        const q = p[i];
        // The back edge stays behind the body, the front edge stays roughly in front.
        if (isBack && f * (q.x - this.x) > 2 * s) q.x = this.x + f * 2 * s;
        if (!isBack && f * (q.x - this.x) < -3 * s) q.x = this.x - f * 3 * s;
        const floor = groundY(q.x) - 0.5;
        if (q.y > floor) q.y = floor;
      }
    }
  }

  // o.frozen: 0..1 (1 = encased in ice, colors drained). o.glow: 0..1 warmth of the chest ember.
  draw(ctx, o) {
    const s = this.s, f = this.facing, x = this.x;
    const a = this.anchors();
    const g = a.g;
    const fz = o.frozen || 0;
    const tint = (hex) => mix(hex, ICE, fz * 0.75);
    const walk = Math.min(1, this.speed / 45);

    // Legs, mostly hidden by the cloak until it swings.
    const hipY = g - 21 * s - a.b;
    ctx.strokeStyle = tint(this.c.legs);
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.6 * s;
    for (const off of [0, Math.PI]) {
      const sw = Math.sin(this.phase + off) * walk;
      const lift = Math.max(0, Math.cos(this.phase + off)) * walk * 3 * s;
      const fx = x + sw * 7 * s;
      const fy = g - lift;
      ctx.beginPath();
      ctx.moveTo(x, hipY);
      ctx.quadraticCurveTo(x + f * 2 * s + sw * 3 * s, (hipY + fy) / 2, fx, fy);
      ctx.lineTo(fx + f * 2.5 * s, fy);
      ctx.stroke();
    }

    // The cloak.
    const B = this.back.pts, F = this.front.pts;
    const lb = B[B.length - 1], lf = F[F.length - 1];
    const cloakPath = () => {
      ctx.beginPath();
      smooth(ctx, F, true);
      ctx.quadraticCurveTo((lf.x + lb.x) / 2, Math.max(lf.y, lb.y) + 2.5 * s, lb.x, lb.y);
      smooth(ctx, [...B].reverse(), false);
      ctx.quadraticCurveTo(x, B[0].y - 4 * s, F[0].x, F[0].y);
      ctx.closePath();
    };
    cloakPath();
    const grad = ctx.createLinearGradient(0, a.back.y, 0, g);
    grad.addColorStop(0, tint(this.c.cloak));
    grad.addColorStop(1, tint(mix(this.c.cloak, '#000000', 0.25)));
    ctx.fillStyle = grad;
    ctx.fill();
    // The lining shows where the back edge lifts away in the wind.
    ctx.save();
    ctx.clip();
    if (o.glow > 0) {
      const ch = this.chest();
      const lg = ctx.createRadialGradient(ch.x, ch.y, 0, ch.x, ch.y, 16 * s);
      lg.addColorStop(0, `rgba(255,175,90,${0.4 * o.glow})`);
      lg.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(ch.x - 40 * s, ch.y - 40 * s, 80 * s, 80 * s);
    }
    // Folds running down the cloth.
    ctx.strokeStyle = tint(this.c.fold);
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 0.9 * s;
    for (const w of [0.35, 0.68]) {
      const pts = [];
      const n = Math.min(B.length, F.length);
      for (let i = 1; i < n; i++) pts.push({ x: F[i].x + (B[i].x - F[i].x) * w, y: F[i].y + (B[i].y - F[i].y) * w });
      ctx.beginPath();
      smooth(ctx, pts, true);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // Cold light from the snow catches the back edge of the cloak.
    ctx.strokeStyle = tint(this.c.rim);
    ctx.globalAlpha = 0.3 * (1 - fz);
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    smooth(ctx, B.slice(1), true);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // A thin edge where the hem catches light.
    ctx.strokeStyle = tint(this.c.fold);
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(lf.x, lf.y);
    ctx.quadraticCurveTo((lf.x + lb.x) / 2, Math.max(lf.y, lb.y) + 2.5 * s, lb.x, lb.y);
    ctx.stroke();

    // Head under a hood with a soft point that trails behind.
    const hx = x + f * 1 * s;
    const hy = a.back.y - 8.5 * s;
    const sway = Math.sin(o.t * 2.4 + this.x * 0.02) * 1.5 * s - f * Math.min(4, this.speed / 25) * s;
    ctx.fillStyle = tint(this.c.cloak);
    ctx.beginPath();
    ctx.moveTo(hx - f * 5 * s, hy - 4.5 * s);
    ctx.quadraticCurveTo(hx - f * 11 * s + sway, hy - 1 * s, hx - f * 13 * s + sway, hy + 7 * s);
    ctx.quadraticCurveTo(hx - f * 8 * s, hy + 4 * s, hx - f * 4 * s, hy + 6 * s);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(hx - f * 1 * s, hy, 7.6 * s, 0, Math.PI * 2);
    ctx.fill();
    // A face in profile, half in the hood's shadow: brow, nose and chin, no cartoon eye.
    const fx = hx + f * 2.2 * s, fy = hy + 0.8 * s;
    ctx.fillStyle = tint(this.c.skin);
    ctx.beginPath();
    ctx.moveTo(fx - f * 0.5 * s, fy - 3.8 * s);
    ctx.quadraticCurveTo(fx + f * 2.4 * s, fy - 3.6 * s, fx + f * 2.6 * s, fy - 1.2 * s);
    ctx.lineTo(fx + f * 3.5 * s, fy + 0.4 * s);
    ctx.lineTo(fx + f * 2.6 * s, fy + 1 * s);
    ctx.quadraticCurveTo(fx + f * 2.6 * s, fy + 3.4 * s, fx + f * 0.8 * s, fy + 3.8 * s);
    ctx.quadraticCurveTo(fx - f * 1.2 * s, fy + 2 * s, fx - f * 0.5 * s, fy - 3.8 * s);
    ctx.fill();
    // Shadow from the hood across the top of the face.
    ctx.fillStyle = tint(this.c.cloak);
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(fx + f * 0.6 * s, fy - 3.4 * s, 3.6 * s, 1.8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = tint(this.c.hair);
    ctx.beginPath();
    ctx.moveTo(fx - f * 0.8 * s, fy - 4 * s);
    ctx.quadraticCurveTo(fx + f * 1.8 * s, fy - 4.6 * s, fx + f * 2.2 * s, fy - 2.4 * s);
    ctx.quadraticCurveTo(fx + f * 0.6 * s, fy - 2.6 * s, fx - f * 0.6 * s, fy - 1 * s);
    ctx.closePath();
    ctx.fill();

    // The ember in the chest. Hands come to it while pulsing.
    const ch = this.chest();
    if (o.pulsing) {
      ctx.fillStyle = tint(this.c.skin);
      for (const dy of [-1.6, 1.8]) {
        ctx.beginPath();
        ctx.arc(ch.x + f * 2 * s, ch.y + dy * s, 1.7 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (o.glow > 0.01) {
      const r = (1 + 1.5 * o.glow) * s * (1 + 0.3 * (o.beat || 0));
      const eg = ctx.createRadialGradient(ch.x, ch.y, 0, ch.x, ch.y, r * 2.2);
      eg.addColorStop(0, `rgba(255,250,232,${Math.min(1, 0.4 + o.glow)})`);
      eg.addColorStop(0.4, `rgba(255,196,110,${0.9 * o.glow + 0.1})`);
      eg.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(ch.x, ch.y, r * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
