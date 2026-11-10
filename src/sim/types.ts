// The shapes the content hands the sim at construction. The sim never imports content; it is given these.

import type { SessionSpec } from './session';

/** What an instrument is: a stock, an index, or one of the contracts the later desks trade. */
export type InstrumentKind = 'equity' | 'index' | 'future' | 'option' | 'fx' | 'metal';

/**
 * Anything that trades. A stock is the plain case, and every field beyond a stock's is optional with the stock's
 * value as its default, so a stock is written as it always was. Value is worked out in `instrument.ts` and nowhere
 * else.
 */
export interface InstrumentSpec {
  symbol: string;
  name: string;
  sector: string;
  /** What it is; absent, an index where it has constituents and a stock otherwise. */
  kind?: InstrumentKind;
  /** The desk that trades it; absent, the stocks desk. */
  desk?: string;
  /** How much of the market's move this stock takes: one is the market's own. */
  beta?: number;
  /** An index: its fair value is the average of these symbols', and it has no wander of its own. */
  constituents?: string[];
  /** Opening price, in price points. */
  startPrice: number;
  /** How far the fair value wanders in an hour, in price points, one standard deviation. */
  hourlyVol: number;
  /** Sudden moves a second, on average: bursts of buying or selling that fast exchanges see before slow ones. */
  jumpsPerSecond: number;
  /** How big a sudden move is, in price points, one standard deviation. */
  jumpSize: number;
  /** Units of the underlying in one contract: an index future may be fifty times the index. Absent, one. */
  multiplier?: number;
  /** Cents in one price point: one for a stock quoted in cents. Absent, one. */
  priceUnit?: number;
  /** The price grid, in price points; absent, the exchange's rule. */
  tickSize?: number;
  /**
   * The units in one of the crowd's orders, which come in one to five of them (a taker's in up to ten): absent, a
   * hundred, a stock's round lot. A metal's crowd trades lots, as its firms do.
   */
  crowdLot?: number;
  /** The venues that list it; absent, every venue of its desk. */
  venues?: string[];
  /** What a contract is on: what a delivered contract becomes. */
  underlying?: string;
  /** When a contract expires, simulated ms. */
  expiry?: number;
  /** Held against margin, not paid for: absent for anything bought outright, as a stock is. */
  margin?: MarginSpec;
  /**
   * Carry a year, a share (interest less what the underlying pays): with an underlying and an expiry, the
   * instrument's fair value is the underlying's carried to expiry, worked out each tick and drawing nothing.
   */
  carry?: number;
  /** At expiry, paid in cash, or delivered as its underlying. Absent, cash. */
  settlement?: 'cash' | 'delivery';
  /** The currency its price is counted in, the quote's for a pair; absent, the dollar. */
  currency?: string;
  /** A currency pair (`kind: 'fx'`): the currency one unit of it buys. */
  base?: string;
  /**
   * A cross rate: its fair value is the product of these two pairs' (the first's quote the second's base), scaled
   * to its own points, worked out each tick and drawing nothing.
   */
  cross?: readonly [string, string];
  /**
   * A factor of the stocks it reads, not draws: its fair value and anchor take the stocks' sector factor's level (a
   * gold's, the miners') at `loading`, as an index future reads its index. Opening its desk draws nothing from `world`.
   */
  reads?: { sector: string; loading: number };
  /**
   * A metal's lease rate, a year, a share: what borrowing it costs, wandering on its desk's stream around `rate`
   * (`hourlyVol` one standard deviation an hour, pulled back at `reversionPerHour`) and moved by supply news. A
   * contract on it takes the lease off its carry; a short held overnight pays it.
   */
  lease?: { rate: number; hourlyVol: number; reversionPerHour: number };
  /** A contract whose carry is its fixed `carry` less this metal's lease rate now: a carry that moves. */
  leaseOf?: string;
}

/** What holding a metal costs overnight: storage on a long, the lease on a short. */
export interface StorageSpec {
  /** Ms past midnight, each weekday; Friday's carries the weekend's two nights too. */
  at: number;
  /** A share of value a year, on metal held long. */
  rate: number;
  /** Days in the year it is counted on. */
  basis: number;
}

/** A desk's own news: what moves its instruments and their leases, on its own stream, in its venues' hours. */
export interface DeskNewsSpec {
  desk: string;
  /** Headlines a weekday, on average. */
  perDay: number;
  templates: DeskNewsTemplate[];
}

export interface DeskNewsTemplate {
  /** Text with {metal} and {n} to fill. */
  text: string;
  /** The symbols it may be about; one is picked. */
  symbols: string[];
  direction: -1 | 1;
  /** Typical size of the move in the fair value, basis points. */
  magnitudeBps: number;
  /** Typical change to the symbol's lease rate, a share a year, signed. */
  lease: number;
  /** How long the market takes to price the move in, ms. */
  priceInMs: number;
}

