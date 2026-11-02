import { MARKET_CLOSE, MARKET_OPEN, MS_PER_SECOND } from '../src/sim/clock';
import { Firm } from '../src/sim/firm';
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
    (f as unknown as { send: (i: unknown, b: string, now: number) => void }).send(
      { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'buy', price: ask, size: 100, ioc: true },
      'test',
      w.now(),
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
