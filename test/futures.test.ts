import { CONTENT } from '../src/content';
import {
  Game,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_WEEK,
  MS_PER_YEAR,
  daily,
  type Content,
  type ContractSeriesSpec,
  type ExchangeSpec,
  type InstrumentSpec,
} from '../src/sim';
import { Random } from '../src/sim/random';

/** The game's content without its futures desk, so a test's own desk is the only one. */
const STOCKS_ONLY = { ...CONTENT, exchanges: CONTENT.exchanges.filter((e) => e.desk === undefined), series: [] };

const H = MS_PER_HOUR;
const at = (d: number, ms: number) => d * MS_PER_DAY + ms;

const [A, B] = CONTENT.stocks.filter((s) => !s.constituents);
/** A small index over two stocks, so a test steps two books and an index instead of thirteen. */
const IX: InstrumentSpec = {
  symbol: 'IX',
  name: 'Test index',
  sector: 'index',
  constituents: [A!.symbol, B!.symbol],
  startPrice: 0,
  hourlyVol: 0,
  jumpsPerSecond: 0,
  jumpSize: 0,
};

const PRAIRIE: ExchangeSpec = {
  id: 'PRAIRIE',
  name: 'Prairie Board',
  city: 'Prairie',
  feePerShare: 0.5,
  lag: 50,
  noise: 0.5,
  desk: 'futures',
  session: daily(18 * H, 17 * H, [6, 0, 1, 2, 3]),
};

const CARRY = 0.035;
/** Weekly on the index, expiring Mondays at 15:00, so the game's first day sees one expire. */
const XF: ContractSeriesSpec = {
  root: 'XF',
  contract: {
    name: 'Test index future',
    sector: 'index future',
    desk: 'futures',
    kind: 'future',
    underlying: 'IX',
    carry: CARRY,
    multiplier: 100,
    margin: { initial: 0.08, maintenance: 0.06 },
    startPrice: 0,
    hourlyVol: 0,
    jumpsPerSecond: 0,
    jumpSize: 0,
  },
  period: MS_PER_WEEK,
  expiresAt: 15 * H,
  live: 2,
};

const DESK: Content = {
  ...STOCKS_ONLY,
  stocks: [A!, B!, IX],
  exchanges: [...STOCKS_ONLY.exchanges, PRAIRIE],
  locations: CONTENT.locations.map((l) => ({ ...l, distance: { ...l.distance, PRAIRIE: 12 } })),
  series: [XF],
};

const run = (g: Game, until: number) => {
  while (g.now < until) g.step(Math.min(1000, until - g.now));
};
const carried = (g: Game, expiry: number) =>
  g.market.fair.get('IX')! * (1 + (CARRY * Math.max(0, expiry - g.now)) / MS_PER_YEAR);

describe('a future on the index', () => {
  it('is the index carried to its expiry, each tick, and meets the index at expiry', () => {
    const g = new Game(DESK, 4);
    g.openDesk('futures');
    for (const b of g.firm.blocks) b.enabled = false;
    for (const until of [at(0, 7 * H), at(0, 11 * H), at(0, 15 * H) - 2]) {
      run(g, until);
      expect(g.market.fair.get('XF0')).toBeCloseTo(carried(g, at(0, 15 * H)), 9);
      expect(g.market.fair.get('XF1')).toBeCloseTo(carried(g, at(7, 15 * H)), 9);
    }
    // Two weeks out is about twice the basis of one: carry grows with the time to expiry.
    const near = g.market.fair.get('XF0')! - g.market.fair.get('IX')!;
    const far = g.market.fair.get('XF1')! - g.market.fair.get('IX')!;
    expect(near).toBeLessThan(0.01);
    expect(far).toBeGreaterThan(0.5 * g.market.fair.get('IX')! * CARRY * (7 / 365));
  }, 120_000);

  it("draws nothing from its desk's stream", () => {
    const g = new Game(DESK, 4);
    g.openDesk('futures');
    run(g, at(0, 8 * H));
    expect(g.save().streams.desks?.futures).toBe(Random.derive(4, 'world:futures').save());
  }, 120_000);
});

describe('the crowd and the firms on a venue of its own', () => {
  it('quote an instrument on a coarse grid of its own', () => {
    const coarse: InstrumentSpec = {
      symbol: 'CG',
      name: 'Coarse',
      sector: 'coarse',
      desk: 'futures',
      tickSize: 25,
      startPrice: 500_000,
      hourlyVol: 300,
      jumpsPerSecond: 0,
      jumpSize: 0,
    };
    const g = new Game({ ...DESK, stocks: [...DESK.stocks, coarse] }, 4);
    g.openDesk('futures');
    for (const b of g.firm.blocks) b.enabled = false;
    // Real ticks: a step of a second at a time leaves the crowd's books thin.
    g.stepTicks(60_000);
    const q = g.market.venue('PRAIRIE').quote('CG');
    expect(q.bid).not.toBeNull();
    expect(q.ask).not.toBeNull();
    expect(q.bid! % 25).toBe(0);
    expect(q.ask! % 25).toBe(0);
  }, 120_000);

  it("decide while an open desk's venue is open, outside the stocks' hours, and not when none is", () => {
    const decidedAt = (g: Game) => (g.firm as unknown as { lastDecision: number }).lastDecision;
    // The blocks off, so nothing loses its way to the loss limit's halt on the way there.
    const open = new Game(DESK, 4);
    open.openDesk('futures');
    for (const b of open.firm.blocks) b.enabled = false;
    run(open, at(0, 20 * H));
    expect(at(0, 20 * H) - decidedAt(open)).toBeLessThan(1000);
    const closed = new Game(DESK, 4);
    for (const b of closed.firm.blocks) b.enabled = false;
    run(closed, at(0, 20 * H));
    expect(at(0, 20 * H) - decidedAt(closed)).toBeGreaterThan(3 * H);
  }, 120_000);
});

describe('the futures desk in the game', () => {
  it("leads: after a market move the future's book reprices before the index's book at HARBOR", () => {
    const g = new Game(CONTENT, 6);
    g.openDesk('futures');
    for (const b of g.firm.blocks) b.enabled = false;
    g.skipToOpen();
    g.stepTicks((10 * 60_000) / 2);
    const future = g.market.live('IXF')[0]!;
    const prairie = g.market.venue('PRAIRIE');
    const harbor = g.market.venue('HARBOR');
    const mid = (e: typeof prairie, s: string) => e.book(s).mid()!;
    const before = { f: mid(prairie, future), i: mid(harbor, 'IDX') };
    // Every stock up 1% within 10 ms: the index and its future move about 53 cents at once, in fair value.
    for (const s of CONTENT.stocks.filter((x) => !x.constituents))
      g.market.shock(s.symbol, Math.round(g.market.fair.get(s.symbol)! * 0.01), 10);
    const move = g.market.fair.get('IDX')! * 0.01;
    let futureAt: number | null = null;
    let indexAt: number | null = null;
    const start = g.now;
    for (let i = 0; i < 2500 && (futureAt === null || indexAt === null); i++) {
      g.stepTicks(1);
      if (futureAt === null && mid(prairie, future) - before.f > move / 2) futureAt = g.now - start;
      if (indexAt === null && mid(harbor, 'IDX') - before.i > move / 2) indexAt = g.now - start;
    }
    expect(futureAt).not.toBeNull();
    expect(indexAt).not.toBeNull();
    // The lead: the future is half way there in a few hundred milliseconds, the index's book much later.
    expect(futureAt!).toBeLessThan(indexAt! / 2);
  }, 120_000);
});
