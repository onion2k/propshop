// Cross-exchange arbitrage: the same stock is briefly cheaper on one exchange than the bid on the other, so buy
// there and sell here in the same instant. The edge is a cent or less and lasts milliseconds, so the firm that
// gets both orders in first takes it and everyone slower gets nothing or, worse, gets one leg filled.

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

export const arbitrage: StrategyBlock = {
  spec: {
    id: 'arbitrage',
    name: 'Cross-exchange arbitrage',
    summary: 'Buy where it is cheaper, sell where it is dearer, in the same instant.',
    explain:
      'Two exchanges trade the same stock, and for a few milliseconds after a move one of them is behind. ' +
      'When the ask on one is below the bid on the other by more than both fees, buying there and selling ' +
      'here locks in the difference. The edge is tiny and the race is everything: the firm with the lowest ' +
      'latency sees the gap first and its orders land first. Arrive late and the gap is gone, or only one ' +
      'side fills and you are left holding stock you did not want. When that happens the block gets flat ' +
      'again at the best price it can see, which costs the spread: the price of being slow.',
    params: [
      {
        key: 'minEdge',
        name: 'Minimum edge',
        min: 0,
        max: 5,
        step: 0.1,
        default: 0.3,
        unit: '¢/share',
        explain: 'Profit per share, after both fees, before the block will fire. Lower fires more and nets less.',
      },
      {
        key: 'size',
        name: 'Size',
        min: 100,
        max: 2000,
        step: 100,
        default: 200,
        unit: 'shares',
        explain: 'Shares per leg, capped by what is actually quoted at the touch on both sides.',
      },
      {
        key: 'maxPosition',
        name: 'Max position',
        min: 0,
        max: 5000,
        step: 100,
        default: 1000,
        unit: 'shares',
        explain: 'Stop firing when one leg has left you holding more than this, long or short, in a stock.',
      },
    ],
  },

  decide(view: MarketView, p: Params): Intent[] {
    const out: Intent[] = [];
    for (const symbol of view.symbols) {
      if (inFlight(view, symbol, this.spec.id)) continue;
      const { bid, ask } = bestAcross(view, symbol);
      if (!bid || !ask) continue;
      const own = ownPosition(view, this.spec.id, symbol);
      const fees = (view.fees[bid.exchange] ?? 0) + (view.fees[ask.exchange] ?? 0);
      const edge = bid.exchange === ask.exchange ? -Infinity : bid.price - ask.price - fees;
      if (edge < (p.minEdge ?? 0) || edge <= 0 || Math.abs(own) > (p.maxPosition ?? 0)) {
        // No trade to make, or too much already held: a leg left over from a race lost is scratched now.
        const scratch = flattenTo(view, symbol, own, 0);
        if (scratch) out.push(scratch);
        continue;
      }
      const size = Math.min(p.size ?? 100, bid.size, ask.size);
      if (size <= 0) continue;
      out.push({ kind: 'order', symbol, exchange: ask.exchange, side: 'buy', price: ask.price, size, ioc: true });
      out.push({ kind: 'order', symbol, exchange: bid.exchange, side: 'sell', price: bid.price, size, ioc: true });
    }
    return out;
  },
};