/** A currency the firm may hold a balance in. The dollar is the firm's own, its home currency, kept as cash. */
export interface CurrencySpec {
  id: string;
  name: string;
  /** Minor units in one: a hundred cents, a hundred euro cents, one yen (the yen has nothing smaller). */
  minor: number;
  /** The pair that prices it in dollars; absent for the dollar. */
  pair?: string;
  /** Its interest rate a year, a share, for rollover. */
  rate: number;
}

/** When the currencies roll over, and what the venues keep of it. */
export interface RolloverSpec {
  /** Ms past midnight, each weekday. */
  at: number;
  /** A share a year the venue keeps whichever way the position faces. */
  spread: number;
  /** Days in the year the rates are counted on. */
  basis: number;
}

/** What a margined instrument asks the firm to hold against it, as shares of a contract's value. */
export interface MarginSpec {
  /** To open or add to a position. */
  initial: number;
  /** To keep one: below it, the firm is flattened (the margin call). */
  maintenance: number;
}

/**
 * A series of contracts: contract `k` is `<root><k>`, expiring at `k × period + expiresAt`, and `live` of them are
 * listed at a time, the next listed as one expires.
 */
export interface ContractSeriesSpec {
  root: string;
  /** Every contract's spec but its symbol and expiry. */
  contract: Omit<InstrumentSpec, 'symbol' | 'expiry'>;
  /** Simulated ms between expiries: a week. */
  period: number;
  /** When in its period a contract expires, ms from the period's start (Monday 00:00 for a week). */
  expiresAt: number;
  /** How many are listed at once; at most `MAX_LIVE_PER_SERIES`. */
  live: number;
}

/** A stock is an instrument; the name stays for the content's list of stocks until venues arrive. */
export type StockSpec = InstrumentSpec;

export interface ExchangeSpec {
  id: string;
  name: string;
  city: string;
  /** Taker fee per share, in cents; may be a fraction of a cent. */
  feePerShare: number;
  /** How long, in ms, this exchange's traders take to catch up with a move in fair value. */
  lag: number;
  /** How far, in cents, this exchange's belief wobbles around fair value on its own. */
  noise: number;
  /** The desk whose instruments it lists; absent, the stocks desk. */
  desk?: string;
  /** Its hours; absent, the stocks' (09:30 to 16:00, Monday to Friday), worked out by the clock. */
  session?: SessionSpec;
  /**
   * A dealer's last look: a firm's order that would take its price is held `holdMs`, then filled at the price it
   * met unless the dealer's belief has moved more than `refuseTicks` of the grid past it, when it is refused.
   */
  lastLook?: { holdMs: number; refuseTicks: number };
  /**
   * Its fixes: call auctions at these times of day (the sim's clock), Monday to Friday, while it is open at `at`. For
   * `callMs` before each, nothing matches on its books: orders rest uncrossed, a firm's immediate-or-cancel order is
   * refused, and the crowd's takers rest at their limit; at `at` each book uncrosses at one price. A call may not
   * reach back past midnight. `flow`, where given, is the clients' orders aimed at the fix (see `FixFlow`).
   */
  auctions?: { at: number; callMs: number; flow?: FixFlow }[];
}

/**
 * The clients' orders aimed at a fix: in each call, for each book, with this `chance`, one order on one side (even
 * odds), arriving in the last `withinMs` of the call, of between `lots[0]` and `lots[1]` of the instrument's crowd lot
 * (small more often: the share of the range is a uniform draw squared), priced `reach` grid steps through the crowd's
 * belief, so it moves the uncrossing price and not the continuous book. Drawn from the venue's own crowd stream.
 */
export interface FixFlow {
  chance: number;
  lots: readonly [number, number];
  withinMs: number;
  reach: number;
}

export interface LocationSpec {
  id: string;
  name: string;
  price: number;
  /**
   * Cents a week, charged at Friday's close while it is in use (the full week, whenever in the week it was bought);
   * absent is free. A draft: about two per cent of the price.
   */
  rent?: number;
  /** A desk's location (a rack at its venue) is offered only once that desk is open; absent, always. */
  desk?: string;
  /** One-way distance an order travels to each exchange, in ms of light through fibre. */
  distance: Record<string, number>;
  /**
   * How far each exchange's quotes travel to reach the firm's decision; `distance` where absent. A rack at an
   * exchange sends orders at once, but the other exchange's quotes still cross the link.
   */
  dataDistance?: Record<string, number>;
  explain: string;
}

export interface NetworkSpec {
  id: string;
  name: string;
  price: number;
  /**
   * Cents a week, charged at Friday's close while it is in use (the full week, whenever in the week it was bought);
   * absent is free. A draft: about two per cent of the price.
   */
  rent?: number;
  /** Multiplies the distance: fibre is one, microwave is less. */
  factor: number;
  /** Fixed ms added to every hop, for the gear at each end. */
  overhead: number;
  explain: string;
}

export interface ComputerSpec {
  id: string;
  name: string;
  price: number;
  /**
   * Cents a week, charged at Friday's close while it is in use (the full week, whenever in the week it was bought);
   * absent is free. A draft: about two per cent of the price.
   */
  rent?: number;
  /** How many strategy blocks can run at once. */
  maxBlocks: number;
  /** How many orders it can send in a second of simulated time. */
  ordersPerSecond: number;
  /** How often, in ms, the strategy gets to decide. */
  decisionEveryMs: number;
  /** How many symbols it can watch at once. */
  maxSymbols: number;
  explain: string;
}

