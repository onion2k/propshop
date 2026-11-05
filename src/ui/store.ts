// The game store: owns the one Game, runs it against the wall clock, publishes a snapshot at a steady rate
// whatever the sim speed, and saves. React subscribes through useSyncExternalStore. The wall clock is read
// here and nowhere further in: the sim only ever sees how many ms it is being asked for.

import { LAST_STAGE, LESSONS, stageOf, type StageId } from '../content';
import { Game, MAX_TICKS_PER_ADVANCE, TICK_MS, type SavedGame, type Snapshot, type Speed } from '../sim';
import type { Content } from '../sim';

/** How often a new snapshot is handed to React, in wall ms, and how often the game is saved. */
const PUBLISH_EVERY = 100;
const SAVE_EVERY = 10_000;
/**
 * The most wall time one pump gives the sim, so a frame always has room to draw: a device that cannot step
 * the asked speed in that time runs slower, and says so, rather than stalling the page. Checked every CHUNK
 * ticks, since reading the clock costs more than a tick.
 */
export const BUDGET_MS = 8;
const CHUNK = 25;
/** How far behind the asked speed the running one may fall before the bar says so. */
export const RUNNING_SHORT = 0.85;
export const SAVE_KEY = 'propshop.save.v1';
export const PROGRESS_KEY = 'propshop.progress.v1';
export const TUTORIAL_KEY = 'propshop.tutorial.v1';
/**
 * The stages: `{ seen }`, the last stage whose intro card was shown. A new game writes it at once, so a save
 * with no such key is one from before the stages, and opens every stage. Cleared by Start again, and written
 * afresh with it.
 */
export const STAGES_KEY = 'propshop.stages.v1';
/** The show-everything switch. Not cleared by Start again: it is the player's, not the game's. */
export const REVEAL_KEY = 'propshop.reveal.v1';

/** Where the tutorial stands: not started, at a step, or done (skipped or finished). */
export type Tutorial = { state: 'fresh' } | { state: 'at'; step: number } | { state: 'done' };

/** Which lessons are done, and the simulated time each was. One object per change, so React can compare it. */
export type Progress = Readonly<Record<string, number>>;

export interface Store {
  getSnapshot: () => Snapshot;
  getProgress: () => Progress;
  getTutorial: () => Tutorial;
  setTutorial: (t: Tutorial) => void;
  /** The stage in force: every stage if the switch is on or the save is from before the stages. */
  getStage: () => StageId;
  /** The stage whose intro card is due, if one is; the card is shown until dismissIntro. */
  getIntro: () => StageId | null;
  dismissIntro: () => void;
  getReveal: () => boolean;
  setReveal: (on: boolean) => void;
  subscribe: (listener: () => void) => () => void;
  /** Hand the store some wall time; it runs the sim, within the budget if it has a clock, and publishes if due. */
  pump: (wallNow: number) => void;
  /** The speed the sim is reaching, averaged over the last half second: at most what was asked. */
  getRunning: () => number;
  /** Hold the sim still (the cover is up): pump advances nothing, but keeps its clock so release does not catch up. */
  hold: (on: boolean) => void;
  publish: () => void;
  save: () => void;
  reset: (seed: number) => void;
  game: Game;
  // Actions, so components never touch the game.
  setSpeed: (speed: Speed) => void;
  skipToOpen: () => void;
  setBlock: Game['setBlock'];
  buyUpgrade: Game['buyUpgrade'];
  buyTip: Game['buyTip'];
  setRisk: Game['setRisk'];
  setWatch: Game['setWatch'];
  setRules: Game['setRules'];
  /** A click at the desk: the order leaves after the reaction time. */
  hand: Game['hand'];
  /** The microscope's step: so many ticks, then a snapshot at once. */
  stepTicks: (n: number) => void;
}

