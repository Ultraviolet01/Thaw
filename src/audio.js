// Every sound is a human-made recording: the jam's theme, and CC0 music and recordings credited in
// audio/CREDITS.md. They play through plain audio elements, which also work when index.html is opened
// straight from disk.

// The jam's theme by Jason Grace, played exactly as supplied. The rules allow it only unmodified.
const THEME_SRC = 'audio/thatgamejam02_theme.wav';
// The stage's music, "Long Winter" by Indieteur. It starts faint and grows with every thaw.
const STAGE_MUSIC_SRC = 'audio/music/long-winter.mp3';
// "Esther" by Kistol: a darker piano that takes over as she gets dangerously cold.
const COLD_MUSIC_SRC = 'audio/music/esther.mp3';
// "November Snow" by cynicmusic: rest at the fire, and the prologue's music if the theme cannot play.
const REST_MUSIC_SRC = 'audio/music/november-snow.mp3';
// How many thaws it takes for the stage music to reach full volume.
const FULL_AFTER = 5;
// Wind through a window: the ambient wind everywhere for now. The howling storm is kept for the hazards.
const WIND_SRC = 'audio/sfx/wind-window.mp3';
const STORM_SRC = 'audio/sfx/wind-storm.mp3';
// Short cracks cut from one long recording of cracking ice.
const CRACK_SRC = [1, 2, 3, 4, 5, 6].map((i) => `audio/sfx/ice-crack-${i}.mp3`);
// Boots in snow: two crunches cut from one recorded step.
const STEP_SRC = ['audio/sfx/snow-step-1.mp3', 'audio/sfx/snow-step-2.mp3'];
// A recorded heartbeat: four single beats (lub and dub) cut from one slow recording.
const HEART_SRC = [1, 2, 3, 4].map((i) => `audio/sfx/heartbeat-${i}.mp3`);
// Her breath on the coal when she pulses: three gentle blows.
const PULSE_SRC = [1, 2, 3].map((i) => `audio/sfx/pulse-${i}.mp3`);
// Meltwater dripping as a thawed thing lets go of its ice.
const MELT_SRC = [1, 2, 3].map((i) => `audio/sfx/melt-${i}.mp3`);
// Frost closing over what she did not choose: icy branches cracking on a winter night.
const REFREEZE_SRC = ['audio/sfx/refreeze-1.mp3', 'audio/sfx/refreeze-2.mp3'];
// A candle blown out, for the moment her coal goes dark.
const LIGHTS_OUT_SRC = ['audio/sfx/lights-out.mp3'];
// A short crackle of fire for a lucky ember.
const EMBER_SRC = ['audio/sfx/ember.mp3'];
// A singing bowl struck with a soft mallet: a companion joining, the fire reached.
const CHIME_SRC = ['audio/sfx/chime.mp3'];
// A rubbed wine glass: the hum of frozen things, pitched per kind of thing.
const HUM_SRC = 'audio/sfx/glass-hum.mp3';
const HUM_BASE = 1318.51;
// The fire at the end of each stage.
const FIRE_SRC = 'audio/sfx/fire.mp3';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
// The player's master volume, applied to every sound.
let MASTER = 1;

// One sound effect, with a few players kept ready and reused. Making a new player for every footstep or
// heartbeat makes the browser load and decode the file again each time, which can stall a frame.
class SoundPool {
  constructor(srcs, size = 2) {
    this.sets = srcs.map((src) => Array.from({ length: size }, () => {
      const el = new Audio(src);
      el.preload = 'auto';
      el.preservesPitch = false;
      return el;
    }));
  }

  play(volume, rate, muted) {
    const set = this.sets[Math.floor(Math.random() * this.sets.length)];
    const el = set.find((a) => a.paused || a.ended) || set.reduce((a, b) => (a.currentTime > b.currentTime ? a : b));
    el.pause();
    el.currentTime = 0;
    el.playbackRate = rate;
    el.volume = clamp01(volume * MASTER);
    el.muted = muted;
    el.play().catch(() => {});
  }
}

