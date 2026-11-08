// What a strategy block is: a spec the UI can draw, parameters the player tunes, and one function from what
// the firm can see to what it wants to do. A block holds no state of its own, so a scripted block can stand
// in the same place later, and a save is nothing but the parameters.

import type { Quote, Side } from '../orderbook';
import type { Headline } from '../types';

export interface ParamSpec {
  key: string;
  name: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit: string;
  explain: string;
}

export interface BlockSpec {
  id: string;
  name: string;
  /** One line for the panel. */
  summary: string;
  /** A paragraph for the learner: what it does, what it earns, what hurts it. */
  explain: string;
  params: ParamSpec[];
}

export type Params = Record<string, number>;

export interface SeenQuote extends Quote {
  /** When the exchange published it; the firm sees it later than this. */
  at: number;
}

/** A trade that took the liquidity an order was sent for, before the order arrived. */
export interface BeatenBy {
  owner: string;
  at: number;
  price: number;
  size: number;
}

export interface OpenOrder {
  localId: number;
  exchange: string;
  exchangeOrderId: number | null;
  symbol: string;
  side: Side;
  price: number;
  size: number;
  filled: number;
  ioc: boolean;
  postOnly?: boolean;
  display?: number;
  status: 'inflight' | 'resting' | 'cancelling' | 'filled' | 'cancelled' | 'rejected';
  block: string;
  sentAt: number;
  /** When the exchange published the quote this order was priced from; null when the firm had no quote. */
  seenAt: number | null;
  arrivedAt: number | null;
  ackAt: number | null;
  beatenBy: BeatenBy[];
  /** Why it was refused before it left, where it was. */
  reason?: string;
  /** A hand order: the far side's best price on screen at the click (the price the player thought they were getting). */
  clickTouch?: number | null;
  /** A hand order: the far side's best price on its exchange as it arrived, before it went in. */
  arrivalTouch?: number | null;
}

export interface Fill {
  /** The firm's own count of fills, so each is one thing however alike two are. */
  seq: number;
  at: number;
  localId: number;
  block: string;
  exchange: string;
  symbol: string;
  side: Side;
  price: number;
  size: number;
  /** Fee charged, cents. */
  fee: number;
  /** Realised P&L this fill closed out, cents, before fees. */
  realised: number;
}

/**
 * A print as a fast reader sees the tape: one aggressor order's fills in one tick, summed. Nothing says whose
 * order it was.
 */
export interface SeenPrint {
  price: number;
  size: number;
  /** The side that crossed the spread. */
  aggressor: Side;
  /** When it printed at the exchange; the firm saw it later than this. */
  at: number;
  /** The aggressor took the whole of the best level as it stood: the signature of a routed sweep's child. */
  cleared: boolean;
}

/** One price level as the firm sees it: what rests there, whoever it belongs to. */
export interface SeenLevel {
  price: number;
  size: number;
  /** The biggest single order resting there (direct feeds show orders one by one); the sum is `size`. */
  largest: number;
}

/** The top levels of a book, best first, as they stood when the firm's latest view of the exchange was made. */
export interface SeenDepth {
  bids: readonly SeenLevel[];
  asks: readonly SeenLevel[];
}

/** How many recent trades a view carries per exchange and symbol. */
export const TAPE_VIEW = 20;

/** What a block gets to see: the market as it has reached the firm, and the firm's own book. */
export interface MarketView {
  now: number;
  /** The symbols the firm watches: all a block may trade. */
  symbols: readonly string[];
  /** Every symbol's sector, and an index's constituents, watched or not. */
  sectors: Readonly<Record<string, string>>;
  constituents: Readonly<Record<string, readonly string[]>>;
  exchanges: readonly string[];
  /** quotes[exchange][symbol], as of what has arrived; missing until the first quote lands. */
  quotes: Readonly<Record<string, Readonly<Record<string, SeenQuote>>>>;
  /**
   * tape[exchange][symbol]: the last TAPE_VIEW trades that had reached the firm, oldest first, through the same
   * data latency as the quotes. Built on first read: most blocks never look.
   */
  tape: Readonly<Record<string, Readonly<Record<string, readonly SeenPrint[]>>>>;
  /** depth[exchange][symbol]: the top three levels a side, as seen through the same latency. Built on first read. */
  depth: Readonly<Record<string, Readonly<Record<string, SeenDepth>>>>;
  /** Taker fee per share per exchange, cents. */
  fees: Readonly<Record<string, number>>;
  /** The firm's own order latency to each exchange, ms, so a block can leave the far ones alone. */
  latency: Readonly<Record<string, number>>;
  /** Recent mids per symbol, oldest first, from the best quote the firm has seen, sampled each decision. */
  mids: Readonly<Record<string, readonly number[]>>;
  positions: Readonly<Record<string, number>>;
  /** blockPositions[block][symbol]: what each block has net bought, so it can undo its own doing. */
  blockPositions: Readonly<Record<string, Readonly<Record<string, number>>>>;
  cash: number;
  openOrders: readonly OpenOrder[];
  recentFills: readonly Fill[];
  /** Headlines published recently, newest last. */
  news: readonly Headline[];
  /** Each listed contract priced from an underlying: what it is on, when it expires, its carry and multiplier. */
  contracts?: Readonly<Record<string, ContractView>>;
}

/** A listed contract as a block sees it. */
export interface ContractView {
  underlying: string;
  /** Simulated ms. */
  expiry: number;
  /** A year, a share: the contract's fair price is the underlying's times `1 + carry × years to expiry`. */
  carry: number;
  /** Units of the underlying in one contract. */
  multiplier: number;
}

