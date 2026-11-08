// Lead-lag: the future moves first and the index's books follow, because the future's crowd is quicker. A firm
// that sees the future soon enough knows where the index is going before the index's crowd does: buy the index
// when the future says it is low, sell when it says it is high, and get out when it has caught up. Only the
// index is traded; the future is only looked at. What it is worth is the link to the Prairie Board.

import {
  bestAcross,
  carryFactor,
  contractsByExpiry,
  flattenTo,
  inFlight,
  ownPosition,
  type Intent,
  type MarketView,
  type Params,
  type StrategyBlock,
} from './types';

export const leadLag: StrategyBlock = {
  spec: {
    id: 'leadLag',
    name: 'Lead-lag',
    summary: 'Trade the index on what its future already says, before the index catches up.',
    explain:
      'The future on the index trades at the Prairie Board, where the crowd catches up with a move in a few ' +
      'tens of milliseconds; the index trades at the stock exchanges, whose crowds take hundreds. So after a move ' +
      'the future has repriced and the index has not. Bring the future’s price back to today (its carry), and ' +
      'when it is over the index’s ask by more than a threshold and the fee, buy the index; under its bid, sell. ' +
      'Out when the index has caught up. The whole edge is seeing the future sooner than the index’s crowd ' +
      'moves, so it is worth what your line to the Prairie Board is worth, and nothing from home.',
    params: [
      {
        key: 'threshold',
        name: 'Minimum lead',
        min: 0.5,
        max: 20,
        step: 0.5,
        // The gap past the index's touch is over half a cent about a fifth of the time and over two almost never
        // (docs/measured.md): half a cent is where it trades at all.
        default: 0.5,
        unit: '¢/index share',
        explain: 'How far the future, carried back, must be from the index’s touch, after the fee.',
      },
      {
        key: 'shares',
        name: 'Size',
        min: 100,
        max: 5000,
        step: 100,
        default: 1000,
        unit: 'index shares',
        explain: 'Index shares a trade.',
      },
    ],
  },

  decide(view: MarketView, p: Params): Intent[] {
    const threshold = p.threshold ?? 0.5;
    const shares = p.shares ?? 1000;
    const id = this.spec.id;
    const [near] = contractsByExpiry(view);
    if (!near) return [];
    const [symbol, c] = near;
    const index = c.underlying;
    if (inFlight(view, index, id)) return [];
    const fut = bestAcross(view, symbol);
    const idx = bestAcross(view, index);
    if (!fut.bid || !fut.ask || !idx.bid || !idx.ask) return [];
    const implied = (fut.bid.price + fut.ask.price) / 2 / carryFactor(c, view.now);
    const position = ownPosition(view, id, index);
    if (position === 0) {
      const fee = view.fees[idx.ask.exchange] ?? 0;
      if (implied - idx.ask.price - fee >= threshold)
        return [
          {
            kind: 'order',
            symbol: index,
            exchange: idx.ask.exchange,
            side: 'buy',
            price: idx.ask.price,
            size: shares,
            ioc: true,
          },
        ];
      if (idx.bid.price - implied - fee >= threshold)
        return [
          {
            kind: 'order',
            symbol: index,
            exchange: idx.bid.exchange,
            side: 'sell',
            price: idx.bid.price,
            size: shares,
            ioc: true,
          },
        ];
      return [];
    }
    const mid = (idx.bid.price + idx.ask.price) / 2;
    const caughtUp = position > 0 ? implied - mid <= threshold / 4 : mid - implied <= threshold / 4;
    if (!caughtUp) return [];
    const out = flattenTo(view, index, position, 0);
    return out ? [out] : [];
  },
};
