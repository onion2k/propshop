// An exchange: one order book per stock, a crowd of background traders who keep each book alive, and its
// own slightly wrong idea of what each stock is worth. That last part is the whole game: two exchanges
// disagree by a cent for a few hundred milliseconds, and whoever is fastest gets paid for noticing.

import {
  OrderBook,
  type Level,
  type Order,
  type OrderRequest,
  type Quote,
  type SavedBook,
  type Side,
  type Trade,
} from './orderbook';

/** What an order met: matched, rested or refused; `lastLook` where the dealer refused it after its look. */
export type SubmitResult = ReturnType<OrderBook['add']> & { lastLook?: boolean };
import { MS_PER_DAY, activity as stockActivity, isMarketOpen, isWeekday, nextOpen as stockNextOpen } from './clock';
import { deskOf, tickOf } from './instrument';
import { activityIn, isOpenIn, nextOpenIn, type SessionSpec } from './session';
import type { Random } from './random';
import type { Indicative } from './strategy/types';
import { DEFAULT_RULES, type ExchangeRules, type ExchangeSpec, type FixFlow } from './types';

/** The owner tag for the background crowd, who are nobody in particular. */
export const BACKGROUND = 'bg';

/** The most orders a model quoter keeps on one side at one price: a taker's wear is topped up behind, up to this. */
export const MAX_QUOTER_ORDERS = 4;
/** Why a venue with hours of its own refused an order: it arrived while the venue was closed. */
export const REFUSED_CLOSED = 'market closed';
/** Why a venue refused an order or a cancel: it does not list the symbol, or no longer (an expired contract). */
export const REFUSED_UNLISTED = 'not listed here';
/** Why a venue in a fix's call refused an immediate-or-cancel order: nothing matches until the uncrossing. */
export const REFUSED_IN_FIX = 'in the fix: send a resting order';
/** How many fixes a venue keeps: two weeks of Thamesford's, two a weekday for each of its two metals. */
export const MAX_FIXES = 40;

/** A fix as the venue logs it: its time, the symbol, the one price and the volume, or no price where nothing crossed. */
export interface Fix {
  at: number;
  symbol: string;
  price: number | null;
  volume: number;
}
/** Why a dealer refused a fill it had looked at: its price moved against it in the hold. */
export function refusedByDealer(holdMs: number): string {
  return `refused by the dealer after ${holdMs} ms`;
}

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

/** One price on a side of the book as a reader sees it: no owner, only what rests there. */
export interface DepthLevel {
  price: number;
  size: number;
  /**
   * The biggest single order's size at the level (an iceberg's shown slice). Exchanges' direct feeds are order
   * by order, so a colocated firm sees this and not only the sum. Absent in a save from before it was kept.
   */
  largest?: number;
}

/** How many levels a side the quote log keeps for the depth a firm sees. */
export const DEPTH_LEVELS = 3;

export interface LoggedQuote extends Quote {
  at: number;
  /** The top DEPTH_LEVELS a side at that moment; absent in a save from before depth was kept. */
  depth?: { bids: DepthLevel[]; asks: DepthLevel[] };
  /** In a fix's call, where the book would uncross; absent outside one. */
  indicative?: Indicative;
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
  /** The instrument's own price grid; absent, the exchange's rule. Not saved: it comes from the content. */
  tickSize?: number;
  /** The units in one of the crowd's orders; absent, a hundred. Not saved: it comes from the content. */
  crowdLot?: number;
  /** In a call with clients' flow: what is coming for this fix, drawn as the call starts; gone at the fix. */
  flow?: FlowState;
}

/** The clients' order aimed at one fix: its side and size (none where nobody came), when it arrives, whether it has. */
export interface FlowState {
  fixAt: number;
  side: Side;
  size: number;
  at: number;
  sent: boolean;
}

export interface SavedExchange {
  stocks: Record<string, { book: SavedBook; belief: number; tape: Trade[]; quoteLog: LoggedQuote[]; flow?: FlowState }>;
  lastSweep: number;
  rules?: ExchangeRules;
  /** Its fixes, oldest first; absent where it has had none. */
  fixes?: Fix[];
}

