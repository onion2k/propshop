// The currencies desk, part 5b: its blocks (the triangle and carry), what the view carries for them, the rack at the
// centre and the rival that trades from it, and the stocks' rivals kept out of the pairs. See plans/desk-fx.md.
import { CONTENT } from '../src/content';
import { FX_DESK } from '../src/content/fx';
import { Game, type GameEvent, MS_PER_HOUR, MS_PER_MINUTE, TICK_MS, type SavedGame } from '../src/sim';
import { infrastructureFrom } from '../src/sim/upgrades';
import { blockById, paramsFrom, type Fill, type Intent, type MarketView, type SeenQuote } from '../src/sim/strategy';

function quote(bid: number, ask: number, size = 50): SeenQuote {
  return {
    bid,
    ask,
    bidSize: size,
    askSize: size,
    bid2: bid - 1,
    ask2: ask + 1,
    bid2Size: size,
    ask2Size: size,
    at: 0,
  };
}

const NOW = 10 * MS_PER_HOUR;
const BOOK = 'EASTHOLM';
const DEALER = 'ASHFORD';
/** Ten yen a point of a lot, at 150 yen the dollar: cents. */
const YEN_POINT = 1000 / 150;

/**
 * The euro at 1.0849/1.0850 and the dollar at 149.99/150.00 on both venues, and their cross where the legs put it:
 * the legs' asks multiply to 162.75 exactly, so a cross bid of 162.76 is a pip rich before fees.
 */
function view(
  over: { eurusd?: SeenQuote; usdjpy?: SeenQuote; eurjpy?: SeenQuote; on?: string[] } & Partial<MarketView> = {},
): MarketView {
  const { eurusd, usdjpy, eurjpy, on, ...rest } = over;
  const books = Object.fromEntries(
    (on ?? [BOOK, DEALER]).map((e) => [
      e,
      {
        EURUSD: eurusd ?? quote(10849, 10850),
        USDJPY: usdjpy ?? quote(14999, 15000),
        EURJPY: eurjpy ?? quote(16274, 16276),
      },
    ]),
  );
  return {
    now: NOW,
    symbols: ['EURUSD', 'USDJPY', 'EURJPY'],
    sectors: { EURUSD: 'dollar', USDJPY: 'dollar', EURJPY: 'cross' },
    constituents: {},
    exchanges: ['HARBOR', BOOK, DEALER],
    quotes: { HARBOR: {}, ...books },
    tape: {},
    depth: {},
    fees: { HARBOR: 0.3, [BOOK]: 0.25, [DEALER]: 0 },
    latency: { HARBOR: 30, [BOOK]: 5, [DEALER]: 5 },
    mids: {},
    positions: {},
    blockPositions: {},
    cash: 20_000_000,
    openOrders: [],
    recentFills: [],
    news: [],
    contracts: {},
    pairs: {
      EURUSD: { base: 'EUR', quote: 'USD', units: 100_000, scale: 10, pointValue: 10, venues: [BOOK, DEALER] },
      USDJPY: { base: 'USD', quote: 'JPY', units: 100_000, scale: 10, pointValue: YEN_POINT, venues: [BOOK, DEALER] },
      EURJPY: {
        base: 'EUR',
        quote: 'JPY',
        units: 100_000,
        scale: 10,
        pointValue: YEN_POINT,
        venues: [BOOK, DEALER],
        cross: { legs: ['EURUSD', 'USDJPY'], scale: 0.0001 },
      },
    },
    rollover: { at: 17 * MS_PER_HOUR, spread: 0.005, basis: 360, rates: { USD: 0.045, EUR: 0.03, JPY: 0.005 } },
    ...rest,
  };
}

const orders = (xs: Intent[]) =>
  xs.flatMap((o) => (o.kind === 'order' ? [`${o.side} ${o.size} ${o.symbol}@${o.price} ${o.exchange}`] : []));

const held = (block: string, pos: Record<string, number>) => ({ blockPositions: { [block]: pos }, positions: pos });

function fill(block: string, symbol: string, side: 'buy' | 'sell', price: number, size: number, at: number): Fill {
  return { seq: at, at, localId: at, block, exchange: BOOK, symbol, side, price, size, fee: 0, realised: 0 };
}

