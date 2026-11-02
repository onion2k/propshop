// A limit order book: resting orders on two sides, matched by price then time. This is the thing every
// exchange is built around, and the thing the player is learning to read. Prices are integer cents and sizes
// integer shares, so no money is ever lost to float rounding.

export type Side = 'buy' | 'sell';

export interface Order {
  id: number;
  owner: string;
  side: Side;
  /** Limit price in cents. */
  price: number;
  size: number;
  remaining: number;
  /** Simulated time the order reached the book. */
  at: number;
  /** Immediate or cancel: whatever does not fill at once is dropped rather than rested. */
  ioc: boolean;
}

export interface Trade {
  price: number;
  size: number;
  at: number;
  buyId: number;
  sellId: number;
  buyer: string;
  seller: string;
  /** The side that crossed the spread and caused the trade. */
  aggressor: Side;
}

export interface Level {
  price: number;
  size: number;
  orders: number;
}

export interface Quote {
  bid: number | null;
  ask: number | null;
  bidSize: number;
  askSize: number;
}

export interface OrderRequest {
  owner: string;
  side: Side;
  price: number;
  size: number;
  ioc?: boolean;
}

/** The most orders one side may hold. Background traders cancel as they go; this is the safety net. */
export const MAX_RESTING_PER_SIDE = 400;

export class OrderBook {
  /** Bids highest first, asks lowest first; within a price, oldest first. */
  private bids: Order[] = [];
  private asks: Order[] = [];
  private nextId: number;
  lastPrice: number | null = null;

  constructor(nextId = 1) {
    this.nextId = nextId;
  }

  /** Add an order, matching what it can. Returns the order as it now stands and the trades it made. */
  add(req: OrderRequest, at: number): { order: Order; trades: Trade[] } {
    if (!Number.isInteger(req.price) || !Number.isInteger(req.size) || req.size <= 0 || req.price <= 0) {
      throw new Error(`Bad order: price ${req.price}, size ${req.size}`);
    }
    const order: Order = {
      id: this.nextId++,
      owner: req.owner,
      side: req.side,
      price: req.price,
      size: req.size,
      remaining: req.size,
      at,
      ioc: req.ioc ?? false,
    };
    const trades = this.match(order, at);
    if (order.remaining > 0 && !order.ioc) this.rest(order);
    return { order, trades };
  }

  private match(order: Order, at: number): Trade[] {
    const trades: Trade[] = [];
    const opposite = order.side === 'buy' ? this.asks : this.bids;
    while (order.remaining > 0 && opposite.length > 0) {
      const top = opposite[0];
      if (!top) break;
      const crosses = order.side === 'buy' ? top.price <= order.price : top.price >= order.price;
      if (!crosses) break;
      const size = Math.min(order.remaining, top.remaining);
      order.remaining -= size;
      top.remaining -= size;
      this.lastPrice = top.price;
      trades.push({
        price: top.price,
        size,
        at,
        buyId: order.side === 'buy' ? order.id : top.id,
        sellId: order.side === 'buy' ? top.id : order.id,
        buyer: order.side === 'buy' ? order.owner : top.owner,
        seller: order.side === 'buy' ? top.owner : order.owner,
        aggressor: order.side,
      });
      if (top.remaining === 0) opposite.shift();
    }
    return trades;
  }

  private rest(order: Order): void {
    const side = order.side === 'buy' ? this.bids : this.asks;
    if (side.length >= MAX_RESTING_PER_SIDE) {
      // The book is full: the order furthest from the market is dropped to make room, which is what a real venue's
      // risk limits would do to the trader who is spraying it.
      side.pop();
    }
    // Insert after every order at a price at least as good, so time priority holds within a price.
    let i = side.length;
    while (i > 0) {
      const prev = side[i - 1];
      if (!prev) break;
      const better = order.side === 'buy' ? prev.price >= order.price : prev.price <= order.price;
      if (better) break;
      i--;
    }
    side.splice(i, 0, order);
  }

  cancel(id: number): Order | null {
    for (const side of [this.bids, this.asks]) {
      const i = side.findIndex((o) => o.id === id);
      if (i >= 0) {
        const [order] = side.splice(i, 1);
        return order ?? null;
      }
    }
    return null;
  }

  /** Cancel every resting order of an owner that the test says to; returns the orders cancelled. */
  cancelWhere(owner: string, test: (o: Order) => boolean): Order[] {
    const gone: Order[] = [];
    for (const side of [this.bids, this.asks]) {
      for (let i = side.length - 1; i >= 0; i--) {
        const o = side[i];
        if (o && o.owner === owner && test(o)) {
          side.splice(i, 1);
          gone.push(o);
        }
      }
    }
    return gone;
  }

  quote(): Quote {
    const bid = this.bids[0] ?? null;
    const ask = this.asks[0] ?? null;
    return {
      bid: bid ? bid.price : null,
      ask: ask ? ask.price : null,
      bidSize: bid ? this.sizeAt(this.bids, bid.price) : 0,
      askSize: ask ? this.sizeAt(this.asks, ask.price) : 0,
    };
  }

  private sizeAt(side: Order[], price: number): number {
    let size = 0;
    for (const o of side) {
      if (o.price !== price) break;
      size += o.remaining;
    }
    return size;
  }

  /** The spread in cents, or null when a side is empty. */
  spread(): number | null {
    const q = this.quote();
    return q.bid !== null && q.ask !== null ? q.ask - q.bid : null;
  }

  /** The midpoint in cents, or null when a side is empty. */
  mid(): number | null {
    const q = this.quote();
    return q.bid !== null && q.ask !== null ? (q.bid + q.ask) / 2 : null;
  }

  /** The top levels of each side, aggregated by price, for the ladder. */
  depth(levels: number): { bids: Level[]; asks: Level[] } {
    return { bids: aggregate(this.bids, levels), asks: aggregate(this.asks, levels) };
  }

  resting(owner?: string): Order[] {
    const all = [...this.bids, ...this.asks];
    return owner === undefined ? all : all.filter((o) => o.owner === owner);
  }

  count(): number {
    return this.bids.length + this.asks.length;
  }

  save(): SavedBook {
    return { bids: this.bids, asks: this.asks, nextId: this.nextId, lastPrice: this.lastPrice };
  }

  static load(s: SavedBook): OrderBook {
    const b = new OrderBook(s.nextId);
    b.bids = s.bids.map((o) => ({ ...o }));
    b.asks = s.asks.map((o) => ({ ...o }));
    b.lastPrice = s.lastPrice;
    return b;
  }
}

export interface SavedBook {
  bids: Order[];
  asks: Order[];
  nextId: number;
  lastPrice: number | null;
}

function aggregate(side: Order[], levels: number): Level[] {
  const out: Level[] = [];
  for (const o of side) {
    const last = out[out.length - 1];
    if (last && last.price === o.price) {
      last.size += o.remaining;
      last.orders += 1;
    } else {
      if (out.length === levels) break;
      out.push({ price: o.price, size: o.remaining, orders: 1 });
    }
  }
  return out;
}