export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createStore(
  content: Content,
  storage: Storage | null,
  seed: number,
  /** The wall clock the budget is held against; without one the sim runs every tick asked, as the tests want. */
  clock?: () => number,
): Store {
  let game = loadOrNew(content, storage, seed);
  let running = 0;
  let snapshot = game.snapshot();
  let progress: Progress = loadProgress(storage);
  let tutorial: Tutorial = loadTutorial(storage);
  // A save from before the stages has no stages key; a new game writes it now.
  const stagesRaw = storage?.getItem(STAGES_KEY) ?? null;
  let legacy = stagesRaw === null && !!storage?.getItem(SAVE_KEY);
  let seen = loadSeen(stagesRaw);
  if (storage && stagesRaw === null && !legacy) writeSeen(storage, seen);
  let reveal = storage?.getItem(REVEAL_KEY) === '1';
  const stageNow = (): StageId => (reveal || legacy ? LAST_STAGE : (Math.max(stageOf(progress), seen) as StageId));
  let publishedVersion = game.version;
  let lastPublish = -Infinity;
  let lastSave = -Infinity;
  let lastPump: number | null = null;
  let held = false;
  const listeners = new Set<() => void>();

  const publish = () => {
    if (game.version === publishedVersion) return;
    snapshot = game.snapshot();
    publishedVersion = game.version;
    // The lessons watch the snapshot; one newly done is kept with the time, and saved at once.
    let changed = false;
    for (const l of LESSONS) {
      if (progress[l.id] === undefined && l.done(snapshot)) {
        progress = { ...progress, [l.id]: snapshot.now };
        changed = true;
      }
    }
    if (changed) saveProgress(storage, progress);
    for (const l of listeners) l();
  };

  const act = <A extends unknown[], R>(f: (...args: A) => R) => {
    return (...args: A): R => {
      const r = f(...args);
      publish();
      return r;
    };
  };

  const store: Store = {
    get game() {
      return game;
    },
    getSnapshot: () => snapshot,
    getRunning: () => running,
    getProgress: () => progress,
    getTutorial: () => tutorial,
    getStage: stageNow,
    getIntro() {
      if (reveal || legacy) return null;
      const next = seen + 1;
      return next <= stageNow() ? (next as StageId) : null;
    },
    dismissIntro() {
      const due = store.getIntro();
      if (due === null) return;
      seen = due;
      writeSeen(storage, seen);
      for (const l of listeners) l();
    },
    getReveal: () => reveal,
    setReveal(on) {
      reveal = on;
      try {
        if (on) storage?.setItem(REVEAL_KEY, '1');
        else storage?.removeItem(REVEAL_KEY);
      } catch {
        // Storage can be forbidden; the switch still holds on screen.
      }
      for (const l of listeners) l();
    },
    setTutorial(t) {
      tutorial = t;
      try {
        storage?.setItem(TUTORIAL_KEY, JSON.stringify(t));
      } catch {
        // Storage can be full or forbidden; the tutorial still runs on screen.
      }
      for (const l of listeners) l();
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    pump(wallNow) {
      if (lastPump !== null && !held) {
        const dt = Math.min(1000, wallNow - lastPump);
        const wanted = Math.min(MAX_TICKS_PER_ADVANCE, Math.floor((dt * game.speed) / TICK_MS));
        let done = 0;
        if (clock) {
          const deadline = clock() + BUDGET_MS;
          while (done < wanted) {
            const n = Math.min(CHUNK, wanted - done);
            game.stepTicks(n);
            done += n;
            if (clock() >= deadline) break;
          }
        } else {
          game.stepTicks(wanted);
          done = wanted;
        }
        // What was asked and not run is dropped, not owed: a slow device runs slower, it does not catch up later.
        const reached = dt > 0 ? (done * TICK_MS) / dt : running;
        running = game.speed === 0 ? 0 : running + (reached - running) * Math.min(1, dt / 500);
      }
      lastPump = wallNow;
      if (wallNow - lastPublish >= PUBLISH_EVERY) {
        lastPublish = wallNow;
        publish();
      }
      if (wallNow - lastSave >= SAVE_EVERY) {
        lastSave = wallNow;
        store.save();
      }
    },
    hold(on) {
      held = on;
    },
    publish,
    save() {
      if (!storage) return;
      try {
        storage.setItem(SAVE_KEY, JSON.stringify(game.save()));
      } catch {
        // Storage can be full or forbidden; the game goes on without it.
      }
    },
    reset(newSeed) {
      storage?.removeItem(SAVE_KEY);
      storage?.removeItem(PROGRESS_KEY);
      storage?.removeItem(TUTORIAL_KEY);
      game = new Game(content, newSeed);
      progress = {};
      tutorial = { state: 'fresh' };
      seen = 1;
      legacy = false;
      writeSeen(storage, seen);
      publishedVersion = -1;
      publish();
    },
    // A new speed is taken at its word until measured, so the bar does not call it short while the average catches up.
    setSpeed: act((s) => {
      game.setSpeed(s);
      running = s;
    }),
    skipToOpen: act(() => game.skipToOpen()),
    setBlock: act((id, change) => game.setBlock(id, change)),
    buyUpgrade: act((kind, id) => game.buyUpgrade(kind, id)),
    buyTip: act((id) => game.buyTip(id)),
    setRisk: act((change) => game.setRisk(change)),
    setWatch: act((symbol, on) => game.setWatch(symbol, on)),
    setRules: act((exchange, change) => game.setRules(exchange, change)),
    hand: act((intent) => game.hand(intent)),
    stepTicks: act((n) => game.stepTicks(n)),
  };
  return store;
}

function loadOrNew(content: Content, storage: Storage | null, seed: number): Game {
  const raw = storage?.getItem(SAVE_KEY);
  if (raw) {
    try {
      return Game.load(content, JSON.parse(raw) as SavedGame);
    } catch {
      // A save from another version, or a broken one: start again rather than refuse to run.
    }
  }
  return new Game(content, seed);
}

function loadProgress(storage: Storage | null): Progress {
  const raw = storage?.getItem(PROGRESS_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'number') out[k] = v;
    return out;
  } catch {
    return {};
  }
}

function saveProgress(storage: Storage | null, progress: Progress): void {
  try {
    storage?.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Storage can be full or forbidden; the lessons still tick on screen.
  }
}

function loadTutorial(storage: Storage | null): Tutorial {
  const raw = storage?.getItem(TUTORIAL_KEY);
  if (!raw) return { state: 'fresh' };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || !('state' in parsed)) return { state: 'fresh' };
    const t = parsed as { state: unknown; step?: unknown };
    if (t.state === 'done') return { state: 'done' };
    if (t.state === 'at' && typeof t.step === 'number') return { state: 'at', step: t.step };
    return { state: 'fresh' };
  } catch {
    return { state: 'fresh' };
  }
}

function loadSeen(raw: string | null): StageId {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const n = typeof parsed === 'object' && parsed !== null ? (parsed as { seen?: unknown }).seen : undefined;
    if (typeof n === 'number' && n >= 1 && n <= LAST_STAGE) return Math.floor(n) as StageId;
  } catch {
    // A broken key reads as a new game's.
  }
  return 1;
}

function writeSeen(storage: Storage | null, seen: StageId): void {
  try {
    storage?.setItem(STAGES_KEY, JSON.stringify({ seen }));
  } catch {
    // Storage can be full or forbidden; the card may show again after a reload.
  }
}
