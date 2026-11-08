// A trading firm: the player's, or a competitor's. It sees the market late, decides on a schedule its computer
// allows, sends orders that arrive late, and books the fills that come back later still. Cash, positions and
// P&L live here, and so does the regulator's interest in it.

import { MS_PER_SECOND } from './clock';
import type { Exchange, SubmitResult } from './exchange';
import { DelayQueue, dataLatencyTo, latencyTo, type Delayed } from './latency';
import { NO_SCALES, valueOf } from './instrument';
import type { Market } from './market';
import type { Quote, Side, Trade } from './orderbook';
import { EXAMPLE_SOURCE, SCRIPT_ID, blockById, blockFor, paramsFrom } from './strategy';
import {
  flattenTo,
  type BeatenBy,
  type Fill,
  type HandIntent,
  type Intent,
  type MarketView,
  type OpenOrder,
  type Params,
  type SeenDepth,
  type SeenQuote,
  type SeenPrint,
  BEST,
  TAPE_VIEW,
} from './strategy';
import type { Headline, Infrastructure } from './types';

/** How many fills and how many finished orders a firm remembers. */
const FILL_LOG = 200;
const ORDER_LOG = 200;
/** The midpoint history the blocks read: a sample every quarter second of simulated time, so many kept. */
export const MID_SAMPLE_EVERY = 250;
/** Ten minutes of samples: enough for a pair's ratio to have somewhere to come back from. */
const MID_LOG = 2400;
/** How many gap episodes a firm remembers, oldest dropped first. Not saved: a display of the past. */
const GAP_LOG = 20;

/** A run of consecutive decisions in which the firm's own view had one exchange's ask under another's bid. */
export interface GapEpisode {
  symbol: string;
  /** Where the best ask was, so where the firm would buy. */
  buyOn: string;
  /** Where the best bid was, so where it would sell. */
  sellOn: string;
  /** Integer cents at first sight. */
  ask: number;
  bid: number;
  /** Cents a share after both legs' taker fees and any tax; negative where the gap is smaller than the costs. */
  edge: number;
  firstSeen: number;
  lastSeen: number;
}

export interface BlockSetting {
  id: string;
  enabled: boolean;
  params: Params;
  /** The script block's source; the others have none. */
  source?: string;
}

export interface Position {
  qty: number;
  /** Average cost of the open position, cents, a float. */
  avgCost: number;
}

/** A message on its way to an exchange. */
type Outbound =
  | {
      kind: 'order';
      localId: number;
      exchange: string;
      symbol: string;
      side: Side;
      price: number;
      size: number;
      ioc: boolean;
      postOnly?: boolean;
      display?: number;
    }
  | { kind: 'cancel'; localId: number; exchange: string; symbol: string; exchangeOrderId: number };

/** Why an order was refused before it left. */
export const REJECT_EXPOSURE = 'over the exposure limit';
export const REJECT_FLOOD = 'over the orders a second the computer can send';

/** Why a hand order was refused at the click. */
export const REJECT_MARKET_CLOSED = 'market closed';
export const REJECT_NO_QUOTE = 'no quote to trade against';
export const REJECT_BAD_ORDER = 'price and size must be whole numbers above zero';
export const REJECT_HAND_BACKLOG = 'too many hand orders waiting';

/** The block id a hand order is sent under. */
export const HAND_BLOCK = 'hand';
/** How far, in cents, a hand market order reaches through the visible price: a limit, so never unbounded. */
export const HAND_REACH = 5;
/** Hand orders waiting out the reaction time at once. A person cannot click faster than the wait allows. */
export const MAX_PENDING_HAND = 20;

type OrderIntent = Extract<Intent, { kind: 'order' }>;

/** A hand order between the click and the send: already priced and routed from what the screen showed. */
export interface PendingHand {
  clickedAt: number;
  /** When it leaves: the click plus the reaction time. */
  dueAt: number;
  /** When the exchange published the best quote it was priced from, stamped on every child. */
  seenAt: number | null;
  /** The far side's best price on screen at the click, the price the player thought they were getting. */
  clickTouch: number | null;
  /** One order per exchange it goes to. */
  children: OrderIntent[];
}

export type HandResult = { ok: true; dueAt: number } | { ok: false; reason: string; localId: number };

/** A message on its way back from an exchange. */
type Inbound =
  | {
      kind: 'ack';
      localId: number;
      exchangeOrderId: number;
      remaining: number;
      resting: boolean;
      arrivedAt: number;
      beatenBy: BeatenBy[];
    }
  | { kind: 'fill'; localId: number; price: number; size: number; at: number; taker: boolean }
  | { kind: 'cancelled'; localId: number }
  | { kind: 'cancelRefused'; localId: number; reason: string }
  | { kind: 'rejected'; localId: number; reason: string };

export interface RiskSettings {
  /** The day's loss, in cents, at which the firm halts until the next open. */
  dailyLossLimit: number;
  /** Gross exposure may reach equity times this. */
  maxLeverage: number;
}

export interface Halt {
  until: number;
  reason: string;
}

/** A message on the wire, as the microscope shows it. */
export interface Wire {
  owner: string;
  kind: 'order' | 'cancel' | 'ack' | 'fill' | 'cancelled' | 'cancelRefused' | 'rejected';
  exchange: string;
  symbol: string;
  side: Side;
  price: number;
  size: number;
  sentAt: number;
  arrivesAt: number;
  direction: 'out' | 'back';
}

