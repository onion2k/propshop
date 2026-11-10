// plans/rough-speed.md: the rough fast-forward. The pure chooser of the next step, the sim stepping by it (landing
// where it must), the merged delivery that keeps the races fair inside a rough step, the store's budget counted in
// steps, and what the exact paths are not allowed to touch.
import { readFileSync } from 'node:fs';
import { CONTENT } from '../src/content';
import { WATCH_LEAD, WATCH_TAIL } from '../src/ui/watch';
import {
  Game,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  ROUGH_MS,
  StrideTracker,
  fineWindow,
  type SavedGame,
  TICK_MS,
  strideAt,
  type StrideView,
} from '../src/sim';
import { MARKET_CLOSE, MARKET_OPEN } from '../src/sim/clock';
import { Firm } from '../src/sim/firm';
import { infrastructureFrom } from '../src/sim/upgrades';
import { tick } from '../src/sim/flow';
import { Market } from '../src/sim/market';
import { deriveStreams } from '../src/sim/random';
import { nextCloseIn, nextOpenIn } from '../src/sim/session';
import { createStore } from '../src/ui/store';
import type { JobEvent, NightJob } from '../src/nightjob';
import type { NightRunner } from '../src/ui/nights';
import { EXCHANGES, FAST, SLOW, STOCKS } from './fixtures';

const H = MS_PER_HOUR;
const at = (day: number, time: number) => day * MS_PER_DAY + time;
const GRID = 1_000_000; // a multiple of ROUGH_MS, far from anything

const view = (o: Partial<StrideView> = {}): StrideView => ({
  now: GRID,
  nextAt: null,
  lastMoment: null,
  lastHeadline: null,
  lastAction: null,
  lead: WATCH_LEAD,
  landing: null,
  ...o,
});

/** Minute steps to `until`: a jump of the clock, not of the books. */
function jump(g: Game, until: number) {
  while (g.now < until) g.step(Math.min(MS_PER_MINUTE, until - g.now));
}

/** The game stepped as the store steps it at the top speed: by `strideAt`, to `until`. Returns the times it landed on. */
function rough(g: Game, until: number, tracker = new StrideTracker(g)): Set<number> {
  const landed = new Set<number>();
  while (g.now < until) {
    g.step(Math.min(strideAt(tracker.view(g)), until - g.now));
    landed.add(g.now);
  }
  return landed;
}

/** A game without the headlines already scheduled: the tests of the clock and the stride are not of the news. */
const quiet = (g: Game): Game => {
  g.news.scheduled = [];
  return g;
};

