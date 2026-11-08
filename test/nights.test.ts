import { CONTENT } from '../src/content';
import { Game, MAX_DAY_PINS, MS_PER_MINUTE, TICK_MS, pinTimes, testNight, variants, type Pin } from '../src/sim';
import { MARKET_CLOSE, MARKET_OPEN, MS_PER_DAY } from '../src/sim/clock';
import { handleJob, jobEvents, type JobEvent, type NightJob } from '../src/nightjob';
import {
  InlineRunner,
  MAX_NIGHTS,
  WorkerRunner,
  TESTS_KEY,
  parseChange,
  setupKey,
  setupOf,
  type Change,
  type Night,
  type NightRunner,
} from '../src/ui/nights';
import { createStore, SAVE_KEY, type Storage, type Store } from '../src/ui/store';

const WINDOW = 3000;

/** What is under the tests key. */
const kept = (storage: { data: Map<string, string> }) =>
  JSON.parse(storage.data.get(TESTS_KEY) ?? '{"nights":[],"player":null}') as {
    nights: Night[];
    player: Change | null;
  };

function memory(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

/** A runner that records what it is handed and finishes nothing until the test says. */
class FakeRunner implements NightRunner {
  jobs: NightJob[] = [];
  cancelled = 0;
  emit: ((e: JobEvent) => void) | null = null;
  start(job: NightJob, onEvent: (e: JobEvent) => void) {
    this.jobs.push(job);
    this.emit = onEvent;
  }
  cancel() {
    this.cancelled++;
    this.emit = null;
  }
}

/** One result, as a runner would tell it, so a night that then ends has run something. */
const aResult = (pin: 'open' | 'headline' | 'afternoon' = 'open'): JobEvent => ({
  kind: 'result',
  variantId: 'baseline',
  pin,
  measures: {
    pnl: 0,
    fills: 0,
    races: { won: 0, beaten: 0, missed: 0 },
    byExchange: {},
    beaten: [],
    byBlock: {},
    fees: 0,
  },
});

/** Step the store's game coarsely to a time and let the store see it. */
function upTo(store: Store, t: number) {
  const g = store.game;
  if (t > g.now) g.step(t - g.now);
  store.publish();
}

const dayStart = (store: Store) => Math.floor(store.game.now / MS_PER_DAY) * MS_PER_DAY;

/** A whole trading day, visiting the pins it is told to (all of them by default), then the close. */
function playDay(store: Store, visit: (label: string) => boolean = () => true, between?: (label: string) => void) {
  store.skipToOpen();
  const times = pinTimes(store.game);
  for (const t of times) {
    if (!visit(t.label)) continue;
    upTo(store, t.at);
    between?.(t.label);
  }
  const days = store.game.days.length;
  upTo(store, dayStart(store) + MARKET_CLOSE - TICK_MS);
  while (store.game.days.length === days) store.game.step(TICK_MS);
  store.publish();
  return times;
}

function pumpUntilIdle(store: Store, limit = 5000) {
  let t = 0;
  store.pump(t);
  for (let i = 0; i < limit && store.getTests().progress; i++) store.pump((t += 100));
}

const make = (storage: Storage | null, runner?: NightRunner, seed = 21) => {
  const store = createStore(CONTENT, storage, seed, undefined, runner, { windowMs: WINDOW });
  store.setSpeed(0);
  return store;
};

describe('a close with pins', () => {
  it(
    'runs the baseline and every variant on every pin, saves the night, and loads it back',
    { timeout: 60_000 },
    () => {
      const storage = memory();
      const store = make(storage);
      const times = playDay(store);
      const night = store.getTests().nights[0]!;
      expect(night.status).toBe('running');
      expect(night.pins.map((p) => p.label)).toEqual(times.map((t) => t.label));
      pumpUntilIdle(store);
      const done = store.getTests().nights[0]!;
      expect(done.status).toBe('done');
      expect(done.variants[0]!.id).toBe('baseline');
      expect(done.runs).toHaveLength(done.variants.length * done.pins.length);
      expect(done.missing).toEqual([]);
      expect(done.setupChanged).toBe(false);
      expect(done.reason).toBeNull();
      expect(done.runs[0]).not.toHaveProperty('measures.beaten');
      expect(done.runs[0]!.measures.races).toBeDefined();
      // The pins' times are the schedule's, taken at the first tick at or after, with the save's own time.
      done.pins.forEach((p, i) => {
        expect(p.at).toBeGreaterThanOrEqual(times[i]!.at);
        expect(p.at - times[i]!.at).toBeLessThan(MS_PER_MINUTE);
      });
      expect(store.getTests().progress).toBeNull();
      const again = make(storage);
      expect(again.getTests().nights).toEqual(store.getTests().nights);
      expect(kept(storage).nights).toHaveLength(1);
    },
  );

  it('hands a runner the pins as clones, at most MAX_DAY_PINS, each with its own time', () => {
    const runner = new FakeRunner();
    const store = make(memory(), runner);
    playDay(store);
    expect(runner.jobs).toHaveLength(1);
    const job = runner.jobs[0]!;
    expect(job.pins.length).toBeLessThanOrEqual(MAX_DAY_PINS);
    expect(job.windowMs).toBe(WINDOW);
    for (const p of job.pins) expect(p.at).toBe(p.save.now);
    expect(job.variants[0]!.kind).toBe('baseline');
    expect(job.variants[0]!.setup).toEqual(setupOf(store.game));
  });
});

describe('a store made mid-day', () => {
  function midDay(offset: number, runner: NightRunner) {
    const g = new Game(CONTENT, 21);
    g.skipToOpen();
    g.step(MARKET_OPEN - g.now + offset);
    const storage = memory();
    storage.setItem(SAVE_KEY, JSON.stringify(g.save()));
    return make(storage, runner);
  }

  it('records a night with the reason and runs nothing when it has no pins', () => {
    const runner = new FakeRunner();
    const store = midDay(5 * 60 * 60 * 1000 + 59 * MS_PER_MINUTE, runner); // past every pin time but the close
    upTo(store, dayStart(store) + MARKET_CLOSE - TICK_MS);
    while (store.getTests().nights.length === 0) {
      store.game.step(TICK_MS);
      store.publish();
    }
    const night = store.getTests().nights[0]!;
    expect(night.status).toBe('none');
    expect(night.runs).toEqual([]);
    expect(night.pins).toEqual([]);
    expect(night.reason).toMatch(/reload|loaded/i);
    expect(night.missing.length).toBeGreaterThan(0);
    expect(runner.jobs).toHaveLength(0);
  });

  it('names the one window it is missing and tests the rest', () => {
    const runner = new FakeRunner();
    const store = midDay(MS_PER_MINUTE, runner); // just after the open: only the open's pin is gone
    const times = pinTimes(store.game);
    for (const t of times.slice(1)) upTo(store, t.at);
    upTo(store, dayStart(store) + MARKET_CLOSE - TICK_MS);
    while (store.getTests().nights.length === 0) {
      store.game.step(TICK_MS);
      store.publish();
    }
    const night = store.getTests().nights[0]!;
    expect(night.missing.map((m) => m.pin)).toEqual(['open']);
    expect(night.missing[0]!.reason).toMatch(/reload|loaded/i);
    expect(night.pins.map((p) => p.label)).toEqual(times.slice(1).map((t) => t.label));
    expect(night.status).toBe('running');
    expect(runner.jobs).toHaveLength(1);
    expect(runner.jobs[0]!.pins).toHaveLength(times.length - 1);
    // Told it was not whole, however the runs go.
    runner.emit!(aResult(times[1]!.label));
    runner.emit!({ kind: 'end' });
    expect(store.getTests().nights[0]!.status).toBe('partial');
  });
});

describe('the setup', () => {
  it('notes that it changed during the day, and tests the one at the close', () => {
    const runner = new FakeRunner();
    const store = make(memory(), runner);
    playDay(
      store,
      () => true,
      (label) => {
        if (label === 'open') {
          store.setBlock('momentum', {
            params: { ...store.game.firm.blocks.find((b) => b.id === 'momentum')!.params, threshold: 0.5 },
          });
        }
      },
    );
    const night = store.getTests().nights[0]!;
    expect(night.setupChanged).toBe(true);
    expect(runner.jobs[0]!.variants[0]!.setup).toEqual(setupOf(store.game));
  });
});

describe('the queue', () => {
  it('queues a close that comes while a job runs, and a third replaces the waiting one as skipped', () => {
    const runner = new FakeRunner();
    const store = make(memory(), runner);
    const onlyOpen = (l: string) => l === 'open';
    playDay(store);
    expect(runner.jobs).toHaveLength(1);
    playDay(store, onlyOpen);
    expect(runner.jobs).toHaveLength(1);
    const [first, second] = store.getTests().nights;
    expect(first!.status).toBe('running');
    expect(second!.status).toBe('running');
    playDay(store, onlyOpen);
    const nights = store.getTests().nights;
    expect(nights).toHaveLength(3);
    expect(nights[1]!.skipped).toBe(true);
    expect(nights[1]!.status).toBe('none');
    expect(nights[1]!.reason).toMatch(/newer/);
    expect(nights[2]!.skipped).toBe(false);
    expect(runner.jobs).toHaveLength(1);
    // The first finishes and the newest starts; the skipped one never does.
    runner.emit!({ kind: 'end' });
    expect(runner.jobs).toHaveLength(2);
    expect(runner.jobs[1]!.pins[0]!.save.now).toBe(nights[2]!.pins[0]!.at);
    expect(store.getTests().progress).toMatchObject({ day: nights[2]!.day, done: 0 });
  });

  it('starts nothing while held, and the waiting night when released', () => {
    const runner = new FakeRunner();
    const store = make(memory(), runner);
    playDay(store);
    playDay(store, (l) => l === 'open');
    store.hold(true);
    runner.emit!(aResult());
    runner.emit!({ kind: 'end' }); // a worker finishing while held is allowed to
    expect(runner.jobs).toHaveLength(1);
    expect(store.getTests().nights[0]!.status).toBe('partial');
    store.hold(false);
    expect(runner.jobs).toHaveLength(2);
  });

  it('records no night for a day closed while held', () => {
    const runner = new FakeRunner();
    const store = make(memory(), runner);
    store.hold(true);
    playDay(store);
    expect(store.getTests().nights).toEqual([]);
    expect(runner.jobs).toHaveLength(0);
  });
});

function stubNight(day: number): Night {
  return {
    day,
    closedAt: 0,
    status: 'done',
    windowMs: WINDOW,
    variants: [],
    pins: [],
    runs: [],
    missing: [],
    setupChanged: false,
    skipped: false,
    reason: null,
    playerNote: null,
  };
}

describe('the stored nights', () => {
  it('keeps at most MAX_NIGHTS, dropping the oldest', () => {
    const storage = memory();
    const nights = Array.from({ length: MAX_NIGHTS }, (_, i) => stubNight(i + 100));
    storage.setItem(TESTS_KEY, JSON.stringify({ nights, player: null }));
    const store = make(storage, new FakeRunner());
    expect(store.getTests().nights).toHaveLength(MAX_NIGHTS);
    playDay(store);
    const now = store.getTests().nights;
    expect(now).toHaveLength(MAX_NIGHTS);
    expect(now[0]!.day).toBe(101);
    expect(kept(storage).nights).toHaveLength(MAX_NIGHTS);
  });

  it('loads more than the cap as the newest MAX_NIGHTS', () => {
    const storage = memory();
    const nights = Array.from({ length: MAX_NIGHTS + 5 }, (_, i) => stubNight(i));
    storage.setItem(TESTS_KEY, JSON.stringify({ nights, player: null }));
    const loaded = make(storage).getTests().nights;
    expect(loaded).toHaveLength(MAX_NIGHTS);
    expect(loaded[0]!.day).toBe(5);
  });

  it('marks a night that was running at the reload partial, or none if it had no runs', () => {
    const storage = memory();
    const run = { variantId: 'baseline', pin: 'open', at: 1, measures: { pnl: 1 } };
    storage.setItem(
      TESTS_KEY,
      JSON.stringify({
        nights: [
          { ...stubNight(1), status: 'running', runs: [run] },
          { ...stubNight(2), status: 'running' },
          { not: 'a night' },
        ],
        player: null,
      }),
    );
    const nights = make(storage).getTests().nights;
    expect(nights.map((n) => n.status)).toEqual(['partial', 'none']);
    expect(nights[0]!.reason).toMatch(/reload/);
  });

  it('is cleared by reset, which also cancels the job', () => {
    const storage = memory();
    const runner = new FakeRunner();
    const store = make(storage, runner);
    playDay(store);
    expect(store.getTests().nights).toHaveLength(1);
    store.setPlayerTest({ kind: 'toggle', block: 'arbitrage' });
    store.reset(5);
    expect(runner.cancelled).toBeGreaterThan(0);
    expect(store.getTests()).toEqual({ nights: [], progress: null, player: null });
    expect(kept(storage).nights).toEqual([]);
    expect(store.game.days).toHaveLength(0);
  });
});

describe("the player's own test", () => {
  it('becomes the last variant at the close, and is cleared once used', () => {
    const storage = memory();
    const runner = new FakeRunner();
    const store = make(storage, runner);
    const change: Change = { kind: 'param', block: 'momentum', key: 'threshold', value: 0.5 };
    store.setPlayerTest(change);
    expect(store.getTests().player).toEqual(change);
    expect(kept(storage).player).toEqual(change);
    playDay(store, (l) => l === 'open');
    const job = runner.jobs[0]!;
    const mine = job.variants[job.variants.length - 1]!;
    expect(mine.kind).toBe('player');
    expect(mine.id).toMatch(/^player:/);
    expect(store.getTests().player).toBeNull();
    expect(kept(storage).player).toBeNull();
    expect(store.getTests().nights[0]!.variants.at(-1)!.kind).toBe('player');
    expect(store.getTests().nights[0]!.variants[0]).not.toHaveProperty('setup');
  });

  it('is dropped on load when it no longer makes sense, and kept when it does', () => {
    const bad = [
      { kind: 'toggle', block: 'nonesuch' },
      { kind: 'param', block: 'momentum', key: 'nonesuch', value: 1 },
      { kind: 'param', block: 'momentum', key: 'x', value: 'big' },
      { kind: 'upgrade', upgradeKind: 'rocket', id: 'x' },
      { kind: 'upgrade', upgradeKind: 'computer', id: 'nonesuch' },
      { kind: 'whatever' },
      7,
      null,
    ];
    for (const player of bad) {
      const storage = memory();
      storage.setItem(TESTS_KEY, JSON.stringify({ nights: [], player }));
      expect(make(storage).getTests().player).toBeNull();
    }
    const storage = memory();
    storage.setItem(TESTS_KEY, JSON.stringify({ nights: [], player: { kind: 'toggle', block: 'arbitrage' } }));
    expect(make(storage).getTests().player).toEqual({ kind: 'toggle', block: 'arbitrage' });
    const shop = new Game(CONTENT, 1).snapshot().shop;
    const owned = shop.find((o) => o.kind === 'computer' && o.inUse)!;
    expect(parseChange({ kind: 'upgrade', upgradeKind: 'computer', id: owned.spec.id }, shop)).toBeNull();
  });
});

describe('the job handler', () => {
  const g = new Game(CONTENT, 3);
  g.skipToOpen();
  g.step(MS_PER_MINUTE + 1000);
  const save = g.save();
  const pin: Pin = { label: 'open', at: save.now, save: structuredClone(save) };
  const setup = setupOf(g);
  const vs = variants(setup, g.snapshot().shop, ['momentum']).slice(0, 2);

  it('posts the same events as running testNight directly, then ends', () => {
    const posted: JobEvent[] = [];
    handleJob(CONTENT, { pins: [pin], variants: vs, windowMs: 1000 }, (e) => posted.push(e));
    const direct = [...testNight(CONTENT, [pin], vs, 5000, 1000)];
    expect(posted.at(-1)).toEqual({ kind: 'end' });
    expect(posted.slice(0, -1)).toEqual(direct);
    expect(posted.some((e) => e.kind === 'result')).toBe(true);
  });

  it('turns an exception into an error event and stops', () => {
    const bad: Pin = { ...pin, save: { ...pin.save, version: 99 } as unknown as Pin['save'] };
    const events = [...jobEvents(CONTENT, { pins: [bad], variants: vs, windowMs: 1000 })];
    expect(events.at(-1)?.kind).toBe('error');
  });
});

describe('the main-thread runner', () => {
  const g = new Game(CONTENT, 4);
  g.skipToOpen();
  g.step(MS_PER_MINUTE + 1000);
  const pin: Pin = { label: 'open', at: g.now, save: structuredClone(g.save()) };
  const job: NightJob = {
    pins: [pin],
    variants: variants(setupOf(g), g.snapshot().shop, ['momentum']).slice(0, 1),
    windowMs: 500,
  };

  it('advances nothing while the market is open, and runs the job to its end when closed', () => {
    const runner = new InlineRunner(CONTENT, 50, 4);
    const seen: JobEvent[] = [];
    runner.start(job, (e) => seen.push(e));
    for (let i = 0; i < 5; i++) runner.pump({ open: true });
    expect(seen).toEqual([]);
    for (let i = 0; i < 100 && seen.at(-1)?.kind !== 'end'; i++) runner.pump({ open: false });
    expect(seen.at(-1)).toEqual({ kind: 'end' });
    expect(seen.filter((e) => e.kind === 'result')).toHaveLength(1);
    expect(runner.busy).toBe(false);
  });

  it('stops at its deadline when it has a clock', () => {
    const runner = new InlineRunner(CONTENT, 50, 4);
    const seen: JobEvent[] = [];
    runner.start(job, (e) => seen.push(e));
    let wall = 0;
    runner.pump({ open: false, clock: () => (wall += 1), deadline: 1 });
    expect(seen).toHaveLength(1);
  });

  it('does not run in the store while the market is open', () => {
    const store = make(memory());
    // The store's default runner is this one; it is idle without a night, and a pump while open does nothing to it.
    store.skipToOpen();
    store.game.step(2 * MS_PER_MINUTE);
    store.publish();
    store.pump(0);
    store.pump(100);
    expect(store.getTests().progress).toBeNull();
  });
});

describe('the worker runner', () => {
  const g = new Game(CONTENT, 4);
  g.skipToOpen();
  g.step(MS_PER_MINUTE + 1000);
  const pin: Pin = { label: 'open', at: g.now, save: structuredClone(g.save()) };
  const job: NightJob = {
    pins: [pin],
    variants: variants(setupOf(g), g.snapshot().shop, ['momentum']).slice(0, 3),
    windowMs: 500,
  };

  /** A worker that answers with the job's first result, then fails as a worker that crashes does. */
  class CrashingWorker {
    onmessage: ((m: MessageEvent<JobEvent>) => void) | null = null;
    onerror: ((e: ErrorEvent) => void) | null = null;
    terminated = false;
    postMessage(j: NightJob) {
      const first = [...jobEvents(CONTENT, j)].find((e) => e.kind === 'result')!;
      this.onmessage?.({ data: first } as MessageEvent<JobEvent>);
      this.onerror?.({ message: 'out of memory' } as ErrorEvent);
    }
    terminate() {
      this.terminated = true;
    }
  }

  it('finishes a job on the main thread when its worker fails, each run once', () => {
    const made: CrashingWorker[] = [];
    const runner = new WorkerRunner(() => {
      const w = new CrashingWorker();
      made.push(w);
      return w as unknown as Worker;
    }, CONTENT);
    const seen: JobEvent[] = [];
    runner.start(job, (e) => seen.push(e));
    for (let i = 0; i < 200 && seen.at(-1)?.kind !== 'end'; i++) runner.pump({ open: false });
    const direct = [...jobEvents(CONTENT, job)];
    expect(seen).toEqual(direct);
    expect(made[0]!.terminated).toBe(true);
    // The next night goes to the main thread at once.
    const next: JobEvent[] = [];
    runner.start(job, (e) => next.push(e));
    for (let i = 0; i < 200 && next.at(-1)?.kind !== 'end'; i++) runner.pump({ open: false });
    expect(next).toEqual(direct);
    expect(made).toHaveLength(1);
  });

  it('runs on the main thread when no worker can be made', () => {
    const runner = new WorkerRunner(() => {
      throw new Error('refused');
    }, CONTENT);
    const seen: JobEvent[] = [];
    runner.start(job, (e) => seen.push(e));
    for (let i = 0; i < 200 && seen.at(-1)?.kind !== 'end'; i++) runner.pump({ open: false });
    expect(seen.at(-1)).toEqual({ kind: 'end' });
  });
});

describe('setupKey', () => {
  it('is the same for the same setup whatever the order of keys', () => {
    const a = setupOf(new Game(CONTENT, 1));
    const b = { ...a, blocks: [...a.blocks].reverse() };
    expect(setupKey(a)).toBe(setupKey(b));
  });
});
