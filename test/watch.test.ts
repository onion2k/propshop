// Part D of plans/play-and-learn.md: watch mode. The sim's public moments, the pure chooser of the speed, and the
// store running by it.
import { CONTENT } from '../src/content';
import { METALS_DESK } from '../src/content/metals';
import { Game, MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND, TICK_MS, type NextMoment } from '../src/sim';
import { MARKET_CLOSE, MARKET_OPEN } from '../src/sim/clock';
import type { JobEvent, NightJob } from '../src/nightjob';
import type { NightRunner } from '../src/ui/nights';
import { createStore } from '../src/ui/store';
import { WATCH_LEAD, WATCH_TAIL, WATCH_FAST, WATCH_SLOW, watchSpeed } from '../src/ui/watch';

const H = MS_PER_HOUR;
const at = (day: number, time: number) => day * MS_PER_DAY + time;

/** Step in coarse strides to `until`: a test of the clock, not of the books. */
const run = (g: Game, until: number, stride = 1000) => {
  while (g.now < until) g.step(Math.min(stride, until - g.now));
};

/**
 * A game without the market releases already on its schedule: these tests are of the clock, the fix and the expiry,
 * and a release (the economic calendar, `test/calendar.test.ts`) is a moment too, and may fall before them.
 */
const quiet = (g: Game): Game => {
  g.news.scheduled = g.news.scheduled.filter((h) => h.sector !== null);
  return g;
};

describe('nextMoment: the next public time', () => {
  it('is the open when closed and the close when open, the stocks alone', () => {
    const g = quiet(new Game(CONTENT, 1));
    run(g, at(0, 4 * H), 60_000);
    expect(g.nextMoment()).toEqual({ at: at(0, MARKET_OPEN), kind: 'open', label: 'The open' });
    run(g, at(0, 12 * H), 60_000);
    expect(g.nextMoment()).toEqual({ at: at(0, MARKET_CLOSE), kind: 'close', label: 'The close' });
  });

  it('is strictly after now: at the close itself it is the next open', () => {
    const g = new Game(CONTENT, 1);
    run(g, at(0, MARKET_CLOSE), 60_000);
    expect(g.nextMoment()).toEqual({ at: at(1, MARKET_OPEN), kind: 'open', label: 'The open' });
  });

  it('skips the weekend: from Friday evening the open is on Monday', () => {
    const g = new Game(CONTENT, 1);
    run(g, at(4, 20 * H), 600_000);
    expect(g.nextMoment()?.at).toBe(at(7, MARKET_OPEN));
  });

  it('does not count a fix of a desk that is not open', () => {
    const g = quiet(new Game(CONTENT, 1));
    run(g, at(0, 4 * H), 60_000);
    expect(g.nextMoment()?.kind).toBe('open');
  });

  it('counts the fix of an open desk, and the day after it is done', () => {
    const g = quiet(new Game(CONTENT, 1));
    g.openDesk(METALS_DESK);
    // A new game starts at 06:00 on Monday, after the morning fix.
    expect(g.nextMoment()).toMatchObject({ at: at(0, MARKET_OPEN), kind: 'open' });
    run(g, at(0, MARKET_OPEN), 60_000);
    const first = g.nextMoment()!;
    expect(first).toMatchObject({ at: at(0, 10 * H), kind: 'fix' });
    expect(first.label).toContain('Thamesford');
    run(g, at(0, 10 * H), 60_000);
    expect(g.nextMoment()).toMatchObject({ at: at(0, MARKET_CLOSE), kind: 'close' });
    run(g, at(0, MARKET_CLOSE), 60_000);
    expect(g.nextMoment()).toMatchObject({ at: at(1, 5.5 * H), kind: 'fix' });
  });

  it('has no fix at the weekend: Friday evening to Monday morning, the next fix is Monday 05:30', () => {
    const g = new Game(CONTENT, 1);
    g.openDesk(METALS_DESK);
    run(g, at(4, 20 * H), 600_000);
    const next = g.nextMoment()!;
    // An expiry may come first; whatever comes, nothing falls on Saturday or Sunday.
    const day = Math.floor(next.at / MS_PER_DAY);
    if (next.kind === 'fix') expect(next.at).toBe(at(7, 5.5 * H));
    else expect(next.kind).toBe('expiry');
    expect(day % 7 === 5 || day % 7 === 6 ? next.kind : 'ok').not.toBe('fix');
  });

  it('counts the soonest expiry of the live contracts of open desks, and not a closed desk’s', () => {
    const closed = new Game(CONTENT, 1);
    run(closed, at(0, 4 * H), 60_000);
    expect(closed.nextMoment()?.kind).not.toBe('expiry');
    const g = new Game(CONTENT, 1);
    g.openDesk(METALS_DESK);
    run(g, at(0, 11 * H), 60_000);
    const expiries = g.market.stocks.flatMap((s) => (s.expiry !== undefined && s.expiry > g.now ? [s.expiry] : []));
    expect(expiries.length).toBeGreaterThan(0);
    const soonest = Math.min(...expiries);
    // Walk on to just before it: it is then the next moment, or something public sooner is.
    run(g, soonest - 1000, 60_000);
    const m = g.nextMoment()!;
    // In the game's content the first expiry (Friday 13:30) is before that day's close.
    expect(m).toMatchObject({ at: soonest, kind: 'expiry' });
    expect(m.label).toContain('0 expiry');
  });

  it('is a read: calling it any number of times leaves a same-seed game bit-identical', () => {
    const make = () => {
      const g = new Game(CONTENT, 7);
      g.openDesk(METALS_DESK);
      run(g, at(0, 10 * H - 20 * MS_PER_SECOND), 60_000);
      return g;
    };
    const a = make();
    const b = make();
    for (let i = 0; i < 50; i++) a.nextMoment();
    expect(a.fingerprint()).toBe(b.fingerprint());
    a.stepTicks(500);
    b.stepTicks(500);
    for (let i = 0; i < 50; i++) a.nextMoment();
    expect(JSON.stringify(a.save())).toBe(JSON.stringify(b.save()));
    expect(a.fingerprint()).toBe(b.fingerprint());
  });

  it('is on no stream: it names the schedule and not a headline', () => {
    const g = quiet(new Game(CONTENT, 3));
    run(g, at(0, 10 * H), 60_000);
    const kinds = new Set<NextMoment['kind']>(['open', 'close', 'fix', 'expiry', 'release']);
    expect(kinds.has(g.nextMoment()!.kind)).toBe(true);
  });
});

