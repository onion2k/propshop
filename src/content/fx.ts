// The currencies desk: the dollar, the euro and the yen (the rates are the game's own), two pairs that draw on the
// desk's stream and their cross, worked out from them, on two venues in Eastholm, a fictional financial centre east
// of the stocks: a book like the stock exchanges, and a dealer who looks at a fill before it takes it. Open from
// Sunday 17:00 to Friday 17:00 without a break. Closed until the desk opens. Names and numbers are drafts; see
// plans/desk-fx.md.
import { MS_PER_HOUR, span, type ExchangeSpec, type InstrumentSpec } from '../sim';
import type { CurrencySpec, LocationSpec, RolloverSpec } from '../sim/types';

export const FX_DESK = 'fx';

/** The dollar is home: cash. The euro and the yen are balances, priced in dollars by their pairs. */
export const CURRENCIES: CurrencySpec[] = [
  { id: 'USD', name: 'Dollar', minor: 100, rate: 0.045 },
  { id: 'EUR', name: 'Euro', minor: 100, pair: 'EURUSD', rate: 0.03 },
  { id: 'JPY', name: 'Yen', minor: 1, pair: 'USDJPY', rate: 0.005 },
];

/** At 17:00, on a 360-day year, less half a percent a year the venue keeps whichever way a position faces. */
export const ROLLOVER: RolloverSpec = { at: 17 * MS_PER_HOUR, spread: 0.005, basis: 360 };

/**
 * A lot is a thousand of the base; a price point is a pip, 0.0001 dollars or 0.01 yen, so a point of a lot is ten
 * cents or ten yen (`priceUnit` 0.01 a unit). About 0.5% a day: most of it the dollar's own wander, which the two
 * pairs take with opposite signs (EUR/USD falls when USD/JPY rises), and a little of each pair's own. Now and then,
 * about once in a hundred seconds a pair, a burst of orders shoves one pair a few pips at once (`jumpsPerSecond`,
 * `jumpSize` in pips, drawn from `world:fx`): the cross's crowd is slower, and that moment is the triangle's. A
 * smooth wander alone never left the cross out of line by more than the three spreads (5d, docs/measured.md).
 */
const PAIR = {
  sector: 'dollar',
  desk: FX_DESK,
  kind: 'fx',
  multiplier: 1000,
  priceUnit: 0.01,
} as const;

export const PAIRS: InstrumentSpec[] = [
  {
    ...PAIR,
    symbol: 'EURUSD',
    name: 'Euro in dollars',
    base: 'EUR',
    currency: 'USD',
    beta: -0.3,
    startPrice: 10850,
    hourlyVol: 3,
    jumpsPerSecond: 0.01,
    jumpSize: 2.5,
  },
  {
    ...PAIR,
    symbol: 'USDJPY',
    name: 'Dollar in yen',
    base: 'USD',
    currency: 'JPY',
    beta: 0.3,
    startPrice: 15000,
    hourlyVol: 4,
    jumpsPerSecond: 0.01,
    jumpSize: 3.5,
  },
  // The cross: the euro in yen is the euro in dollars times the dollar in yen, and draws nothing of its own.
  {
    ...PAIR,
    symbol: 'EURJPY',
    name: 'Euro in yen',
    sector: 'cross',
    base: 'EUR',
    currency: 'JPY',
    cross: ['EURUSD', 'USDJPY'],
    startPrice: 16275,
    hourlyVol: 0,
    jumpsPerSecond: 0,
    jumpSize: 0,
  },
];

/** Sunday 17:00 to Friday 17:00: a market that does not close in the week. */
const ALL_WEEK = span(6, 17 * MS_PER_HOUR, 4, 17 * MS_PER_HOUR);

/** The book: a crowd like the stock exchanges', quicker, a quarter of a cent a lot to take. */
export const EASTHOLM: ExchangeSpec = {
  id: 'EASTHOLM',
  name: 'Eastholm Currency Exchange',
  city: 'Eastholm',
  feePerShare: 0.25,
  lag: 80,
  noise: 0.5,
  desk: FX_DESK,
  session: ALL_WEEK,
};

/** The dealer: nothing to take but its price, which is its fee; it looks for 5 ms and refuses half a pip against it. */
export const ASHFORD: ExchangeSpec = {
  id: 'ASHFORD',
  name: 'Ashford Bank dealing desk',
  city: 'Eastholm',
  feePerShare: 0,
  lag: 40,
  noise: 0.5,
  desk: FX_DESK,
  session: ALL_WEEK,
  lastLook: { holdMs: 5, refuseTicks: 0.5 },
};

export const FX_VENUES: ExchangeSpec[] = [EASTHOLM, ASHFORD];

/**
 * A rack in Eastholm, beside both currency venues: the three pairs reach the decision almost as they print, and the
 * three legs of a triangle land together. The stocks are a few ms west, the Prairie Board and the far coast further.
 */
export const COLO_EASTHOLM: LocationSpec = {
  id: 'colo-eastholm',
  name: 'Rack in Eastholm',
  price: 80 * 100_000,
  desk: FX_DESK,
  distance: { HARBOR: 4, LAKESIDE: 10, PACIFIC: 33, PRAIRIE: 21, EASTHOLM: 0.1, ASHFORD: 0.1 },
  explain:
    'A rack in the building that holds the currency book, with a short cross-connect to the dealer. All three ' +
    'pairs reach your decision as they change, and all three legs of a triangle arrive at once, so the gap is ' +
    'yours before the slower firms see it.',
};

/** One-way ms of fibre to Eastholm from each location: east of the stocks, a few ms past Harbor City. */
export const FX_DISTANCE: Record<string, number> = {
  home: 35,
  city: 5,
  'colo-harbor': 4,
  'colo-lakeside': 10,
  'colo-pacific': 33,
  'colo-harbor-lakeside': 4,
  'colo-all': 4,
  'colo-prairie': 21,
};