export class Exchange {
  readonly spec: ExchangeSpec;
  readonly stocks = new Map<string, StockState>();
  /** The terms of each listed option (the contract's spec): what its customers' bias is read from. */
  private readonly terms = new Map<string, { right?: 'call' | 'put'; strike?: number; underlying?: string }>();
  /** The rules this exchange runs, settable from the lab. */
  rules: ExchangeRules = { ...DEFAULT_RULES };
  /**
   * Orders waiting for the next batch, where the exchange runs batches, and a dealer's held orders, each with the
   * moment its look ends and the price it met. Not saved, as a batch's are not. Bounded by what the firms send in
   * a hold or a batch, which their computers' orders a second bound.
   */
  private pending: {
    symbol: string;
    req: OrderRequest;
    at: number;
    resolve: (r: SubmitResult) => void;
    look?: { until: number; price: number };
  }[] = [];
  /** Trades made this tick, by anyone, for the game to route to their owners. */
  tickTrades: { symbol: string; trade: Trade }[] = [];
  /** The desk whose instruments it lists. */
  readonly desk: string;
  /** Its own hours; null keeps the stocks', worked out by the clock exactly as before sessions. */
  readonly session: SessionSpec | null;
  /** Whether it was open at the last step, so it closes its books on the tick its own session ends. Not saved. */
  wasOpen = false;
  /** Its fixes, oldest first, at most MAX_FIXES. */
  fixes: Fix[] = [];
  /** The last moment asked of `callAt`, and its answer: the clock's, so not saved. */
  private callAsked = Number.NaN;
  private callAnswer: number | null = null;
  constructor(
    spec: ExchangeSpec,
    symbols: {
      symbol: string;
      startPrice: number;
      constituents?: string[];
      tickSize?: number;
      crowdLot?: number;
      cross?: readonly [string, string];
    }[],
  ) {
    this.spec = spec;
    this.desk = deskOf(spec);
    this.session = spec.session ?? null;
    for (const s of symbols) {
      this.stocks.set(s.symbol, {
        book: new OrderBook(),
        // A cross is derived as an index is, and its crowd as slow to catch up.
        index: (s.constituents?.length ?? 0) > 0 || s.cross !== undefined,
        ...(s.tickSize === undefined ? {} : { tickSize: s.tickSize }),
        ...(s.crowdLot === undefined ? {} : { crowdLot: s.crowdLot }),
        belief: s.startPrice,
        tape: [],
        quoteLog: [],
      });
    }
  }

  get id(): string {
    return this.spec.id;
  }

  /** Whether it lists a symbol: an exchange has books for what it lists and no others. */
  lists(symbol: string): boolean {
    return this.stocks.has(symbol);
  }

  /** List an instrument from now: a new book, the crowd's belief at its fair value. */
  list(
    spec: {
      symbol: string;
      tickSize?: number;
      crowdLot?: number;
      right?: 'call' | 'put';
      strike?: number;
      underlying?: string;
    },
    fair: number,
  ): void {
    // An option's terms, for its customers' bias: the contract's own spec, so a strike restored from a save shows here
    // too. Kept apart from the book's state, whose shape every venue's loops read, and not saved: it comes from the
    // content when the contract is listed.
    if (spec.right !== undefined) this.terms.set(spec.symbol, spec);
    if (this.stocks.has(spec.symbol)) return;
    this.stocks.set(spec.symbol, {
      book: new OrderBook(),
      index: false,
      ...(spec.tickSize === undefined ? {} : { tickSize: spec.tickSize }),
      ...(spec.crowdLot === undefined ? {} : { crowdLot: spec.crowdLot }),
      belief: fair,
      tape: [],
      quoteLog: [],
    });
  }

  /** Stop listing a symbol: its book goes, and every order resting in it goes back to its owner. */
  delist(symbol: string): { symbol: string; owner: string; id: number }[] {
    const s = this.stocks.get(symbol);
    if (!s) return [];
    const gone: { symbol: string; owner: string; id: number }[] = [];
    for (const o of s.book.resting()) {
      if (o.owner !== BACKGROUND) gone.push({ symbol, owner: o.owner, id: o.id });
      s.book.cancel(o.id);
    }
    this.stocks.delete(symbol);
    this.terms.delete(symbol);
    this.pending = this.pending.filter((p) => p.symbol !== symbol);
    return gone;
  }

  isOpen(now: number): boolean {
    return this.session ? isOpenIn(this.session, now) : isMarketOpen(now);
  }

  /** How busy it is, nought to one, on its own hours. */
  activity(now: number): number {
    return this.session ? activityIn(this.session, now) : stockActivity(now);
  }

  /** The next moment it opens, strictly after now. */
  nextOpen(now: number): number {
    return this.session ? nextOpenIn(this.session, now) : stockNextOpen(now);
  }

  /**
   * The fix whose call is running now, as the moment it uncrosses, or null outside a call: from `at − callMs` up to
   * (not at) `at`, Monday to Friday, while the venue is open now and at `at`. Worked out from the clock alone, so a
   * save mid-call needs nothing of it.
   */
  callAt(now: number): number | null {
    const auctions = this.spec.auctions;
    if (!auctions) return null;
    if (now === this.callAsked) return this.callAnswer;
    const day = Math.floor(now / MS_PER_DAY);
    const time = now - day * MS_PER_DAY;
    let answer: number | null = null;
    if (isWeekday(day)) {
      for (const a of auctions) {
        if (time < a.at - a.callMs || time >= a.at) continue;
        const fixAt = day * MS_PER_DAY + a.at;
        if (this.isOpen(now) && this.isOpen(fixAt)) answer = fixAt;
        break;
      }
    }
    this.callAsked = now;
    this.callAnswer = answer;
    return answer;
  }

