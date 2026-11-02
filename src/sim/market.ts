// The market: every stock's true fair value, and the exchanges that each chase it. Fair value wanders on its
// own and jumps when news lands; nobody trades at it directly, but every book is pulled toward it.

import { MS_PER_HOUR, MS_PER_SECOND, activity, isMarketOpen } from './clock';
import { Exchange, type SavedExchange } from './exchange';
import type { Random } from './random';
import type { ExchangeSpec, StockSpec } from './types';

/** How often, in ms, the history samples a price, and how many samples it keeps (fifteen minutes). */
export const HISTORY_EVERY = MS_PER_SECOND;
export const HISTORY_LENGTH = 900;

/** A move in fair value still being priced in: the anchor slides toward the new level over the window. */
export interface Impulse {
  symbol: string;
  /** Cents still to apply. */
  remaining: number;
  /** Cents per ms. */
  rate: number;
}

export interface HistoryPoint {
  at: number;
  /** Mid per exchange id, cents, or null when a side was empty. */
  mids: Record<string, number | null>;
  fair: number;
}

export interface SavedMarket {
  fair: Record<string, number>;
  anchor: Record<string, number>;
  impulses: Impulse[];
  exchanges: Record<string, SavedExchange>;
  history: Record<string, HistoryPoint[]>;
  lastSample: number;
}

export class Market {
  readonly stocks: readonly StockSpec[];
  readonly exchanges: Exchange[];
  /** True fair value per symbol, cents, a float. */
  readonly fair = new Map<string, number>();
  /** Where fair value is pulled back toward; news moves this. */
  readonly anchor = new Map<string, number>();
  private impulses: Impulse[] = [];
  readonly history = new Map<string, HistoryPoint[]>();
  private lastSample = -Infinity;
  private wasOpen = false;

  constructor(stocks: StockSpec[], exchanges: ExchangeSpec[]) {
    this.stocks = stocks;
    this.exchanges = exchanges.map((e) => new Exchange(e, stocks));
    for (const s of stocks) {
      this.fair.set(s.symbol, s.startPrice);
      this.anchor.set(s.symbol, s.startPrice);
      this.history.set(s.symbol, []);
    }
  }

  exchange(id: string): Exchange {
    const e = this.exchanges.find((x) => x.id === id);
    if (!e) throw new Error(`No exchange ${id}`);
    return e;
  }

  stock(symbol: string): StockSpec {
    const s = this.stocks.find((x) => x.symbol === symbol);
    if (!s) throw new Error(`No stock ${symbol}`);
    return s;
  }

  /** News: move the anchor by so many cents, spread over a window. */
  shock(symbol: string, cents: number, overMs: number): void {
    if (cents === 0) return;
    this.impulses.push({ symbol, remaining: cents, rate: cents / Math.max(1, overMs) });
  }

  /**
   * One tick. Returns whether the market just closed, so the game can tell its firms their orders are gone.
   */
  step(now: number, dt: number, random: Random): { closed: { symbol: string; owner: string; id: number }[] | null } {
    this.drift(dt, random);
    const open = isMarketOpen(now);
    const act = activity(now);
    for (const e of this.exchanges) e.step(now, dt, this.fair, act, random);
    let closed: { symbol: string; owner: string; id: number }[] | null = null;
    if (this.wasOpen && !open) {
      closed = this.exchanges.flatMap((e) => e.close());
    }
    this.wasOpen = open;
    if (now - this.lastSample >= HISTORY_EVERY) this.sample(now);
    return { closed };
  }

  private drift(dt: number, random: Random): void {
    for (let i = this.impulses.length - 1; i >= 0; i--) {
      const imp = this.impulses[i];
      if (!imp) continue;
      const move = Math.sign(imp.remaining) * Math.min(Math.abs(imp.remaining), Math.abs(imp.rate) * dt);
      imp.remaining -= move;
      // The news is priced in as it lands: both where the stock should be and where it is move together.
      this.anchor.set(imp.symbol, (this.anchor.get(imp.symbol) ?? 0) + move);
      this.fair.set(imp.symbol, (this.fair.get(imp.symbol) ?? 0) + move);
      if (imp.remaining === 0) this.impulses.splice(i, 1);
    }
    const hours = dt / MS_PER_HOUR;
    for (const s of this.stocks) {
      const fair = this.fair.get(s.symbol) ?? s.startPrice;
      const anchor = this.anchor.get(s.symbol) ?? s.startPrice;
      // Mean reversion pulls a tenth of the gap back each hour; the wander is the stock's own volatility; and now
      // and then a burst of orders shoves the price a few cents at once, which is what the fast firms live on.
      let next = fair + (anchor - fair) * 0.1 * hours + s.hourlyVol * Math.sqrt(hours) * random.normal();
      if (random.chance((s.jumpsPerSecond * dt) / 1000)) next += s.jumpSize * random.normal();
      this.fair.set(s.symbol, Math.max(100, next));
    }
  }

  private sample(now: number): void {
    this.lastSample = now;
    for (const s of this.stocks) {
      const mids: Record<string, number | null> = {};
      for (const e of this.exchanges) mids[e.id] = e.book(s.symbol).mid();
      const h = this.history.get(s.symbol);
      if (!h) continue;
      h.push({ at: now, mids, fair: this.fair.get(s.symbol) ?? 0 });
      if (h.length > HISTORY_LENGTH) h.splice(0, h.length - HISTORY_LENGTH);
    }
  }

  save(): SavedMarket {
    const exchanges: Record<string, SavedExchange> = {};
    for (const e of this.exchanges) exchanges[e.id] = e.save();
    return {
      fair: Object.fromEntries(this.fair),
      anchor: Object.fromEntries(this.anchor),
      impulses: this.impulses.map((i) => ({ ...i })),
      exchanges,
      history: Object.fromEntries(this.history),
      lastSample: this.lastSample,
    };
  }

  load(saved: SavedMarket): void {
    for (const [k, v] of Object.entries(saved.fair)) this.fair.set(k, v);
    for (const [k, v] of Object.entries(saved.anchor)) this.anchor.set(k, v);
    this.impulses = saved.impulses.map((i) => ({ ...i }));
    for (const e of this.exchanges) {
      const s = saved.exchanges[e.id];
      if (s) e.load(s);
    }
    for (const [k, v] of Object.entries(saved.history))
      this.history.set(
        k,
        v.map((p) => ({ ...p })),
      );
    this.lastSample = saved.lastSample;
    this.wasOpen = false;
  }
}
