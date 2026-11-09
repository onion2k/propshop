// The metals desk, part 6d: its blocks (the curve, the fix and pairs across desks), the racks at Thamesford and
// Hudson, the rival that rests into the fix from Thamesford, and the mark that reads whichever spot venue is open.
// See plans/desk-metals.md.
import { vi } from 'vitest';
import { CONTENT } from '../src/content';
import { METALS_DESK } from '../src/content/metals';
import { COLO_EASTHOLM } from '../src/content/fx';
import { Game, MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND, TICK_MS, type SavedGame } from '../src/sim';
import { infrastructureFrom } from '../src/sim/upgrades';
import {
  DESK_BLOCKS,
  blockById,
  carryFactor,
  paramsFrom,
  type ContractView,
  type Fill,
  type Intent,
  type MarketView,
  type OpenOrder,
  type SeenQuote,
} from '../src/sim/strategy';

const H = MS_PER_HOUR;
/** Simulated ms at a weekday (Monday 0) and a time of day, in the game's first week. */
const at = (weekday: number, time: number) => weekday * MS_PER_DAY + time;

function quote(bid: number | null, ask: number | null, size = 20): SeenQuote {
  return {
    bid,
    ask,
    bidSize: size,
    askSize: size,
    bid2: bid === null ? null : bid - 1,
    ask2: ask === null ? null : ask + 1,
    bid2Size: size,
    ask2Size: size,
    at: 0,
  };
}

const orders = (xs: Intent[]) =>
  xs.flatMap((o) =>
    o.kind === 'order' ? [`${o.side} ${o.size} ${o.symbol}@${o.price} ${o.exchange}${o.ioc ? '' : ' rest'}`] : [],
  );
const cancels = (xs: Intent[]) => xs.flatMap((o) => (o.kind === 'cancel' ? [o.localId] : []));

const held = (block: string, pos: Record<string, number>) => ({ blockPositions: { [block]: pos }, positions: pos });

function fill(block: string, symbol: string, side: 'buy' | 'sell', price: number, size: number, t: number): Fill {
  return { seq: t, at: t, localId: t, block, exchange: 'THAMESFORD', symbol, side, price, size, fee: 0, realised: 0 };
}

function resting(block: string, symbol: string, side: 'buy' | 'sell', price: number, size: number): OpenOrder {
  return {
    localId: 77,
    exchange: 'THAMESFORD',
    exchangeOrderId: 5,
    symbol,
    side,
    price,
    size,
    filled: 0,
    ioc: false,
    status: 'resting',
    block,
    sentAt: 0,
    seenAt: 0,
    arrivedAt: 1,
    ackAt: 2,
    beatenBy: [],
  };
}

/** Gold's weekly futures as the game lists them: Friday 13:30, a week apart, at the content's carry. */
const E0 = at(4, 13.5 * H);
const CARRY = 0.047;
function gold(carry = CARRY): Record<string, ContractView> {
  return {
    GC0: { underlying: 'XAU', expiry: E0, carry, multiplier: 10 },
    GC1: { underlying: 'XAU', expiry: E0 + 7 * MS_PER_DAY, carry, multiplier: 10 },
    GC2: { underlying: 'XAU', expiry: E0 + 14 * MS_PER_DAY, carry, multiplier: 10 },
  };
}

const SPOT = 24000;
/** A contract's fair price at the spot, now. */
const fair = (c: ContractView, now: number, spot = SPOT) => Math.round(spot * carryFactor(c, now));

function base(now: number, rest: Partial<MarketView>): MarketView {
  return {
    now,
    symbols: ['RDG', 'XAU', 'XAG', 'GC0', 'GC1', 'GC2'],
    sectors: { RDG: 'mining', XAU: 'precious', XAG: 'precious', GC0: 'gold future', GC1: 'gold future' },
    constituents: {},
    exchanges: ['HARBOR', 'SUNDAR', 'THAMESFORD', 'HUDSON'],
    quotes: {},
    tape: {},
    depth: {},
    fees: { HARBOR: 0.3, SUNDAR: 1, THAMESFORD: 1.5, HUDSON: 1 },
    latency: { HARBOR: 30, SUNDAR: 52, THAMESFORD: 5, HUDSON: 28 },
    mids: {},
    positions: {},
    blockPositions: {},
    scales: { XAU: 100, XAG: 500, GC0: 100, GC1: 100, GC2: 100 },
    cash: 20_000_000,
    openOrders: [],
    recentFills: [],
    news: [],
    contracts: gold(),
    ...rest,
  };
}

