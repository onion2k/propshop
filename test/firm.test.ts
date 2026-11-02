import { MARKET_CLOSE, MARKET_OPEN, MS_PER_SECOND } from '../src/sim/clock';
import { Firm, REJECT_EXPOSURE } from '../src/sim/firm';
import { tick } from '../src/sim/flow';
import { Market } from '../src/sim/market';
import { Random } from '../src/sim/random';
import { EXCHANGES, FAST, SLOW, STOCKS, TICK } from './fixtures';

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

const MILLION = 100_000_000;

describe('Firm', () => {
  it('starts flat, with the blocks it is given off or on', () => {
    const f = new Firm('firm', 'Mine', MILLION, SLOW, Firm.defaultBlocks(['arbitrage']));
    expect(f.enabledBlocks().map((b) => b.id)).toEqual(['arbitrage']);
    expect(f.position('ABC')).toBe(0);
    expect(f.latency('HARBOR')).toBe(40);
  });

  it('caps the blocks it runs at what the computer allows', () => {
    const f = new Firm('firm', 'Mine', MILLION, SLOW, Firm.defaultBlocks(['arbitrage', 'momentum']));
    expect(f.enabledBlocks()).toHaveLength(1);
    f.infra = FAST;
    expect(f.enabledBlocks()).toHaveLength(2);
  });

  it('sends an order that arrives after its latency, and books the fill after the round trip', () => {
    const f = new Firm('firm', 'Mine', MILLION, SLOW, Firm.defaultBlocks());
    const w = world(21, [f]);
    w.run(2 * MS_PER_SECOND);
    const ask = w.market.exchange('HARBOR').quote('ABC').ask!;
    // Reach in as a block would: one IOC buy at the ask.
    f.setBlock('arbitrage', { enabled: false });
    (f as unknown as { send: (i: unknown, b: string, now: number, view: unknown) => void }).send(
      { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'buy', price: ask, size: 100, ioc: true },
      'test',
      w.now(),
      { quotes: {} },
    );
    const order = [...f.orders.values()][0]!;
    expect(order.status).toBe('inflight');
    w.run(30);
    expect(f.position('ABC')).toBe(0);
    expect(w.market.exchange('HARBOR').book('ABC').lastPrice).not.toBe(null);
    w.run(60);
    expect(f.position('ABC')).toBe(100);
    expect(['filled', 'cancelled']).toContain(order.status);
    const fill = f.fills[0]!;
    expect(fill.size).toBe(100);
    expect(fill.fee).toBe(30);
    expect(f.cash).toBe(MILLION - fill.price * 100 - 30);
    expect(f.feesPaid).toBe(30);
  });

  it('keeps cash, positions and realised P&L reconciled through a round trip', () => {
    const f = new Firm('firm', 'Mine', MILLION, FAST, Firm.defaultBlocks());
    const book = (
      f as unknown as { book: (o: unknown, price: number, size: number, at: number, taker: boolean) => void }
    ).book.bind(f);
    f.feeTable = { HARBOR: 0.3 };
    const order = (side: 'buy' | 'sell') => ({
      localId: 1,
      exchange: 'HARBOR',
      exchangeOrderId: 1,
      symbol: 'ABC',
      side,
      price: 0,
      size: 1000,
      filled: 0,
      ioc: true,
      status: 'inflight',
      block: 't',
      sentAt: 0,
      seenAt: null,
      arrivedAt: null,
      ackAt: null,
      beatenBy: [],
    });
    book(order('buy'), 4100, 100, 0, true);
    book(order('buy'), 4102, 100, 0, true);
    expect(f.positions.get('ABC')).toEqual({ qty: 200, avgCost: 4101 });
    book(order('sell'), 4105, 150, 0, true);
    expect(f.positions.get('ABC')).toEqual({ qty: 50, avgCost: 4101 });
    expect(f.realised).toBe(4 * 150);
    book(order('sell'), 4090, 100, 0, false);
    // Fifty closed at a loss of eleven, then short fifty at 4090.
    expect(f.positions.get('ABC')).toEqual({ qty: -50, avgCost: 4090 });
    expect(f.realised).toBe(600 - 11 * 50);
    // The last fill was a resting order's: no fee on it.
    expect(f.feesPaid).toBe(Math.round(0.3 * 350));
    expect(f.cash).toBe(MILLION - 4100 * 100 - 4102 * 100 + 4105 * 150 + 4090 * 100 - f.feesPaid);
  });

  it('lets the arbitrage block make money against the crowd, and the faster firm makes more of it', () => {
    const slow = new Firm('slow', 'Slow', MILLION, SLOW, Firm.defaultBlocks(['arbitrage']));
    const fast = new Firm('fast', 'Fast', MILLION, FAST, Firm.defaultBlocks(['arbitrage']));
    const w = world(22, [slow, fast]);
    w.run(120 * MS_PER_SECOND);
    expect(fast.stats.fillsReceived).toBeGreaterThan(10);
    expect(fast.stats.fillsReceived).toBeGreaterThan(slow.stats.fillsReceived);
    const fastPnl = fast.realised - fast.feesPaid + fast.unrealised(w.market, w.now());
    const slowPnl = slow.realised - slow.feesPaid + slow.unrealised(w.market, w.now());
    expect(fastPnl).toBeGreaterThan(0);
    expect(fastPnl).toBeGreaterThan(slowPnl);
  });

  it('tells a slow firm who took the quote before its order arrived', () => {
    const slow = new Firm('slow', 'Slow', MILLION, SLOW, Firm.defaultBlocks(['arbitrage']));
    const fast = new Firm('fast', 'Fast', MILLION, FAST, Firm.defaultBlocks(['arbitrage']));
    const w = world(27, [slow, fast]);
    w.run(120 * MS_PER_SECOND);
    const orders = [...slow.orders.values()].filter((o) => o.ackAt !== null);
    expect(orders.length).toBeGreaterThan(0);
    for (const o of orders) {
      expect(o.seenAt).not.toBeNull();
      expect(o.arrivedAt! - o.sentAt).toBe(slow.latency(o.exchange));
      expect(o.ackAt! - o.arrivedAt!).toBe(slow.latency(o.exchange));
    }
    const beaten = orders.filter((o) => o.beatenBy.some((b) => b.owner === 'fast'));
    expect(beaten.length).toBeGreaterThan(0);
    const first = beaten[0]!.beatenBy.find((b) => b.owner === 'fast')!;
    expect(first.at).toBeGreaterThanOrEqual(beaten[0]!.seenAt!);
    expect(first.at).toBeLessThanOrEqual(beaten[0]!.arrivedAt!);
  });

  it('drops orders past the computer capacity and counts them', () => {
    const f = new Firm(
      'firm',
      'Mine',
      MILLION,
      { ...SLOW, computer: { ...SLOW.computer, ordersPerSecond: 2 } },
      Firm.defaultBlocks(['marketMaker']),
    );
    const w = world(23, [f]);
    w.run(3 * MS_PER_SECOND);
    expect(f.stats.ordersDropped).toBeGreaterThan(0);
    expect(f.stats.ordersSent).toBeLessThanOrEqual(2 * 4);
  });

  it('hears that its resting orders are gone at the close', () => {
    const f = new Firm('firm', 'Mine', MILLION, FAST, Firm.defaultBlocks(['marketMaker']));
    const w = world(24, [f], MARKET_CLOSE - 3 * MS_PER_SECOND);
    w.run(2 * MS_PER_SECOND);
    expect([...f.orders.values()].some((o) => o.status === 'resting')).toBe(true);
    w.run(2 * MS_PER_SECOND);
    expect([...f.orders.values()].some((o) => o.status === 'resting')).toBe(false);
  });

  it('books a fill to the right stock when two orders share an exchange order id', () => {
    const f = new Firm('firm', 'Mine', MILLION, FAST, Firm.defaultBlocks());
    const w = world(26, [f]);
    w.run(MS_PER_SECOND);
    const order = (localId: number, symbol: string) => ({
      localId,
      exchange: 'HARBOR',
      exchangeOrderId: 7,
      symbol,
      side: 'buy' as const,
      price: 4000,
      size: 100,
      filled: 0,
      ioc: true,
      status: 'inflight' as const,
      block: 't',
      sentAt: 0,
      seenAt: null,
      arrivedAt: null,
      ackAt: null,
      beatenBy: [],
    });
    f.orders.set(1, order(1, 'ABC'));
    f.orders.set(2, order(2, 'XYZ'));
    const trade = {
      price: 2500,
      size: 100,
      at: w.now(),
      buyId: 7,
      sellId: 99,
      buyer: 'firm',
      seller: 'bg',
      aggressor: 'buy' as const,
    };
    f.onTrade(w.market.exchange('HARBOR'), 'XYZ', trade, w.now());
    w.run(50);
    expect(f.position('XYZ')).toBe(100);
    expect(f.position('ABC')).toBe(0);
    expect(f.fills[0]).toMatchObject({ symbol: 'XYZ', price: 2500 });
  });

  it('saves and loads whole', () => {
    const f = new Firm('firm', 'Mine', MILLION, FAST, Firm.defaultBlocks(['arbitrage']));
    const w = world(25, [f]);
    w.run(5 * MS_PER_SECOND);
    const copy = Firm.load(JSON.parse(JSON.stringify(f.save())) as ReturnType<Firm['save']>, FAST);
    expect(copy.cash).toBe(f.cash);
    expect(copy.position('ABC')).toBe(f.position('ABC'));
    expect(copy.fills).toEqual(f.fills);
    expect(copy.blocks).toEqual(f.blocks);
  });
});