export interface FirmStats {
  ordersSent: number;
  ordersDropped: number;
  /** Orders refused before they left: over the exposure cap. */
  ordersRejected: number;
  cancelsSent: number;
  fillsReceived: number;
  arbRoundTrips: number;
  /** Decisions at which the firm saw one exchange's ask below another's bid: a gap it could have raced for. */
  gapsSeen: number;
}

export interface SavedFirm {
  id: string;
  name: string;
  cash: number;
  positions: Record<string, Position>;
  blockPositions: Record<string, Record<string, number>>;
  realised: number;
  feesPaid: number;
  finesPaid: number;
  heat: number;
  blocks: BlockSetting[];
  risk?: RiskSettings;
  halt?: Halt | null;
  watch?: string[];
  orders: OpenOrder[];
  fills: Fill[];
  mids: Record<string, number[]>;
  /** Absent in a save from before the desk. */
  pendingHand?: PendingHand[];
  nextLocalId: number;
  nextFillSeq: number;
  /** Null where the firm has not decided or sent yet: JSON has no minus infinity. */
  lastDecision: number | null;
  /** When the midpoint history was last sampled; absent in a save from before it was kept. */
  midSampledAt?: number | null;
  secondStarted: number | null;
  ordersThisSecond: number;
  stats: FirmStats;
  outbound: Delayed<Outbound>[];
  inbound: Delayed<Inbound>[];
}

export class Firm {
  readonly id: string;
  name: string;
  /** Cents. */
  cash: number;
  readonly positions = new Map<string, Position>();
  /** What each block has net bought, by symbol, so a block can tidy up after itself and not after another. */
  readonly blockPositions = new Map<string, Map<string, number>>();
  realised = 0;
  feesPaid = 0;
  finesPaid = 0;
  /** The regulator's interest, from zero; it climbs with tips bought and cools each day. */
  heat = 0;
  infra: Infrastructure;
  blocks: BlockSetting[];
  /** The symbols the firm watches and its blocks see: at most what the computer allows. */
  watch: string[] = [];
  risk: RiskSettings;
  halt: Halt | null = null;
  /** Equity as of the last step, for the exposure cap, which cannot reach the market from send. */
  private equityNow = 0;
  readonly orders = new Map<number, OpenOrder>();
  fills: Fill[] = [];
  readonly mids = new Map<string, number[]>();
  private midSampledAt = -Infinity;
  stats: FirmStats = {
    ordersSent: 0,
    ordersDropped: 0,
    ordersRejected: 0,
    cancelsSent: 0,
    fillsReceived: 0,
    arbRoundTrips: 0,
    gapsSeen: 0,
  };
  /** How long a hand order waits before it leaves, ms; set by the game from the content, nought elsewhere. */
  reactionMs = 0;
  /** Hand orders waiting out the reaction time, oldest first, at most MAX_PENDING_HAND. */
  pendingHand: PendingHand[] = [];
  private nextLocalId = 1;
  private nextFillSeq = 1;
  private lastDecision = -Infinity;
  private secondStarted = -Infinity;
  private ordersThisSecond = 0;
  private outbound = new DelayQueue<Outbound>();
  private inbound = new DelayQueue<Inbound>();
  /** Fills that arrived this tick, and orders that finished this tick, for the game's tallies. */
  tickFills: Fill[] = [];
  tickResolved: OpenOrder[] = [];

  constructor(id: string, name: string, cash: number, infra: Infrastructure, blocks: BlockSetting[]) {
    this.id = id;
    this.name = name;
    this.cash = cash;
    this.infra = infra;
    this.blocks = blocks;
    this.risk = { dailyLossLimit: Math.round(cash * 0.02), maxLeverage: 4 };
    this.equityNow = cash;
  }

  static defaultBlocks(enabled: string[] = []): BlockSetting[] {
    return [
      'arbitrage',
      'marketMaker',
      'momentum',
      'meanReversion',
      'sniper',
      'pairs',
      'indexArb',
      'newsReaction',
      'anticipate',
      SCRIPT_ID,
    ].map((id) => ({
      id,
      enabled: enabled.includes(id),
      params: paramsFrom(blockById(id).spec),
      ...(id === SCRIPT_ID ? { source: EXAMPLE_SOURCE } : {}),
    }));
  }

  position(symbol: string): number {
    return this.positions.get(symbol)?.qty ?? 0;
  }

  /** The simulated time the exchanges are at, for a batch's answer, which arrives during their step. */
  batchedAt = 0;
  /** The speed bump each exchange runs, set by the game from the exchanges so the firm does not reach in. */
  bumps: Record<string, number> = {};
  /** The tax each exchange charges a fill, cents a share, set the same way. */
  taxes: Record<string, number> = {};
  /** Cents a price point of one held unit is worth, by symbol, handed in each tick from the market; absent, one. */
  scales: ReadonlyMap<string, number> = NO_SCALES;

  /** How late an order reaches the exchange, the exchange's speed bump included. */
  latency(exchange: string): number {
    return latencyTo(this.infra, exchange) + (this.bumps[exchange] ?? 0);
  }

  /** How late the exchange's quotes reach the firm, the bump included. */
  dataLatency(exchange: string): number {
    return dataLatencyTo(this.infra, exchange) + (this.bumps[exchange] ?? 0);
  }

  setBlock(id: string, change: { enabled?: boolean; params?: Partial<Params>; source?: string }): void {
    const b = this.blocks.find((x) => x.id === id);
    if (!b) throw new Error(`No block ${id}`);
    if (change.enabled !== undefined) b.enabled = change.enabled;
    if (change.params) b.params = paramsFrom(blockById(id).spec, { ...b.params, ...change.params });
    if (change.source !== undefined && id === SCRIPT_ID) b.source = change.source;
  }

