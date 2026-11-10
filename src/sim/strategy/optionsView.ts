// The options desk as a block sees it (plans/desk-options.md, 7d): each live option with its implied volatility,
// inverted from its book's mid by `impliedFrom`, and the tools the three options blocks share. The view is built when
// a block first reads it, and an option's volatility when a block first reads that; both are kept while their inputs
// stand, so a firm with no options block on does no inversion at all.

import { MS_PER_DAY, MS_PER_YEAR } from '../clock';
import { impliedFrom } from '../options';
import {
  bestAcross,
  carryFactor,
  type ContractView,
  type MarketView,
  type OptionStatic,
  type OptionView,
  type OptionsView,
} from './types';

/**
 * How finely time is counted in an implied volatility, so that a cached one is the same as one worked out again after a
 * load: the time left is read at the last multiple of this (a fiftieth of the time left, from a tenth of a second to ten
 * seconds), which moves the volatility by far less than a tick of price.
 */
export function timeStep(left: number): number {
  return Math.max(100, Math.min(10_000, left / 50));
}

/** The most entries either map holds: twelve options are live, and a day's symbols are not those of the day before. */
export const MAX_IMPLIED_ENTRIES = 48;

interface Entry {
  mid: number;
  spot: number;
  at: number;
  iv: number | null;
}

/**
 * A firm's implied volatilities kept while they stand: an option's, from the same price, spot and (coarsely counted)
 * time. Pure memo: the value is the one `impliedFrom` gives for the key, so a reloaded game, which starts it empty,
 * works out the same numbers. One entry a symbol for the view's own mid and one for a mid a block asks about; twelve
 * options at most are live, so it is bounded by the series.
 */
export class ImpliedCache {
  /** How many inversions have been worked out: what the tests and the profile count. */
  computed = 0;
  private readonly seen = new Map<string, Entry>();
  private readonly asked = new Map<string, Entry>();

  /** The volatility that makes `mid` the price of the option; `book` for the view's own, else a block's question. */
  at(
    symbol: string,
    o: OptionStatic,
    mid: number,
    spot: number,
    now: number,
    rate: number,
    book: boolean,
  ): number | null {
    const map = book ? this.seen : this.asked;
    const step = timeStep(o.expiry - now);
    const at = Math.floor(now / step) * step;
    const kept = map.get(symbol);
    if (kept && kept.mid === mid && kept.spot === spot && kept.at === at) return kept.iv;
    this.computed++;
    if (map.size >= MAX_IMPLIED_ENTRIES) map.clear();
    const iv = impliedFrom(o.right, mid, spot, o.strike, (o.expiry - at) / MS_PER_YEAR, rate);
    map.set(symbol, { mid, spot, at, iv });
    return iv;
  }
}

/**
 * The options of one view before anyone has read them: a block reads `options.chain` and the chain is built then.
 * A plain object with getters on its prototype, so every view can carry one at the cost of allocating it, which a
 * getter written into the view itself would not be.
 */
export class LazyOptions implements OptionsView {
  private built: OptionsView | undefined;
  private shared: { rate: number; chain: Readonly<Record<string, OptionStatic>> };
  private view: OptionsInput;

  constructor(
    shared: { rate: number; chain: Readonly<Record<string, OptionStatic>> },
    private readonly calendar: { todaysReleases(now: number): readonly number[] },
    view: OptionsInput,
    private readonly cache: ImpliedCache,
  ) {
    this.shared = shared;
    this.view = view;
  }

  /**
   * Point it at the next view, forgetting what was built for the last: a firm keeps one of these and aims it at each
   * view it makes, rather than allocating one for every decision.
   */
  aim(shared: { rate: number; chain: Readonly<Record<string, OptionStatic>> }, view: OptionsInput): this {
    this.shared = shared;
    this.view = view;
    this.built = undefined;
    return this;
  }

  private get parts(): OptionsView {
    return (this.built ??= buildOptions(
      this.shared.chain,
      this.shared.rate,
      this.calendar.todaysReleases(this.view.now),
      this.view,
      this.cache,
    ));
  }

  get rate(): number {
    return this.shared.rate;
  }

  get releases(): readonly number[] {
    return this.parts.releases;
  }

  get chain(): Readonly<Record<string, OptionView>> {
    return this.parts.chain;
  }

  impliedAt(symbol: string, price: number): number | null {
    return this.parts.impliedAt(symbol, price);
  }
}

/** The part of a view the options are worked out from. */
export type OptionsInput = Pick<MarketView, 'now' | 'exchanges' | 'quotes' | 'latency' | 'contracts' | 'symbols'>;

/**
 * The options view for the live options `chain`, a function of the firm's own sight of the books: each option's
 * underlying priced from its book's mid, else from the nearest future's less its carry; its volatility from its own
 * book's mid. Both worked out on first read.
 */