describe('the metals blocks', () => {
  it('are the desk s, each explained, with every parameter explained', () => {
    expect(DESK_BLOCKS.metals).toEqual(['curve', 'fixArb', 'crossPairs']);
    for (const id of DESK_BLOCKS.metals!) {
      const b = blockById(id);
      expect(b.spec.explain.length).toBeGreaterThan(100);
      for (const q of b.spec.params) expect(q.explain.length).toBeGreaterThan(10);
    }
  });
});

describe('the curve', () => {
  const b = blockById('curve');
  const p = { ...paramsFrom(b.spec), threshold: 3, stop: 10, contracts: 1, exitBefore: 24 };
  const NOW = at(0, 10 * H);
  const c = gold();
  const f0 = fair(c.GC0!, NOW);
  const f1 = fair(c.GC1!, NOW);
  const f2 = fair(c.GC2!, NOW);
  const curve = (q1: SeenQuote, rest: Partial<MarketView> = {}, q0 = quote(f0 - 1, f0 + 1), now = NOW) =>
    base(now, { quotes: { HUDSON: { GC0: q0, GC1: q1, GC2: quote(f2 - 1, f2 + 1) } }, ...rest });

  it('does nothing while the spread is what the carry implies', () => {
    expect(b.decide(curve(quote(f1 - 1, f1 + 1)), p)).toEqual([]);
  });

  it('sells the next expiry and buys the near when the spread is wider than the carry implies', () => {
    expect(orders(b.decide(curve(quote(f1 + 12, f1 + 14)), p)).sort()).toEqual(
      [`buy 1 GC0@${f0 + 1} HUDSON`, `sell 1 GC1@${f1 + 12} HUDSON`].sort(),
    );
  });

  it('buys the next and sells the near when the spread is narrower', () => {
    expect(orders(b.decide(curve(quote(f1 - 14, f1 - 12)), p)).sort()).toEqual(
      [`sell 1 GC0@${f0 - 1} HUDSON`, `buy 1 GC1@${f1 - 12} HUDSON`].sort(),
    );
  });

  it('reads the carry now: the same prices are no trade at a carry that makes them fair', () => {
    // A lease fallen by 3.3% a year lifts the carry, and the next week's contract is that much dearer by right.
    expect(b.decide(curve(quote(f1 + 12, f1 + 14), { contracts: gold(CARRY + 0.033) }), p)).toEqual([]);
  });

  it('holds while the spread is between back and its stop', () => {
    expect(b.decide(curve(quote(f1 + 8, f1 + 10), held('curve', { GC0: 1, GC1: -1 })), p)).toEqual([]);
  });

  it('is out of both once the spread is back', () => {
    expect(orders(b.decide(curve(quote(f1, f1 + 1), held('curve', { GC0: 1, GC1: -1 })), p)).sort()).toEqual(
      [`sell 1 GC0@${f0 - 1} HUDSON`, `buy 1 GC1@${f1 + 1} HUDSON`].sort(),
    );
  });

  it('is out of both at its stop, when the curve has moved further against it', () => {
    expect(orders(b.decide(curve(quote(f1 + 40, f1 + 42), held('curve', { GC0: 1, GC1: -1 })), p)).sort()).toEqual(
      [`sell 1 GC0@${f0 - 1} HUDSON`, `buy 1 GC1@${f1 + 42} HUDSON`].sort(),
    );
  });

  it('is out before the near one s expiry, and trades the next two expiries instead', () => {
    const late = E0 - 12 * H;
    const l0 = fair(c.GC0!, late);
    const l1 = fair(c.GC1!, late);
    const l2 = fair(c.GC2!, late);
    const quotes = (q2: SeenQuote) => ({
      HUDSON: { GC0: quote(l0 - 1, l0 + 1), GC1: quote(l1 - 1, l1 + 1), GC2: q2 },
    });
    // Held into the window: out, though the spread has not come back.
    const out = b.decide(
      base(late, { quotes: quotes(quote(l2 - 1, l2 + 1)), ...held('curve', { GC0: 1, GC1: -1 }) }),
      p,
    );
    expect(orders(out).sort()).toEqual([`sell 1 GC0@${l0 - 1} HUDSON`, `buy 1 GC1@${l1 + 1} HUDSON`].sort());
    // Flat in the window: the near one is left alone, and the next two are the spread.
    expect(orders(b.decide(base(late, { quotes: quotes(quote(l2 + 12, l2 + 14)) }), p)).sort()).toEqual(
      [`buy 1 GC1@${l1 + 1} HUDSON`, `sell 1 GC2@${l2 + 12} HUDSON`].sort(),
    );
  });

  it('scratches a leg left alone when the far one missed', () => {
    expect(orders(b.decide(curve(quote(f1 + 12, f1 + 14), held('curve', { GC0: 1 })), p))).toEqual([
      `sell 1 GC0@${f0 - 1} HUDSON`,
    ]);
  });

  it('waits while a leg is in flight', () => {
    const inflight = { ...resting('curve', 'GC1', 'sell', f1 + 12, 1), status: 'inflight' as const };
    expect(b.decide(curve(quote(f1 + 12, f1 + 14), { openOrders: [inflight] }), p)).toEqual([]);
  });
});