  /** What the blocks see: the watchlist, cut to the computer's limit, or every symbol where none is set. */
  watching(all: readonly string[]): string[] {
    const list = this.watch.length > 0 ? this.watch.filter((w) => all.includes(w)) : [...all];
    return list.slice(0, this.infra.computer.maxSymbols);
  }

  setWatch(symbols: string[]): void {
    this.watch = [...new Set(symbols)];
  }

  enabledBlocks(): BlockSetting[] {
    return this.blocks.filter((b) => b.enabled).slice(0, this.infra.computer.maxBlocks);
  }

  /** Mark to the best bid or ask the firm has seen; unrealised P&L in cents. */
  unrealised(market: Market, now: number): number {
    let total = 0;
    for (const [symbol, pos] of this.positions) {
      if (pos.qty === 0) continue;
      const mark = this.mark(market, symbol, now);
      if (mark === null) continue;
      total += valueOf(market.scales.get(symbol) ?? 1, pos.qty, mark - pos.avgCost);
    }
    return total;
  }

  private mark(market: Market, symbol: string, now: number): number | null {
    let best: number | null = null;
    for (const e of market.exchanges) {
      const q = e.quoteAsOf(symbol, now - this.dataLatency(e.id));
      if (!q || q.bid === null || q.ask === null) continue;
      const mid = (q.bid + q.ask) / 2;
      if (best === null) best = mid;
    }
    return best;
  }

  /** Cash plus what the positions would fetch, cents. */
  equity(market: Market, now: number): number {
    let total = this.cash;
    for (const [symbol, pos] of this.positions) {
      if (pos.qty === 0) continue;
      const mark = this.mark(market, symbol, now) ?? pos.avgCost;
      total += valueOf(market.scales.get(symbol) ?? 1, pos.qty, mark);
    }
    return total;
  }

  /** One tick. Delivers what has arrived, decides if it is time, and sends what is due. */
  step(now: number, market: Market, news: readonly Headline[], open: boolean): void {
    this.tickFills = [];
    this.tickResolved = [];
    this.receive(now);
    this.deliver(now, market);
    this.releaseHand(now, open);
    if (!open) return;
    if (this.halt && now < this.halt.until) return;
    this.halt = null;
    if (now - this.lastDecision >= this.infra.computer.decisionEveryMs) {
      this.equityNow = this.equity(market, now);
      this.lastDecision = now;
      this.decide(now, market, news);
    }
  }

  private receive(now: number): void {
    for (const msg of this.inbound.pop(now)) {
      const order = this.orders.get(msg.localId);
      if (!order) continue;
      const before = order.status;
      switch (msg.kind) {
        case 'ack':
          order.exchangeOrderId = msg.exchangeOrderId;
          order.arrivedAt = msg.arrivedAt;
          order.ackAt = now;
          order.beatenBy = msg.beatenBy;
          if (order.status === 'inflight')
            order.status = msg.resting ? 'resting' : msg.remaining === 0 ? 'filled' : 'cancelled';
          break;
        case 'fill':
          this.book(order, msg.price, msg.size, msg.at, msg.taker);
          if (order.filled >= order.size) order.status = 'filled';
          break;
        case 'cancelled':
          if (order.status !== 'filled') order.status = 'cancelled';
          break;
        case 'cancelRefused':
          // The exchange would not let it go yet: it is still resting, and the block will try again.
          if (order.status === 'cancelling') order.status = 'resting';
          order.reason = msg.reason;
          break;
        case 'rejected':
          order.status = 'rejected';
          order.reason = msg.reason;
          break;
      }
      if (
        order.status !== before &&
        (order.status === 'filled' || order.status === 'cancelled' || order.status === 'rejected')
      ) {
        this.tickResolved.push(order);
      }
    }
    this.trimOrders();
  }

  private book(order: OpenOrder, price: number, size: number, at: number, taker: boolean): void {
    order.filled += size;
    // Maker-taker: the order that crossed the spread pays the exchange; the one that was resting does not. A
    // transaction tax, where the exchange runs one, is paid by both.
    const fee =
      (taker ? Math.round(this.feeFor(order.exchange) * size) : 0) +
      Math.round((this.taxes[order.exchange] ?? 0) * size);
    const pos = this.positions.get(order.symbol) ?? { qty: 0, avgCost: 0 };
    const scale = this.scaleOf(order.symbol);
    const signed = order.side === 'buy' ? size : -size;
    let realised = 0;
    if (pos.qty === 0 || Math.sign(pos.qty) === Math.sign(signed)) {
      pos.avgCost = (pos.avgCost * Math.abs(pos.qty) + price * size) / (Math.abs(pos.qty) + size);
      pos.qty += signed;
    } else {
      const closing = Math.min(Math.abs(pos.qty), size);
      realised = valueOf(scale, closing * Math.sign(pos.qty), price - pos.avgCost);
      pos.qty += signed;
      if (Math.sign(pos.qty) === Math.sign(signed)) pos.avgCost = price;
      if (pos.qty === 0) pos.avgCost = 0;
    }
    this.positions.set(order.symbol, pos);
    const mine = this.blockPositions.get(order.block) ?? new Map<string, number>();
    mine.set(order.symbol, (mine.get(order.symbol) ?? 0) + signed);
    this.blockPositions.set(order.block, mine);
    this.cash -= valueOf(scale, signed, price) + fee;
    this.feesPaid += fee;
    // A fill that realised nothing says nought, not minus nought, which a save would lose.
    if (realised === 0) realised = 0;
    this.realised += realised;
    this.stats.fillsReceived++;
    const fill: Fill = {
      seq: this.nextFillSeq++,
      at,
      localId: order.localId,
      block: order.block,
      exchange: order.exchange,
      symbol: order.symbol,
      side: order.side,
      price,
      size,
      fee,
      realised,
    };
    this.fills.push(fill);
    this.tickFills.push(fill);
    if (this.fills.length > FILL_LOG) this.fills.splice(0, this.fills.length - FILL_LOG);
  }

