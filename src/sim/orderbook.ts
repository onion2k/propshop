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
  /** Post-only: refused rather than matched if it would cross. */
  postOnly: boolean;
  /** Iceberg: at most this much of the remainder is shown; null shows it all. */
  display: number | null;
  /** What is shown right now, for an iceberg; equals remaining otherwise. */
  shown: number;
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
  /**
   * True when the aggressor's order took the whole of the best level on the far side as it stood before the
   * order was matched. Set by the exchange; absent in a save from before it was kept.
   */
  cleared?: boolean;
  /** Made at a call auction's uncrossing (the fix), where nobody crossed the spread. Absent otherwise. */
  fix?: true;
}

/**
 * Where a crossed book would uncross: the one price, the volume that trades there, and what was bid and offered at
 * that price or better (the larger of the two is the side left wanting).
 */
export interface Uncrossing {
  price: number;
  volume: number;
  buy: number;
  sell: number;
}

export interface Level {
  price: number;
  size: number;
  orders: number;
  /** The shares at this level that belong to the owner asked about, zero where none asked. */
  mine: number;
}

export interface Quote {
  bid: number | null;
  ask: number | null;
  bidSize: number;
  askSize: number;
  /** The second-best price and its size on each side, so a firm can see the touch without one order at it. */
  bid2: number | null;
  ask2: number | null;
  bid2Size: number;
  ask2Size: number;
}

export interface OrderRequest {
  owner: string;
  side: Side;
  price: number;
  size: number;
  ioc?: boolean;
  postOnly?: boolean;
  display?: number | null;
}

/** Why the book refused an order. */
export const REFUSED_CROSSED = 'would have crossed the spread';

/** The most orders one side may hold. Background traders cancel as they go; this is the safety net. */
export const MAX_RESTING_PER_SIDE = 400;

export class OrderBook {
  /** Bids highest first, asks lowest first; within a price, oldest first. */
  private bids: Order[] = [];
  private asks: Order[] = [];
  private nextId: number;
  lastPrice: number | null = null;
  /** Whether anything has rested, filled or left since the quote log last looked; a new or loaded book counts. */
  private changed = true;

  constructor(nextId = 1) {
    this.nextId = nextId;
  }

  /**
   * Add an order, matching what it can. Returns the order as it now stands, the trades it made, and why it
   * was refused if it was: a post-only order that would have crossed is refused with nothing done.
   */
  add(req: OrderRequest, at: number): { order: Order; trades: Trade[]; refused: string | null } {
    if (!Number.isInteger(req.price) || !Number.isInteger(req.size) || req.size <= 0 || req.price <= 0) {
      throw new Error(`Bad order: price ${req.price}, size ${req.size}`);
    }
    const display =
      req.display !== undefined && req.display !== null && req.display > 0 ? Math.min(req.display, req.size) : null;
    const order: Order = {
      id: this.nextId++,
      owner: req.owner,
      side: req.side,
      price: req.price,
      size: req.size,
      remaining: req.size,
      at,
      ioc: req.ioc ?? false,
      postOnly: req.postOnly ?? false,
      display,
      shown: display ?? req.size,
    };
    if (order.postOnly && this.wouldCross(order)) return { order, trades: [], refused: REFUSED_CROSSED };
    this.changed = true;
    const trades = this.match(order, at);
    if (order.remaining > 0 && !order.ioc) {
      order.shown = order.display === null ? order.remaining : Math.min(order.display, order.remaining);
      this.rest(order);
    }
    return { order, trades, refused: null };
  }

