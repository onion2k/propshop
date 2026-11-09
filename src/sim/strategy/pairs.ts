// Pairs: two stocks in one sector move together, and when one has moved and the other has not, the one left
// behind will usually follow or the one ahead come back. Sell the leader, buy the laggard, and close when
// the two are back in line. The sniper's lesson at the scale of a company rather than an exchange.

import {
  flattenTo,
  inFlight,
  ownPosition,
  type Intent,
  type MarketView,
  type Params,
  type StrategyBlock,
} from './types';

/**
 * How far the ratio of a's mid to b's has strayed from its average over the last `lookback` samples, a share; null
 * with fewer samples of either. The mids are the firm's, sampled at each decision while a symbol is quoted.
 */
export function ratioAway(view: MarketView, a: string, b: string, lookback: number): number | null {
  const ma = view.mids[a] ?? [];
  const mb = view.mids[b] ?? [];
  const n = Math.min(ma.length, mb.length);
  if (n < lookback) return null;
  const ratios: number[] = [];
  for (let i = 1; i <= lookback; i++) ratios.push(ma[ma.length - i]! / mb[mb.length - i]!);
  const average = ratios.reduce((x, y) => x + y, 0) / ratios.length;
  const now = ratios[0]!;
  return now / average - 1;
}

/** When the block last filled in either leg, of the fills still in the log; -Infinity where none is. */
export function lastPairFill(view: MarketView, block: string, a: string, b: string): number {
  let lastFill = -Infinity;
  for (const f of view.recentFills) {
    if (f.block === block && (f.symbol === a || f.symbol === b) && f.at > lastFill) lastFill = f.at;
  }
  return lastFill;
}

/** Whether a headline in the last `pauseMs` named either symbol. */
export function namedIn(view: MarketView, a: string, b: string, pauseMs: number): boolean {
  return view.news.some((h) => view.now - h.at < pauseMs && (h.symbols.includes(a) || h.symbols.includes(b)));
}

/**
 * What a pair wants to hold of each leg: out once the ratio is back within a quarter of the threshold or the pair is
 * in the news; from flat, short the leg that has run ahead and long the other past the threshold; else as it is.
 */
export function pairWant(
  away: number,
  threshold: number,
  named: boolean,
  posA: number,
  posB: number,
  sizeA: number,
  sizeB: number,
): [number, number] {
  if (named || Math.abs(away) < threshold / 4) return [0, 0];
  if (away > threshold && posA === 0 && posB === 0) return [-sizeA, sizeB];
  if (away < -threshold && posA === 0 && posB === 0) return [sizeA, -sizeB];
  return [posA, posB];
}

/**
 * The IOCs that take both legs toward what is wanted: both, where both can go (`both`); else a leg alone only on its
 * way out, never into a pair half made.
 */
export function pairOrders(
  view: MarketView,
  a: string,
  b: string,
  posA: number,
  posB: number,
  wantA: number,
  wantB: number,
): { intents: Intent[]; both: boolean } {
  const ia = flattenTo(view, a, posA, wantA);
  const ib = flattenTo(view, b, posB, wantB);
  if (ia && ib) return { intents: [ia, ib], both: true };
  if (ia && wantA === 0) return { intents: [ia], both: false };
  if (ib && wantB === 0) return { intents: [ib], both: false };
  return { intents: [], both: false };
}

export const pairs: StrategyBlock = {
  spec: {
    id: 'pairs',
    name: 'Pairs',
    summary: 'Two stocks of one sector: sell the one that has run ahead, buy the one left behind.',
    explain:
      'Stocks in a sector share their sector’s moves, so the ratio of their prices wanders less than ' +
      'either price does. When the ratio has strayed from its recent average by more than a threshold, one ' +
      'of the two has moved and the other has not yet: sell the leader, buy the laggard, and close both once ' +
      'the ratio is back within half the threshold. It needs both stocks on the watchlist. It earns when the ' +
      'pair comes back together and loses when one of them had a reason of its own to move: company news is ' +
      'exactly that, so the block steps out of a pair for a while after a headline names either stock.',
    params: [
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
        max: 100,
        step: 5,
        default: 20,
        unit: 'bps',
        explain: 'How far the ratio must stray from its average, in basis points, before the block trades.',
      },
      {
        key: 'size',
        name: 'Size',
        min: 100,
        max: 2000,
        step: 100,
        default: 200,
        unit: 'shares',
        explain: 'Shares of each leg.',
      },
      {
        key: 'hold',
        name: 'Hold for',
        min: 5,
        max: 600,
        step: 5,
        default: 60,
        unit: 's',
        explain:
          'After a fill in either stock, leave the pair alone this long. A ratio flickers; a block that flickers with it pays the spread every time.',
      },
      {
        key: 'newsPause',
        name: 'Step away on news for',
        min: 0,
        max: 300,
        step: 10,
        default: 60,
        unit: 's',
        explain: 'After a headline names either stock, leave the pair alone this long: the move may be its own.',
      },
    ],
  },

  decide(view: MarketView, p: Params): Intent[] {
    const out: Intent[] = [];
    const lookback = p.lookback ?? 30;
    const threshold = (p.threshold ?? 25) / 10_000;
    const size = p.size ?? 200;
    const pause = (p.newsPause ?? 60) * 1000;
    const hold = (p.hold ?? 60) * 1000;
    const watched = view.symbols.filter((s) => !view.constituents[s]);
    const done = new Set<string>();
    for (const a of watched) {
      for (const b of watched) {
        if (a >= b || done.has(a) || done.has(b)) continue;
        if (view.sectors[a] !== view.sectors[b]) continue;
        if (inFlight(view, a, this.spec.id) || inFlight(view, b, this.spec.id)) continue;
        if (view.now - lastPairFill(view, this.spec.id, a, b) < hold) continue;
        const away = ratioAway(view, a, b, lookback);
        if (away === null) continue;
        const named = namedIn(view, a, b, pause);
        const posA = ownPosition(view, this.spec.id, a);
        const posB = ownPosition(view, this.spec.id, b);
        const [wantA, wantB] = pairWant(away, threshold, named, posA, posB, size, size);
        const { intents, both } = pairOrders(view, a, b, posA, posB, wantA, wantB);
        out.push(...intents);
        if (both) {
          done.add(a);
          done.add(b);
        }
      }
    }
    return out;
  },
};
