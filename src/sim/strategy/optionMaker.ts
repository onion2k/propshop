// Option making: rest a bid and an ask on each option, priced from the volatility the book itself implies, a little
// either side. The maker earns the edge each time a customer takes a quote; what it holds then moves with the index
// (delta), and is hedged in the index future. Every option is flattened in the last minutes before it expires.

import { delta as optionDelta, price as optionPrice } from '../options';
import { MS_PER_MINUTE, MS_PER_YEAR } from '../clock';
import { futuresOn, venueOf } from './optionsView';
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
        default: 0.5,
        unit: 'vol points',
        explain:
          'How far either side of the implied volatility the quotes sit, in points of volatility (a point is a ' +
          'hundredth). At zero it quotes the book’s own price; further out it earns more a fill and fills less.',
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
        default: 1,
        unit: '¢',
        explain: 'A resting quote is left alone until the price it would be put at is this far from it.',
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
        max: 20,
        step: 1,
        default: 2,
        unit: 'contracts',
        explain:
          'The net delta, in contracts of the future, is left alone while it is inside this and brought back to ' +
          'nothing when it is outside. Tighter hedges more often and pays the future’s spread each time.',
      },
      {
        key: 'flattenBefore',
        name: 'Flatten before expiry',
        min: 1,
        max: 30,
        step: 1,
        default: 5,
        unit: 'min',
        explain: 'How long before an option expires its quotes are pulled and its position closed.',
      },
    ],
  },

  decide(view: MarketView, p: Params): Intent[] {
    const options = view.options;
    if (!options) return [];
    const id = this.spec.id;
    const edge = (p.edge ?? 0.5) / 100;
    const size = p.size ?? 5;
    const max = p.maxPosition ?? 20;
    const tolerance = p.requote ?? 1;
    const flatten = (p.flattenBefore ?? 5) * MS_PER_MINUTE;
    const out: Intent[] = [];
    // The delta of what is held, in contracts of the future: an option and the future each stand for their multiplier.
    let net = 0;
    let holdsOptions = false;
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
        const ivHeld = iv ?? c.iv ?? nearestIv(options.chain, c.expiry);
        if (spot !== null && ivHeld !== null) {
          futureMultiplier = futuresOn(view, c.underlying)[0]?.[1].multiplier ?? futureMultiplier;
          net +=
            (position * optionDelta(c.right, spot, c.strike, years, ivHeld, options.rate) * c.multiplier) /
            futureMultiplier;
        }
      }
      if (left <= flatten) {
        // The last minutes: pull the quotes and get out at the touch.
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
    if ((p.hedge ?? 1) >= 1) {
      const underlying = Object.values(options.chain)[0]?.underlying;
      if (underlying !== undefined) out.push(...hedgeOrders(view, id, underlying, net, holdsOptions, p.hedgeBand ?? 2));
    }
    return out;
  },
};

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
