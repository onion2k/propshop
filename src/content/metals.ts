// The metals desk: gold and silver, spot on two venues round the world and weekly futures on the New York-like one,
// delivered into the spot at expiry. Gold reads the miners' factor of the stocks (it draws nothing from their stream);
// each metal's lease rate wanders on the desk's own stream and jumps on supply news, and a future's carry is the
// dollar's rate and storage less the lease, so the curve moves and can flip. Closed until the desk opens. Names and
// numbers are drafts; see plans/desk-metals.md.
import { MS_PER_HOUR, MS_PER_SECOND, MS_PER_WEEK, daily, type ContractSeriesSpec, type ExchangeSpec } from '../sim';
import type { DeskNewsSpec, FixFlow, InstrumentSpec, LocationSpec, StorageSpec } from '../sim/types';

export const METALS_DESK = 'metals';

/** The dollar's rate (the currencies' figure) and storage, a year: a contract's carry before the lease comes off. */
const DOLLAR_RATE = 0.045;
export const STORAGE_RATE = 0.005;

/** Storage on metal held long and the lease on metal held short, at 17:00 each weekday, Friday's for three nights. */
export const STORAGE: StorageSpec = { at: 17 * MS_PER_HOUR, rate: STORAGE_RATE, basis: 365 };

/** Port Sundar, an Asian-like city: Sunday to Thursday nights, 19:00 to 03:00, slow to catch on. */
export const SUNDAR: ExchangeSpec = {
  id: 'SUNDAR',
  name: 'Sundar Gold Exchange',
  city: 'Port Sundar',
  feePerShare: 1,
  lag: 300,
  noise: 0.5,
  desk: METALS_DESK,
  session: daily(19 * MS_PER_HOUR, 3 * MS_PER_HOUR, [6, 0, 1, 2, 3]),
};

/**
 * How long a fix's call runs before it uncrosses: 30 s of game time, a real bullion auction's round. Long enough for a
 * firm a few hundred ms away to see the indicative move and answer it many times over; short beside the 4.5 hours
 * between the fixes, so continuous trading is barely held. A draft for Chris.
 */
export const CALL_MS = 30 * MS_PER_SECOND;

/**
 * The clients' orders aimed at each fix (6f): a real fix gathers orders from clients who want the fix's price, often
 * more on one side than the other, and late. Without them the crowd keeps the indicative within a point or two of fair
 * and the fix has no edge. Seven calls in ten see one, for each metal, buying or selling at even odds: 10 to 200 lots,
 * small more often than large, priced six grid steps through the belief. It lands in the last 150 ms of the call, so a
 * firm on a home line (72 ms each way to Thamesford) cannot answer it; the rack there can, and the one at Hudson (29
 * ms) sometimes. Silver's coarse grid (a cent is 3.3 bp) lets a large one move its fix 10 to 20 bp; gold's (ten cents,
 * 0.4 bp) about 2 bp at most. Drafts, tuned in 6f with `fixArb` at 4 bp (docs/measured.md).
 */
export const FIX_FLOW: FixFlow = { chance: 0.7, lots: [10, 200], withinMs: 150, reach: 6 };

/** The crowd trades lots of a metal, one to five at a time, as its firms do: a stock's hundreds would be millions. */
export const METAL_CROWD_LOT = 1;

/** Thamesford, a London-like city: 03:00 to 12:00 on weekdays, quick, with the fixes at 05:30 and 10:00. */
export const THAMESFORD: ExchangeSpec = {
  id: 'THAMESFORD',
  name: 'Thamesford Bullion Market',
  city: 'Thamesford',
  feePerShare: 1.5,
  lag: 60,
  noise: 0.5,
  desk: METALS_DESK,
  session: daily(3 * MS_PER_HOUR, 12 * MS_PER_HOUR, [0, 1, 2, 3, 4]),
  auctions: [
    { at: 5.5 * MS_PER_HOUR, callMs: CALL_MS, flow: FIX_FLOW },
    { at: 10 * MS_PER_HOUR, callMs: CALL_MS, flow: FIX_FLOW },
  ],
};