describe('strideAt: the next step', () => {
  it('is exact in a lead: from WATCH_LEAD before a moment', () => {
    expect(strideAt(view({ nextAt: GRID + WATCH_LEAD }))).toBe(TICK_MS);
    expect(strideAt(view({ nextAt: GRID + 3000 }))).toBe(TICK_MS);
    expect(strideAt(view({ nextAt: GRID + 2 }))).toBe(TICK_MS);
  });

  it('is exact in a tail: for WATCH_TAIL after a moment, and after a headline of any kind', () => {
    expect(strideAt(view({ lastMoment: GRID - 9998 }))).toBe(TICK_MS);
    expect(strideAt(view({ lastMoment: GRID - WATCH_TAIL }))).toBe(ROUGH_MS);
    expect(strideAt(view({ lastHeadline: GRID - 9998 }))).toBe(TICK_MS);
    expect(strideAt(view({ lastHeadline: GRID - WATCH_TAIL }))).toBe(ROUGH_MS);
    // Two tails that overlap stay exact until the later one ends.
    expect(strideAt(view({ lastMoment: GRID - 9000, lastHeadline: GRID - 2000 }))).toBe(TICK_MS);
  });

  it('is ROUGH_MS in the quiet, on the ROUGH_MS grid', () => {
    expect(strideAt(view())).toBe(ROUGH_MS);
    expect(strideAt(view({ nextAt: GRID + 60 * MS_PER_MINUTE, lastMoment: GRID - H }))).toBe(ROUGH_MS);
    // Off the grid, the step is the part of the grid cell that is left.
    expect(strideAt(view({ now: GRID + 200 }))).toBe(300);
    expect(strideAt(view({ now: GRID + 498 }))).toBe(2);
  });

  it('is cut to land exactly on the next window, a scheduled headline or a venue edge', () => {
    // The next window starts WATCH_LEAD before the moment.
    expect(strideAt(view({ nextAt: GRID + WATCH_LEAD + 300 }))).toBe(300);
    expect(strideAt(view({ nextAt: GRID + WATCH_LEAD + 480 }))).toBe(480);
    // A headline at its own millisecond; an odd one is landed on the tick that publishes it.
    expect(strideAt(view({ landing: GRID + 120 }))).toBe(120);
    expect(strideAt(view({ landing: GRID + 121 }))).toBe(122);
    expect(strideAt(view({ landing: GRID + 5000 }))).toBe(ROUGH_MS);
    // The nearest of them.
    expect(strideAt(view({ landing: GRID + 400, nextAt: GRID + WATCH_LEAD + 100 }))).toBe(100);
  });

  it('divides what the minute records and the loss check need', () => {
    expect(MS_PER_MINUTE % ROUGH_MS).toBe(0);
    expect(ROUGH_MS % TICK_MS).toBe(0);
    expect(ROUGH_MS).toBe(500);
  });
});

