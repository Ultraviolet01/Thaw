import { Input } from './input.js';
import { GameAudio } from './audio.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { level1 } from './level1.js';

const canvas = document.getElementById('game');
const input = new Input();
const audio = new GameAudio();
const game = new Game(level1, audio);
const renderer = new Renderer(canvas, level1);

let last = performance.now();
function frame(now) {
  // Capped so a long stall (a hidden tab) cannot jump the simulation, but loose enough that slow frames keep real time.
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  input.poll();
  game.update(dt, input);
  renderer.draw(game, dt);
  input.endFrame();
  requestAnimationFrame(frame);
}

canvas.focus();
requestAnimationFrame(frame);

// Handy in the browser console while tuning.
window.thaw = game;
