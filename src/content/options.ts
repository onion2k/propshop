// The options desk: the Prairie Options Exchange, in the Prairie Board's building, and daily calls and puts on the
// index, three strikes a side, two expiries live. An option's fair value is Black-Scholes on the index (the model is
// `src/sim/options.ts`), worked out each tick and drawing nothing for the price; only the volatility's small wander
// is drawn, from the desk's own stream. See plans/desk-options.md. Every number here is a draft.
import { MS_PER_HOUR, MS_PER_DAY, type ContractSeriesSpec, type ExchangeSpec, type OptionsSpec } from '../sim';

import type { LocationSpec } from '../sim';

export const OPTIONS_DESK = 'options';

/**
 * Stocks' hours (09:30 to 16:00, Monday to Friday: no `session`), in the Prairie Board's building. The same fee and
 * lag as the Board's, for now: the crowd that quotes it is the ordinary one until the model quoter (plans/desk-options.md 7c).
 */
export const POX: ExchangeSpec = {
  id: 'POX',
  name: 'Prairie Options Exchange',
  city: 'Prairie',
  feePerShare: 5,
  lag: 50,
  noise: 0.3,
  desk: OPTIONS_DESK,
};

/**
 * How the options are priced. The step is $1.00: the index's close-to-close move measured about $0.85 a day (rms of
 * 36 days over four seeds, 2026-11-10; $0.92 over 40 days in a second pass), so a strike a step away is about a day's
 * move out. The realised volatility is read from the index every second in the stocks' hours and quoted on a
 * trading year (252 sessions of 6.5 h), where it starts at the 23% the stocks' minute returns measured; the premium
 * over it is 15%. An expiry carries that volatility's variance over its trading time (the open hours in full, the shut
 * ones at 7%: overnight moves measured 37c rms against 83c for a session), of which 83% is diffusion, the rest
 * being the day's releases the realised figure already holds; each release still to come adds `eventVariance`, the
 * news' own 50 bp rms, so the crush is that going at the release. Drafts, tuned by PACE (7f).
 */
export const OPTIONS: OptionsSpec = {
  desk: OPTIONS_DESK,
  underlying: 'IDX',
  strikeStep: 100,
  rate: 0.035,
  premium: 0.15,
  skew: 0.1,
  eventVariance: 0.000025,
  diffusionShare: 0.83,
  closedWeight: 0.07,
  halfLifeMs: 30 * 60 * 1000,
  startVol: 0.23,
  floorVol: 0.1,
  wander: { hourlyVol: 0.01, reversionPerHour: 0.5 },
};

/**
 * One series of daily options: `right` at `offset` steps from the index at listing. A hundred times the index, about
 * $30 a contract at the money on the day, settled in cash at the stocks' 16:00 close, today's and the next weekday's
 * listed. A contract's symbol is its root and its day, like the future's: `OC0` on day 7 is `OC07`.
 */
function series(root: string, right: 'call' | 'put', offset: number): ContractSeriesSpec {
  return {
    root,
    contract: {
      name: `Index ${right}`,
      sector: 'index option',
      desk: OPTIONS_DESK,
      kind: 'option',
      right,
      underlying: 'IDX',
      multiplier: 100,
      settlement: 'cash',
      shortMargin: { share: 0.15, floor: 0.1 },
      startPrice: 0,
      hourlyVol: 0,
      jumpsPerSecond: 0,
      jumpSize: 0,
    },
    period: MS_PER_DAY,
    expiresAt: 16 * MS_PER_HOUR,
    live: 2,
    weekdays: true,
    strikeOffset: offset,
  };
}

/** Calls then puts, strikes one step below the money, at it and one above: `m` for minus, `p` for plus. */
export const OPTION_SERIES: ContractSeriesSpec[] = [
  series('OCm', 'call', -1),
  series('OC0', 'call', 0),
  series('OCp', 'call', 1),
  series('OPm', 'put', -1),
  series('OP0', 'put', 0),
  series('OPp', 'put', 1),
];

/** Every location is as far from the Options Exchange as from the Prairie Board, in the same building. */
export function withOptionsDistance(l: LocationSpec): LocationSpec {
  const board = l.distance.PRAIRIE;
  if (board === undefined) throw new Error(`${l.id} has no distance to the Prairie Board`);
  return { ...l, distance: { ...l.distance, [POX.id]: board } };
}
