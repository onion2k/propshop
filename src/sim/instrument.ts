// What an instrument is worth: the one place a quantity and a price become money. A stock's price is in cents and
// one share is one unit, so its value is quantity times price; a contract counts its price in its own points and
// holds many units. Everything that values a position, an order or a fill asks here.

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
