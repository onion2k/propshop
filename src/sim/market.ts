// The market: every instrument's true fair value, and the venues that each chase it. Fair value wanders on its
// own and jumps when news lands; nobody trades at it directly, but every book is pulled toward it. The market
// keeps every desk's instruments and venues, and steps only those of the desks that are open: the stocks always,
// the others once opened. Each desk draws its chance from its own world stream, so opening one changes nothing of
// the stocks'.

import { MS_PER_HOUR, MS_PER_SECOND, activity, isMarketOpen } from './clock';
import { Exchange, type SavedExchange } from './exchange';
import { STOCKS_DESK, deskOf, listedOn, scaleOf } from './instrument';
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
  /** Each other desk's sector factors; absent where there is no desk but the stocks. */
  deskFactors?: Record<string, Record<string, number>>;
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
  /** Every instrument, of every desk, open or not. */
  readonly instruments: readonly StockSpec[];
  /** Every venue, of every desk, open or not. */
  readonly venues: readonly Exchange[];
  /** The instruments of the open desks: what the firms see, the snapshot shows and the history samples. */
  stocks: readonly StockSpec[];
  /** The venues of the open desks: what steps, and what the firms trade on. */
  exchanges: Exchange[];
  /** The stocks desk's instruments, in the content's order: what the stocks' world stream moves. */
  private readonly stockDesk: readonly StockSpec[];
  private readonly openDesks = new Set<string>([STOCKS_DESK]);
  private readonly factorSpec: FactorSpec;
  /** The stocks' market and each of their sectors' running factor, basis points away from where they started. */
  readonly factors = { market: 0, sectors: new Map<string, number>() };
  /** Each other desk's sectors' running factors, by desk. */
  readonly deskFactors = new Map<string, Map<string, number>>();
  /** True fair value per symbol, cents, a float. */
  readonly fair = new Map<string, number>();
  /** Where fair value is pulled back toward; news moves this. */
  readonly anchor = new Map<string, number>();
  private impulses: Impulse[] = [];
  readonly history = new Map<string, HistoryPoint[]>();
  private lastSample = -Infinity;
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
    this.instruments = stocks;
    this.stockDesk = stocks.filter((s) => deskOf(s) === STOCKS_DESK);
    this.scales = new Map(stocks.map((s) => [s.symbol, scaleOf(s)]));
    this.factorSpec = factors;
    this.venues = exchanges.map(
      (e) =>
        new Exchange(
          e,
          stocks.filter((s) => listedOn(s, e)),
        ),
    );
    for (const s of stocks) {
      this.fair.set(s.symbol, s.startPrice);
      this.anchor.set(s.symbol, s.startPrice);
      this.history.set(s.symbol, []);
      const desk = deskOf(s);
      if (desk === STOCKS_DESK) this.factors.sectors.set(s.sector, 0);
      else {
        const f = this.deskFactors.get(desk) ?? new Map<string, number>();
        f.set(s.sector, 0);
        this.deskFactors.set(desk, f);
      }
    }
    this.stocks = this.stockDesk;
    this.exchanges = this.venues.filter((e) => e.desk === STOCKS_DESK);
    this.settleIndexes();
    for (const e of this.venues) {
      for (const s of stocks) {
        if (s.constituents) {
          const st = e.stocks.get(s.symbol);
          if (st) st.belief = this.fair.get(s.symbol) ?? 0;
        }
      }
    }
  }

  /** The desks other than the stocks that have an instrument or a venue, in the content's order. */
  get desks(): string[] {
    const out: string[] = [];
    for (const d of [...this.instruments.map(deskOf), ...this.venues.map((e) => e.desk)])
      if (d !== STOCKS_DESK && !out.includes(d)) out.push(d);
    return out;
  }

  isDeskOpen(desk: string): boolean {
    return this.openDesks.has(desk);
  }

  /** Open a desk: its instruments and venues step from now on, and the firms see them. */
  openDesk(desk: string): void {
    if (this.openDesks.has(desk)) return;
    this.openDesks.add(desk);
    this.stocks = this.instruments.filter((s) => this.openDesks.has(deskOf(s)));
    this.exchanges = this.venues.filter((e) => this.openDesks.has(e.desk));
  }

  /** The live venues that list a symbol, in the content's order. */
  venuesOf(symbol: string): Exchange[] {
    return this.exchanges.filter((e) => e.lists(symbol));
  }

  /** Whether a symbol can be traded now: a venue that lists it is open. A symbol nobody lists keeps the stocks' hours. */
  isOpenFor(symbol: string, now: number): boolean {
    const listing = this.venues.filter((e) => e.lists(symbol));
    if (listing.length === 0) return isMarketOpen(now);
    return listing.some((e) => this.openDesks.has(e.desk) && e.isOpen(now));
  }

  /** An index's fair value is the average of its constituents', and its anchor the same. */
  private settleIndexes(): void {
    for (const s of this.instruments) {
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
    const e = this.venues.find((x) => x.id === id);
    if (!e) throw new Error(`No exchange ${id}`);
    return e;
  }

  /** A venue by id, of any desk. */
  venue(id: string): Exchange {
    return this.exchange(id);
  }

  stock(symbol: string): StockSpec {
    const s = this.instruments.find((x) => x.symbol === symbol);
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
    desks: Readonly<Record<string, Random>> = {},
  ): { closed: { symbol: string; owner: string; id: number }[] | null } {
    const open = isMarketOpen(now);
    this.open = open;
    this.drift(dt, world);
    for (const [desk, factors] of this.deskFactors) {
      if (!this.openDesks.has(desk)) continue;
      const stream = desks[desk];
      if (!stream) throw new Error(`No world stream for the ${desk} desk`);
      this.driftDesk(desk, factors, dt, stream);
    }
    const act = activity(now);
    for (const e of this.exchanges) {
      const stream = crowd[e.id];
      if (!stream) throw new Error(`No crowd stream for ${e.id}`);
      e.step(now, dt, this.fair, e.session ? e.activity(now) : act, stream);
    }
    // Each venue closes on its own hours: its books empty and the orders go back to their owners.
    let closed: { symbol: string; owner: string; id: number }[] | null = null;
    for (const e of this.exchanges) {
      const isOpen = e.session ? e.isOpen(now) : open;
      if (e.wasOpen && !isOpen) (closed ??= []).push(...e.close());
      e.wasOpen = isOpen;
    }
    if (now - this.lastSample >= HISTORY_EVERY) this.sample(now);
    return { closed };
  }

  /**
   * Another desk's fair values: each sector's factor and each instrument's own wander back to its anchor, drawn
   * from the desk's own stream. No regime, no market factor and no jumps yet: each desk's plan adds its own.
   */
  private driftDesk(desk: string, factors: Map<string, number>, dt: number, random: Random): void {
    const hours = dt / MS_PER_HOUR;
    const moves = new Map<string, number>();
    for (const [sector, level] of factors) {
      const move = this.factorSpec.sectorHourlyBps * Math.sqrt(hours) * random.normal() - level * 0.1 * hours;
      factors.set(sector, level + move);
      moves.set(sector, move);
    }
    for (const s of this.instruments) {
      if (deskOf(s) !== desk || s.constituents) continue;
      const fair = this.fair.get(s.symbol) ?? s.startPrice;
      const anchor = this.anchor.get(s.symbol) ?? s.startPrice;
      const common = (fair * (moves.get(s.sector) ?? 0)) / 10_000;
      const reversion = Math.min(1, this.factorSpec.ownReversionPerHour * hours);
      const next = fair + (anchor - fair) * reversion + s.hourlyVol * Math.sqrt(hours) * random.normal() + common;
      this.anchor.set(s.symbol, anchor + common);
      this.fair.set(s.symbol, Math.max(1, next));
    }
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
    for (const s of this.stockDesk) {
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
      for (const e of this.exchanges) if (e.lists(s.symbol)) mids[e.id] = e.book(s.symbol).mid();
      const h = this.history.get(s.symbol);
      if (!h) continue;
      h.push({ at: now, mids, fair: this.fair.get(s.symbol) ?? 0 });
      if (h.length > HISTORY_LENGTH) h.splice(0, h.length - HISTORY_LENGTH);
    }
  }

  save(): SavedMarket {
    const exchanges: Record<string, SavedExchange> = {};
    for (const e of this.venues) exchanges[e.id] = e.save();
    const deskFactors: Record<string, Record<string, number>> = {};
    for (const [desk, f] of this.deskFactors) deskFactors[desk] = Object.fromEntries(f);
    return {
      factors: { market: this.factors.market, sectors: Object.fromEntries(this.factors.sectors) },
      // A market with no desk but the stocks saves as it did before desks, to the byte.
      ...(this.deskFactors.size > 0 ? { deskFactors } : {}),
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
    for (const [desk, f] of Object.entries(saved.deskFactors ?? {})) {
      const mine = this.deskFactors.get(desk);
      if (mine) for (const [k, v] of Object.entries(f)) mine.set(k, v);
    }
    if (saved.regime) this.regime = saved.regime;
    this.drifts = new Map(Object.entries(saved.drifts ?? {}));
    for (const [k, v] of Object.entries(saved.fair)) this.fair.set(k, v);
    for (const [k, v] of Object.entries(saved.anchor)) this.anchor.set(k, v);
    this.impulses = saved.impulses.map((i) => ({ ...i }));
    for (const e of this.venues) {
      const s = saved.exchanges[e.id];
      if (s) e.load(s);
      e.wasOpen = false;
    }
    for (const [k, v] of Object.entries(saved.history))
      this.history.set(
        k,
        v.map((p) => ({ ...p })),
      );
    this.lastSample = saved.lastSample;
  }
}
