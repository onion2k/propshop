// An exchange: one order book per stock, a crowd of background traders who keep each book alive, and its
// own slightly wrong idea of what each stock is worth. That last part is the whole game: two exchanges
// disagree by a cent for a few hundred milliseconds, and whoever is fastest gets paid for noticing.

import { OrderBook, type OrderRequest, type Quote, type SavedBook, type Trade } from './orderbook';
import type { Random } from './random';
import type { ExchangeSpec } from './types';

/** The owner tag for the background crowd, who are nobody in particular. */
export const BACKGROUND = 'bg';

/** How many resting orders the background crowd aims to keep on each side of each book. */
const TARGET_DEPTH = 24;
/** How far from the believed price, in cents, background orders are placed. */
const PLACEMENT_RANGE = 6;
/** A background order further than this from the believed price is pulled. */
const STALE_DISTANCE = 8;
/** The sweep runs this often, in ms, and each sweep pulls this share of the orders now on the wrong side of the
    belief. Between them they set how long a mispriced quote survives, which is how long an arbitrage lasts. */
const SWEEP_EVERY = 10;
const PULL_SHARE = 0.4;
/** The crowd's chances are written per this many ms, and scaled to the tick. */
const REFERENCE_DT = 10;
/** How many recent trades each book keeps for the tape. */
const TAPE_LENGTH = 40;
/** How many ticks of quotes each book remembers, so a slow firm can be shown the past it is seeing. */
const QUOTE_LOG_LENGTH = 400;

export interface LoggedQuote extends Quote {
  at: number;
}

export interface StockState {
  book: OrderBook;
  /** What this exchange's crowd currently believes the stock is worth, in cents, a float. */
  belief: number;
  tape: Trade[];
  /** The quote at the end of each recent tick, oldest first. */
  quoteLog: LoggedQuote[];
}

export interface SavedExchange {
  stocks: Record<string, { book: SavedBook; belief: number; tape: Trade[]; quoteLog: LoggedQuote[] }>;
  lastSweep: number;
}

export class Exchange {
  readonly spec: ExchangeSpec;
  readonly stocks = new Map<string, StockState>();
  private lastSweep = 0;
  /** Trades made this tick, by anyone, for the game to route to their owners. */
  tickTrades: { symbol: string; trade: Trade }[] = [];

  constructor(spec: ExchangeSpec, symbols: { symbol: string; startPrice: number }[]) {
    this.spec = spec;
    for (const s of symbols) {
      this.stocks.set(s.symbol, { book: new OrderBook(), belief: s.startPrice, tape: [], quoteLog: [] });
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

  /** Called at the end of every tick, once everyone has acted, so the log holds the tick's closing quote. */
  logQuotes(now: number): void {
    for (const s of this.stocks.values()) {
      s.quoteLog.push({ ...s.book.quote(), at: now });
      if (s.quoteLog.length > QUOTE_LOG_LENGTH) s.quoteLog.splice(0, s.quoteLog.length - QUOTE_LOG_LENGTH);
    }
  }

  /** An order from a firm or a bot. Trades are returned and also kept for routing. */
  submit(symbol: string, req: OrderRequest, now: number) {
    const result = this.stock(symbol).book.add(req, now);
    this.record(symbol, result.trades);
    return result;
  }

  cancel(symbol: string, id: number) {
    return this.stock(symbol).book.cancel(id);
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
    const sweep = now - this.lastSweep >= SWEEP_EVERY;
    if (sweep) this.lastSweep = now;
    for (const [symbol, s] of this.stocks) {
      const target = fair.get(symbol);
      if (target === undefined) continue;
      const pull = Math.min(1, dt / this.spec.lag);
      s.belief += (target - s.belief) * pull + this.spec.noise * Math.sqrt(dt / 1000) * random.normal();
      if (activity > 0) this.crowd(symbol, s, now, dt, activity, random, sweep);
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
    const bidCenter = Math.floor(s.belief);
    const askCenter = bidCenter + 1;
    const depth = s.book.depth(PLACEMENT_RANGE + 1);
    const bids = depth.bids.reduce((n, l) => n + l.orders, 0);
    const asks = depth.asks.reduce((n, l) => n + l.orders, 0);
    // Replenish toward the target depth, faster when the book is thin, slower when the day is quiet.
    const rate = (0.15 + 0.85 * activity) * scale;
    if (bids < TARGET_DEPTH && random.chance(rate * (1 - bids / TARGET_DEPTH) * 2)) {
      this.post(symbol, s, 'buy', bidCenter - this.offset(random), now, random);
    }
    if (asks < TARGET_DEPTH && random.chance(rate * (1 - asks / TARGET_DEPTH) * 2)) {
      this.post(symbol, s, 'sell', askCenter + this.offset(random), now, random);
    }
    // Someone wants in or out and pays the spread for it: this is what prints a last price. Now and then they
    // want more than the touch holds and walk a few cents into the book, which is the flow a market maker lives on.
    if (random.chance(0.03 * activity * scale)) {
      const side = random.chance(0.5) ? 'buy' : 'sell';
      const q = s.book.quote();
      const touch = side === 'buy' ? q.ask : q.bid;
      if (touch !== null) {
        const impatient = random.chance(0.25);
        const reach = impatient ? random.int(1, 4) : 0;
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
    if (side === 'buy' && q.ask !== null) price = Math.min(price, q.ask - 1);
    if (side === 'sell' && q.bid !== null) price = Math.max(price, q.bid + 1);
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
    return { stocks, lastSweep: this.lastSweep };
  }

  load(saved: SavedExchange): void {
    for (const [symbol, s] of Object.entries(saved.stocks)) {
      this.stocks.set(symbol, {
        book: OrderBook.load(s.book),
        belief: s.belief,
        tape: s.tape.map((t) => ({ ...t })),
        quoteLog: s.quoteLog.map((q) => ({ ...q })),
      });
    }
    this.lastSweep = saved.lastSweep;
  }
}
