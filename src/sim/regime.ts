// Which kind of day each day is. A function of the seed and the day, so the news engine can know tomorrow's
// a day ahead and a save gets the same days as the game it came from. Nothing here is drawn from the game's
// running random source, which would make the answer depend on when it was asked.

import { MARKET_CLOSE, MARKET_OPEN } from './clock';
import type { RegimeSpec } from './types';

export function regimeFor(regimes: readonly RegimeSpec[], seed: number, day: number): RegimeSpec {
  const total = regimes.reduce((n, r) => n + r.weight, 0);
  let pick = (hash(seed, day) / 4294967296) * total;
  for (const r of regimes) {
    pick -= r.weight;
    if (pick < 0) return r;
  }
  const last = regimes[regimes.length - 1];
  if (!last) throw new Error('No regimes');
  return last;
}

/** The drift's sign for a stock on a day: up or down, from the same seed. */
export function driftSign(seed: number, day: number, symbolIndex: number): 1 | -1 {
  return hash(seed * 31 + symbolIndex + 1, day) % 2 === 0 ? 1 : -1;
}

/** Cents per ms of drift, from basis points over the session. */
export function driftPerMs(regime: RegimeSpec, price: number, sign: number): number {
  return (sign * (regime.driftBps / 10_000) * price) / (MARKET_CLOSE - MARKET_OPEN);
}

/** A small integer hash of two integers, mixed well enough that neighbouring days differ. */
function hash(a: number, b: number): number {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}