describe('the sim stepped by strideAt', () => {
  it('lands on each scheduled headline at its own millisecond, then goes exact for the tail', () => {
    const g = new Game(CONTENT, 3);
    g.skipToOpen();
    const scheduled = g.news.scheduled.filter((h) => h.at > g.now + 120_000 && h.at < at(0, MARKET_OPEN + 2 * H));
    expect(scheduled.length).toBeGreaterThan(0);
    const heard: number[] = [];
    g.on((e) => {
      if (e.kind === 'news') heard.push(e.at);
    });
    rough(g, at(0, MARKET_OPEN + 2 * H));
    for (const h of scheduled) expect(heard).toContain(Math.ceil(h.at / TICK_MS) * TICK_MS);
  }, 60_000);

  it('steps 2 ms for WATCH_TAIL after a headline, and 500 ms before it again', () => {
    const g = quiet(new Game(CONTENT, 3));
    g.skipToOpen();
    jump(g, at(0, 11 * H));
    const when = at(0, 11 * H) + 7000;
    const company = new Game(CONTENT, 3).news.scheduled.find((h) => h.sector !== null)!;
    g.news.scheduled = [{ ...company, at: when }];
    const tracker = new StrideTracker(g);
    const dts: number[] = [];
    while (g.now < when + WATCH_TAIL + 15_000) {
      const dt = strideAt(tracker.view(g));
      dts.push(dt);
      g.step(dt);
    }
    // The headline landed, and for ten seconds after it every step was a tick; then the stride went rough again.
    const landed = g.log.filter((e) => e.kind === 'news').map((e) => e.at);
    expect(landed).toContain(when);
    const after = dts.slice(dts.length - 10);
    expect(after.every((d) => d === ROUGH_MS)).toBe(true);
    expect(dts.filter((d) => d === TICK_MS).length).toBeGreaterThanOrEqual(WATCH_TAIL / TICK_MS);
  }, 60_000);

  it('lands on the stocks’ close, and the close runs as at fine steps', () => {
    const g = quiet(new Game(CONTENT, 5));
    g.skipToOpen();
    jump(g, at(0, MARKET_CLOSE - 2 * MS_PER_MINUTE));
    const landed = rough(g, at(0, MARKET_CLOSE) + 20 * MS_PER_SECOND);
    expect(landed.has(at(0, MARKET_CLOSE))).toBe(true);
    const close = g.log.find((e) => e.kind === 'close');
    expect(close?.at).toBe(at(0, MARKET_CLOSE));
    expect(g.days).toHaveLength(1);
  }, 60_000);

  it('lands on every venue’s own open and close, with every desk open', () => {
    const g = quiet(new Game(CONTENT, 5));
    for (const d of g.market.desks) g.openDesk(d);
    const sessions = g.market.exchanges.map((e) => e.session).filter((s) => s !== null);
    expect(sessions.length).toBeGreaterThan(0);
    // The edges between day 0 at noon and day 1 at 04:00.
    const from = at(0, 12 * H);
    const to = at(1, 4 * H);
    const edges = new Set<number>();
    for (const s of sessions) {
      for (const next of [nextOpenIn, nextCloseIn]) {
        for (let t = next(s, from); t < to; t = next(s, t)) edges.add(t);
      }
    }
    expect(edges.size).toBeGreaterThan(2);
    jump(g, from - 5 * MS_PER_MINUTE);
    const tracker = new StrideTracker(g);
    const landed = new Set<number>();
    for (const edge of [...edges].sort((a, b) => a - b)) {
      // Close to the edge by minute steps, then rough across it.
      jump(g, edge - 2 * MS_PER_MINUTE);
      for (const t of rough(g, edge + 3000, tracker)) landed.add(t);
    }
    for (const edge of edges) expect(landed.has(edge)).toBe(true);
  }, 120_000);

  it('starts every fix’s call on the ROUGH_MS grid, so a rough step begins it at its own time', () => {
    // A call lasts 30 s, longer than the lead of 5 s, so most of it runs rough: it begins where the stride lands.
    const g = new Game(CONTENT, 5);
    let calls = 0;
    for (const e of g.market.venues) {
      for (const a of e.spec.auctions ?? []) {
        calls++;
        expect((a.at - a.callMs) % ROUGH_MS).toBe(0);
        expect(a.at % ROUGH_MS).toBe(0);
      }
    }
    expect(calls).toBeGreaterThan(0);
  });

  it('replays: the same seed and speed history give the same game, and it is not the exact game', () => {
    const run = () => {
      const g = new Game(CONTENT, 7);
      g.skipToOpen();
      rough(g, at(0, MARKET_OPEN + 20 * MS_PER_MINUTE));
      return g;
    };
    const a = run();
    const b = run();
    expect(b.fingerprint()).toBe(a.fingerprint());
    // The same seed stepped 2 ms at a time becomes a different game: speed changes the game.
    const exact = new Game(CONTENT, 7);
    exact.skipToOpen();
    exact.stepTicks((3 * MS_PER_MINUTE) / TICK_MS);
    const roughly = new Game(CONTENT, 7);
    roughly.skipToOpen();
    rough(roughly, exact.now);
    expect(roughly.now).toBe(exact.now);
    expect(roughly.fingerprint()).not.toBe(exact.fingerprint());
  }, 60_000);

  it('loads a save from the previous step to the same future at the top speed', () => {
    const g = new Game(CONTENT, 9);
    g.skipToOpen();
    const tracker = new StrideTracker(g);
    rough(g, at(0, MARKET_OPEN + 20 * MS_PER_MINUTE), tracker);
    // Wait for a quiet stretch: no moment or headline tail pending, so the window is the same from the game's state.
    while (strideAt(tracker.view(g)) !== ROUGH_MS) g.step(strideAt(tracker.view(g)));
    const saved = JSON.parse(JSON.stringify(g.save())) as SavedGame;
    const loaded = Game.load(CONTENT, saved);
    expect(loaded.fingerprint()).toBe(g.fingerprint());
    const until = g.now + 10 * MS_PER_MINUTE;
    rough(g, until, tracker);
    rough(loaded, until);
    expect(loaded.now).toBe(g.now);
    expect(loaded.fingerprint()).toBe(g.fingerprint());
  }, 60_000);

  it('counts the part of the day that ran rough, in the day’s report', () => {
    const g = quiet(new Game(CONTENT, 5));
    g.skipToOpen();
    jump(g, at(0, MARKET_CLOSE - H));
    rough(g, at(0, MARKET_CLOSE) + 20 * MS_PER_SECOND);
    const day = g.days[0] as { roughMs?: number };
    expect(day.roughMs).toBeGreaterThan(H * 0.9);
    expect(day.roughMs).toBeLessThanOrEqual(H);
    // An exact game counts none, and writes nothing into the report.
    const e = quiet(new Game(CONTENT, 5));
    e.skipToOpen();
    jump(e, at(0, MARKET_CLOSE - 2 * MS_PER_MINUTE));
    e.stepTicks((3 * MS_PER_MINUTE) / TICK_MS);
    expect('roughMs' in (e.days[0] as object)).toBe(false);
  }, 60_000);
});

