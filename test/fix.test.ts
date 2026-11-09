// The fix (plans/desk-metals.md 6c): a call auction at set times that holds the crowd, then one uncrossing price.
import { CONTENT } from '../src/content';
import { FIX_FLOW, METALS_DESK, METAL_SERIES, METAL_VENUES, SPOT, THAMESFORD } from '../src/content/metals';
import { Game, MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND, TICK_MS, type SavedGame } from '../src/sim';
import { BACKGROUND, Exchange, MAX_FIXES, REFUSED_IN_FIX } from '../src/sim/exchange';
import { OrderBook, type OrderRequest } from '../src/sim/orderbook';
import { Random } from '../src/sim/random';
import { daily } from '../src/sim/session';
import type { Content, ExchangeSpec } from '../src/sim/types';

const H = MS_PER_HOUR;
/** Simulated ms at a weekday (Monday 0) and a time of day, in the game's first week. */
const at = (weekday: number, time: number) => weekday * MS_PER_DAY + time;

const bid = (price: number, size: number, owner = 'a'): OrderRequest => ({ owner, side: 'buy', price, size });
const ask = (price: number, size: number, owner = 'b'): OrderRequest => ({ owner, side: 'sell', price, size });

/** A book with the orders rested as given, in that order, none matched: a book as the call leaves it. */
function called(orders: OrderRequest[]): OrderBook {
  const book = new OrderBook();
  orders.forEach((o, i) => book.place(o, i));
  return book;
}

describe('the uncrossing price, on books worked by hand', () => {
  // Bids 100 at 105 and 200 at 103; asks 150 at 101, 100 at 104, 100 at 106. At 101 and 103 bids for 300 meet asks
  // for 150: 150 trades, 150 left over. At 104 and 105 only the bid at 105 is left, 100 against 250: 100 trades.
  const BOOK = [bid(105, 100), bid(103, 200), ask(101, 150), ask(104, 100), ask(106, 100)];

  it('is the price that trades the most, and between equals the nearest the crowd s belief', () => {
    // Every price from 101 to 103 trades 150 and leaves 150 over: the belief's grid price wins.
    expect(called(BOOK).indicative(102.4)).toEqual({ price: 102, volume: 150, buy: 300, sell: 150 });
    expect(called(BOOK).indicative(102.8)).toEqual({ price: 103, volume: 150, buy: 300, sell: 150 });
    expect(called(BOOK).indicative(101.2)).toEqual({ price: 101, volume: 150, buy: 300, sell: 150 });
    // Halfway between two prices, the lower.
    expect(called(BOOK).indicative(101.5)?.price).toBe(101);
    // 104 is nearer 104.5, but trades only 100.
    expect(called(BOOK).indicative(104.5)?.price).toBe(103);
    // A belief below the overlap: the lowest price in it. On a grid of 5, 101 to 103 hold only limits.
    expect(called(BOOK).indicative(90)?.price).toBe(101);
    expect(called(BOOK).indicative(102.4, 5)?.price).toBe(103);
  });

  it('between equal volumes takes the least left over before the belief', () => {
    // Bids 100 at 104 and 50 at 102; asks 100 at 101 and 100 at 103. Every price from 101 to 104 trades 100; 101 and
    // 102 leave 50 over (150 bid, 100 offered), 103 and 104 leave 100 (100 bid, 200 offered). The belief at 103.9
    // is nearest 104, but 104 leaves more over: 102, the nearer of the two that leave least.
    const book = called([bid(104, 100), bid(102, 50), ask(101, 100), ask(103, 100)]);
    expect(book.indicative(103.9)).toEqual({ price: 102, volume: 100, buy: 150, sell: 100 });
  });

  it('fills everything at that one price, in price then time priority, and leaves the book uncrossed', () => {
    const book = called([...BOOK, bid(103, 40, 'late')]);
    const fix = book.uncross(102.8, 9)!;
    expect(fix.price).toBe(103);
    expect(fix.volume).toBe(150);
    expect(new Set(fix.trades.map((t) => t.price))).toEqual(new Set([103]));
    // The bid at 105 first, then the older bid at 103; the later one at 103 gets nothing.
    expect(fix.trades.map((t) => [t.buyer, t.seller, t.size])).toEqual([
      ['a', 'b', 100],
      ['a', 'b', 50],
    ]);
    expect(fix.trades.every((t) => t.at === 9 && t.fix === true)).toBe(true);
    const q = book.quote();
    expect([q.bid, q.bidSize, q.ask, q.askSize]).toEqual([103, 190, 104, 100]);
    expect(book.lastPrice).toBe(103);
  });

  it('counts an iceberg s whole remainder, not its shown slice', () => {
    const book = new OrderBook();
    book.place({ ...bid(102, 500), display: 100 }, 0);
    book.place(ask(101, 300), 1);
    const fix = book.uncross(101.5, 2)!;
    expect(fix.volume).toBe(300);
    expect(book.resting()[0]!.remaining).toBe(200);
    expect(book.resting()[0]!.shown).toBe(100);
  });

  it('is nothing where nothing crosses, and leaves the book as it was', () => {
    const book = called([bid(100, 100), ask(101, 100)]);
    expect(book.indicative(100.5)).toBeNull();
    expect(book.uncross(100.5, 5)).toBeNull();
    expect(book.count()).toBe(2);
    expect(called([bid(100, 100)]).indicative(100)).toBeNull();
  });
});

