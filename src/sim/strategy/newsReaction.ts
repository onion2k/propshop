// News reaction: a headline reads good or bad for a stock, and the market takes a little while to price it in.
// Trade in the headline's direction while that window is open, then get flat. Some headlines sound like news
// and move nothing, and the block cannot tell those apart; the player learns which kinds do.

import {
  flattenTo,
  inFlight,
  ownPosition,
  type Intent,
  type MarketView,
  type Params,
  type StrategyBlock,
} from './types';

export const newsReaction: StrategyBlock = {
  spec: {
    id: 'newsReaction',
    name: 'News reaction',
    summary: 'Trade the way a fresh headline reads, then step out.',
    explain:
      'When news lands, the fair value of the stock changes at once, but the price gets there over seconds as ' +
      'traders read it and the exchanges catch up. A firm that reacts in milliseconds trades at the old price ' +
      'and rides it to the new one. The block buys on a headline that reads up and sells on one that reads ' +
      'down, holds for a window, then flattens. It cannot tell a real story from a rumour, and a rumour moves ' +
      'nothing, so it loses the spread on those.',
    params: [
      {
        key: 'size',
        name: 'Size',
        min: 100,
        max: 2000,
        step: 100,
        default: 300,
        unit: 'shares',
        explain: 'The position to take on a headline.',
      },
      {
        key: 'window',
        name: 'Hold for',
        min: 5,
        max: 120,
        step: 5,
        default: 30,
        unit: 's',
        explain: 'How long after the headline to stay in before flattening.',
      },
    ],
  },

  decide(view: MarketView, p: Params): Intent[] {
    const out: Intent[] = [];
    const size = p.size ?? 300;
    const window = (p.window ?? 30) * 1000;
    for (const symbol of view.symbols) {
      if (inFlight(view, symbol, this.spec.id)) continue;
      const live = view.news.filter((h) => h.symbols.includes(symbol) && view.now - h.at < window && h.direction !== 0);
      const latest = live[live.length - 1];
      // Only this block's own doing is undone: a position another block took is left alone.
      const position = ownPosition(view, this.spec.id, symbol);
      const want = latest ? latest.direction * size : 0;
      const intent = flattenTo(view, symbol, position, want);
      if (intent) out.push(intent);
    }
    return out;
  },
};
