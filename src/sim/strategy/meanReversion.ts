// Mean reversion: a price that has lurched away from where it was tends to come part of the way back, because
// the lurch was one trader's hurry and the crowd re-centres after. Fade the move, take the bounce, get out.
// The opposite bet to momentum, and it loses the same way in reverse: on a day that trends, every fade is run over.

import {
  flattenTo,
  inFlight,
  ownPosition,
  type Intent,
  type MarketView,
  type Params,
  type StrategyBlock,
} from './types';

export const meanReversion: StrategyBlock = {
  spec: {
    id: 'meanReversion',
    name: 'Mean reversion',
    summary: 'Fade a lurch and take the bounce back toward the average.',
    explain:
      'Watch the midpoint against its own average over a short lookback. When it has lurched past a threshold ' +
      'above the average, sell; below, buy; once it is back within half the threshold, get flat. On a choppy ' +
      'day most lurches come back and the block collects the difference. On a trending day the average lags ' +
      'the price all session and every fade is a loss. The two blocks are mirror images: the day decides.',
    params: [
      {
        key: 'lookback',
        name: 'Lookback',
        min: 5,
        max: 60,
        step: 1,
        default: 20,
        unit: 'quarter-seconds',
        explain: 'How many quarter-seconds the average is taken over.',
      },
      {
        key: 'threshold',
        name: 'Threshold',
        min: 1,
        max: 20,
        step: 1,
        default: 3,
        unit: '¢',
        explain: 'How far from the average the midpoint must be before the block fades it.',
      },
      {
        key: 'size',
        name: 'Size',
        min: 100,
        max: 2000,
        step: 100,
        default: 200,
        unit: 'shares',
        explain: 'The position to hold against the move.',
      },
    ],
  },

  decide(view: MarketView, p: Params): Intent[] {
    const out: Intent[] = [];
    const lookback = p.lookback ?? 20;
    const threshold = p.threshold ?? 3;
    const size = p.size ?? 200;
    for (const symbol of view.symbols) {
      if (inFlight(view, symbol, this.spec.id)) continue;
      const mids = view.mids[symbol] ?? [];
      if (mids.length < lookback) continue;
      const window = mids.slice(-lookback);
      const average = window.reduce((a, b) => a + b, 0) / window.length;
      const now = mids[mids.length - 1];
      if (now === undefined) continue;
      const away = now - average;
      const position = ownPosition(view, this.spec.id, symbol);
      let want = position;
      if (away > threshold) want = -size;
      else if (away < -threshold) want = size;
      else if (Math.abs(away) < threshold / 2) want = 0;
      const intent = flattenTo(view, symbol, position, want);
      if (intent) out.push(intent);
    }
    return out;
  },
};
