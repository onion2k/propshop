// The game store: owns the one Game, runs it against the wall clock, publishes a snapshot at a steady rate
// whatever the sim speed, and saves. React subscribes through useSyncExternalStore. The wall clock is read
// here and nowhere further in: the sim only ever sees how many ms it is being asked for.

import { LESSONS } from '../content';
import { Game, type SavedGame, type Snapshot, type Speed } from '../sim';
import type { Content } from '../sim';

/** How often a new snapshot is handed to React, in wall ms, and how often the game is saved. */
const PUBLISH_EVERY = 100;
const SAVE_EVERY = 10_000;
export const SAVE_KEY = 'propshop.save.v1';
export const PROGRESS_KEY = 'propshop.progress.v1';

/** Which lessons are done, and the simulated time each was. One object per change, so React can compare it. */
export type Progress = Readonly<Record<string, number>>;

export interface Store {
  getSnapshot: () => Snapshot;
  getProgress: () => Progress;
  subscribe: (listener: () => void) => () => void;
  /** Hand the store some wall time; it runs the sim and publishes if it is due. */
  pump: (wallNow: number) => void;
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
}

export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createStore(content: Content, storage: Storage | null, seed: number): Store {
  let game = loadOrNew(content, storage, seed);
  let snapshot = game.snapshot();
  let progress: Progress = loadProgress(storage);
  let publishedVersion = game.version;
  let lastPublish = -Infinity;
  let lastSave = -Infinity;
  let lastPump: number | null = null;
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
    getProgress: () => progress,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    pump(wallNow) {
      if (lastPump !== null) {
        const dt = Math.min(1000, wallNow - lastPump);
        game.advance(dt);
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
      game = new Game(content, newSeed);
      progress = {};
      publishedVersion = -1;
      publish();
    },
    setSpeed: act((s) => game.setSpeed(s)),
    skipToOpen: act(() => game.skipToOpen()),
    setBlock: act((id, change) => game.setBlock(id, change)),
    buyUpgrade: act((kind, id) => game.buyUpgrade(kind, id)),
    buyTip: act((id) => game.buyTip(id)),
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