// A recording that loops forever. Two copies crossfade over the seam so the loop has no gap or click.
// Both copies are made (and start loading) up front, not the first time the loop is heard.
class FileLoop {
  constructor(src, fade = 2.5, rate = 1) {
    this.src = src;
    this.rate = rate;
    this.fade = fade;
    this.els = [new Audio(src), new Audio(src)];
    this.els.forEach((e) => {
      e.preload = 'auto';
      e.volume = 0;
      e.preservesPitch = false;
      e.playbackRate = rate;
    });
    this.cur = 0;
    this.vol = 0;
    this.target = 0;
    this.muted = false;
    this.timer = null;
  }

  set(v) {
    this.target = clamp01(v);
    if (!this.timer && (this.target > 0 || this.vol > 0)) this.timer = setInterval(() => this.tick(), 50);
  }

  setMuted(m) {
    this.muted = m;
    this.els.forEach((e) => { e.muted = m; });
  }

  tick() {
    if (this.els[this.cur].paused && this.target > 0) this.els[this.cur].play().catch(() => {});
    this.vol += (this.target - this.vol) * 0.12;
    if (Math.abs(this.target - this.vol) < 0.002) this.vol = this.target;
    const a = this.els[this.cur];
    const b = this.els[1 - this.cur];
    // Measured in the recording's own seconds, so the crossfade lasts this.fade at any playback rate.
    const d = a.duration;
    const fade = this.fade * this.rate;
    let ka = 1;
    let kb = 0;
    if (d && a.currentTime > d - fade) {
      if (b.paused) {
        b.currentTime = 0;
        b.play().catch(() => {});
      }
      ka = clamp01((d - a.currentTime) / fade);
      kb = 1 - ka;
    }
    if (a.ended || (d && a.currentTime >= d - 0.05)) {
      a.pause();
      this.cur = 1 - this.cur;
      ka = 0;
      kb = 1;
    }
    a.volume = clamp01(this.vol * ka * MASTER);
    b.volume = clamp01(this.vol * kb * MASTER);
    if (this.vol === 0 && this.target === 0) {
      this.els.forEach((e) => e.pause());
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export class GameAudio {
  constructor() {
    this.started = false;
    this.muted = false;
    this.unlocked = 0;
    this.hums = new Map();
    this.wind = new FileLoop(WIND_SRC);
    this.storm = new FileLoop(STORM_SRC);
    this.fire = new FileLoop(FIRE_SRC);
    this.stageMusic = new FileLoop(STAGE_MUSIC_SRC, 4);
    this.coldMusic = new FileLoop(COLD_MUSIC_SRC, 4);
    this.restMusic = new FileLoop(REST_MUSIC_SRC, 4);
    // The mountain's rumble: the storm recording played at half speed, an octave down.
    this.rumble = new FileLoop(STORM_SRC, 2.5, 0.5);
    this.loops = [this.wind, this.storm, this.fire, this.stageMusic, this.coldMusic, this.restMusic, this.rumble];
    // Every sound effect is loaded once, while the title screen is up.
    this.sfx = {
      heart: new SoundPool(HEART_SRC),
      step: new SoundPool(STEP_SRC, 3),
      crack: new SoundPool(CRACK_SRC),
      pulse: new SoundPool(PULSE_SRC),
      melt: new SoundPool(MELT_SRC),
      refreeze: new SoundPool(REFREEZE_SRC),
      lightsOut: new SoundPool(LIGHTS_OUT_SRC, 1),
      ember: new SoundPool(EMBER_SRC),
      chime: new SoundPool(CHIME_SRC),
    };
    // The hum is played by a loop per frozen thing; loading it once here puts it in the browser's cache.
    this.humPreload = new Audio(HUM_SRC);
    this.humPreload.preload = 'auto';
    // The theme is a large file and the prologue is timed to it: start loading it as soon as the page opens.
    this.themePreload = new Audio(THEME_SRC);
    this.themePreload.preload = 'auto';
    this.resting = false;
  }

  // Called from the first key press: browsers only let a page play sound after the player has interacted.
  start() {
    this.started = true;
  }

  // 0 = a breath of wind, 1 = a gale.
  setWind(amount) {
    this.wind.set(0.18 + 0.62 * clamp01(amount));
  }

  // The mountain rumbling: 0 = still, 1 = an avalanche coming down.
  setRumble(amount) {
    this.rumble.set(0.95 * clamp01(amount));
  }

  // An avalanche lets go: a deep crack of snow breaking away.
  avalanche() {
    if (this.muted) return;
    this.sfx.crack.play(0.95, 0.5, false);
    this.sfx.refreeze.play(0.9, 0.6, false);
  }

  // A frost quake: the ground cracks with a boom.
  quake() {
    if (this.muted) return;
    this.sfx.crack.play(1, 0.45, false);
  }

  // Thin ice creaking under her: higher and louder the longer she stands. k runs 0 to 1.
  creak(k) {
    if (this.muted) return;
    this.sfx.crack.play(0.25 + 0.6 * clamp01(k), 1.5 + 0.4 * clamp01(k), false);
  }

  // Through the ice into the water.
  splash() {
    if (this.muted) return;
    this.sfx.crack.play(1, 0.7, false);
    this.sfx.melt.play(1, 0.6, false);
  }

  // Icicles shattering on the path.
  icicles() {
    if (this.muted) return;
    this.sfx.crack.play(0.8, 1.35, false);
    this.sfx.crack.play(0.6, 1.6, false);
  }

  // The howling storm, for the hazards: 0 = none, 1 = full.
  setStorm(amount) {
    this.storm.set(0.9 * clamp01(amount));
  }

  // The prologue's music when the theme cannot play, faded by k.
  setPrologueMusic(k) {
    this.restMusic.set(0.6 * clamp01(k));
  }

  // warm: 1 while she is warm, falling to 0 as she freezes. cold: how strongly the cold music plays.
  // The stage music grows with every thaw, from faint to full.
  setMusic(warm, cold) {
    if (this.resting) return;
    const grown = 0.25 + 0.75 * Math.min(1, this.unlocked / FULL_AFTER);
    this.stageMusic.set(0.55 * grown * clamp01(warm));
    this.coldMusic.set(0.5 * clamp01(cold));
  }

  // At the fire the stage music gives way to rest.
  setRest(on) {
    this.resting = on;
    if (on) {
      this.stageMusic.set(0);
      this.coldMusic.set(0);
    }
    this.restMusic.set(on ? 0.5 : 0);
  }

  unlockLayer() {
    this.unlocked = Math.min(this.unlocked + 1, FULL_AFTER);
  }

  resetLayers() {
    this.unlocked = 0;
    for (const id of [...this.hums.keys()]) this.setHum(id, 0, 0);
  }

  heartbeat(warmth) {
    if (this.muted) return;
    this.sfx.heart.play(warmth < 35 ? 0.8 : 0.55, 1, false);
  }

  // inTime: a pulse in time with her heart is a fuller, brighter breath.
  pulse(inTime = false) {
    if (inTime) {
      if (!this.muted) this.sfx.pulse.play(0.65, 1.12, false);
      return;
    }
    this.playOne(this.sfx.pulse, 0.5);
  }

  // A villager waking: one short sung note on the glass, at their own pitch. The hum's preloaded player is reused,
  // so waking someone never makes a new one.
  voice(rate) {
    if (this.muted) return;
    const el = this.humPreload;
    const token = (this.voiceToken = (this.voiceToken || 0) + 1);
    el.pause();
    el.currentTime = 1;
    el.preservesPitch = false;
    el.playbackRate = rate;
    el.volume = 0;
    el.play().catch(() => {});
    let t = 0;
    const step = () => {
      if (this.voiceToken !== token) return;
      t += 0.05;
      const v = t < 0.3 ? t / 0.3 : Math.max(0, 1 - (t - 0.3) / 2.2);
      el.volume = 0.45 * v * MASTER;
      if (v <= 0) {
        el.pause();
        return;
      }
      setTimeout(step, 50);
    };
    step();
  }

  // One sound from a pool, with a little variation in pitch so repeats do not sound identical.
  playOne(pool, volume, spread = 0.08) {
    if (this.muted) return;
    pool.play(volume, 1 - spread + Math.random() * 2 * spread, false);
  }

  // The fire crackles louder as she nears it: 0 = out of earshot, 1 = beside it.
  setFire(amount) {
    this.fire.set(0.85 * clamp01(amount));
  }

  // One boot landing in the snow. Each step varies a little in pitch and weight.
  footstep() {
    if (this.muted) return;
    this.sfx.step.play(0.22 + Math.random() * 0.12, 0.9 + Math.random() * 0.2, false);
  }

  crack() {
    if (this.muted) return;
    this.sfx.crack.play(0.55 + Math.random() * 0.25, 1, false);
  }

  melt() {
    this.playOne(this.sfx.melt, 0.8, 0.05);
  }

  // The cold closing over what you didn't choose.
  refreeze() {
    this.playOne(this.sfx.refreeze, 0.9, 0.05);
  }

  // Picking up an ember: a short crackle of fire.
  ember() {
    this.playOne(this.sfx.ember, 0.8, 0.06);
  }

  chime() {
    this.playOne(this.sfx.chime, 0.6, 0.03);
  }

  lightsOut() {
    this.playOne(this.sfx.lightsOut, 0.9, 0);
  }

  // Each frozen thing hums as she nears it. freq sets the pitch; level 0.04 is right beside it.
  setHum(id, freq, level) {
    let h = this.hums.get(id);
    if (!h) {
      if (level <= 0.0005) return;
      h = new FileLoop(HUM_SRC, 2.5, freq / HUM_BASE);
      h.setMuted(this.muted);
      this.hums.set(id, h);
    }
    h.set(level * 12);
  }

  // Played with a plain audio element, which also works when index.html is opened straight from disk.
  // If the file is missing, the prologue plays November Snow instead.
  playTheme() {
    if (this.theme) return;
    const el = this.themePreload || new Audio(THEME_SRC);
    this.themePreload = null;
    el.volume = 0.85 * MASTER;
    el.muted = this.muted;
    el.addEventListener('error', () => { this.themeFailed = true; });
    el.addEventListener('ended', () => { this.themeEnded = true; });
    el.play().catch(() => { this.themeFailed = true; });
    this.theme = el;
  }

  // The ending: the jam's theme comes back from the top, as it opened the game, and takes over from the stage music.
  // If it cannot play, the rest music plays instead.
  playEndingTheme() {
    this.resting = true;
    this.stageMusic.set(0);
    this.coldMusic.set(0);
    this.restMusic.set(0);
    if (this.theme) this.theme.pause();
    this.themeEnded = false;
    this.themeFailed = false;
    const el = new Audio(THEME_SRC);
    el.volume = 0;
    el.muted = this.muted;
    const fallback = () => { this.themeFailed = true; this.restMusic.set(0.5); };
    el.addEventListener('error', fallback);
    el.addEventListener('ended', () => { this.themeEnded = true; });
    el.play().catch(fallback);
    this.theme = el;
    const rise = () => {
      if (this.theme !== el) return;
      el.volume = Math.min(0.85 * MASTER, el.volume + 0.04 * MASTER);
      if (el.volume < 0.85 * MASTER) setTimeout(rise, 50);
    };
    rise();
  }

  themePlaying() {
    return !!this.theme && !this.themeFailed && !this.themeEnded;
  }

  // Skipping the prologue: let the theme fade out instead of stopping dead.
  fadeTheme() {
    const el = this.theme;
    if (!el || this.themeEnded) return;
    const step = () => {
      el.volume = Math.max(0, el.volume - 0.06);
      if (el.volume > 0) setTimeout(step, 50);
      else { el.pause(); this.themeEnded = true; }
    };
    step();
  }

  // The player's master volume, 0 to 1.
  setMaster(v) {
    const was = MASTER;
    MASTER = clamp01(v);
    if (this.theme && was > 0) this.theme.volume = clamp01((this.theme.volume / was) * MASTER);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.theme) this.theme.muted = this.muted;
    this.loops.forEach((l) => l.setMuted(this.muted));
    this.hums.forEach((h) => h.setMuted(this.muted));
  }
}