  /**
   * Rest an order without matching it, whatever it would cross: a call auction's book, which holds every order until
   * the uncrossing. An immediate-or-cancel order is the caller's to refuse or turn into a resting one first.
   */
  place(req: OrderRequest, at: number): { order: Order; trades: Trade[]; refused: string | null } {
    if (!Number.isInteger(req.price) || !Number.isInteger(req.size) || req.size <= 0 || req.price <= 0) {
      throw new Error(`Bad order: price ${req.price}, size ${req.size}`);
    }
    const display =
      req.display !== undefined && req.display !== null && req.display > 0 ? Math.min(req.display, req.size) : null;
    const order: Order = {
      id: this.nextId++,
      owner: req.owner,
      side: req.side,
      price: req.price,
      size: req.size,
      remaining: req.size,
      at,
      ioc: false,
      postOnly: req.postOnly ?? false,
      display,
      shown: display ?? req.size,
    };
    this.changed = true;
    this.rest(order);
    return { order, trades: [], refused: null };
  }

  /**
   * The uncrossing price the book would trade at now, or null where nothing crosses. Of the prices where the best bid
   * and the best ask overlap (each limit there, and the two prices of the `tick` grid either side of `belief`): the one
   * that trades the most; between equals, the one that leaves the least over; then the nearest `belief` (the crowd's);
   * then the lower. Volume and what is left over change only at a limit, so the grid prices by the belief are the only
   * others that can win. An iceberg counts its whole remainder. Walks the crossed part of each side once.
   */
  indicative(belief: number, tick = 1): Uncrossing | null {
    const top = this.bids[0];
    const low = this.asks[0];
    if (!top || !low || top.price < low.price) return null;
    // The candidate prices are the limits in the overlap, from the lowest ask to the highest bid.
    const prices: number[] = [];
    for (const o of this.asks) {
      if (o.price > top.price) break;
      if (prices[prices.length - 1] !== o.price) prices.push(o.price);
    }
    for (const o of this.bids) {
      if (o.price < low.price) break;
      prices.push(o.price);
    }
    const near = Math.floor(belief / tick) * tick;
    for (const p of [near, near + tick]) if (p >= low.price && p <= top.price) prices.push(p);
    prices.sort((a, b) => a - b);
    let best: Uncrossing | null = null;
    let bestDistance = Infinity;
    // Going up in price, what is offered at or below it grows and what is bid at or above it shrinks.
    let sell = 0;
    let ai = 0;
    let buy = 0;
    for (const o of this.bids) if (o.price >= low.price) buy += o.remaining;
    let bi = this.bids.length - 1;
    while (bi >= 0 && this.bids[bi]!.price < low.price) bi--;
    let last = -1;
    for (const p of prices) {
      if (p === last) continue;
      last = p;
      while (ai < this.asks.length && this.asks[ai]!.price <= p) sell += this.asks[ai++]!.remaining;
      while (bi >= 0 && this.bids[bi]!.price < p) buy -= this.bids[bi--]!.remaining;
      const volume = Math.min(buy, sell);
      if (volume <= 0) continue;
      const over = Math.abs(buy - sell);
      const distance = Math.abs(p - belief);
      const better =
        best === null ||
        volume > best.volume ||
        (volume === best.volume &&
          (over < Math.abs(best.buy - best.sell) ||
            (over === Math.abs(best.buy - best.sell) && distance < bestDistance)));
      if (better) {
        best = { price: p, volume, buy, sell };
        bestDistance = distance;
      }
    }
    return best;
  }

