// Option making: rest a bid and an ask on each option, priced from the volatility the book itself implies, a little
// either side. The maker earns the edge each time a customer takes a quote; what it holds then moves with the index
// (delta), and is hedged in the index future. Every option is flattened in the last minutes before it expires.

import { delta as optionDelta, price as optionPrice } from '../options';
import { MS_PER_MINUTE, MS_PER_YEAR } from '../clock';
import { futureSpot, futuresOn, venueOf } from './optionsView';
import {
  flattenTo,
  inFlight,
  ownPosition,
  type Intent,
  type MarketView,
  type OpenOrder,
  type Params,
  type SeenQuote,
  type StrategyBlock,
} from './types';

const NO_ORDERS: readonly OpenOrder[] = [];

/** A future with less than this left is not traded to hedge with. */
const HEDGE_GUARD = 10 * MS_PER_MINUTE;

/**
 * The best bid and ask of a book with this block's own resting orders taken out: where one is the whole of the best
 * level, the second level is the touch (as `touchExcluding`, here from the orders already found).
 */
function without(q: SeenQuote, mine: readonly OpenOrder[]): { bid: number | null; ask: number | null } {
  let bid = q.bid;
  let ask = q.ask;
  for (const o of mine) {
    if (o.status !== 'resting') continue;
    const left = o.size - o.filled;
    if (o.side === 'buy' && o.price === q.bid && left >= q.bidSize) bid = q.bid2;
    if (o.side === 'sell' && o.price === q.ask && left >= q.askSize) ask = q.ask2;
  }
  return { bid, ask };
}