describe('the fix arbitrage', () => {
  const b = blockById('fixArb');
  const p = { ...paramsFrom(b.spec), threshold: 5, lots: 2, unwindAfter: 120 };
  const FIX = at(0, 10 * H);
  const NOW = FIX - 15 * MS_PER_SECOND;
  const c = gold();
  const fut = fair(c.GC0!, NOW);
  /** The spot Hudson's front future implies, unwound by its carry. */
  const implied = fut / carryFactor(c.GC0!, NOW);
  const call = (price: number | null, rest: Partial<MarketView> = {}, futQ = quote(fut - 1, fut + 1), now = NOW) =>
    base(now, {
      quotes: {
        // In the call the book is crossed: the crowd rests at its limits.
        THAMESFORD: {
          XAU: { ...quote(24010, 23990), indicative: { price, volume: price === null ? 0 : 40, fixAt: FIX } },
        },
        HUDSON: { GC0: futQ, GC1: quote(fair(c.GC1!, now) - 1, fair(c.GC1!, now) + 1) },
      },
      ...rest,
    });
  const after = (spot: SeenQuote, rest: Partial<MarketView> = {}, now = FIX + 5 * MS_PER_SECOND) =>
    base(now, {
      quotes: {
        THAMESFORD: { XAU: spot },
        HUDSON: { GC0: quote(fut - 1, fut + 1) },
      },
      ...rest,
    });

  it('does nothing outside a call', () => {
    expect(b.decide(after(quote(23990, 23991)), p)).toEqual([]);
  });

  it('rests a buy into the fix when the indicative is cheap against the future, at no more than its edge', () => {
    const out = b.decide(call(23980), p);
    expect(out).toHaveLength(1);
    const o = out[0]!;
    expect(o).toMatchObject({ kind: 'order', symbol: 'XAU', exchange: 'THAMESFORD', side: 'buy', size: 2, ioc: false });
    if (o.kind !== 'order') throw new Error('an order');
    expect(o.price).toBeGreaterThanOrEqual(23980);
    expect(o.price).toBeLessThanOrEqual(implied * (1 - 5 / 10_000));
  });

  it('rests a sell into the fix when the indicative is rich', () => {
    const out = b.decide(call(24020), p);
    expect(out).toHaveLength(1);
    const o = out[0]!;
    expect(o).toMatchObject({
      kind: 'order',
      symbol: 'XAU',
      exchange: 'THAMESFORD',
      side: 'sell',
      size: 2,
      ioc: false,
    });
    if (o.kind !== 'order') throw new Error('an order');
    expect(o.price).toBeLessThanOrEqual(24020);
    expect(o.price).toBeGreaterThanOrEqual(implied * (1 + 5 / 10_000));
  });

  it('does nothing within the threshold', () => {
    expect(b.decide(call(23995), p)).toEqual([]);
    expect(b.decide(call(24006), p)).toEqual([]);
  });

  it('does nothing when the fix would not cross', () => {
    expect(b.decide(call(null), p)).toEqual([]);
  });

  it('does nothing when its order could not reach the venue before the fix', () => {
    expect(b.decide(call(23980, { latency: { ...base(NOW, {}).latency, THAMESFORD: 16_000 } }), p)).toEqual([]);
  });

  it('keeps its resting order while the edge stands, and pulls it once the future has moved it away', () => {
    const mine = resting('fixArb', 'XAU', 'buy', 23985, 2);
    expect(b.decide(call(23983, { openOrders: [mine] }), p)).toEqual([]);
    const lower = fut - 30;
    expect(cancels(b.decide(call(23983, { openOrders: [mine] }, quote(lower - 1, lower + 1)), p))).toEqual([77]);
  });

  it('hedges in the front future what the fix filled, and no more', () => {
    const t = FIX;
    const filled = { recentFills: [fill('fixArb', 'XAU', 'buy', 23985, 2, t)], ...held('fixArb', { XAU: 2 }) };
    expect(orders(b.decide(after(quote(23970, 23972), filled), p))).toEqual([`sell 2 GC0@${fut - 1} HUDSON`]);
    const part = { recentFills: [fill('fixArb', 'XAU', 'buy', 23985, 2, t)], ...held('fixArb', { XAU: 2, GC0: -1 }) };
    expect(orders(b.decide(after(quote(23970, 23972), part), p))).toEqual([`sell 1 GC0@${fut - 1} HUDSON`]);
    // Nothing filled: nothing to hedge.
    expect(b.decide(after(quote(23970, 23972)), p)).toEqual([]);
  });

  it('pulls what is left of its order once the fix is done', () => {
    const left = resting('fixArb', 'XAU', 'buy', 23988, 2);
    expect(cancels(b.decide(after(quote(23970, 23972), { openOrders: [left] }), p))).toEqual([77]);
  });

  it('unwinds both legs once the spot is back by the future, or at the latest after its wait', () => {
    const t = FIX;
    const both = (fills: Fill[]) => ({ recentFills: fills, ...held('fixArb', { XAU: 2, GC0: -2 }) });
    const s = Math.round(implied);
    // Back: sell the metal on the book and buy back the future.
    expect(
      orders(b.decide(after(quote(s - 1, s), both([fill('fixArb', 'XAU', 'buy', 23985, 2, t)])), p)).sort(),
    ).toEqual([`sell 2 XAU@${s - 1} THAMESFORD`, `buy 2 GC0@${fut + 1} HUDSON`].sort());
    // Not back, and filled a moment ago: held.
    expect(b.decide(after(quote(23970, 23972), both([fill('fixArb', 'XAU', 'buy', 23985, 2, t)])), p)).toEqual([]);
    // Not back, but the wait is over: out.
    const late = FIX + 121 * MS_PER_SECOND;
    expect(
      orders(b.decide(after(quote(23970, 23972), both([fill('fixArb', 'XAU', 'buy', 23985, 2, t)]), late), p)).sort(),
    ).toEqual([`sell 2 XAU@23970 THAMESFORD`, `buy 2 GC0@${fut + 1} HUDSON`].sort());
  });

  it('buys back a hedge left alone when the metal has gone', () => {
    expect(orders(b.decide(after(quote(23970, 23972), held('fixArb', { GC0: -2 })), p))).toEqual([
      `buy 2 GC0@${fut + 1} HUDSON`,
    ]);
  });

  it('sends no IOC to a venue in its call: the metal waits, the hedge does not', () => {
    const inCall = call(24000, { recentFills: [], ...held('fixArb', { XAU: 2 }) });
    expect(orders(b.decide(inCall, p))).toEqual([`sell 2 GC0@${fut - 1} HUDSON`]);
  });
});