/** A venue on Thamesford's hours with one fix at 10:00, its call 30 s. */
const VENUE: ExchangeSpec = {
  id: 'FIXED',
  name: 'Fixed',
  city: 'Fixed',
  feePerShare: 1,
  lag: 60,
  noise: 0,
  desk: 'test',
  session: daily(3 * H, 12 * H, [0, 1, 2, 3, 4]),
  auctions: [{ at: 10 * H, callMs: 30 * MS_PER_SECOND }],
};

function venue(spec: ExchangeSpec = VENUE): Exchange {
  return new Exchange(spec, [{ symbol: 'XX', startPrice: 1000 }]);
}

/** Step a venue with no crowd (no activity) over a span, tick by tick. */
function stepQuiet(e: Exchange, from: number, to: number) {
  const fair = new Map([['XX', 1000]]);
  const random = new Random(1);
  const trades = [];
  for (let t = from; t <= to; t += TICK_MS) {
    e.step(t, TICK_MS, fair, 0, random);
    trades.push(...e.tickTrades);
    e.logQuotes(t);
  }
  return trades;
}

describe('the call', () => {
  const inCall = at(1, 10 * H - 10 * MS_PER_SECOND);

  it('refuses a firm s IOC, rests a limit that would cross, and honours a cancel', () => {
    const e = venue();
    expect(e.callAt(inCall)).toBe(at(1, 10 * H));
    e.submit('XX', ask(1000, 100), inCall);
    const ioc = e.submit('XX', { ...bid(1001, 100), ioc: true }, inCall)!;
    expect(ioc.refused).toBe(REFUSED_IN_FIX);
    expect(REFUSED_IN_FIX).toBe('in the fix: send a resting order');
    const limit = e.submit('XX', bid(1001, 100), inCall)!;
    expect(limit.refused).toBeNull();
    expect(limit.trades).toHaveLength(0);
    expect(e.book('XX').count()).toBe(2);
    const q = e.quote('XX');
    expect(q.bid).toBeGreaterThan(q.ask!);
    expect(e.cancel('XX', limit.order.id, inCall).order?.id).toBe(limit.order.id);
    expect(e.book('XX').count()).toBe(1);
  });

  it('matches as usual outside the call, and the call is the 30 s before the fix', () => {
    const e = venue();
    expect(e.callAt(at(1, 10 * H - 30 * MS_PER_SECOND - TICK_MS))).toBeNull();
    expect(e.callAt(at(1, 10 * H - 30 * MS_PER_SECOND))).toBe(at(1, 10 * H));
    expect(e.callAt(at(1, 10 * H))).toBeNull();
    const before = at(1, 9 * H);
    e.submit('XX', ask(1000, 100), before);
    const r = e.submit('XX', { ...bid(1001, 100), ioc: true }, before)!;
    expect(r.trades.map((t) => [t.price, t.size])).toEqual([[1000, 100]]);
  });

  it('rests the crowd s takers at their limit, and nothing trades until the fix', () => {
    const e = venue();
    const r = e.submit('XX', { ...bid(1005, 300, BACKGROUND), ioc: true }, inCall)!;
    expect(r.refused).toBeNull();
    expect(r.order.ioc).toBe(false);
    expect(e.book('XX').resting()).toHaveLength(1);
  });

  it('is not called at the weekend, nor where the venue is closed at the fix', () => {
    const e = venue();
    expect(e.callAt(at(5, 10 * H - 10 * MS_PER_SECOND))).toBeNull();
    expect(e.callAt(at(6, 10 * H - 10 * MS_PER_SECOND))).toBeNull();
    const shut = venue({ ...VENUE, session: daily(3 * H, 9 * H, [0, 1, 2, 3, 4]) });
    expect(shut.callAt(at(1, 10 * H - 10 * MS_PER_SECOND))).toBeNull();
    // Venues without auctions are never in a call.
    expect(new Exchange({ ...VENUE, auctions: undefined }, [{ symbol: 'XX', startPrice: 1000 }]).callAt(inCall)).toBe(
      null,
    );
  });
});