describe('the triangle', () => {
  const b = blockById('triangle');
  const p = { ...paramsFrom(b.spec), threshold: 1, lots: 10, venue: 0 };

  it('explains itself and each of its parameters', () => {
    expect(b.spec.explain.length).toBeGreaterThan(100);
    for (const q of b.spec.params) expect(q.explain.length).toBeGreaterThan(10);
  });

  it('does nothing while the cross is where its legs put it', () => {
    expect(b.decide(view({ eurjpy: quote(16274, 16276) }), p)).toEqual([]);
  });

  it('sells a rich cross and buys both legs, three IOC legs on the book, when the gap passes the threshold after fees', () => {
    const out = b.decide(view({ eurjpy: quote(16280, 16282) }), p);
    expect(orders(out)).toEqual([
      'sell 10 EURJPY@16280 EASTHOLM',
      'buy 10 EURUSD@10850 EASTHOLM',
      'buy 11 USDJPY@15000 EASTHOLM',
    ]);
    expect(out.every((o) => o.kind === 'order' && o.ioc)).toBe(true);
  });

  it('buys a cheap cross and sells both legs', () => {
    expect(orders(b.decide(view({ eurjpy: quote(16260, 16262) }), p))).toEqual([
      'buy 10 EURJPY@16262 EASTHOLM',
      'sell 10 EURUSD@10849 EASTHOLM',
      'sell 11 USDJPY@14999 EASTHOLM',
    ]);
  });

  it('sends nothing for a pip on the book, where the fees take a tenth of it; three legs for the pip on the dealer, which charges none', () => {
    // A pip rich before fees: the threshold is a pip.
    const rich = view({ eurjpy: quote(16276, 16277) });
    expect(b.decide(rich, p)).toEqual([]);
    expect(orders(b.decide(rich, { ...p, venue: 1 }))).toEqual([
      'sell 10 EURJPY@16276 ASHFORD',
      'buy 10 EURUSD@10850 ASHFORD',
      'buy 11 USDJPY@15000 ASHFORD',
    ]);
  });

  it('trades on the venue its parameter names, and only there', () => {
    const v = view({ eurjpy: quote(16280, 16282) });
    expect(orders(b.decide(v, { ...p, venue: 1 })).every((o) => o.endsWith(DEALER))).toBe(true);
    expect(orders(b.decide(v, { ...p, venue: 0 })).every((o) => o.endsWith(BOOK))).toBe(true);
  });

  it('sizes in lots, no more than the touch shows on all three', () => {
    const thin = view({ eurjpy: quote(16280, 16282), usdjpy: quote(14999, 15000, 4) });
    expect(orders(b.decide(thin, p))).toEqual([
      'sell 4 EURJPY@16280 EASTHOLM',
      'buy 4 EURUSD@10850 EASTHOLM',
      'buy 4 USDJPY@15000 EASTHOLM',
    ]);
  });

  it('holds a whole triangle, and trades a missed leg back into line with the other two', () => {
    expect(b.decide(view(held('triangle', { EURUSD: 10, USDJPY: 11, EURJPY: -10 })), p)).toEqual([]);
    // The cross missed: the two legs that filled are the triangle, so the cross is sold at the best bid.
    expect(orders(b.decide(view(held('triangle', { EURUSD: 10, USDJPY: 11 })), p))).toEqual([
      'sell 10 EURJPY@16274 EASTHOLM',
    ]);
    // Only one leg filled: it is undone, and no new triangle is opened while it is.
    expect(orders(b.decide(view({ eurjpy: quote(16280, 16282), ...held('triangle', { EURUSD: 10 }) }), p))).toEqual([
      'sell 10 EURUSD@10849 EASTHOLM',
    ]);
  });

  it('sizes the dollar leg by the euro in dollars, so a whole triangle leaves as little yen as whole lots allow', () => {
    // Sell ten lots of the cross at 162.80, buy ten of the euro at 1.0850: 10,850 dollars to cover with USD/JPY.
    const out = b.decide(view({ eurjpy: quote(16280, 16282) }), p);
    const lots = (sym: string) => out.find((o) => o.kind === 'order' && o.symbol === sym) as { size: number };
    expect(lots('USDJPY').size).toBe(11);
    const yenLeft = (usdjpy: number) => 10 * 1000 * 162.8 - usdjpy * 1000 * 150;
    // Eleven lots leave 22,000 yen short; ten would leave 128,000 long. Either way it is within half a lot.
    expect(Math.abs(yenLeft(11))).toBeLessThan(Math.abs(yenLeft(10)));
    expect(Math.abs(yenLeft(lots('USDJPY').size))).toBeLessThanOrEqual(0.5 * 1000 * 150);
    // Over many triangles the dollar leg follows the whole position, not each triangle's rounding: twenty lots
    // of the euro held want 22 of the dollar (21.7), not 11 and 11.
    const more = b.decide(
      view({ eurjpy: quote(16280, 16282), ...held('triangle', { EURUSD: 10, USDJPY: 11, EURJPY: -10 }) }),
      p,
    );
    expect(orders(more)).toEqual([
      'sell 10 EURJPY@16280 EASTHOLM',
      'buy 10 EURUSD@10850 EASTHOLM',
      'buy 11 USDJPY@15000 EASTHOLM',
    ]);
    const thirty = b.decide(
      view({ eurjpy: quote(16280, 16282), ...held('triangle', { EURUSD: 20, USDJPY: 22, EURJPY: -20 }) }),
      p,
    );
    // 30 × 1.0850 = 32.55: 33 in all, so 11 more.
    expect(orders(thirty).at(-1)).toBe('buy 11 USDJPY@15000 EASTHOLM');
    // A dollar leg a lot out from the euro's, as the price wanders, is still a whole triangle; two out is not.
    expect(b.decide(view(held('triangle', { EURUSD: 20, USDJPY: 23, EURJPY: -20 })), p)).toEqual([]);
    expect(orders(b.decide(view(held('triangle', { EURUSD: 20, USDJPY: 24, EURJPY: -20 })), p))).toEqual([
      'sell 2 USDJPY@14999 EASTHOLM',
    ]);
  });

  it('sends nothing while the venues are shut, a missed leg included', () => {
    const shut = { quotes: { HARBOR: {}, [BOOK]: {}, [DEALER]: {} } };
    expect(b.decide(view({ ...shut }), p)).toEqual([]);
    expect(b.decide(view({ ...shut, ...held('triangle', { EURUSD: 10 }) }), p)).toEqual([]);
  });
});