describe('pairs across desks', () => {
  const b = blockById('crossPairs');
  const p = { ...paramsFrom(b.spec), lookback: 10, threshold: 20, lots: 1, hold: 5, newsPause: 60 };
  const NOW = at(0, 10 * H);
  const flat = (n: number, v: number) => Array.from({ length: n }, () => v);
  const view = (mids: Record<string, number[]>, rest: Partial<MarketView> = {}) =>
    base(NOW, {
      mids,
      quotes: {
        HARBOR: { RDG: quote(4599, 4601, 5000) },
        THAMESFORD: { XAU: quote(23999, 24001), XAG: quote(2999, 3001) },
      },
      ...rest,
    });

  it('sets the miner against gold by default, and gold against silver by its choice', () => {
    const legs = b.spec.params.find((x) => x.key === 'legs')!;
    expect(legs.choices).toEqual(['the miner and gold', 'gold and silver']);
    expect(paramsFrom(b.spec).legs).toBe(0);
  });

  it('sells the miner and buys gold when the miner has run ahead, a leg each of the same value', () => {
    const out = b.decide(view({ RDG: [...flat(9, 4500), 4600], XAU: flat(10, 24000) }), p);
    // One lot of gold is 24,000 points of ten cents times ten ounces: $24,000, or 522 shares at $46.
    expect(orders(out).sort()).toEqual(['sell 522 RDG@4599 HARBOR', 'buy 1 XAU@24001 THAMESFORD'].sort());
  });

  it('buys the miner and sells gold the other way', () => {
    const out = b.decide(view({ RDG: [...flat(9, 4700), 4600], XAU: flat(10, 24000) }), p);
    expect(orders(out).sort()).toEqual(['buy 522 RDG@4601 HARBOR', 'sell 1 XAU@23999 THAMESFORD'].sort());
  });

  it('trades the gold-silver ratio when set to it', () => {
    const out = b.decide(view({ XAU: [...flat(9, 24000), 24300], XAG: flat(10, 3000) }), { ...p, legs: 1 });
    // A lot of silver is $15,000: two lots against one of gold.
    expect(orders(out).sort()).toEqual(['sell 1 XAU@23999 THAMESFORD', 'buy 2 XAG@3001 THAMESFORD'].sort());
  });

  it('does nothing in line, or without enough of both legs seen', () => {
    expect(b.decide(view({ RDG: flat(10, 4600), XAU: flat(10, 24000) }), p)).toEqual([]);
    expect(b.decide(view({ RDG: [...flat(8, 4500), 4600], XAU: flat(9, 24000) }), p)).toEqual([]);
  });

  it('closes both once the ratio is back', () => {
    const out = b.decide(
      view({ RDG: flat(10, 4600), XAU: flat(10, 24000) }, held('crossPairs', { RDG: -522, XAU: 1 })),
      p,
    );
    expect(orders(out).sort()).toEqual(['buy 522 RDG@4601 HARBOR', 'sell 1 XAU@23999 THAMESFORD'].sort());
  });

  it('steps out when a headline names either leg', () => {
    const news: MarketView['news'] = [
      { id: 1, at: NOW - 1000, text: 'Ridgeline strikes gold', symbols: ['RDG'], sector: null, direction: 1 },
    ];
    const away = { RDG: [...flat(9, 4500), 4600], XAU: flat(10, 24000) };
    expect(b.decide(view(away, { news }), p)).toEqual([]);
    const out = b.decide(view(away, { news, ...held('crossPairs', { RDG: -522, XAU: 1 }) }), p);
    expect(orders(out).sort()).toEqual(['buy 522 RDG@4601 HARBOR', 'sell 1 XAU@23999 THAMESFORD'].sort());
  });

  it('scratches a leg left alone when the other missed', () => {
    const out = b.decide(
      view({ RDG: [...flat(9, 4500), 4600], XAU: flat(10, 24000) }, held('crossPairs', { RDG: -522 })),
      p,
    );
    expect(orders(out)).toEqual(['buy 522 RDG@4601 HARBOR']);
  });

  it('does nothing while a leg cannot be traded: the miner s exchange shut', () => {
    const shut = { quotes: { HARBOR: { RDG: quote(null, null) }, THAMESFORD: { XAU: quote(23999, 24001) } } };
    expect(b.decide(view({ RDG: [...flat(9, 4500), 4600], XAU: flat(10, 24000) }, shut), p)).toEqual([]);
  });
});

