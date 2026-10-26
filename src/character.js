import { groundY } from './terrain.js';

// A villager bundled against the cold: a padded coat that swings as cloth, a fur-trimmed hood,
// a knitted scarf, mittens and boots. Those who still have fire carry it as a coal in a small clay pot,
// held in both hands. The player is a child, so is drawn a little smaller than the grown-ups.

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

// Heights above the feet, at scale 1.
const SHOULDER = 40;
const HEM = 13;
export const POT_HEIGHT = 27;

export class Character {
  // floor(x) gives the y the feet stand on: the snow surface, or a cave floor.
  constructor(x, scale = 1, colors = {}, facing = 1, floor = groundY) {
    this.s = scale;
    this.floor = floor;
    this.x = x;
    this.facing = facing;
    this.phase = 0;
    this.speed = 0;
    this.lift = 0;
    this.c = {
      coat: '#3c4a5a', fold: '#56677a', fur: '#e6dccb', scarf: '#a24a2e', stripe: '#e9d7b8',
      mitten: '#a24a2e', skin: '#d2b49c', hair: '#2a1e18', boots: '#2b211b', pot: '#8b4b2b', ...colors,
    };
    this.back = this.chain(5, 6.2);
    this.front = this.chain(4, 6.6);
    this.tail = this.chain(2, 5);
    for (let i = 0; i < 90; i++) this.update(1 / 60, x, facing, 0, i / 60);
  }