export const optionMaker: StrategyBlock = {
  pace: (p) => p.every ?? 50,
  spec: {
    id: 'optionMaker',
    name: 'Option maker',
    summary:
      'Quote both sides of every option from the volatility the book implies, and hedge the delta in the future.',
    explain:
      'An option is worth what a model says given the index, the time left and a volatility, and the book tells ' +
      'you which volatility: invert its midpoint. The maker reads that implied volatility (with its own quotes ' +
      'taken out of the book, or it would chase itself), then rests a bid at the price a little under it and an ' +
      'ask at the price a little over, the edge, in volatility points. A customer who takes a quote pays that ' +
      'edge. What the maker holds then is a bet on the index (delta), a bet on how much it moves (gamma) and a ' +
      'bet on the volatility itself (vega), and the quotes lean away from a side that is full. With the hedge ' +
      'on, the block trades the index future to keep the net delta of its options inside a band of contracts, so ' +
      'what is left is gamma and vega: the maker earns its edge on a quiet day and pays for the moves of a ' +
      'trending one. An option about to expire is worth only what the index does in the last minutes, so every ' +
      'position is closed and the quotes pulled before the close. Its quotes are post-only, and always inside ' +
      'the book it sees.',
    params: [
      {
        key: 'every',
        name: 'Think every',
        min: 0,
        max: 1000,
        step: 10,
        default: 50,
        unit: 'ms',
        explain:
          'How often the block looks at the books and requotes, at most. A faster computer could look every ' +
          'few milliseconds; most of the looks find nothing to change, and a quote left a little longer is a ' +
          'little more likely to be picked off. At nought it looks at every decision the computer makes.',
      },
      {
        key: 'edge',
        name: 'Edge',
        min: 0,
        max: 5,
        step: 0.1,
        default: 1.5,
        unit: 'vol points',
        explain:
          'How far either side of the implied volatility the quotes sit, in points of volatility (a point is a ' +
          'hundredth), worked on calendar time: the chain shows volatility on a trading clock, where a point of this is ' +
          'about four-tenths of one for today’s options and six-tenths to three-quarters for tomorrow’s. At zero it ' +
          'quotes the book’s own price; further out it earns more a fill and fills less. The venue’s own quoter sits ' +
          'two and a half points either side, so an edge under that stands inside it.',
      },
      {
        key: 'size',
        name: 'Quote size',
        min: 1,
        max: 100,
        step: 1,
        default: 5,
        unit: 'contracts',
        explain: 'Contracts on each quote.',
      },
      {
        key: 'maxPosition',
        name: 'Max position',
        min: 5,
        max: 200,
        step: 5,
        default: 20,
        unit: 'contracts',
        explain: 'The most to hold in any one option, long or short. At the limit that side is not quoted.',
      },
      {
        key: 'requote',
        name: 'Requote when off by',
        min: 0,
        max: 5,
        step: 1,
        default: 0,
        unit: '¢',
        explain:
          'A resting quote is left alone until the price it would be put at is this far from it. At nought it is ' +
          'moved at once, so it is never a tick stale: a quote left a cent off is the best price on the book just when ' +
          'the market has moved away from it, and every customer who takes it is one who knew.',
      },
      {
        key: 'hedge',
        name: 'Delta hedge',
        min: 0,
        max: 1,
        step: 1,
        default: 1,
        unit: '',
        explain: 'Trade the index future to keep the options’ net delta near nothing.',
        choices: ['off', 'on'],
      },
      {
        key: 'hedgeBand',
        name: 'Hedge when off by',
        min: 0,
        max: 40,
        step: 1,
        default: 20,
        unit: 'contracts',
        explain:
          'The net delta, in contracts of the future, is left alone while it is inside this and brought back to ' +
          'nothing when it is outside. Tighter hedges more often and pays the future’s spread each time: at a ' +
          'few contracts the hedge trades with nearly every fill and costs more than the options earn.',
      },
      {
        key: 'flattenBefore',
        name: 'Flatten before expiry',
        min: 1,
        max: 60,
        step: 1,
        default: 30,
        unit: 'min',
        explain:
          'How long before an option expires its quotes are pulled and its position closed. In the last half hour a ' +
          'day’s option at the money is nearly all gamma: its delta flips with every cent the index moves, the hedge ' +
          'chases it and pays the future’s spread each time.',
      },
    ],
  },

  decide(view: MarketView, p: Params): Intent[] {
    const options = view.options;
    if (!options) return [];
    const id = this.spec.id;
    const edge = (p.edge ?? 1.5) / 100;
    const size = p.size ?? 5;
    const max = p.maxPosition ?? 20;
    const tolerance = p.requote ?? 0;
    const flatten = (p.flattenBefore ?? 30) * MS_PER_MINUTE;
    const out: Intent[] = [];
    // The delta of what is held, in contracts of the future: an option and the future each stand for their multiplier.
    let net = 0;
    let holdsOptions = false;
    // Whether a held option is inside its flattening window: the block is getting out of it, its delta is falling to
    // nothing by itself, and a hedge chased through the exit is traded back at the next look, each time at the spread.
    let flattening = false;
    // Whether a held option's delta could not be worked (no volatility read anywhere, or no price for the underlying):
    // the net is then short of it, and a hedge set against the rest would undo itself at the next look that reads it.
    let blind = false;
    const hedgeSpots = new Map<string, number | null>();
    let futureMultiplier = 100;
    // This block's live orders, by symbol, in one pass: nearly every decision it has none for most options.
    let orders: Map<string, OpenOrder[]> | null = null;
    for (const o of view.openOrders) {
      if (o.block !== id || (o.status !== 'resting' && o.status !== 'inflight' && o.status !== 'cancelling')) continue;
      orders ??= new Map();
      const list = orders.get(o.symbol);
      if (list) list.push(o);
      else orders.set(o.symbol, [o]);
    }
    for (const symbol in options.chain) {
      const c = options.chain[symbol]!;
      if (!view.symbols.includes(symbol)) continue;
      const exchange = venueOf(view, symbol);
      if (exchange === null) continue;
      const position = ownPosition(view, id, symbol);
      const mine = orders?.get(symbol) ?? NO_ORDERS;
      const q = view.quotes[exchange]![symbol]!;
      // A book with no bid or no ask has no volatility to read, and nothing is held or resting in it.
      if (position === 0 && mine.length === 0 && (q.bid === null || q.ask === null)) continue;
      const left = c.expiry - view.now;
      const t = without(q, mine);
      const spot = c.spot;
      const years = left / MS_PER_YEAR;
      // The book's volatility: from the view's own mid, or where this block's quotes are the touch, from the mid
      // without them.
      let iv: number | null = null;
      if (t.bid !== null && t.ask !== null) {
        const mid = (t.bid + t.ask) / 2;
        iv = q.bid !== null && q.ask !== null && (q.bid + q.ask) / 2 === mid ? c.iv : options.impliedAt(symbol, mid);
      }
      if (position !== 0) {
        holdsOptions = true;
        // A book too thin to imply a volatility is valued at the volatility of the same expiry's nearest option.
        // The delta of what is held is worked at the view's own volatility for it, not the one with this block's quotes
        // taken out: that one flips with whether a quote of ours is the touch. An option whose books, and its whole
        // expiry's, are one-sided for a look has none of its own, and is worked at the nearest of its expiry's, then at
        // the chain's: dropped for a look, a near-the-money position an hour from its expiry took twenty-odd contracts of
        // delta out of the hedge and put them back at the next, a trade of the difference each way every second or two.
        const ivHeld = c.iv ?? iv ?? nearestIv(options.chain, c.expiry) ?? chainIv(options.chain);
        // ... and at the price of the future that hedges it, not the index book's mid: that book lags the future by
        // seconds and drops out when one-sided, and the hedge flipped by the lag's worth of delta each time it did.
        const hedgeSpot =
          (hedgeSpots.has(c.underlying)
            ? hedgeSpots
            : hedgeSpots.set(c.underlying, futureSpot(view, c.underlying))
          ).get(c.underlying) ?? spot;
        if (hedgeSpot === null || ivHeld === null) blind = true;
        else {
          futureMultiplier = futuresOn(view, c.underlying)[0]?.[1].multiplier ?? futureMultiplier;
          net +=
            (position * optionDelta(c.right, hedgeSpot, c.strike, years, ivHeld, options.rate) * c.multiplier) /
            futureMultiplier;
        }
      }
      if (left <= flatten) {
        // The last minutes: pull the quotes and get out at the touch.
        if (position !== 0) flattening = true;
        for (const o of mine) if (o.status === 'resting') out.push({ kind: 'cancel', localId: o.localId });
        if (position !== 0 && !inFlight(view, symbol, id)) {
          const f = flattenTo(view, symbol, position, 0);
          if (f) out.push(f);
        }
        continue;
      }
      if (t.bid === null || t.ask === null || iv === null || spot === null) continue;
      const bidFair = optionPrice(c.right, spot, c.strike, years, Math.max(1e-4, iv - edge), options.rate);
      const askFair = optionPrice(c.right, spot, c.strike, years, iv + edge, options.rate);
      // Always inside the book it sees, and the ask over the bid.
      const wantBid = Math.min(Math.floor(bidFair), t.ask - 1);
      const wantAsk = Math.max(Math.ceil(askFair), t.bid + 1, wantBid + 1);
      const wants = [
        { side: 'buy' as const, price: position < max && wantBid > 0 ? wantBid : null },
        { side: 'sell' as const, price: position > -max ? wantAsk : null },
      ];
      for (const { side, price } of wants) {
        const have = mine.filter((o) => o.side === side);
        const keep = have.find(
          (o) => price !== null && Math.abs(o.price - price) <= tolerance && o.status !== 'cancelling',
        );
        for (const o of have)
          if (o !== keep && o.status === 'resting') out.push({ kind: 'cancel', localId: o.localId });
        const busy = have.some((o) => o.status === 'inflight' || o.status === 'cancelling');
        if (price !== null && !keep && !busy)
          out.push({ kind: 'order', symbol, exchange, side, price, size, ioc: false, postOnly: true });
      }
    }
    if ((p.hedge ?? 1) >= 1 && !flattening && !blind) {
      const underlying = Object.values(options.chain)[0]?.underlying;
      if (underlying !== undefined)
        out.push(...hedgeOrders(view, id, underlying, net, holdsOptions, p.hedgeBand ?? 20));
    }
    return out;
  },
};