/** The firm's view, as a block is handed it before narrowing. */
const viewOf = (g: Game, firm = g.firm) =>
  (firm as unknown as { view(now: number, m: Game['market'], n: []): MarketView }).view(g.now, g.market, []);

describe('the desk opening', () => {
  it('gives a firm the three blocks, off, and keeps them across a save', () => {
    const g = new Game(CONTENT, 2);
    const ids = () => g.firm.blocks.map((x) => x.id);
    expect(ids()).not.toContain('fixArb');
    g.openDesk(METALS_DESK);
    expect(ids()).toEqual(expect.arrayContaining(['curve', 'fixArb', 'crossPairs']));
    expect(g.firm.blocks.filter((x) => DESK_BLOCKS.metals!.includes(x.id)).every((x) => !x.enabled)).toBe(true);
    const back = Game.load(CONTENT, JSON.parse(JSON.stringify(g.save())) as SavedGame);
    expect(back.firm.blocks.map((x) => x.id)).toEqual(ids());
  });

  it('shows a metals block the stocks and the metals, the miner among them, and a stocks block the stocks alone', () => {
    const g = new Game(CONTENT, 2);
    g.openDesk(METALS_DESK);
    g.firm.infra = infrastructureFrom(CONTENT, { location: 'colo-thamesford', network: 'fibre', computer: 'rack' });
    for (const x of g.firm.blocks) x.enabled = x.id === 'crossPairs' || x.id === 'momentum';
    g.firm.setWatch(['RDG', 'XAU', 'XAG', 'ABC']);
    const seen: Record<string, readonly string[]> = {};
    const spy = (id: string) =>
      vi.spyOn(blockById(id), 'decide').mockImplementation((v: MarketView) => {
        seen[id] = v.symbols;
        return [];
      });
    const spies = [spy('crossPairs'), spy('momentum')];
    g.stepTicks(20);
    for (const s of spies) s.mockRestore();
    expect([...seen.crossPairs!].sort()).toEqual(['ABC', 'RDG', 'XAG', 'XAU']);
    expect([...seen.momentum!].sort()).toEqual(['ABC', 'RDG']);
  });

  it('carries each live instrument s value of a point, so a block can match two legs in dollars', () => {
    const g = new Game(CONTENT, 2);
    g.openDesk(METALS_DESK);
    const v = viewOf(g);
    expect(v.scales?.XAU).toBe(100);
    expect(v.scales?.XAG).toBe(500);
    expect(v.scales?.RDG).toBe(1);
  });

  it('offers a rack at Thamesford and one at Hudson, priced as a rack is, each with a distance to every venue', () => {
    const racks = CONTENT.locations.filter((l) => l.desk === METALS_DESK);
    expect(racks.map((l) => l.id)).toEqual(['colo-thamesford', 'colo-hudson']);
    expect(racks.map((l) => l.price)).toEqual([COLO_EASTHOLM.price, COLO_EASTHOLM.price]);
    expect(racks[0]!.distance.THAMESFORD).toBeLessThan(1);
    expect(racks[1]!.distance.HUDSON).toBeLessThan(1);
    for (const l of CONTENT.locations)
      for (const v of CONTENT.exchanges) expect(l.distance[v.id], `${l.id} to ${v.id}`).toBeGreaterThan(0);
  });

  it('brings in Aldgate Metals from the Thamesford rack, running the fix, when the desk opens and not before', () => {
    const spec = CONTENT.competitors.find((x) => x.desk === METALS_DESK);
    expect(spec).toMatchObject({
      id: 'aldgate',
      name: 'Aldgate Metals',
      location: 'colo-thamesford',
      watches: ['metals'],
    });
    const g = new Game(CONTENT, 2);
    const ids = () => g.competitors.map((x) => x.id);
    g.stepTicks(1000);
    expect(ids()).not.toContain('bot:aldgate');
    g.openDesk('futures');
    g.openDesk('fx');
    expect(ids()).not.toContain('bot:aldgate');
    g.openDesk(METALS_DESK);
    expect(ids()).toContain('bot:aldgate');
    const rival = g.competitors.find((x) => x.id === 'bot:aldgate')!;
    expect(rival.infra.location.id).toBe('colo-thamesford');
    expect(rival.blocks.map((x) => x.id)).toEqual(['fixArb']);
    // It watches the metals alone: no stock, no pair, no index future.
    const symbols = viewOf(g, rival).symbols;
    expect(symbols).toEqual(expect.arrayContaining(['XAU', 'XAG']));
    expect(symbols.every((s) => ['XAU', 'XAG'].includes(s) || /^(GC|SI)\d/.test(s))).toBe(true);
    const back = Game.load(CONTENT, JSON.parse(JSON.stringify(g.save())) as SavedGame);
    expect(back.competitors.map((x) => x.id)).toEqual(ids());
  });
});

