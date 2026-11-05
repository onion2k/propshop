// The shapes the content hands the sim at construction. The sim never imports content; it is given these.

export interface StockSpec {
  symbol: string;
  name: string;
  sector: string;
  /** How much of the market's move this stock takes: one is the market's own. */
  beta?: number;
  /** An index: its fair value is the average of these symbols', and it has no wander of its own. */
  constituents?: string[];
  /** Opening price, cents. */
  startPrice: number;
  /** How far the fair value wanders in an hour, in cents, one standard deviation. */
  hourlyVol: number;
  /** Sudden moves a second, on average: bursts of buying or selling that fast exchanges see before slow ones. */
  jumpsPerSecond: number;
  /** How big a sudden move is, in cents, one standard deviation. */
  jumpSize: number;
}

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
}

export interface LocationSpec {
  id: string;
  name: string;
  price: number;
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