describe('Firm with racks at both exchanges', () => {
  it('sees the far quote late but lands its order there at once, and wins more races than one rack does', () => {
    const dual = {
      ...FAST,
      location: {
        ...FAST.location,
        id: 'dual',
        distance: { HARBOR: 0.1, LAKESIDE: 0.1 },
        dataDistance: { HARBOR: 0.1, LAKESIDE: 8 },
      },
    };
    const both = new Firm('both', 'Both', MILLION, dual, Firm.defaultBlocks(['arbitrage']));
    const one = new Firm('one', 'One', MILLION, FAST, Firm.defaultBlocks(['arbitrage']));
    expect(both.latency('LAKESIDE')).toBe(1);
    expect(both.dataLatency('LAKESIDE')).toBe(8.5);
    expect(one.latency('LAKESIDE')).toBe(8.5);
    const w = world(30, [one, both]);
    w.run(120 * MS_PER_SECOND);
    const lakeside = (f: Firm) => [...f.orders.values()].filter((o) => o.exchange === 'LAKESIDE' && o.ackAt !== null);
    // Arrival is rounded up to the tick.
    for (const o of lakeside(both)) expect(o.arrivedAt! - o.sentAt).toBe(TICK);
    for (const o of lakeside(one)) expect(o.arrivedAt! - o.sentAt).toBe(Math.ceil(8.5 / TICK) * TICK);
    const won = (f: Firm) => [...f.orders.values()].filter((o) => o.ioc && o.filled >= o.size).length;
    expect(won(both)).toBeGreaterThan(won(one));
  });
});

