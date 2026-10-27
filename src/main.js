import { Input } from './input.js';
import { GameAudio } from './audio.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { level1 } from './level1.js';
import { level2 } from './level2.js';
import { level3 } from './level3.js';
import { level4 } from './level4.js';
import { level5 } from './level5.js';

// Load the fonts up front so the first written line never starts in a fallback face.
if (document.fonts) {
  document.fonts.load("64px 'Reenie Beanie'");
  document.fonts.load('300 16px Spectral');
  document.fonts.load('italic 300 16px Spectral');
}

const canvas = document.getElementById('game');
const input = new Input();
const audio = new GameAudio();
const game = new Game([level1, level2, level3, level4, level5], audio);
const renderer = new Renderer(canvas, level1);

let last = performance.now();
function frame(now) {
  // Capped so a long stall (a hidden tab) cannot jump the simulation, but loose enough that slow frames keep real time.
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  input.poll();
  game.update(dt, input);
  renderer.draw(game, dt);
  renderer.drawFullscreenButton(pointer);
  input.endFrame();
  requestAnimationFrame(frame);
}

// Full screen: the corner button or F. Browsers only allow it straight from a click or key press,
// so it is handled here in the event, not in the frame loop.
let pointer = null;
function toggleFullscreen() {
  const d = document;
  const el = d.documentElement;
  const request = el.requestFullscreen || el.webkitRequestFullscreen;
  const exit = d.exitFullscreen || d.webkitExitFullscreen;
  const p = d.fullscreenElement || d.webkitFullscreenElement ? exit && exit.call(d) : request && request.call(el);
  if (p && p.catch) p.catch(() => {});
}
addEventListener('keydown', (e) => {
  if (e.code === 'KeyF' && !e.repeat) toggleFullscreen();
});
canvas.addEventListener('pointermove', (e) => { pointer = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerdown', (e) => {
  if (!renderer.fullscreenHit(e.clientX, e.clientY)) return;
  toggleFullscreen();
  // A click on the button is not "press any key": keep it from starting the game.
  e.stopPropagation();
});

canvas.focus();
requestAnimationFrame(frame);

// Handy in the browser console while tuning.
window.thaw = game;