  /**
   * The fixes the tick ending at `now`, `dt` long, reached: each uncrosses every book at one price, its trades told to
   * their owners as any fill is, the whole of it one print on the tape, and the fix logged (no price where nothing
   * crossed). None on Saturday or Sunday, or where the venue is shut at the fix.
   */
  private fix(now: number, dt: number): void {
    for (const a of this.spec.auctions ?? []) {
      // Whether this tick passed `at` past some midnight: the fix is then that midnight plus `at`.
      const fixDay = Math.floor((now - a.at) / MS_PER_DAY);
      if (fixDay === Math.floor((now - dt - a.at) / MS_PER_DAY)) continue;
      const fixAt = fixDay * MS_PER_DAY + a.at;
      if (!isWeekday(fixDay) || !this.isOpen(fixAt)) continue;
      for (const [symbol, s] of this.stocks) {
        const u = s.book.uncross(s.belief, now, tickOf(s, this.rules.tickSize));
        delete s.flow;
        this.fixes.push({ at: fixAt, symbol, price: u?.price ?? null, volume: u?.volume ?? 0 });
        if (this.fixes.length > MAX_FIXES) this.fixes.shift();
        if (!u) continue;
        for (const trade of u.trades) this.tickTrades.push({ symbol, trade });
        // One print for the fix: its volume at its price. Its trades are told to their owners above; the tape is what
        // a reader sees, and a fix is one event, not a sweep through the book. It names no owner, and no race.
        s.tape.push({
          price: u.price,
          size: u.volume,
          at: now,
          buyId: -1,
          sellId: -1,
          buyer: '',
          seller: '',
          aggressor: u.trades[0]!.aggressor,
          cleared: false,
          fix: true,
        });
        if (s.tape.length > TAPE_LENGTH) s.tape.splice(0, s.tape.length - TAPE_LENGTH);
        this.tapeVersion.set(symbol, (this.tapeVersion.get(symbol) ?? 0) + 1);
      }
    }
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
   * The trades that had printed by a past moment, newest last and at most `limit`: the tape a firm that far
   * behind is reading. Owners are left off, as a tape leaves them.
   */
  tapeAsOf(
    symbol: string,
    at: number,
    limit: number,
  ): { price: number; size: number; aggressor: Side; at: number; cleared: boolean; fix?: true }[] {
    const tape = this.stock(symbol).tape;
    let end = tape.length;
    while (end > 0 && (tape[end - 1]?.at ?? 0) > at) end--;
    // The same answer is asked for every decision between two trades; keep it until the tape changes.
    const version = this.tapeVersion.get(symbol) ?? 0;
    const hit = this.printCache.get(symbol);
    if (hit && hit.version === version && hit.end === end && hit.limit === limit) return hit.prints;
    // Prints, not trades: one aggressor order's fills in one tick are summed into one entry. Direct feeds stamp
    // a sweep's trades identically, and a fast firm reads them as the single order they are.
    const prints: {
      price: number;
      size: number;
      aggressor: Side;
      at: number;
      notional: number;
      cleared: boolean;
      fix?: true;
    }[] = [];
    let lastId = -1;
    let i = end - 1;
    // Newest first, stopping once `limit` prints are made, so a long tape is not walked for a short answer.
    for (; i >= 0; i--) {
      const t = tape[i]!;
      const id = t.aggressor === 'buy' ? t.buyId : t.sellId;
      const first = prints[prints.length - 1];
      if (first && first.at === t.at && first.aggressor === t.aggressor && lastId === id) {
        first.size += t.size;
        first.notional += t.price * t.size;
      } else {
        if (prints.length === limit) break;
        const print: (typeof prints)[number] = {
          price: t.price,
          size: t.size,
          aggressor: t.aggressor,
          at: t.at,
          notional: t.price * t.size,
          cleared: t.cleared ?? false,
        };
        if (t.fix) print.fix = true;
        prints.push(print);
      }
      lastId = id;
    }
    const result = prints.reverse().map((x) => {
      const out: { price: number; size: number; aggressor: Side; at: number; cleared: boolean; fix?: true } = {
        price: Math.round(x.notional / x.size),
        size: x.size,
        aggressor: x.aggressor,
        at: x.at,
        cleared: x.cleared,
      };
      if (x.fix) out.fix = true;
      return out;
    });
    this.printCache.set(symbol, { version, end, limit, prints: result });
    return result;
  }

  /** Bumped whenever a symbol's tape changes; never saved. One cached answer per symbol, so it is bounded. */
  private tapeVersion = new Map<string, number>();
  private printCache = new Map<
    string,
    {
      version: number;
      end: number;
      limit: number;
      prints: { price: number; size: number; aggressor: Side; at: number; cleared: boolean; fix?: true }[];
    }
  >();

  /**
   * Who took liquidity on this side, at this price or better, since a moment: the firms that beat an order
   * sent for that quote. The tape is short, so this answers for the last few seconds only, which is plenty.
   */
  takersSince(symbol: string, since: number, side: 'buy' | 'sell', price: number, except: string) {
    const out: { owner: string; at: number; price: number; size: number }[] = [];
    // An order still in the wire when its contract was delisted (an option at the close) finds no tape: nobody beat it.
    const listed = this.stocks.get(symbol);
    if (!listed) return out;
    for (const t of listed.tape) {
      // A fix is no race: nobody took the liquidity first.
      if (t.at < since || t.aggressor !== side || t.fix) continue;
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
    const listed = this.stocks.get(symbol);
    if (!listed) return null;
    const log = listed.quoteLog;
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
    // A venue with fixes logs by its own path; every other venue exactly as before, at the same cost.
    if (this.spec.auctions) return this.logCalled(now);
    for (const s of this.stocks.values()) {
      if (!s.book.takeChanged()) continue;
      this.logQuote(s, now, undefined);
    }
  }

  /**
   * The quote log of a venue with fixes. In a fix's call each book publishes its indicative every tick, in its quote
   * log entry, so a firm sees it through its data latency as it sees the quote; after the call an entry without it.
   */
  private logCalled(now: number): void {
    const fixAt = this.callAt(now);
    for (const s of this.stocks.values()) {
      const changed = s.book.takeChanged();
      const indicative = fixAt === null ? undefined : indicativeOf(s, fixAt, this.rules.tickSize);
      if (!changed && sameIndicative(s.quoteLog[s.quoteLog.length - 1]?.indicative, indicative)) continue;
      this.logQuote(s, now, indicative);
    }
  }

  private logQuote(s: StockState, now: number, indicative: Indicative | undefined): void {
    const q = s.book.quote();
    const d = s.book.depth(DEPTH_LEVELS);
    const big = s.book.largestAt(DEPTH_LEVELS);
    const depth = {
      bids: d.bids.map((l, i) => levelOf(l, big.bids[i])),
      asks: d.asks.map((l, i) => levelOf(l, big.asks[i])),
    };
    const last = s.quoteLog[s.quoteLog.length - 1];
    // A tick on which nothing changed needs no entry: the last one still answers for it.
    if (
      last &&
      sameIndicative(last.indicative, indicative) &&
      sameDepth(last.depth, depth) &&
      last.bid === q.bid &&
      last.ask === q.ask &&
      last.bidSize === q.bidSize &&
      last.askSize === q.askSize &&
      last.bid2 === q.bid2 &&
      last.ask2 === q.ask2 &&
      last.bid2Size === q.bid2Size &&
      last.ask2Size === q.ask2Size
    ) {
      return;
    }
    const entry: LoggedQuote = { ...q, at: now, depth };
    if (indicative) entry.indicative = indicative;
    s.quoteLog.push(entry);
    // One off the front at a time: the engine drops a single element from the front without moving the rest.
    while (s.quoteLog.length > QUOTE_LOG_LENGTH) s.quoteLog.shift();
  }

  /**
   * An order from a firm or a bot. Trades are returned and also kept for routing. Under a batch rule the
   * order waits for the next batch, and the result comes through the callback when it matches.
   */
  submit(symbol: string, req: OrderRequest, now: number, done?: (r: SubmitResult) => void): SubmitResult | null {
    // A venue with hours of its own takes nothing while closed. A stock venue keeps its old behaviour, in which an
    // order still in the wire at the close rests in the emptied book. Nobody takes an order for what is not listed.
    const unlisted = !this.stocks.has(symbol);
    if (unlisted || (this.session && !isOpenIn(this.session, now))) {
      return this.refusal(req, now, unlisted ? REFUSED_UNLISTED : REFUSED_CLOSED);
    }
    const shaped = this.shape(this.stock(symbol), req);
    // In a fix's call nothing matches: a resting order rests, a firm's IOC is refused, the crowd's taker rests at its
    // limit. Ahead of a dealer's look and the lab's batch, which a venue with fixes does not run.
    if (this.spec.auctions && this.callAt(now) !== null) {
      if (shaped.ioc && req.owner !== BACKGROUND) return this.refusal(req, now, REFUSED_IN_FIX);
      return this.stock(symbol).book.place(shaped, now);
    }
    // A dealer looks at a firm's order that would take its price before it fills it; the crowd's it does not.
    const look = this.spec.lastLook;
    if (look && done && req.owner !== BACKGROUND && !shaped.postOnly) {
      const q = this.stock(symbol).book.quote();
      const touch = shaped.side === 'buy' ? q.ask : q.bid;
      if (touch !== null && (shaped.side === 'buy' ? shaped.price >= touch : shaped.price <= touch)) {
        this.pending.push({
          symbol,
          req: shaped,
          at: now,
          resolve: done,
          look: { until: now + look.holdMs, price: touch },
        });
        return null;
      }
    }
    if (this.rules.batchMs > 0 && done) {
      this.pending.push({ symbol, req: shaped, at: now, resolve: done });
      return null;
    }
    const result = this.addMarked(symbol, shaped, now);
    this.record(symbol, result.trades);
    return result;
  }

  /** An order refused as it arrived, matched against nothing. */
  private refusal(req: OrderRequest, now: number, reason: string): SubmitResult {
    const order = {
      id: -1,
      owner: req.owner,
      side: req.side,
      price: req.price,
      size: req.size,
      remaining: req.size,
      at: now,
      ioc: req.ioc ?? false,
      postOnly: req.postOnly ?? false,
      display: req.display ?? null,
      shown: 0,
    };
    return { order, trades: [], refused: reason };
  }

  /** How many orders the dealer is looking at now. */
  held(): number {
    let n = 0;
    for (const p of this.pending) if (p.look) n++;
    return n;
  }

  /**
   * The looks that have ended: each fills at the price it met, no further, unless the dealer's belief has moved
   * past that price, against it, by more than its `refuseTicks`; then it is refused, and no fill is told.
   */
  private release(now: number): void {
    const look = this.spec.lastLook;
    if (!look || !this.pending.some((p) => p.look && p.look.until <= now)) return;
    const due = this.pending.filter((p) => p.look && p.look.until <= now);
    this.pending = this.pending.filter((p) => !(p.look && p.look.until <= now));
    for (const p of due) {
      const s = this.stocks.get(p.symbol);
      const held = p.look!.price;
      if (!s || (this.session && !isOpenIn(this.session, now))) {
        p.resolve(this.refusal(p.req, now, s ? REFUSED_CLOSED : REFUSED_UNLISTED));
        continue;
      }
      const moved = p.req.side === 'buy' ? s.belief - held : held - s.belief;
      if (moved > look.refuseTicks * tickOf(s, this.rules.tickSize)) {
        p.resolve({ ...this.refusal(p.req, now, refusedByDealer(look.holdMs)), lastLook: true });
        continue;
      }
      const price = p.req.side === 'buy' ? Math.min(p.req.price, held) : Math.max(p.req.price, held);
      const result = this.addMarked(p.symbol, { ...p.req, price }, now);
      this.record(p.symbol, result.trades);
      p.resolve(result);
    }
  }

  /** A request as this exchange's rules make it: on the tick grid, and post-only only where honoured. */
  private shape(s: StockState, req: OrderRequest): OrderRequest {
    const tick = tickOf(s, this.rules.tickSize);
    const price = tick > 1 ? Math.max(tick, Math.round(req.price / tick) * tick) : req.price;
    return { ...req, price, postOnly: this.rules.postOnly ? req.postOnly : false };
  }

  /** A batch: every order that has waited matches now, in a shuffled order, so time of arrival counts for nothing. */
  private runBatch(now: number, random: Random): void {
    if (this.pending.length === 0) return;
    // A dealer's held orders wait out their look, not the batch.
    const batch = this.pending.filter((p) => !p.look);
    this.pending = this.pending.filter((p) => p.look);
    if (batch.length === 0) return;
    for (let i = batch.length - 1; i > 0; i--) {
      const j = random.int(0, i);
      [batch[i], batch[j]] = [batch[j]!, batch[i]!];
    }
    for (const b of batch) {
      const result = this.addMarked(b.symbol, b.req, now);
      this.record(b.symbol, result.trades);
      b.resolve(result);
    }
  }

  /** Cancel a resting order; refused, with the time left, where it has not rested long enough. */
  cancel(symbol: string, id: number, now = Infinity): { order: Order | null; refused: string | null } {
    if (!this.stocks.has(symbol)) return { order: null, refused: REFUSED_UNLISTED };
    const book = this.stock(symbol).book;
    const resting = book.resting().find((o) => o.id === id);
    if (resting && now - resting.at < this.rules.minRestMs) {
      return { order: null, refused: `must rest ${this.rules.minRestMs}ms` };
    }
    return { order: book.cancel(id), refused: null };
  }

  /** Match an order, marking its trades `cleared` where it took the whole of the best level it met. */
  private addMarked(symbol: string, req: OrderRequest, now: number) {
    const book = this.stock(symbol).book;
    const q = book.quote();
    const topPrice = req.side === 'buy' ? q.ask : q.bid;
    const topSize = req.side === 'buy' ? q.askSize : q.bidSize;
    const result = book.add(req, now);
    if (topPrice !== null && result.trades.length > 0) {
      const took = result.trades.reduce((n, t) => (t.price === topPrice ? n + t.size : n), 0);
      const cleared = took >= topSize;
      for (const t of result.trades) t.cleared = cleared;
    }
    return result;
  }

  private record(symbol: string, trades: Trade[]): void {
    if (trades.length === 0) return;
    const s = this.stock(symbol);
    for (const t of trades) {
      this.tickTrades.push({ symbol, trade: t });
      s.tape.push(t);
      this.tapeVersion.set(symbol, (this.tapeVersion.get(symbol) ?? 0) + 1);
    }
    if (s.tape.length > TAPE_LENGTH) s.tape.splice(0, s.tape.length - TAPE_LENGTH);
  }

  /**
   * One tick. The crowd's belief drifts toward the true fair value at the exchange's own pace with its own noise,
   * and the crowd quotes around that belief, pulls what is stale, and now and then crosses the spread.
   */
  step(
    now: number,
    dt: number,
    fair: ReadonlyMap<string, number>,
    activity: number,
    random: Random,
    halfSpreads?: ReadonlyMap<string, number>,
  ): void {
    this.tickTrades = [];
    if (this.pending.length > 0) this.release(now);
    if (this.rules.batchMs > 0 && Math.round(now / dt) % Math.max(1, Math.round(this.rules.batchMs / dt)) === 0) {
      this.runBatch(now, random);
    }
    if (this.spec.auctions) this.fix(now, dt);
    const inCall = this.spec.auctions ? this.callAt(now) !== null : false;
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
      if (activity <= 0) continue;
      if (this.spec.quoter)
        this.quoterTurn(symbol, s, now, span, activity, random, halfSpreads?.get(symbol), target, fair);
      else this.crowd(symbol, s, now, span, activity, random, sweep, inCall);
    }
  }

  /**
   * A model quoter's turn for one book, in place of the crowd's: the orders it rests on each side are found in the book
   * (so nothing is kept to save). The bid is the belief less the half-spread and the ask the belief plus it, each
   * rounded away from the belief to the grid, the ask at least a tick over the bid; no bid is posted at or under nought.
   * Each is tucked inside the best order of anyone else on the other side (a firm's, say), never across it, and it is
   * that price the side is kept at: a side whose price is held off the belief's by a firm's order is left alone, not
   * cancelled and posted again every turn. An order at any other price is cancelled. A side at its price keeps what
   * rests there while the total is at least half the quoter's size; a taker having worn it below that, the rest is
   * posted behind what is left (so the front of the queue is kept, and a fill is not lost to a re-post), never more
   * than `MAX_QUOTER_ORDERS` orders a side, past which the side is posted afresh. Then, with chance `takeRate` a
   * second (at full activity), a customer takes up to the quoter's size at the touch on a side, whoever rests there.
   * Draws one chance a turn, and a side and a size when a customer comes; nothing for a re-post. A book the market
   * has priced no half-spread for keeps what rests and is only taken from.
   */
  private quoterTurn(
    symbol: string,
    s: StockState,
    now: number,
    dt: number,
    activity: number,
    random: Random,
    half: number | undefined,
    target: number,
    fair: ReadonlyMap<string, number>,
  ): void {
    const quoter = this.spec.quoter!;
    const tick = tickOf(s, this.rules.tickSize);
    if (half !== undefined) {
      let bidP = Math.floor((s.belief - half) / tick) * tick;
      let askP = Math.max(Math.ceil((s.belief + half) / tick) * tick, bidP + tick);
      // Tucked inside the best order of anyone else on the far side: the price a side would be posted at.
      const otherAsk = s.book.bestOutside(BACKGROUND, 'sell');
      const otherBid = s.book.bestOutside(BACKGROUND, 'buy');
      if (otherAsk !== null) bidP = Math.min(bidP, otherAsk - tick);
      if (otherBid !== null) askP = Math.max(askP, otherBid + tick);
      this.quoterSide(symbol, s, 'buy', bidP, tick, now, quoter.size);
      this.quoterSide(symbol, s, 'sell', askP, tick, now, quoter.size);
    }
    if (quoter.takeRate > 0 && random.chance((quoter.takeRate * activity * dt) / 1000)) {
      const side = random.chance(this.buyShare(symbol, fair)) ? 'buy' : 'sell';
      const q = s.book.quote();
      const touch = side === 'buy' ? q.ask : q.bid;
      const size = random.int(1, quoter.orderSize ?? quoter.size);
      if (touch !== null) this.submit(symbol, { owner: BACKGROUND, side, price: touch, size, ioc: true }, now);
    }
    if (quoter.informed) this.informedTurn(symbol, s, now, dt, activity, random, target, tick, quoter.informed);
  }

  /**
   * The share of customers who buy an option: `buy.atm` at the money, drifting to `buy.otm` out of the money and
   * `buy.itm` in it over `buy.span` of the underlying (a put's own, `buy.puts`, where it is set). An even toss where the quoter has no bias set or the book is
   * not an option.
   */
  private buyShare(symbol: string, fair: ReadonlyMap<string, number>): number {
    const buy = this.spec.quoter?.buy;
    const o = this.terms.get(symbol);
    if (!buy || o?.right === undefined || o.strike === undefined || o.underlying === undefined) return 0.5;
    const under = fair.get(o.underlying);
    if (under === undefined || under <= 0) return buy.atm;
    const out = (o.right === 'call' ? o.strike - under : under - o.strike) / under;
    const w = Math.min(1, Math.abs(out) / buy.span);
    const shares = o.right === 'put' && buy.puts ? buy.puts : buy;
    return shares.atm + ((out > 0 ? shares.otm : shares.itm) - shares.atm) * w;
  }

  /**
   * The informed customers: they know the fair value, so where it is `ticks` ticks or more over the ask they buy, and
   * where it is that far under the bid they sell, at the touch, up to `size`, with chance `rate` a second at full
   * activity. Draws only while a touch is mispriced that far (a chance, then a size when one comes).
   */
  private informedTurn(
    symbol: string,
    s: StockState,
    now: number,
    dt: number,
    activity: number,
    random: Random,
    target: number,
    tick: number,
    informed: NonNullable<NonNullable<ExchangeSpec['quoter']>['informed']>,
  ): void {
    // Runs every turn for every option book, so it reads the two best prices and nothing else.
    const margin = informed.ticks * tick;
    const ask = s.book.bestPrice('sell');
    const bid = s.book.bestPrice('buy');
    let side: Side | null = null;
    if (ask !== null && target - ask >= margin) side = 'buy';
    else if (bid !== null && bid - target >= margin) side = 'sell';
    if (side === null || !random.chance((informed.rate * activity * dt) / 1000)) return;
    const touch = side === 'buy' ? ask : bid;
    const size = random.int(1, informed.size);
    if (touch !== null) this.submit(symbol, { owner: BACKGROUND, side, price: touch, size, ioc: true }, now);
  }

  /** One side of the quoter's book, kept at `price` (none at or under nought): see `quoterTurn`. */
  private quoterSide(
    symbol: string,
    s: StockState,
    side: Side,
    price: number,
    tick: number,
    now: number,
    size: number,
  ) {
    const have = s.book.tally(BACKGROUND, side, price > 0 ? price : -1);
    if (have.orders === 0 && have.elsewhere === 0 && price <= 0) return;
    // An order at any other price is cancelled, and every one where there is no price to post at.
    if (have.elsewhere > 0 || price <= 0) s.book.cancelOwned(BACKGROUND, side, price > 0 ? price : null);
    if (price <= 0) return;
    let total = have.remaining;
    if (have.orders >= MAX_QUOTER_ORDERS) {
      // Too many small orders: start the side again.
      s.book.cancelOwned(BACKGROUND, side, null);
      total = 0;
    }
    if (total * 2 >= size) return;
    this.quoteAt(symbol, s, side, price, tick, now, size - total);
  }

  /** One quoter order, tucked inside the other side's touch (a firm's order, say) rather than across it. */
  private quoteAt(symbol: string, s: StockState, side: Side, price: number, tick: number, now: number, size: number) {
    const q = s.book.quote();
    if (side === 'buy' && q.ask !== null) price = Math.min(price, q.ask - tick);
    if (side === 'sell' && q.bid !== null) price = Math.max(price, q.bid + tick);
    if (price <= 0) return;
    const result = this.addMarked(symbol, { owner: BACKGROUND, side, price, size }, now);
    this.record(symbol, result.trades);
  }

  private crowd(
    symbol: string,
    s: StockState,
    now: number,
    dt: number,
    activity: number,
    random: Random,
    sweep: boolean,
    inCall = false,
  ) {
    const scale = dt / REFERENCE_DT;
    const tick = tickOf(s, this.rules.tickSize);
    if (inCall) this.clients(s, now, tick, random);
    const bidCenter = Math.floor(s.belief / tick) * tick;
    const askCenter = bidCenter + tick;
    // How many crowd orders rest near the touch on each side: a bounded walk, since this runs every tick.
    // The crowd's distances count in the instrument's own grid where it has one; a stock's are cents, as before.
    const unit = s.tickSize ?? 1;
    const bids = s.book.countNear('buy', bidCenter - PLACEMENT_RANGE * unit);
    const asks = s.book.countNear('sell', askCenter + PLACEMENT_RANGE * unit);
    // Replenish toward the target depth, faster when the book is thin, slower when the day is quiet.
    const rate = (0.15 + 0.85 * activity) * scale;
    if (bids < TARGET_DEPTH && random.chance(rate * (1 - bids / TARGET_DEPTH) * 2)) {
      this.post(symbol, s, 'buy', bidCenter - this.offset(random) * tick, now, random, inCall);
    }
    if (asks < TARGET_DEPTH && random.chance(rate * (1 - asks / TARGET_DEPTH) * 2)) {
      this.post(symbol, s, 'sell', askCenter + this.offset(random) * tick, now, random, inCall);
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
        const lot = s.crowdLot ?? 100;
        const size = impatient ? lot * random.int(3, 10) : lot * random.int(1, 3);
        // A cheap instrument's taker can walk through nought; its order is not sent (everything above is drawn first).
        if (price > 0) this.submit(symbol, { owner: BACKGROUND, side, price, size, ioc: true }, now);
      }
    }
    if (sweep) {
      // A quote now on the wrong side of what the crowd believes is pulled, most of them within a few sweeps.
      // That window is the arbitrage: a firm fast enough to hit the quote before its owner pulls it. In a fix's call
      // the crowd's takers rest across the belief on purpose, and stay for the uncrossing.
      s.book.cancelWhere(BACKGROUND, (o) => {
        const wrongSide = !inCall && (o.side === 'buy' ? o.price > s.belief : o.price < s.belief);
        if (wrongSide && random.chance(PULL_SHARE)) return true;
        return (
          Math.abs(o.price - s.belief) > STALE_DISTANCE * unit || (now - o.at > 3000 && random.chance(0.1 * scale))
        );
      });
    }
  }

