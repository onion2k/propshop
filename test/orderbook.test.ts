import { MAX_RESTING_PER_SIDE, OrderBook, type SavedBook } from '../src/sim/orderbook';

describe('OrderBook', () => {
  it('rests orders and quotes the best of each side', () => {
    const b = new OrderBook();
    b.add({ owner: 'a', side: 'buy', price: 4100, size: 100 }, 0);
    b.add({ owner: 'a', side: 'buy', price: 4102, size: 50 }, 1);
    b.add({ owner: 'a', side: 'sell', price: 4105, size: 200 }, 2);
    b.add({ owner: 'a', side: 'sell', price: 4104, size: 20 }, 3);
    expect(b.quote()).toEqual({
      bid: 4102,
      ask: 4104,
      bidSize: 50,
      askSize: 20,
      bid2: 4100,
      ask2: 4105,
      bid2Size: 100,
      ask2Size: 200,
    });
    expect(b.spread()).toBe(2);
    expect(b.mid()).toBe(4103);
  });

  it('matches at the resting price, best price first, then oldest first', () => {
    const b = new OrderBook();
    const first = b.add({ owner: 'x', side: 'sell', price: 4105, size: 100 }, 0).order;
    const second = b.add({ owner: 'y', side: 'sell', price: 4105, size: 100 }, 1).order;
    const cheaper = b.add({ owner: 'z', side: 'sell', price: 4104, size: 30 }, 2).order;
    const { order, trades } = b.add({ owner: 'buyer', side: 'buy', price: 4110, size: 150 }, 3);
    expect(trades.map((t) => [t.sellId, t.price, t.size])).toEqual([
      [cheaper.id, 4104, 30],
      [first.id, 4105, 100],
      [second.id, 4105, 20],
    ]);
    expect(order.remaining).toBe(0);
    expect(trades.every((t) => t.aggressor === 'buy' && t.buyer === 'buyer')).toBe(true);
    expect(b.quote().ask).toBe(4105);
    expect(b.quote().askSize).toBe(80);
    expect(b.lastPrice).toBe(4105);
  });

  it('rests the remainder of a limit order and drops the remainder of an IOC', () => {
    const b = new OrderBook();
    b.add({ owner: 'x', side: 'sell', price: 4105, size: 50 }, 0);
    const limit = b.add({ owner: 'b', side: 'buy', price: 4105, size: 80 }, 1);
    expect(limit.trades).toHaveLength(1);
    expect(b.quote().bid).toBe(4105);
    expect(b.quote().bidSize).toBe(30);

    b.add({ owner: 'x', side: 'sell', price: 4106, size: 10 }, 2);
    const ioc = b.add({ owner: 'c', side: 'buy', price: 4106, size: 80, ioc: true }, 3);
    expect(ioc.trades).toHaveLength(1);
    expect(ioc.order.remaining).toBe(70);
    expect(b.resting('c')).toHaveLength(0);
  });

  it('does not match when prices do not cross', () => {
    const b = new OrderBook();
    b.add({ owner: 'x', side: 'sell', price: 4105, size: 50 }, 0);
    const { trades } = b.add({ owner: 'b', side: 'buy', price: 4104, size: 50 }, 1);
    expect(trades).toHaveLength(0);
    expect(b.spread()).toBe(1);
  });

  it('cancels by id and by owner test', () => {
    const b = new OrderBook();
    const o1 = b.add({ owner: 'mm', side: 'buy', price: 4100, size: 10 }, 0).order;
    b.add({ owner: 'mm', side: 'sell', price: 4110, size: 10 }, 5);
    b.add({ owner: 'other', side: 'sell', price: 4111, size: 10 }, 6);
    expect(b.cancel(o1.id)?.id).toBe(o1.id);
    expect(b.cancel(o1.id)).toBeNull();
    const gone = b.cancelWhere('mm', (o) => o.at < 10);
    expect(gone).toHaveLength(1);
    expect(b.count()).toBe(1);
  });

  it('aggregates depth by price level', () => {
    const b = new OrderBook();
    b.add({ owner: 'a', side: 'buy', price: 4100, size: 10 }, 0);
    b.add({ owner: 'b', side: 'buy', price: 4100, size: 20 }, 1);
    b.add({ owner: 'c', side: 'buy', price: 4099, size: 5 }, 2);
    b.add({ owner: 'd', side: 'buy', price: 4098, size: 5 }, 3);
    const d = b.depth(2);
    expect(d.bids).toEqual([
      { price: 4100, size: 30, orders: 2 },
      { price: 4099, size: 5, orders: 1 },
    ]);
    expect(d.asks).toEqual([]);
  });

  it('refuses a non-integer or non-positive price or size', () => {
    const b = new OrderBook();
    expect(() => b.add({ owner: 'a', side: 'buy', price: 41.5, size: 10 }, 0)).toThrow();
    expect(() => b.add({ owner: 'a', side: 'buy', price: 4100, size: 0 }, 0)).toThrow();
  });

  it('never holds more than the ceiling on a side', () => {
    const b = new OrderBook();
    for (let i = 0; i < MAX_RESTING_PER_SIDE + 50; i++) {
      b.add({ owner: 'spray', side: 'buy', price: 4000 - (i % 300), size: 1 }, i);
    }
    expect(b.depth(1000).bids.reduce((n, l) => n + l.orders, 0)).toBe(MAX_RESTING_PER_SIDE);
  });

  it('saves and loads', () => {
    const b = new OrderBook();
    b.add({ owner: 'a', side: 'buy', price: 4100, size: 10 }, 0);
    b.add({ owner: 'a', side: 'sell', price: 4103, size: 10 }, 1);
    const c = OrderBook.load(JSON.parse(JSON.stringify(b.save())) as SavedBook);
    expect(c.quote()).toEqual(b.quote());
    const next = c.add({ owner: 'z', side: 'buy', price: 4103, size: 5 }, 2);
    expect(next.order.id).toBe(3);
    expect(next.trades).toHaveLength(1);
  });
});
