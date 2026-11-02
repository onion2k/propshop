import {
  BLOCKS,
  blockById,
  clampParam,
  paramsFrom,
  touchExcluding,
  type MarketView,
  type SeenQuote,
} from '../src/sim/strategy';

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
    exchanges: ['HARBOR', 'LAKESIDE'],
    quotes: { HARBOR: { ABC: quote(4100, 4101) }, LAKESIDE: { ABC: quote(4100, 4101) } },
    fees: { HARBOR: 0.3, LAKESIDE: 0.25 },
    latency: { HARBOR: 1, LAKESIDE: 8 },
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

describe('strategy blocks', () => {
  it('each has a spec with explained parameters and sane defaults', () => {
    for (const b of BLOCKS) {
      expect(b.spec.explain.length).toBeGreaterThan(100);
      if (b.spec.id === 'script') continue;
      for (const p of b.spec.params) {
        expect(p.explain.length).toBeGreaterThan(10);
        expect(clampParam(p, p.default)).toBe(p.default);
      }
      // A calm market with no edge: nothing to do, except for the market maker, whose job is to quote one.
      if (b.spec.id !== 'marketMaker') expect(b.decide(view(), paramsFrom(b.spec))).toEqual([]);
    }
  });

  it('clamps and steps parameters', () => {
    const arb = blockById('arbitrage').spec;
    expect(paramsFrom(arb, { minEdge: 99, size: 150 })).toMatchObject({ minEdge: 5, size: 200 });
    expect(paramsFrom(arb, { minEdge: 0.34 }).minEdge).toBe(0.3);
  });

  describe('arbitrage', () => {
    const arb = blockById('arbitrage');
    const p = paramsFrom(arb.spec, { minEdge: 0.3, size: 200 });

    it('buys the cheap ask and sells the dear bid when the gap beats fees and the edge', () => {
      const v = view({ quotes: { HARBOR: { ABC: quote(4100, 4101) }, LAKESIDE: { ABC: quote(4102, 4103, 100) } } });
      expect(arb.decide(v, p)).toEqual([
        { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'buy', price: 4101, size: 100, ioc: true },
        { kind: 'order', symbol: 'ABC', exchange: 'LAKESIDE', side: 'sell', price: 4102, size: 100, ioc: true },
      ]);
    });

    it('does nothing when the gap only covers the fees', () => {
      // One cent of gap, 0.55 of fees, 0.45 of edge: under the 0.5 asked for.
      const v = view({ quotes: { HARBOR: { ABC: quote(4100, 4101) }, LAKESIDE: { ABC: quote(4102, 4103) } } });
      expect(arb.decide(v, paramsFrom(arb.spec, { minEdge: 0.5 }))).toEqual([]);
    });

    it('waits while a leg is in flight and stops past its position limit', () => {
      const crossed = { HARBOR: { ABC: quote(4100, 4101) }, LAKESIDE: { ABC: quote(4102, 4103) } };
      const flying = view({
        quotes: crossed,
        openOrders: [
          {
            localId: 1,
            exchange: 'HARBOR',
            exchangeOrderId: null,
            symbol: 'ABC',
            side: 'buy',
            price: 4101,
            size: 100,
            filled: 0,
            ioc: true,
            status: 'inflight',
            block: 'arbitrage',
            sentAt: 0,
            seenAt: null,
            arrivedAt: null,
            ackAt: null,
            beatenBy: [],
          },
        ],
      });
      expect(arb.decide(flying, p)).toEqual([]);
      // Past the limit it does not add; it scratches what it holds at the best bid it can see.
      expect(
        arb.decide(
          view({ quotes: crossed, positions: { ABC: 1500 }, blockPositions: { arbitrage: { ABC: 1500 } } }),
          p,
        ),
      ).toEqual([
        { kind: 'order', symbol: 'ABC', exchange: 'LAKESIDE', side: 'sell', price: 4102, size: 500, ioc: true },
      ]);
    });

    it('leaves out an exchange further than its latency limit', () => {
      const v = view({ quotes: { HARBOR: { ABC: quote(4100, 4101) }, LAKESIDE: { ABC: quote(4102, 4103, 100) } } });
      expect(arb.decide(v, paramsFrom(arb.spec, { minEdge: 0.3, maxLatency: 5 }))).toEqual([]);
      expect(arb.decide(v, paramsFrom(arb.spec, { minEdge: 0.3, maxLatency: 10 }))).toHaveLength(2);
    });

    it('scratches a leftover leg when there is no gap to trade', () => {
      const v = view({ positions: { ABC: -100 }, blockPositions: { arbitrage: { ABC: -100 } } });
      expect(arb.decide(v, p)).toEqual([
        { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'buy', price: 4101, size: 100, ioc: true },
      ]);
      // Another block's position is not its business.
      expect(arb.decide(view({ positions: { ABC: -100 }, blockPositions: { momentum: { ABC: -100 } } }), p)).toEqual(
        [],
      );
    });
  });

  describe('market maker', () => {
    const mm = blockById('marketMaker');
    const p = paramsFrom(mm.spec, { halfSpread: 2, size: 100, maxInventory: 500, tolerance: 1 });

    it('quotes both sides on both exchanges around the mid', () => {
      const intents = mm.decide(view(), p);
      expect(intents).toHaveLength(4);
      expect(intents).toContainEqual({
        kind: 'order',
        symbol: 'ABC',
        exchange: 'HARBOR',
        side: 'buy',
        price: 4098,
        size: 100,
        ioc: false,
        postOnly: true,
      });
      expect(intents).toContainEqual({
        kind: 'order',
        symbol: 'ABC',
        exchange: 'HARBOR',
        side: 'sell',
        price: 4103,
        size: 100,
        ioc: false,
        postOnly: true,
      });
    });

    it('skews away from inventory and cuts it at the limit', () => {
      const long = mm.decide(view({ positions: { ABC: 500 }, blockPositions: { marketMaker: { ABC: 500 } } }), p);
      expect(long.filter((i) => i.kind === 'order' && i.side === 'buy' && !i.ioc)).toHaveLength(0);
      expect(long[0]).toEqual({
        kind: 'order',
        symbol: 'ABC',
        exchange: 'HARBOR',
        side: 'sell',
        price: 4100,
        size: 250,
        ioc: true,
      });
      const asks = long.filter((i) => i.kind === 'order' && i.side === 'sell' && !i.ioc);
      expect(asks).toHaveLength(2);
      expect(asks[0]).toMatchObject({ price: 4101 });
    });

    it('leaves a good quote resting and replaces one that has drifted', () => {
      const resting = (price: number, side: 'buy' | 'sell') => ({
        localId: side === 'buy' ? 1 : 2,
        exchange: 'HARBOR',
        exchangeOrderId: 9,
        symbol: 'ABC',
        side,
        price,
        size: 100,
        filled: 0,
        ioc: false,
        status: 'resting' as const,
        block: 'marketMaker',
        sentAt: 0,
        seenAt: null,
        arrivedAt: null,
        ackAt: null,
        beatenBy: [],
      });
      const v = view({ exchanges: ['HARBOR'], openOrders: [resting(4098, 'buy'), resting(4110, 'sell')] });
      const intents = mm.decide(v, p);
      expect(intents).toEqual([
        { kind: 'cancel', localId: 2 },
        {
          kind: 'order',
          symbol: 'ABC',
          exchange: 'HARBOR',
          side: 'sell',
          price: 4103,
          size: 100,
          ioc: false,
          postOnly: true,
        },
      ]);
    });
  });

  describe('market maker reading the book without itself', () => {
    const mm = blockById('marketMaker');
    it('re-centres on the second level when its own stale quote is the whole of the touch', () => {
      const own = {
        localId: 1,
        exchange: 'HARBOR',
        exchangeOrderId: 9,
        symbol: 'ABC',
        side: 'sell' as const,
        price: 4101,
        size: 100,
        filled: 0,
        ioc: false,
        status: 'resting' as const,
        block: 'marketMaker',
        sentAt: 0,
        seenAt: null,
        arrivedAt: null,
        ackAt: null,
        beatenBy: [],
      };
      // The crowd has moved up: bids at 4103, asks from 4105; our old ask at 4101 is alone at the touch.
      const q: SeenQuote = {
        bid: 4103,
        ask: 4101,
        bidSize: 400,
        askSize: 100,
        bid2: 4102,
        ask2: 4105,
        bid2Size: 300,
        ask2Size: 300,
        at: 0,
      };
      const v = view({ exchanges: ['HARBOR'], quotes: { HARBOR: { ABC: q } }, openOrders: [own] });
      expect(touchExcluding(v, 'HARBOR', 'ABC', 'marketMaker')).toEqual({ bid: 4103, ask: 4105 });
      const intents = mm.decide(v, paramsFrom(mm.spec, { halfSpread: 2, tolerance: 1 }));
      // The stale ask is pulled and the new quotes sit around the real midpoint of 4104.
      expect(intents).toContainEqual({ kind: 'cancel', localId: 1 });
      expect(intents).toContainEqual({
        kind: 'order',
        symbol: 'ABC',
        exchange: 'HARBOR',
        side: 'buy',
        price: 4102,
        size: 100,
        ioc: false,
        postOnly: true,
      });
    });
  });

  describe('market maker on news', () => {
    const mm = blockById('marketMaker');
    it('pulls its quotes and stays out after a headline names the stock', () => {
      const p = paramsFrom(mm.spec, { newsPause: 30 });
      const headline = { id: 1, at: 5_000, text: 'x', symbols: ['ABC'], sector: null, direction: 1 as const };
      const resting = {
        localId: 1,
        exchange: 'HARBOR',
        exchangeOrderId: 9,
        symbol: 'ABC',
        side: 'buy' as const,
        price: 4098,
        size: 100,
        filled: 0,
        ioc: false,
        status: 'resting' as const,
        block: 'marketMaker',
        sentAt: 0,
        seenAt: null,
        arrivedAt: null,
        ackAt: null,
        beatenBy: [],
      };
      expect(mm.decide(view({ exchanges: ['HARBOR'], news: [headline], openOrders: [resting] }), p)).toEqual([
        { kind: 'cancel', localId: 1 },
      ]);
      // Forty seconds on, it quotes again.
      expect(mm.decide(view({ exchanges: ['HARBOR'], news: [headline], now: 50_000 }), p)).toHaveLength(2);
      // With the pause off, news is ignored.
      expect(
        mm.decide(view({ exchanges: ['HARBOR'], news: [headline] }), paramsFrom(mm.spec, { newsPause: 0 })),
      ).toHaveLength(2);
    });
  });

  describe('momentum', () => {
    const mo = blockById('momentum');
    const p = paramsFrom(mo.spec, { lookback: 3, threshold: 3, size: 200 });

    it('buys into a rise and sells into a fall, and flattens when the move turns', () => {
      expect(mo.decide(view({ mids: { ABC: [4090, 4092, 4095, 4100.5] } }), p)).toEqual([
        { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'buy', price: 4101, size: 200, ioc: true },
      ]);
      expect(mo.decide(view({ mids: { ABC: [4110, 4108, 4105, 4100.5] } }), p)).toEqual([
        { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'sell', price: 4100, size: 200, ioc: true },
      ]);
      expect(
        mo.decide(
          view({
            mids: { ABC: [4101, 4101, 4100.5, 4100.5] },
            positions: { ABC: 200 },
            blockPositions: { momentum: { ABC: 200 } },
          }),
          p,
        ),
      ).toEqual([
        { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'sell', price: 4100, size: 200, ioc: true },
      ]);
    });

    it('does nothing without enough history or inside the threshold', () => {
      expect(mo.decide(view({ mids: { ABC: [4100, 4101] } }), p)).toEqual([]);
      expect(mo.decide(view({ mids: { ABC: [4100, 4101, 4101, 4102] } }), p)).toEqual([]);
    });
  });

  describe('mean reversion', () => {
    const mr = blockById('meanReversion');
    const p = paramsFrom(mr.spec, { lookback: 5, threshold: 3, size: 200 });
    it('fades a lurch above the average and flattens once it is back', () => {
      // Average of the last five is 4100; the last is 4104: four above.
      expect(mr.decide(view({ mids: { ABC: [4100, 4100, 4100, 4096, 4104] } }), p)).toEqual([
        { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'sell', price: 4100, size: 200, ioc: true },
      ]);
      expect(mr.decide(view({ mids: { ABC: [4100, 4100, 4100, 4104, 4096] } }), p)).toEqual([
        { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'buy', price: 4101, size: 200, ioc: true },
      ]);
      const back = view({
        mids: { ABC: [4100, 4100, 4100, 4100, 4101] },
        positions: { ABC: -200 },
        blockPositions: { meanReversion: { ABC: -200 } },
      });
      expect(mr.decide(back, p)).toEqual([
        { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'buy', price: 4101, size: 200, ioc: true },
      ]);
    });
    it('holds between the threshold and half of it, and waits for enough history', () => {
      const between = view({
        mids: { ABC: [4100, 4100, 4100, 4100, 4102] },
        positions: { ABC: -200 },
        blockPositions: { meanReversion: { ABC: -200 } },
      });
      expect(mr.decide(between, p)).toEqual([]);
      expect(mr.decide(view({ mids: { ABC: [4100, 4110] } }), p)).toEqual([]);
    });
  });

  describe('stale-quote sniper', () => {
    const sn = blockById('sniper');
    const p = paramsFrom(sn.spec, { threshold: 1, size: 200, maxPosition: 600 });
    it('buys an ask under the other exchanges and sells a bid over them', () => {
      // LAKESIDE still quotes 4100/4101 while HARBOR has moved to 4103/4104: LAKESIDE's ask is stale.
      // The recent midpoints say the price was 4100: LAKESIDE is the one still there.
      const stale = view({
        mids: { ABC: [4100, 4100.5] },
        quotes: { HARBOR: { ABC: quote(4103, 4104) }, LAKESIDE: { ABC: quote(4100, 4101, 300) } },
      });
      expect(sn.decide(stale, p)).toEqual([
        { kind: 'order', symbol: 'ABC', exchange: 'LAKESIDE', side: 'buy', price: 4101, size: 200, ioc: true },
      ]);
      const staleBid = view({
        mids: { ABC: [4100.5, 4100.5] },
        quotes: { HARBOR: { ABC: quote(4096, 4097) }, LAKESIDE: { ABC: quote(4100, 4101) } },
      });
      expect(sn.decide(staleBid, p)).toEqual([
        { kind: 'order', symbol: 'ABC', exchange: 'LAKESIDE', side: 'sell', price: 4100, size: 200, ioc: true },
      ]);
    });
    it('does nothing within the threshold, and flattens once the gap has closed', () => {
      expect(sn.decide(view(), p)).toEqual([]);
      const holding = view({ positions: { ABC: 200 }, blockPositions: { sniper: { ABC: 200 } } });
      expect(sn.decide(holding, p)).toEqual([
        { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'sell', price: 4100, size: 200, ioc: true },
      ]);
      const full = view({
        mids: { ABC: [4100, 4100.5] },
        quotes: { HARBOR: { ABC: quote(4103, 4104) }, LAKESIDE: { ABC: quote(4100, 4101) } },
        positions: { ABC: 600 },
        blockPositions: { sniper: { ABC: 600 } },
      });
      // At the limit it will not add; with the gap still open it holds rather than flattening into it.
      expect(sn.decide(full, p)).toEqual([]);
    });
  });

  describe('news reaction', () => {
    const nr = blockById('newsReaction');
    const p = paramsFrom(nr.spec, { size: 300, window: 30 });
    const headline = (direction: -1 | 0 | 1, at: number) => ({
      id: 1,
      at,
      text: 'x',
      symbols: ['ABC'],
      sector: null,
      direction,
    });

    it('buys on an up headline inside the window and sells on a down one', () => {
      expect(nr.decide(view({ news: [headline(1, 5_000)] }), p)).toEqual([
        { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'buy', price: 4101, size: 300, ioc: true },
      ]);
      expect(nr.decide(view({ news: [headline(-1, 5_000)] }), p)).toEqual([
        { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'sell', price: 4100, size: 300, ioc: true },
      ]);
    });

    it('ignores a neutral or stale headline, and flattens what it took once the window has passed', () => {
      expect(nr.decide(view({ news: [headline(0, 5_000)] }), p)).toEqual([]);
      expect(nr.decide(view({ news: [headline(1, -50_000)] }), p)).toEqual([]);
      expect(
        nr.decide(
          view({
            news: [headline(1, -50_000)],
            positions: { ABC: 300 },
            blockPositions: { newsReaction: { ABC: 300 } },
          }),
          p,
        ),
      ).toEqual([
        { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'sell', price: 4100, size: 300, ioc: true },
      ]);
    });
  });
});