/** A world of two fixture firms, stepped by `tick` at a chosen dt. */
function world(seed: number, firms: Firm[], from = MARKET_OPEN) {
  const market = new Market(STOCKS, EXCHANGES);
  const random = deriveStreams(
    seed,
    EXCHANGES.map((e) => e.id),
  );
  let now = from;
  const run = (ms: number, dt = TICK_MS) => {
    for (let i = 0; i < ms / dt; i++, now += dt) tick(now, dt, market, firms, random, []);
  };
  return { market, run, now: () => now };
}

describe('a rough step keeps the race fair', () => {
  const MILLION = 100_000_000;
  type Sender = { send: (i: unknown, b: string, now: number, view: unknown) => void };

  /** The player (first in the firms) and a rival send the whole ask at once; the rival is nearer. Who got it? */
  function race(dt: number) {
    const player = new Firm('firm', 'Mine', MILLION, SLOW, Firm.defaultBlocks());
    const rival = new Firm('bot:fast', 'Fast', MILLION, FAST, Firm.defaultBlocks());
    const w = world(21, [player, rival]);
    w.run(2 * MS_PER_SECOND);
    const book = w.market.exchange('HARBOR');
    const q = book.quote('ABC');
    const order = {
      kind: 'order',
      symbol: 'ABC',
      exchange: 'HARBOR',
      side: 'buy',
      price: q.ask!,
      size: q.askSize,
      ioc: true,
    };
    for (const f of [player, rival]) (f as unknown as Sender).send(order, 'test', w.now(), { quotes: {} });
    // The step in which both arrive, then ticks for the fills to come home.
    w.run(2 * dt, dt);
    w.run(200);
    return { player: player.position('ABC'), rival: rival.position('ABC'), size: q.askSize };
  }

  it('hands the nearer rival the liquidity inside one rough step, though the player is stepped first', () => {
    const r = race(ROUGH_MS);
    expect(r.rival).toBeGreaterThan(0.5 * r.size);
    expect(r.player).toBeLessThan(r.rival);
  });

  it('is the same race at 2 ms', () => {
    const r = race(TICK_MS);
    expect(r.rival).toBeGreaterThan(0.5 * r.size);
    expect(r.player).toBeLessThan(r.rival);
  });
});

describe('rollover and storage across rough steps', () => {
  it('each land once at 17:00, whatever the step', () => {
    for (const dt of [ROUGH_MS, 300, MS_PER_MINUTE]) {
      const g = new Game(CONTENT, 4);
      for (const d of g.market.desks) g.openDesk(d);
      jump(g, at(0, 17 * H) - 61_000);
      const roll = vi.spyOn(g, 'rollover');
      const store = vi.spyOn(g as unknown as { storage: () => void }, 'storage');
      // Offset the grid so the step straddles 17:00 rather than landing on it.
      g.step(1001);
      while (g.now < at(0, 17 * H) + 2 * MS_PER_MINUTE) g.step(dt);
      expect(roll).toHaveBeenCalledTimes(1);
      expect(store).toHaveBeenCalledTimes(1);
    }
  }, 120_000);
});