/** The game at Monday 10:00's call: the desk open, the player's blocks off, stepped coarsely to near the call. */
function toTheCall(seed: number): Game {
  const g = new Game(CONTENT, seed);
  g.openDesk(METALS_DESK);
  for (const x of g.firm.blocks) x.enabled = false;
  while (g.now < at(0, 10 * H) - 40 * MS_PER_SECOND)
    g.step(Math.min(MS_PER_MINUTE, at(0, 10 * H) - 40 * MS_PER_SECOND - g.now));
  return g;
}

describe('a script that names a metal (6f, for the experiments)', () => {
  // The experiments' scripts trade gold by name. A script's `symbols` are the stocks' alone (5d), but an order it
  // sends for a symbol it names is sent: the firm does not hold a block to its symbols.
  it('trades it, though its symbols are the stocks alone', () => {
    const g = toTheCall(3);
    const BUY = `const q = quote('THAMESFORD', 'XAU');
if (q && q.ask !== null && orders().length === 0 && mine('XAU') === 0 && !symbols.includes('XAU')) buy('XAU', 'THAMESFORD', q.ask + 5, 1);`;
    g.configure({
      location: 'colo-thamesford',
      network: 'fibre',
      computer: 'rack',
      watched: ['XAU', 'ABC'],
      blocks: [{ id: 'script', enabled: true, params: {}, source: BUY }],
    });
    g.stepTicks((5 * MS_PER_SECOND) / TICK_MS);
    expect(g.firm.positions.get('XAU')?.qty).toBe(1);
  }, 120_000);
});