export function buildOptions(
  chain: Readonly<Record<string, OptionStatic>>,
  rate: number,
  releases: readonly number[],
  view: OptionsInput,
  cache: ImpliedCache,
): OptionsView {
  const spots = new Map<string, number | null>();
  const spotOf = (underlying: string): number | null => {
    const kept = spots.get(underlying);
    if (kept !== undefined) return kept;
    const found = underlyingMid(view, underlying);
    spots.set(underlying, found);
    return found;
  };
  const impliedAt = (symbol: string, price: number): number | null => {
    const o = chain[symbol];
    if (!o) return null;
    const spot = spotOf(o.underlying);
    return spot === null ? null : cache.at(symbol, o, price, spot, view.now, rate, false);
  };
  const ctx: OptionsContext = { view, rate, cache, spotOf };
  const out: Record<string, OptionView> = {};
  for (const symbol in chain) out[symbol] = new LiveOption(symbol, chain[symbol]!, ctx);
  return { rate, releases, chain: out, impliedAt };
}

/**
 * One live option for a block: the listing's facts, and the spot and the implied volatility worked out on first read
 * (class getters, so building a dozen of them for every decision costs little).
 */
class LiveOption implements OptionView {
  private ivSeen: number | null | undefined;

  constructor(
    private readonly symbol: string,
    private readonly o: OptionStatic,
    private readonly ctx: OptionsContext,
  ) {}

  get right(): 'call' | 'put' {
    return this.o.right;
  }
  get strike(): number {
    return this.o.strike;
  }
  get expiry(): number {
    return this.o.expiry;
  }
  get underlying(): string {
    return this.o.underlying;
  }
  get multiplier(): number {
    return this.o.multiplier;
  }

  get spot(): number | null {
    return this.ctx.spotOf(this.o.underlying);
  }

  get iv(): number | null {
    if (this.ivSeen !== undefined) return this.ivSeen;
    const { view, rate, cache } = this.ctx;
    const b = bestAcross(view as MarketView, this.symbol);
    const spot = this.spot;
    this.ivSeen =
      b.bid && b.ask && spot !== null
        ? cache.at(this.symbol, this.o, (b.bid.price + b.ask.price) / 2, spot, view.now, rate, true)
        : null;
    return this.ivSeen;
  }
}

/** What the options of one view share: the view they are read from, the rate, the cache and the spot of an underlying. */
interface OptionsContext {
  view: OptionsInput;
  rate: number;
  cache: ImpliedCache;
  spotOf: (underlying: string) => number | null;
}

/** The underlying's price as the firm sees it: its own book's mid, else the nearest future's, less its carry. */
export function underlyingMid(view: OptionsInput, underlying: string): number | null {
  const own = bestAcross(view as MarketView, underlying);
  if (own.bid && own.ask) return (own.bid.price + own.ask.price) / 2;
  const near = futuresOn(view, underlying)[0];
  if (!near) return null;
  const f = bestAcross(view as MarketView, near[0]);
  if (!f.bid || !f.ask) return null;
  // The carry is counted at the last whole second: a spot that moved with every tick of the clock would be a new input
  // to every volatility every decision, for a change of a billionth.
  return (f.bid.price + f.ask.price) / 2 / carryFactor(near[1], Math.floor(view.now / 1000) * 1000);
}

/** What `futuresOn` found, kept for the contracts and the symbols it was asked of (both stand while the listing does). */
const futuresKept = new WeakMap<object, WeakMap<object, Map<string, [string, ContractView][]>>>();

/**
 * The watched futures on an underlying, soonest expiry first (the underlying itself need not be watched). Kept, and
 * the same array each time, for as long as the view's contracts and symbols are the same objects: a block asks every
 * decision. A block reads it and never changes it.
 */
export function futuresOn(
  view: Pick<MarketView, 'contracts' | 'symbols'>,
  underlying: string,
  after = -Infinity,
): [string, ContractView][] {
  const contracts = view.contracts;
  if (!contracts) return [];
  let bySymbols = futuresKept.get(contracts);
  if (!bySymbols)
    futuresKept.set(contracts, (bySymbols = new WeakMap<object, Map<string, [string, ContractView][]>>()));
  let found = bySymbols.get(view.symbols);
  if (!found) bySymbols.set(view.symbols, (found = new Map<string, [string, ContractView][]>()));
  const key = `${underlying}|${after}`;
  let list = found.get(key);
  if (!list) {
    list = Object.entries(contracts)
      .filter(([s, c]) => c.underlying === underlying && c.expiry > after && view.symbols.includes(s))
      .sort((a, b) => a[1].expiry - b[1].expiry);
    found.set(key, list);
  }
  return list;
}

/** The exchange an option's book is on, as the view lists it. */
export function venueOf(view: Pick<MarketView, 'exchanges' | 'quotes'>, symbol: string): string | null {
  for (const e of view.exchanges) if (view.quotes[e]?.[symbol]) return e;
  return null;
}

/** The first moment of the day an option expires on, ms. */
export function dayStart(expiry: number): number {
  return Math.floor(expiry / MS_PER_DAY) * MS_PER_DAY;
}

/** The soonest expiry among the options still live at `now`, or null. */
export function soonestExpiry(options: OptionsView, now: number): number | null {
  let best: number | null = null;
  for (const o of Object.values(options.chain))
    if (o.expiry > now && (best === null || o.expiry < best)) best = o.expiry;
  return best;
}