  private feeFor(exchange: string): number {
    return this.feeTable[exchange] ?? 0;
  }

  /** The gaps the view has seen, oldest first, at most GAP_LOG. Never saved and never read by a decision. */
  gapLog: GapEpisode[] = [];
  /** The episode still running per symbol, one at most each. */
  private openGaps = new Map<string, GapEpisode>();

  /** What a taker pays a share on an exchange: the fee and the tax. */
  private takerCost(exchange: string): number {
    return this.feeFor(exchange) + (this.taxes[exchange] ?? 0);
  }

  /** Set by the game from the market's exchanges, so the firm does not reach into them to find out. */
  feeTable: Record<string, number> = {};

  /** Finished orders are kept for the log, but only so many. */
  private trimOrders(): void {
    if (this.orders.size <= ORDER_LOG * 2) return;
    const done = [...this.orders.values()].filter(
      (o) => o.status !== 'inflight' && o.status !== 'resting' && o.status !== 'cancelling',
    );
    done.sort((a, b) => a.sentAt - b.sentAt);
    for (const o of done.slice(0, done.length - ORDER_LOG)) this.orders.delete(o.localId);
  }

  private view(now: number, market: Market, news: readonly Headline[]): MarketView {
    const quotes: Record<string, Record<string, SeenQuote>> = {};
    const symbols = this.watching(market.stocks.map((s) => s.symbol));
    const watched = market.stocks.filter((s) => symbols.includes(s.symbol));
    for (const e of market.exchanges) {
      const seen = now - this.dataLatency(e.id);
      const perSymbol: Record<string, SeenQuote> = {};
      for (const s of watched) {
        const q = e.quoteAsOf(s.symbol, seen);
        if (q) perSymbol[s.symbol] = q;
      }
      quotes[e.id] = perSymbol;
    }
    const positions: Record<string, number> = {};
    for (const [symbol, pos] of this.positions) positions[symbol] = pos.qty;
    // The tape and the depth are built when first read: the blocks that run every few milliseconds mostly never
    // look, and a rival's view would otherwise pay for twelve books on every exchange each time.
    let tape: Record<string, Record<string, readonly SeenPrint[]>> | undefined;
    let depth: Record<string, Record<string, SeenDepth>> | undefined;
    const buildTape = () => {
      const out: Record<string, Record<string, readonly SeenPrint[]>> = {};
      for (const e of market.exchanges) {
        const seen = now - this.dataLatency(e.id);
        const perSymbol: Record<string, readonly SeenPrint[]> = {};
        for (const s of watched) if (e.lists(s.symbol)) perSymbol[s.symbol] = e.tapeAsOf(s.symbol, seen, TAPE_VIEW);
        out[e.id] = perSymbol;
      }
      return out;
    };
    const buildDepth = () => {
      const out: Record<string, Record<string, SeenDepth>> = {};
      for (const e of market.exchanges) {
        const perSymbol: Record<string, SeenDepth> = {};
        for (const s of watched) {
          const q = quotes[e.id]?.[s.symbol];
          if (q) perSymbol[s.symbol] = depthOf(q);
        }
        out[e.id] = perSymbol;
      }
      return out;
    };
    const sample = now - this.midSampledAt >= MID_SAMPLE_EVERY;
    if (sample) this.midSampledAt = now;
    for (const s of watched) {
      let bestBid: number | null = null;
      let bestAsk: number | null = null;
      let bidOn: string | null = null;
      let askOn: string | null = null;
      for (const e of market.exchanges) {
        const q = quotes[e.id]?.[s.symbol];
        if (!q) continue;
        if (q.bid !== null && (bestBid === null || q.bid > bestBid)) {
          bestBid = q.bid;
          bidOn = e.id;
        }
        if (q.ask !== null && (bestAsk === null || q.ask < bestAsk)) {
          bestAsk = q.ask;
          askOn = e.id;
        }
      }
      if (bestBid !== null && bestAsk !== null && bestAsk < bestBid && bidOn !== askOn) {
        this.stats.gapsSeen++;
        const open = this.openGaps.get(s.symbol);
        if (open && open.buyOn === askOn && open.sellOn === bidOn) open.lastSeen = now;
        else {
          const edge = bestBid - bestAsk - this.takerCost(askOn!) - this.takerCost(bidOn!);
          const ep: GapEpisode = {
            symbol: s.symbol,
            buyOn: askOn!,
            sellOn: bidOn!,
            ask: bestAsk,
            bid: bestBid,
            edge: Math.round(edge * 1000) / 1000,
            firstSeen: now,
            lastSeen: now,
          };
          this.gapLog.push(ep);
          if (this.gapLog.length > GAP_LOG) this.gapLog.splice(0, this.gapLog.length - GAP_LOG);
          this.openGaps.set(s.symbol, ep);
        }
      } else if (this.openGaps.size > 0) this.openGaps.delete(s.symbol);
      if (sample && bestBid !== null && bestAsk !== null) {
        const log = this.mids.get(s.symbol) ?? [];
        log.push((bestBid + bestAsk) / 2);
        if (log.length > MID_LOG) log.splice(0, log.length - MID_LOG);
        this.mids.set(s.symbol, log);
      }
    }
    const mids: Record<string, readonly number[]> = {};
    for (const [k, v] of this.mids) mids[k] = v;
    const latency: Record<string, number> = {};
    for (const e of market.exchanges) latency[e.id] = this.latency(e.id);
    const blockPositions: Record<string, Record<string, number>> = {};
    for (const [block, bySymbol] of this.blockPositions) blockPositions[block] = Object.fromEntries(bySymbol);
    const sectors: Record<string, string> = {};
    const constituents: Record<string, readonly string[]> = {};
    for (const s of market.stocks) {
      sectors[s.symbol] = s.sector;
      if (s.constituents) constituents[s.symbol] = s.constituents;
    }
    return {
      now,
      symbols,
      sectors,
      constituents,
      exchanges: market.exchanges.map((e) => e.id),
      quotes,
      get tape() {
        return (tape ??= buildTape());
      },
      get depth() {
        return (depth ??= buildDepth());
      },
      fees: this.feeTable,
      latency,
      mids,
      positions,
      blockPositions,
      cash: this.cash,
      openOrders: [...this.orders.values()].filter(
        (o) => o.status === 'inflight' || o.status === 'resting' || o.status === 'cancelling',
      ),
      recentFills: this.fills,
      news,
    };
  }

