import {
  IMPLIED_ITERATIONS,
  delta,
  gamma,
  impliedFrom,
  normalCdf,
  price,
  skewed,
  theta,
  vega,
} from '../src/sim/options';

// Hull's standard figures: spot 100, strike 100, a year, 5% interest, 20% volatility.
const S = 100;
const K = 100;
const T = 1;
const R = 0.05;
const V = 0.2;

describe('the normal distribution', () => {
  it('matches known values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 12);
    expect(normalCdf(1)).toBeCloseTo(0.8413447460685429, 12);
    expect(normalCdf(-1.96)).toBeCloseTo(0.0249978951482204, 12);
    expect(normalCdf(2)).toBeCloseTo(0.9772498680518208, 12);
    expect(normalCdf(-40)).toBe(0);
    expect(normalCdf(40)).toBe(1);
  });
});

describe('Black-Scholes', () => {
  it('prices a call and a put at known values', () => {
    expect(price('call', S, K, T, V, R)).toBeCloseTo(10.4505835721856, 8);
    expect(price('put', S, K, T, V, R)).toBeCloseTo(5.573526022256971, 8);
  });

  it('keeps put-call parity: call less put is the spot less the discounted strike', () => {
    for (const [s, k, t, v, r] of [
      [100, 90, 0.5, 0.3, 0.035],
      [52.97, 53.5, 1 / 365, 0.2, 0.035],
      [52.97, 52.5, 2 / 365, 0.45, 0.035],
      [80, 120, 2, 0.1, 0],
    ] as const) {
      const parity = price('call', s, k, t, v, r) - price('put', s, k, t, v, r);
      expect(parity).toBeCloseTo(s - k * Math.exp(-r * t), 10);
    }
  });

  it('has the greeks of the standard example', () => {
    expect(delta('call', S, K, T, V, R)).toBeCloseTo(0.6368306511756191, 10);
    expect(delta('put', S, K, T, V, R)).toBeCloseTo(0.6368306511756191 - 1, 10);
    expect(gamma(S, K, T, V, R)).toBeCloseTo(0.018762017345846895, 10);
    expect(vega(S, K, T, V, R)).toBeCloseTo(37.52403469169379, 8);
    expect(theta('call', S, K, T, V, R)).toBeCloseTo(-6.414027546438197, 8);
  });

  it('has greeks that are the price differences they claim to be', () => {
    const h = 1e-4;
    for (const right of ['call', 'put'] as const) {
      const d = (price(right, S + h, K, T, V, R) - price(right, S - h, K, T, V, R)) / (2 * h);
      expect(delta(right, S, K, T, V, R)).toBeCloseTo(d, 6);
      const th = -(price(right, S, K, T + h, V, R) - price(right, S, K, T - h, V, R)) / (2 * h);
      expect(theta(right, S, K, T, V, R)).toBeCloseTo(th, 5);
      const ve = (price(right, S, K, T, V + h, R) - price(right, S, K, T, V - h, R)) / (2 * h);
      expect(vega(S, K, T, V, R)).toBeCloseTo(ve, 5);
    }
    const g = (delta('call', S + h, K, T, V, R) - delta('call', S - h, K, T, V, R)) / (2 * h);
    expect(gamma(S, K, T, V, R)).toBeCloseTo(g, 6);
  });

  it('is its intrinsic value at expiry or with no volatility', () => {
    expect(price('call', 105, 100, 0, V, R)).toBe(5);
    expect(price('call', 95, 100, 0, V, R)).toBe(0);
    expect(price('put', 95, 100, 0, V, R)).toBe(5);
    expect(price('put', 95, 100, 1, 0, 0)).toBe(5);
    expect(delta('call', 105, 100, 0, V, R)).toBe(1);
    expect(delta('put', 105, 100, 0, V, R)).toBe(0);
    expect(gamma(105, 100, 0, V, R)).toBe(0);
  });
});

describe('the implied volatility', () => {
  it('inverts the price, for calls and puts, in and out of the money', () => {
    for (const right of ['call', 'put'] as const)
      for (const k of [90, 100, 110])
        for (const v of [0.05, 0.2, 0.8]) {
          const p = price(right, S, k, 0.25, v, R);
          expect(impliedFrom(right, p, S, k, 0.25, R)).toBeCloseTo(v, 6);
        }
  });

  it('is nothing for a price no volatility makes', () => {
    expect(impliedFrom('call', 0.01, 105, 100, T, R)).toBeNull();
    expect(impliedFrom('call', 500, S, K, T, R)).toBeNull();
    expect(impliedFrom('put', 0, S, K, T, R)).toBeNull();
    expect(impliedFrom('call', 5, S, K, 0, R)).toBeNull();
  });

  it('stops at its named bound', () => {
    expect(IMPLIED_ITERATIONS).toBeGreaterThan(20);
    expect(IMPLIED_ITERATIONS).toBeLessThanOrEqual(100);
  });
});

describe('the skew', () => {
  it('leaves the at-the-money volatility alone and tilts the rest, puts dearer', () => {
    expect(skewed(0.2, 100, 100, 0.1)).toBe(0.2);
    // A strike 1% below the forward is ten per cent dearer, one 1% above ten per cent cheaper.
    expect(skewed(0.2, 99, 100, 0.1)).toBeCloseTo(0.2 * 1.1, 2);
    expect(skewed(0.2, 101, 100, 0.1)).toBeCloseTo(0.2 * 0.9, 2);
    // Never negative, however far.
    expect(skewed(0.2, 300, 100, 0.1)).toBeGreaterThan(0);
  });
});
