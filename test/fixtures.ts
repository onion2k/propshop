// Small content for the sim tests: enough to trade on, small enough to reason about by hand.
import type { ExchangeSpec, StockSpec } from '../src/sim/types';

export const STOCKS: StockSpec[] = [
  {
    symbol: 'ABC',
    name: 'Abacus Computing',
    sector: 'tech',
    startPrice: 4100,
    hourlyVol: 12,
    jumpsPerSecond: 0.3,
    jumpSize: 2.5,
  },
  {
    symbol: 'XYZ',
    name: 'Xylem Water',
    sector: 'utilities',
    startPrice: 2500,
    hourlyVol: 5,
    jumpsPerSecond: 0.2,
    jumpSize: 1.5,
  },
];

export const EXCHANGES: ExchangeSpec[] = [
  { id: 'HARBOR', name: 'Harbor Exchange', city: 'Harbor City', feePerShare: 0.3, lag: 400, noise: 0.8 },
  { id: 'LAKESIDE', name: 'Lakeside Exchange', city: 'Lakeside', feePerShare: 0.25, lag: 600, noise: 0.8 },
];

export const TICK = 2;

import type { Infrastructure } from '../src/sim/types';

/** A slow firm far from both exchanges, and a fast one sitting next to HARBOR. */
export const SLOW: Infrastructure = {
  location: {
    id: 'home',
    name: 'Home office',
    price: 0,
    distance: { HARBOR: 30, LAKESIDE: 40 },
    explain: 'Far from everything.',
  },
  network: { id: 'consumer', name: 'Consumer broadband', price: 0, factor: 1, overhead: 10, explain: 'Slow.' },
  computer: {
    id: 'laptop',
    name: 'Laptop',
    price: 0,
    maxBlocks: 1,
    ordersPerSecond: 20,
    decisionEveryMs: 50,
    maxSymbols: 4,
    explain: 'One block at a time.',
  },
};

export const FAST: Infrastructure = {
  location: {
    id: 'colo-harbor',
    name: 'Colocation at HARBOR',
    price: 0,
    distance: { HARBOR: 0.2, LAKESIDE: 8 },
    explain: 'In the building.',
  },
  network: { id: 'fibre', name: 'Leased fibre', price: 0, factor: 1, overhead: 0.5, explain: 'Fast.' },
  computer: {
    id: 'rack',
    name: 'Rack',
    price: 0,
    maxBlocks: 4,
    ordersPerSecond: 200,
    decisionEveryMs: 10,
    maxSymbols: 20,
    explain: 'Plenty.',
  },
};

import type { NewsTemplate } from '../src/sim/types';

export const TEMPLATES: NewsTemplate[] = [
  {
    scope: 'company',
    text: '{company} beats on earnings, raises outlook',
    direction: 1,
    magnitudeBps: 150,
    priceInMs: 20_000,
  },
  { scope: 'company', text: '{company} recalls product line', direction: -1, magnitudeBps: 120, priceInMs: 15_000 },
  {
    scope: 'sector',
    text: 'Regulator opens inquiry into {sector}',
    direction: -1,
    magnitudeBps: 60,
    priceInMs: 30_000,
  },
  { scope: 'market', text: 'Central bank holds rates, as expected', direction: 0, magnitudeBps: 0, priceInMs: 10_000 },
  { scope: 'company', text: '{company} CEO seen at airport', direction: 1, magnitudeBps: 0, priceInMs: 10_000 },
];

// ---------------------------------------------------------------------------------------------------------------
// The options desk, by hand (plans/desk-options.md, 7d): a view of the index, its future and a small chain of daily
// options, every book priced from the model at one volatility, so a block's behaviour can be worked out on paper.

import { MS_PER_DAY, MS_PER_HOUR, MS_PER_YEAR } from '../src/sim';
import { impliedFrom, price as optionPrice } from '../src/sim/options';
import type { MarketView, OptionView, SeenQuote } from '../src/sim/strategy';

export const OPT_RATE = 0.035;
export const OPT_SPOT = 5300.5;
export const OPT_STEP = 100;
/** The future's carry a year, and the weekly expiry it is on (Friday 16:00). */
export const FUT_CARRY = 0.035;
export const FUT_EXPIRY = 4 * MS_PER_DAY + 16 * MS_PER_HOUR;
/** Today's options expire at 16:00, tomorrow's a day later. */
export const OPT_EXPIRY = [16 * MS_PER_HOUR, MS_PER_DAY + 16 * MS_PER_HOUR] as const;

export function seenQuote(bid: number | null, ask: number | null, size = 1000): SeenQuote {
  return {
    bid,
    ask,
    bidSize: size,
    askSize: size,
    bid2: bid === null ? null : bid - 1,
    ask2: ask === null ? null : ask + 1,
    bid2Size: size,
    ask2Size: size,
    at: 0,
  };
}