  private decide(now: number, market: Market, news: readonly Headline[]): void {
    const view = this.view(now, market, news);
    for (const setting of this.enabledBlocks()) {
      const block = blockFor(setting);
      for (const intent of block.decide(view, setting.params)) this.send(intent, setting.id, now, view);
    }
  }

  /**
   * Halt until a moment: pull what is resting, get flat once at the best price in view, and decide nothing
   * until then. What does not fill on the way out stays; a halted firm is not a trading firm.
   */
  haltUntil(until: number, reason: string, now: number, market: Market, news: readonly Headline[]): void {
    this.halt = { until, reason };
    const view = this.view(now, market, news);
    for (const o of view.openOrders)
      if (o.status === 'resting') this.send({ kind: 'cancel', localId: o.localId }, 'risk', now, view, true);
    for (const symbol of view.symbols) {
      const position = view.positions[symbol] ?? 0;
      const intent = flattenTo(view, symbol, position, 0);
      if (intent) this.send(intent, 'risk', now, view, true);
    }
  }

  /** Gross notional of what is held and what is resting or in flight, cents. */
  private exposure(): number {
    let total = 0;
    for (const [symbol, pos] of this.positions) total += valueOf(this.scaleOf(symbol), Math.abs(pos.qty), pos.avgCost);
    for (const o of this.orders.values()) {
      if (o.status === 'inflight' || o.status === 'resting')
        total += valueOf(this.scaleOf(o.symbol), o.size - o.filled, o.price);
    }
    return total;
  }

  private scaleOf(symbol: string): number {
    return this.scales.get(symbol) ?? 1;
  }

  /**
   * `seenAt` overrides the quote time the order is stamped with, for a hand order priced at the click; and where
   * it is given the view is not read.
   */
  private send(
    intent: Intent,
    block: string,
    now: number,
    view: Pick<MarketView, 'quotes'> | null,
    force = false,
    seenAt?: number | null,
  ): void {
    if (now - this.secondStarted >= MS_PER_SECOND) {
      this.secondStarted = now;
      this.ordersThisSecond = 0;
    }
    if (!force && this.ordersThisSecond >= this.infra.computer.ordersPerSecond) {
      this.stats.ordersDropped++;
      return;
    }
    this.ordersThisSecond++;
    if (intent.kind === 'order' && !force) {
      // An order that would carry more than the leverage allows is refused here, not at the exchange.
      const reduces = Math.sign(this.position(intent.symbol)) === (intent.side === 'buy' ? -1 : 1);
      const adds = valueOf(this.scaleOf(intent.symbol), intent.size, intent.price);
      if (!reduces && this.exposure() + adds > this.equityNow * this.risk.maxLeverage) {
        this.stats.ordersRejected++;
        this.recordRejected(intent, block, now, REJECT_EXPOSURE);
        return;
      }
    }
    if (intent.kind === 'cancel') {
      this.stats.cancelsSent++;
      const o = this.orders.get(intent.localId);
      if (!o || o.status !== 'resting' || o.exchangeOrderId === null) return;
      o.status = 'cancelling';
      this.outbound.push(
        {
          kind: 'cancel',
          localId: o.localId,
          exchange: o.exchange,
          symbol: o.symbol,
          exchangeOrderId: o.exchangeOrderId,
        },
        now + this.latency(o.exchange),
      );
      return;
    }
    const localId = this.nextLocalId++;
    this.orders.set(localId, {
      localId,
      exchange: intent.exchange,
      exchangeOrderId: null,
      symbol: intent.symbol,
      side: intent.side,
      price: intent.price,
      size: intent.size,
      filled: 0,
      ioc: intent.ioc,
      postOnly: intent.postOnly,
      display: intent.display,
      status: 'inflight',
      block,
      sentAt: now,
      seenAt: seenAt !== undefined ? seenAt : (view?.quotes[intent.exchange]?.[intent.symbol]?.at ?? null),
      arrivedAt: null,
      ackAt: null,
      beatenBy: [],
    });
    this.stats.ordersSent++;
    const sent = this.outbound.push({ ...intent, localId }, now + this.latency(intent.exchange));
    if (!sent) {
      const o = this.orders.get(localId)!;
      o.status = 'rejected';
      o.reason = REJECT_FLOOD;
      this.stats.ordersDropped++;
    }
  }