describe('the fix', () => {
  it('uncrosses at one price at the fix time, tells the owners, prints one fix on the tape and logs it', () => {
    const e = venue();
    const start = at(1, 10 * H - 20 * MS_PER_SECOND);
    e.submit('XX', ask(999, 100, 'seller'), start);
    e.submit('XX', ask(1001, 100, 'seller'), start);
    e.submit('XX', bid(1002, 150, 'buyer'), start + 2);
    e.submit('XX', bid(1000, 100, 'buyer'), start + 4);
    // Nothing trades in the call; at 10:00 the book uncrosses. At 1,000: bids 250, asks 100; at 1,001 and 1,002:
    // bids 150, asks 200, 150 trading. The belief (1,000) is nearer 1,001.
    const trades = stepQuiet(e, start + TICK_MS, at(1, 10 * H));
    expect(trades.map((t) => [t.trade.price, t.trade.size, t.trade.buyer, t.trade.seller])).toEqual([
      [1001, 100, 'buyer', 'seller'],
      [1001, 50, 'buyer', 'seller'],
    ]);
    expect(e.fixes).toEqual([{ at: at(1, 10 * H), symbol: 'XX', price: 1001, volume: 150 }]);
    // No race and no taker: the tape shows the fix as one print of its whole volume, which no firm took first.
    const tape = e.tapeAsOf('XX', at(1, 10 * H), 5);
    expect(tape).toEqual([{ price: 1001, size: 150, aggressor: 'sell', at: at(1, 10 * H), cleared: false, fix: true }]);
    expect(e.takersSince('XX', 0, 'buy', 2000, 'nobody')).toEqual([]);
    expect(trades.every((t) => t.trade.fix === true)).toBe(true);
    // And continuous trading resumes: an IOC meets the ask left over.
    const r = e.submit('XX', { ...bid(1001, 50), ioc: true }, at(1, 10 * H) + TICK_MS)!;
    expect(r.trades.map((t) => [t.price, t.size])).toEqual([[1001, 50]]);
  });

  it('logs "no fix" where nothing crosses, and trading resumes', () => {
    const e = venue();
    const start = at(1, 10 * H - 20 * MS_PER_SECOND);
    e.submit('XX', ask(1001, 100), start);
    e.submit('XX', bid(1000, 100), start);
    stepQuiet(e, start + TICK_MS, at(1, 10 * H));
    expect(e.fixes).toEqual([{ at: at(1, 10 * H), symbol: 'XX', price: null, volume: 0 }]);
    expect(e.book('XX').count()).toBe(2);
  });

  it('has no fix at the weekend or with the venue closed', () => {
    const sat = venue();
    sat.submit('XX', ask(999, 100), at(5, 10 * H - MS_PER_SECOND));
    sat.submit('XX', bid(1002, 100), at(5, 10 * H - MS_PER_SECOND));
    stepQuiet(sat, at(5, 10 * H - MS_PER_SECOND), at(5, 10 * H + MS_PER_SECOND));
    expect(sat.fixes).toEqual([]);
    const shut = venue({ ...VENUE, session: daily(3 * H, 9 * H, [0, 1, 2, 3, 4]) });
    stepQuiet(shut, at(1, 10 * H - MS_PER_SECOND), at(1, 10 * H + MS_PER_SECOND));
    expect(shut.fixes).toEqual([]);
  });

  it('keeps at most MAX_FIXES fixes, the oldest dropped', () => {
    const e = venue();
    for (let d = 0; d < MAX_FIXES + 5; d++) {
      const day = Math.floor(d / 5) * 7 + (d % 5);
      e.step(at(day, 10 * H), TICK_MS, new Map([['XX', 1000]]), 0, new Random(1));
    }
    expect(e.fixes).toHaveLength(MAX_FIXES);
    expect(e.fixes[0]!.at).toBe(at(7, 10 * H));
  });

  it('publishes an indicative price and volume each tick of the call, in the quote log, and none after', () => {
    const e = venue();
    const start = at(1, 10 * H - 20 * MS_PER_SECOND);
    e.submit('XX', ask(999, 100), start);
    e.submit('XX', bid(1002, 60), start);
    stepQuiet(e, start, start + 10 * TICK_MS);
    const seen = e.quoteAsOf('XX', start + 10 * TICK_MS)!;
    expect(seen.indicative).toEqual({ price: 1000, volume: 60, fixAt: at(1, 10 * H) });
    // A slow reader sees the indicative as it stood when its quote left.
    e.submit('XX', bid(1001, 100), start + 11 * TICK_MS);
    stepQuiet(e, start + 11 * TICK_MS, start + 12 * TICK_MS);
    expect(e.quoteAsOf('XX', start + 12 * TICK_MS)!.indicative?.volume).toBe(100);
    expect(e.quoteAsOf('XX', start + 10 * TICK_MS)!.indicative?.volume).toBe(60);
    stepQuiet(e, start + 13 * TICK_MS, at(1, 10 * H));
    expect(e.quoteAsOf('XX', at(1, 10 * H))!.indicative).toBeUndefined();
  });
});

