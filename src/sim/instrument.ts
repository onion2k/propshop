// What an instrument is worth: the one place a quantity and a price become money. A stock's price is in cents and
// one share is one unit, so its value is quantity times price; a contract counts its price in its own points and
// holds many units. Everything that values a position, an order or a fill asks here.

import type { InstrumentKind, InstrumentSpec } from './types';

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