describe('what stays exact', () => {
  it('the experiments, the night’s tests and the microscope do not use the stride', () => {
    for (const file of ['src/sim/experiment.ts', 'src/sim/backtest.ts', 'src/nightjob.ts', 'src/backtest.worker.ts']) {
      const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      expect(text, file).not.toMatch(/strideAt|ROUGH_MS|StrideTracker/);
    }
  });

  it('step() with no argument is one tick, and stepTicks stays exact', () => {
    const g = new Game(CONTENT, 1);
    g.skipToOpen();
    const before = g.now;
    g.step();
    expect(g.now - before).toBe(TICK_MS);
    g.stepTicks(10);
    expect(g.now - before).toBe(11 * TICK_MS);
  });
});

class NullRunner implements NightRunner {
  start(_job: NightJob, _on: (e: JobEvent) => void) {}
  cancel() {}
}

describe('the store counts rough steps against the budget', () => {
  /** A store whose clock is charged `cost` ms for each `game.step`; at 11:00 on a quiet first day. */
  function costed(cost: number) {
    let t = 0;
    const store = createStore(CONTENT, null, 4, () => t, new NullRunner());
    const game = store.game;
    quiet(game);
    jump(game, at(0, 11 * H));
    store.publish();
    const step = game.step.bind(game);
    let steps = 0;
    game.step = (dt?: number) => {
      steps++;
      t += cost;
      step(dt);
    };
    return { store, game, steps: () => steps, reset: () => (steps = 0) };
  }

  it('buys about ROUGH_MS / TICK_MS times the simulated time for the same steps, at 300×', () => {
    const { store, game, steps, reset } = costed(1);
    store.setSpeed(300);
    store.pump(0);
    const before = game.now;
    reset();
    store.pump(16);
    const gained = game.now - before;
    const ran = steps();
    expect(ran).toBeGreaterThan(0);
    // Eight steps of a millisecond fill the 8 ms budget: the exact stepper would have covered ran × TICK_MS.
    expect(gained / (ran * TICK_MS)).toBeGreaterThan(0.9 * (ROUGH_MS / TICK_MS));
    expect(gained).toBeLessThanOrEqual(16 * 300);
  });

  it('is held to the speed asked when steps are cheap: 300× of the wall time, no more', () => {
    const { store, game, reset } = costed(0.0001);
    store.setSpeed(300);
    store.pump(0);
    const before = game.now;
    reset();
    store.pump(16);
    expect(game.now - before).toBe(16 * 300);
  });

  it('keeps the other speeds exact: 60× steps every 2 ms', () => {
    const { store, game, steps, reset } = costed(0.0001);
    store.setSpeed(60);
    store.pump(0);
    const before = game.now;
    reset();
    store.pump(16);
    expect(game.now - before).toBe(16 * 60);
    expect(steps()).toBe((16 * 60) / TICK_MS);
  });

  it('says which it is: rough in the quiet, exact in a window, nothing off the top speed', () => {
    const { store, game } = costed(0.0001);
    expect(store.getStride()).toBe(null);
    store.setSpeed(300);
    store.pump(0);
    store.pump(16);
    expect(store.getStride()).toBe('rough');
    // Into the lead of the close.
    jump(game, at(0, MARKET_CLOSE) - 3000);
    store.publish();
    expect(store.getStride()).toBe('exact');
    store.setSpeed(60);
    expect(store.getStride()).toBe(null);
  });
});

