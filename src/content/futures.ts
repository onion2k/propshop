// The futures desk: the Prairie Board, a venue in a fictional inland city, and a future on the index listed there.
// The future's price is the index carried to its expiry (3.5% a year, interest less dividends: a contract a week out
// is about 3.5 cents over the index), so it draws nothing of its own; its crowd catches up with a move in 50 ms, far
// quicker than the stock exchanges' (250 to 600 ms, their index books four times slower), so the future moves first
// and the stocks follow. That lead is the desk's lesson. See plans/desk-futures.md.
import { MS_PER_HOUR, MS_PER_WEEK, daily, type ContractSeriesSpec, type ExchangeSpec } from '../sim';

import type { LocationSpec } from '../sim';

export const FUTURES_DESK = 'futures';

/** A rack at the Prairie Board: the future first, and the stock exchanges as far as the plains are wide. */
export const COLO_PRAIRIE: LocationSpec = {
  id: 'colo-prairie',
  name: 'Rack at the Prairie Board',
  price: 80 * 100_000,
  rent: 1600 * 100,
  desk: FUTURES_DESK,
  distance: { HARBOR: 18, LAKESIDE: 9, PACIFIC: 14, PRAIRIE: 0.1 },
  explain:
    'A rack beside the futures crowd: the future reaches your decision almost as it prints, so you know where ' +
    'the index is going before the stock exchanges do. Your orders for the stocks still cross the plains, so ' +
    'what you buy next is the fastest line to them.',
};

/** 18:00 to 17:00, Sunday evening to Friday, an hour's break each day: nearly round the clock. */
export const PRAIRIE: ExchangeSpec = {
  id: 'PRAIRIE',
  name: 'Prairie Board',
  city: 'Prairie',
  feePerShare: 0.5,
  lag: 50,
  noise: 0.5,
  desk: FUTURES_DESK,
  session: daily(18 * MS_PER_HOUR, 17 * MS_PER_HOUR, [6, 0, 1, 2, 3]),
};

/** One-way ms of fibre to the Prairie Board from each location: inland, nearest Lakeside. */
export const PRAIRIE_DISTANCE: Record<string, number> = {
  home: 15,
  city: 18,
  'colo-harbor': 18,
  'colo-lakeside': 9,
  'colo-pacific': 14,
  'colo-harbor-lakeside': 9,
  'colo-all': 9,
};

/**
 * The index future: a hundred times the index, about $5,300 a contract, on 8% initial and 6% maintenance margin.
 * Weekly, expiring Friday at 16:00 with the stocks' close, the near and the next listed, settled in cash.
 */
export const IXF: ContractSeriesSpec = {
  root: 'IXF',
  contract: {
    name: 'Index future',
    sector: 'index future',
    desk: FUTURES_DESK,
    kind: 'future',
    underlying: 'IDX',
    carry: 0.035,
    multiplier: 100,
    margin: { initial: 0.08, maintenance: 0.06 },
    settlement: 'cash',
    startPrice: 0,
    hourlyVol: 0,
    jumpsPerSecond: 0,
    jumpSize: 0,
  },
  period: MS_PER_WEEK,
  expiresAt: 4 * 24 * MS_PER_HOUR + 16 * MS_PER_HOUR,
  live: 2,
};
