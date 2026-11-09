// Pairs across desks: the pairs block's ratio and band, set to two symbols that need not share a sector or a desk. A
// gold miner's shares move with gold, at a loading, and gold and silver move together, silver about twice as far:
// when one has moved and the other not yet, sell the one ahead and buy the one behind, a leg each of the same value,
// and close both once the ratio is back. The working is the pairs block's (`./pairs`); what is new is that the two
// legs are named, priced in different units, and may trade at different hours.

import { lastPairFill, namedIn, pairOrders, pairWant, ratioAway } from './pairs';
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

/** The pairs the block offers, by its `legs` choice: the first leg against the second. Gold is in both. */
export const CROSS_PAIRS: readonly (readonly [string, string])[] = [
  ['RDG', 'XAU'],
  ['XAU', 'XAG'],
];

/** The leg sized in lots; the other is matched to its value. */
const GOLD = 'XAU';

/** A symbol's mid where both sides are quoted somewhere, else null: a leg that cannot be traded now. */
function midOf(view: MarketView, symbol: string): number | null {
  const { bid, ask } = bestAcross(view, symbol);
  return bid && ask ? (bid.price + ask.price) / 2 : null;
}

export const crossPairs: StrategyBlock = {
  spec: {
    id: 'crossPairs',
    name: 'Pairs across desks',
    summary: 'The miner against gold, or gold against silver: sell the one that has run ahead, buy the one behind.',
    explain:
      'A gold miner earns what gold sells for, so its shares move with gold, though not one for one, and gold and ' +
      'silver move together, silver about twice as far. The ratio of the two prices wanders less than either. When ' +
      'it has strayed from its recent average by more than a threshold, sell the one that has run ahead and buy the ' +
      'one left behind, a leg each of the same value in dollars, and close both once the ratio is back within a ' +
      'quarter of the threshold. The two legs are on different desks or different venues, priced in different ' +
      'units, and the miner trades only while the stock exchanges are open, so the pair can be traded only while ' +
      'both are. It loses when one leg had a reason of its own to move: the block steps out after a headline names ' +
      'either, and a leg left alone when the other missed is closed at once.',
    params: [
      {
        key: 'legs',
        name: 'Pair',
        min: 0,
        max: 1,
        step: 1,
        default: 0,
        unit: '',
        explain:
          'Which two to trade: the miner Ridgeline against gold, or gold against silver (the gold-silver ratio).',
        choices: ['the miner and gold', 'gold and silver'],
      },
      {
        key: 'lookback',
        name: 'Lookback',
        min: 2,
        max: 2400,
        step: 1,
        default: 1200,
        unit: 'quarter-seconds',
        explain: 'How many decisions the ratio’s average is taken over.',
      },
      {
        key: 'threshold',
        name: 'Threshold',
        min: 5,
        max: 200,
        step: 5,
        default: 20,
        unit: 'bps',
        explain: 'How far the ratio must stray from its average, in basis points, before the block trades.',
      },
      {
        key: 'lots',
        name: 'Size',
        min: 1,
        max: 10,
        step: 1,
        default: 1,
        unit: 'lots of gold',
        explain:
          'Lots of gold, ten ounces each; the other leg is as much of the miner or of silver as is worth the same.',
      },
      {
        key: 'hold',
        name: 'Hold for',
        min: 5,
        max: 600,
        step: 5,
        default: 60,
        unit: 's',
        explain: 'After a fill in either leg, leave the pair alone this long, so a flickering ratio is not paid for.',
      },
      {
        key: 'newsPause',
        name: 'Step away on news for',
        min: 0,
        max: 300,
        step: 10,
        default: 60,
        unit: 's',
        explain: 'After a headline names either leg, leave the pair alone this long: the move may be its own.',
      },
    ],
  },

  decide(view: MarketView, p: Params): Intent[] {
    const id = this.spec.id;
    const pair = CROSS_PAIRS[Math.round(p.legs ?? 0)] ?? CROSS_PAIRS[0]!;
    const [a, b] = pair;
    if (!view.symbols.includes(a) || !view.symbols.includes(b)) return [];
    if (inFlight(view, a, id) || inFlight(view, b, id)) return [];
    const posA = ownPosition(view, id, a);
    const posB = ownPosition(view, id, b);
    // A leg left alone (the other missed, or was closed): out of it, whatever the ratio says.
    if ((posA === 0) !== (posB === 0)) {
      const lone = posA !== 0 ? flattenTo(view, a, posA, 0) : flattenTo(view, b, posB, 0);
      return lone ? [lone] : [];
    }
    const midA = midOf(view, a);
    const midB = midOf(view, b);
    if (midA === null || midB === null) return [];
    if (view.now - lastPairFill(view, id, a, b) < (p.hold ?? 60) * 1000) return [];
    const away = ratioAway(view, a, b, p.lookback ?? 1200);
    if (away === null) return [];
    // Gold is sized in lots; the other leg is the same value at the mids now.
    const lots = p.lots ?? 1;
    const value = (s: string, mid: number) => mid * (view.scales?.[s] ?? 1);
    const goldValue = lots * value(GOLD, a === GOLD ? midA : midB);
    const sizeA = a === GOLD ? lots : Math.max(1, Math.round(goldValue / value(a, midA)));
    const sizeB = b === GOLD ? lots : Math.max(1, Math.round(goldValue / value(b, midB)));
    const named = namedIn(view, a, b, (p.newsPause ?? 60) * 1000);
    const [wantA, wantB] = pairWant(away, (p.threshold ?? 20) / 10_000, named, posA, posB, sizeA, sizeB);
    return pairOrders(view, a, b, posA, posB, wantA, wantB).intents;
  },
};