describe('the fix arbitrage in a live game', () => {
  it('rests into the 10:00 fix from the Thamesford rack, fills at the fix s price, and hedges only that', () => {
    const g = toTheCall(3);
    g.firm.infra = infrastructureFrom(CONTENT, { location: 'colo-thamesford', network: 'fibre', computer: 'rack' });
    for (const x of g.firm.blocks) x.enabled = x.id === 'fixArb';
    g.setBlock('fixArb', { params: { threshold: 0, lots: 2 } });
    g.firm.setWatch(['XAU', 'XAG', ...g.market.live('GC'), ...g.market.live('SI')]);
    while (g.now < at(0, 10 * H) + 3 * MS_PER_SECOND) g.step();
    const venue = g.market.venue('THAMESFORD');
    const fixes = new Map(venue.fixes.filter((f) => f.at === at(0, 10 * H)).map((f) => [f.symbol, f.price]));
    const own = g.firm.fills.filter((f) => f.block === 'fixArb');
    const metal = own.filter((f) => f.symbol === 'XAU' || f.symbol === 'XAG');
    expect(metal.length).toBeGreaterThan(0);
    for (const f of metal) expect(f.price).toBe(fixes.get(f.symbol));
    // No IOC was sent to Thamesford in the call.
    const sent = [...g.firm.orders.values()].filter((o) => o.block === 'fixArb');
    expect(sent.filter((o) => o.exchange === 'THAMESFORD' && o.ioc && o.sentAt < at(0, 10 * H))).toEqual([]);
    // The hedge is what the fix filled, in the front future, the other way.
    for (const [metalSym, root] of [
      ['XAU', 'GC'],
      ['XAG', 'SI'],
    ] as const) {
      const spot = g.firm.blockPositions.get('fixArb')?.get(metalSym) ?? 0;
      const hedge = g.market.live(root).reduce((n, s) => n + (g.firm.blockPositions.get('fixArb')?.get(s) ?? 0), 0);
      expect(hedge + spot).toBe(0);
    }
  }, 120_000);

  it('is run by Aldgate Metals, which rests into a fix that clients have pushed off fair', () => {
    // Seed 2: clients sell a large lot of silver into Monday's 10:00 fix (6f), and the fix is cheap against the future.
    const g = toTheCall(2);
    while (g.now < at(0, 10 * H) + 3 * MS_PER_SECOND) g.step();
    const rival = g.competitors.find((x) => x.id === 'bot:aldgate')!;
    const rested = [...rival.orders.values()].filter((o) => o.exchange === 'THAMESFORD' && !o.ioc);
    expect(rested.length).toBeGreaterThan(0);
  }, 120_000);
});

