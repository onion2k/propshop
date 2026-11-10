// The options desk's blocks (plans/desk-options.md, 7d), each worked by hand on a view built in test/fixtures.ts: the
// index on HARBOR, its future on PRAIRIE and a small chain on POX, every book priced from the model at one volatility.
import { OPT_EXPIRY, OPT_RATE, OPT_SPOT, optSymbol, optionWorld, seenQuote } from './fixtures';
import { MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND, MS_PER_YEAR } from '../src/sim';
import { delta, price as optionPrice } from '../src/sim/options';
import {
  blockById,
  paramsFrom,
  type Intent,
  type MarketView,
  type OpenOrder,
  type OptionView,
  type Params,
  type SeenQuote,
  type StrategyBlock,
} from '../src/sim/strategy';

const H = MS_PER_HOUR;
const MIN = MS_PER_MINUTE;
const SEC = MS_PER_SECOND;

type OrderIntent = Extract<Intent, { kind: 'order' }>;
const ordersOf = (xs: Intent[]): OrderIntent[] => xs.filter((x): x is OrderIntent => x.kind === 'order');
const text = (xs: Intent[]) =>
  ordersOf(xs).map((o) => `${o.side} ${o.size} ${o.symbol}@${o.price} ${o.exchange}${o.ioc ? ' ioc' : ''}`);
const cancels = (xs: Intent[]) => xs.filter((x) => x.kind === 'cancel');

/** The block and its parameters, the defaults over which a test changes a few. */
function use(id: string, over: Params = {}): { block: StrategyBlock; p: Params } {
  const block = blockById(id);
  return { block, p: { ...paramsFrom(block.spec), ...over } };
}

/** A resting order of the block's on POX, as the firm lists it. */
function resting(symbol: string, side: 'buy' | 'sell', price: number, size = 10, localId = 1): OpenOrder {
  return {
    localId,
    exchange: 'POX',
    exchangeOrderId: localId,
    symbol,
    side,
    price,
    size,
    filled: 0,
    ioc: false,
    postOnly: true,
    status: 'resting',
    block: 'optionMaker',
    sentAt: 0,
    seenAt: 0,
    arrivedAt: 0,
    ackAt: 0,
    beatenBy: [],
  };
}

/** The model's price of an option of the view at a volatility, as the test works it. */
function modelPrice(v: MarketView, symbol: string, vol: number): number {
  const c = v.options!.chain[symbol]!;
  return optionPrice(c.right, c.spot!, c.strike, (c.expiry - v.now) / MS_PER_YEAR, vol, OPT_RATE);
}

/** A held option position's delta in index-future contracts (an option and the future both stand for 100 units). */
function netDelta(v: MarketView, held: Record<string, number>): number {
  let net = 0;
  for (const [symbol, qty] of Object.entries(held)) {
    const c = v.options!.chain[symbol];
    if (!c) {
      net += qty; // a future: one contract is one contract
      continue;
    }
    net += qty * delta(c.right, c.spot!, c.strike, (c.expiry - v.now) / MS_PER_YEAR, c.iv!, OPT_RATE);
  }
  return net;
}

describe('the options desk blocks are registered', () => {
  it('as optionMaker, parity and eventVol, with named parameters and defaults', () => {
    for (const id of ['optionMaker', 'parity', 'eventVol']) {
      const b = blockById(id);
      expect(b.spec.params.length).toBeGreaterThan(0);
      for (const param of b.spec.params) {
        expect(param.default).toBeGreaterThanOrEqual(param.min);
        expect(param.default).toBeLessThanOrEqual(param.max);
        expect(param.explain.length).toBeGreaterThan(10);
      }
    }
    expect(blockById('optionMaker').spec.params.map((x) => x.key)).toEqual(
      expect.arrayContaining(['edge', 'size', 'maxPosition', 'hedge', 'hedgeBand', 'flattenBefore']),
    );
    expect(blockById('parity').spec.params.map((x) => x.key)).toEqual(
      expect.arrayContaining(['threshold', 'contracts']),
    );
    expect(blockById('eventVol').spec.params.map((x) => x.key)).toEqual(
      expect.arrayContaining(['buyBefore', 'sellBefore', 'through', 'contracts']),
    );
  });
});