  /** An order refused before it left, kept in the log with its reason so the player can read why. */
  private recordRejected(intent: OrderIntent, block: string, now: number, reason: string): number {
    const localId = this.nextLocalId++;
    this.orders.set(localId, {
      localId,
      exchange: intent.exchange,
      exchangeOrderId: null,
      symbol: intent.symbol,
      side: intent.side,
      price: intent.price,
      size: intent.size,
      filled: 0,
      ioc: intent.ioc,
      status: 'rejected',
      block,
      sentAt: now,
      seenAt: null,
      arrivedAt: null,
      ackAt: null,
      beatenBy: [],
      reason,
    });
    return localId;
  }

  /**
   * A person clicks. The order is priced and routed now, from the screen as it reached the firm, and leaves
   * after the reaction time: by then the screen it was priced from is the past. Refused at once, with the
   * reason, when the market is closed, the order is malformed, or there is nothing to trade against.
   */
  hand(intent: HandIntent, now: number, market: Market, news: readonly Headline[]): HandResult {
    const refuse = (reason: string): HandResult => {
      const exchange = intent.exchange === BEST ? (market.exchanges[0]?.id ?? intent.exchange) : intent.exchange;
      const price = intent.type === 'limit' ? (intent.price ?? 0) : 0;
      const localId = this.recordRejected(
        { kind: 'order', symbol: intent.symbol, exchange, side: intent.side, price, size: intent.size, ioc: false },
        HAND_BLOCK,
        now,
        reason,
      );
      return { ok: false, reason, localId };
    };
    const whole = (n: number | undefined) => n !== undefined && Number.isInteger(n) && n > 0;
    if (!whole(intent.size) || (intent.type === 'limit' && !whole(intent.price))) return refuse(REJECT_BAD_ORDER);
    if (!market.isOpenFor(intent.symbol, now)) return refuse(REJECT_MARKET_CLOSED);
    // A halted firm is not a trading firm: a click is refused with the halt's own reason, as a block's order is.
    if (this.halt && now < this.halt.until) return refuse(this.halt.reason);
    if (this.pendingHand.length >= MAX_PENDING_HAND) return refuse(REJECT_HAND_BACKLOG);
    const plan = this.routeHand(intent, this.view(now, market, news));
    if (!plan) return refuse(REJECT_NO_QUOTE);
    const dueAt = now + this.reactionMs;
    this.pendingHand.push({
      clickedAt: now,
      dueAt,
      seenAt: plan.seenAt,
      clickTouch: plan.clickTouch,
      children: plan.children,
    });
    return { ok: true, dueAt };
  }

  /** The orders a hand intent becomes, from the view at the click; null where there is no price to go on. */
  private routeHand(
    intent: HandIntent,
    view: MarketView,
  ): { children: OrderIntent[]; seenAt: number | null; clickTouch: number | null } | null {
    const { symbol, side, size } = intent;
    const buy = side === 'buy';
    const through = (price: number) => Math.max(1, price + (buy ? HAND_REACH : -HAND_REACH));
    const child = (exchange: string, price: number, n: number, ioc: boolean): OrderIntent => ({
      kind: 'order',
      symbol,
      exchange,
      side,
      price,
      size: n,
      ioc,
      ...(intent.postOnly && !ioc ? { postOnly: true } : {}),
    });
    // What the far side shows on each exchange, best price first: the prices this order would take.
    const far = view.exchanges
      .flatMap((exchange) => {
        const q = view.quotes[exchange]?.[symbol];
        const price = q ? (buy ? q.ask : q.bid) : null;
        return q && price !== null ? [{ exchange, price, size: buy ? q.askSize : q.bidSize, at: q.at }] : [];
      })
      .sort((a, b) => (buy ? a.price - b.price : b.price - a.price));
    const market = intent.type === 'market';
    const clickTouch =
      (intent.exchange === BEST ? far[0] : far.find((f) => f.exchange === intent.exchange))?.price ?? null;
    if (intent.exchange !== BEST) {
      if (!view.exchanges.includes(intent.exchange)) return null;
      const here = far.find((f) => f.exchange === intent.exchange);
      if (market)
        return here
          ? { children: [child(here.exchange, through(here.price), size, true)], seenAt: here.at, clickTouch }
          : null;
      return {
        children: [child(intent.exchange, intent.price!, size, false)],
        seenAt: view.quotes[intent.exchange]?.[symbol]?.at ?? null,
        clickTouch,
      };
    }
    const limit = market ? (far[0] ? through(far[0].price) : null) : intent.price!;
    if (limit === null) return null;
    const reachable = far.filter((f) => (buy ? f.price <= limit : f.price >= limit));
    if (reachable.length === 0) {
      // Nothing to take at this price: it rests, on the exchange with the best bid for a buy or ask for a sell.
      const own = view.exchanges
        .flatMap((exchange) => {
          const q = view.quotes[exchange]?.[symbol];
          const price = q ? (buy ? q.bid : q.ask) : null;
          return q && price !== null ? [{ exchange, price, at: q.at }] : [];
        })
        .sort((a, b) => (buy ? b.price - a.price : a.price - b.price));
      const where = own[0]?.exchange ?? far[0]?.exchange ?? view.exchanges[0];
      if (where === undefined || market) return null;
      return { children: [child(where, limit, size, false)], seenAt: own[0]?.at ?? null, clickTouch };
    }
    const children: OrderIntent[] = [];
    let left = size;
    for (const f of reachable) {
      const take = Math.min(left, f.size);
      children.push(child(f.exchange, limit, take, market));
      left -= take;
      if (left === 0) break;
    }
    // What the visible quotes cannot cover rides with the best exchange's order, to walk its deeper levels or rest.
    if (left > 0) children[0]!.size += left;
    return { children, seenAt: reachable[0]!.at, clickTouch };
  }

