// The shapes the content hands the sim at construction. The sim never imports content; it is given these.

export interface StockSpec {
  symbol: string;
  name: string;
  sector: string;
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
  /** One-way distance to each exchange, in ms of light through fibre. */
  distance: Record<string, number>;
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
  /** Cents. */
  startingCash: number;
  start: { location: string; network: string; computer: string };
  firmName: string;
}
