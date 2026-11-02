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
        let lastFill = -Infinity;
        for (const f of view.recentFills) {
          if (f.block === this.spec.id && (f.symbol === a || f.symbol === b) && f.at > lastFill) lastFill = f.at;
        }
        if (view.now - lastFill < hold) continue;
        const ma = view.mids[a] ?? [];
        const mb = view.mids[b] ?? [];
        const n = Math.min(ma.length, mb.length);
        if (n < lookback) continue;
        const ratios: number[] = [];
        for (let i = 1; i <= lookback; i++) ratios.push(ma[ma.length - i]! / mb[mb.length - i]!);
        const average = ratios.reduce((x, y) => x + y, 0) / ratios.length;
        const now = ratios[0]!;
        const away = now / average - 1;
        const named = view.news.some(
          (h) => view.now - h.at < pause && (h.symbols.includes(a) || h.symbols.includes(b)),
        );
        const posA = ownPosition(view, this.spec.id, a);
        const posB = ownPosition(view, this.spec.id, b);
        let wantA = posA;
        let wantB = posB;
        // Out once the ratio is back within a quarter of the threshold, or the pair has been named in the news.
        if (named || Math.abs(away) < threshold / 4) {
          wantA = 0;
          wantB = 0;
        } else if (away > threshold && posA === 0 && posB === 0) {
          // a has run ahead of b: sell a, buy b.
          wantA = -size;
          wantB = size;
        } else if (away < -threshold && posA === 0 && posB === 0) {
          wantA = size;
          wantB = -size;
        }
        const ia = flattenTo(view, a, posA, wantA);
        const ib = flattenTo(view, b, posB, wantB);
        if (ia && ib) {
          out.push(ia, ib);
          done.add(a);
          done.add(b);
        } else if (ia && wantA === 0) {
          out.push(ia);
        } else if (ib && wantB === 0) {
          out.push(ib);
        }
      }
    }
    return out;
  },
};