describe('the mark', () => {
  it('reads the spot venue that is open now: Thamesford s book while Sundar is shut, not the fair value', () => {
    const g = new Game(CONTENT, 3);
    g.openDesk(METALS_DESK);
    while (g.now < at(0, 9 * H)) g.step(MS_PER_MINUTE);
    g.stepTicks(400);
    // 09:00, Monday: Sundar shut since 03:00, Thamesford open and quoting.
    const thames = g.market.venue('THAMESFORD').book('XAU').mid();
    expect(g.market.venue('SUNDAR').isOpen(g.now)).toBe(false);
    expect(thames).not.toBeNull();
    expect(g.market.markOf('XAU', g.now)).toBe(thames);
    expect(g.market.markOf('XAU', g.now)).not.toBe(g.market.fair.get('XAU'));
  }, 120_000);

  it('reads a stock s first venue as before, open, and its fair value shut', () => {
    const g = new Game(CONTENT, 2);
    expect(g.market.markOf('ABC', g.now)).toBe(g.market.fair.get('ABC'));
    g.skipToOpen();
    g.stepTicks((2 * MS_PER_MINUTE) / TICK_MS);
    expect(g.market.venuesOf('ABC')[0]!.book('ABC').mid()).not.toBeNull();
    expect(g.market.markOf('ABC', g.now)).toBe(g.market.venuesOf('ABC')[0]!.book('ABC').mid());
  });
});

describe('the pairs block, its working shared', () => {
  // Taken on the tree before 6d (2026-11-09), with the pairs block's working in the block itself: a colocated firm
  // trading pairs alone for ten minutes from the open. Sharing the working with crossPairs must leave it as it was.
  it('leaves a game of pairs exactly as it was', () => {
    const g = new Game(CONTENT, 4);
    g.firm.infra = infrastructureFrom(CONTENT, { location: 'colo-harbor', network: 'microwave', computer: 'rack' });
    for (const x of g.firm.blocks) x.enabled = x.id === 'pairs';
    g.setBlock('pairs', { params: { lookback: 120, threshold: 10, size: 200, hold: 5, newsPause: 30 } });
    g.skipToOpen();
    g.stepTicks((10 * MS_PER_MINUTE) / TICK_MS);
    const pairsOrders = [...g.firm.orders.values()].filter((o) => o.block === 'pairs').length;
    expect([g.fingerprint(), g.firm.stats.fillsReceived, pairsOrders]).toEqual(PAIRS_BEFORE);
  }, 120_000);
});

const PAIRS_BEFORE: unknown[] = ['caf87952', 55, 51];