describe('the player acting opens a window', () => {
  it('is exact for WATCH_TAIL after an action, and rough again after', () => {
    expect(strideAt(view({ lastAction: GRID - 9998 }))).toBe(TICK_MS);
    expect(strideAt(view({ lastAction: GRID - WATCH_TAIL }))).toBe(ROUGH_MS);
    expect(fineWindow(GRID, null, null, null, GRID - 3000).slow).toBe('action');
    expect(fineWindow(GRID, null, null, null, GRID - 3000).until).toBe(GRID - 3000 + WATCH_TAIL);
  });

  it('is opened by a hand order, a block switched on and a parameter changed, through the store', () => {
    for (const act of [
      (s: ReturnType<typeof createStore>) => s.setBlock('momentum', { enabled: true }),
      (s: ReturnType<typeof createStore>) => s.setBlock('momentum', { params: { size: 100 } }),
      (s: ReturnType<typeof createStore>) =>
        void s.hand({ symbol: 'QNT', side: 'buy', size: 100, exchange: 'best', type: 'market' }),
    ]) {
      const store = createStore(CONTENT, null, 4, () => 0, new NullRunner());
      quiet(store.game);
      jump(store.game, at(0, 11 * H));
      store.publish();
      store.setSpeed(300);
      store.pump(0);
      store.pump(16);
      expect(store.getStride()).toBe('rough');
      act(store);
      expect(store.getStride()).toBe('exact');
      // Ten seconds of simulated time later (a pump of 40 ms at 300×) the window has closed.
      store.pump(16 + 40);
      store.pump(16 + 80);
      expect(store.getStride()).toBe('rough');
    }
  });
});

describe('a fix’s whole call is exact', () => {
  it('is exact from callMs before the fix, not only the lead', () => {
    const g = quiet(new Game(CONTENT, 5));
    for (const d of g.market.desks) g.openDesk(d);
    const fix = g.market.exchanges.find((e) => e.spec.auctions)!.spec.auctions!.find((a) => a.at > 8 * H)!;
    const callAt = at(0, fix.at - fix.callMs);
    jump(g, callAt - 2 * MS_PER_MINUTE);
    const tracker = new StrideTracker(g);
    while (g.now < callAt - 1000) g.step(Math.min(strideAt(tracker.view(g)), callAt - 1000 - g.now));
    expect(strideAt(tracker.view(g))).toBeGreaterThan(TICK_MS);
    g.step(1000);
    // Inside the call, 25 s before the fix: well outside the lead, and exact.
    expect(g.nextMoment()!.at).toBe(at(0, fix.at));
    expect(strideAt(tracker.view(g))).toBe(TICK_MS);
  });
});

describe('the last moment is read from the game, not from what was watched', () => {
  it('knows a fix that came while another speed was running, when a tracker is made just after', () => {
    const g = quiet(new Game(CONTENT, 5));
    for (const d of g.market.desks) g.openDesk(d);
    const fix = g.market.exchanges.find((e) => e.spec.auctions)!.spec.auctions!.find((a) => a.at > 8 * H)!;
    jump(g, at(0, fix.at) + 3000);
    expect(g.lastMomentAt()).toBe(at(0, fix.at));
    const late = new StrideTracker(g);
    expect(strideAt(late.view(g))).toBe(TICK_MS);
    jump(g, at(0, fix.at) + WATCH_TAIL + 2000);
    expect(strideAt(new StrideTracker(g).view(g))).toBeGreaterThan(TICK_MS);
  });

  it('knows an expiry, a release and the open', () => {
    const g = quiet(new Game(CONTENT, 5));
    for (const d of g.market.desks) g.openDesk(d);
    // A market-wide release the game published.
    const release = new Game(CONTENT, 5).news.scheduled.find((h) => h.sector === null)!;
    g.news.scheduled = [{ ...release, at: at(0, 6.5 * H) }];
    jump(g, at(0, 6.5 * H) + 1000);
    expect(g.news.published.some((h) => h.sector === null)).toBe(true);
    expect(g.lastMomentAt()).toBe(at(0, 6.5 * H));
    // An expiry: the soonest contract's.
    const expiry = g.market.nextExpiry;
    jump(g, expiry + 1000);
    expect(g.lastMomentAt()).toBe(expiry);
  });
});

