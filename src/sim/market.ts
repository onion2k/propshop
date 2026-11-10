// The market: every instrument's true fair value, and the venues that each chase it. Fair value wanders on its
// own and jumps when news lands; nobody trades at it directly, but every book is pulled toward it. The market
// keeps every desk's instruments and venues, and steps only those of the desks that are open: the stocks always,
// the others once opened. Each desk draws its chance from its own world stream, so opening one changes nothing of
// the stocks'.

import {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_SECOND,
  MS_PER_YEAR,
  TRADING_YEAR_MS,
  activity,
  isMarketOpen,
  openMsBetween,
} from './clock';
import { Exchange, type SavedExchange } from './exchange';
import {
  HOME,
  STOCKS_DESK,
  currencyOf,
  deskOf,
  inHome,
  isCarried,
  isCross,
  isDerived,
  isOption,
  listedOn,
  liveContracts,
  scaleOf,
  type FxPair,
  type Rate,
} from './instrument';
import { price as optionPrice, skewed, vega as optionVega } from './options';
import type { Random } from './random';
import type { ContractView, OptionStatic, PairView, RolloverView } from './strategy';
import type {
  ContractSeriesSpec,
  CurrencySpec,
  ExchangeSpec,
  FactorSpec,
  MarginSpec,
  OptionsSpec,
  RegimeSpec,
  RolloverSpec,
  StockSpec,
} from './types';

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
  /** Each currency's last mid of its pair; absent where there is no currency but the dollar. */
  rates?: Record<string, number>;
  /** Each metal's lease rate; absent while no desk with a lease is open, and in every save from before them. */
  leases?: Record<string, number>;
  /** The stocks' factor level each reading instrument last took; absent as the leases are. */
  reads?: Record<string, number>;
  /** Each listed option's strike, fixed when it was listed; absent where there are no options (a save from before them). */
  strikes?: Record<string, number>;
  /** The options desk's volatility state; absent while the desk is closed, and in every save from before it. */
  vol?: VolState;
  /** Each listed option's quoter half-spread, price points; absent where the options venue has no quoter. */
  half?: Record<string, number>;
}

/**
 * What the options desk reads and draws to price its options: the underlying's realised variance a second (an
 * exponentially weighted average, read from its fair value in the stocks' hours, not drawn), the last sample
 * it was read at, and the wander of the at-the-money volatility (drawn from the desk's stream).
 */
export interface VolState {
  /** Variance of the underlying's log return a second, weighted. */
  variance: number;
  /** The underlying's fair value at the last sample. */
  last: number;
  /** When it was sampled, ms; -1 with none (the market has been shut since). */
  lastAt: number;
  /** Volatility points (a share) added to the at-the-money volatility. */
  wander: number;
  /** When the options were last priced, ms; -1 to price at the next chance (listed since, or the market was shut). */
  pricedAt: number;
  /** The underlying's fair value at that pricing, cents. */
  pricedSpot: number;
}

/** The options are priced again once this long has passed, ms of simulated time, though the index has not moved. */
export const OPTION_REPRICE_MS = 100;
/** ... or at once when the underlying's fair value has moved this many cents (under a fifth of a tick of the book). */
export const OPTION_REPRICE_CENTS = 0.2;

/** How often, in ms, the realised variance is sampled while the stocks are open. */
export const VOL_SAMPLE_MS = MS_PER_SECOND;

/** What every firm sees alike of the live instruments (`Market.sharedParts`). */
export interface SharedParts {
  stamp: number;
  sectors: Readonly<Record<string, string>>;
  constituents: Readonly<Record<string, readonly string[]>>;
  contracts: Readonly<Record<string, ContractView>>;
  exchangeIds: readonly string[];
  /** Each live instrument's value of a price point of one unit (`scaleOf`). */
  scales: Readonly<Record<string, number>>;
  /** The live options and the model's rate, once the options desk is open; absent while it is closed. */
  options?: { rate: number; chain: Readonly<Record<string, OptionStatic>> };
}

/** A pair's parts that stay while the live instruments do. */
interface FixedPair {
  symbol: string;
  base: string;
  quote: string;
  units: number;
  scale: number;
  venues: readonly string[];
  cross?: { legs: readonly [string, string]; scale: number };
}

interface PairParts {
  stamp: number;
  fixed: FixedPair[];
  /** The rates' mids the views were built at, in the rates' order. */
  mids: number[];
  built: { pairs: Readonly<Record<string, PairView>>; rollover: RolloverView | undefined } | null;
  roll: RolloverSpec | null;
  rolled?: { at: number; spread: number; basis: number } | null;
}

