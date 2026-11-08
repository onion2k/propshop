// Roll: hold the index through its future, and before the near contract expires move to the next. A position in
// a future is cheap to hold (margin, not the whole price) but it ends; staying in the market means rolling, and
// every roll crosses two spreads and pays the difference in carry between the two contracts.

import {
  contractsByExpiry,
  flattenTo,
  inFlight,
  ownPosition,
  type Intent,
  type MarketView,
  type Params,
  type StrategyBlock,
} from './types';

const HOUR = 60 * 60 * 1000;

export const roll: StrategyBlock = {
  spec: {
    id: 'roll',
    name: 'Roll',
    summary: 'Hold a long position in the index future, and roll it to the next contract before expiry.',
    explain:
      'A future ends at its expiry: whoever holds it then is settled at the index and is out. To stay in, sell ' +
      'the near contract before it expires and buy the next one. That is the roll, and it costs two spreads and ' +
      'the difference in carry between the two: the next contract is priced further out, so it is dearer. Roll ' +
      'too early and you pay the carry for longer; too late and you trade in the thin last hours, or are settled ' +
      'out. Holds the near contract until its roll window, then the next.',
    params: [
      {
        key: 'contracts',
        name: 'Contracts',
        min: 1,
        max: 20,
        step: 1,
        default: 1,
        unit: 'contracts',
        explain: 'How many contracts to hold.',
      },
      {
        key: 'rollBefore',
        name: 'Roll before expiry',
        min: 1,
        max: 72,
        step: 1,
        default: 24,
        unit: 'hours',
        explain: 'How long before the near contract expires to move to the next.',
      },
    ],
  },

  decide(view: MarketView, p: Params): Intent[] {
    const contracts = p.contracts ?? 1;
    const window = (p.rollBefore ?? 24) * HOUR;
    const id = this.spec.id;
    const listed = contractsByExpiry(view);
    const [near, next] = listed;
    if (!near) return [];
    const target = near[1].expiry - view.now > window || !next ? near[0] : next[0];
    const out: Intent[] = [];
    for (const [symbol] of listed) {
      if (inFlight(view, symbol, id)) return [];
      const want = symbol === target ? contracts : 0;
      const intent = flattenTo(view, symbol, ownPosition(view, id, symbol), want);
      if (intent) out.push(intent);
    }
    return out;
  },
};