describe('carry', () => {
  const b = blockById('carry');
  const p = { ...paramsFrom(b.spec), lots: 10, stop: 50, wait: 1 };

  it('explains itself and each of its parameters', () => {
    expect(b.spec.explain.length).toBeGreaterThan(100);
    for (const q of b.spec.params) expect(q.explain.length).toBeGreaterThan(10);
  });

  it('buys the pair whose rollover pays most: the dollar against the yen, at these rates', () => {
    expect(orders(b.decide(view(), p))).toEqual(['buy 10 USDJPY@15000 EASTHOLM']);
  });

  it('goes the way the rates say: short the dollar against the yen when the yen pays more', () => {
    const rollover = { at: 17 * MS_PER_HOUR, spread: 0.005, basis: 360, rates: { USD: 0.005, EUR: 0.03, JPY: 0.045 } };
    expect(orders(b.decide(view({ rollover }), p))).toEqual(['sell 10 USDJPY@14999 EASTHOLM']);
  });

  it('holds nothing where no rollover pays after the spread', () => {
    const rollover = { at: 17 * MS_PER_HOUR, spread: 0.005, basis: 360, rates: { USD: 0.01, EUR: 0.01, JPY: 0.01 } };
    expect(b.decide(view({ rollover }), p)).toEqual([]);
  });

  it('holds through the rollover at 17:00', () => {
    const position = { ...held('carry', { USDJPY: 10 }), blockCosts: { carry: { USDJPY: 15000 } } };
    for (const now of [17 * MS_PER_HOUR - MS_PER_MINUTE, 17 * MS_PER_HOUR, 17 * MS_PER_HOUR + MS_PER_MINUTE])
      expect(b.decide(view({ now, ...position }), p)).toEqual([]);
  });

  it('gets out at its stop, so many pips against what it paid', () => {
    const position = { ...held('carry', { USDJPY: 10 }), blockCosts: { carry: { USDJPY: 15000 } } };
    expect(b.decide(view({ usdjpy: quote(14951, 14952), ...position }), p)).toEqual([]);
    expect(orders(b.decide(view({ usdjpy: quote(14950, 14951), ...position }), p))).toEqual([
      'sell 10 USDJPY@14950 EASTHOLM',
    ]);
  });

  it('knows what it paid with the fill log flooded by another block', () => {
    const position = { ...held('carry', { USDJPY: 10 }), blockCosts: { carry: { USDJPY: 15000 } } };
    // The log holds the last 200 fills: the triangle's, every one, and carry's own entry long gone.
    const flood = Array.from({ length: 200 }, (_, i) => fill('triangle', 'EURJPY', 'buy', 16275, 1, NOW - i));
    expect(orders(b.decide(view({ usdjpy: quote(14950, 14951), ...position, recentFills: flood }), p))).toEqual([
      'sell 10 USDJPY@14950 EASTHOLM',
    ]);
  });

  it('waits after a stop before it goes back in', () => {
    const out = [
      fill('carry', 'USDJPY', 'buy', 15000, 10, NOW - 2 * MS_PER_HOUR),
      fill('carry', 'USDJPY', 'sell', 14950, 10, NOW - 10 * MS_PER_MINUTE),
    ];
    expect(b.decide(view({ recentFills: out }), p)).toEqual([]);
    expect(orders(b.decide(view({ now: NOW + MS_PER_HOUR, recentFills: out }), p))).toEqual([
      'buy 10 USDJPY@15000 EASTHOLM',
    ]);
  });

  it('sends nothing while the venues are shut, held or not', () => {
    const shut = { quotes: { HARBOR: {}, [BOOK]: {}, [DEALER]: {} } };
    expect(b.decide(view({ ...shut }), p)).toEqual([]);
    const costs = { blockCosts: { carry: { USDJPY: 15000 } } };
    expect(b.decide(view({ ...shut, ...held('carry', { USDJPY: 10 }), ...costs }), p)).toEqual([]);
  });
});

