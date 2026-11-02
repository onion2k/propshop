// The stale-quote sniper: one exchange's crowd is behind the others. Its ask is still where the price was,
// and the others say the price is higher; buy that ask before its owner pulls it, and sell the position at
// the new price once the slow exchange has caught up. Latency arbitrage without waiting for a crossed market.

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

export const sniper: StrategyBlock = {
  spec: {
    id: 'sniper',
    name: 'Stale-quote sniper',
    summary: 'Hit a quote on an exchange that has not caught up with the others.',
    explain:
      'Take the midpoint of every exchange but one; where that one’s ask sits under the rest by more than a ' +
      'threshold and the fee, its crowd has not heard yet. Buy the ask, and sell at the best price in view once ' +
      'the gap has closed. The same the other way for a bid above the rest. The arbitrage block waits for one ' +
      'exchange’s ask to fall under another’s bid; this one fires sooner, on a stale quote alone, and ' +
      'carries the position for a moment, which is where the risk is. Being first is everything: a slow firm ' +
      'arrives to find the stale quote pulled or taken.',
    params: [
      {
        key: 'threshold',
        name: 'Stale by',
        min: 0.5,
        max: 5,
        step: 0.5,
        default: 1,
        unit: '¢',
        explain: 'How far a quote must be from the other exchanges’ midpoint, beyond the fee, to count as stale.',
      },
      {
        key: 'size',
        name: 'Size',
        min: 100,
        max: 2000,
        step: 100,
        default: 200,
        unit: 'shares',
        explain: 'Shares to take, capped by what is quoted.',
      },
      {
        key: 'maxPosition',
        name: 'Max position',
        min: 100,
        max: 5000,
        step: 100,
        default: 600,
        unit: 'shares',
        explain: 'Stop firing when the block already holds this much, long or short, in a stock.',
      },
    ],
  },

  decide(view: MarketView, p: Params): Intent[] {
    const out: Intent[] = [];
    const threshold = p.threshold ?? 1;
    const size = p.size ?? 200;
    const max = p.maxPosition ?? 600;
    for (const symbol of view.symbols) {
      if (inFlight(view, symbol, this.spec.id)) continue;
      const position = ownPosition(view, this.spec.id, symbol);
      const mids: { exchange: string; mid: number }[] = [];
      for (const exchange of view.exchanges) {
        const q = view.quotes[exchange]?.[symbol];
        if (q && q.bid !== null && q.ask !== null) mids.push({ exchange, mid: (q.bid + q.ask) / 2 });
      }
      // The stale exchange is the one still nearest where the price was a few decisions ago.
      const history = view.mids[symbol] ?? [];
      const older = history[Math.max(0, history.length - 6)];
      let signal: (Intent & { kind: 'order' }) | null = null;
      if (mids.length >= 2 && older !== undefined) {
        for (const { exchange, mid } of mids) {
          const others = mids.filter((m) => m.exchange !== exchange);
          const consensus = others.reduce((a, m) => a + m.mid, 0) / others.length;
          if (Math.abs(mid - older) >= Math.abs(consensus - older)) continue;
          const q = view.quotes[exchange]?.[symbol];
          if (!q || q.bid === null || q.ask === null) continue;
          const fee = view.fees[exchange] ?? 0;
          if (q.ask < consensus - threshold - fee) {
            signal = {
              kind: 'order',
              symbol,
              exchange,
              side: 'buy',
              price: q.ask,
              size: Math.min(size, q.askSize),
              ioc: true,
            };
            break;
          }
          if (q.bid > consensus + threshold + fee) {
            signal = {
              kind: 'order',
              symbol,
              exchange,
              side: 'sell',
              price: q.bid,
              size: Math.min(size, q.bidSize),
              ioc: true,
            };
            break;
          }
        }
      }
      if (signal) {
        // A stale quote in view: take it where that keeps the position within the limit or brings it back toward
        // flat; otherwise hold what is held, since the gap it was bought for is still open.
        const after = position + (signal.side === 'buy' ? signal.size : -signal.size);
        if (Math.abs(after) <= max || Math.abs(after) < Math.abs(position)) out.push(signal);
        continue;
      }
      if (position !== 0) {
        // The gap has closed: sell what was bought cheap at the best bid in view, and the reverse.
        const { bid, ask } = bestAcross(view, symbol);
        const intent = flattenTo(view, symbol, position, 0);
        if (intent && ((position > 0 && bid) || (position < 0 && ask))) out.push(intent);
      }
    }
    return out;
  },
};
