const BLOCKED = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

// Keyboard plus the first connected gamepad. Call poll() at the start of a frame and endFrame() at the end.
export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.pad = { x: 0, y: 0, a: false, start: false, any: false };
    this.prevPad = { ...this.pad };

    addEventListener('keydown', (e) => {
      if (BLOCKED.has(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
    addEventListener('pointerdown', () => this.pressed.add('Pointer'));

    // Touch: hold the left or right third of the screen to walk, the middle to pulse; swipe down in the middle
    // to take the low way at a cairn. A tap is also "any key".
    this.touches = new Map();
    const zone = (x) => (x < innerWidth / 3 ? 'left' : x > (innerWidth * 2) / 3 ? 'right' : 'pulse');
    addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      const z = zone(e.clientX);
      this.touches.set(e.pointerId, { zone: z, y0: e.clientY, y: e.clientY });
      if (z === 'pulse') this.pressed.add('TouchPulse');
    });
    addEventListener('pointermove', (e) => {
      const t = this.touches.get(e.pointerId);
      if (t) t.y = e.clientY;
    });
    const lift = (e) => this.touches.delete(e.pointerId);
    addEventListener('pointerup', lift);
    addEventListener('pointercancel', lift);
  }

  touch(z) {
    for (const t of this.touches.values()) if (t.zone === z && !(z === 'pulse' && t.y - t.y0 > 50)) return true;
    return false;
  }

  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let x = 0, y = 0, a = false, start = false, any = false;
    for (const p of pads) {
      if (!p) continue;
      const btn = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      const ax = p.axes[0] || 0;
      const ay = p.axes[1] || 0;
      if (Math.abs(ax) > 0.2) x = ax;
      if (Math.abs(ay) > 0.2) y = ay;
      if (btn(14)) x = -1;
      if (btn(15)) x = 1;
      if (btn(12)) y = -1;
      if (btn(13)) y = 1;
      a = a || btn(0);
      start = start || btn(9);
      any = any || p.buttons.some((b) => b.pressed);
    }
    this.prevPad = this.pad;
    this.pad = { x, y, a, start, any };
  }

  endFrame() {
    this.pressed.clear();
  }

  key(...codes) {
    return codes.some((c) => this.down.has(c));
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  get moveX() {
    let v = 0;
    if (this.key('ArrowLeft', 'KeyA')) v -= 1;
    if (this.key('ArrowRight', 'KeyD')) v += 1;
    if (this.touch('left')) v -= 1;
    if (this.touch('right')) v += 1;
    return v || this.pad.x;
  }

  get moveY() {
    let v = 0;
    if (this.key('ArrowUp', 'KeyW')) v -= 1;
    if (this.key('ArrowDown', 'KeyS')) v += 1;
    for (const t of this.touches.values()) if (t.zone === 'pulse' && t.y - t.y0 > 50) v = 1;
    return v || this.pad.y;
  }

  get pulseHeld() {
    return this.key('Space') || this.pad.a || this.touch('pulse');
  }

  get pulsePressed() {
    return this.wasPressed('Space') || this.wasPressed('TouchPulse') || (this.pad.a && !this.prevPad.a);
  }

  get pausePressed() {
    return this.wasPressed('Escape') || this.wasPressed('KeyP') || (this.pad.start && !this.prevPad.start);
  }

  get anyPressed() {
    return this.pressed.size > 0 || (this.pad.any && !this.prevPad.any);
  }
}
