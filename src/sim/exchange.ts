// An exchange: one order book per stock, a crowd of background traders who keep each book alive, and its
// own slightly wrong idea of what each stock is worth. That last part is the whole game: two exchanges
// disagree by a cent for a few hundred milliseconds, and whoever is fastest gets paid for noticing.

import { OrderBook, type Order, type OrderRequest, type Quote, type SavedBook, type Trade } from './orderbook';

export type SubmitResult = ReturnType<OrderBook['add']>;
import type { Random } from './random';
import { DEFAULT_RULES, type ExchangeRules, type ExchangeSpec } from './types';

/** The owner tag for the background crowd, who are nobody in particular. */
export const BACKGROUND = 'bg';

/** How many resting orders the background crowd aims to keep on each side of each book. */
const TARGET_DEPTH = 24;
/** How far from the believed price, in cents, background orders are placed. */
const PLACEMENT_RANGE = 6;
/** A background order further than this from the believed price is pulled. */
const STALE_DISTANCE = 8;
/** Each turn pulls this share of the orders now on the wrong side of the belief. With the turn's length it sets
    how long a mispriced quote survives, which is how long an arbitrage lasts. */
const PULL_SHARE = 0.4;
/** The crowd's chances are written per this many ms, and scaled to the tick. */
const REFERENCE_DT = 10;
/** How many recent trades each book keeps for the tape. */
const TAPE_LENGTH = 40;
/** How many times slower an index's crowd is to catch up than a stock's. */
const INDEX_LAG = 4;
/** How many ticks of quotes each book remembers, so a slow firm can be shown the past it is seeing. */
const QUOTE_LOG_LENGTH = 400;

export interface LoggedQuote extends Quote {
  at: number;
}

export interface StockState {
  book: OrderBook;
  /** An index over other symbols. */
  index: boolean;
  /** What this exchange's crowd currently believes the stock is worth, in cents, a float. */
  belief: number;
  tape: Trade[];
  /** The quote at the end of each recent tick, oldest first. */
  quoteLog: LoggedQuote[];
}

export interface SavedExchange {
  stocks: Record<string, { book: SavedBook; belief: number; tape: Trade[]; quoteLog: LoggedQuote[] }>;
  lastSweep: number;
  rules?: ExchangeRules;
}

export class Exchange {
  readonly spec: ExchangeSpec;
  readonly stocks = new Map<string, StockState>();
  /** The rules this exchange runs, settable from the lab. */
  rules: ExchangeRules = { ...DEFAULT_RULES };
  /** Orders waiting for the next batch, where the exchange runs batches. */
  private pending: { symbol: string; req: OrderRequest; at: number; resolve: (r: SubmitResult) => void }[] = [];
  /** Trades made this tick, by anyone, for the game to route to their owners. */
  tickTrades: { symbol: string; trade: Trade }[] = [];

  constructor(spec: ExchangeSpec, symbols: { symbol: string; startPrice: number; constituents?: string[] }[]) {
    this.spec = spec;
    for (const s of symbols) {
      this.stocks.set(s.symbol, {
        book: new OrderBook(),
        index: (s.constituents?.length ?? 0) > 0,
        belief: s.startPrice,
        tape: [],
        quoteLog: [],
      });
    }
  }

  get id(): string {
    return this.spec.id;
  }

  private stock(symbol: string): StockState {
    const s = this.stocks.get(symbol);
    if (!s) throw new Error(`${this.spec.id} does not list ${symbol}`);
    return s;
  }

  quote(symbol: string): Quote {
    return this.stock(symbol).book.quote();
  }

  book(symbol: string): OrderBook {
    return this.stock(symbol).book;
  }

  /**
   * Who took liquidity on this side, at this price or better, since a moment: the firms that beat an order
   * sent for that quote. The tape is short, so this answers for the last few seconds only, which is plenty.
   */
  takersSince(symbol: string, since: number, side: 'buy' | 'sell', price: number, except: string) {
    const out: { owner: string; at: number; price: number; size: number }[] = [];
    for (const t of this.stock(symbol).tape) {
      if (t.at < since || t.aggressor !== side) continue;
      const better = side === 'buy' ? t.price <= price : t.price >= price;
      if (!better) continue;
      const owner = side === 'buy' ? t.buyer : t.seller;
      if (owner === except) continue;
      out.push({ owner, at: t.at, price: t.price, size: t.size });
    }
    return out.slice(-3);
  }

  /** The quote as it stood at a past moment: what a firm that far behind is looking at. */
  quoteAsOf(symbol: string, at: number): LoggedQuote | null {
    const log = this.stock(symbol).quoteLog;
    for (let i = log.length - 1; i >= 0; i--) {
      const q = log[i];
      if (q && q.at <= at) return q;
    }
    return null;
  }

