// The options venue's customers (plans/desk-options.md, 7f): who takes the quoter's quotes. They are net buyers of
// options, most of all of the out-of-the-money ones (insurance and lottery tickets); a share of the flow is informed and
// takes the quote that lags the fair value; and they come in sizes of contracts, not hundreds. Every draw is from the
// venue's own stream.
import { Exchange } from '../src/sim/exchange';
import type { Trade } from '../src/sim/orderbook';
import { Random } from '../src/sim/random';
import type { ExchangeSpec } from '../src/sim';

const DT = 2;
type Quoter = NonNullable<ExchangeSpec['quoter']>;

interface Option {
  right: 'call' | 'put';
  strike: number;
  underlying: string;
}

/** A bare venue listing one option `X` on an underlying `U` at 1000, quoted at a belief of 100 with a wide half-spread. */
function venue(quoter: Partial<Quoter>, option: Option, lag = 100) {
  const spec: ExchangeSpec = {
    id: 'Q',
    name: 'Customers test',
    city: 'Nowhere',
    feePerShare: 0,
    lag,
    noise: 0,
    quoter: { halfSpreadVol: 1, size: 1000, takeRate: 0, ...quoter },
  };
  const ex = new Exchange(spec, []);
  ex.list({ symbol: 'X', ...option }, 100);
  const random = Random.derive(1, 'crowd:Q');
  const fair = new Map([
    ['X', 100],
    ['U', 1000],
  ]);
  const half = new Map([['X', 3]]);
  let now = 0;
  const trades: Trade[] = [];
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += DT) {
      now += DT;
      ex.step(now, DT, fair, 1, random, half);
      for (const x of ex.tickTrades) trades.push(x.trade);
    }
  };
  /** Every trade so far (the exchange's own tape keeps only the last forty). */
  const tape = () => trades;
  return { ex, fair, run, random, tape, now: () => now };
}

const call = (strike: number): Option => ({ right: 'call', strike, underlying: 'U' });
const put = (strike: number): Option => ({ right: 'put', strike, underlying: 'U' });
const BUY = { otm: 0.9, atm: 0.6, itm: 0.4, span: 0.02 };

/** The share of customer trades that were buys, over `ms` of a busy venue. */
function buyShare(option: Option, ms = 60_000) {
  const t = venue({ takeRate: 30, buy: BUY }, option);
  t.run(ms);
  const trades = t.tape();
  return { share: trades.filter((x) => x.aggressor === 'buy').length / trades.length, n: trades.length };
}

describe('customers who are net buyers of options', () => {
  it('buy an out-of-the-money option nine times in ten, call or put', () => {
    for (const option of [call(1100), put(900)]) {
      const r = buyShare(option);
      expect(r.n).toBeGreaterThan(300);
      expect(r.share, `${option.right} ${option.strike}`).toBeGreaterThan(0.82);
    }
  });

  it('buy at the money six times in ten, and an in-the-money option less often', () => {
    const atm = buyShare(call(1000));
    expect(atm.share).toBeGreaterThan(0.52);
    expect(atm.share).toBeLessThan(0.68);
    for (const option of [call(900), put(1100)]) {
      const itm = buyShare(option);
      expect(itm.share, `${option.right} ${option.strike}`).toBeLessThan(0.47);
    }
  });

  it('are an even toss on a book with no buy bias, or an instrument that is not an option', () => {
    const plain = venue({ takeRate: 30 }, call(1100));
    plain.run(60_000);
    const trades = plain.tape();
    const share = trades.filter((x) => x.aggressor === 'buy').length / trades.length;
    expect(share).toBeGreaterThan(0.45);
    expect(share).toBeLessThan(0.55);
  });

  it('buy puts more than calls where the puts have shares of their own: insurance against overwriting', () => {
    const asym = { ...BUY, otm: 0.7, puts: { otm: 0.95, atm: 0.7, itm: 0.5 } };
    const share = (option: Option) => {
      const t = venue({ takeRate: 30, buy: asym }, option);
      t.run(60_000);
      return t.tape().filter((x) => x.aggressor === 'buy').length / t.tape().length;
    };
    expect(share(put(900))).toBeGreaterThan(0.9);
    expect(share(call(1100))).toBeLessThan(0.76);
    expect(share(call(1100))).toBeGreaterThan(0.64);
    expect(share(put(1000))).toBeGreaterThan(0.64);
  });

  it('come in orders of up to orderSize contracts, the quoter’s size when none is given', () => {
    const small = venue({ takeRate: 30, orderSize: 4 }, call(1000));
    small.run(30_000);
    expect(small.tape().length).toBeGreaterThan(100);
    expect(Math.max(...small.tape().map((x) => x.size))).toBeLessThanOrEqual(4);
    const sized = venue({ takeRate: 30 }, call(1000));
    sized.run(30_000);
    expect(Math.max(...sized.tape().map((x) => x.size))).toBeGreaterThan(400);
  });
});

describe('informed customers', () => {
  // A belief that lags by five seconds, and a fair value a jump above it.
  const stale = (quoter: Partial<Quoter>, jump: number) => {
    const t = venue({ informed: { rate: 100, ticks: 2, size: 20 }, ...quoter }, call(1000), 5000);
    t.run(500);
    t.fair.set('X', 100 + jump);
    return t;
  };

  it('buy the ask when the fair value is over it, and sell the bid when it is under', () => {
    const up = stale({}, 40);
    const before = up.tape().length;
    up.run(300);
    const hit = up.tape().slice(before);
    expect(hit.length).toBeGreaterThan(0);
    expect(hit.every((x) => x.aggressor === 'buy')).toBe(true);
    expect(Math.max(...hit.map((x) => x.size))).toBeLessThanOrEqual(20);
    // Filled at the quoter's stale ask, well under what the thing is now worth.
    expect(Math.max(...hit.map((x) => x.price))).toBeLessThan(110);
    const down = stale({}, -40);
    const b = down.tape().length;
    down.run(300);
    const sold = down.tape().slice(b);
    expect(sold.length).toBeGreaterThan(0);
    expect(sold.every((x) => x.aggressor === 'sell')).toBe(true);
  });

  it('do nothing while the quote is within the margin of the fair value, and draw nothing', () => {
    const t = venue({ informed: { rate: 100, ticks: 2, size: 20 } }, call(1000), 5000);
    const probe = Random.load(t.random.save());
    t.run(1000);
    for (let i = 0; i < 1000 / (DT * 5); i++) probe.normal();
    expect(t.tape()).toHaveLength(0);
    expect(t.random.save()).toBe(probe.save());
  });

  it('are absent from a venue that sets none: the same jump is not taken', () => {
    const t = venue({}, call(1000), 5000);
    t.run(500);
    t.fair.set('X', 140);
    const before = t.tape().length;
    t.run(300);
    expect(t.tape().length).toBe(before);
  });

  it('stop once the quote has caught up with the fair value', () => {
    const t = stale({}, 40);
    t.run(30_000);
    const n = t.tape().length;
    t.run(2000);
    expect(t.tape().length).toBe(n);
  });
});