/** The chain's middle volatility, over every option with a two-sided book: the last stand-in for an expiry with none. */
function chainIv(chain: NonNullable<MarketView['options']>['chain']): number | null {
  const all: number[] = [];
  for (const c of Object.values(chain)) if (c.iv !== null) all.push(c.iv);
  if (all.length === 0) return null;
  all.sort((a, b) => a - b);
  return all[Math.floor(all.length / 2)]!;
}

/** The implied volatility of the option of the same expiry that has one, nearest the money: a stand-in for a thin book's. */
function nearestIv(chain: NonNullable<MarketView['options']>['chain'], expiry: number): number | null {
  let best: number | null = null;
  let distance = Infinity;
  for (const c of Object.values(chain)) {
    if (c.expiry !== expiry || c.iv === null || c.spot === null) continue;
    const d = Math.abs(c.strike - c.spot);
    if (d < distance) {
      distance = d;
      best = c.iv;
    }
  }
  return best;
}

/**
 * The orders that bring the net delta (the options' `net`, in contracts of the future, and what the block holds of the
 * future) back to nothing when it is more than `band` out; with no option held, any future the block holds is closed.
 */
function hedgeOrders(
  view: MarketView,
  id: string,
  underlying: string,
  net: number,
  holdsOptions: boolean,
  band: number,
): Intent[] {
  const out: Intent[] = [];
  const futures = futuresOn(view, underlying);
  const held = futures.map(([s]) => [s, ownPosition(view, id, s)] as const).filter(([, q]) => q !== 0);
  if (!holdsOptions) {
    for (const [symbol, q] of held) {
      if (inFlight(view, symbol, id)) continue;
      const f = flattenTo(view, symbol, q, 0);
      if (f) out.push(f);
    }
    return out;
  }
  const hedge = held.reduce((n, [, q]) => n + q, 0);
  const total = net + hedge;
  // The future it trades is one with more than a few minutes to run: a hedge in a contract about to expire is gone with it.
  const near = futures.find(([, c]) => c.expiry - view.now > HEDGE_GUARD) ?? futures[0];
  if (!near || Math.abs(total) <= band) return out;
  const [symbol] = near;
  if (inFlight(view, symbol, id)) return out;
  const position = ownPosition(view, id, symbol);
  const f = flattenTo(view, symbol, position, position - Math.round(total));
  if (f) out.push(f);
  return out;
}