describe('the blocks sleep in a rough step', () => {
  const busy = (seed: number) => {
    const g = quiet(new Game(CONTENT, seed));
    g.firm.infra = infrastructureFrom(CONTENT, { location: 'colo-harbor', network: 'microwave', computer: 'rack' });
    for (const b of g.firm.blocks) b.enabled = ['arbitrage', 'marketMaker'].includes(b.id);
    g.skipToOpen();
    g.stepTicks((3 * MS_PER_MINUTE) / TICK_MS);
    return g;
  };
  const everyFirm = (g: Game) => [g.firm, ...g.competitors];
  const resting = (g: Game) => {
    const ids = new Set(everyFirm(g).map((f) => f.id));
    let n = 0;
    for (const e of g.market.exchanges)
      for (const s of g.market.instruments) {
        if (!e.lists(s.symbol)) continue;
        for (const o of e.book(s.symbol).resting()) if (ids.has(o.owner)) n++;
      }
    return n;
  };

  it('decides and sends nothing while the steps are rough, firms and rivals alike', () => {
    const g = busy(3);
    expect(g.firm.stats.ordersSent).toBeGreaterThan(0);
    const before = everyFirm(g).map((f) => f.stats.ordersSent);
    for (let i = 0; i < 240; i++) g.step(ROUGH_MS);
    expect(everyFirm(g).map((f) => f.stats.ordersSent)).toEqual(before);
  });

  it('pulls what rests, and returns it to its owner, so nothing of a firm rests through the quiet', () => {
    const g = busy(3);
    expect(resting(g)).toBeGreaterThan(0);
    // Two rough steps: the first to see the orders still on the wire answered, the next to pull what rested.
    for (let i = 0; i < 4; i++) g.step(ROUGH_MS);
    expect(resting(g)).toBe(0);
    const open = [g.firm, ...g.competitors].flatMap((f) =>
      [...f.orders.values()].filter((o) => o.status === 'resting' || o.status === 'cancelling'),
    );
    expect(open.length).toBe(0);
  });

  it('keeps the position through the quiet, marked as now, and wakes at the next exact step', () => {
    const g = busy(3);
    for (let i = 0; i < 4; i++) g.step(ROUGH_MS);
    const held = g.firm.position('QNT');
    const equity = g.firm.equity(g.market, g.now);
    for (let i = 0; i < 40; i++) g.step(ROUGH_MS);
    expect(g.firm.position('QNT')).toBe(held);
    expect(Number.isFinite(g.firm.equity(g.market, g.now))).toBe(true);
    expect(g.firm.equity(g.market, g.now)).not.toBe(equity);
    const sent = g.firm.stats.ordersSent + g.competitors.reduce((n, c) => n + c.stats.ordersSent, 0);
    g.stepTicks(2000);
    expect(g.firm.stats.ordersSent + g.competitors.reduce((n, c) => n + c.stats.ordersSent, 0)).toBeGreaterThan(sent);
  });

  it('answers a message that was on the wire when the rough stretch began', () => {
    const player = new Firm('firm', 'Mine', 100_000_000, SLOW, Firm.defaultBlocks());
    const w = world(21, [player]);
    w.run(2 * MS_PER_SECOND);
    const q = w.market.exchange('HARBOR').quote('ABC');
    (player as unknown as { send: (i: unknown, b: string, now: number, view: unknown) => void }).send(
      { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'buy', price: q.ask!, size: 100, ioc: true },
      'test',
      w.now(),
      { quotes: {} },
    );
    w.run(2 * ROUGH_MS, ROUGH_MS);
    w.run(ROUGH_MS, ROUGH_MS);
    const order = [...player.orders.values()][0]!;
    expect(order.status).not.toBe('inflight');
    expect(order.arrivedAt).not.toBeNull();
  });

  it('is the same game at the same speed history', () => {
    const run = () => {
      const g = busy(3);
      rough(g, g.now + 5 * MS_PER_MINUTE);
      return g;
    };
    expect(run().fingerprint()).toBe(run().fingerprint());
  }, 60_000);
});