  /** Hand orders whose reaction time is up leave now, all stamped as seen at the click; at the close they are refused. */
  private releaseHand(now: number, open: boolean): void {
    while (this.pendingHand[0] && this.pendingHand[0].dueAt <= now) {
      const p = this.pendingHand.shift()!;
      for (const c of p.children) {
        if (open) {
          const id = this.nextLocalId;
          this.send(c, HAND_BLOCK, now, null, false, p.seenAt);
          const sent = this.nextLocalId > id ? this.orders.get(id) : undefined;
          if (sent) sent.clickTouch = p.clickTouch;
        } else this.tickResolved.push(this.orders.get(this.recordRejected(c, HAND_BLOCK, now, REJECT_MARKET_CLOSED))!);
      }
    }
  }

  /** Messages that have reached their exchange act on it now; the answer starts its way back. */
  private deliver(now: number, market: Market): void {
    for (const msg of this.outbound.pop(now)) {
      const exchange = market.exchange(msg.exchange);
      const back = now + this.latency(msg.exchange);
      if (msg.kind === 'cancel') {
        const { refused } = exchange.cancel(msg.symbol, msg.exchangeOrderId, now);
        if (refused) this.inbound.push({ kind: 'cancelRefused', localId: msg.localId, reason: refused }, back);
        else this.inbound.push({ kind: 'cancelled', localId: msg.localId }, back);
        continue;
      }
      const mine = this.orders.get(msg.localId);
      // A hand order notes the touch it finds, to set against the one the player clicked.
      if (mine && mine.block === HAND_BLOCK) {
        const q = exchange.quote(msg.symbol);
        mine.arrivalTouch = msg.side === 'buy' ? q.ask : q.bid;
      }
      // Before the order goes in, read who took the quote it was sent for since the firm saw it.
      const beatenBy =
        mine && mine.seenAt !== null ? exchange.takersSince(msg.symbol, mine.seenAt, msg.side, msg.price, this.id) : [];
      // The answer, now or at the next batch: refused with a reason, or acked with what remains.
      const answer = (result: SubmitResult, arrivedAt: number) => {
        const reply = arrivedAt + this.latency(msg.exchange);
        if (result.refused) {
          this.inbound.push({ kind: 'rejected', localId: msg.localId, reason: result.refused }, reply);
          return;
        }
        const o = this.orders.get(msg.localId);
        if (o) o.arrivedAt = arrivedAt;
        // The exchange's own trades for this order come back through onTrade, like any other fill.
        this.inbound.push(
          {
            kind: 'ack',
            localId: msg.localId,
            exchangeOrderId: result.order.id,
            remaining: result.order.remaining,
            resting: result.order.remaining > 0 && !result.order.ioc,
            arrivedAt,
            beatenBy,
          },
          reply,
        );
      };
      const result = exchange.submit(
        msg.symbol,
        {
          owner: this.id,
          side: msg.side,
          price: msg.price,
          size: msg.size,
          ioc: msg.ioc,
          postOnly: msg.postOnly,
          display: msg.display,
        },
        now,
        (r) => answer(r, this.batchedAt),
      );
      if (result) answer(result, now);
    }
  }

  /** The game routes every trade to the firms in it; each fill travels back at the exchange's latency. */
  onTrade(exchange: Exchange, symbol: string, trade: Trade, now: number): void {
    const mine = trade.buyer === this.id ? 'buy' : trade.seller === this.id ? 'sell' : null;
    if (!mine) return;
    const exchangeOrderId = mine === 'buy' ? trade.buyId : trade.sellId;
    const order = this.findByExchangeOrder(exchange.id, symbol, exchangeOrderId);
    if (!order) return;
    this.inbound.push(
      {
        kind: 'fill',
        localId: order.localId,
        price: trade.price,
        size: trade.size,
        at: now,
        taker: trade.aggressor === mine,
      },
      now + this.latency(exchange.id),
    );
  }

  /** Order ids are the book's, so the same id can live on two stocks at one exchange: the symbol is part of the key. */
  private findByExchangeOrder(exchange: string, symbol: string, exchangeOrderId: number): OpenOrder | null {
    for (const o of this.orders.values()) {
      if (o.exchange === exchange && o.symbol === symbol && o.exchangeOrderId === exchangeOrderId) return o;
    }
    // The ack carrying the exchange's id may still be in flight: match the oldest unacknowledged order there.
    for (const o of this.orders.values()) {
      if (o.exchange === exchange && o.symbol === symbol && o.exchangeOrderId === null && o.status === 'inflight') {
        o.exchangeOrderId = exchangeOrderId;
        return o;
      }
    }
    return null;
  }

  /** Every message on the wire, for the microscope: orders and cancels on their way out, acks and fills on their way back. */
  inFlight(): Wire[] {
    const out: Wire[] = [];
    for (const d of this.outbound.save()) {
      const m = d.item;
      const o = this.orders.get(m.localId);
      out.push({
        owner: this.id,
        kind: m.kind,
        exchange: m.exchange,
        symbol: m.symbol,
        side: m.kind === 'order' ? m.side : (o?.side ?? 'buy'),
        price: m.kind === 'order' ? m.price : (o?.price ?? 0),
        size: m.kind === 'order' ? m.size : (o?.size ?? 0),
        sentAt: d.at - this.latency(m.exchange),
        arrivesAt: d.at,
        direction: 'out',
      });
    }
    for (const d of this.inbound.save()) {
      const m = d.item;
      const o = this.orders.get(m.localId);
      if (!o) continue;
      out.push({
        owner: this.id,
        kind: m.kind,
        exchange: o.exchange,
        symbol: o.symbol,
        side: o.side,
        price: m.kind === 'fill' ? m.price : o.price,
        size: m.kind === 'fill' ? m.size : o.size,
        sentAt: d.at - this.latency(o.exchange),
        arrivesAt: d.at,
        direction: 'back',
      });
    }
    return out;
  }