  chain(n, len) {
    const top = this.floor(this.x) - SHOULDER * this.s;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const y = top + i * len * this.s;
      pts.push({ x: this.x, y, px: this.x, py: y });
    }
    return { pts, len: len * this.s };
  }

  bob() {
    return Math.abs(Math.sin(this.phase)) * 1.3 * this.s * Math.min(1, this.speed / 50);
  }

  anchors() {
    const s = this.s, f = this.facing, g = this.floor(this.x), b = this.bob();
    return {
      g,
      b,
      back: { x: this.x - f * 5.5 * s, y: g - SHOULDER * s - b },
      front: { x: this.x + f * 5 * s, y: g - (SHOULDER - 1) * s - b },
      neck: { x: this.x - f * 2 * s, y: g - (SHOULDER + 2) * s - b },
    };
  }

  // Where the pot is: in front of the body, lifted toward the face while blowing on the coal.
  chest() {
    const a = this.anchors();
    const s = this.s;
    return { x: this.x + this.facing * (9 - 2 * this.lift) * s, y: a.g - (POT_HEIGHT + 12 * this.lift) * s - a.b };
  }

  update(dt, x, facing, wind, t) {
    if (dt <= 0) return;
    const moved = x - this.x;
    this.speed = Math.abs(moved) / dt;
    this.x = x;
    if (facing) this.facing = facing;
    this.phase += (Math.abs(moved) * 0.13) / this.s;
    const a = this.anchors();
    const f = this.facing;
    this.step(this.back, a.back, dt, wind, t, 0.7, true, -f * 6 * this.s);
    this.step(this.front, a.front, dt, wind, t, 0.4, false, f * 4 * this.s);
    // A short scarf end: it lifts in the wind but stays short.
    this.step(this.tail, a.neck, dt, wind * 1.4, t, 1.2, true, -f * 7 * this.s);
  }

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
        if (isBack && f * (q.x - this.x) > 2 * s) q.x = this.x + f * 2 * s;
        if (!isBack && f * (q.x - this.x) < -3 * s) q.x = this.x - f * 3 * s;
        const floor = this.floor(q.x) - 0.5;
        if (q.y > floor) q.y = floor;
      }
    }
  }

  // o.frozen: 0..1 (1 = encased in ice, colors drained). o.glow: 0..1 how hot the coal is.
  // o.pot: false for someone whose fire has gone out (they hug themselves instead). o.pulsing: blowing on the coal.
  draw(ctx, o) {
    const s = this.s, f = this.facing, x = this.x;
    const a = this.anchors();
    const g = a.g;
    const fz = o.frozen || 0;
    const tint = (hex) => mix(hex, ICE, fz * 0.75);
    const walk = Math.min(1, this.speed / 45);
    const hasPot = o.pot !== false;
    const target = hasPot && o.pulsing ? 1 : 0;
    this.lift += (target - this.lift) * Math.min(1, (o.dt || 1 / 30) * 8);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Boots and short legs below the coat.
    const hipY = g - 18 * s - a.b;
    for (const off of [0, Math.PI]) {
      const sw = Math.sin(this.phase + off) * walk;
      const lift = Math.max(0, Math.cos(this.phase + off)) * walk * 3 * s;
      const fx = x + sw * 6 * s;
      const fy = g - lift;
      ctx.strokeStyle = tint(this.c.coat);
      ctx.lineWidth = 3.4 * s;
      ctx.beginPath();
      ctx.moveTo(x, hipY);
      ctx.lineTo(fx, fy - 3 * s);
      ctx.stroke();
      ctx.fillStyle = tint(this.c.boots);
      ctx.beginPath();
      ctx.ellipse(fx + f * 1.2 * s, fy - 1.6 * s, 3 * s, 2.2 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // The padded coat.
    const B = this.back.pts, F = this.front.pts;
    const lb = B[B.length - 1], lf = F[F.length - 1];
    ctx.beginPath();
    smooth(ctx, F, true);
    ctx.quadraticCurveTo((lf.x + lb.x) / 2, Math.max(lf.y, lb.y) + 2 * s, lb.x, lb.y);
    smooth(ctx, [...B].reverse(), false);
    ctx.quadraticCurveTo(x, B[0].y - 5 * s, F[0].x, F[0].y);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, a.back.y, 0, g);
    grad.addColorStop(0, tint(this.c.coat));
    grad.addColorStop(1, tint(mix(this.c.coat, '#000000', 0.25)));
    ctx.fillStyle = grad;
    ctx.fill();
    // Quilted seams across the coat.
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = tint(this.c.fold);
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 0.8 * s;
    for (let k = 1; k <= 3; k++) {
      const y = a.back.y + k * 7 * s;
      ctx.beginPath();
      ctx.moveTo(x - 14 * s, y + 1 * s);
      ctx.quadraticCurveTo(x, y + 2.5 * s, x + 14 * s, y + 1 * s);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // A fur hem.
    ctx.strokeStyle = tint(this.c.fur);
    ctx.lineWidth = 2.2 * s;
    ctx.beginPath();
    ctx.moveTo(lf.x, lf.y);
    ctx.quadraticCurveTo((lf.x + lb.x) / 2, Math.max(lf.y, lb.y) + 2 * s, lb.x, lb.y);
    ctx.stroke();

    // The short scarf end, behind the head.
    const T = this.tail.pts;
    ctx.strokeStyle = tint(this.c.scarf);
    ctx.lineWidth = 3.6 * s;
    ctx.beginPath();
    smooth(ctx, T, true);
    ctx.stroke();

    // Head under a fur-trimmed hood.
    const hx = x + f * 1.5 * s;
    const hy = a.back.y - 8 * s;
    ctx.fillStyle = tint(this.c.coat);
    ctx.beginPath();
    ctx.arc(hx - f * 1 * s, hy, 8.4 * s, 0, Math.PI * 2);
    ctx.fill();
    // Face in profile.
    const fx = hx + f * 2.6 * s, fy = hy + 0.6 * s;
    ctx.fillStyle = tint(this.c.skin);
    ctx.beginPath();
    ctx.moveTo(fx - f * 0.6 * s, fy - 4 * s);
    ctx.quadraticCurveTo(fx + f * 2.6 * s, fy - 3.8 * s, fx + f * 2.8 * s, fy - 1 * s);
    ctx.lineTo(fx + f * 3.6 * s, fy + 0.6 * s);
    ctx.lineTo(fx + f * 2.7 * s, fy + 1.1 * s);
    ctx.quadraticCurveTo(fx + f * 2.6 * s, fy + 3.6 * s, fx + f * 0.8 * s, fy + 4 * s);
    ctx.quadraticCurveTo(fx - f * 1.3 * s, fy + 2 * s, fx - f * 0.6 * s, fy - 4 * s);
    ctx.fill();
    ctx.fillStyle = tint(this.c.hair);
    ctx.beginPath();
    ctx.moveTo(fx - f * 1 * s, fy - 4.4 * s);
    ctx.quadraticCurveTo(fx + f * 2 * s, fy - 5 * s, fx + f * 2.4 * s, fy - 2.6 * s);
    ctx.quadraticCurveTo(fx + f * 0.6 * s, fy - 2.6 * s, fx - f * 0.6 * s, fy - 1 * s);
    ctx.closePath();
    ctx.fill();
    // The fur trim framing the face.
    ctx.strokeStyle = tint(this.c.fur);
    ctx.lineWidth = 2.6 * s;
    ctx.beginPath();
    ctx.ellipse(hx + f * 2 * s, hy + 0.4 * s, 5.6 * s, 6.6 * s, 0, f > 0 ? -1.9 : Math.PI - 1.25, f > 0 ? 1.25 : Math.PI + 1.9);
    ctx.stroke();

    // The scarf wrapped at the neck, knitted in stripes.
    const ny = a.back.y + 1 * s;
    ctx.fillStyle = tint(this.c.scarf);
    ctx.beginPath();
    ctx.ellipse(x + f * 0.5 * s, ny, 7.4 * s, 3.4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = tint(this.c.stripe);
    ctx.lineWidth = 0.9 * s;
    for (const dx of [-3.5, 0, 3.5]) {
      ctx.beginPath();
      ctx.moveTo(x + (dx - 0.8) * s, ny - 2.6 * s);
      ctx.lineTo(x + (dx + 0.8) * s, ny + 2.6 * s);
      ctx.stroke();
    }

    const shoulder = { x: x + f * 2 * s, y: a.back.y + 4 * s };
    if (!hasPot) {
      // No fire: arms wrapped round the body against the cold.
      ctx.strokeStyle = tint(this.c.coat);
      ctx.lineWidth = 4.4 * s;
      ctx.beginPath();
      ctx.moveTo(shoulder.x, shoulder.y);
      ctx.quadraticCurveTo(x + f * 7 * s, shoulder.y + 6 * s, x - f * 2 * s, shoulder.y + 9 * s);
      ctx.stroke();
      ctx.fillStyle = tint(this.c.mitten);
      ctx.beginPath();
      ctx.arc(x - f * 2.5 * s, shoulder.y + 9 * s, 2.4 * s, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // Arms reaching round the pot, mittens on its sides.
    const pot = this.chest();
    ctx.strokeStyle = tint(this.c.coat);
    ctx.lineWidth = 4.4 * s;
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.quadraticCurveTo(x + f * 3 * s, pot.y + 1 * s, pot.x - f * 3.5 * s, pot.y);
    ctx.stroke();

    // The clay pot. The coal shows through the holes and over the rim; its glow is the warmth.
    const glow = Math.max(0, o.glow || 0);
    const pw = 5 * s, ph = 4.6 * s;
    ctx.fillStyle = tint(this.c.pot);
    ctx.beginPath();
    ctx.moveTo(pot.x - pw, pot.y - ph * 0.5);
    ctx.quadraticCurveTo(pot.x - pw * 1.2, pot.y + ph, pot.x, pot.y + ph);
    ctx.quadraticCurveTo(pot.x + pw * 1.2, pot.y + ph, pot.x + pw, pot.y - ph * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = tint(mix(this.c.pot, '#000000', 0.35));
    ctx.lineWidth = 1.4 * s;
    ctx.beginPath();
    ctx.moveTo(pot.x - pw * 1.05, pot.y - ph * 0.5);
    ctx.lineTo(pot.x + pw * 1.05, pot.y - ph * 0.5);
    ctx.stroke();
    if (glow > 0.01) {
      const hot = Math.min(1, glow) * (1 + 0.35 * (o.beat || 0));
      for (const [dx, dy] of [[-2.4, 1.4], [0, 2.4], [2.4, 1.4]]) {
        ctx.fillStyle = `rgba(255,${Math.round(150 + 70 * hot)},80,${Math.min(1, 0.4 + 0.6 * hot)})`;
        ctx.beginPath();
        ctx.arc(pot.x + dx * s, pot.y + dy * s, 0.8 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      const eg = ctx.createRadialGradient(pot.x, pot.y - ph * 0.6, 0, pot.x, pot.y - ph * 0.6, (3 + 4 * hot) * s);
      eg.addColorStop(0, `rgba(255,248,225,${Math.min(1, 0.5 + 0.5 * hot)})`);
      eg.addColorStop(0.45, `rgba(255,190,100,${0.85 * hot})`);
      eg.addColorStop(1, 'rgba(255,130,50,0)');
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(pot.x, pot.y - ph * 0.6, (3 + 4 * hot) * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = tint(this.c.mitten);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(pot.x + side * pw * 1.05, pot.y + 0.5 * s, 2 * s, 2.6 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Blowing on the coal: small puffs of breath from the mouth to the pot.
    if (this.lift > 0.5 && glow > 0) {
      const mouth = { x: fx + f * 3.4 * s, y: fy + 1.6 * s };
      for (let i = 0; i < 3; i++) {
        const q = ((o.t || 0) * 1.6 + i / 3) % 1;
        ctx.fillStyle = `rgba(235,242,248,${0.45 * (1 - q) * this.lift})`;
        ctx.beginPath();
        ctx.arc(mouth.x + (pot.x - mouth.x) * q, mouth.y + (pot.y - ph - mouth.y) * q, (1 + 1.6 * q) * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