export class Market {
  /** Every instrument, of every desk, open or not: the content's, and the contracts listed now. */
  readonly instruments: StockSpec[];
  /** The contract series, listed as time passes. */
  private readonly series: readonly ContractSeriesSpec[];
  /** Each listed contract's series root. */
  private readonly rootOf = new Map<string, string>();
  /** The soonest expiry among the listed contracts; Infinity with none. */
  nextExpiry = Infinity;
  /** What a margined instrument asks the firm to hold against it, by symbol (`instrument.ts`). */
  readonly margins = new Map<string, MarginSpec>();
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
  readonly scales: Map<string, number>;
  /**
   * Each currency but the dollar's rate home: its pair's last mid, from that pair's first live venue, kept while the
   * venues are shut. One entry a currency of the content. Handed to the firms each tick, as the scales are.
   */
  readonly rates = new Map<string, Rate>();
  /** Each currency's interest a year, for rollover, the dollar's included. */
  readonly yearly = new Map<string, number>();
  /** The currency pairs, by symbol: what a fill moves, in which currencies, a lot. */
  readonly fx = new Map<string, FxPair>();
  /** Each cross's points per product of its legs' points. */
  readonly crossScale = new Map<string, number>();
  /** When the currencies roll over and what the venues keep, handed in by the game; null with no currency. */
  rollover: RolloverSpec | null = null;
  /**
   * Counts the changes to what is live: a desk opened, a contract listed or delisted, a save loaded. Anything kept
   * about the live instruments and venues (here and in the firms) is good while this is the number it was kept at.
   */
  liveStamp = 0;
  /** What every firm sees alike of the live instruments, built when first asked after a change to them. Not saved. */
  private shared: SharedParts | null = null;
  /** The pairs as the firms see them, rebuilt when the live instruments or a rate move. Not saved. */
  private pairCache: PairParts | null = null;
  /** The pairs the rates are read from, with their desks. */
  private readonly ratePairs: { currency: string; pair: string; desk: string }[] = [];
  /**
   * Each metal's lease rate now, a year, a share: one entry a leased instrument of the content, at its start until
   * its desk opens, then wandering on the desk's stream and moved by its news.
   */
  readonly leases = new Map<string, number>();
  /** The leased instruments, by desk, in the content's order. */
  private readonly leased = new Map<string, StockSpec[]>();
  /** Counts the changes to the leases, so the contracts' carries are rebuilt only when one has moved. */
  private leaseStamp = 0;
  /** The stocks' factor level each reading instrument last took (`InstrumentSpec.reads`): one entry each. */
  private readonly lastRead = new Map<string, number>();
  /** The options desk's pricing, or undefined where the content has no options. */
  private readonly optionsSpec: OptionsSpec | undefined;
  /** The listed options, by symbol (open desk or not): what the firms weigh a short's margin by. Bounded by the series. */
  readonly optionSpecs = new Map<string, StockSpec>();
  /** The options desk's volatility state: the realised variance, read, and the wander, drawn from its own stream. */
  readonly volatility: VolState = { variance: 0, last: 0, lastAt: -1, wander: 0, pricedAt: -1, pricedSpot: 0 };
  /**
   * How many market-wide releases fall after `from` and by `to`: the public calendar, handed in by the game. An option's
   * expiry carries the event variance of each. Nought where nothing is handed in.
   */
  releases: (from: number, to: number) => number = () => 0;
  /** The times of a day's market-wide releases (days since the epoch), handed in by the game from the public calendar. */
  releaseTimes: (day: number) => readonly number[] = () => [];
  /** The indexes among the instruments (the stocks desk's, fixed at construction): what `settleIndexes` averages. */
  private readonly indexSpecs: { symbol: string; constituents: string[] }[];
  /** Where each symbol is listed among the live venues, kept while the live set is: cleared when it changes. */
  private readonly venueCache = new Map<string, Exchange[]>();
  /** The instruments of open desks that are derived, in the content's order: what `settleDerived` follows. */
  private derived: StockSpec[] = [];
  /**
   * The options venue's quoter's half-spread in volatility points, where it has one (`ExchangeSpec.quoter`).
   * Fixed by the content.
   */
  private readonly quoterVolPoints: number | undefined;
  /**
   * Each listed option's half-spread in price points, worked out with its price (vega times the quoter's volatility
   * points), so the options venue's quoter reads a number and works nothing out. One a listed option, twelve at most
   * (the series' `live` bound), saved with the pricing state as the fair values are.
   */
  private readonly quoteHalf = new Map<string, number>();
  /** The expiries priced this tick, with the time left and the at-the-money volatility to it: a few, reused. */
  private readonly expiryPrices: { expiry: number; t: number; vol: number }[] = [];

