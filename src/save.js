// What the browser remembers between visits: the walk in progress, the start of every stage reached (for picking a
// stage from the title), and the record of finished walks. Storage can be missing or blocked (a private window, a
// file:// page in some browsers), so every read and write is guarded and the game works the same without it.

const KEY = 'thaw.save.v1';

// The endings, by how many of the village she brought home. Provisional until the finale is built.
export const ENDINGS = [
  { id: 'everyone', test: (n, all) => n === all },
  { id: 'most', test: (n, all) => n >= Math.ceil(all / 2) && n < all },
  { id: 'few', test: (n, all) => n > 0 && n < Math.ceil(all / 2) },
  { id: 'alone', test: (n) => n === 0 },
];

export function endingOf(saved, all) {
  const e = ENDINGS.find((x) => x.test(saved, all));
  return e ? e.id : 'alone';
}

const fresh = () => ({ current: null, starts: {}, reached: 0, finished: 0, best: null, endings: [] });

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    return { ...fresh(), ...JSON.parse(raw) };
  } catch (e) {
    return fresh();
  }
}

function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    // Nothing to do: the walk simply is not remembered.
  }
}

const clone = (v) => JSON.parse(JSON.stringify(v));

// A stage has just begun: this is where "continue" picks up, and where that stage can be replayed from.
export function saveStageStart(stage, ledger, companions) {
  const d = loadSave();
  const snap = { ledger: clone(ledger), companions: [...companions] };
  d.current = { stage, ...snap };
  d.starts[stage] = snap;
  d.reached = Math.max(d.reached, stage);
  write(d);
}

// The last fire is reached: the walk is over. Record how it went; there is nothing left to continue.
export function saveFinish(savedCount, trees) {
  const d = loadSave();
  const all = savedCount.all;
  const ending = endingOf(savedCount.n, all);
  d.current = null;
  d.finished += 1;
  if (!d.endings.includes(ending)) d.endings.push(ending);
  const b = d.best;
  if (!b || savedCount.n > b.saved || (savedCount.n === b.saved && trees > b.trees)) d.best = { saved: savedCount.n, all, trees };
  write(d);
  return ending;
}

// The player's settings, kept apart from the walk: volume and screen shake.
const SETTINGS = 'thaw.settings.v1';

export function loadSettings() {
  try {
    return { volume: 1, shake: true, ...JSON.parse(localStorage.getItem(SETTINGS) || '{}') };
  } catch (e) {
    return { volume: 1, shake: true };
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS, JSON.stringify(s));
  } catch (e) {
    // Not remembered; the setting still holds for this visit.
  }
}

// "Start over from the beginning": forget the walk in progress, keep the record and the stages reached.
export function clearCurrent() {
  const d = loadSave();
  d.current = null;
  write(d);
}