  /**
   * Called at the end of every tick, once everyone has acted, so the log holds the tick's closing quote. Only a
   * book that something touched is looked at: the rest cannot have moved, and this runs for every book every tick.
   */
  logQuotes(now: number): void {
    for (const s of this.stocks.values()) {
      if (!s.book.takeChanged()) continue;
      const q = s.book.quote();
      const last = s.quoteLog[s.quoteLog.length - 1];
      // A tick on which nothing changed needs no entry: the last one still answers for it.
      if (
        last &&
        last.bid === q.bid &&
        last.ask === q.ask &&
        last.bidSize === q.bidSize &&
        last.askSize === q.askSize &&
        last.bid2 === q.bid2 &&
        last.ask2 === q.ask2 &&
        last.bid2Size === q.bid2Size &&
        last.ask2Size === q.ask2Size
      ) {
        continue;
      }
      s.quoteLog.push({ ...q, at: now });
      if (s.quoteLog.length > QUOTE_LOG_LENGTH) s.quoteLog.splice(0, s.quoteLog.length - QUOTE_LOG_LENGTH);
    }
  }

  /**
   * An order from a firm or a bot. Trades are returned and also kept for routing. Under a batch rule the
   * order waits for the next batch, and the result comes through the callback when it matches.
   */
  submit(symbol: string, req: OrderRequest, now: number, done?: (r: SubmitResult) => void): SubmitResult | null {
    const shaped = this.shape(req);
    if (this.rules.batchMs > 0 && done) {
      this.pending.push({ symbol, req: shaped, at: now, resolve: done });
      return null;
    }
    const result = this.stock(symbol).book.add(shaped, now);
    this.record(symbol, result.trades);
    return result;
  }

  /** A request as this exchange's rules make it: on the tick grid, and post-only only where honoured. */
  private shape(req: OrderRequest): OrderRequest {
    const tick = this.rules.tickSize;
    const price = tick > 1 ? Math.max(tick, Math.round(req.price / tick) * tick) : req.price;
    return { ...req, price, postOnly: this.rules.postOnly ? req.postOnly : false };
  }

  /** A batch: every order that has waited matches now, in a shuffled order, so time of arrival counts for nothing. */
  private runBatch(now: number, random: Random): void {
    if (this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];
    for (let i = batch.length - 1; i > 0; i--) {
      const j = random.int(0, i);
      [batch[i], batch[j]] = [batch[j]!, batch[i]!];
    }
    for (const b of batch) {
      const result = this.stock(b.symbol).book.add(b.req, now);
      this.record(b.symbol, result.trades);
      b.resolve(result);
    }
  }

  /** Cancel a resting order; refused, with the time left, where it has not rested long enough. */
  cancel(symbol: string, id: number, now = Infinity): { order: Order | null; refused: string | null } {
    const book = this.stock(symbol).book;
    const resting = book.resting().find((o) => o.id === id);
    if (resting && now - resting.at < this.rules.minRestMs) {
      return { order: null, refused: `must rest ${this.rules.minRestMs}ms` };
    }
    return { order: book.cancel(id), refused: null };
  }

  private record(symbol: string, trades: Trade[]): void {
    if (trades.length === 0) return;
    const s = this.stock(symbol);
    for (const t of trades) {
      this.tickTrades.push({ symbol, trade: t });
      s.tape.push(t);
    }
    if (s.tape.length > TAPE_LENGTH) s.tape.splice(0, s.tape.length - TAPE_LENGTH);
  }

  /**
   * One tick. The crowd's belief drifts toward the true fair value at the exchange's own pace with its own noise,
   * and the crowd quotes around that belief, pulls what is stale, and now and then crosses the spread.
   */
  step(now: number, dt: number, fair: ReadonlyMap<string, number>, activity: number, random: Random): void {
    this.tickTrades = [];
    if (this.rules.batchMs > 0 && Math.round(now / dt) % Math.max(1, Math.round(this.rules.batchMs / dt)) === 0) {
      this.runBatch(now, random);
    }
    // The crowd's own pace is REFERENCE_DT; each book takes its turn once in that many ticks, staggered, so a
    // tick costs a fifth of what every book acting every tick would, and nothing about the crowd changes. A
    // turn is a sweep as well: the sweep's own period is the same, and a sweep keyed to the exchange's clock
    // once left four books in five never swept, which was free money for everyone.
    const turns = Math.max(1, Math.round(REFERENCE_DT / dt));
    const sweep = true;
    const tick = Math.round(now / dt);
    let i = 0;
    for (const [symbol, s] of this.stocks) {
      const mine = (tick + i++) % turns === 0;
      if (!mine) continue;
      const span = dt * turns;
      const target = fair.get(symbol);
      if (target === undefined) continue;
      // An index is a derivative: its crowd learns from the basket, and is a few times slower to catch up than
      // the basket's own crowds are. That lag is what index arbitrage trades, and what keeps the index in line.
      const lag = this.spec.lag * (s.index ? INDEX_LAG : 1);
      const pull = Math.min(1, span / lag);
      s.belief += (target - s.belief) * pull + this.spec.noise * Math.sqrt(span / 1000) * random.normal();
      if (activity > 0) this.crowd(symbol, s, now, span, activity, random, sweep);
    }
  }

