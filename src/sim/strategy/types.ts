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
  status: 'inflight' | 'resting' | 'cancelling' | 'filled' | 'cancelled' | 'rejected';
  block: string;
  sentAt: number;
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

/** What a block gets to see: the market as it has reached the firm, and the firm's own book. */
export interface MarketView {
  now: number;
  symbols: readonly string[];
  exchanges: readonly string[];
  /** quotes[exchange][symbol], as of what has arrived; missing until the first quote lands. */
  quotes: Readonly<Record<string, Readonly<Record<string, SeenQuote>>>>;
  /** Taker fee per share per exchange, cents. */
  fees: Readonly<Record<string, number>>;
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
    }
  | { kind: 'cancel'; localId: number };

export interface StrategyBlock {
  spec: BlockSpec;
  decide(view: MarketView, params: Params): Intent[];
}

/** The best bid and ask across exchanges, with where each is. */
export function bestAcross(view: MarketView, symbol: string) {
  let bid: { price: number; size: number; exchange: string } | null = null;
  let ask: { price: number; size: number; exchange: string } | null = null;
  for (const exchange of view.exchanges) {
    const q = view.quotes[exchange]?.[symbol];
    if (!q) continue;
    if (q.bid !== null && (bid === null || q.bid > bid.price)) bid = { price: q.bid, size: q.bidSize, exchange };
    if (q.ask !== null && (ask === null || q.ask < ask.price)) ask = { price: q.ask, size: q.askSize, exchange };
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
