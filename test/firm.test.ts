import { MARKET_CLOSE, MARKET_OPEN, MS_PER_SECOND } from '../src/sim/clock';
import { Firm, HAND_BLOCK, MAX_PENDING_HAND, REJECT_EXPOSURE, REJECT_MARKET_CLOSED } from '../src/sim/firm';
import type { HandIntent } from '../src/sim/strategy';
import { TAPE_VIEW } from '../src/sim/strategy';
import { REFUSED_CROSSED } from '../src/sim/orderbook';
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

describe('Firm order types', () => {
  it('hears a post-only quote refused with its reason, and no race counted', () => {
    const f = new Firm('firm', 'Mine', MILLION, FAST, Firm.defaultBlocks());
    const w = world(31, [f]);
    w.run(2 * MS_PER_SECOND);
    const ask = w.market.exchange('HARBOR').quote('ABC').ask!;
    (f as unknown as { send: (i: unknown, b: string, now: number, view: unknown) => void }).send(
      {
        kind: 'order',
        symbol: 'ABC',
        exchange: 'HARBOR',
        side: 'buy',
        price: ask + 20,
        size: 100,
        ioc: false,
        postOnly: true,
      },
      'test',
      w.now(),
      { quotes: {} },
    );
    w.run(40);
    const o = [...f.orders.values()][0]!;
    expect(o.status).toBe('rejected');
    expect(o.reason).toBe(REFUSED_CROSSED);
    expect(f.position('ABC')).toBe(0);
    expect(f.tickResolved.length + 1).toBeGreaterThan(0);
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

describe('Firm gap log', () => {
  // The firm's view of two exchanges, held by hand: one quote per exchange, changed between decisions.
  function crossable() {
    const f = new Firm('firm', 'Mine', MILLION, FAST, []);
    const market = new Market(STOCKS, EXCHANGES);
    const seen: Record<string, { bid: number | null; ask: number | null }> = {
      HARBOR: { bid: 4099, ask: 4101 },
      LAKESIDE: { bid: 4099, ask: 4101 },
    };
    for (const e of market.exchanges) {
      e.quoteAsOf = (symbol: string, at: number) =>
        symbol === 'ABC'
          ? {
              bid: seen[e.id]!.bid,
              ask: seen[e.id]!.ask,
              bidSize: 100,
              askSize: 100,
              bid2: null,
              ask2: null,
              bid2Size: 0,
              ask2Size: 0,
              at,
            }
          : null;
    }
    f.feeTable = { HARBOR: 0.3, LAKESIDE: 0.25 };
    f.taxes = { HARBOR: 0, LAKESIDE: 0 };
    f.watch = ['ABC'];
    let now = MARKET_OPEN;
    const decide = (n = 1) => {
      for (let i = 0; i < n; i++) {
        now += FAST.computer.decisionEveryMs;
        f.step(now, market, [], true);
      }
    };
    // Lakeside's ask is under Harbor's bid: buy at Lakeside, sell at Harbor.
    const cross = () => {
      seen.HARBOR = { bid: 4105, ask: 4107 };
      seen.LAKESIDE = { bid: 4101, ask: 4103 };
    };
    const uncross = () => {
      seen.HARBOR = { bid: 4099, ask: 4101 };
      seen.LAKESIDE = { bid: 4099, ask: 4101 };
    };
    return { f, seen, decide, cross, uncross, now: () => now };
  }

  it('records one episode across consecutive decisions, with its prices, edge after both taker fees, and times', () => {
    const w = crossable();
    w.decide(2);
    expect(w.f.gapLog).toEqual([]);
    w.cross();
    w.decide();
    const first = w.now();
    w.decide(4);
    expect(w.f.gapLog).toHaveLength(1);
    expect(w.f.gapLog[0]).toEqual({
      symbol: 'ABC',
      buyOn: 'LAKESIDE',
      sellOn: 'HARBOR',
      ask: 4103,
      bid: 4105,
      // 4105 - 4103 = 2 cents, less 0.25 to buy and 0.30 to sell.
      edge: 1.45,
      firstSeen: first,
      lastSeen: w.now(),
    });
    expect(w.f.stats.gapsSeen).toBe(5);
  });

  it('charges a tax as well as the fee on each leg', () => {
    const w = crossable();
    w.f.taxes = { HARBOR: 0.1, LAKESIDE: 0 };
    w.cross();
    w.decide();
    expect(w.f.gapLog[0]!.edge).toBe(1.35);
  });

  it('keeps a gap smaller than the fees, with a negative edge', () => {
    const w = crossable();
    w.seen.HARBOR = { bid: 4104, ask: 4107 };
    w.seen.LAKESIDE = { bid: 4101, ask: 4103 };
    w.f.feeTable = { HARBOR: 0.8, LAKESIDE: 0.5 };
    w.decide();
    // One cent of gap, 1.3 cents of fees.
    expect(w.f.gapLog[0]!.edge).toBe(-0.3);
  });

  it('closes an episode when the books uncross, and starts a second when they cross again', () => {
    const w = crossable();
    w.cross();
    w.decide(3);
    w.uncross();
    w.decide(2);
    w.cross();
    w.decide(2);
    expect(w.f.gapLog).toHaveLength(2);
    expect(w.f.gapLog[0]!.lastSeen).toBeLessThan(w.f.gapLog[1]!.firstSeen);
  });

  it('starts a new episode when the same symbol crosses the other way round', () => {
    const w = crossable();
    w.cross();
    w.decide(2);
    w.seen.HARBOR = { bid: 4101, ask: 4103 };
    w.seen.LAKESIDE = { bid: 4105, ask: 4107 };
    w.decide();
    expect(w.f.gapLog.map((g) => [g.buyOn, g.sellOn])).toEqual([
      ['LAKESIDE', 'HARBOR'],
      ['HARBOR', 'LAKESIDE'],
    ]);
  });

  it('holds twenty episodes at most, the newest', () => {
    const w = crossable();
    for (let i = 0; i < 25; i++) {
      w.cross();
      w.seen.HARBOR = { bid: 4105 + i, ask: 4107 + i };
      w.decide();
      w.uncross();
      w.decide();
    }
    expect(w.f.gapLog).toHaveLength(20);
    expect(w.f.gapLog[0]!.bid).toBe(4105 + 5);
    expect(w.f.gapLog[19]!.bid).toBe(4105 + 24);
  });

  it('is not saved, and a loaded firm starts with an empty log', () => {
    const w = crossable();
    w.cross();
    w.decide(2);
    expect(w.f.gapLog).toHaveLength(1);
    const saved = w.f.save();
    expect(JSON.stringify(saved)).not.toMatch(/gapLog|firstSeen/);
    expect(Firm.load(JSON.parse(JSON.stringify(saved)) as ReturnType<Firm['save']>, FAST).gapLog).toEqual([]);
  });
});

describe('hand orders', () => {
  const REACTION = 250;
  const buy = (over: Partial<HandIntent> = {}): HandIntent => ({
    symbol: 'ABC',
    side: 'buy',
    size: 100,
    exchange: 'HARBOR',
    type: 'market',
    ...over,
  });
  const firmAt = (infra: typeof SLOW, id = 'firm') => {
    const f = new Firm(id, 'Mine', MILLION, infra, Firm.defaultBlocks());
    f.reactionMs = REACTION;
    return f;
  };
  /** A rival reaches in as a block would and takes the whole of HARBOR's ask. */
  const takeTheAsk = (rival: Firm, w: ReturnType<typeof world>) => {
    const q = w.market.exchange('HARBOR').quote('ABC');
    (rival as unknown as { send: (i: unknown, b: string, now: number, view: unknown) => void }).send(
      { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'buy', price: q.ask!, size: q.askSize, ioc: true },
      'test',
      w.now(),
      { quotes: {} },
    );
  };
  const handOrders = (f: Firm) => [...f.orders.values()].filter((o) => o.block === HAND_BLOCK);

  it('waits the reaction time from home, then races and is beaten by a rival it names', () => {
    const me = firmAt(SLOW);
    const rival = firmAt(FAST, 'fast');
    const w = world(31, [me, rival]);
    w.run(2 * MS_PER_SECOND);
    const clicked = w.now();
    const result = me.hand(buy(), clicked, w.market, []);
    expect(result).toEqual({ ok: true, dueAt: clicked + REACTION });
    w.run(100);
    takeTheAsk(rival, w);
    w.run(REACTION - 100 - TICK);
    // Not yet gone: nothing of it is on the wire, and it waits in the pending list.
    expect(handOrders(me)).toHaveLength(0);
    expect(me.pendingHand).toHaveLength(1);
    w.run(2 * TICK);
    const order = handOrders(me)[0]!;
    expect(me.pendingHand).toHaveLength(0);
    expect(order.sentAt).toBe(clicked + REACTION);
    w.run(150);
    expect(order.arrivedAt! - order.sentAt).toBe(me.latency('HARBOR'));
    expect(order.seenAt).not.toBeNull();
    expect(order.beatenBy.map((b) => b.owner)).toContain('fast');
    expect(order.beatenBy[0]!.at).toBeLessThanOrEqual(order.arrivedAt!);
  });

  it('fills the same order from colocation', () => {
    const me = firmAt(FAST);
    const w = world(31, [me]);
    w.run(2 * MS_PER_SECOND);
    me.hand(buy(), w.now(), w.market, []);
    w.run(REACTION + 50);
    const order = handOrders(me)[0]!;
    expect(order.status).toBe('filled');
    expect(order.beatenBy).toEqual([]);
    expect(me.position('ABC')).toBe(100);
  });

  it('is refused with the reason while the market is closed, and says so in the order log', () => {
    const me = firmAt(FAST);
    const w = world(32, [me], MARKET_CLOSE + 10 * MS_PER_SECOND);
    w.run(MS_PER_SECOND);
    const result = me.hand(buy(), w.now(), w.market, []);
    expect(result).toMatchObject({ ok: false, reason: REJECT_MARKET_CLOSED });
    expect(REJECT_MARKET_CLOSED).toBe('market closed');
    expect(me.pendingHand).toHaveLength(0);
    expect(me.orders.get((result as { localId: number }).localId)).toMatchObject({
      status: 'rejected',
      reason: REJECT_MARKET_CLOSED,
      block: HAND_BLOCK,
    });
  });

  it('refuses a click that lands after the close has come', () => {
    const me = firmAt(FAST);
    // A click a tenth of a second before the close leaves a quarter second later, into a closed market.
    const w = world(33, [me], MARKET_CLOSE - 2 * MS_PER_SECOND);
    w.run(2 * MS_PER_SECOND - 100);
    expect(me.hand(buy(), w.now(), w.market, []).ok).toBe(true);
    w.run(REACTION + 2 * TICK);
    expect(me.pendingHand).toHaveLength(0);
    expect(handOrders(me).map((o) => [o.status, o.reason])).toEqual([['rejected', REJECT_MARKET_CLOSED]]);
  });

  it('refuses a click while halted, with the halt\u2019s reason, and takes it again after', () => {
    const me = firmAt(FAST);
    const w = world(34, [me]);
    w.run(2 * MS_PER_SECOND);
    me.haltUntil(w.now() + 10 * MS_PER_SECOND, 'daily loss limit', w.now(), w.market, []);
    const result = me.hand(buy(), w.now(), w.market, []);
    expect(result).toMatchObject({ ok: false, reason: 'daily loss limit' });
    expect(me.pendingHand).toHaveLength(0);
    expect(handOrders(me).map((o) => [o.status, o.reason])).toEqual([['rejected', 'daily loss limit']]);
    w.run(11 * MS_PER_SECOND);
    expect(me.hand(buy(), w.now(), w.market, []).ok).toBe(true);
  });

  it('sweeps on to a second exchange for a size past the first quote, all stamped with one seenAt', () => {
    const me = firmAt(FAST);
    const w = world(34, [me]);
    w.run(2 * MS_PER_SECOND);
    const asks = ['HARBOR', 'LAKESIDE'].map((id) => w.market.exchange(id).quote('ABC'));
    expect(asks.every((q) => q.ask !== null)).toBe(true);
    const bestFirst = asks[0]!.ask! <= asks[1]!.ask! ? 0 : 1;
    const first = asks[bestFirst]!;
    me.hand(buy({ exchange: 'best', size: first.askSize + 1 }), w.now(), w.market, []);
    w.run(REACTION + TICK);
    const children = handOrders(me);
    expect(new Set(children.map((o) => o.exchange)).size).toBe(2);
    expect(children[0]!.exchange).toBe(bestFirst === 0 ? 'HARBOR' : 'LAKESIDE');
    expect(children[0]!.size).toBe(first.askSize);
    expect(children.reduce((n, o) => n + o.size, 0)).toBe(first.askSize + 1);
    expect(new Set(children.map((o) => o.seenAt)).size).toBe(1);
    expect(children[0]!.seenAt).not.toBeNull();
  });

  it('rests a limit order it cannot yet fill', () => {
    const me = firmAt(FAST);
    const w = world(35, [me]);
    w.run(2 * MS_PER_SECOND);
    const bid = w.market.exchange('HARBOR').quote('ABC').bid!;
    me.hand(buy({ type: 'limit', price: bid - 2 }), w.now(), w.market, []);
    w.run(REACTION + 20);
    const order = handOrders(me)[0]!;
    expect(order.ioc).toBe(false);
    expect(order.status).toBe('resting');
  });

  it('saves its pending hand orders and loads them to the same future', () => {
    const me = firmAt(SLOW);
    const w = world(36, [me]);
    w.run(2 * MS_PER_SECOND);
    me.hand(buy({ exchange: 'best', size: 700 }), w.now(), w.market, []);
    w.run(100);
    const saved = JSON.parse(JSON.stringify(me.save())) as ReturnType<Firm['save']>;
    expect(saved.pendingHand).toHaveLength(1);
    const loaded = Firm.load(saved, SLOW);
    expect(loaded.pendingHand).toEqual(me.pendingHand);
    w.run(REACTION);
    expect(loaded.pendingHand).toHaveLength(1);
    // The saved firm, stepped past its due time, sends the same orders the original did.
    loaded.reactionMs = REACTION;
    loaded.step(me.pendingHand[0]?.dueAt ?? w.now(), w.market, [], true);
    expect(handOrders(me).length).toBeGreaterThan(0);
    expect(handOrders(loaded).map((o) => [o.exchange, o.size, o.price, o.seenAt])).toEqual(
      handOrders(me).map((o) => [o.exchange, o.size, o.price, o.seenAt]),
    );
  });

  it('keeps the pending list to its bound', () => {
    const me = firmAt(FAST);
    const w = world(37, [me]);
    w.run(2 * MS_PER_SECOND);
    for (let i = 0; i < MAX_PENDING_HAND + 5; i++) me.hand(buy(), w.now(), w.market, []);
    expect(me.pendingHand).toHaveLength(MAX_PENDING_HAND);
  });
});

describe('the view', () => {
  it('carries the tape and the depth through the data latency, bounded and without owners', () => {
    const f = new Firm('firm', 'Mine', MILLION, SLOW, Firm.defaultBlocks());
    const w = world(38, [f]);
    w.run(60 * MS_PER_SECOND);
    const view = (
      f as unknown as { view: (now: number, m: Market, n: unknown[]) => import('../src/sim/strategy').MarketView }
    ).view(w.now(), w.market, []);
    const exchange = w.market.exchange('HARBOR');
    const seen = w.now() - f.dataLatency('HARBOR');
    const tape = view.tape.HARBOR!.ABC!;
    expect(tape.length).toBeGreaterThan(0);
    expect(tape.length).toBeLessThanOrEqual(TAPE_VIEW);
    // Only what had printed by the time the firm's data left the exchange.
    for (const t of tape) expect(t.at).toBeLessThanOrEqual(seen);
    expect(JSON.stringify(tape)).not.toMatch(/buyer|seller|owner|firm|bg/);
    expect(Object.keys(tape[0]!).sort()).toEqual(['aggressor', 'at', 'cleared', 'price', 'size']);
    const depth = view.depth.HARBOR!.ABC!;
    const quote = view.quotes.HARBOR!.ABC!;
    expect(depth.bids.length).toBeGreaterThan(0);
    expect(depth.bids.length).toBeLessThanOrEqual(3);
    expect(depth.asks.length).toBeLessThanOrEqual(3);
    expect(depth.bids[0]).toMatchObject({ price: quote.bid, size: quote.bidSize });
    for (const l of [...depth.bids, ...depth.asks]) {
      expect(l.largest).toBeGreaterThan(0);
      expect(l.largest).toBeLessThanOrEqual(l.size);
    }
    expect(depth.asks[0]).toMatchObject({ price: quote.ask, size: quote.askSize });
    for (let i = 1; i < depth.bids.length; i++) expect(depth.bids[i]!.price).toBeLessThan(depth.bids[i - 1]!.price);
    expect(exchange.tapeAsOf('ABC', w.now(), 5).length).toBeLessThanOrEqual(5);
    expect(JSON.stringify(depth)).not.toMatch(/mine|owner/);
  });
});
