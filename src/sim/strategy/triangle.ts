// The triangle: a cross rate is the product of its two legs (the euro in yen is the euro in dollars times the dollar
// in yen), and for a moment after the dollar moves, the cross's book has not caught up with the legs'. Sell the
// dearer side and buy the cheaper, three legs at once on one venue, and the firm is back where it started in every
// currency, a little richer. Three legs is three races: a leg that misses leaves a position, and the block puts it
// back in line at once.

import {
  bestAcross,
  inFlight,
  ownPosition,
  flattenTo,
  type Intent,
  type MarketView,
  type Params,
  type PairView,
  type StrategyBlock,
} from './types';

/** Float dust in the product of two prices: a gap this close to the threshold is at it. */
const DUST = 1e-9;

/** The middle of three: what two legs out of three agree on. */
function middle(a: number, b: number, c: number): number {
  return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
}

export const triangle: StrategyBlock = {
  spec: {
    id: 'triangle',
    name: 'Triangular arbitrage',
    summary: 'Trade a cross rate against its two legs when they disagree.',
    explain:
      'The euro in yen should be the euro in dollars times the dollar in yen. When the dollar moves, the two ' +
      'pairs reprice first and the cross is slow to follow, so for a moment the cross is dearer or cheaper than ' +
      'its legs say. When the gap, in pips of the cross, is more than a threshold after all three fees, sell the ' +
      'dear side and buy the cheap one: three orders at once, on one venue. The cross and the euro leg are the same ' +
      'number of lots; the dollar leg is as many lots as those euros are worth in dollars, rounded to a whole lot. ' +
      'Done, the firm holds nothing it did not hold before, bar a little change in yen and dollars, never more than ' +
      'half a lot. Three legs are three races, and ' +
      'losing one leaves a position: the block trades it back into line with the other two straight away, at the ' +
      'best price it can see, which costs the spread. On the dealer there is no fee, but the dealer may refuse a ' +
      'leg after it has looked at it.',
    params: [
      {
        key: 'threshold',
        name: 'Minimum gap',
        min: 0,
        max: 20,
        step: 0.5,
        default: 1,
        unit: 'pips',
        explain: 'How far the cross must be from its legs, in pips of the cross, after the three fees.',
      },
      {
        key: 'lots',
        name: 'Size',
        min: 1,
        max: 100,
        step: 1,
        default: 10,
        unit: 'lots',
        explain: 'Lots a leg, each a thousand of the pair’s first currency, capped by what all three books show.',
      },
      {
        key: 'venue',
        name: 'Venue',
        min: 0,
        max: 1,
        step: 1,
        default: 0,
        unit: '',
        explain: 'Where all three legs go: the book, which charges a fee, or the dealer, which looks first.',
        choices: ['the book', 'the dealer'],
      },
    ],
  },

  decide(view: MarketView, p: Params): Intent[] {
    const threshold = p.threshold ?? 1;
    const lots = p.lots ?? 10;
    const id = this.spec.id;
    const out: Intent[] = [];
    for (const [cross, pair] of Object.entries(view.pairs ?? {})) {
      if (!pair.cross || !view.symbols.includes(cross)) continue;
      const [a, b] = pair.cross.legs;
      if (!view.symbols.includes(a) || !view.symbols.includes(b)) continue;
      if (inFlight(view, cross, id) || inFlight(view, a, id) || inFlight(view, b, id)) continue;
      const legs = scratch(view, id, cross, a, b);
      if (legs !== null) {
        out.push(...legs);
        continue;
      }
      const opened = open(view, id, pair, cross, a, b, threshold, lots, p.venue ?? 0);
      if (opened) out.push(...opened);
    }
    return out;
  },
};

/**
 * Lots of the second leg one lot of the first is worth, at the first's price: the euro in dollars is 1.0850, so ten
 * lots of the euro (10,850 dollars) want 10.85 lots of the dollar. One where the two legs do not meet in a currency.
 */
function ratio(view: MarketView, a: string, b: string, price: number): number {
  const pa = view.pairs?.[a];
  const pb = view.pairs?.[b];
  if (!pa || !pb || pa.quote !== pb.base || pb.units <= 0) return 1;
  return (price * pa.scale) / pb.units;
}

/** The second leg's position that goes with so many lots of the first: rounded to a whole lot. */
function legFor(lots: number, r: number): number {
  return Math.round(lots * r) || 0;
}