describe('Firm risk', () => {
  it('refuses an order that would carry more than the leverage allows, and says why', () => {
    const f = new Firm('firm', 'Mine', 1_000_000, FAST, Firm.defaultBlocks());
    f.risk = { dailyLossLimit: 100_000, maxLeverage: 1 };
    const w = world(28, [f]);
    w.run(2 * MS_PER_SECOND);
    const ask = w.market.exchange('HARBOR').quote('ABC').ask!;
    const send = (size: number) =>
      (f as unknown as { send: (i: unknown, b: string, now: number, view: unknown) => void }).send(
        { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'buy', price: ask, size, ioc: true },
        'test',
        w.now(),
        { quotes: {} },
      );
    // Equity is ten thousand dollars; 300 shares at forty-one is more than that.
    send(300);
    const rejected = [...f.orders.values()].find((o) => o.status === 'rejected');
    expect(rejected?.reason).toBe(REJECT_EXPOSURE);
    expect(f.stats.ordersRejected).toBe(1);
    send(100);
    expect([...f.orders.values()].filter((o) => o.status === 'inflight')).toHaveLength(1);
  });

  it('halts: pulls what rests, gets flat, and decides nothing until the moment passes', () => {
    const f = new Firm('firm', 'Mine', MILLION, FAST, Firm.defaultBlocks(['marketMaker']));
    const w = world(29, [f]);
    w.run(5 * MS_PER_SECOND);
    (f as unknown as { book: (o: unknown, p: number, s: number, at: number, t: boolean) => void }).book(
      { localId: 999, exchange: 'HARBOR', symbol: 'ABC', side: 'buy', size: 100, filled: 0, block: 't' },
      4100,
      100,
      w.now(),
      true,
    );
    expect(f.position('ABC')).toBe(100);
    expect([...f.orders.values()].some((o) => o.status === 'resting')).toBe(true);
    const sentBefore = f.stats.ordersSent;
    f.haltUntil(w.now() + 10 * MS_PER_SECOND, 'test', w.now(), w.market, []);
    w.run(MS_PER_SECOND);
    expect(f.position('ABC')).toBe(0);
    expect([...f.orders.values()].some((o) => o.status === 'resting')).toBe(false);
    const sentAfter = f.stats.ordersSent;
    w.run(5 * MS_PER_SECOND);
    expect(f.stats.ordersSent).toBe(sentAfter);
    expect(sentAfter).toBeGreaterThan(sentBefore);
    w.run(6 * MS_PER_SECOND);
    expect(f.halt).toBeNull();
    expect(f.stats.ordersSent).toBeGreaterThan(sentAfter);
  });
});