const viewOf = (g: Game, firm = g.firm) =>
  (firm as unknown as { view(now: number, m: Game['market'], n: []): MarketView }).view(g.now, g.market, []);

describe("the firm's view", () => {
  it('carries each live pair, a cross with its legs, and the rollover rates, once the desk is open', () => {
    const closed = new Game(CONTENT, 2);
    expect(viewOf(closed).pairs ?? {}).toEqual({});
    expect(viewOf(closed).rollover).toBeUndefined();
    const g = new Game(CONTENT, 2);
    g.openDesk(FX_DESK);
    g.stepTicks(1000);
    const v = viewOf(g);
    expect(Object.keys(v.pairs!)).toEqual(['EURUSD', 'USDJPY', 'EURJPY']);
    expect(v.pairs!.EURUSD).toMatchObject({ base: 'EUR', quote: 'USD', units: 100_000, venues: [BOOK, DEALER] });
    expect(v.pairs!.EURUSD!.pointValue).toBe(10);
    expect(v.pairs!.USDJPY!.pointValue).toBeCloseTo(1000 / (g.market.markOf('USDJPY') / 100), 2);
    expect(v.pairs!.EURJPY!.cross?.legs).toEqual(['EURUSD', 'USDJPY']);
    expect(v.pairs!.EURJPY!.cross?.scale).toBeCloseTo(0.0001, 12);
    expect(v.rollover).toEqual({
      at: 17 * MS_PER_HOUR,
      spread: 0.005,
      basis: 360,
      rates: { USD: 0.045, EUR: 0.03, JPY: 0.005 },
    });
  });
});

