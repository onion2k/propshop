// A trading firm: the player's, or a competitor's. It sees the market late, decides on a schedule its computer
// allows, sends orders that arrive late, and books the fills that come back later still. Cash, positions and
// P&L live here, and so does the regulator's interest in it.

import { MS_PER_SECOND } from './clock';
import type { Exchange } from './exchange';
import { DelayQueue, latencyTo, type Delayed } from './latency';
import type { Market } from './market';
import type { Side, Trade } from './orderbook';
import { blockById, paramsFrom } from './strategy';
import type { BeatenBy, Fill, Intent, MarketView, OpenOrder, Params, SeenQuote } from './strategy';
import type { Headline, Infrastructure } from './types';

/** How many fills and how many finished orders a firm remembers. */
const FILL_LOG = 200;
const ORDER_LOG = 200;
/** How many recent mids per symbol a firm keeps for the momentum block. */
const MID_LOG = 60;

export interface BlockSetting {
  id: string;
  enabled: boolean;
  params: Params;
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
    }
  | { kind: 'cancel'; localId: number; exchange: string; symbol: string; exchangeOrderId: number };

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
  | { kind: 'rejected'; localId: number; reason: string };

export interface FirmStats {
  ordersSent: number;
  ordersDropped: number;
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
  orders: OpenOrder[];
  fills: Fill[];
  mids: Record<string, number[]>;
  nextLocalId: number;
  nextFillSeq: number;
  /** Null where the firm has not decided or sent yet: JSON has no minus infinity. */
  lastDecision: number | null;
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
  readonly orders = new Map<number, OpenOrder>();
  fills: Fill[] = [];
  readonly mids = new Map<string, number[]>();
  stats: FirmStats = { ordersSent: 0, ordersDropped: 0, fillsReceived: 0, arbRoundTrips: 0, gapsSeen: 0 };
  private nextLocalId = 1;
  private nextFillSeq = 1;
  private lastDecision = -Infinity;
  private secondStarted = -Infinity;
  private ordersThisSecond = 0;
  private outbound = new DelayQueue<Outbound>();
  private inbound = new DelayQueue<Inbound>();
  /** Fills that arrived this tick, for the game to tell the UI about. */
  tickFills: Fill[] = [];

  constructor(id: string, name: string, cash: number, infra: Infrastructure, blocks: BlockSetting[]) {
    this.id = id;
    this.name = name;
    this.cash = cash;
    this.infra = infra;
    this.blocks = blocks;
  }

  static defaultBlocks(enabled: string[] = []): BlockSetting[] {
    return ['arbitrage', 'marketMaker', 'momentum', 'newsReaction'].map((id) => ({
      id,
      enabled: enabled.includes(id),
      params: paramsFrom(blockById(id).spec),
    }));
  }

  position(symbol: string): number {
    return this.positions.get(symbol)?.qty ?? 0;
  }

  latency(exchange: string): number {
    return latencyTo(this.infra, exchange);
  }

