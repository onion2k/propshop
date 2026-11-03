import { MARKET_OPEN, MS_PER_SECOND } from '../src/sim/clock';
import { Exchange } from '../src/sim/exchange';
import { Firm } from '../src/sim/firm';
import { tick } from '../src/sim/flow';
import { Market } from '../src/sim/market';
import { Random } from '../src/sim/random';
import { DEFAULT_RULES } from '../src/sim/types';
import { EXCHANGES, FAST, SLOW, STOCKS, TICK } from './fixtures';

const MILLION = 100_000_000;

function world(seed: number, firms: Firm[], from = MARKET_OPEN) {
  const market = new Market(STOCKS, EXCHANGES);
  const random = new Random(seed);
  let now = from;
  const run = (ms: number) => {
    for (let i = 0; i < ms / TICK; i++, now += TICK) tick(now, TICK, market, firms, random, []);
    return now;
  };
  return { market, random, run, now: () => now };
}

const won = (f: Firm) => [...f.orders.values()].filter((o) => o.ioc && o.filled >= o.size).length;

describe('exchange rules', () => {
  it('a speed bump adds to both latencies through that exchange and nothing else', () => {
    const f = new Firm('firm', 'Mine', MILLION, FAST, Firm.defaultBlocks());
    f.bumps = { HARBOR: 3 };
    expect(f.latency('HARBOR')).toBe(4);
    expect(f.dataLatency('HARBOR')).toBe(4);
    expect(f.latency('LAKESIDE')).toBe(8.5);
  });

  it('a tax is paid by both sides of a fill', () => {
    const f = new Firm('firm', 'Mine', MILLION, FAST, Firm.defaultBlocks());
    f.feeTable = { HARBOR: 0.3 };
    f.taxes = { HARBOR: 1 };
    const book = (
      f as unknown as { book: (o: unknown, p: number, s: number, at: number, t: boolean) => void }
    ).book.bind(f);
    const order = { localId: 1, exchange: 'HARBOR', symbol: 'ABC', side: 'buy', size: 100, filled: 0, block: 't' };
    book(order, 4100, 100, 0, false);
    expect(f.fills[0]!.fee).toBe(100);
    book({ ...order, localId: 2 }, 4100, 100, 0, true);
    expect(f.fills[1]!.fee).toBe(130);
  });

  it('a minimum resting time refuses an early cancel and the order stays resting', () => {
    const ex = new Exchange(EXCHANGES[0]!, STOCKS);
    ex.rules = { ...DEFAULT_RULES, minRestMs: 500 };
    const { order } = ex.submit('ABC', { owner: 'mm', side: 'buy', price: 4000, size: 100 }, 1000)!;
    expect(ex.cancel('ABC', order.id, 1200).refused).toMatch(/rest/);
    expect(ex.book('ABC').resting('mm')).toHaveLength(1);
    expect(ex.cancel('ABC', order.id, 1600).order?.id).toBe(order.id);
    // Through a firm: the cancel comes back refused and the order is resting again, with the reason on it.
    const f = new Firm('firm', 'Mine', MILLION, FAST, Firm.defaultBlocks());
    const w = world(71, [f]);
    w.market.exchange('HARBOR').rules = { ...DEFAULT_RULES, minRestMs: 2000 };
    w.run(MS_PER_SECOND);
    const send = (f as unknown as { send: (i: unknown, b: string, now: number, view: unknown) => void }).send.bind(f);
    send(
      { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'buy', price: 3000, size: 100, ioc: false },
      't',
      w.now(),
      {
        quotes: {},
      },
    );
    w.run(100);
    const o = [...f.orders.values()][0]!;
    expect(o.status).toBe('resting');
    send({ kind: 'cancel', localId: o.localId }, 't', w.now(), { quotes: {} });
    expect(o.status).toBe('cancelling');
    w.run(100);
    expect(o.status).toBe('resting');
    expect(o.reason).toMatch(/rest/);
    // Once it has rested long enough, the cancel goes through.
    w.run(2500);
    send({ kind: 'cancel', localId: o.localId }, 't', w.now(), { quotes: {} });
    w.run(100);
    expect(o.status).toBe('cancelled');
  });

  it('a wider tick puts every price on the grid and the spread at a tick or more', () => {
    const ex = new Exchange(EXCHANGES[0]!, STOCKS);
    ex.rules = { ...DEFAULT_RULES, tickSize: 5 };
    const random = new Random(72);
    const fair = new Map(STOCKS.map((s) => [s.symbol, s.startPrice]));
    for (let t = MARKET_OPEN; t < MARKET_OPEN + 2 * MS_PER_SECOND; t += TICK) ex.step(t, TICK, fair, 1, random);
    const q = ex.quote('ABC');
    expect(q.bid! % 5).toBe(0);
    expect(q.ask! % 5).toBe(0);
    expect(ex.book('ABC').spread()!).toBeGreaterThanOrEqual(5);
    const { order } = ex.submit('ABC', { owner: 'f', side: 'buy', price: 4098, size: 100 }, MARKET_OPEN + 3000)!;
    expect(order.price).toBe(4100);
  });

  it('with post-only off, a post-only order that would cross is a plain order and takes', () => {
    const ex = new Exchange(EXCHANGES[0]!, STOCKS);
    ex.submit('ABC', { owner: 'x', side: 'sell', price: 4105, size: 50 }, 0);
    expect(
      ex.submit('ABC', { owner: 'mm', side: 'buy', price: 4105, size: 100, postOnly: true }, 1)!.refused,
    ).not.toBeNull();
    ex.rules = { ...DEFAULT_RULES, postOnly: false };
    const r = ex.submit('ABC', { owner: 'mm', side: 'buy', price: 4105, size: 100, postOnly: true }, 2)!;
    expect(r.refused).toBeNull();
    expect(r.trades).toHaveLength(1);
  });

  it('a batch auction matches at the batch, and takes the race away from the faster firm', () => {
    const slow = new Firm('slow', 'Slow', MILLION, SLOW, Firm.defaultBlocks(['arbitrage']));
    const fast = new Firm('fast', 'Fast', MILLION, FAST, Firm.defaultBlocks(['arbitrage']));
    const open = world(73, [slow, fast]);
    open.run(120 * MS_PER_SECOND);
    const openEdge = won(fast) / Math.max(1, won(slow));

    const slow2 = new Firm('slow', 'Slow', MILLION, SLOW, Firm.defaultBlocks(['arbitrage']));
    const fast2 = new Firm('fast', 'Fast', MILLION, FAST, Firm.defaultBlocks(['arbitrage']));
    const batched = world(73, [slow2, fast2]);
    for (const e of batched.market.exchanges) e.rules = { ...DEFAULT_RULES, batchMs: 100 };
    batched.run(120 * MS_PER_SECOND);
    expect(won(fast2) + won(slow2)).toBeGreaterThan(0);
    const batchEdge = won(fast2) / Math.max(1, won(slow2));
    expect(batchEdge).toBeLessThan(openEdge);
    // An order sent under a batch is acked at the batch, not on arrival.
    const acked = [...fast2.orders.values()].filter((o) => o.ackAt !== null && o.arrivedAt !== null);
    expect(acked.some((o) => o.arrivedAt! - o.sentAt > fast2.latency(o.exchange) + TICK)).toBe(true);
  });
});
