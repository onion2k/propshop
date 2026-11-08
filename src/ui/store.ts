// The game store: owns the one Game, runs it against the wall clock, publishes a snapshot at a steady rate
// whatever the sim speed, and saves. React subscribes through useSyncExternalStore. The wall clock is read
// here and nowhere further in: the sim only ever sees how many ms it is being asked for.

import { LAST_STAGE, LESSONS, shows, signals, stageOf, type Feature, type StageId } from '../content';
import {
  BACKTEST_WINDOW_MS,
  BLOCKS,
  Game,
  MAX_DAY_PINS,
  MAX_TICKS_PER_ADVANCE,
  MS_PER_DAY,
  TICK_MS,
  isMarketOpen,
  nextOpen,
  pinTimes,
  variants as makeVariants,
  type DayReport,
  type Pin,
  type SavedGame,
  type Snapshot,
  type Speed,
} from '../sim';
import type { Content } from '../sim';
import type { JobEvent, NightJob } from '../nightjob';
import {
  InlineRunner,
  MAX_NIGHTS,
  changeToVariant,
  loadTests,
  parseChange,
  TESTS_KEY,
  saveTests,
  setupKey,
  setupOf,
  storedMeasures,
  type Change,
  type Night,
  type NightRunner,
  type Tests,
} from './nights';

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
  /** Writes the game to storage; resolves once it is written, or given up (storage full, or a reset meanwhile). */
  save: () => Promise<void>;
  reset: (seed: number) => void;
  game: Game;
  // Actions, so components never touch the game.
  setSpeed: (speed: Speed) => void;
  skipToOpen: () => void;
  /** The nights' tests: one object per change, for `useSyncExternalStore`. */
  getTests: () => Tests;
  /** Queue one change of the player's own for tonight's tests (or take it back with null). */
  setPlayerTest: (change: Change | null) => void;
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

export interface StoreOptions {
  /** The length of each test window, ms of simulated time; the tests' default where absent. For tests. */
  windowMs?: number;
  /**
   * Packs the save's JSON before it is written: the page's gzip (`packSave`), as the save outgrows localStorage
   * unpacked. Without one the JSON is written as it is, at once, as the tests want.
   */
  pack?: (json: string) => Promise<string>;
  /** The kept save, already unpacked by the page (`readSave`); where absent the store reads storage itself. */
  saved?: string | null;
}

/** The day's pins, as the store keeps them from the open to the close. */
interface DaySchedule {
  day: number;
  times: { label: Pin['label']; at: number }[];
  /** The game's time when the schedule was made: the times before it are gone. */
  since: number;
  /** True where the schedule was made as the page loaded into a day already open. */
  loaded: boolean;
  /** Bounded by `MAX_DAY_PINS`. */
  pins: Pin[];
  /** The setup at each pin, as a key. */
  setups: string[];
  /** Times the game passed with another pin due, or did not reach, and why. */
  lost: Map<Pin['label'], string>;
}

interface QueuedNight {
  day: number;
  job: NightJob;
}