  /**
   * The clients' order aimed at the fix whose call is running, where the venue's auction has `flow`: drawn on the
   * book's first crowd turn in the call, from the venue's own stream, and rested once its moment comes, priced through
   * the belief so it joins the uncrossing. Nothing is drawn on a venue without flow, or outside a call.
   */
  private clients(s: StockState, now: number, tick: number, random: Random): void {
    const fixAt = this.callAt(now);
    if (fixAt === null) return;
    if (s.flow?.fixAt !== fixAt) {
      const flow = this.flowFor(fixAt);
      if (!flow) return;
      const comes = random.chance(flow.chance);
      const side: Side = random.chance(0.5) ? 'buy' : 'sell';
      const u = random.next();
      const lots = Math.round(flow.lots[0] + (flow.lots[1] - flow.lots[0]) * u * u);
      const at = fixAt - flow.withinMs * random.next();
      s.flow = { fixAt, side, size: comes ? lots * (s.crowdLot ?? 100) : 0, at, sent: !comes };
    }
    const f = s.flow;
    if (f.sent || now < f.at) return;
    f.sent = true;
    const reach = (this.flowFor(fixAt)?.reach ?? 0) * tick;
    const price =
      f.side === 'buy' ? Math.floor(s.belief / tick) * tick + reach : Math.ceil(s.belief / tick) * tick - reach;
    if (price > 0 && f.size > 0) s.book.place({ owner: BACKGROUND, side: f.side, price, size: f.size }, now);
  }