describe('the desk opening', () => {
  it('gives a firm the triangle and carry, off, and keeps them across a save', () => {
    const g = new Game(CONTENT, 2);
    const ids = () => g.firm.blocks.map((x) => x.id);
    expect(ids()).not.toContain('triangle');
    g.openDesk(FX_DESK);
    expect(ids()).toEqual(expect.arrayContaining(['triangle', 'carry']));
    expect(g.firm.blocks.filter((x) => ['triangle', 'carry'].includes(x.id)).every((x) => !x.enabled)).toBe(true);
    const back = Game.load(CONTENT, JSON.parse(JSON.stringify(g.save())) as SavedGame);
    expect(back.firm.blocks.map((x) => x.id)).toEqual(ids());
  });

  it('offers a rack at the centre, near both venues, once the desk is open', () => {
    const rack = CONTENT.locations.find((l) => l.desk === FX_DESK);
    expect(rack).toBeDefined();
    expect(rack!.distance[BOOK]).toBeLessThan(1);
    expect(rack!.distance[DEALER]).toBeLessThan(1);
    for (const v of CONTENT.exchanges) expect(rack!.distance[v.id]).toBeGreaterThan(0);
    for (const l of CONTENT.locations) {
      expect(l.distance[BOOK]).toBeGreaterThan(0);
      expect(l.distance[DEALER]).toBeGreaterThan(0);
    }
  });

  it('brings in the rival from the rack, running the triangle, when the desk opens and not before', () => {
    const spec = CONTENT.competitors.find((c) => c.desk === FX_DESK);
    expect(spec).toBeDefined();
    const g = new Game(CONTENT, 2);
    const ids = () => g.competitors.map((c) => c.id);
    expect(ids()).not.toContain(`bot:${spec!.id}`);
    g.stepTicks(1000);
    expect(ids()).not.toContain(`bot:${spec!.id}`);
    g.openDesk(FX_DESK);
    expect(ids()).toContain(`bot:${spec!.id}`);
    const rival = g.competitors.find((c) => c.id === `bot:${spec!.id}`)!;
    expect(rival.infra.location.desk).toBe(FX_DESK);
    expect(rival.blocks.map((x) => x.id)).toEqual(['triangle']);
    expect(viewOf(g, rival).symbols).toEqual(expect.arrayContaining(['EURUSD', 'USDJPY', 'EURJPY']));
    const back = Game.load(CONTENT, JSON.parse(JSON.stringify(g.save())) as SavedGame);
    expect(back.competitors.map((c) => c.id)).toEqual(ids());
    expect(
      viewOf(
        back,
        back.competitors.find((c) => c.id === `bot:${spec!.id}`),
      ).symbols,
    ).toEqual(expect.arrayContaining(['EURUSD', 'USDJPY', 'EURJPY']));
  });

  it("keeps the stocks' rivals out of the pairs: none sends an order in one with the desk open", () => {
    const g = new Game(CONTENT, 3);
    g.openDesk(FX_DESK);
    const pairs = ['EURUSD', 'USDJPY', 'EURJPY'];
    const stocksRivals = () =>
      g.competitors.filter((c) => CONTENT.competitors.some((s) => `bot:${s.id}` === c.id && s.desk === undefined));
    for (const r of stocksRivals()) expect(viewOf(g, r).symbols.some((s) => pairs.includes(s))).toBe(false);
    // Monday 06:00: the stocks are shut and the currencies open. The dollar jumps, and the venues and the cross
    // reprice at their own speeds: a stocks rival that saw the pairs would arbitrage them (it did, before 5b).
    g.stepTicks(MS_PER_MINUTE / TICK_MS);
    for (let i = 0; i < 10; i++) {
      g.market.shock('EURUSD', i % 2 ? -20 : 20, 10);
      g.market.shock('USDJPY', i % 2 ? 30 : -30, 10);
      g.stepTicks(30_000 / TICK_MS);
    }
    // The currencies' own rival did trade them.
    expect(g.competitors.find((c) => c.infra.location.desk === FX_DESK)!.fills.length).toBeGreaterThan(0);
    for (const r of stocksRivals()) {
      expect(r.fills.filter((f) => pairs.includes(f.symbol))).toEqual([]);
      expect([...r.orders.values()].filter((o) => pairs.includes(o.symbol))).toEqual([]);
    }
  }, 120_000);
});

/** A game with the currencies open, Monday 06:00: the stocks shut and the pairs trading. */
function fxGame(seed: number, rack = false): Game {
  const g = new Game(CONTENT, seed);
  g.openDesk(FX_DESK);
  if (rack)
    g.firm.infra = infrastructureFrom(CONTENT, { location: 'colo-eastholm', network: 'fibre', computer: 'rack' });
  return g;
}

/** The dollar jumped ten times, half a minute apart: the pairs reprice and the cross and the venues lag. */
function jolt(g: Game) {
  g.stepTicks(MS_PER_MINUTE / TICK_MS);
  for (let i = 0; i < 10; i++) {
    g.market.shock('EURUSD', i % 2 ? -20 : 20, 10);
    g.market.shock('USDJPY', i % 2 ? 30 : -30, 10);
    g.stepTicks(30_000 / TICK_MS);
  }
}

const PAIRS = ['EURUSD', 'USDJPY', 'EURJPY'];