  /**
   * Uncross the book at its one price: every bid at or above it and every ask at or below, in price then time
   * priority, fill until the volume is traded, all at that price. The side left wanting is named the aggressor, though
   * nobody crossed: the trades say `fix`. Returns null, and leaves the book as it was, where nothing crosses. What is
   * left does not cross: the price that trades the most leaves no bid above an ask.
   */
  uncross(belief: number, at: number, tick = 1): (Uncrossing & { trades: Trade[] }) | null {
    const u = this.indicative(belief, tick);
    if (!u) return null;
    const aggressor: Side = u.buy >= u.sell ? 'buy' : 'sell';
    const trades: Trade[] = [];
    let left = u.volume;
    let bi = 0;
    let ai = 0;
    while (left > 0) {
      const b = this.bids[bi]!;
      const a = this.asks[ai]!;
      const size = Math.min(left, b.remaining, a.remaining);
      left -= size;
      b.remaining -= size;
      a.remaining -= size;
      b.shown = Math.min(b.display ?? b.remaining, b.remaining);
      a.shown = Math.min(a.display ?? a.remaining, a.remaining);
      trades.push({
        price: u.price,
        size,
        at,
        buyId: b.id,
        sellId: a.id,
        buyer: b.owner,
        seller: a.owner,
        aggressor,
        cleared: false,
        fix: true,
      });
      if (b.remaining === 0) bi++;
      if (a.remaining === 0) ai++;
    }
    this.bids = this.bids.filter((o) => o.remaining > 0);
    this.asks = this.asks.filter((o) => o.remaining > 0);
    this.lastPrice = u.price;
    this.changed = true;
    return { ...u, trades };
  }

  private wouldCross(order: Order): boolean {
    const top = (order.side === 'buy' ? this.asks : this.bids)[0];
    if (!top) return false;
    return order.side === 'buy' ? top.price <= order.price : top.price >= order.price;
  }