/**
 * Hudson, a New York-like city: 18:00 to 17:00, Sunday evening to Friday, as the Prairie Board, quickest. It lists the
 * futures alone, which it settles at its close; the spot trades in Port Sundar by night and Thamesford by day (Chris,
 * after 6b), and the futures cover the rest.
 */
export const HUDSON: ExchangeSpec = {
  id: 'HUDSON',
  name: 'Hudson Metals Exchange',
  city: 'Hudson',
  feePerShare: 1,
  lag: 50,
  noise: 0.5,
  desk: METALS_DESK,
  session: daily(18 * MS_PER_HOUR, 17 * MS_PER_HOUR, [6, 0, 1, 2, 3]),
};

export const METAL_VENUES: ExchangeSpec[] = [SUNDAR, THAMESFORD, HUDSON];

/**
 * Spot gold and silver, on Sundar and Thamesford. Both take the desk's own factor (silver at twice gold's beta, so twice its daily percentage)
 * and read the miners' factor of the stocks. A point of gold is ten cents an ounce and a lot ten ounces, about $24,000;
 * a point of silver is a cent and a lot 500 ounces, about $15,000. The gold-silver ratio starts at 80.
 */
const METAL = {
  sector: 'precious',
  desk: METALS_DESK,
  kind: 'metal',
  venues: [SUNDAR.id, THAMESFORD.id] as string[],
  crowdLot: METAL_CROWD_LOT,
  jumpsPerSecond: 0,
  jumpSize: 0,
} as const;

export const SPOT: InstrumentSpec[] = [
  {
    ...METAL,
    symbol: 'XAU',
    name: 'Gold',
    beta: 1,
    priceUnit: 10,
    multiplier: 10,
    startPrice: 24000,
    hourlyVol: 10,
    reads: { sector: 'mining', loading: 0.6 },
    lease: { rate: 0.003, hourlyVol: 0.0005, reversionPerHour: 0.05 },
  },
  {
    ...METAL,
    symbol: 'XAG',
    name: 'Silver',
    beta: 2,
    priceUnit: 1,
    multiplier: 500,
    startPrice: 3000,
    hourlyVol: 3,
    reads: { sector: 'mining', loading: 1.2 },
    lease: { rate: 0.008, hourlyVol: 0.001, reversionPerHour: 0.05 },
  },
];

/** A weekly future on a metal, one lot of the spot, on Hudson alone, expiring Friday 13:30 and delivered. */
function future(root: string, metal: InstrumentSpec): ContractSeriesSpec {
  return {
    root,
    contract: {
      name: `${metal.name} future`,
      sector: `${metal.name.toLowerCase()} future`,
      desk: METALS_DESK,
      kind: 'future',
      underlying: metal.symbol,
      carry: DOLLAR_RATE + STORAGE_RATE,
      leaseOf: metal.symbol,
      multiplier: metal.multiplier ?? 1,
      priceUnit: metal.priceUnit ?? 1,
      venues: [HUDSON.id],
      crowdLot: METAL_CROWD_LOT,
      margin: { initial: 0.08, maintenance: 0.06 },
      settlement: 'delivery',
      startPrice: 0,
      hourlyVol: 0,
      jumpsPerSecond: 0,
      jumpSize: 0,
    },
    period: MS_PER_WEEK,
    expiresAt: 4 * 24 * MS_PER_HOUR + 13.5 * MS_PER_HOUR,
    live: 3,
  };
}

export const GC = future('GC', SPOT[0]!);
export const SI = future('SI', SPOT[1]!);
export const METAL_SERIES: ContractSeriesSpec[] = [GC, SI];