describe("the player's blocks and the desks", () => {
  it("keeps the stocks' blocks to the stocks: momentum, watching the pairs, never trades one", () => {
    const g = fxGame(3, true);
    for (const x of g.firm.blocks) x.enabled = x.id === 'momentum' || x.id === 'meanReversion';
    g.firm.setWatch(PAIRS);
    jolt(g);
    expect([...g.firm.orders.values()].filter((o) => PAIRS.includes(o.symbol))).toEqual([]);
  }, 120_000);

  it("lets a desk's own block trade its desk", () => {
    const g = fxGame(3, true);
    for (const x of g.firm.blocks) x.enabled = x.id === 'triangle';
    g.setBlock('triangle', { params: { threshold: 0 } });
    g.firm.setWatch(PAIRS);
    jolt(g);
    expect([...g.firm.orders.values()].filter((o) => PAIRS.includes(o.symbol)).length).toBeGreaterThan(0);
  }, 120_000);
});

describe("carry's cost", () => {
  it("is kept a block at a time, from the block's own fills, and saved", () => {
    const g = fxGame(5, true);
    for (const x of g.firm.blocks) x.enabled = x.id === 'carry';
    g.firm.setWatch(PAIRS);
    g.stepTicks(MS_PER_MINUTE / TICK_MS);
    const own = g.firm.fills.filter((f) => f.block === 'carry' && f.symbol === 'USDJPY');
    expect(own.length).toBeGreaterThan(0);
    const paid = own.reduce((n, f) => n + f.price * f.size, 0) / own.reduce((n, f) => n + f.size, 0);
    expect(viewOf(g).blockCosts?.carry?.USDJPY).toBeCloseTo(paid, 9);
    // Gone from the log, it is still known; and it comes back from a save.
    g.firm.fills = [];
    expect(viewOf(g).blockCosts?.carry?.USDJPY).toBeCloseTo(paid, 9);
    const back = Game.load(CONTENT, JSON.parse(JSON.stringify(g.save())) as SavedGame);
    expect(viewOf(back).blockCosts?.carry?.USDJPY).toBeCloseTo(paid, 9);
  }, 60_000);

  it('is kept for the pairs alone: a stocks save has none', () => {
    const g = new Game(CONTENT, 6);
    g.skipToOpen();
    g.stepTicks((2 * MS_PER_MINUTE) / TICK_MS);
    expect(g.firm.fills.length).toBeGreaterThan(0);
    expect('blockCosts' in g.save().firm).toBe(false);
  }, 60_000);
});

describe('a gap in a pair', () => {
  it('is written in pips, the fees turned into pips at what a pip of a lot is worth', () => {
    const g = fxGame(3, true);
    for (const x of g.firm.blocks) x.enabled = false;
    g.firm.setWatch(PAIRS);
    jolt(g);
    const euro = g.firm.gapLog.filter((e) => e.symbol === 'EURUSD');
    expect(euro.length).toBeGreaterThan(0);
    // The book charges a quarter of a cent a lot and the dealer nothing; a pip of a lot is ten cents.
    const cost = (venue: string) => (venue === 'EASTHOLM' ? 0.25 : 0) / 10;
    for (const e of euro)
      expect(e.edge).toBe(Math.round((e.bid - e.ask - cost(e.buyOn) - cost(e.sellOn)) * 1000) / 1000);
  }, 120_000);
});