  constructor(
    stocks: StockSpec[],
    exchanges: ExchangeSpec[],
    factors: FactorSpec = { marketHourlyBps: 0, sectorHourlyBps: 0, ownReversionPerHour: 0.1 },
    series: readonly ContractSeriesSpec[] = [],
    currencies: readonly CurrencySpec[] = [],
    options?: OptionsSpec,
  ) {
    this.series = series;
    this.optionsSpec = options;
    this.quoterVolPoints = options ? exchanges.find((e) => e.desk === options.desk)?.quoter?.halfSpreadVol : undefined;
    if (options) this.volatility.variance = (options.startVol * options.startVol) / (TRADING_YEAR_MS / 1000);
    this.currencyPairs(stocks, currencies);
    this.instruments = [...stocks];
    for (const s of stocks) if (s.margin) this.margins.set(s.symbol, s.margin);
    for (const s of stocks) {
      if (!s.lease) continue;
      this.leases.set(s.symbol, s.lease.rate);
      this.leased.set(deskOf(s), [...(this.leased.get(deskOf(s)) ?? []), s]);
    }
    for (const s of stocks) if (s.reads) this.lastRead.set(s.symbol, 0);
    this.stockDesk = stocks.filter((s) => deskOf(s) === STOCKS_DESK);
    this.indexSpecs = [];
    for (const s of stocks)
      if (s.constituents && s.constituents.length > 0)
        this.indexSpecs.push({ symbol: s.symbol, constituents: s.constituents });
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
      if (isDerived(s)) continue;
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

  /**
   * The currency pairs and their rates, from the content's currencies: a lot's base in its minor units, a cross's
   * scale from its legs', and each currency's rate from the pair that prices it, at its start.
   */
  private currencyPairs(stocks: readonly StockSpec[], currencies: readonly CurrencySpec[]): void {
    if (currencies.length === 0) return;
    const minor = (c: string) => currencies.find((x) => x.id === c)?.minor ?? 100;
    // What a point is worth in the quote's whole units.
    const point = (s: StockSpec) => (s.priceUnit ?? 1) / minor(currencyOf(s));
    for (const c of currencies) this.yearly.set(c.id, c.rate);
    for (const s of stocks) {
      if (s.base === undefined) continue;
      this.fx.set(s.symbol, { base: s.base, quote: currencyOf(s), units: (s.multiplier ?? 1) * minor(s.base) });
      if (s.cross) {
        const [a, b] = s.cross.map((leg) => stocks.find((x) => x.symbol === leg));
        if (!a || !b) throw new Error(`The cross ${s.symbol} needs both its legs`);
        this.crossScale.set(s.symbol, (point(a) * point(b)) / point(s));
      }
    }
    for (const c of currencies) {
      if (c.id === HOME || c.pair === undefined) continue;
      const p = stocks.find((x) => x.symbol === c.pair);
      const pair = p ? this.fx.get(p.symbol) : undefined;
      if (!p || !pair) throw new Error(`No pair ${c.pair} for ${c.id}`);
      this.rates.set(c.id, { mid: p.startPrice, perPoint: scaleOf(p) / pair.units, inverse: pair.quote === c.id });
      this.ratePairs.push({ currency: c.id, pair: p.symbol, desk: deskOf(p) });
    }
  }

  /** The desks other than the stocks that have a venue, a series or an instrument, in the content's order. */
  get desks(): string[] {
    const out: string[] = [];
    for (const d of [
      ...this.venues.map((e) => e.desk),
      ...this.series.map((s) => deskOf(s.contract)),
      ...this.instruments.map(deskOf),
    ])
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
    // What reads the stocks' factors takes their level at once: read, not drawn.
    for (const s of this.instruments) if (s.reads && deskOf(s) === desk) this.read(s);
    this.refreshLive();
  }

  /**
   * An instrument that reads a stocks' factor takes its move since last read, at its loading, into its fair value
   * and anchor, as a stock takes its sector's move. Draws nothing.
   */
  private read(s: StockSpec): void {
    const r = s.reads!;
    const level = this.factors.sectors.get(r.sector) ?? 0;
    const move = (r.loading * (level - (this.lastRead.get(s.symbol) ?? 0))) / 10_000;
    this.lastRead.set(s.symbol, level);
    if (move === 0) return;
    const fair = this.fair.get(s.symbol) ?? s.startPrice;
    const anchor = this.anchor.get(s.symbol) ?? s.startPrice;
    this.fair.set(s.symbol, Math.max(1, fair * (1 + move)));
    this.anchor.set(s.symbol, anchor * (1 + move));
  }

  /** A contract's carry now, a year: its own, less its metal's lease where it names one. */
  carryOf(s: StockSpec): number {
    return (s.carry ?? 0) - (s.leaseOf !== undefined ? (this.leases.get(s.leaseOf) ?? 0) : 0);
  }

  /** Supply news: a metal's lease moves by so much at once, and wanders back from there. */
  shiftLease(symbol: string, by: number): void {
    const l = this.leases.get(symbol);
    if (l === undefined || by === 0) return;
    this.leases.set(symbol, l + by);
    this.leaseStamp++;
  }

  private refreshLive(): void {
    this.stocks = this.instruments.filter((s) => this.openDesks.has(deskOf(s)));
    this.exchanges = this.venues.filter((e) => this.openDesks.has(e.desk));
    this.derived = this.stocks.filter(isDerived);
    this.venueCache.clear();
    this.liveStamp++;
  }

  /** Whether the options desk is open: the volatility moves, is drawn for and is saved. */
  get optionsOpen(): boolean {
    return this.optionsSpec !== undefined && this.openDesks.has(this.optionsSpec.desk);
  }

  /**
   * What every firm sees alike of the live instruments: sectors, an index's constituents, the carried contracts and
   * the venues' ids. One set of objects handed to every view, rebuilt only when the live instruments change; a
   * block reads them and never writes (the view's types say so).
   */
  sharedParts(): SharedParts {
    const kept = this.shared;
    if (kept && kept.stamp === this.liveStamp) {
      if (this.sharedLeases === this.leaseStamp) return kept;
      // A lease has moved: the contracts' carries are new objects, the rest as it was.
      this.sharedLeases = this.leaseStamp;
      this.shared = { ...kept, contracts: this.contractViews() };
      return this.shared;
    }
    const sectors: Record<string, string> = {};
    const constituents: Record<string, readonly string[]> = {};
    const scales: Record<string, number> = {};
    for (const s of this.stocks) {
      sectors[s.symbol] = s.sector;
      if (s.constituents) constituents[s.symbol] = s.constituents;
      scales[s.symbol] = this.scales.get(s.symbol) ?? 1;
    }
    this.sharedLeases = this.leaseStamp;
    this.shared = {
      stamp: this.liveStamp,
      sectors,
      constituents,
      contracts: this.contractViews(),
      exchangeIds: this.exchanges.map((e) => e.id),
      scales,
      ...this.optionParts(),
    };
    return this.shared;
  }

  /** The live options as a block sees them, with the rate; none while the desk is closed. */
  private optionParts(): { options?: { rate: number; chain: Record<string, OptionStatic> } } {
    const o = this.optionsSpec;
    if (!o || !this.optionsOpen) return {};
    const chain: Record<string, OptionStatic> = {};
    for (const s of this.stocks)
      if (isOption(s))
        chain[s.symbol] = {
          right: s.right!,
          strike: s.strike!,
          expiry: s.expiry!,
          underlying: s.underlying!,
          multiplier: s.multiplier ?? 1,
        };
    return { options: { rate: o.rate, chain } };
  }

  /**
   * The times of today's market-wide releases, the public calendar's (times only), handed in by the game: kept for the
   * day, since the schedule is a day ahead and the whole day is known from its first minute.
   */
  todaysReleases(now: number): readonly number[] {
    const day = Math.floor(now / MS_PER_DAY);
    if (day !== this.releaseDay) {
      this.releaseList = this.releaseTimes(day);
      this.releaseDay = day;
    }
    return this.releaseList;
  }

  private releaseDay = -1;
  private releaseList: readonly number[] = [];

  /** The lease stamp the shared parts' contracts were built at. */
  private sharedLeases = -1;

  /** The live carried contracts as a block sees them, each carry as it is now. */
  private contractViews(): Record<string, ContractView> {
    const contracts: Record<string, ContractView> = {};
    for (const s of this.stocks) {
      if (isCarried(s))
        contracts[s.symbol] = {
          underlying: s.underlying!,
          expiry: s.expiry!,
          carry: this.carryOf(s),
          multiplier: s.multiplier ?? 1,
        };
    }
    return contracts;
  }

  /**
   * The live currency pairs as a block sees them, and the rollover, or null with no pair live. What a pair is
   * stays as long as the live instruments do; what a point of it is worth at home moves with the rates, so the
   * views are rebuilt (new objects, never changed in place) when a rate has moved, once, not once a firm.
   */
  pairParts(): { pairs: Readonly<Record<string, PairView>>; rollover: RolloverView | undefined } | null {
    let parts = this.pairCache;
    if (!parts || parts.stamp !== this.liveStamp) {
      const fixed: FixedPair[] = [];
      for (const s of this.stocks) {
        const pair = this.fx.get(s.symbol);
        if (!pair) continue;
        const scale = this.crossScale.get(s.symbol);
        fixed.push({
          symbol: s.symbol,
          quote: pair.quote,
          base: pair.base,
          units: pair.units,
          scale: this.scales.get(s.symbol) ?? 1,
          venues: this.venuesOf(s.symbol).map((e) => e.id),
          ...(s.cross && scale !== undefined ? { cross: { legs: s.cross, scale } } : {}),
        });
      }
      parts = this.pairCache = { stamp: this.liveStamp, fixed, mids: [], built: null, roll: null };
    }
    if (parts.fixed.length === 0) return null;
    const roll = this.rollover;
    let fresh = parts.built === null || parts.roll !== roll;
    let i = 0;
    for (const rate of this.rates.values()) {
      if (parts.mids[i] !== rate.mid) fresh = true;
      parts.mids[i++] = rate.mid;
    }
    if (
      roll &&
      parts.rolled &&
      (parts.rolled.at !== roll.at || parts.rolled.spread !== roll.spread || parts.rolled.basis !== roll.basis)
    )
      fresh = true;
    if (fresh) {
      const pairs: Record<string, PairView> = {};
      for (const f of parts.fixed) {
        pairs[f.symbol] = {
          base: f.base,
          quote: f.quote,
          units: f.units,
          scale: f.scale,
          pointValue: inHome(f.quote, f.scale, this.rates),
          venues: f.venues,
          ...(f.cross ? { cross: f.cross } : {}),
        };
      }
      parts.roll = roll;
      parts.rolled = roll ? { at: roll.at, spread: roll.spread, basis: roll.basis } : null;
      parts.built = {
        pairs,
        rollover: roll
          ? { at: roll.at, spread: roll.spread, basis: roll.basis, rates: Object.fromEntries(this.yearly) }
          : undefined,
      };
    }
    return parts.built;
  }

  /** The listed contracts of a series, in order of expiry. */
  live(root: string): string[] {
    return this.instruments.filter((s) => this.rootOf.get(s.symbol) === root).map((s) => s.symbol);
  }

  /** The listed contracts whose expiry has come: to settle, then delist with `refreshContracts`. */
  expired(now: number): StockSpec[] {
    return this.instruments.filter((s) => s.expiry !== undefined && s.expiry <= now);
  }

  /**
   * List each series' live contracts at `now` and delist what has expired: the same steps, in the same order,
   * for a game running on and one loaded from a save, so the two keep the same state to the byte. A new contract
   * starts at the fair value of the nearest of its series still listed, or the series' start. Returns the orders
   * that rested in a delisted book, for their owners.
   */
  refreshContracts(now: number): { symbol: string; owner: string; id: number }[] {
    const gone: { symbol: string; owner: string; id: number }[] = [];
    const wanted = this.series.map((s) => liveContracts(s, now));
    const keep = new Set(wanted.flat().map((c) => c.symbol));
    for (const s of [...this.instruments]) {
      if (!this.rootOf.has(s.symbol) || keep.has(s.symbol)) continue;
      for (const e of this.venues) gone.push(...e.delist(s.symbol));
      this.instruments.splice(this.instruments.indexOf(s), 1);
      for (const m of [
        this.fair,
        this.anchor,
        this.history,
        this.scales,
        this.margins,
        this.drifts,
        this.rootOf,
        this.optionSpecs,
        this.quoteHalf,
      ])
        m.delete(s.symbol);
    }
    this.series.forEach((series, i) => {
      for (const c of wanted[i] ?? []) {
        if (this.rootOf.has(c.symbol)) continue;
        const sibling = this.live(series.root)[0];
        // An option's strike is fixed here, from its underlying's fair value now, and kept for its life.
        if (isOption(c)) {
          c.strike = this.strikeFor(series, c.underlying!);
          this.optionSpecs.set(c.symbol, c);
          this.volatility.pricedAt = -1;
        }
        const fair = isOption(c)
          ? this.optionFair(c, now)
          : isCarried(c)
            ? this.carried(c, now)
            : ((sibling !== undefined ? this.fair.get(sibling) : undefined) ?? c.startPrice);
        this.instruments.push(c);
        this.rootOf.set(c.symbol, series.root);
        this.fair.set(c.symbol, fair);
        this.anchor.set(c.symbol, fair);
        this.history.set(c.symbol, []);
        this.scales.set(c.symbol, scaleOf(c));
        if (c.margin) this.margins.set(c.symbol, c.margin);
        const desk = deskOf(c);
        if (!isDerived(c)) {
          const f = this.deskFactors.get(desk) ?? new Map<string, number>();
          if (!f.has(c.sector)) f.set(c.sector, 0);
          if (desk !== STOCKS_DESK) this.deskFactors.set(desk, f);
        }
        for (const e of this.venues) if (listedOn(c, e.spec)) e.list(c, fair);
      }
    });
    this.nextExpiry = Math.min(Infinity, ...this.instruments.map((s) => s.expiry ?? Infinity));
    this.refreshLive();
    return gone;
  }

  /** The margined instruments a venue settles at its close: those it is the first live listing of. */
  settlesOn(venue: string): string[] {
    return this.stocks.filter((s) => s.margin && this.venuesOf(s.symbol)[0]?.id === venue).map((s) => s.symbol);
  }

  /** The price a margined instrument settles at: its fair value, on its grid. */
  settlementPrice(symbol: string): number {
    const spec = this.stock(symbol);
    const tick = spec.tickSize ?? this.venues.find((e) => e.lists(symbol))?.rules.tickSize ?? 1;
    return Math.round((this.fair.get(symbol) ?? spec.startPrice) / tick) * tick;
  }

  /**
   * Where a symbol trades now: the mid on its first live venue that is open at `now`, else its fair value. A symbol
   * on venues of one session (every stock, pair and future) reads its first live venue, as it always did; spot metal
   * reads Thamesford's book while Sundar is shut. Without `now`, or with no listing venue open, the first live venue.
   */
  markOf(symbol: string, now?: number): number {
    return this.midNow(symbol, now) ?? this.fair.get(symbol) ?? this.stock(symbol).startPrice;
  }

  /** The mid on the first live venue listing a symbol that is open at `now`; with none open, the first live venue's. */
  midNow(symbol: string, now?: number): number | null {
    const venues = this.venuesOf(symbol);
    const open = now === undefined ? undefined : venues.find((e) => e.isOpen(now));
    return (open ?? venues[0])?.book(symbol).mid() ?? null;
  }

  /** The live venues that list a symbol, in the content's order. */
  venuesOf(symbol: string): Exchange[] {
    let found = this.venueCache.get(symbol);
    if (!found) {
      found = this.exchanges.filter((e) => e.lists(symbol));
      this.venueCache.set(symbol, found);
    }
    return found;
  }

  /** Whether a symbol can be traded now: a venue that lists it is open. A symbol nobody lists keeps the stocks' hours. */
  isOpenFor(symbol: string, now: number): boolean {
    const listing = this.venues.filter((e) => e.lists(symbol));
    if (listing.length === 0) return isMarketOpen(now);
    return listing.some((e) => this.openDesks.has(e.desk) && e.isOpen(now));
  }

  /** An index's fair value is the average of its constituents', and its anchor the same. */
  private settleIndexes(): void {
    for (const s of this.indexSpecs) {
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
  ): { closed: { symbol: string; owner: string; id: number }[] | null; closedVenues: string[] } {
    const open = isMarketOpen(now);
    this.open = open;
    this.drift(dt, world);
    for (const [desk, factors] of this.deskFactors) {
      if (!this.openDesks.has(desk)) continue;
      const stream = desks[desk];
      if (!stream) throw new Error(`No world stream for the ${desk} desk`);
      this.driftDesk(desk, factors, dt, stream);
    }
    if (this.optionsSpec && this.optionsOpen) {
      const stream = desks[this.optionsSpec.desk];
      if (!stream) throw new Error(`No world stream for the ${this.optionsSpec.desk} desk`);
      this.stepVolatility(now, dt, open, stream);
    }
    this.settleDerived(now, open);
    const act = activity(now);
    for (const e of this.exchanges) {
      const stream = crowd[e.id];
      if (!stream) throw new Error(`No crowd stream for ${e.id}`);
      e.step(now, dt, this.fair, e.session ? e.activity(now) : act, stream, this.quoteHalf);
    }
    // Each venue closes on its own hours: its books empty and the orders go back to their owners.
    let closed: { symbol: string; owner: string; id: number }[] | null = null;
    const closedVenues: string[] = [];
    for (const e of this.exchanges) {
      const isOpen = e.session ? e.isOpen(now) : open;
      if (e.wasOpen && !isOpen) {
        (closed ??= []).push(...e.close());
        closedVenues.push(e.id);
      }
      e.wasOpen = isOpen;
    }
    if (this.ratePairs.length > 0) this.refreshRates();
    if (now - this.lastSample >= HISTORY_EVERY) this.sample(now);
    return { closed, closedVenues };
  }

  /** Each currency's rate is its pair's mid on its first live venue; with no mid (the venues shut), the last one. */
  private refreshRates(): void {
    for (const { currency, pair, desk } of this.ratePairs) {
      if (!this.openDesks.has(desk)) continue;
      const mid = this.venuesOf(pair)[0]?.book(pair).mid() ?? null;
      const rate = this.rates.get(currency);
      if (rate && mid !== null) rate.mid = mid;
    }
  }

  /** A derived instrument's fair value: its underlying's, carried to expiry. Draws nothing. */
  private carried(s: StockSpec, now: number): number {
    const under = this.fair.get(s.underlying ?? '') ?? s.startPrice;
    const years = Math.max(0, (s.expiry ?? now) - now) / MS_PER_YEAR;
    return under * (1 + this.carryOf(s) * years);
  }

  /** A cross's fair value: the product of its legs', scaled to its points. Draws nothing. */
  private crossed(s: StockSpec): number {
    const [a, b] = s.cross!;
    return (this.fair.get(a) ?? 0) * (this.fair.get(b) ?? 0) * (this.crossScale.get(s.symbol) ?? 1);
  }

  /**
   * Every live derived instrument follows what it is derived from, each tick: a future its underlying, meeting it at
   * expiry; a cross the product of its legs.
   */
  private settleDerived(now: number, open: boolean): void {
    const pricing = this.optionsDue(now, open);
    const options = pricing ? this.optionsPriced(now) : this.expiryPrices;
    for (const s of this.derived) {
      if (isOption(s) && !pricing) continue;
      const fair = isOption(s) ? this.optionFair(s, now, options) : isCross(s) ? this.crossed(s) : this.carried(s, now);
      this.fair.set(s.symbol, fair);
      this.anchor.set(s.symbol, fair);
    }
  }

  /**
   * Whether the open options are priced this tick: in the stocks' hours (shut, the last price stands and the first tick
   * of the session prices), once `OPTION_REPRICE_MS` has passed or the underlying has moved `OPTION_REPRICE_CENTS`
   * since the last pricing. A contract listed since forces the next. Reads and writes the saved pricing state only.
   */
  private optionsDue(now: number, open: boolean): boolean {
    const o = this.optionsSpec;
    if (!o || !open || !this.optionsOpen) return false;
    const v = this.volatility;
    const spot = this.fair.get(o.underlying) ?? 0;
    if (v.pricedAt >= 0 && now - v.pricedAt < OPTION_REPRICE_MS && Math.abs(spot - v.pricedSpot) < OPTION_REPRICE_CENTS)
      return false;
    v.pricedAt = now;
    v.pricedSpot = spot;
    return true;
  }

  /** The strike of an option listed now: the underlying's fair value to the nearest step, then `offset` steps off. */
  private strikeFor(series: ContractSeriesSpec, underlying: string): number {
    const step = this.optionsSpec?.strikeStep ?? 1;
    const spot = this.fair.get(underlying) ?? 0;
    return (Math.round(spot / step) + (series.strikeOffset ?? 0)) * step;
  }

  /** The underlying's realised volatility, annual on a trading year: the weighted variance a second, scaled to it. */
  realisedVol(): number {
    return Math.sqrt(Math.max(0, this.volatility.variance) * (TRADING_YEAR_MS / 1000));
  }

  /**
   * The time between two moments in trading years, as the variance an expiry carries counts it: the stocks' open hours
   * in full and the shut ones at `closedWeight` (the index moves little overnight), not calendar time.
   */
  tradingYears(from: number, to: number): number {
    const o = this.optionsSpec;
    if (!o || to <= from) return 0;
    const open = openMsBetween(from, to);
    return (open + o.closedWeight * (to - from - open)) / TRADING_YEAR_MS;
  }

  /** The at-the-money volatility now, before the releases to come: the realised, its premium and the wander, never under the floor. */
  atmVol(): number {
    const o = this.optionsSpec;
    if (!o) return 0;
    return Math.max(o.floorVol, this.realisedVol() * (1 + o.premium) + this.volatility.wander);
  }

  /**
   * An expiry's total variance of the underlying's log return from `now` to `expiry`: the at-the-money volatility
   * squared over the trading time left, its diffusion share, and the event variance of each market-wide release still to come before it. A
   * release that has landed, or that falls after the expiry, adds none: the crush is the first of these going.
   */
  expiryVariance(expiry: number, now: number, atm: number = this.atmVol()): number {
    const o = this.optionsSpec;
    if (!o) return 0;
    return (
      atm * atm * this.tradingYears(now, expiry) * o.diffusionShare +
      (expiry > now ? this.releases(now, expiry) : 0) * o.eventVariance
    );
  }

  /** An option's volatility for the model: its expiry's at-the-money, from the variance, then the strike's skew. */
  optionVol(s: StockSpec, now: number): number {
    const o = this.optionsSpec;
    if (!o) return 0;
    const t = Math.max(0, (s.expiry ?? now) - now) / MS_PER_YEAR;
    const atm = t > 0 ? Math.sqrt(this.expiryVariance(s.expiry!, now) / t) : this.atmVol();
    return this.skewedVol(s, atm, t);
  }

  private skewedVol(s: StockSpec, atm: number, t: number): number {
    const o = this.optionsSpec!;
    const spot = this.fair.get(s.underlying ?? '') ?? 0;
    return skewed(atm, s.strike ?? spot, spot * Math.exp(o.rate * t), o.skew);
  }

  /** The expiries of the open options, each with its time left and the volatility to it, worked out once a tick. */
  private optionsPriced(now: number): { expiry: number; t: number; vol: number }[] {
    const out = this.expiryPrices;
    out.length = 0;
    if (!this.optionsSpec || !this.optionsOpen) return out;
    const atm = this.atmVol();
    for (const s of this.derived) {
      if (!isOption(s) || out.some((e) => e.expiry === s.expiry)) continue;
      const t = Math.max(0, s.expiry! - now) / MS_PER_YEAR;
      out.push({ expiry: s.expiry!, t, vol: t > 0 ? Math.sqrt(this.expiryVariance(s.expiry!, now, atm) / t) : atm });
    }
    return out;
  }

  /**
   * An option's fair value, cents: the model on its underlying's fair value, the time left and the strike's
   * volatility. Draws nothing. `priced` is this tick's expiries where they have been worked out.
   */
  private optionFair(
    s: StockSpec,
    now: number,
    priced?: readonly { expiry: number; t: number; vol: number }[],
  ): number {
    const o = this.optionsSpec;
    if (!o) return s.startPrice;
    const found = priced?.find((e) => e.expiry === s.expiry);
    const t = found?.t ?? Math.max(0, (s.expiry ?? now) - now) / MS_PER_YEAR;
    const atm = found?.vol ?? (t > 0 ? Math.sqrt(this.expiryVariance(s.expiry!, now) / t) : this.atmVol());
    const spot = this.fair.get(s.underlying ?? '') ?? 0;
    const vol = this.skewedVol(s, atm, t);
    // The venue's quoter rests its quotes this far (in price points) either side of the belief; vega is a whole unit of
    // volatility's, a point a hundredth of it.
    if (this.quoterVolPoints !== undefined) {
      this.quoteHalf.set(s.symbol, this.quoterVolPoints * 0.01 * optionVega(spot, s.strike!, t, vol, o.rate));
    }
    return optionPrice(s.right!, spot, s.strike!, t, vol, o.rate);
  }

  /**
   * The options desk's volatility, once a tick while it is open: the wander steps (one draw from the desk's stream),
   * and in the stocks' hours the underlying's return since the last sample, once a `VOL_SAMPLE_MS`, joins the realised
   * variance. Shut, the sample is dropped so the overnight gap is never read as a return.
   */
  private stepVolatility(now: number, dt: number, open: boolean, random: Random): void {
    const o = this.optionsSpec!;
    const v = this.volatility;
    const hours = dt / MS_PER_HOUR;
    v.wander += o.wander.hourlyVol * Math.sqrt(hours) * random.normal() - v.wander * o.wander.reversionPerHour * hours;
    if (!open) {
      v.lastAt = -1;
      return;
    }
    const spot = this.fair.get(o.underlying) ?? 0;
    if (v.lastAt < 0) {
      v.last = spot;
      v.lastAt = now;
      return;
    }
    const gap = now - v.lastAt;
    if (gap < VOL_SAMPLE_MS) return;
    const r = Math.log(spot / v.last);
    const weight = 1 - Math.exp((-Math.LN2 * gap) / o.halfLifeMs);
    v.variance += weight * ((r * r) / (gap / 1000) - v.variance);
    v.last = spot;
    v.lastAt = now;
  }

  /**
   * Another desk's fair values: each sector's factor, taken by each instrument at its `beta` (signed: the dollar's
   * wander lifts one pair and lowers another), and each instrument's own wander back to its anchor, drawn from the
   * desk's own stream, and its own jumps where it has them. No regime and no market factor: each desk's plan adds its own.
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
      if (deskOf(s) !== desk || s.constituents || isDerived(s)) continue;
      const fair = this.fair.get(s.symbol) ?? s.startPrice;
      const anchor = this.anchor.get(s.symbol) ?? s.startPrice;
      const common = (fair * (s.beta ?? 1) * (moves.get(s.sector) ?? 0)) / 10_000;
      const reversion = Math.min(1, this.factorSpec.ownReversionPerHour * hours);
      let next = fair + (anchor - fair) * reversion + s.hourlyVol * Math.sqrt(hours) * random.normal() + common;
      // Now and then a burst of orders shoves the price at once, as a stock's are, and the anchor stays: what a
      // derived instrument's slower crowd (a cross) lags behind. An instrument without jumps draws nothing for them.
      if (s.jumpsPerSecond > 0 && random.chance((s.jumpsPerSecond * dt) / 1000)) next += s.jumpSize * random.normal();
      this.anchor.set(s.symbol, anchor + common);
      this.fair.set(s.symbol, Math.max(1, next));
      if (s.reads) this.read(s);
    }
    // Each lease wanders back toward its own rate, on the desk's stream. A desk without leases draws nothing for them.
    for (const s of this.leased.get(desk) ?? []) {
      const l = s.lease!;
      const now = this.leases.get(s.symbol) ?? l.rate;
      const next = now + l.hourlyVol * Math.sqrt(hours) * random.normal() - (now - l.rate) * l.reversionPerHour * hours;
      this.leases.set(s.symbol, next);
      this.leaseStamp++;
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
      // A market with no currency but the dollar saves as it did before currencies, to the byte.
      ...(this.rates.size > 0 ? { rates: Object.fromEntries([...this.rates].map(([c, r]) => [c, r.mid])) } : {}),
      // A market whose leased desks are all shut saves as it did before leases, to the byte.
      ...(this.leasesLive()
        ? { leases: Object.fromEntries(this.leases), reads: Object.fromEntries(this.lastRead) }
        : {}),
      // Each option's strike, fixed at listing (the index then is not known when a save is loaded), while any is listed.
      ...(this.optionSpecs.size > 0
        ? { strikes: Object.fromEntries([...this.optionSpecs].map(([symbol, c]) => [symbol, c.strike!])) }
        : {}),
      // The volatility moves only while the desk is open, and only then is saved.
      ...(this.optionsOpen ? { vol: { ...this.volatility } } : {}),
      ...(this.optionsOpen && this.quoteHalf.size > 0 ? { half: Object.fromEntries(this.quoteHalf) } : {}),
    };
  }

  /** Whether a desk with a lease or a read is open: then the leases and the reads move, and are saved. */
  private leasesLive(): boolean {
    for (const s of this.instruments) if ((s.lease || s.reads) && this.openDesks.has(deskOf(s))) return true;
    return false;
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
    this.venueCache.clear();
    this.liveStamp++;
    for (const [c, mid] of Object.entries(saved.rates ?? {})) {
      const rate = this.rates.get(c);
      if (rate) rate.mid = mid;
    }
    for (const [m, l] of Object.entries(saved.leases ?? {})) if (this.leases.has(m)) this.leases.set(m, l);
    for (const [m, r] of Object.entries(saved.reads ?? {})) if (this.lastRead.has(m)) this.lastRead.set(m, r);
    this.leaseStamp++;
    for (const [m, k] of Object.entries(saved.strikes ?? {})) {
      const c = this.optionSpecs.get(m);
      if (c) c.strike = k;
    }
    if (saved.vol) Object.assign(this.volatility, saved.vol);
    for (const [m, h] of Object.entries(saved.half ?? {})) if (this.optionSpecs.has(m)) this.quoteHalf.set(m, h);
  }
}
