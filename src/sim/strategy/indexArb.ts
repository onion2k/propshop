// Index arbitrage: an index is worth the average of its basket, and for a moment it trades away from it. Buy
// the cheap one and sell the dear one, the whole basket at once, which takes as many orders as the basket has
// names. The oldest cross-sectional arbitrage there is, and the one that most needs a computer that can send.

import {
  bestAcross,
  flattenTo,
  inFlight,
  ownPosition,
  type Intent,
  type MarketView,
  type Params,
  type StrategyBlock,
} from './types';

export const indexArb: StrategyBlock = {
  spec: {
    id: 'indexArb',
    name: 'Index arbitrage',
    summary: 'Buy the index and sell its basket when the index is cheap against it; the reverse when dear.',
    explain:
      'The index is the average price of its twelve stocks, and it trades like a stock of its own, so for a ' +
      'moment it can be cheaper than its basket or dearer. When the index’s ask is under the basket’s ' +
      'bids by more than a threshold and the fees, buy the index and sell one share of each stock for every ' +
      'twelve of the index; the reverse when its bid is over the basket’s asks. Thirteen orders a basket: ' +
      'a laptop drops most of them and is left with a leg or two, which the block scratches. It needs the ' +
      'index and every constituent on the watchlist, which only a rack can hold. Unwinds when the gap closes.',
    params: [
      {
        key: 'threshold',
        name: 'Minimum edge',
        min: 0.5,
        max: 10,
        step: 0.5,
        default: 1,
        unit: '¢/index share',
        explain: 'The gap between the index and its basket, per index share, after fees, before the block fires.',
      },
      {
        key: 'baskets',
        name: 'Baskets',
        min: 1,
        max: 10,
        step: 1,
        default: 1,
        unit: 'baskets',
        explain: 'One basket is a hundred shares of each constituent against the matching index shares.',
      },
    ],
  },

  decide(view: MarketView, p: Params): Intent[] {
    const out: Intent[] = [];
    const threshold = p.threshold ?? 2;
    const baskets = p.baskets ?? 1;
    for (const index of view.symbols) {
      const members = view.constituents[index];
      if (!members || members.length === 0) continue;
      if (!members.every((m) => view.symbols.includes(m))) continue;
      if (inFlight(view, index, this.spec.id) || members.some((m) => inFlight(view, m, this.spec.id))) continue;
      const n = members.length;
      const perStock = 100 * baskets;
      const indexShares = perStock * n;
      const idx = bestAcross(view, index);
      if (!idx.bid || !idx.ask) continue;
      let basketBid = 0;
      let basketAsk = 0;
      let basketFees = 0;
      let complete = true;
      for (const m of members) {
        const b = bestAcross(view, m);
        if (!b.bid || !b.ask) {
          complete = false;
          break;
        }
        basketBid += b.bid.price;
        basketAsk += b.ask.price;
        basketFees += view.fees[b.bid.exchange] ?? 0;
      }
      if (!complete) continue;
      const position = ownPosition(view, this.spec.id, index);
      const fees = (view.fees[idx.ask.exchange] ?? 0) + basketFees / n;
      const cheap = basketBid / n - idx.ask.price - fees;
      const dear = idx.bid.price - basketAsk / n - fees;
      if (position === 0 && cheap >= threshold) {
        out.push({
          kind: 'order',
          symbol: index,
          exchange: idx.ask.exchange,
          side: 'buy',
          price: idx.ask.price,
          size: indexShares,
          ioc: true,
        });
        for (const m of members) {
          const b = bestAcross(view, m);
          if (b.bid)
            out.push({
              kind: 'order',
              symbol: m,
              exchange: b.bid.exchange,
              side: 'sell',
              price: b.bid.price,
              size: perStock,
              ioc: true,
            });
        }
      } else if (position === 0 && dear >= threshold) {
        out.push({
          kind: 'order',
          symbol: index,
          exchange: idx.bid.exchange,
          side: 'sell',
          price: idx.bid.price,
          size: indexShares,
          ioc: true,
        });
        for (const m of members) {
          const b = bestAcross(view, m);
          if (b.ask)
            out.push({
              kind: 'order',
              symbol: m,
              exchange: b.ask.exchange,
              side: 'buy',
              price: b.ask.price,
              size: perStock,
              ioc: true,
            });
        }
      } else if (position !== 0 && cheap < threshold / 2 && dear < threshold / 2) {
        // The gap has closed: unwind every leg this block holds, at the best price in view.
        for (const s of [index, ...members]) {
          const intent = flattenTo(view, s, ownPosition(view, this.spec.id, s), 0);
          if (intent) out.push(intent);
        }
      } else if (position === 0) {
        // A leg or two left from a basket that did not all fill: scratched.
        for (const m of members) {
          const intent = flattenTo(view, m, ownPosition(view, this.spec.id, m), 0);
          if (intent) out.push(intent);
        }
      }
    }
    return out;
  },
};
