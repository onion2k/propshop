// The market: every stock's true fair value, and the exchanges that each chase it. Fair value wanders on its
// own and jumps when news lands; nobody trades at it directly, but every book is pulled toward it.

import { MS_PER_HOUR, MS_PER_SECOND, activity, isMarketOpen } from './clock';
import { Exchange, type SavedExchange } from './exchange';
import { scaleOf } from './instrument';
import type { Random } from './random';
import type { ExchangeSpec, FactorSpec, RegimeSpec, StockSpec } from './types';

/** A day with no character: every multiplier one, no drift. What the market runs on until the game says. */
export const PLAIN_DAY: RegimeSpec = {
  id: 'plain',
  name: 'Plain day',
  weight: 0,
  explain: 'A day like any other.',
  vol: 1,
  jumpRate: 1,
  jumpSize: 1,
  newsRate: 1,
  newsSize: 1,
  driftBps: 0,
};

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
  factors?: { market: number; sectors: Record<string, number> };
  regime?: RegimeSpec;
  drifts?: Record<string, number>;
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
  private readonly factorSpec: FactorSpec;
  /** The market's and each sector's running factor, basis points away from where they started. */
  readonly factors = { market: 0, sectors: new Map<string, number>() };
  /** True fair value per symbol, cents, a float. */
  readonly fair = new Map<string, number>();
  /** Where fair value is pulled back toward; news moves this. */
  readonly anchor = new Map<string, number>();
  private impulses: Impulse[] = [];
  readonly history = new Map<string, HistoryPoint[]>();
  private lastSample = -Infinity;
  private wasOpen = false;
  /** The day's character, and the drift it gives each stock in cents per ms while the market is open. */
  regime: RegimeSpec = PLAIN_DAY;
  private drifts = new Map<string, number>();
  /** Cents a price point of one held unit is worth, by symbol: one for every stock (`instrument.ts`). */
  readonly scales: ReadonlyMap<string, number>;

  constructor(
    stocks: StockSpec[],
    exchanges: ExchangeSpec[],
    factors: FactorSpec = { marketHourlyBps: 0, sectorHourlyBps: 0, ownReversionPerHour: 0.1 },
  ) {
    this.stocks = stocks;
    this.scales = new Map(stocks.map((s) => [s.symbol, scaleOf(s)]));
    this.factorSpec = factors;
    this.exchanges = exchanges.map((e) => new Exchange(e, stocks));
    for (const s of stocks) {
      this.fair.set(s.symbol, s.startPrice);
      this.anchor.set(s.symbol, s.startPrice);
      this.history.set(s.symbol, []);
      this.factors.sectors.set(s.sector, 0);
    }
    this.settleIndexes();
    for (const e of this.exchanges) {
      for (const s of stocks) {
        if (s.constituents) {
          const st = e.stocks.get(s.symbol);
          if (st) st.belief = this.fair.get(s.symbol) ?? 0;
        }
      }
    }
  }

  /** An index's fair value is the average of its constituents', and its anchor the same. */
  private settleIndexes(): void {
    for (const s of this.stocks) {
      if (!s.constituents || s.constituents.length === 0) continue;
      let fair = 0;
      let anchor = 0;
      for (const c of s.constituents) {
        fair += this.fair.get(c) ?? 0;
        anchor += this.anchor.get(c) ?? 0;
      }
      this.fair.set(s.symbol, fair / s.constituents.length);
      this.anchor.set(s.symbol, anchor / s.constituents.length);
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

  /** The day's character, set at the open with each stock's drift. */
  setRegime(regime: RegimeSpec, drifts: ReadonlyMap<string, number>): void {
    this.regime = regime;
    this.drifts = new Map(drifts);
  }

  /** News: move the anchor by so many cents, spread over a window. */
  shock(symbol: string, cents: number, overMs: number): void {
    if (cents === 0) return;
    this.impulses.push({ symbol, remaining: cents, rate: cents / Math.max(1, overMs) });
  }

  /**
   * One tick. Returns whether the market just closed, so the game can tell its firms their orders are gone.
   */
  private open = false;

  step(
    now: number,
    dt: number,
    world: Random,
    crowd: Readonly<Record<string, Random>>,
  ): { closed: { symbol: string; owner: string; id: number }[] | null } {
    const open = isMarketOpen(now);
    this.open = open;
    this.drift(dt, world);
    const act = activity(now);
    for (const e of this.exchanges) {
      const stream = crowd[e.id];
      if (!stream) throw new Error(`No crowd stream for ${e.id}`);
      e.step(now, dt, this.fair, act, stream);
    }
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
    const r = this.regime;
    // The factors: a market move and a move per sector, each a wander pulled gently back toward nought, so the
    // tape moves together a little and each sector together more. Taken by every stock in proportion.
    const marketMove =
      this.factorSpec.marketHourlyBps * r.vol * Math.sqrt(hours) * random.normal() - this.factors.market * 0.1 * hours;
    this.factors.market += marketMove;
    const sectorMoves = new Map<string, number>();
    for (const [sector, level] of this.factors.sectors) {
      const move = this.factorSpec.sectorHourlyBps * r.vol * Math.sqrt(hours) * random.normal() - level * 0.1 * hours;
      this.factors.sectors.set(sector, level + move);
      sectorMoves.set(sector, move);
    }
    for (const s of this.stocks) {
      if (s.constituents) continue;
      const fair = this.fair.get(s.symbol) ?? s.startPrice;
      const anchor = this.anchor.get(s.symbol) ?? s.startPrice;
      const common = (fair * ((s.beta ?? 1) * marketMove + (sectorMoves.get(s.sector) ?? 0))) / 10_000;
      // The stock's own wander comes back to its anchor at the content's rate, a liquidity shock rather than a
      // repricing, since the news, the drift and the factors move the anchor itself; the wander is scaled
      // by the day; a trending day adds a drift, which moves the anchor too so reversion does not fight it; and
      // now and then a burst of orders shoves the price a few cents at once, which is what the fast firms live on.
      const drift = (this.open ? (this.drifts.get(s.symbol) ?? 0) * dt : 0) + common;
      const reversion = Math.min(1, this.factorSpec.ownReversionPerHour * hours);
      let next = fair + (anchor - fair) * reversion + s.hourlyVol * r.vol * Math.sqrt(hours) * random.normal() + drift;
      if (drift !== 0) this.anchor.set(s.symbol, anchor + drift);
      if (random.chance((s.jumpsPerSecond * r.jumpRate * dt) / 1000)) next += s.jumpSize * r.jumpSize * random.normal();
      this.fair.set(s.symbol, Math.max(100, next));
    }
    this.settleIndexes();
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
      factors: { market: this.factors.market, sectors: Object.fromEntries(this.factors.sectors) },
      regime: this.regime,
      drifts: Object.fromEntries(this.drifts),
      fair: Object.fromEntries(this.fair),
      anchor: Object.fromEntries(this.anchor),
      impulses: this.impulses.map((i) => ({ ...i })),
      exchanges,
      history: Object.fromEntries(this.history),
      lastSample: this.lastSample,
    };
  }

  load(saved: SavedMarket): void {
    if (saved.factors) {
      this.factors.market = saved.factors.market;
      for (const [k, v] of Object.entries(saved.factors.sectors)) this.factors.sectors.set(k, v);
    }
    if (saved.regime) this.regime = saved.regime;
    this.drifts = new Map(Object.entries(saved.drifts ?? {}));
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