  /** The clients' flow of the auction that fixes at `fixAt`, if it has any. */
  private flowFor(fixAt: number): FixFlow | undefined {
    const time = fixAt - Math.floor(fixAt / MS_PER_DAY) * MS_PER_DAY;
    return this.spec.auctions?.find((a) => a.at === time)?.flow;
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
  private post(
    symbol: string,
    s: StockState,
    side: 'buy' | 'sell',
    price: number,
    now: number,
    random: Random,
    inCall = false,
  ) {
    // In a fix's call nothing crosses, so the crowd quotes about its belief, whatever rests across it.
    if (inCall) {
      if (price > 0)
        s.book.place({ owner: BACKGROUND, side, price, size: (s.crowdLot ?? 100) * random.int(1, 5) }, now);
      return;
    }
    const q = s.book.quote();
    const tick = this.rules.tickSize;
    if (side === 'buy' && q.ask !== null) price = Math.min(price, q.ask - tick);
    if (side === 'sell' && q.bid !== null) price = Math.max(price, q.bid + tick);
    if (price <= 0) return;
    const size = (s.crowdLot ?? 100) * random.int(1, 5);
    const result = this.addMarked(symbol, { owner: BACKGROUND, side, price, size }, now);
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
      stocks[symbol] = {
        book: s.book.save(),
        belief: s.belief,
        tape: s.tape,
        quoteLog: s.quoteLog,
        ...(s.flow ? { flow: { ...s.flow } } : {}),
      };
    }
    return { stocks, lastSweep: 0, rules: this.rules, ...(this.fixes.length > 0 ? { fixes: this.fixes } : {}) };
  }

