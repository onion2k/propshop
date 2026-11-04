import { blockById, paramsFrom, type Fill, type MarketView, type OpenOrder, type SeenQuote } from '../src/sim/strategy';

function quote(bid: number, ask: number, size = 500): SeenQuote {
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

function view(over: Partial<MarketView> = {}): MarketView {
  return {
    now: 10_000,
    symbols: ['ABC'],
    sectors: { ABC: 'tech' },
    constituents: {},
    exchanges: ['HARBOR', 'LAKESIDE'],
    quotes: { HARBOR: { ABC: quote(4100, 4102) }, LAKESIDE: { ABC: quote(4100, 4102) } },
    tape: {},
    depth: {},
    fees: { HARBOR: 0.3, LAKESIDE: 0.25 },
    latency: { HARBOR: 1, LAKESIDE: 1 },
    mids: { ABC: [] },
    positions: {},
    blockPositions: {},
    cash: 1_000_000,
    openOrders: [],
    recentFills: [],
    news: [],
    ...over,
  };
}

const block = blockById('anticipate');
const p = paramsFrom(block.spec);
const print = (
  size: number,
  aggressor: 'buy' | 'sell',
  at = 9_990,
  price = aggressor === 'buy' ? 4102 : 4100,
  cleared = true,
) => ({
  price,
  size,
  aggressor,
  at,
  cleared,
});
const level = (price: number, size: number, largest = size) => ({ price, size, largest });
const fill = (over: Partial<Fill>): Fill => ({
  seq: 1,
  at: 9_000,
  localId: 1,
  block: 'anticipate',
  exchange: 'HARBOR',
  symbol: 'ABC',
  side: 'buy',
  price: 4101,
  size: 300,
  fee: 0,
  realised: 0,
  ...over,
});

describe('anticipate', () => {
  describe('chase the print', () => {
    it('takes the same side on the other exchanges and rests the shares back a cent worse', () => {
      const v = view({ tape: { HARBOR: { ABC: [print(2000, 'buy')] } } });
      expect(block.decide(v, p)).toEqual([
        { kind: 'order', symbol: 'ABC', exchange: 'LAKESIDE', side: 'buy', price: 4102, size: 500, ioc: true },
        {
          kind: 'order',
          symbol: 'ABC',
          exchange: 'LAKESIDE',
          side: 'sell',
          price: 4103,
          size: 500,
          ioc: false,
          postOnly: true,
        },
      ]);
    });

    it('sells into a big sell print, and offers the shares back a cent under the bid', () => {
      const v = view({ tape: { LAKESIDE: { ABC: [print(1500, 'sell')] } } });
      expect(block.decide(v, p)).toEqual([
        { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'sell', price: 4100, size: 500, ioc: true },
        {
          kind: 'order',
          symbol: 'ABC',
          exchange: 'HARBOR',
          side: 'buy',
          price: 4099,
          size: 500,
          ioc: false,
          postOnly: true,
        },
      ]);
    });

    it('does nothing for a print the crowd could have made', () => {
      const v = view({ tape: { HARBOR: { ABC: [print(400, 'buy')] } } });
      expect(block.decide(v, p)).toEqual([]);
    });

    it('takes nothing where the next level is thick, since the slow order would meet the crowd there', () => {
      const thick = { ...quote(4100, 4102), ask2Size: 3000 };
      const v = view({
        quotes: { HARBOR: { ABC: quote(4100, 4102) }, LAKESIDE: { ABC: thick } },
        tape: { HARBOR: { ABC: [print(2000, 'buy')] } },
      });
      expect(block.decide(v, p)).toEqual([]);
    });

    it('takes the top level and offers at the next level\u2019s price where that level is thin', () => {
      const thin = { ...quote(4100, 4102, 300), ask2: 4104, ask2Size: 200 };
      const v = view({
        quotes: { HARBOR: { ABC: quote(4100, 4102) }, LAKESIDE: { ABC: thin } },
        tape: { HARBOR: { ABC: [print(2000, 'buy')] } },
      });
      expect(block.decide(v, p)).toMatchObject([
        { side: 'buy', exchange: 'LAKESIDE', price: 4102, size: 300, ioc: true },
        { side: 'sell', exchange: 'LAKESIDE', price: 4104, size: 300, ioc: false, postOnly: true },
      ]);
    });

    it('takes nothing where the quote has already moved past the print', () => {
      const moved = quote(4102, 4104);
      const v = view({
        quotes: { HARBOR: { ABC: quote(4100, 4102) }, LAKESIDE: { ABC: moved } },
        tape: { HARBOR: { ABC: [print(2000, 'buy')] } },
      });
      expect(block.decide(v, p)).toEqual([]);
    });

    it('cancels the offer back after it has waited and sells at the touch', () => {
      const offer = {
        localId: 7,
        block: 'anticipate',
        symbol: 'ABC',
        side: 'sell',
        status: 'resting',
        sentAt: 9_000,
      } as OpenOrder;
      const v = view({
        blockPositions: { anticipate: { ABC: 500 } },
        recentFills: [fill({ price: 4102 })],
        tape: { HARBOR: { ABC: [print(2000, 'buy', 9_900)] } },
        openOrders: [offer],
      });
      expect(block.decide(v, p)).toEqual([
        { kind: 'cancel', localId: 7 },
        { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'sell', price: 4100, size: 500, ioc: true },
      ]);
      // Young, it is left to work.
      const young = { ...offer, sentAt: 9_900 };
      expect(block.decide(view({ ...v, openOrders: [young] }), p)).toEqual([]);
    });

    it('does not chase a print that left part of the level', () => {
      const v = view({ tape: { HARBOR: { ABC: [print(2000, 'buy', 9_990, 4102, false)] } } });
      expect(block.decide(v, p)).toEqual([]);
    });

    it('chases a print once: not again once it has sent an order after it, nor when it is old', () => {
      const t = { HARBOR: { ABC: [print(2000, 'buy')] } };
      const sent = { localId: 1, block: 'anticipate', symbol: 'ABC', status: 'resting', sentAt: 9_995 } as OpenOrder;
      expect(block.decide(view({ tape: t, openOrders: [sent] }), p)).toEqual([]);
      expect(block.decide(view({ tape: t, now: 11_000 }), p)).toEqual([]);
    });

    it('flattens what it holds once the tape has been quiet, and pulls its offers', () => {
      const offer = {
        localId: 7,
        block: 'anticipate',
        symbol: 'ABC',
        side: 'sell',
        status: 'resting',
        sentAt: 9_000,
      } as OpenOrder;
      const v = view({
        now: 20_000,
        blockPositions: { anticipate: { ABC: 500 } },
        recentFills: [fill({ price: 4102 })],
        tape: { HARBOR: { ABC: [print(2000, 'buy', 9_000)] } },
        openOrders: [offer],
      });
      expect(block.decide(v, p)).toEqual([
        { kind: 'cancel', localId: 7 },
        { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'sell', price: 4100, size: 500, ioc: true },
      ]);
    });
  });

  describe('jump the big order', () => {
    const wall = (bids: [number, number, number?][], asks: [number, number, number?][] = []) => ({
      HARBOR: { ABC: { bids: bids.map(([a, b, c]) => level(a, b, c)), asks: asks.map(([a, b, c]) => level(a, b, c)) } },
    });

    it('quotes a cent inside a big resting bid, post-only', () => {
      const v = view({ depth: wall([[4100, 2500]]) });
      expect(block.decide(v, p)).toEqual([
        {
          kind: 'order',
          symbol: 'ABC',
          exchange: 'HARBOR',
          side: 'buy',
          price: 4101,
          size: 300,
          ioc: false,
          postOnly: true,
        },
      ]);
    });

    it('quotes under a big resting offer the other way, and not for a wall that is small or too deep', () => {
      const ask = view({ depth: wall([], [[4102, 2500]]) });
      expect(block.decide(ask, p)).toMatchObject([{ side: 'sell', price: 4101, postOnly: true }]);
      expect(block.decide(view({ depth: wall([[4100, 900]]) }), p)).toEqual([]);
      expect(block.decide(view({ depth: wall([[4098, 2500]]) }), p)).toEqual([]);
    });

    it('does not jump a level that is only the sum of many small orders', () => {
      // 4,000 shares at the bid, but no order in it bigger than the crowd's 500.
      expect(block.decide(view({ depth: wall([[4100, 4000, 500]]) }), p)).toEqual([]);
      expect(block.decide(view({ depth: wall([[4100, 4000, 2500]]) }), p)).toHaveLength(1);
    });

    it('holds while the price goes its way, and sells into the wall when it turns by the stop', () => {
      const held = {
        blockPositions: { anticipate: { ABC: 300 } },
        recentFills: [fill({})],
        depth: wall([[4100, 2500]]),
      };
      // The mid has risen: keep it.
      expect(block.decide(view({ ...held, quotes: { HARBOR: { ABC: quote(4102, 4104) } } }), p)).toEqual([]);
      // The mid has fallen two cents below the fill: out, at the big bid behind.
      const down = view({
        ...held,
        depth: wall([[4098, 2500]]),
        quotes: { HARBOR: { ABC: quote(4098, 4099) }, LAKESIDE: { ABC: quote(4098, 4099) } },
      });
      expect(block.decide(down, p)).toEqual([
        { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'sell', price: 4098, size: 300, ioc: true },
      ]);
    });
  });
});

describe('market maker fade', () => {
  const mm = blockById('marketMaker');
  const mp = paramsFrom(mm.spec, { halfSpread: 2, size: 100, tolerance: 1 });
  const bid = {
    localId: 5,
    exchange: 'HARBOR',
    exchangeOrderId: 9,
    symbol: 'ABC',
    side: 'buy',
    price: 4098,
    size: 100,
    filled: 0,
    ioc: false,
    status: 'resting',
    block: 'marketMaker',
    sentAt: 5_000,
  } as OpenOrder;
  const sells = (intents: ReturnType<typeof mm.decide>, exchange: string, side: 'buy' | 'sell') =>
    intents.filter((i) => i.kind === 'order' && i.exchange === exchange && i.side === side);

  it('cancels its bid, and does not requote it, when a big sell prints on another exchange', () => {
    const v = view({ openOrders: [bid], tape: { LAKESIDE: { ABC: [print(2000, 'sell')] } } });
    const out = mm.decide(v, mp);
    expect(out).toContainEqual({ kind: 'cancel', localId: 5 });
    expect(sells(out, 'HARBOR', 'buy')).toEqual([]);
    // The offer on the same exchange is the side that print did not hit.
    expect(sells(out, 'HARBOR', 'sell')).toHaveLength(1);
  });

  it('puts the quote back once the print is old, and ignores a small print or one on its own exchange', () => {
    const quoting = (tape: MarketView['tape'], now = 10_000) =>
      sells(mm.decide(view({ tape, now, openOrders: [] }), mp), 'HARBOR', 'buy');
    expect(quoting({ LAKESIDE: { ABC: [print(2000, 'sell')] } })).toEqual([]);
    expect(quoting({ LAKESIDE: { ABC: [print(2000, 'sell')] } }, 10_500)).toHaveLength(1);
    expect(quoting({ LAKESIDE: { ABC: [print(800, 'sell')] } })).toHaveLength(1);
    expect(quoting({ HARBOR: { ABC: [print(2000, 'sell')] } })).toHaveLength(1);
  });
});