/**
 * A triangle is whole when the first leg holds what the cross holds against it and the second leg is within a lot
 * of what that is worth (the price wanders, and whole lots round). Where one is out of line, the leg the other two
 * disagree with is traded to them; null where the triangle is whole (or flat).
 */
function scratch(view: MarketView, id: string, cross: string, a: string, b: string): Intent[] | null {
  const pa = ownPosition(view, id, a);
  const pb = ownPosition(view, id, b);
  const px = -ownPosition(view, id, cross);
  if (pa === 0 && pb === 0 && px === 0) return null;
  const { bid, ask } = bestAcross(view, a);
  // Shut: nothing to price the legs by, and nothing would fill.
  if (!bid || !ask) return [];
  const r = ratio(view, a, b, (bid.price + ask.price) / 2);
  if (pa === px && Math.abs(pb - legFor(pa, r)) <= 1) return null;
  // What two of the three agree on, in lots of the first leg.
  const k = Math.round(middle(pa, px, pb / r));
  const wantB = Math.abs(pb - legFor(k, r)) <= 1 ? pb : legFor(k, r);
  const out: Intent[] = [];
  for (const [symbol, now, want] of [
    [a, pa, k],
    [b, pb, wantB],
    [cross, -px, -k],
  ] as const) {
    const intent = flattenTo(view, symbol, now, want);
    if (intent) out.push(intent);
  }
  return out;
}

/**
 * The three legs, where the cross is far enough from the product of its legs on the venue, after fees. The second
 * leg brings the block's whole holding of it to what its whole first leg is worth, so its rounding never adds up.
 */
function open(
  view: MarketView,
  id: string,
  pair: PairView,
  cross: string,
  a: string,
  b: string,
  threshold: number,
  lots: number,
  venueIndex: number,
): Intent[] | null {
  const venue = pair.venues[Math.round(venueIndex)];
  if (venue === undefined) return null;
  const q = view.quotes[venue];
  const qx = q?.[cross];
  const qa = q?.[a];
  const qb = q?.[b];
  if (!qx || !qa || !qb) return null;
  const scale = pair.cross!.scale;
  // Three fees, dollar cents a lot, in pips of the cross.
  const fees = pair.pointValue > 0 ? (3 * (view.fees[venue] ?? 0)) / pair.pointValue : Infinity;
  const pa = ownPosition(view, id, a);
  const pb = ownPosition(view, id, b);
  const leg = (symbol: string, side: 'buy' | 'sell', price: number, size: number): Intent => ({
    kind: 'order',
    symbol,
    exchange: venue,
    side,
    price,
    size,
    ioc: true,
  });
  /** The most lots of the cross and first leg, at most `most`, whose second leg fits what its touch shows. */
  const sized = (most: number, sign: 1 | -1, r: number, room: number): { n: number; m: number } | null => {
    for (let n = most; n > 0; n--) {
      const m = sign * (legFor(pa + sign * n, r) - pb);
      if (m >= 0 && m <= room) return { n, m };
    }
    return null;
  };
  const three = (
    xs: 'buy' | 'sell',
    xp: number,
    as: 'buy' | 'sell',
    ap: number,
    bp: number,
    s: { n: number; m: number },
  ): Intent[] => [leg(cross, xs, xp, s.n), leg(a, as, ap, s.n), ...(s.m > 0 ? [leg(b, as, bp, s.m)] : [])];
  // The cross rich: sell it at its bid, buy both legs at their asks.
  if (qx.bid !== null && qa.ask !== null && qb.ask !== null) {
    const gap = qx.bid - qa.ask * qb.ask * scale - fees;
    if (gap + DUST >= threshold) {
      const s = sized(Math.min(lots, qx.bidSize, qa.askSize), 1, ratio(view, a, b, qa.ask), qb.askSize);
      if (s) return three('sell', qx.bid, 'buy', qa.ask, qb.ask, s);
    }
  }
  // The cross cheap: buy it at its ask, sell both legs at their bids.
  if (qx.ask !== null && qa.bid !== null && qb.bid !== null) {
    const gap = qa.bid * qb.bid * scale - qx.ask - fees;
    if (gap + DUST >= threshold) {
      const s = sized(Math.min(lots, qx.askSize, qa.bidSize), -1, ratio(view, a, b, qa.bid), qb.bidSize);
      if (s) return three('buy', qx.ask, 'sell', qa.bid, qb.bid, s);
    }
  }
  return null;
}