export interface Infrastructure {
  location: LocationSpec;
  network: NetworkSpec;
  computer: ComputerSpec;
}

/** What a strategy may know about a headline. Whether it was noise is learned the hard way. */
export interface Headline {
  id: number;
  at: number;
  text: string;
  symbols: string[];
  sector: string | null;
  /** The way the headline reads: up, down or neither. */
  direction: -1 | 0 | 1;
}

/** A news template: what the content writes, with holes the engine fills. */
export interface NewsTemplate {
  /** Who it is about: one company, a whole sector, or everyone. */
  scope: 'company' | 'sector' | 'market';
  /** Text with {company}, {sector}, {pct} and {n} to fill. */
  text: string;
  direction: -1 | 0 | 1;
  /** Typical size of the move, in basis points of the price; zero for a story that sounds like news and is not. */
  magnitudeBps: number;
  /** How long the market takes to price it in, ms. */
  priceInMs: number;
}

export interface CompetitorSpec {
  id: string;
  name: string;
  location: string;
  network: string;
  computer: string;
  /** The arbitrage edge it insists on, in cents a share. */
  minEdge: number;
  /** Exchanges further than this, in ms, it leaves alone. */
  maxLatency?: number;
  /** The blocks it runs, with parameters over the block's defaults; arbitrage at its edge where absent. */
  blocks?: { id: string; params?: Record<string, number> }[];
  /** A desk's rival joins the game when that desk opens; absent, from the start. */
  desk?: string;
  /** The desks whose instruments it watches; absent, the stocks', and its own desk's if it has one. */
  watches?: string[];
}

/** The character of a trading day: multipliers on the market's own behaviour. */
export interface RegimeSpec {
  id: string;
  name: string;
  /** How often this kind of day comes, relative to the others. */
  weight: number;
  explain: string;
  /** On the fair value's hourly wander. */
  vol: number;
  /** On how often and how far the fair value jumps. */
  jumpRate: number;
  jumpSize: number;
  /** On how many headlines the day gets and how big they are. */
  newsRate: number;
  newsSize: number;
  /** A drift over the session, in basis points of the price, signed per stock at the open. */
  driftBps: number;
}

/** How the market and each sector wander together, in basis points. */
export interface FactorSpec {
  /** One standard deviation of the market factor's move in an hour, basis points. */
  marketHourlyBps: number;
  /** The same for each sector's own factor. */
  sectorHourlyBps: number;
  /**
   * How fast a stock's own wander comes back to its anchor, per hour: four is a half-life of about ten minutes.
   * The factors and the news move the anchor itself, so only the stock's own noise is what reverts.
   */
  ownReversionPerHour: number;
}

/** Everything the content hands the sim. */
export interface Content {
  stocks: StockSpec[];
  /** The other desks' own instruments (not contracts in a series), there and closed until their desk opens. */
  instruments?: InstrumentSpec[];
  /** The currencies besides the dollar's balances are kept in, and the dollar itself; absent, the dollar alone. */
  currencies?: CurrencySpec[];
  /** Rollover for currency positions; absent, none. */
  rollover?: RolloverSpec;
  /** Storage and the lease on metal held overnight; absent, none. */
  storage?: StorageSpec;
  /** Each desk's own news; absent, none. */
  deskNews?: DeskNewsSpec[];
  /** Contract series, listed as time passes; absent, none. */
  series?: ContractSeriesSpec[];
  exchanges: ExchangeSpec[];
  news: NewsTemplate[];
  locations: LocationSpec[];
  networks: NetworkSpec[];
  computers: ComputerSpec[];
  competitors: CompetitorSpec[];
  regimes: RegimeSpec[];
  factors: FactorSpec;
  /** Cents. */
  startingCash: number;
  start: { location: string; network: string; computer: string; blocks: string[] };
  firmName: string;
  /** The desk, where the player trades by hand. */
  desk: { reactionMs: number };
}

/** Rules an exchange may run: each a real policy built or proposed to blunt speed. */
export interface ExchangeRules {
  /** Added to every order's and every quote's latency through this exchange, ms. */
  speedBumpMs: number;
  /** Orders match only at the next batch, this often; zero is continuous matching. */
  batchMs: number;
  /** Charged to both sides of every fill, cents a share. */
  taxPerShare: number;
  /** A resting order cannot be cancelled before it has rested this long, ms. */
  minRestMs: number;
  /** Prices sit on this grid, cents. */
  tickSize: number;
  /** Whether a post-only order is honoured; off, it is a plain order. */
  postOnly: boolean;
}

export const DEFAULT_RULES: ExchangeRules = {
  speedBumpMs: 0,
  batchMs: 0,
  taxPerShare: 0,
  minRestMs: 0,
  tickSize: 1,
  postOnly: true,
};