export function createStore(
  content: Content,
  storage: Storage | null,
  seed: number,
  /** The wall clock the budget is held against; without one the sim runs every tick asked, as the tests want. */
  clock?: () => number,
  /** Carries the night's tests: a Web Worker from the page. Without one they run on the main thread in closed hours. */
  runner?: NightRunner,
  options: StoreOptions = {},
): Store {
  let game = loadOrNew(
    content,
    options.saved !== undefined ? options.saved : (storage?.getItem(SAVE_KEY) ?? null),
    seed,
  );
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
  // A packed save lands only if it is the newest begun and no reset came between: `saveGen` counts resets.
  let saveGen = 0;
  let saveSeq = 0;
  let lastPump: number | null = null;
  let held = false;
  const listeners = new Set<() => void>();

  // The night's tests. The pins are the current day's alone and live in memory; the nights are kept in storage.
  const windowMs = options.windowMs ?? BACKTEST_WINDOW_MS;
  const nightRunner: NightRunner = runner ?? new InlineRunner(content);
  const stored = loadTests(storage, snapshot.shop);
  let nights: Night[] = stored.nights;
  let player: Change | null = stored.player;
  let schedule: DaySchedule | null = null;
  let closedDay: number | null = game.days.length ? game.days[game.days.length - 1]!.day : null;
  let active: { day: number; of: number } | null = null;
  let waiting: QueuedNight | null = null;
  let progressNow: Tests['progress'] = null;
  let tests: Tests = { nights, progress: null, player };
  const changed = () => {
    tests = { nights, progress: progressNow, player };
    for (const l of listeners) l();
  };
  const persist = () => saveTests(storage, nights, player);
  // What was running at the last reload is partial now; write that down.
  if (storage?.getItem(TESTS_KEY)) persist();

  const updateNight = (day: number, f: (n: Night) => Night) => {
    nights = nights.map((n) => (n.day === day ? f(n) : n));
  };

  const dayOf = () => Math.floor(game.now / MS_PER_DAY);

  /** At an open not yet seen, take the day's pin times; the ones already behind the game are lost. */
  const ensureSchedule = (fromLoad = false) => {
    if (held || !isMarketOpen(game.now) || schedule?.day === dayOf()) return;
    schedule = {
      day: dayOf(),
      times: pinTimes(game),
      since: game.now,
      loaded: fromLoad,
      pins: [],
      setups: [],
      lost: new Map(),
    };
  };

  const pending = (): { label: Pin['label']; at: number } | undefined => {
    const sch = schedule;
    if (!sch) return undefined;
    return sch.times.find(
      (t) => t.at >= sch.since && !sch.lost.has(t.label) && !sch.pins.some((p) => p.label === t.label),
    );
  };

  /** Pin the game at the first tick at or after the next time due, while the market is open. */
  const takePins = () => {
    const sch = schedule;
    if (held || !sch || !isMarketOpen(game.now)) return;
    const due = pending();
    if (!due || due.at > game.now) return;
    for (const t of sch.times) {
      if (
        t !== due &&
        t.at <= game.now &&
        t.at >= sch.since &&
        !sch.lost.has(t.label) &&
        !sch.pins.some((p) => p.label === t.label)
      )
        sch.lost.set(t.label, 'The game was already past this time when the pin before it was taken.');
    }
    if (sch.pins.length >= MAX_DAY_PINS) return;
    // A save shares live objects with the game: it is cloned at once, and only the clone is kept.
    const save = structuredClone(game.save());
    sch.pins.push({ label: due.label, at: save.now, save });
    sch.setups.push(setupKey(setupOf(game)));
  };

  const finish = (day: number, why: string | null) => {
    updateNight(day, (n) => {
      const whole = n.runs.length === n.pins.length * n.variants.length && n.missing.length === 0 && why === null;
      return {
        ...n,
        status: whole ? 'done' : n.runs.length > 0 ? 'partial' : 'none',
        reason: whole
          ? null
          : (why ??
            n.reason ??
            (n.runs.length === 0
              ? 'The tests produced no runs.'
              : n.missing.length
                ? "Some of the day's windows were not pinned."
                : null)),
      };
    });
  };

  const startJob = (q: QueuedNight) => {
    const night = nights.find((n) => n.day === q.day);
    if (!night) return;
    active = { day: q.day, of: q.job.pins.length * q.job.variants.length };
    progressNow = { day: q.day, done: 0, of: active.of };
    nightRunner.start(q.job, (e) => onJobEvent(q.day, e));
  };

  const startNext = () => {
    if (held || active || !waiting) return;
    const q = waiting;
    waiting = null;
    startJob(q);
  };

  const onJobEvent = (day: number, e: JobEvent) => {
    if (active?.day !== day) return;
    if (e.kind === 'progress') {
      progressNow = { day, done: e.run, of: e.of };
    } else if (e.kind === 'result') {
      updateNight(day, (n) => {
        const at = n.pins.find((p) => p.label === e.pin)?.at ?? 0;
        return {
          ...n,
          runs: [...n.runs, { variantId: e.variantId, pin: e.pin, at, measures: storedMeasures(e.measures) }],
        };
      });
      persist();
    } else {
      finish(day, e.kind === 'error' ? `The tests stopped: ${e.message}` : null);
      active = null;
      progressNow = null;
      persist();
      changed();
      startNext();
      changed();
      return;
    }
    changed();
  };

  /** The day has closed: set the night's tests going from the pins, or record why there are none. */
  const onClose = (report: DayReport) => {
    const sch = schedule;
    schedule = null;
    if (held) return;
    const snap = game.snapshot();
    const setup = setupOf(game);
    const stage = stageNow();
    const shown = (f: Feature) => shows(f, stage);
    const sigs = signals(game.days, snap, { shown });
    const blockIds = BLOCKS.map((b) => b.spec.id).filter((id) => shown(`block:${id}`));
    const mine = player ? changeToVariant(player, setup, snap.shop) : null;
    const vs = makeVariants(setup, snap.shop, blockIds, {
      prefer: sigs.flatMap((s) => s.prefer),
      ...(mine ? { player: mine } : {}),
    });
    const playerNote = player
      ? vs.some((v) => v.kind === 'player')
        ? `Your test: ${mine?.label ?? ''}`
        : 'Your test could not be run: it no longer made sense for the setup at the close.'
      : null;
    player = null;

    const pins = sch?.pins ?? [];
    const missing: Night['missing'] = [];
    for (const t of sch?.times ?? []) {
      if (pins.some((p) => p.label === t.label)) continue;
      const reason =
        sch!.lost.get(t.label) ??
        (t.at < sch!.since
          ? sch!.loaded
            ? "The page was loaded after this time, and a reload loses the day's pins."
            : 'The game was already past this time when the day was set up.'
          : 'The game did not stop at this time to pin it (it was held, or stepped past).');
      missing.push({ pin: t.label, reason });
    }
    const closeKey = setupKey(setup);
    const night: Night = {
      day: report.day,
      closedAt: game.now,
      status: pins.length ? 'running' : 'none',
      windowMs,
      variants: vs.map((v) => ({
        id: v.id,
        kind: v.kind,
        label: v.label,
        ...(v.price !== undefined ? { price: v.price } : {}),
        ...(v.about !== undefined ? { about: v.about } : {}),
        signals: sigs
          .filter((s) => s.prefer.includes(v.id) || (v.about !== undefined && s.prefer.includes(v.about)))
          .map((s) => s.id),
      })),
      pins: pins.map((p) => ({ label: p.label, at: p.at })),
      runs: [],
      missing,
      setupChanged: !!sch && sch.setups.some((k) => k !== closeKey),
      skipped: false,
      reason: pins.length
        ? null
        : sch
          ? 'No window of the day was pinned, so there is nothing to run: ' +
            (missing[0]?.reason ?? 'the day gave no pin times.')
          : 'No open was seen on this page for the day, so there is nothing to run.',
      playerNote,
    };
    nights = [...nights.filter((n) => n.day !== night.day), night].slice(-MAX_NIGHTS);
    if (pins.length) {
      const job: NightJob = { pins, variants: vs, ...(options.windowMs !== undefined ? { windowMs } : {}) };
      if (active) {
        if (waiting) {
          const old = waiting.day;
          updateNight(old, (n) => ({
            ...n,
            status: 'none',
            skipped: true,
            reason: 'A newer day closed before these tests could start, so they were not run.',
          }));
        }
        waiting = { day: night.day, job };
      } else startJob({ day: night.day, job });
    }
    persist();
    changed();
  };

  const checkClose = () => {
    const last = game.days[game.days.length - 1];
    if (last && last.day !== closedDay) {
      closedDay = last.day;
      onClose(last);
    }
  };

  /** Run `wanted` ticks (within the deadline if there is one), stopping where a pin is due, and pin it. */
  const runTicks = (wanted: number, deadline?: number): number => {
    let done = 0;
    while (done < wanted) {
      ensureSchedule();
      takePins();
      let n = Math.min(deadline === undefined ? wanted : CHUNK, wanted - done);
      const due = pending();
      if (due && due.at > game.now) n = Math.min(n, Math.max(1, Math.ceil((due.at - game.now) / TICK_MS)));
      if (!isMarketOpen(game.now)) n = Math.min(n, Math.max(1, Math.ceil((nextOpen(game.now) - game.now) / TICK_MS)));
      game.stepTicks(n);
      done += n;
      checkClose();
      if (deadline !== undefined && clock!() >= deadline) break;
    }
    ensureSchedule();
    takePins();
    return done;
  };
  // A page loaded into an open day has lost that day's earlier pins; it says so at the close.
  ensureSchedule(true);

  const publish = () => {
    if (game.version === publishedVersion) return;
    // A step the page took itself (a test, a jump) is seen here: the open's pin and the close's night.
    ensureSchedule();
    takePins();
    checkClose();
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
      const frameStart = clock?.();
      if (lastPump !== null && !held) {
        const dt = Math.min(1000, wallNow - lastPump);
        const wanted = Math.min(MAX_TICKS_PER_ADVANCE, Math.floor((dt * game.speed) / TICK_MS));
        const done = runTicks(wanted, frameStart === undefined ? undefined : frameStart + BUDGET_MS);
        // What was asked and not run is dropped, not owed: a slow device runs slower, it does not catch up later.
        const reached = dt > 0 ? (done * TICK_MS) / dt : running;
        running = game.speed === 0 ? 0 : running + (reached - running) * Math.min(1, dt / 500);
      }
      // The main-thread fallback gets what the frame has left, and only in closed hours.
      if (!held && nightRunner.pump) {
        nightRunner.pump({
          open: isMarketOpen(game.now),
          ...(clock && frameStart !== undefined ? { clock, deadline: frameStart + BUDGET_MS } : {}),
        });
      }
      lastPump = wallNow;
      if (wallNow - lastPublish >= PUBLISH_EVERY) {
        lastPublish = wallNow;
        publish();
      }
      if (wallNow - lastSave >= SAVE_EVERY) {
        lastSave = wallNow;
        void store.save();
      }
    },
    hold(on) {
      held = on;
      if (!on) {
        startNext();
        changed();
      }
    },
    getTests: () => tests,
    setPlayerTest(change) {
      player = change ? parseChange(change, snapshot.shop) : null;
      persist();
      changed();
    },
    publish,
    save() {
      if (!storage) return Promise.resolve();
      const write = (text: string) => {
        try {
          storage.setItem(SAVE_KEY, text);
        } catch {
          // Storage can be full or forbidden; the game goes on without it.
        }
      };
      const json = JSON.stringify(game.save());
      if (!options.pack) {
        write(json);
        return Promise.resolve();
      }
      const gen = saveGen;
      const seq = ++saveSeq;
      return options.pack(json).then(
        (packed) => {
          if (gen === saveGen && seq === saveSeq) write(packed);
        },
        () => {
          // A browser that cannot pack keeps the last save that was written.
        },
      );
    },
    reset(newSeed) {
      saveGen++;
      storage?.removeItem(SAVE_KEY);
      storage?.removeItem(PROGRESS_KEY);
      storage?.removeItem(TUTORIAL_KEY);
      game = new Game(content, newSeed);
      // The night's tests go with the game they tested.
      nightRunner.cancel();
      active = null;
      waiting = null;
      schedule = null;
      closedDay = null;
      progressNow = null;
      nights = [];
      player = null;
      storage?.removeItem(TESTS_KEY);
      changed();
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
    stepTicks: act((n) => void runTicks(n)),
  };
  return store;
}

function loadOrNew(content: Content, raw: string | null, seed: number): Game {
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