const M = (time: number, kind: NextMoment['kind'] = 'fix'): NextMoment => ({ at: time, kind, label: 'x' });

describe('watchSpeed: the pure chooser', () => {
  it('is fast through the quiet and until the lead', () => {
    const d = watchSpeed(0, M(100_000), null, null);
    expect(d).toMatchObject({ speed: WATCH_FAST, slow: null, until: 100_000 - WATCH_LEAD });
  });

  it('is fast with no moment at all', () => {
    expect(watchSpeed(0, null, null, null)).toMatchObject({ speed: WATCH_FAST, until: Infinity });
  });

  it('slows from the lead to the moment, and for the tail after it', () => {
    const next = M(100_000);
    expect(watchSpeed(100_000 - WATCH_LEAD, next, null, null)).toMatchObject({
      speed: WATCH_SLOW,
      slow: 'moment',
      until: 100_000,
    });
    expect(watchSpeed(100_000 - WATCH_LEAD - 1, next, null, null).speed).toBe(WATCH_FAST);
    // Past it: the next moment is far off, the last was at 100,000.
    const far = M(1_000_000);
    expect(watchSpeed(100_000, far, 100_000, null)).toMatchObject({
      speed: WATCH_SLOW,
      slow: 'moment',
      until: 100_000 + WATCH_TAIL,
    });
    expect(watchSpeed(100_000 + WATCH_TAIL - 1, far, 100_000, null).speed).toBe(WATCH_SLOW);
    expect(watchSpeed(100_000 + WATCH_TAIL, far, 100_000, null).speed).toBe(WATCH_FAST);
  });

  it('slows for the tail after a headline, and not before one', () => {
    const far = M(10_000_000);
    expect(watchSpeed(5000, far, null, null).speed).toBe(WATCH_FAST);
    expect(watchSpeed(5000, far, null, 5000)).toMatchObject({
      speed: WATCH_SLOW,
      slow: 'headline',
      until: 5000 + WATCH_TAIL,
    });
    expect(watchSpeed(5000 + WATCH_TAIL, far, null, 5000).speed).toBe(WATCH_FAST);
  });

  it('names the moment before the headline when both hold, and stays slow until the later tail ends', () => {
    const far = M(10_000_000);
    const d = watchSpeed(103_000, far, 100_000, 103_000);
    expect(d.speed).toBe(WATCH_SLOW);
    expect(d.until).toBe(103_000 + WATCH_TAIL);
    expect(watchSpeed(103_000 + WATCH_TAIL - 1, far, 100_000, 103_000).speed).toBe(WATCH_SLOW);
  });

  it('a headline landing in a lead holds the slow past the moment by a tail from the headline', () => {
    const next = M(100_000);
    expect(watchSpeed(98_000, next, null, 98_000)).toMatchObject({ speed: WATCH_SLOW });
    // The moment has passed (last = 100,000); the headline's tail is the later one only if it ends later.
    expect(watchSpeed(105_000, M(9e6), 100_000, 98_000).until).toBe(100_000 + WATCH_TAIL);
    expect(watchSpeed(105_000, M(9e6), 100_000, 104_000).until).toBe(104_000 + WATCH_TAIL);
  });

  it('two moments inside one tail stay slow throughout, with no step up between', () => {
    const times = [100_000, 104_000];
    const speeds: number[] = [];
    let last: number | null = null;
    for (let now = 100_000 - WATCH_LEAD - 2000; now <= 104_000 + WATCH_TAIL + 2000; now += 500) {
      const passed = times.filter((t) => t <= now);
      last = passed.length ? passed[passed.length - 1]! : last;
      const upcoming = times.find((t) => t > now);
      speeds.push(watchSpeed(now, upcoming === undefined ? M(9e6) : M(upcoming), last, null).speed);
    }
    const first = speeds.indexOf(WATCH_SLOW);
    const lastSlow = speeds.lastIndexOf(WATCH_SLOW);
    expect(first).toBeGreaterThan(0);
    expect(speeds.slice(first, lastSlow + 1).every((s) => s === WATCH_SLOW)).toBe(true);
    expect(speeds[speeds.length - 1]).toBe(WATCH_FAST);
  });
});

