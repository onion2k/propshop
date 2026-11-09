// What an instrument is worth: the one place a quantity and a price become money. A stock's price is in cents and
// one share is one unit, so its value is quantity times price; a contract counts its price in its own points and
// holds many units. Everything that values a position, an order or a fill asks here, and a balance in another
// currency becomes dollars here alone (`toHome`).

import { MS_PER_DAY } from './clock';
import type { ContractSeriesSpec, ExchangeSpec, InstrumentKind, InstrumentSpec } from './types';

/** The desk every instrument and venue belongs to unless it says otherwise: the stocks, always open. */
export const STOCKS_DESK = 'stocks';

/** No instrument scaled: every symbol is worth its price in cents a unit. */
export const NO_SCALES: ReadonlyMap<string, number> = new Map();

/** Cents that one price point of one held unit is worth: the price unit times the multiplier. */
export function scaleOf(spec: InstrumentSpec): number {
  return (spec.priceUnit ?? 1) * (spec.multiplier ?? 1);
}

/**
 * `qty` units at `price` points, in cents. At a scale of one it is exactly `qty * price`, so a stock's figures are
 * what they were before instruments, to the bit.
 */
export function valueOf(scale: number, qty: number, price: number): number {
  return scale === 1 ? qty * price : qty * price * scale;
}

export function kindOf(spec: InstrumentSpec): InstrumentKind {
  return spec.kind ?? ((spec.constituents?.length ?? 0) > 0 ? 'index' : 'equity');
}

/** The grid an instrument is quoted on: its own where it has one, else the exchange's rule. */
export function tickOf(spec: Pick<InstrumentSpec, 'tickSize'>, exchangeTick: number): number {
  return spec.tickSize ?? exchangeTick;
}

export function deskOf(spec: { desk?: string }): string {
  return spec.desk ?? STOCKS_DESK;
}

/** Whether a venue lists an instrument: those it names, or, naming none, every venue of its desk. */
export function listedOn(spec: InstrumentSpec, venue: ExchangeSpec): boolean {
  return spec.venues ? spec.venues.includes(venue.id) : deskOf(spec) === deskOf(venue);
}

/** The most contracts of one series listed at once: a bound on the market's lists, whatever the content asks. */
export const MAX_LIVE_PER_SERIES = 6;

/** Contract `k` of a series, as an instrument. */
export function contractOf(series: ContractSeriesSpec, k: number): InstrumentSpec {
  return { ...series.contract, symbol: `${series.root}${k}`, expiry: k * series.period + series.expiresAt };
}

/** The contracts of a series listed at `now`: the first not yet expired and the next ones, `live` in all. */
export function liveContracts(series: ContractSeriesSpec, now: number): InstrumentSpec[] {
  const first = Math.max(0, Math.floor((now - series.expiresAt) / series.period) + 1);
  const out: InstrumentSpec[] = [];
  for (let k = first; out.length < Math.min(series.live, MAX_LIVE_PER_SERIES); k++) {
    const c = contractOf(series, k);
    if ((c.expiry ?? Infinity) > now) out.push(c);
  }
  return out;
}

/** Whether an instrument's fair value is its underlying's carried to expiry: a future. */
export function isCarried(spec: InstrumentSpec): boolean {
  return spec.carry !== undefined && spec.underlying !== undefined && spec.expiry !== undefined;
}

/** Whether an instrument's fair value is the product of two pairs': a cross rate. */
export function isCross(spec: InstrumentSpec): boolean {
  return spec.cross !== undefined;
}

/** Whether an instrument's fair value is derived (carried, or a cross) rather than drawn. */
export function isDerived(spec: InstrumentSpec): boolean {
  return isCarried(spec) || isCross(spec);
}

/** The firm's own currency: its cash is in its cents, and every other balance is counted in it. */
export const HOME = 'USD';

/** The currency an instrument's price is counted in. */
export function currencyOf(spec: InstrumentSpec): string {
  return spec.currency ?? HOME;
}

/**
 * What a currency's balance is worth at home, from the mid of the pair that prices it: `perPoint` is minor units
 * of the pair's quote per minor unit of its base, a point. The pair's base is the currency (the euro, in EUR/USD),
 * so a minor unit is worth `mid × perPoint` cents; or its quote is (the yen, in USD/JPY), so it is worth one over that.
 */
export interface Rate {
  mid: number;
  perPoint: number;
  inverse: boolean;
}

/**
 * A balance in a currency's minor units, in dollar cents: the one conversion, rounded here and nowhere else.
 * Multiplied for a currency its pair is priced in, divided for one its pair is priced by.
 */
export function toHome(currency: string, amount: number, rates: ReadonlyMap<string, Rate>): number {
  // A balance of nought is nought, not minus nought.
  return Math.round(inHome(currency, amount, rates)) || 0;
}

/**
 * The same conversion unrounded, for a block weighing a price (what a point of a lot is worth at home), never for
 * money held: that is `toHome`'s.
 */
export function inHome(currency: string, amount: number, rates: ReadonlyMap<string, Rate>): number {
  if (currency === HOME) return amount;
  const r = rates.get(currency);
  if (!r) throw new Error(`No rate for ${currency}`);
  const perMinor = r.mid * r.perPoint;
  return r.inverse ? amount / perMinor : amount * perMinor;
}

/** A currency pair as a fill sees it: what a lot buys (`units` of the base's minor units) and what it is priced in. */
export interface FxPair {
  base: string;
  quote: string;
  units: number;
}

/**
 * The places a price is written to: a point is the price unit in the quote's minor units, so a pip of the euro in
 * dollars (a hundredth of a cent) is four places of a dollar, a pip of the yen (a hundredth of a yen) two, and a
 * stock's cent two. `minor` is the quote currency's minor units in one.
 */
export function decimalsOf(spec: Pick<InstrumentSpec, 'priceUnit'>, minor: number): number {
  return Math.max(0, Math.round(-Math.log10((spec.priceUnit ?? 1) / minor)));
}

/** No currency but the dollar: nothing to convert. */
export const NO_RATES: ReadonlyMap<string, Rate> = new Map();

/** Days a rollover at this moment carries: one each weekday, three on Wednesday (the weekend's), none at the weekend. */
export function rolloverDays(now: number): number {
  const weekday = Math.floor(now / MS_PER_DAY) % 7;
  return weekday === 2 ? 3 : weekday < 5 ? 1 : 0;
}

/** Nights a storage charge at this moment carries: one each weekday, three on Friday (the weekend's), none at the weekend. */
export function storageDays(now: number): number {
  const weekday = Math.floor(now / MS_PER_DAY) % 7;
  return weekday === 4 ? 3 : weekday < 4 ? 1 : 0;
}