/** The series of the hand-made chain: root, right and strike offset in steps from the money. */
export const OPT_SERIES = [
  ['OCm', 'call', -1],
  ['OC0', 'call', 0],
  ['OCp', 'call', 1],
  ['OPm', 'put', -1],
  ['OP0', 'put', 0],
  ['OPp', 'put', 1],
] as const;

export interface OptionWorldOptions {
  now?: number;
  /** The index's mid; its book is a cent either side. */
  spot?: number;
  /** The volatility every book is priced at (a share a year). */
  vol?: number;
  /** Cents either side of the model price the books quote. */
  half?: number;
  /** Cents added to both sides of an option's book, by symbol: a rich or cheap one. */
  shift?: Record<string, number>;
  /** Symbols whose book has no bid (or no ask at all): `[symbol, 'bid' | 'ask' | 'both']`. */
  empty?: Record<string, 'bid' | 'ask' | 'both'>;
  /** The chain's middle strike, where not the index's nearest step. */
  centre?: number;
  /** The future's quote as bid and ask, where not the fair price. */
  future?: [number, number];
  releases?: number[];
  positions?: Record<string, number>;
  /** What the block 'optionMaker' (or the key given) holds. */
  held?: Record<string, Record<string, number>>;
  openOrders?: MarketView['openOrders'];
}

/** The symbol of a series on day `day`: `OC0` on day 1 is `OC01`. */
export const optSymbol = (root: string, day: number) => `${root}${day}`;

/**
 * A view with the index on HARBOR, its future on PRAIRIE and the options on POX, as a firm on the Prairie rack sees
 * them: `options` is built the way the sim builds it (an implied volatility inverted from each book's mid), so a
 * block's work is the block's alone.
 */
export function optionWorld(o: OptionWorldOptions = {}): MarketView {
  const now = o.now ?? 10 * MS_PER_HOUR;
  const spot = o.spot ?? OPT_SPOT;
  const vol = o.vol ?? 0.2;
  const half = o.half ?? 1;
  const centre = o.centre ?? Math.round(spot / OPT_STEP) * OPT_STEP;
  const k = 1 + (FUT_CARRY * (FUT_EXPIRY - now)) / MS_PER_YEAR;
  const quotes: Record<string, Record<string, SeenQuote>> = {
    HARBOR: { IDX: seenQuote(Math.floor(spot), Math.floor(spot) + 1) },
    PRAIRIE: {
      IXF1: o.future ? seenQuote(o.future[0], o.future[1]) : seenQuote(Math.round(spot * k) - 1, Math.round(spot * k)),
    },
    POX: {},
  };
  const chain: Record<string, OptionView> = {};
  const symbols = ['IDX', 'IXF1'];
  for (let day = 0; day < 2; day++) {
    for (const [root, right, offset] of OPT_SERIES) {
      const symbol = optSymbol(root, day);
      const strike = centre + offset * OPT_STEP;
      const expiry = OPT_EXPIRY[day]!;
      const t = (expiry - now) / MS_PER_YEAR;
      const mid = optionPrice(right, spot, strike, t, vol, OPT_RATE) + (o.shift?.[symbol] ?? 0);
      const bid = Math.floor(mid - half);
      const ask = Math.max(Math.ceil(mid + half), bid + 1);
      const empty = o.empty?.[symbol];
      quotes.POX![symbol] = seenQuote(
        bid > 0 && empty !== 'bid' && empty !== 'both' ? bid : null,
        empty === 'ask' || empty === 'both' ? null : ask,
      );
      const two = quotes.POX![symbol].bid !== null && quotes.POX![symbol].ask !== null;
      chain[symbol] = {
        right: right,
        strike,
        expiry,
        underlying: 'IDX',
        multiplier: 100,
        spot,
        iv: two ? impliedFrom(right, (bid + ask) / 2, spot, strike, t, OPT_RATE) : null,
      };
      symbols.push(symbol);
    }
  }
  return {
    now,
    symbols,
    sectors: {},
    constituents: {},
    exchanges: ['HARBOR', 'PRAIRIE', 'POX'],
    quotes,
    tape: {},
    depth: {},
    fees: { HARBOR: 0.3, PRAIRIE: 0.5, POX: 5 },
    latency: { HARBOR: 1, PRAIRIE: 0.2, POX: 0.2 },
    mids: {},
    positions: o.positions ?? {},
    blockPositions: o.held ?? {},
    cash: 200_000_000,
    openOrders: o.openOrders ?? [],
    recentFills: [],
    news: [],
    contracts: { IXF1: { underlying: 'IDX', expiry: FUT_EXPIRY, carry: FUT_CARRY, multiplier: 100 } },
    options: {
      rate: OPT_RATE,
      releases: o.releases ?? [],
      chain,
      impliedAt: (symbol, p) => {
        const c = chain[symbol]!;
        return impliedFrom(c.right, p, spot, c.strike, (c.expiry - now) / MS_PER_YEAR, OPT_RATE);
      },
    },
  };
}