/** A year of carry, ms. */
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** What a contract's price is worth in units of its underlying now: its price over this. */
export function carryFactor(c: ContractView, now: number): number {
  return 1 + (c.carry * Math.max(0, c.expiry - now)) / YEAR_MS;
}

/**
 * The watched contracts on watched underlyings, soonest expiry first; those within `guardMs` of expiry left out,
 * so a block trading the basis does not open a position into the last minutes.
 */
export function contractsByExpiry(view: MarketView, guardMs = 0): [string, ContractView][] {
  return Object.entries(view.contracts ?? {})
    .filter(
      ([s, c]) => view.symbols.includes(s) && view.symbols.includes(c.underlying) && c.expiry - view.now > guardMs,
    )
    .sort((a, b) => a[1].expiry - b[1].expiry);
}

export type Intent =
  | {
      kind: 'order';
      symbol: string;
      exchange: string;
      side: Side;
      price: number;
      size: number;
      ioc: boolean;
      /** Refused rather than filled as a taker if it would cross. */
      postOnly?: boolean;
      /** Iceberg: show at most this much at a time. */
      display?: number;
    }
  | { kind: 'cancel'; localId: number };

/**
 * An order a person sends from the desk. It is priced and routed from what the screen showed at the click and
 * leaves after the firm's reaction time, which is the whole lesson.
 */
export interface HandIntent {
  symbol: string;
  side: Side;
  size: number;
  /** An exchange id, or 'best' for the best visible price, on to the next exchanges for what it cannot fill. */
  exchange: string;
  /** A market order is a limit at the far side's visible price, through it by HAND_REACH, immediate-or-cancel. */
  type: 'market' | 'limit';
  /** Integer cents; a limit order's price, which rests where it is not met. Ignored for a market order. */
  price?: number;
  /** Refused rather than filled as a taker if it would cross; a limit order only. */
  postOnly?: boolean;
}

/** The exchange name that routes an order to the best visible price. */
export const BEST = 'best';

export interface StrategyBlock {
  spec: BlockSpec;
  decide(view: MarketView, params: Params): Intent[];
}

/** The best bid and ask across exchanges, with where each is; exchanges further than maxLatency are left out. */
export function bestAcross(view: MarketView, symbol: string, maxLatency = Infinity) {
  let bid: { price: number; size: number; exchange: string } | null = null;
  let ask: { price: number; size: number; exchange: string } | null = null;
  for (const exchange of view.exchanges) {
    if ((view.latency[exchange] ?? 0) > maxLatency) continue;
    const q = view.quotes[exchange]?.[symbol];
    if (!q) continue;
    if (q.bid !== null && (bid === null || q.bid > bid.price)) bid = { price: q.bid, size: q.bidSize, exchange };
    if (q.ask !== null && (ask === null || q.ask < ask.price)) ask = { price: q.ask, size: q.askSize, exchange };
  }
  return { bid, ask };
}

/**
 * The bid and ask on an exchange with the block's own resting orders taken out: where the block's order is the
 * whole of the best level, the second level is the touch. A maker's own quote is not information about the price.
 */
export function touchExcluding(view: MarketView, exchange: string, symbol: string, block: string) {
  const q = view.quotes[exchange]?.[symbol];
  if (!q) return null;
  let bid = q.bid;
  let ask = q.ask;
  for (const o of view.openOrders) {
    if (o.block !== block || o.exchange !== exchange || o.symbol !== symbol || o.status !== 'resting') continue;
    const left = o.size - o.filled;
    if (o.side === 'buy' && o.price === q.bid && left >= q.bidSize) bid = q.bid2;
    if (o.side === 'sell' && o.price === q.ask && left >= q.askSize) ask = q.ask2;
  }
  return { bid, ask };
}

export function ownPosition(view: MarketView, block: string, symbol: string): number {
  return view.blockPositions[block]?.[symbol] ?? 0;
}

/** An IOC that takes the position toward `want` at the best price across exchanges, or nothing if it cannot. */
export function flattenTo(view: MarketView, symbol: string, position: number, want: number): Intent | null {
  const delta = want - position;
  if (delta === 0) return null;
  const { bid, ask } = bestAcross(view, symbol);
  if (delta > 0 && ask) {
    return {
      kind: 'order',
      symbol,
      exchange: ask.exchange,
      side: 'buy',
      price: ask.price,
      size: Math.min(delta, ask.size),
      ioc: true,
    };
  }
  if (delta < 0 && bid) {
    return {
      kind: 'order',
      symbol,
      exchange: bid.exchange,
      side: 'sell',
      price: bid.price,
      size: Math.min(-delta, bid.size),
      ioc: true,
    };
  }
  return null;
}

export function inFlight(view: MarketView, symbol: string, block?: string): boolean {
  return view.openOrders.some(
    (o) =>
      o.symbol === symbol &&
      (block === undefined || o.block === block) &&
      (o.status === 'inflight' || o.status === 'cancelling'),
  );
}

export function paramsFrom(spec: BlockSpec, given: Partial<Params> = {}): Params {
  const out: Params = {};
  for (const p of spec.params) out[p.key] = clampParam(p, given[p.key] ?? p.default);
  return out;
}

export function clampParam(p: ParamSpec, value: number): number {
  const stepped = Math.round((value - p.min) / p.step) * p.step + p.min;
  const clamped = Math.min(p.max, Math.max(p.min, stepped));
  // Snap away the float dust a step like 0.1 leaves behind.
  return Math.round(clamped * 1e6) / 1e6;
}