/** The miner and two other stocks, the stock exchanges and the metals desk: no rivals, so a day steps quickly. */
const METALS: Content = {
  ...CONTENT,
  stocks: CONTENT.stocks.filter((s) => ['ABC', 'QNT', 'RDG'].includes(s.symbol)),
  exchanges: [...CONTENT.exchanges.filter((e) => e.desk === undefined), ...METAL_VENUES],
  series: METAL_SERIES,
  instruments: SPOT,
  currencies: [],
  competitors: [],
};

function metalsGame(seed = 3): Game {
  const g = new Game(METALS, seed);
  g.openDesk(METALS_DESK);
  for (const b of g.firm.blocks) b.enabled = false;
  return g;
}

/** Step in strides to `until`. */
const run = (g: Game, until: number, stride = TICK_MS) => {
  while (g.now < until) g.step(Math.min(stride, until - g.now));
};

describe('the clients at the fix (6f)', () => {
  const FLOW = { chance: 1, lots: [50, 50] as const, withinMs: 150, reach: 6 };
  const FLOWING: ExchangeSpec = { ...VENUE, auctions: [{ at: 10 * H, callMs: 30 * MS_PER_SECOND, flow: FLOW }] };
  /** Step a venue with its crowd over a span, tick by tick, its belief held at the fair value. */
  function stepBusy(e: Exchange, from: number, to: number, random: Random) {
    const fair = new Map([['XX', 1000]]);
    for (let t = from; t <= to; t += TICK_MS) {
      e.step(t, TICK_MS, fair, 1, random);
      e.logQuotes(t);
    }
  }
  const lot = (spec: ExchangeSpec, crowdLot?: number) =>
    new Exchange(spec, [{ symbol: 'XX', startPrice: 1000, ...(crowdLot ? { crowdLot } : {}) }]);
  const callFrom = at(1, 10 * H - 30 * MS_PER_SECOND);

  it('draws one order a call, on one side, in the last 150 ms, priced through the belief, and none before', () => {
    const e = lot(FLOWING, 1);
    stepBusy(e, callFrom, at(1, 10 * H) - 200, new Random(4));
    const f = e.stocks.get('XX')!.flow!;
    expect(f.fixAt).toBe(at(1, 10 * H));
    expect(f.size).toBe(50);
    expect(f.at).toBeGreaterThanOrEqual(at(1, 10 * H) - 150);
    expect(f.sent).toBe(false);
    const before = e
      .book('XX')
      .resting()
      .filter((o) => o.size === 50);
    expect(before).toHaveLength(0);
    stepBusy(e, at(1, 10 * H) - 200 + TICK_MS, at(1, 10 * H) - TICK_MS, new Random(5));
    expect(e.stocks.get('XX')!.flow!.sent).toBe(true);
    const placed = e
      .book('XX')
      .resting()
      .filter((o) => o.owner === BACKGROUND && o.size === 50);
    expect(placed).toHaveLength(1);
    expect(placed[0]!.side).toBe(f.side);
    expect(placed[0]!.price).toBe(f.side === 'buy' ? 1000 + 6 : 1000 - 6);
  });

  it('moves the fix off the belief the way the clients lean, and is gone after it', () => {
    const fixes: number[] = [];
    const sides: string[] = [];
    for (let seed = 1; seed <= 8; seed++) {
      const e = lot(FLOWING, 1);
      const random = new Random(seed);
      stepBusy(e, callFrom, at(1, 10 * H) + TICK_MS, random);
      const fix = e.fixes.find((x) => x.at === at(1, 10 * H))!;
      fixes.push(fix.price! - 1000);
      sides.push(e.fixes.length ? (e.stocks.get('XX')!.flow?.side ?? 'gone') : '');
    }
    // The flow is cleared at the fix; each fix leans the way its clients did, a few steps off the belief.
    expect(new Set(sides)).toEqual(new Set(['gone']));
    expect(fixes.some((d) => d >= 2)).toBe(true);
    expect(fixes.some((d) => d <= -2)).toBe(true);
  });

  it('draws nothing on a venue whose auctions have no flow, so its crowd is as it was', () => {
    const a = lot(VENUE, 1);
    const b = lot(VENUE, 1);
    stepBusy(a, callFrom, at(1, 10 * H) + TICK_MS, new Random(9));
    stepBusy(b, callFrom, at(1, 10 * H) + TICK_MS, new Random(9));
    expect(a.stocks.get('XX')!.flow).toBeUndefined();
    expect(a.save()).toEqual(b.save());
    expect(a.fixes).toEqual(b.fixes);
  });

  it('is saved mid-call and loaded, and absent from a save outside a call', () => {
    const e = lot(FLOWING, 1);
    stepBusy(e, callFrom, callFrom + MS_PER_SECOND, new Random(3));
    const saved = JSON.parse(JSON.stringify(e.save())) as ReturnType<Exchange['save']>;
    expect(saved.stocks.XX!.flow).toEqual(e.stocks.get('XX')!.flow);
    const back = lot(FLOWING, 1);
    back.load(saved);
    expect(back.stocks.get('XX')!.flow).toEqual(e.stocks.get('XX')!.flow);
    stepBusy(e, callFrom + MS_PER_SECOND + TICK_MS, at(1, 10 * H) + TICK_MS, new Random(7));
    stepBusy(back, callFrom + MS_PER_SECOND + TICK_MS, at(1, 10 * H) + TICK_MS, new Random(7));
    expect(back.fixes).toEqual(e.fixes);
    expect(e.save().stocks.XX!.flow).toBeUndefined();
  });

  it('sizes the crowd in its lot: one to five a resting order where a metal says one, hundreds where nothing is said', () => {
    const sizes = (crowdLot?: number) => {
      const e = lot({ ...VENUE, auctions: undefined }, crowdLot);
      stepBusy(e, at(1, 9 * H), at(1, 9 * H) + 2 * MS_PER_SECOND, new Random(2));
      return new Set(
        e
          .book('XX')
          .resting()
          .map((o) => o.size),
      );
    };
    expect([...sizes(1)].every((n) => n >= 1 && n <= 5)).toBe(true);
    expect([...sizes()].every((n) => n % 100 === 0 && n >= 100 && n <= 500)).toBe(true);
    expect(SPOT.every((m) => m.crowdLot === 1)).toBe(true);
    expect(METAL_SERIES.every((s) => s.contract.crowdLot === 1)).toBe(true);
    expect(CONTENT.stocks.every((s) => s.crowdLot === undefined)).toBe(true);
  });
});