/** Supply news: what moves a metal and its lease. A squeeze lifts the lease past the carry and flips the curve. */
export const SUPPLY_NEWS: DeskNewsSpec = {
  desk: METALS_DESK,
  perDay: 3,
  templates: [
    {
      text: 'Strike shuts a {metal} mine for {n} weeks',
      symbols: ['XAU', 'XAG'],
      direction: 1,
      magnitudeBps: 80,
      lease: 0.03,
      priceInMs: 60 * MS_PER_SECOND,
    },
    {
      text: 'New {metal} deposit found: {n} million ounces',
      symbols: ['XAU', 'XAG'],
      direction: -1,
      magnitudeBps: 60,
      lease: -0.01,
      priceInMs: 90 * MS_PER_SECOND,
    },
    {
      text: 'Central banks bought {n} hundred tonnes of {metal} last quarter',
      symbols: ['XAU'],
      direction: 1,
      magnitudeBps: 50,
      lease: 0.02,
      priceInMs: 120 * MS_PER_SECOND,
    },
    {
      text: 'Fire at a {metal} refinery: deliveries held for {n} days',
      symbols: ['XAU', 'XAG'],
      direction: 1,
      magnitudeBps: 40,
      lease: 0.06,
      priceInMs: 45 * MS_PER_SECOND,
    },
  ],
};

/** One-way ms of fibre from each location to the three metals venues. */
export const METALS_DISTANCE: Record<string, Record<string, number>> = {
  home: { SUNDAR: 52, THAMESFORD: 60, HUDSON: 33 },
  city: { SUNDAR: 78, THAMESFORD: 29, HUDSON: 2 },
  'colo-harbor': { SUNDAR: 77, THAMESFORD: 28, HUDSON: 1 },
  'colo-lakeside': { SUNDAR: 70, THAMESFORD: 35, HUDSON: 8 },
  'colo-pacific': { SUNDAR: 50, THAMESFORD: 57, HUDSON: 31 },
  'colo-harbor-lakeside': { SUNDAR: 70, THAMESFORD: 28, HUDSON: 1 },
  'colo-all': { SUNDAR: 50, THAMESFORD: 28, HUDSON: 1 },
  'colo-prairie': { SUNDAR: 64, THAMESFORD: 45, HUDSON: 18 },
  'colo-eastholm': { SUNDAR: 80, THAMESFORD: 25, HUDSON: 5 },
};

/** A rack at Thamesford: the spot's quick crowd, and the fixes (6c), first; New York across the ocean. */
export const COLO_THAMESFORD: LocationSpec = {
  id: 'colo-thamesford',
  name: 'Rack at Thamesford',
  price: 80 * 100_000,
  desk: METALS_DESK,
  distance: {
    HARBOR: 28,
    LAKESIDE: 35,
    PACIFIC: 57,
    PRAIRIE: 45,
    EASTHOLM: 25,
    ASHFORD: 25,
    SUNDAR: 45,
    THAMESFORD: 0.1,
    HUDSON: 28,
  },
  explain:
    'A rack in the building that holds the bullion market: its quotes reach your decision as they change, and its ' +
    'fixes will be yours to rest into. New York and the futures are an ocean away.',
};

/** A rack at Hudson: the futures and the spot beside them, and the stocks a few ms down the road. */
export const COLO_HUDSON: LocationSpec = {
  id: 'colo-hudson',
  name: 'Rack at Hudson',
  price: 80 * 100_000,
  desk: METALS_DESK,
  distance: {
    HARBOR: 1,
    LAKESIDE: 8,
    PACIFIC: 31,
    PRAIRIE: 18,
    EASTHOLM: 5,
    ASHFORD: 5,
    SUNDAR: 77,
    THAMESFORD: 28,
    HUDSON: 0.1,
  },
  explain:
    'A rack beside the metals futures: the curve reaches your decision as it prints, and Harbor City is a ' +
    'millisecond away. The spot in Thamesford and Port Sundar is far.',
};
