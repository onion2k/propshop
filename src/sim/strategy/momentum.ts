// Momentum: a stock that has just moved tends, for a moment, to keep moving, because the orders behind the move
// are still arriving. Buy into a rise, sell into a fall, and get out when it turns. It pays the spread on every
// trade, so it loses in a market that just wobbles.

import {
  flattenTo,
  inFlight,
  ownPosition,
  type Intent,
  type MarketView,
  type Params,
  type StrategyBlock,
} from './types';

export const momentum: StrategyBlock = {
  spec: {
    id: 'momentum',
    name: 'Momentum',
    summary: 'Follow a move while it lasts, and get out when it turns.',
    explain:
      'A big order rarely arrives all at once; it is sliced up and fed in over seconds, and the price drifts ' +
      'the same way while that goes on. The block watches the midpoint over a short lookback and buys when it ' +
      'has risen past a threshold, sells when it has fallen past it, and flattens out when the move reverses. ' +
      'Every entry and exit crosses the spread and pays a fee, so a market that only wobbles bleeds it dry.',
    params: [
      {
        key: 'lookback',
        name: 'Lookback',
        min: 2,
        max: 50,
        step: 1,
        default: 10,
        unit: 'quarter-seconds',
        explain: 'How many quarter-seconds back to compare the price against.',
      },
      {
        key: 'threshold',
        name: 'Threshold',
        min: 1,
        max: 20,
        step: 1,
        default: 3,
        unit: '¢',
        explain: 'How far the midpoint has to have moved before the block acts.',
      },
      {
        key: 'size',
        name: 'Size',
        min: 100,
        max: 2000,
        step: 100,
        default: 200,
        unit: 'shares',
        explain: 'The position to hold while the move lasts.',
      },
    ],
  },

  decide(view: MarketView, p: Params): Intent[] {
    const out: Intent[] = [];
    const lookback = p.lookback ?? 10;
    const threshold = p.threshold ?? 3;
    const size = p.size ?? 200;
    for (const symbol of view.symbols) {
      if (inFlight(view, symbol, this.spec.id)) continue;
      const mids = view.mids[symbol] ?? [];
      if (mids.length <= lookback) continue;
      const now = mids[mids.length - 1];
      const then = mids[mids.length - 1 - lookback];
      if (now === undefined || then === undefined) continue;
      const move = now - then;
      const position = ownPosition(view, this.spec.id, symbol);
      let want = position;
      if (move > threshold) want = size;
      else if (move < -threshold) want = -size;
      else if (Math.sign(move) !== Math.sign(position)) want = 0;
      const intent = flattenTo(view, symbol, position, want);
      if (intent) out.push(intent);
    }
    return out;
  },
};