describe('the fix at Thamesford', () => {
  it('runs at 05:30 and 10:00, both metals, with the crowd resting into it', () => {
    expect(THAMESFORD.auctions).toEqual([
      { at: 5.5 * H, callMs: 30 * MS_PER_SECOND, flow: FIX_FLOW },
      { at: 10 * H, callMs: 30 * MS_PER_SECOND, flow: FIX_FLOW },
    ]);
    const g = metalsGame();
    // The game starts at 06:00 on Monday: its first fix is at 10:00.
    run(g, at(0, 10 * H - 31 * MS_PER_SECOND), MS_PER_MINUTE);
    const venue = g.market.venue('THAMESFORD');
    expect(venue.fixes).toEqual([]);
    let traded = 0;
    let rested = 0;
    run(g, at(0, 10 * H - 30 * MS_PER_SECOND), TICK_MS);
    const resting = venue.book('XAU').count();
    while (g.now < at(0, 10 * H) - TICK_MS) {
      g.step();
      traded += venue.tickTrades.length;
    }
    rested = venue.book('XAU').count();
    expect(traded).toBe(0);
    // The crowd kept quoting, and its takers rested at their limits across the touch.
    expect(rested).toBeGreaterThan(resting);
    const q = venue.quote('XAU');
    expect(q.bid).toBeGreaterThanOrEqual(q.ask!);
    g.step();
    const fixes = venue.fixes.filter((f) => f.at === at(0, 10 * H));
    expect(fixes.map((f) => f.symbol)).toEqual(['XAU', 'XAG']);
    const gold = fixes[0]!;
    expect(gold.price).not.toBeNull();
    expect(gold.volume).toBeGreaterThan(0);
    expect(new Set(venue.tickTrades.filter((t) => t.symbol === 'XAU').map((t) => t.trade.price))).toEqual(
      new Set([gold.price]),
    );
    const after = venue.quote('XAU');
    expect(after.bid).toBeLessThan(after.ask!);
    // Stepped a minute at a time (as a skip over closed hours is), Tuesday's 05:30 call is stepped over, and its fix
    // comes with nothing held to cross.
    run(g, at(1, 10 * H + MS_PER_SECOND), MS_PER_MINUTE);
    expect(venue.fixes.filter((f) => f.at > at(0, 10 * H)).map((f) => [f.at, f.symbol])).toEqual([
      [at(1, 5.5 * H), 'XAU'],
      [at(1, 5.5 * H), 'XAG'],
      [at(1, 10 * H), 'XAU'],
      [at(1, 10 * H), 'XAG'],
    ]);
  }, 120_000);

  it('fills a firm resting into it at the fix price, as a fill, with no taker fee; and refuses its IOC', () => {
    const g = metalsGame();
    run(g, at(0, 10 * H - 20 * MS_PER_SECOND), MS_PER_MINUTE);
    run(g, at(0, 10 * H - 15 * MS_PER_SECOND), TICK_MS);
    const venue = g.market.venue('THAMESFORD');
    const ind = venue.quoteAsOf('XAU', g.now)!.indicative!;
    expect(ind.fixAt).toBe(at(0, 10 * H));
    expect(ind.price).not.toBeNull();
    const ioc = g.hand({ symbol: 'XAU', side: 'buy', size: 1, exchange: 'THAMESFORD', type: 'market' });
    expect(ioc.ok).toBe(true);
    // A buy well above the indicative: it rests, and fills at the fix's one price.
    const limit = g.hand({
      symbol: 'XAU',
      side: 'buy',
      size: 2,
      exchange: 'THAMESFORD',
      type: 'limit',
      price: ind.price! + 50,
    });
    expect(limit.ok).toBe(true);
    const fees = g.firm.feesPaid;
    run(g, at(0, 10 * H) + 2 * MS_PER_SECOND, TICK_MS);
    const mine = [...g.firm.orders.values()].filter((o) => o.symbol === 'XAU');
    const refused = mine.find((o) => o.ioc)!;
    expect(refused.status).toBe('rejected');
    expect(refused.reason).toBe(REFUSED_IN_FIX);
    const fixed = mine.find((o) => !o.ioc)!;
    const fix = venue.fixes.find((f) => f.at === at(0, 10 * H) && f.symbol === 'XAU')!;
    expect(fixed.filled).toBe(2);
    expect(g.firm.positions.get('XAU')).toEqual({ qty: 2, avgCost: fix.price });
    expect(g.firm.feesPaid).toBe(fees);
  }, 120_000);

  it('shows the indicative to a firm through its data latency, as it shows quotes', () => {
    const g = metalsGame();
    run(g, at(0, 10 * H - 20 * MS_PER_SECOND), MS_PER_MINUTE);
    run(g, at(0, 10 * H - 10 * MS_PER_SECOND), TICK_MS);
    const firm = g.firm as unknown as {
      view(now: number, market: unknown, news: unknown): { quotes: Record<string, Record<string, unknown>> };
      dataLatency(id: string): number;
    };
    const lag = firm.dataLatency('THAMESFORD');
    expect(lag).toBeGreaterThan(10);
    const view = firm.view(g.now, g.market, g.news.feed());
    const venue = g.market.venue('THAMESFORD');
    const seen = view.quotes.THAMESFORD!.XAU as { indicative?: unknown; at: number };
    expect(seen).toBe(venue.quoteAsOf('XAU', g.now - lag));
    expect(seen.indicative).toEqual(venue.quoteAsOf('XAU', g.now - lag)!.indicative);
    expect(seen.indicative).toBeDefined();
  }, 120_000);

  it('saved mid-call, loads to the same future', () => {
    const g = metalsGame(6);
    run(g, at(0, 10 * H - 20 * MS_PER_SECOND), MS_PER_MINUTE);
    run(g, at(0, 10 * H - 12 * MS_PER_SECOND), TICK_MS);
    expect(g.market.venue('THAMESFORD').callAt(g.now)).toBe(at(0, 10 * H));
    g.hand({ symbol: 'XAU', side: 'sell', size: 1, exchange: 'THAMESFORD', type: 'limit', price: 23_000 });
    run(g, g.now + MS_PER_SECOND, TICK_MS);
    const saved = JSON.parse(JSON.stringify(g.save())) as SavedGame;
    const back = Game.load(METALS, saved);
    expect(back.fingerprint()).toBe(g.fingerprint());
    run(g, at(0, 10 * H) + 5 * MS_PER_SECOND, TICK_MS);
    run(back, at(0, 10 * H) + 5 * MS_PER_SECOND, TICK_MS);
    expect(back.fingerprint()).toBe(g.fingerprint());
    expect(back.market.venue('THAMESFORD').fixes).toEqual(g.market.venue('THAMESFORD').fixes);
    expect(g.firm.positions.get('XAU')?.qty).toBe(-1);
    expect(back.firm.cash).toBe(g.firm.cash);
  }, 120_000);

  it('does nothing with the metals desk closed: no call, no fix, nothing saved', () => {
    const g = new Game(METALS, 3);
    run(g, at(0, 10 * H + MS_PER_MINUTE), MS_PER_MINUTE);
    expect(g.market.venue('THAMESFORD').fixes).toEqual([]);
    expect(g.save().market.exchanges.THAMESFORD!.fixes).toBeUndefined();
  });
});