  /** The close: whatever was resting is gone, and the firm hears so at once. */
  onClose(gone: { owner: string; id: number; symbol: string }[]): void {
    for (const g of gone) {
      if (g.owner !== this.id) continue;
      for (const o of this.orders.values()) {
        if (
          o.exchangeOrderId === g.id &&
          o.symbol === g.symbol &&
          (o.status === 'resting' || o.status === 'cancelling')
        ) {
          o.status = 'cancelled';
        }
      }
    }
  }

  fine(cents: number): void {
    this.cash -= cents;
    this.finesPaid += cents;
  }

  save(): SavedFirm {
    return {
      id: this.id,
      name: this.name,
      cash: this.cash,
      positions: Object.fromEntries(this.positions),
      blockPositions: Object.fromEntries([...this.blockPositions].map(([b, m]) => [b, Object.fromEntries(m)])),
      realised: this.realised,
      feesPaid: this.feesPaid,
      finesPaid: this.finesPaid,
      heat: this.heat,
      blocks: this.blocks,
      risk: this.risk,
      halt: this.halt,
      watch: this.watch,
      orders: [...this.orders.values()],
      fills: this.fills,
      mids: Object.fromEntries(this.mids),
      pendingHand: this.pendingHand,
      nextLocalId: this.nextLocalId,
      nextFillSeq: this.nextFillSeq,
      lastDecision: Number.isFinite(this.lastDecision) ? this.lastDecision : null,
      midSampledAt: Number.isFinite(this.midSampledAt) ? this.midSampledAt : null,
      secondStarted: Number.isFinite(this.secondStarted) ? this.secondStarted : null,
      ordersThisSecond: this.ordersThisSecond,
      stats: this.stats,
      outbound: this.outbound.save(),
      inbound: this.inbound.save(),
    };
  }

  static load(s: SavedFirm, infra: Infrastructure): Firm {
    const f = new Firm(
      s.id,
      s.name,
      s.cash,
      infra,
      s.blocks.map((b) => ({ ...b, params: { ...b.params } })),
    );
    for (const [k, v] of Object.entries(s.positions)) f.positions.set(k, { ...v });
    for (const [b, m] of Object.entries(s.blockPositions)) f.blockPositions.set(b, new Map(Object.entries(m)));
    f.realised = s.realised;
    f.feesPaid = s.feesPaid;
    f.finesPaid = s.finesPaid;
    f.heat = s.heat;
    if (s.risk) f.risk = { ...s.risk };
    f.halt = s.halt ?? null;
    f.watch = s.watch ? [...s.watch] : [];
    for (const o of s.orders) f.orders.set(o.localId, { ...o });
    f.fills = s.fills.map((x) => ({ ...x }));
    for (const [k, v] of Object.entries(s.mids)) f.mids.set(k, [...v]);
    f.pendingHand = (s.pendingHand ?? []).map((p) => ({ ...p, children: p.children.map((c) => ({ ...c })) }));
    f.nextLocalId = s.nextLocalId;
    f.nextFillSeq = s.nextFillSeq;
    f.lastDecision = s.lastDecision === null ? -Infinity : s.lastDecision;
    f.midSampledAt = s.midSampledAt === null || s.midSampledAt === undefined ? -Infinity : s.midSampledAt;
    f.secondStarted = s.secondStarted === null ? -Infinity : s.secondStarted;
    f.ordersThisSecond = s.ordersThisSecond;
    // A save from before the count has none; it starts at nought.
    f.stats = {
      ...s.stats,
      gapsSeen: Number(s.stats.gapsSeen) || 0,
      ordersRejected: Number(s.stats.ordersRejected) || 0,
      cancelsSent: Number(s.stats.cancelsSent) || 0,
    };
    f.equityNow = s.cash;
    f.outbound = new DelayQueue(s.outbound.map((d) => ({ ...d })));
    f.inbound = new DelayQueue(s.inbound.map((d) => ({ ...d })));
    return f;
  }
}

/** The depth a quote alone shows, for a log entry from before depth was kept. */
/** A log entry never changes, so its depth is worked out once however many decisions look at it. */
const depthCache = new WeakMap<object, SeenDepth>();

function depthOf(q: Quote & { depth?: SeenDepth }): SeenDepth {
  const known = depthCache.get(q);
  if (known) return known;
  const made = depthFrom(q);
  depthCache.set(q, made);
  return made;
}

function depthFrom(q: Quote & { depth?: SeenDepth }): SeenDepth {
  if (q.depth) {
    // A log entry from before the biggest order was kept has only the sum: the best guess is one order.
    const fix = (ls: readonly { price: number; size: number; largest?: number }[]) =>
      ls.map((l) => ({ price: l.price, size: l.size, largest: l.largest ?? l.size }));
    return { bids: fix(q.depth.bids), asks: fix(q.depth.asks) };
  }
  const side = (p1: number | null, s1: number, p2: number | null, s2: number) => [
    ...(p1 !== null ? [{ price: p1, size: s1, largest: s1 }] : []),
    ...(p2 !== null ? [{ price: p2, size: s2, largest: s2 }] : []),
  ];
  return { bids: side(q.bid, q.bidSize, q.bid2, q.bid2Size), asks: side(q.ask, q.askSize, q.ask2, q.ask2Size) };
}