  setBlock(id: string, change: { enabled?: boolean; params?: Partial<Params> }): void {
    const b = this.blocks.find((x) => x.id === id);
    if (!b) throw new Error(`No block ${id}`);
    if (change.enabled !== undefined) b.enabled = change.enabled;
    if (change.params) b.params = paramsFrom(blockById(id).spec, { ...b.params, ...change.params });
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
      total += (mark - pos.avgCost) * pos.qty;
    }
    return total;
  }

  private mark(market: Market, symbol: string, now: number): number | null {
    let best: number | null = null;
    for (const e of market.exchanges) {
      const q = e.quoteAsOf(symbol, now - this.latency(e.id));
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
      total += pos.qty * mark;
    }
    return total;
  }

  /** One tick. Delivers what has arrived, decides if it is time, and sends what is due. */
  step(now: number, market: Market, news: readonly Headline[], open: boolean): void {
    this.tickFills = [];
    this.receive(now);
    this.deliver(now, market);
    if (!open) return;
    if (now - this.lastDecision >= this.infra.computer.decisionEveryMs) {
      this.lastDecision = now;
      this.decide(now, market, news);
    }
  }

  private receive(now: number): void {
    for (const msg of this.inbound.pop(now)) {
      const order = this.orders.get(msg.localId);
      if (!order) continue;
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
        case 'rejected':
          order.status = 'rejected';
          break;
      }
    }
    this.trimOrders();
  }

  private book(order: OpenOrder, price: number, size: number, at: number, taker: boolean): void {
    order.filled += size;
    // Maker-taker: the order that crossed the spread pays the exchange; the one that was resting does not.
    const fee = taker ? Math.round(this.feeFor(order.exchange) * size) : 0;
    const pos = this.positions.get(order.symbol) ?? { qty: 0, avgCost: 0 };
    const signed = order.side === 'buy' ? size : -size;
    let realised = 0;
    if (pos.qty === 0 || Math.sign(pos.qty) === Math.sign(signed)) {
      pos.avgCost = (pos.avgCost * Math.abs(pos.qty) + price * size) / (Math.abs(pos.qty) + size);
      pos.qty += signed;
    } else {
      const closing = Math.min(Math.abs(pos.qty), size);
      realised = (price - pos.avgCost) * closing * Math.sign(pos.qty);
      pos.qty += signed;
      if (Math.sign(pos.qty) === Math.sign(signed)) pos.avgCost = price;
      if (pos.qty === 0) pos.avgCost = 0;
    }
    this.positions.set(order.symbol, pos);
    const mine = this.blockPositions.get(order.block) ?? new Map<string, number>();
    mine.set(order.symbol, (mine.get(order.symbol) ?? 0) + signed);
    this.blockPositions.set(order.block, mine);
    this.cash -= signed * price + fee;
    this.feesPaid += fee;
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
    for (const e of market.exchanges) {
      const seen = now - this.latency(e.id);
      const perSymbol: Record<string, SeenQuote> = {};
      for (const s of market.stocks) {
        const q = e.quoteAsOf(s.symbol, seen);
        if (q) perSymbol[s.symbol] = q;
      }
      quotes[e.id] = perSymbol;
    }
    const positions: Record<string, number> = {};
    for (const [symbol, pos] of this.positions) positions[symbol] = pos.qty;
    for (const s of market.stocks) {
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
      if (bestBid !== null && bestAsk !== null && bestAsk < bestBid && bidOn !== askOn) this.stats.gapsSeen++;
      if (bestBid !== null && bestAsk !== null) {
        const log = this.mids.get(s.symbol) ?? [];
        log.push((bestBid + bestAsk) / 2);
        if (log.length > MID_LOG) log.splice(0, log.length - MID_LOG);
        this.mids.set(s.symbol, log);
      }
    }
    const mids: Record<string, readonly number[]> = {};
    for (const [k, v] of this.mids) mids[k] = v;
    const blockPositions: Record<string, Record<string, number>> = {};
    for (const [block, bySymbol] of this.blockPositions) blockPositions[block] = Object.fromEntries(bySymbol);
    return {
      now,
      symbols: market.stocks.map((s) => s.symbol),
      exchanges: market.exchanges.map((e) => e.id),
      quotes,
      fees: this.feeTable,
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
      const block = blockById(setting.id);
      for (const intent of block.decide(view, setting.params)) this.send(intent, setting.id, now, view);
    }
  }

  private send(intent: Intent, block: string, now: number, view: MarketView): void {
    if (now - this.secondStarted >= MS_PER_SECOND) {
      this.secondStarted = now;
      this.ordersThisSecond = 0;
    }
    if (this.ordersThisSecond >= this.infra.computer.ordersPerSecond) {
      this.stats.ordersDropped++;
      return;
    }
    this.ordersThisSecond++;
    if (intent.kind === 'cancel') {
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
      status: 'inflight',
      block,
      sentAt: now,
      seenAt: view.quotes[intent.exchange]?.[intent.symbol]?.at ?? null,
      arrivedAt: null,
      ackAt: null,
      beatenBy: [],
    });
    this.stats.ordersSent++;
    const sent = this.outbound.push({ ...intent, localId }, now + this.latency(intent.exchange));
    if (!sent) {
      this.orders.get(localId)!.status = 'rejected';
      this.stats.ordersDropped++;
    }
  }

  /** Messages that have reached their exchange act on it now; the answer starts its way back. */
  private deliver(now: number, market: Market): void {
    for (const msg of this.outbound.pop(now)) {
      const exchange = market.exchange(msg.exchange);
      const back = now + this.latency(msg.exchange);
      if (msg.kind === 'cancel') {
        exchange.cancel(msg.symbol, msg.exchangeOrderId);
        this.inbound.push({ kind: 'cancelled', localId: msg.localId }, back);
        continue;
      }
      const mine = this.orders.get(msg.localId);
      // Before the order goes in, read who took the quote it was sent for since the firm saw it.
      const beatenBy =
        mine && mine.seenAt !== null ? exchange.takersSince(msg.symbol, mine.seenAt, msg.side, msg.price, this.id) : [];
      const { order } = exchange.submit(
        msg.symbol,
        { owner: this.id, side: msg.side, price: msg.price, size: msg.size, ioc: msg.ioc },
        now,
      );
      // The exchange's own trades for this order come back through onTrade, like any other fill.
      this.inbound.push(
        {
          kind: 'ack',
          localId: msg.localId,
          exchangeOrderId: order.id,
          remaining: order.remaining,
          resting: order.remaining > 0 && !order.ioc,
          arrivedAt: now,
          beatenBy,
        },
        back,
      );
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
      orders: [...this.orders.values()],
      fills: this.fills,
      mids: Object.fromEntries(this.mids),
      nextLocalId: this.nextLocalId,
      nextFillSeq: this.nextFillSeq,
      lastDecision: Number.isFinite(this.lastDecision) ? this.lastDecision : null,
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
    for (const o of s.orders) f.orders.set(o.localId, { ...o });
    f.fills = s.fills.map((x) => ({ ...x }));
    for (const [k, v] of Object.entries(s.mids)) f.mids.set(k, [...v]);
    f.nextLocalId = s.nextLocalId;
    f.nextFillSeq = s.nextFillSeq;
    f.lastDecision = s.lastDecision === null ? -Infinity : s.lastDecision;
    f.secondStarted = s.secondStarted === null ? -Infinity : s.secondStarted;
    f.ordersThisSecond = s.ordersThisSecond;
    // A save from before the count has none; it starts at nought.
    f.stats = { ...s.stats, gapsSeen: Number(s.stats.gapsSeen) || 0 };
    f.outbound = new DelayQueue(s.outbound.map((d) => ({ ...d })));
    f.inbound = new DelayQueue(s.inbound.map((d) => ({ ...d })));
    return f;
  }
}