describe('optionMaker', () => {
  it('rests a bid and an ask on each two-sided option at its implied volatility less and plus the edge, post-only', () => {
    const { block, p } = use('optionMaker', { hedge: 0 });
    const v = optionWorld();
    const out = ordersOf(block.decide(v, p));
    for (const symbol of ['OC00', 'OP00', 'OC01', 'OP01']) {
      const c = v.options!.chain[symbol]!;
      expect(c.iv).not.toBeNull();
      const bid = Math.floor(modelPrice(v, symbol, c.iv! - p.edge! / 100));
      const ask = Math.ceil(modelPrice(v, symbol, c.iv! + p.edge! / 100));
      const mine = out.filter((o) => o.symbol === symbol);
      expect(mine.map((o) => [o.side, o.price])).toEqual([
        ['buy', bid],
        ['sell', ask],
      ]);
      for (const o of mine) {
        expect(o.exchange).toBe('POX');
        expect(o.size).toBe(p.size);
        expect(o.ioc).toBe(false);
        expect(o.postOnly).toBe(true);
      }
    }
    // Tomorrow's are quoted too, and twelve options make up to twenty-four quotes.
    expect(out.some((o) => o.symbol === 'OC01')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(24);
  });

  it('never quotes across the book it sees: the bid under the ask, the ask over the bid, the ask over its own bid', () => {
    const { block, p } = use('optionMaker', { hedge: 0, edge: 0 });
    const v = optionWorld({ half: 0 });
    for (const o of ordersOf(block.decide(v, p))) {
      const q = v.quotes.POX![o.symbol]!;
      if (o.side === 'buy') expect(o.price).toBeLessThan(q.ask!);
      else expect(o.price).toBeGreaterThan(q.bid!);
    }
    const out = ordersOf(block.decide(v, p));
    for (const symbol of new Set(out.map((o) => o.symbol))) {
      const bid = out.find((o) => o.symbol === symbol && o.side === 'buy');
      const ask = out.find((o) => o.symbol === symbol && o.side === 'sell');
      if (bid && ask) expect(ask.price).toBeGreaterThan(bid.price);
    }
  });

  it('leaves an option with no two-sided book alone, and posts no bid at or under nought', () => {
    const { block, p } = use('optionMaker', { hedge: 0 });
    const v = optionWorld({ empty: { OCp0: 'bid', OPm0: 'both' } });
    const out = ordersOf(block.decide(v, p));
    expect(out.filter((o) => o.symbol === 'OCp0' || o.symbol === 'OPm0')).toEqual([]);
    for (const o of out) expect(o.price).toBeGreaterThan(0);
  });

  it('keeps a resting quote within its tolerance and cancels and re-quotes one that has gone stale', () => {
    const { block, p } = use('optionMaker', { hedge: 0 });
    const fresh = ordersOf(block.decide(optionWorld(), p)).filter((o) => o.symbol === 'OC00');
    const [bid, ask] = fresh as [OrderIntent, OrderIntent];
    // Quotes already resting where it would put them: nothing to do for that option.
    const same = optionWorld({
      openOrders: [resting('OC00', 'buy', bid.price, p.size, 1), resting('OC00', 'sell', ask.price, p.size, 2)],
    });
    expect(block.decide(same, p).filter((x) => (x.kind === 'order' ? x.symbol === 'OC00' : false))).toEqual([]);
    expect(cancels(block.decide(same, p))).toEqual([]);
    // A bid far under where it belongs is cancelled and put again; the ask stays.
    const stale = optionWorld({
      openOrders: [resting('OC00', 'buy', bid.price - 5, p.size, 1), resting('OC00', 'sell', ask.price, p.size, 2)],
    });
    const out = block.decide(stale, p);
    expect(cancels(out)).toEqual([{ kind: 'cancel', localId: 1 }]);
    expect(ordersOf(out).filter((o) => o.symbol === 'OC00')).toEqual([
      expect.objectContaining({ side: 'buy', price: bid.price }),
    ]);
  });

  it('takes its own resting quotes out of the book before it reads a price from it, so it does not chase itself', () => {
    const { block, p } = use('optionMaker', { hedge: 0 });
    const plain = optionWorld();
    const base = ordersOf(block.decide(plain, p)).filter((o) => o.symbol === 'OC00');
    // The same market with its own bid improved a tick and sitting alone at the touch: the mid it sees is the book's.
    const q = plain.quotes.POX!.OC00!;
    const improved = optionWorld();
    (improved.quotes.POX as Record<string, SeenQuote>).OC00 = {
      ...q,
      bid: q.bid! + 1,
      bidSize: 10,
      bid2: q.bid,
      bid2Size: q.bidSize,
    };
    improved.openOrders = [resting('OC00', 'buy', q.bid! + 1, 10)];
    // The view's own implied volatility is from the mid it can see, which includes the improved bid.
    const seen = improved.quotes.POX!.OC00!;
    expect(seen.ask).not.toBeNull();
    (improved.options!.chain as Record<string, OptionView>).OC00 = {
      ...improved.options!.chain.OC00!,
      iv: improved.options!.impliedAt('OC00', (seen.bid! + seen.ask!) / 2),
    };
    expect(improved.options!.chain.OC00!.iv).not.toBe(plain.options!.chain.OC00!.iv);
    // With the order excluded the same wants come out; (they match the resting order or differ by cancel/post only).
    const out = ordersOf(block.decide(improved, p)).filter((o) => o.symbol === 'OC00' && o.side === 'buy');
    for (const o of out) expect(o.price).toBe(base.find((b) => b.side === 'buy')!.price);
  });

  it('stops buying at its position limit and stops selling at the opposite one', () => {
    const { block, p } = use('optionMaker', { hedge: 0, maxPosition: 20 });
    const long = ordersOf(
      block.decide(optionWorld({ held: { optionMaker: { OC00: 20 } }, positions: { OC00: 20 } }), p),
    );
    expect(long.filter((o) => o.symbol === 'OC00').map((o) => o.side)).toEqual(['sell']);
    const short = ordersOf(
      block.decide(optionWorld({ held: { optionMaker: { OC00: -20 } }, positions: { OC00: -20 } }), p),
    );
    expect(short.filter((o) => o.symbol === 'OC00').map((o) => o.side)).toEqual(['buy']);
  });

  describe('the delta hedge', () => {
    it('trades the index future to bring the net delta inside its threshold, selling for a long call', () => {
      const { block, p } = use('optionMaker', { hedge: 1, hedgeBand: 2 });
      const held = { OC00: 40 };
      const v = optionWorld({ held: { optionMaker: held }, positions: held });
      expect(Math.abs(netDelta(v, held))).toBeGreaterThan(p.hedgeBand!);
      const hedges = ordersOf(block.decide(v, p)).filter((o) => o.symbol === 'IXF1');
      expect(hedges).toHaveLength(1);
      const h = hedges[0]!;
      expect(h.side).toBe('sell');
      expect(h.ioc).toBe(true);
      expect(h.exchange).toBe('PRAIRIE');
      expect(h.size).toBe(Math.round(netDelta(v, held)));
    });

    it('hedges in the next contract when the near one has only minutes to run', () => {
      const { block, p } = use('optionMaker', { hedge: 1, hedgeBand: 2 });
      const held = { OC00: 40 };
      const v = optionWorld({ held: { optionMaker: held }, positions: held });
      const contracts = v.contracts as Record<string, NonNullable<MarketView['contracts']>[string]>;
      contracts.IXF1 = { ...contracts.IXF1!, expiry: v.now + 5 * MIN };
      contracts.IXF2 = { ...contracts.IXF1, expiry: v.now + 7 * 24 * H };
      (v.quotes.PRAIRIE as Record<string, SeenQuote>).IXF2 = seenQuote(5310, 5311);
      (v as unknown as { symbols: string[] }).symbols = [...v.symbols, 'IXF2'];
      const hedges = ordersOf(block.decide(v, p)).filter((o) => o.symbol.startsWith('IXF'));
      expect(hedges.map((o) => [o.symbol, o.side])).toEqual([['IXF2', 'sell']]);
    });

    it('leaves the net delta alone while it is inside the threshold, and does nothing with the hedge off', () => {
      const small = { OC00: 3 }; // about 1.5 contracts of delta
      const v = optionWorld({ held: { optionMaker: small }, positions: small });
      expect(Math.abs(netDelta(v, small))).toBeLessThan(2);
      expect(
        ordersOf(use('optionMaker', { hedgeBand: 2 }).block.decide(v, use('optionMaker', { hedgeBand: 2 }).p)).filter(
          (o) => o.symbol === 'IXF1',
        ),
      ).toEqual([]);
      const big = { OC00: 40 };
      const w = optionWorld({ held: { optionMaker: big }, positions: big });
      const off = use('optionMaker', { hedge: 0 });
      expect(ordersOf(off.block.decide(w, off.p)).filter((o) => o.symbol === 'IXF1')).toEqual([]);
    });

    it('counts the future it already holds, so a hedge in place is not made twice', () => {
      const { block, p } = use('optionMaker', { hedge: 1, hedgeBand: 2 });
      const v0 = optionWorld({ held: { optionMaker: { OC00: 40 } }, positions: { OC00: 40 } });
      const need = Math.round(netDelta(v0, { OC00: 40 }));
      const held = { OC00: 40, IXF1: -need };
      const v = optionWorld({ held: { optionMaker: held }, positions: held });
      expect(ordersOf(block.decide(v, p)).filter((o) => o.symbol === 'IXF1')).toEqual([]);
    });

    it('holds the net delta within the threshold for any book of options, once its orders are filled', () => {
      const { block, p } = use('optionMaker', { hedge: 1, hedgeBand: 2 });
      // A spread of positions across calls and puts, today's and tomorrow's, long and short.
      // Options whose books are two-sided enough to imply a volatility (a deep one in the money, a day out, is not).
      const symbols = ['OC00', 'OP00', 'OC01', 'OP01'];
      let seed = 12345;
      const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
      for (let trial = 0; trial < 40; trial++) {
        const held: Record<string, number> = {};
        for (const s of symbols) if (rand() < 0.6) held[s] = Math.round((rand() - 0.5) * 120);
        const hedge = Math.round((rand() - 0.5) * 30);
        if (hedge !== 0) held.IXF1 = hedge;
        const v = optionWorld({ spot: 5290 + rand() * 20, held: { optionMaker: held }, positions: held });
        const before = netDelta(v, held);
        const out = ordersOf(block.decide(v, p)).filter((o) => o.symbol === 'IXF1');
        let after = before;
        for (const o of out) after += o.side === 'buy' ? o.size : -o.size;
        if (Math.abs(before) <= p.hedgeBand!) expect(out).toEqual([]);
        else expect(Math.abs(after)).toBeLessThanOrEqual(p.hedgeBand!);
        // An order never grows the net delta.
        expect(Math.abs(after)).toBeLessThanOrEqual(Math.abs(before) + 1e-9);
      }
    });
  });

  describe('the expiry', () => {
    const expiryDay = (ms: number) => OPT_EXPIRY[0] - 5 * MIN + ms;

    it('flattens in the last half hour and requotes at once by default: the last minutes are all gamma, and a quote a cent off is stale', () => {
      const { block, p } = use('optionMaker', { hedge: 0 });
      expect(p.flattenBefore).toBe(30);
      expect(p.requote).toBe(0);
      const held = { OC00: 12 };
      const mk = (now: number) => optionWorld({ now, half: 0.25, held: { optionMaker: held }, positions: held });
      const at = (before: number) => OPT_EXPIRY[0] - before;
      expect(ordersOf(block.decide(mk(at(31 * MIN)), p)).some((o) => o.ioc && o.symbol === 'OC00')).toBe(false);
      expect(ordersOf(block.decide(mk(at(29 * MIN)), p)).some((o) => o.ioc && o.symbol === 'OC00')).toBe(true);
    });

    it('quotes today’s options until the last five minutes, flattens them from 15:55, and quotes no more of them', () => {
      const { block, p } = use('optionMaker', { hedge: 0, flattenBefore: 5 });
      const held = { OC00: 12, OP00: -7, OC01: 4 };
      const mk = (now: number, extra: Partial<Parameters<typeof optionWorld>[0]> = {}) =>
        optionWorld({ now, half: 0.25, held: { optionMaker: held }, positions: held, ...extra });
      // One second before 15:55: still quoting today's.
      const early = block.decide(mk(expiryDay(-SEC)), p);
      expect(ordersOf(early).filter((o) => o.symbol === 'OC00' && !o.ioc)).toHaveLength(2);
      expect(ordersOf(early).some((o) => o.ioc && o.symbol.endsWith('0'))).toBe(false);
      // At 15:55: no resting order for today's, and an IOC to get out of each position it holds in them.
      const late = block.decide(
        mk(expiryDay(0), {
          openOrders: [
            resting('OC00', 'buy', 9, 10, 7),
            resting('OC00', 'sell', 12, 10, 8),
            resting('OC01', 'buy', 18, 10, 9),
          ],
        }),
        p,
      );
      const v = mk(expiryDay(0));
      const todays = ordersOf(late).filter((o) => o.symbol.endsWith('0'));
      expect(todays.filter((o) => !o.ioc)).toEqual([]);
      expect(text(late)).toEqual(
        expect.arrayContaining([
          `sell 12 OC00@${v.quotes.POX!.OC00!.bid} POX ioc`,
          `buy 7 OP00@${v.quotes.POX!.OP00!.ask} POX ioc`,
        ]),
      );
      expect(cancels(late)).toEqual(
        expect.arrayContaining([
          { kind: 'cancel', localId: 7 },
          { kind: 'cancel', localId: 8 },
        ]),
      );
      // Tomorrow's options are still quoted.
      expect(ordersOf(late).some((o) => o.symbol === 'OC01' && !o.ioc)).toBe(true);
    });

    it('is flat in them at the close when it has had the five minutes', () => {
      const { block, p } = use('optionMaker', { hedge: 0, flattenBefore: 5 });
      // Playing the fills in: the block's IOCs are taken at the touch in full, position by position.
      const held: Record<string, number> = { OC00: 12, OP00: -7, OPp0: 5 };
      for (let step = 0; step < 3; step++) {
        const v = optionWorld({
          now: OPT_EXPIRY[0] - 4 * MIN,
          half: 0.25,
          held: { optionMaker: held },
          positions: held,
        });
        for (const o of ordersOf(block.decide(v, p)))
          if (o.ioc) held[o.symbol] = (held[o.symbol] ?? 0) + (o.side === 'buy' ? o.size : -o.size);
      }
      for (const s of ['OC00', 'OP00', 'OPp0']) expect(held[s] ?? 0).toBe(0);
    });

    it('keeps its future hedge while it is still getting out of the options it hedges', () => {
      const { block, p } = use('optionMaker', { hedge: 1 });
      const v0 = optionWorld({ now: expiryDay(0), half: 0.25, held: { optionMaker: { OC00: 12 } } });
      const hedge = -Math.round(netDelta(v0, { OC00: 12 }));
      expect(hedge).not.toBe(0);
      const held = { OC00: 12, IXF1: hedge };
      const v = optionWorld({ now: expiryDay(0), half: 0.25, held: { optionMaker: held }, positions: held });
      const out = text(block.decide(v, p));
      expect(out.some((x) => x.includes('OC00') && x.endsWith('ioc'))).toBe(true);
      expect(out.filter((x) => x.includes('IXF1'))).toEqual([]);
    });

    it('works the delta of what it holds at the hedge’s own price: the index book lagging, or one-sided, moves nothing', () => {
      const { block, p } = use('optionMaker', { hedge: 1, hedgeBand: 2, flattenBefore: 5 });
      const held = { OC00: 40, OP00: -25 };
      const at = OPT_EXPIRY[0] - 90 * MIN;
      const hedgeOf = (indexLag: number) => {
        const v = optionWorld({ now: at, half: 0.25, held: { optionMaker: held }, positions: held });
        // The spot the options are priced from is the index book's mid, a few seconds behind the future's, cents off: it
        // flips between that and the future's whenever the index book is one-sided. The hedge is traded in the future.
        for (const c of Object.values(v.options!.chain)) (c as { spot: number | null }).spot! += indexLag;
        return text(block.decide(v, p)).filter((x) => x.includes('IXF1'));
      };
      const still = hedgeOf(0);
      expect(still).toHaveLength(1);
      expect(hedgeOf(-20)).toEqual(still);
      expect(hedgeOf(25)).toEqual(still);
    });

    it('keeps counting an option whose whole expiry has gone one-sided: the hedge does not drop its delta and pick it up again', () => {
      const { block, p } = use('optionMaker', { hedge: 1, hedgeBand: 2, flattenBefore: 5 });
      const held = { OC00: 40 };
      const at = OPT_EXPIRY[0] - 90 * MIN;
      const hedge = (empty: Record<string, 'bid' | 'ask' | 'both'>) => {
        const v = optionWorld({ now: at, half: 0.25, held: { optionMaker: held }, positions: held, empty });
        return text(block.decide(v, p)).filter((x) => x.includes('IXF1'));
      };
      const todays = Object.fromEntries(
        ['OCm0', 'OC00', 'OCp0', 'OPm0', 'OP00', 'OPp0'].map((s) => [s, 'both' as const]),
      );
      const full = hedge({});
      expect(full).toHaveLength(1);
      // Every book of today's expiry without a bid or an ask for a look: no volatility of its own to read, and the
      // delta of the forty calls is still there to hedge, worked at the chain's.
      const bare = hedge(todays);
      expect(bare).toHaveLength(1);
      expect(bare[0]!.split(' ')[0]).toBe(full[0]!.split(' ')[0]);
    });

    it('leaves the hedge alone when it cannot read a volatility for what it holds: it does not unwind it for a look', () => {
      const { block, p } = use('optionMaker', { hedge: 1, hedgeBand: 2, flattenBefore: 5 });
      const at = OPT_EXPIRY[0] - 90 * MIN;
      const all = Object.fromEntries(
        ['OCm', 'OC0', 'OCp', 'OPm', 'OP0', 'OPp'].flatMap((r) => [0, 1].map((d) => [`${r}${d}`, 'both' as const])),
      );
      const v0 = optionWorld({ now: at, half: 0.25, held: { optionMaker: { OC00: 40 } } });
      const hedge = -Math.round(netDelta(v0, { OC00: 40 }));
      expect(hedge).not.toBe(0);
      const held = { OC00: 40, IXF1: hedge };
      // Every book empty: no volatility anywhere in the chain. The delta is unknown, not nought.
      const blind = optionWorld({ now: at, half: 0.25, held: { optionMaker: held }, positions: held, empty: all });
      expect(text(block.decide(blind, p)).filter((x) => x.includes('IXF1'))).toEqual([]);
      // Seen again, in place: nothing to do either.
      const seen = optionWorld({ now: at, half: 0.25, held: { optionMaker: held }, positions: held });
      expect(text(block.decide(seen, p)).filter((x) => x.includes('IXF1'))).toEqual([]);
    });

    it('does not chase the hedge while it is getting out of the options: the delta is falling to nothing by itself', () => {
      const { block, p } = use('optionMaker', { hedge: 1, hedgeBand: 2, flattenBefore: 5 });
      // Forty contracts of today's call and no hedge: far outside the band, as a position being closed is.
      const held = { OC00: 40 };
      const v = optionWorld({ now: expiryDay(0), half: 0.25, held: { optionMaker: held }, positions: held });
      expect(Math.abs(netDelta(v, held))).toBeGreaterThan(p.hedgeBand!);
      const out = text(block.decide(v, p));
      expect(out.some((x) => x.includes('OC00') && x.endsWith('ioc'))).toBe(true);
      expect(out.filter((x) => x.includes('IXF1'))).toEqual([]);
      // Nor, with tomorrow's held as well: the hedge waits until the flattening is done, then is set to what is left.
      const both = { OC00: 40, OC01: 40 };
      const w = optionWorld({ now: expiryDay(0), half: 0.25, held: { optionMaker: both }, positions: both });
      expect(text(block.decide(w, p)).filter((x) => x.includes('IXF1'))).toEqual([]);
      const rest = { OC01: 40 };
      const x = optionWorld({ now: expiryDay(0), half: 0.25, held: { optionMaker: rest }, positions: rest });
      expect(text(block.decide(x, p)).filter((y) => y.includes('IXF1')).length).toBe(1);
    });

    it('takes its future hedge off once the options it hedged are gone', () => {
      const { block, p } = use('optionMaker', { hedge: 1 });
      const held = { IXF1: 9 };
      const v = optionWorld({ now: expiryDay(0) + MIN, held: { optionMaker: held }, positions: held });
      expect(text(block.decide(v, p)).filter((x) => x.includes('IXF1'))).toEqual([
        `sell 9 IXF1@${v.quotes.PRAIRIE!.IXF1!.bid} PRAIRIE ioc`,
      ]);
    });
  });
});

describe('parity', () => {
  /** Strike 5300 today: the money. The future is fairly priced unless told otherwise. */
  const call = 'OC00';
  const put = 'OP00';

  it('does nothing while the chain is in line with the future', () => {
    const { block, p } = use('parity');
    expect(block.decide(optionWorld(), p)).toEqual([]);
  });

  it('trades a conversion when the call is rich against the put: sell the call, buy the put, buy the future', () => {
    const { block, p } = use('parity');
    const v = optionWorld({ shift: { [call]: 8 } });
    const q = v.quotes;
    expect(text(block.decide(v, p))).toEqual([
      `sell ${p.contracts} ${call}@${q.POX![call]!.bid} POX ioc`,
      `buy ${p.contracts} ${put}@${q.POX![put]!.ask} POX ioc`,
      `buy ${p.contracts} IXF1@${q.PRAIRIE!.IXF1!.ask} PRAIRIE ioc`,
    ]);
  });

  it('trades a reversal when the call is cheap against the put: buy the call, sell the put, sell the future', () => {
    const { block, p } = use('parity');
    const v = optionWorld({ shift: { [call]: -8 } });
    const q = v.quotes;
    expect(text(block.decide(v, p))).toEqual([
      `buy ${p.contracts} ${call}@${q.POX![call]!.ask} POX ioc`,
      `sell ${p.contracts} ${put}@${q.POX![put]!.bid} POX ioc`,
      `sell ${p.contracts} IXF1@${q.PRAIRIE!.IXF1!.bid} PRAIRIE ioc`,
    ]);
  });

  it('trades when the future is off the chain, too: a rich future is sold against a reversal', () => {
    const { block, p } = use('parity');
    const base = optionWorld();
    const fair = base.quotes.PRAIRIE!.IXF1!;
    const rich = optionWorld({ future: [fair.bid! + 8, fair.ask! + 8] });
    expect(text(block.decide(rich, p)).map((x) => x.split(' ')[0])).toEqual(['buy', 'sell', 'sell']);
    expect(text(block.decide(rich, p))[2]).toContain('IXF1');
  });

  it('wants the gap to clear its threshold after the fees, and only then', () => {
    const { block, p } = use('parity', { threshold: 2 });
    // A shift of the call leaves a gap of (shift - the crossing of two books and the future's cent - the fees).
    const gap = (shift: number) => {
      const v = optionWorld({ shift: { [call]: shift } });
      return block.decide(v, p).length;
    };
    expect(gap(2)).toBe(0);
    expect(gap(3)).toBe(0);
    expect(gap(8)).toBe(3);
    // A larger threshold wants more.
    const strict = use('parity', { threshold: 10 });
    expect(strict.block.decide(optionWorld({ shift: { [call]: 8 } }), strict.p)).toEqual([]);
  });

  it('holds a complete conversion to expiry', () => {
    const { block, p } = use('parity');
    const held = { [call]: -1, [put]: 1, IXF1: 1 };
    const v = optionWorld({ held: { parity: held }, positions: held });
    expect(block.decide(v, p)).toEqual([]);
    // Even when the gap has gone the other way: it is held, not traded back.
    const flipped = optionWorld({ held: { parity: held }, positions: held, shift: { [call]: -8 } });
    expect(ordersOf(block.decide(flipped, p)).filter((o) => o.side === 'sell' && o.symbol === call)).toEqual([]);
    expect(text(block.decide(flipped, p)).filter((x) => x.includes('IXF1'))).toEqual([]);
  });

  it('scratches a missed leg: the future did not fill, so the options legs it has go back', () => {
    const { block, p } = use('parity');
    const held = { [call]: -1, [put]: 1 };
    const v = optionWorld({ held: { parity: held }, positions: held });
    expect(text(block.decide(v, p)).sort()).toEqual(
      [`buy 1 ${call}@${v.quotes.POX![call]!.ask} POX ioc`, `sell 1 ${put}@${v.quotes.POX![put]!.bid} POX ioc`].sort(),
    );
  });

  it('scratches a missed leg: an option leg did not fill, so the others go back', () => {
    const { block, p } = use('parity');
    // The put missed: a short call and a long future are left.
    const held = { [call]: -1, IXF1: 1 };
    const v = optionWorld({ held: { parity: held }, positions: held });
    expect(text(block.decide(v, p)).sort()).toEqual(
      [
        `buy 1 ${call}@${v.quotes.POX![call]!.ask} POX ioc`,
        `sell 1 IXF1@${v.quotes.PRAIRIE!.IXF1!.bid} PRAIRIE ioc`,
      ].sort(),
    );
  });

  it('scratches only the part that is unmatched, and waits while an order of its own is in flight', () => {
    const { block, p } = use('parity');
    // Three on the options but two on the future: two sets are whole, the third's options go back.
    const held = { [call]: -3, [put]: 3, IXF1: 2 };
    const v = optionWorld({ held: { parity: held }, positions: held });
    expect(text(block.decide(v, p)).sort()).toEqual(
      [`buy 1 ${call}@${v.quotes.POX![call]!.ask} POX ioc`, `sell 1 ${put}@${v.quotes.POX![put]!.bid} POX ioc`].sort(),
    );
    const flying = optionWorld({
      held: { parity: held },
      positions: held,
      openOrders: [{ ...resting(put, 'buy', 9), block: 'parity', status: 'inflight', ioc: true }],
    });
    expect(block.decide(flying, p)).toEqual([]);
  });

  it('closes out the future it is left with once the options have expired', () => {
    const { block, p } = use('parity');
    const held = { IXF1: 2 };
    // After 16:00 the day's options are gone from the chain; tomorrow's are listed.
    const v = optionWorld({ now: 16 * H + MIN, held: { parity: held }, positions: held });
    for (const s of Object.keys(v.options!.chain))
      if (v.options!.chain[s]!.expiry <= v.now) delete (v.options!.chain as Record<string, OptionView>)[s];
    expect(text(block.decide(v, p))).toEqual([`sell 2 IXF1@${v.quotes.PRAIRIE!.IXF1!.bid} PRAIRIE ioc`]);
  });

  it('opens no more than its limit of conversions', () => {
    const { block, p } = use('parity', { maxContracts: 2, contracts: 1 });
    const held = { [call]: -2, [put]: 2, IXF1: 2 };
    const v = optionWorld({ held: { parity: held }, positions: held, shift: { [call]: 8 } });
    expect(block.decide(v, p)).toEqual([]);
  });

  it('leaves out a strike whose books are not both two-sided', () => {
    const { block, p } = use('parity');
    expect(block.decide(optionWorld({ shift: { [call]: 8 }, empty: { [put]: 'bid' } }), p)).toEqual([]);
  });
});

describe('eventVol', () => {
  const release = 10 * H + 30 * MIN;
  const call = 'OC00';
  const put = 'OP00';
  const at = (offsetMs: number, extra: Parameters<typeof optionWorld>[0] = {}) =>
    optionWorld({ now: release + offsetMs, releases: [release], ...extra });

  it('does nothing until the buying window opens', () => {
    const { block, p } = use('eventVol');
    expect(block.decide(at(-(p.buyBefore! + 5) * MIN), p)).toEqual([]);
  });

  it('buys today’s at-the-money straddle the set minutes before the day’s first release', () => {
    const { block, p } = use('eventVol');
    const v = at(-(p.buyBefore! - 1) * MIN);
    expect(text(block.decide(v, p)).sort()).toEqual(
      [
        `buy ${p.contracts} ${call}@${v.quotes.POX![call]!.ask} POX ioc`,
        `buy ${p.contracts} ${put}@${v.quotes.POX![put]!.ask} POX ioc`,
      ].sort(),
    );
  });

  it('buys the strike nearest the index, whichever it is', () => {
    const { block, p } = use('eventVol');
    const v = at(-MIN, { centre: 5300, spot: 5240 });
    // Strikes are 5200, 5300 and 5400; the index is nearest the lowest.
    expect(
      ordersOf(block.decide(v, p))
        .map((o) => o.symbol)
        .sort(),
    ).toEqual(['OCm0', 'OPm0']);
  });

  it('sells it the set seconds before the release when it does not hold through', () => {
    const { block, p } = use('eventVol', { through: 0 });
    const held = { [call]: p.contracts!, [put]: p.contracts! };
    const early = at(-(p.sellBefore! + 10) * SEC, { held: { eventVol: held }, positions: held });
    expect(block.decide(early, p)).toEqual([]);
    const v = at(-(p.sellBefore! - 5) * SEC, { held: { eventVol: held }, positions: held });
    expect(text(block.decide(v, p)).sort()).toEqual(
      [
        `sell ${p.contracts} ${call}@${v.quotes.POX![call]!.bid} POX ioc`,
        `sell ${p.contracts} ${put}@${v.quotes.POX![put]!.bid} POX ioc`,
      ].sort(),
    );
  });

  it('holds through the release with through on, and sells a little after it', () => {
    const { block, p } = use('eventVol', { through: 1 });
    const held = { [call]: p.contracts!, [put]: p.contracts! };
    const during = at(-5 * SEC, { held: { eventVol: held }, positions: held });
    expect(block.decide(during, p)).toEqual([]);
    const justAfter = at(5 * SEC, { held: { eventVol: held }, positions: held });
    expect(block.decide(justAfter, p)).toEqual([]);
    const later = at((p.sellAfter! + 5) * SEC, { held: { eventVol: held }, positions: held });
    expect(text(block.decide(later, p)).sort()).toEqual(
      [
        `sell ${p.contracts} ${call}@${later.quotes.POX![call]!.bid} POX ioc`,
        `sell ${p.contracts} ${put}@${later.quotes.POX![put]!.bid} POX ioc`,
      ].sort(),
    );
  });

  it('does not buy again once the moment to sell has come, nor after the release', () => {
    const { block, p } = use('eventVol');
    expect(block.decide(at(-(p.sellBefore! - 5) * SEC), p)).toEqual([]);
    expect(block.decide(at(2 * MIN), p)).toEqual([]);
    const through = use('eventVol', { through: 1 });
    expect(through.block.decide(at(-(through.p.sellBefore! - 5) * SEC), through.p)).toEqual([]);
  });

  it('fills in the leg that missed while the window is open', () => {
    const { block, p } = use('eventVol');
    const held = { [call]: p.contracts! };
    const v = at(-3 * MIN, { held: { eventVol: held }, positions: held });
    expect(text(block.decide(v, p))).toEqual([`buy ${p.contracts} ${put}@${v.quotes.POX![put]!.ask} POX ioc`]);
  });

  it('keeps the strike it holds, though the index has moved to another', () => {
    const { block, p } = use('eventVol');
    const held = { [call]: p.contracts!, [put]: p.contracts! };
    const v = at(-3 * MIN, { centre: 5300, spot: 5390, held: { eventVol: held }, positions: held });
    // 5390 is nearest the 5400 strike now, but it holds 5300: nothing more to buy.
    expect(block.decide(v, p)).toEqual([]);
  });

  it('uses the first release inside the session, not one before the open, and does nothing with none', () => {
    const { block, p } = use('eventVol');
    const early = 6 * H;
    const later = 11 * H;
    const v = optionWorld({ now: later - 2 * MIN, releases: [early, later] });
    expect(ordersOf(block.decide(v, p))).toHaveLength(2);
    const none = optionWorld({ now: later - 2 * MIN, releases: [early] });
    expect(block.decide(none, p)).toEqual([]);
    expect(block.decide(optionWorld({ now: later - 2 * MIN, releases: [] }), p)).toEqual([]);
  });

  it('sells what it holds even if the window has closed, and buys nothing without a two-sided book', () => {
    const { block, p } = use('eventVol');
    const held = { [call]: p.contracts!, [put]: p.contracts! };
    const v = at(-5 * SEC, { held: { eventVol: held }, positions: held, empty: { [put]: 'bid' } });
    expect(text(block.decide(v, p))).toEqual([`sell ${p.contracts} ${call}@${v.quotes.POX![call]!.bid} POX ioc`]);
    const blind = at(-3 * MIN, { empty: { [call]: 'both' } });
    expect(ordersOf(block.decide(blind, p)).map((o) => o.symbol)).toEqual([put]);
  });
});

describe('the fixture itself', () => {
  it('is priced from the model, so the tests above stand on a known book', () => {
    const v = optionWorld();
    const mid = modelPrice(v, 'OC00', 0.2);
    expect(mid).toBeGreaterThan(5);
    expect(mid).toBeLessThan(20);
    const q = v.quotes.POX!.OC00!;
    expect(q.bid!).toBeLessThan(mid);
    expect(q.ask!).toBeGreaterThan(mid);
    expect(v.options!.chain.OC00!.iv!).toBeCloseTo(0.2, 1);
    expect(optSymbol('OC0', 1)).toBe('OC01');
    expect(seenQuote(null, 5).bid).toBeNull();
    expect(OPT_SPOT).toBeGreaterThan(5000);
  });
});