describe('a closed triangle as a moment', () => {
  /** The currencies desk open, the player's blocks off, and the clock mid-session, so a leg can be booked by hand. */
  function fxGame(seed = 4): Game {
    const g = new Game(CONTENT, seed);
    g.openDesk(FX_DESK);
    for (const b of g.firm.blocks) b.enabled = false;
    g.stepTicks(20);
    return g;
  }
  /** One leg of the triangle booked as a fill of the block (the firm's own booking, as an exchange's trade would). */
  function leg(g: Game, symbol: string, side: 'buy' | 'sell', price: number, size: number, block = 'triangle'): void {
    const book = (
      g.firm as unknown as { book(o: object, p: number, n: number, at: number, taker: boolean): void }
    ).book.bind(g.firm);
    book({ localId: 1, block, exchange: BOOK, symbol, side, filled: 0 }, price, size, g.now, true);
  }
  /** The three legs of a rich cross: sell the cross, buy both legs. */
  function rich(g: Game, n = 10): void {
    leg(g, 'EURJPY', 'sell', 16276, n);
    leg(g, 'EURUSD', 'buy', 10850, n);
    leg(g, 'USDJPY', 'buy', 15000, Math.round(n * 1.085));
  }
  const rounds = (g: Game) => g.log.filter((e) => e.kind === 'round');

  it('emits a round when the third leg fills, with what the three legs netted at home, and counts it', () => {
    const g = fxGame();
    const seen: GameEvent[] = [];
    g.on((e) => seen.push(e));
    leg(g, 'EURJPY', 'sell', 16276, 10);
    leg(g, 'EURUSD', 'buy', 10850, 10);
    g.step();
    expect(rounds(g)).toHaveLength(0);
    leg(g, 'USDJPY', 'buy', 15000, 11);
    expect(g.firm.stats.arbRoundTrips).toBe(1);
    g.step();
    const r = seen.filter((e) => e.kind === 'round');
    expect(r).toHaveLength(1);
    const e = r[0]!;
    expect(e.block).toBe('triangle');
    expect(Number.isInteger(e.net)).toBe(true);
    expect(g.firm.stats.arbRoundTrips).toBe(1);
  });

  it('counts a round once, then the next one on its own, and leaves other blocks out', () => {
    const g = fxGame();
    rich(g);
    g.step();
    rich(g);
    g.step();
    expect(rounds(g)).toHaveLength(2);
    expect(g.firm.stats.arbRoundTrips).toBe(2);
    leg(g, 'EURUSD', 'buy', 10850, 1, 'carry');
    leg(g, 'USDJPY', 'buy', 15000, 1, 'carry');
    leg(g, 'EURJPY', 'buy', 16276, 1, 'carry');
    g.step();
    expect(rounds(g)).toHaveLength(2);
  });

  it('is not a round when a lone leg is put back, and the losses of that wait for the next whole one', () => {
    const g = fxGame();
    leg(g, 'EURUSD', 'buy', 10850, 10);
    leg(g, 'EURUSD', 'sell', 10849, 10);
    g.step();
    expect(rounds(g)).toHaveLength(0);
    rich(g);
    g.step();
    expect(rounds(g)).toHaveLength(1);
    const e = rounds(g)[0]!;
    // The undone leg cost the block nothing in the round: the block was flat, so the count started again.
    const clean = fxGame();
    rich(clean);
    clean.step();
    const c = rounds(clean)[0]!;
    expect(e.net).toBe(c.net);
  });

  it('keeps no more events than the log holds, a round among them', () => {
    const g = fxGame();
    for (let i = 0; i < 100; i++) {
      rich(g);
      g.step();
    }
    expect(g.log.length).toBeLessThanOrEqual(200);
    expect(rounds(g).length).toBeGreaterThan(0);
  });

  it('replays the same events and equity for one seed', () => {
    const run = () => {
      const g = fxGame(6);
      rich(g);
      g.stepTicks(50);
      rich(g);
      g.stepTicks(50);
      return g;
    };
    const a = run();
    const b = run();
    expect(rounds(a)).toHaveLength(2);
    expect(JSON.stringify(rounds(b))).toBe(JSON.stringify(rounds(a)));
    expect(b.fingerprint()).toBe(a.fingerprint());
    expect(b.firm.equity(b.market, b.now)).toBe(a.firm.equity(a.market, a.now));
  });

  it('loads from the tick before, two legs in, to the same future and the same round', () => {
    const a = fxGame(7);
    leg(a, 'EURJPY', 'sell', 16276, 10);
    leg(a, 'EURUSD', 'buy', 10850, 10);
    a.step();
    const back = Game.load(CONTENT, JSON.parse(JSON.stringify(a.save())) as SavedGame);
    expect(JSON.stringify(back.save())).toBe(JSON.stringify(a.save()));
    const told: string[][] = [[], []];
    [a, back].forEach((g, i) => g.on((e) => e.kind === 'round' && told[i]!.push(JSON.stringify(e))));
    for (const g of [a, back]) {
      // A tick first: a loaded firm learns the pairs on its first step, as a running game's does before any fill.
      g.step();
      leg(g, 'USDJPY', 'buy', 15000, 11);
      g.stepTicks(30);
    }
    expect(told[0]).toHaveLength(1);
    expect(told[1]).toEqual(told[0]);
    expect(back.fingerprint()).toBe(a.fingerprint());
    expect(back.firm.stats.arbRoundTrips).toBe(1);
  });

  it('loads a save from before the round count, with no state for it', () => {
    const a = fxGame(8);
    const saved = JSON.parse(JSON.stringify(a.save())) as SavedGame;
    expect(saved.firm.rounds).toBeUndefined();
    expect(Game.load(CONTENT, saved).firm.stats.arbRoundTrips).toBe(0);
  });
});
