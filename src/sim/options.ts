// Options, worked out: Black-Scholes for a European call or put on a price that pays nothing, its greeks, the
// volatility that makes a price (by bisection), and the skew. Pure floats in and out; the book rounds. Time is in
// years, volatility an annual share, theta a year's worth and vega a whole unit of volatility's: the callers scale.

export type Right = 'call' | 'put';

/** The most steps `impliedFrom` takes. Each halves a bracket of five units of volatility, so sixty reach 1e-18. */
export const IMPLIED_ITERATIONS = 60;

/** The volatility `impliedFrom` searches between. */
export const IMPLIED_LOW = 1e-4;
export const IMPLIED_HIGH = 5;

const SQRT_2PI = 2.506628274631;

/** The standard normal's cumulative distribution (Hart's rational approximation as West set it down: double precision). */
export function normalCdf(x: number): number {
  const ax = Math.abs(x);
  let c: number;
  if (ax > 37) c = 0;
  else {
    const e = Math.exp((-ax * ax) / 2);
    if (ax < 7.07106781186547) {
      let b = 3.52624965998911e-2 * ax + 0.700383064443688;
      b = b * ax + 6.37396220353165;
      b = b * ax + 33.912866078383;
      b = b * ax + 112.079291497871;
      b = b * ax + 221.213596169931;
      b = b * ax + 220.206867912376;
      c = e * b;
      b = 8.83883476483184e-2 * ax + 1.75566716318264;
      b = b * ax + 16.064177579207;
      b = b * ax + 86.7807322029461;
      b = b * ax + 296.564248779674;
      b = b * ax + 637.333633378831;
      b = b * ax + 793.826512519948;
      b = b * ax + 440.413735824752;
      c = c / b;
    } else {
      let b = ax + 0.65;
      b = ax + 4 / b;
      b = ax + 3 / b;
      b = ax + 2 / b;
      b = ax + 1 / b;
      c = e / b / SQRT_2PI;
    }
  }
  return x > 0 ? 1 - c : c;
}

/** The standard normal's density. */
export function normalPdf(x: number): number {
  return Math.exp((-x * x) / 2) / SQRT_2PI;
}

/** d1 and d2, or null where there is no time or no volatility left (the option is its intrinsic value). */
function ds(s: number, k: number, t: number, v: number, r: number): [number, number] | null {
  if (t <= 0 || v <= 0 || s <= 0 || k <= 0) return null;
  const sd = v * Math.sqrt(t);
  const d1 = (Math.log(s / k) + (r + (v * v) / 2) * t) / sd;
  return [d1, d1 - sd];
}

/** The price of a European option: spot `s`, strike `k`, `t` years, volatility `v`, interest `r`. */
export function price(right: Right, s: number, k: number, t: number, v: number, r: number): number {
  const d = ds(s, k, t, v, r);
  if (!d) {
    const df = t > 0 ? Math.exp(-r * t) : 1;
    return right === 'call' ? Math.max(0, s - k * df) : Math.max(0, k * df - s);
  }
  const df = Math.exp(-r * t);
  return right === 'call'
    ? s * normalCdf(d[0]) - k * df * normalCdf(d[1])
    : k * df * normalCdf(-d[1]) - s * normalCdf(-d[0]);
}

/** How far the price moves for a unit move in the spot. */
export function delta(right: Right, s: number, k: number, t: number, v: number, r: number): number {
  const d = ds(s, k, t, v, r);
  if (!d) return right === 'call' ? (s > k ? 1 : 0) : s < k ? -1 : 0;
  return right === 'call' ? normalCdf(d[0]) : normalCdf(d[0]) - 1;
}

/** How far the delta moves for a unit move in the spot; the same for a call and a put. */
export function gamma(s: number, k: number, t: number, v: number, r: number): number {
  const d = ds(s, k, t, v, r);
  return d ? normalPdf(d[0]) / (s * v * Math.sqrt(t)) : 0;
}

/** How far the price moves for a year passing (negative for a long): divide by 365 for a day. */
export function theta(right: Right, s: number, k: number, t: number, v: number, r: number): number {
  const d = ds(s, k, t, v, r);
  if (!d) return 0;
  const decay = (-s * normalPdf(d[0]) * v) / (2 * Math.sqrt(t));
  const df = Math.exp(-r * t);
  return right === 'call' ? decay - r * k * df * normalCdf(d[1]) : decay + r * k * df * normalCdf(-d[1]);
}

/** How far the price moves for a whole unit of volatility: divide by 100 for a point. The same for a call and a put. */
export function vega(s: number, k: number, t: number, v: number, r: number): number {
  const d = ds(s, k, t, v, r);
  return d ? s * normalPdf(d[0]) * Math.sqrt(t) : 0;
}

/**
 * The volatility at which the model gives `p`, by bisection between `IMPLIED_LOW` and `IMPLIED_HIGH` in at most
 * `IMPLIED_ITERATIONS` steps; null where no volatility does (below intrinsic, above the bound, or no time left).
 */
export function impliedFrom(right: Right, p: number, s: number, k: number, t: number, r: number): number | null {
  if (t <= 0 || p <= 0) return null;
  let lo = IMPLIED_LOW;
  let hi = IMPLIED_HIGH;
  if (p < price(right, s, k, t, lo, r) || p > price(right, s, k, t, hi, r)) return null;
  for (let i = 0; i < IMPLIED_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (price(right, s, k, t, mid, r) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The smallest share of the at-the-money volatility the skew leaves a strike. */
export const SKEW_FLOOR = 0.2;

/**
 * A strike's volatility from the at-the-money one: a straight tilt in log-moneyness, `slope` of the volatility for
 * each 1% the strike lies below the forward (puts dearer; above it, cheaper), never under `SKEW_FLOOR` of it.
 */
export function skewed(atm: number, k: number, forward: number, slope: number): number {
  if (k <= 0 || forward <= 0) return atm;
  return atm * Math.max(SKEW_FLOOR, 1 - slope * 100 * Math.log(k / forward));
}

/** What an option pays at expiry, in the underlying's price points: how far in the money it is, else nothing. */
export function intrinsic(right: Right, spot: number, strike: number): number {
  return right === 'call' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
}