  private match(order: Order, at: number): Trade[] {
    const trades: Trade[] = [];
    const opposite = order.side === 'buy' ? this.asks : this.bids;
    while (order.remaining > 0 && opposite.length > 0) {
      const top = opposite[0];
      if (!top) break;
      const crosses = order.side === 'buy' ? top.price <= order.price : top.price >= order.price;
      if (!crosses) break;
      // An iceberg gives up only its shown slice at a time; what is hidden waits its turn again.
      const size = Math.min(order.remaining, top.shown);
      order.remaining -= size;
      top.remaining -= size;
      top.shown -= size;
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
      if (top.remaining === 0) {
        opposite.shift();
      } else if (top.shown === 0) {
        // The shown slice is used up: a fresh one goes to the back of its price level, as a real iceberg does.
        opposite.shift();
        top.shown = Math.min(top.display ?? top.remaining, top.remaining);
        top.at = at;
        this.rest(top);
      }
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
        this.changed = true;
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
    if (gone.length > 0) this.changed = true;
    return gone;
  }

  /** Whether the book has changed since this was last asked, and clears it: so the quote log looks only where it must. */
  takeChanged(): boolean {
    const c = this.changed;
    this.changed = false;
    return c;
  }

  /** The best two levels of each side. Runs every tick for every book, so it walks the arrays once and allocates nothing but the result. */
  quote(): Quote {
    const b = twoLevels(this.bids);
    const a = twoLevels(this.asks);
    return {
      bid: b.p1,
      ask: a.p1,
      bidSize: b.s1,
      askSize: a.s1,
      bid2: b.p2,
      ask2: a.p2,
      bid2Size: b.s2,
      ask2Size: a.s2,
    };
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

  /** The biggest single shown order at each of the top levels of each side, in the order `depth` lists them. */
  largestAt(levels: number): { bids: number[]; asks: number[] } {
    const walk = (side: Order[]) => {
      const out: number[] = [];
      let price: number | null = null;
      for (const o of side) {
        if (o.price === price) {
          if (o.shown > out[out.length - 1]!) out[out.length - 1] = o.shown;
        } else {
          if (out.length === levels) break;
          price = o.price;
          out.push(o.shown);
        }
      }
      return out;
    };
    return { bids: walk(this.bids), asks: walk(this.asks) };
  }

  /** The top levels of each side, aggregated by price, for the ladder, with the owner's own shares marked. */
  depth(levels: number, owner?: string): { bids: Level[]; asks: Level[] } {
    return { bids: aggregate(this.bids, levels, owner), asks: aggregate(this.asks, levels, owner) };
  }

  /** How many orders rest on a side at prices no further from the touch than the limit. Walks until it is past. */
  countNear(side: Side, limit: number): number {
    const orders = side === 'buy' ? this.bids : this.asks;
    let n = 0;
    for (const o of orders) {
      if (side === 'buy' ? o.price < limit : o.price > limit) break;
      n++;
    }
    return n;
  }

  /** The owner's order nearest the touch on a side, or null: a walk from the touch that stops at the first. */
  firstOf(owner: string, side: Side): Order | null {
    for (const o of side === 'buy' ? this.bids : this.asks) if (o.owner === owner) return o;
    return null;
  }

  /**
   * What an owner has resting on a side, with the price `at` set apart: how much remains in its orders at that price, how
   * many orders that is, and how many it has at any other. Written into one object that the next call overwrites, so a
   * quoter that asks every turn allocates nothing.
   */
  tally(owner: string, side: Side, at: number): { remaining: number; orders: number; elsewhere: number } {
    const t = this.tallied;
    t.remaining = 0;
    t.orders = 0;
    t.elsewhere = 0;
    for (const o of side === 'buy' ? this.bids : this.asks) {
      if (o.owner !== owner) continue;
      if (o.price === at) {
        t.remaining += o.remaining;
        t.orders++;
      } else t.elsewhere++;
    }
    return t;
  }

  private readonly tallied = { remaining: 0, orders: 0, elsewhere: 0 };

  /** Cancel the owner's resting orders on a side, those at price `except` apart (all of them where `except` is null). */
  cancelOwned(owner: string, side: Side, except: number | null): void {
    const book = side === 'buy' ? this.bids : this.asks;
    for (let i = book.length - 1; i >= 0; i--) {
      const o = book[i]!;
      if (o.owner === owner && (except === null || o.price !== except)) {
        book.splice(i, 1);
        this.changed = true;
      }
    }
  }

  /** The best price on a side among the orders of anyone but `owner`, or null: where the book is without that owner. */
  bestOutside(owner: string, side: Side): number | null {
    for (const o of side === 'buy' ? this.bids : this.asks) if (o.owner !== owner) return o.price;
    return null;
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
    // A save from before post-only and icebergs has orders without those fields.
    const fill = (o: SavedOrder): Order => ({
      ...o,
      postOnly: o.postOnly ?? false,
      display: o.display ?? null,
      shown: o.shown ?? o.remaining,
    });
    b.bids = s.bids.map(fill);
    b.asks = s.asks.map(fill);
    b.lastPrice = s.lastPrice;
    return b;
  }
}

/** An order as saved; one from before post-only and icebergs lacks those fields. */
export type SavedOrder = Omit<Order, 'postOnly' | 'display' | 'shown'> &
  Partial<Pick<Order, 'postOnly' | 'display' | 'shown'>>;

export interface SavedBook {
  bids: SavedOrder[];
  asks: SavedOrder[];
  nextId: number;
  lastPrice: number | null;
}

function twoLevels(side: Order[]): { p1: number | null; s1: number; p2: number | null; s2: number } {
  const first = side[0];
  if (!first) return { p1: null, s1: 0, p2: null, s2: 0 };
  let s1 = 0;
  let i = 0;
  for (; i < side.length; i++) {
    const o = side[i];
    if (!o || o.price !== first.price) break;
    s1 += o.shown;
  }
  const second = side[i];
  if (!second) return { p1: first.price, s1, p2: null, s2: 0 };
  let s2 = 0;
  for (; i < side.length; i++) {
    const o = side[i];
    if (!o || o.price !== second.price) break;
    s2 += o.shown;
  }
  return { p1: first.price, s1, p2: second.price, s2 };
}

function aggregate(side: Order[], levels: number, owner?: string): Level[] {
  const out: Level[] = [];
  for (const o of side) {
    const mine = o.owner === owner ? o.shown : 0;
    const last = out[out.length - 1];
    if (last && last.price === o.price) {
      last.size += o.shown;
      last.orders += 1;
      last.mine += mine;
    } else {
      if (out.length === levels) break;
      out.push({ price: o.price, size: o.shown, orders: 1, mine });
    }
  }
  return out;
}