  private crowd(
    symbol: string,
    s: StockState,
    now: number,
    dt: number,
    activity: number,
    random: Random,
    sweep: boolean,
  ) {
    const scale = dt / REFERENCE_DT;
    const tick = this.rules.tickSize;
    const bidCenter = Math.floor(s.belief / tick) * tick;
    const askCenter = bidCenter + tick;
    // How many crowd orders rest near the touch on each side: a bounded walk, since this runs every tick.
    const bids = s.book.countNear('buy', bidCenter - PLACEMENT_RANGE);
    const asks = s.book.countNear('sell', askCenter + PLACEMENT_RANGE);
    // Replenish toward the target depth, faster when the book is thin, slower when the day is quiet.
    const rate = (0.15 + 0.85 * activity) * scale;
    if (bids < TARGET_DEPTH && random.chance(rate * (1 - bids / TARGET_DEPTH) * 2)) {
      this.post(symbol, s, 'buy', bidCenter - this.offset(random) * tick, now, random);
    }
    if (asks < TARGET_DEPTH && random.chance(rate * (1 - asks / TARGET_DEPTH) * 2)) {
      this.post(symbol, s, 'sell', askCenter + this.offset(random) * tick, now, random);
    }
    // Someone wants in or out and pays the spread for it: this is what prints a last price. Now and then they
    // want more than the touch holds and walk a few cents into the book, which is the flow a market maker lives on.
    if (random.chance(0.03 * activity * scale)) {
      const side = random.chance(0.5) ? 'buy' : 'sell';
      const q = s.book.quote();
      const touch = side === 'buy' ? q.ask : q.bid;
      if (touch !== null) {
        const impatient = random.chance(0.25);
        const reach = (impatient ? random.int(1, 4) : 0) * tick;
        const price = side === 'buy' ? touch + reach : touch - reach;
        const size = impatient ? 100 * random.int(3, 10) : 100 * random.int(1, 3);
        this.submit(symbol, { owner: BACKGROUND, side, price, size, ioc: true }, now);
      }
    }
    if (sweep) {
      // A quote now on the wrong side of what the crowd believes is pulled, most of them within a few sweeps.
      // That window is the arbitrage: a firm fast enough to hit the quote before its owner pulls it.
      s.book.cancelWhere(BACKGROUND, (o) => {
        const wrongSide = o.side === 'buy' ? o.price > s.belief : o.price < s.belief;
        if (wrongSide && random.chance(PULL_SHARE)) return true;
        return Math.abs(o.price - s.belief) > STALE_DISTANCE || (now - o.at > 3000 && random.chance(0.1 * scale));
      });
    }
  }

  /** Orders cluster near the touch and thin out with distance. */
  private offset(random: Random): number {
    const u = random.next();
    return Math.min(PLACEMENT_RANGE - 1, Math.floor(-Math.log(1 - u) * 1.5));
  }

  /**
   * The crowd's resting orders never cross the book: a trader who wants to trade now sends an aggressive order
   * (above), and one who is posting a quote tucks it inside the touch. Without this, every move in the crowd's
   * belief would run over whatever quotes were resting, and nobody could make a market.
   */
  private post(symbol: string, s: StockState, side: 'buy' | 'sell', price: number, now: number, random: Random) {
    const q = s.book.quote();
    const tick = this.rules.tickSize;
    if (side === 'buy' && q.ask !== null) price = Math.min(price, q.ask - tick);
    if (side === 'sell' && q.bid !== null) price = Math.max(price, q.bid + tick);
    if (price <= 0) return;
    const result = s.book.add({ owner: BACKGROUND, side, price, size: 100 * random.int(1, 5) }, now);
    this.record(symbol, result.trades);
  }

  /** The close: the crowd goes home and the books empty. Returns the orders of everyone else, for their owners. */
  close() {
    const others: { symbol: string; owner: string; id: number }[] = [];
    for (const [symbol, s] of this.stocks) {
      for (const o of s.book.resting()) {
        if (o.owner !== BACKGROUND) others.push({ symbol, owner: o.owner, id: o.id });
        s.book.cancel(o.id);
      }
    }
    return others;
  }

  save(): SavedExchange {
    const stocks: SavedExchange['stocks'] = {};
    for (const [symbol, s] of this.stocks) {
      stocks[symbol] = { book: s.book.save(), belief: s.belief, tape: s.tape, quoteLog: s.quoteLog };
    }
    return { stocks, lastSweep: 0, rules: this.rules };
  }

  load(saved: SavedExchange): void {
    if (saved.rules) this.rules = { ...DEFAULT_RULES, ...saved.rules };
    this.pending = [];
    for (const [symbol, s] of Object.entries(saved.stocks)) {
      this.stocks.set(symbol, {
        book: OrderBook.load(s.book),
        index: this.stocks.get(symbol)?.index ?? false,
        belief: s.belief,
        tape: s.tape.map((t) => ({ ...t })),
        quoteLog: s.quoteLog.map((q) => ({ ...q })),
      });
    }
  }
}