/** A runner that takes the job and does nothing. */
class NullRunner implements NightRunner {
  jobs: NightJob[] = [];
  pumps: { open: boolean; deadline?: number }[] = [];
  start(job: NightJob, _on: (e: JobEvent) => void) {
    this.jobs.push(job);
  }
  cancel() {}
  pump(ctx: { open: boolean; deadline?: number }) {
    this.pumps.push({ open: ctx.open, ...(ctx.deadline !== undefined ? { deadline: ctx.deadline } : {}) });
  }
}

function watchStore(seed = 4) {
  // A clock that never reaches the deadline: the sim runs every tick asked (up to the per-pump cap).
  const runner = new NullRunner();
  const store = createStore(CONTENT, null, seed, () => 0, runner);
  return { store, runner };
}

/** Put the game at a time by coarse steps, and let the store see it. */
function jump(store: ReturnType<typeof createStore>, to: number) {
  run(store.game, to, 60_000);
  store.publish();
}

describe('the store in watch mode', () => {
  it('covers the quiet at the top speed and the seconds around the close at 1×', () => {
    const { store } = watchStore();
    jump(store, at(0, MARKET_CLOSE - 120 * MS_PER_SECOND));
    store.setWatching(true);
    expect(store.getWatching()).toBe(true);
    expect(store.game.speed).toBe(300);
    let wall = 0;
    store.pump(wall);
    const gained: number[] = [];
    const nows: number[] = [];
    for (let i = 0; i < 80 && store.game.now < at(0, MARKET_CLOSE) + WATCH_TAIL + 2000; i++) {
      const before = store.game.now;
      wall += 1000;
      store.pump(wall);
      gained.push(store.game.now - before);
      nows.push(store.game.now);
    }
    const lead = at(0, MARKET_CLOSE) - WATCH_LEAD;
    // It lands on the lead rather than overshooting it: some pump ends at or just after it, within what 1x of the
    // wall time left in that pump can give.
    const landed = nows.find((n) => n >= lead)!;
    expect(landed - lead).toBeLessThan(1000 + TICK_MS);
    // Before the lead, a pump gives more than a second; from the lead to the close, no more than a second a pump.
    expect(gained[0]!).toBeGreaterThan(5000);
    const inLead = nows
      .map((n, i) => ({ n, g: gained[i]! }))
      .filter((x) => x.n > lead + 1000 && x.n <= at(0, MARKET_CLOSE) + WATCH_TAIL);
    expect(inLead.length).toBeGreaterThan(5);
    for (const x of inLead) expect(x.g).toBeLessThanOrEqual(1000);
    // And after the tail, fast again.
    const afterTail = nows.findIndex((n) => n > at(0, MARKET_CLOSE) + WATCH_TAIL + 1000);
    if (afterTail >= 0) expect(gained[afterTail]!).toBeGreaterThan(1000);
  });

  it('never steps past the close’s lead in one chunk, whatever the pump asks', () => {
    const { store } = watchStore();
    jump(store, at(0, MARKET_CLOSE - 60 * MS_PER_SECOND));
    store.setWatching(true);
    store.pump(0);
    const lead = at(0, MARKET_CLOSE) - WATCH_LEAD;
    let seenAtLead = false;
    for (let i = 1; i < 6; i++) {
      store.pump(i * 1000);
      if (store.game.now === lead) seenAtLead = true;
      if (store.game.now > lead) break;
    }
    // Either it stopped exactly on the lead, or it crossed with the rest of the wall time at 1x.
    expect(seenAtLead || store.game.now - lead <= 1000).toBe(true);
  });

  it('runs closed hours fast to the open’s lead, and the open is watched at 1×', () => {
    const { store } = watchStore();
    jump(store, at(1, 9 * H + 20 * MS_PER_MINUTE));
    store.setWatching(true);
    store.pump(0);
    const open = at(1, MARKET_OPEN);
    let wall = 0;
    let fastPumps = 0;
    for (let i = 0; i < 100 && store.game.now < open - WATCH_LEAD; i++) {
      const before = store.game.now;
      wall += 1000;
      store.pump(wall);
      if (store.game.now - before > 1000) fastPumps++;
    }
    expect(fastPumps).toBeGreaterThan(5);
    expect(open - store.game.now).toBeLessThanOrEqual(WATCH_LEAD + 1000);
    const before = store.game.now;
    store.pump(wall + 1000);
    expect(store.game.now - before).toBeLessThanOrEqual(1000);
  });

  it('skip to open still works in watch mode', () => {
    const { store } = watchStore();
    jump(store, at(0, MARKET_CLOSE + 11 * MS_PER_SECOND));
    store.setWatching(true);
    store.skipToOpen();
    expect(store.game.now).toBe(at(1, MARKET_OPEN) - 60_000);
    expect(store.getWatching()).toBe(true);
  });

  it('slows for the tail after a headline lands, and then speeds up', () => {
    const { store } = watchStore();
    jump(store, at(0, 11 * H));
    store.setWatching(true);
    let wall = 0;
    store.pump(wall);
    wall += 1000;
    const b0 = store.game.now;
    store.pump(wall);
    expect(store.game.now - b0).toBeGreaterThan(1000);
    // A headline on the log, as the sim would put it.
    (store.game as unknown as { emit: (e: object) => void }).emit({
      kind: 'news',
      at: store.game.now,
      headline: { id: 'x', at: store.game.now, text: 'x' },
    });
    const landed = store.game.now;
    const steps: number[] = [];
    for (let i = 0; i < 14; i++) {
      const before = store.game.now;
      wall += 1000;
      store.pump(wall);
      steps.push(store.game.now - before);
    }
    // For the tail, a pump gives no more than a second; after it, more.
    const slowPumps = steps.filter((s) => s <= 1000).length;
    expect(slowPumps).toBeGreaterThanOrEqual(9);
    expect(slowPumps).toBeLessThanOrEqual(11);
    expect(steps[steps.length - 1]! + (store.game.now - landed)).toBeGreaterThan(WATCH_TAIL);
    expect(steps[steps.length - 1]!).toBeGreaterThan(1000);
  });

  it('does not slow before a headline: a headline in the future changes nothing now', () => {
    const { store } = watchStore();
    jump(store, at(0, 11 * H));
    store.setWatching(true);
    store.pump(0);
    for (let i = 1; i <= 5; i++) {
      const before = store.game.now;
      store.pump(i * 1000);
      expect(store.game.now - before).toBeGreaterThan(1000);
    }
  });

  it('does nothing while held, and does not catch up on release', () => {
    const { store } = watchStore();
    jump(store, at(0, 11 * H));
    store.setWatching(true);
    store.pump(0);
    store.hold(true);
    const now = store.game.now;
    store.pump(1000);
    store.pump(2000);
    expect(store.game.now).toBe(now);
    store.hold(false);
    store.pump(3000);
    expect(store.game.now - now).toBeLessThanOrEqual(1000 * 300);
  });

  it('switches 300×, watch, 1× mid-stretch, each at its own speed', () => {
    const { store } = watchStore();
    jump(store, at(0, 11 * H));
    store.setSpeed(300);
    store.pump(0);
    let b = store.game.now;
    store.pump(100);
    expect(store.game.now - b).toBe(30_000);
    store.setWatching(true);
    expect(store.getWatching()).toBe(true);
    b = store.game.now;
    store.pump(200);
    expect(store.game.now - b).toBe(30_000);
    store.setSpeed(1);
    expect(store.getWatching()).toBe(false);
    b = store.game.now;
    store.pump(1200);
    expect(store.game.now - b).toBe(1000);
  });

  it('does not starve or break the night’s tests: they are pumped in closed hours with the frame’s budget', () => {
    const { store, runner } = watchStore();
    jump(store, at(0, MARKET_CLOSE + 11 * MS_PER_SECOND));
    store.setWatching(true);
    store.pump(0);
    store.pump(1000);
    expect(runner.pumps.length).toBeGreaterThan(0);
    const last = runner.pumps[runner.pumps.length - 1]!;
    expect(last.open).toBe(false);
    expect(last.deadline).toBeDefined();
  });

  it('keeps the choice where the speed is kept: a reload comes back watching, and an old save reads', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
    const a = createStore(CONTENT, storage, 4);
    a.setWatching(true);
    void a.save();
    const b = createStore(CONTENT, storage, 4);
    expect(b.getWatching()).toBe(true);
    b.setSpeed(10);
    const c = createStore(CONTENT, storage, 4);
    expect(c.getWatching()).toBe(false);
    // A save from before watch has no key at all.
    data.delete('propshop.watch.v1');
    expect(createStore(CONTENT, storage, 4).getWatching()).toBe(false);
  });

  it('is watching only while the sim is at the watch speed: a pause ends it', () => {
    const { store } = watchStore();
    store.setWatching(true);
    store.game.setSpeed(0);
    expect(store.getWatching()).toBe(false);
  });

  it('gives the line what is next and what is being watched', () => {
    const { store } = watchStore();
    jump(store, at(0, MARKET_CLOSE - 3 * 60 * MS_PER_SECOND));
    store.setWatching(true);
    store.pump(0);
    store.publish();
    expect(store.getWatchState()).toMatchObject({ on: true, slow: null, next: { kind: 'close' } });
    jump(store, at(0, MARKET_CLOSE - 2000));
    store.pump(1);
    expect(store.getWatchState()).toMatchObject({ on: true, slow: 'moment' });
  });
});