  load(saved: SavedExchange): void {
    if (saved.rules) this.rules = { ...DEFAULT_RULES, ...saved.rules };
    this.pending = [];
    this.fixes = (saved.fixes ?? []).map((f) => ({ ...f }));
    for (const [symbol, s] of Object.entries(saved.stocks)) {
      const built = this.stocks.get(symbol);
      this.stocks.set(symbol, {
        book: OrderBook.load(s.book),
        index: built?.index ?? false,
        ...(built?.tickSize === undefined ? {} : { tickSize: built.tickSize }),
        ...(built?.crowdLot === undefined ? {} : { crowdLot: built.crowdLot }),
        ...(s.flow ? { flow: { ...s.flow } } : {}),
        belief: s.belief,
        tape: s.tape.map((t) => ({ ...t })),
        quoteLog: s.quoteLog.map((q) => ({ ...q })),
      });
    }
  }
}

function levelOf(l: Level, largest = l.size): DepthLevel {
  return { price: l.price, size: l.size, largest };
}

function sameDepth(a: LoggedQuote['depth'], b: NonNullable<LoggedQuote['depth']>): boolean {
  if (!a) return false;
  const same = (x: DepthLevel[], y: DepthLevel[]) =>
    x.length === y.length &&
    x.every((l, i) => l.price === y[i]!.price && l.size === y[i]!.size && l.largest === y[i]!.largest);
  return same(a.bids, b.bids) && same(a.asks, b.asks);
}

/** A book's indicative in a call: where it would uncross now, on its grid, by the crowd's belief. */
function indicativeOf(s: StockState, fixAt: number, ruleTick: number): Indicative {
  const u = s.book.indicative(s.belief, tickOf(s, ruleTick));
  return { price: u?.price ?? null, volume: u?.volume ?? 0, fixAt };
}

function sameIndicative(a: Indicative | undefined, b: Indicative | undefined): boolean {
  if (!a || !b) return a === b;
  return a.price === b.price && a.volume === b.volume && a.fixAt === b.fixAt;
}
