import { MARKET_OPEN, MS_PER_SECOND } from '../src/sim/clock';
import { Exchange } from '../src/sim/exchange';
import { Random } from '../src/sim/random';
import { EXCHANGES, STOCKS, TICK } from './fixtures';

const harbor = EXCHANGES[0]!;
const fair = new Map(STOCKS.map((s) => [s.symbol, s.startPrice]));

function run(ex: Exchange, random: Random, from: number, ms: number, act = 1) {
  for (let t = from; t < from + ms; t += TICK) ex.step(t, TICK, fair, act, random);
  return from + ms;
}

describe('Exchange', () => {
  it('keeps a two-sided book with a tight spread once the crowd has arrived', () => {
    const ex = new Exchange(harbor, STOCKS);
    run(ex, new Random(1), MARKET_OPEN, 2 * MS_PER_SECOND);
    for (const s of STOCKS) {
      const q = ex.quote(s.symbol);
      expect(q.bid).not.toBeNull();
      expect(q.ask).not.toBeNull();
      const spread = ex.book(s.symbol).spread() ?? 99;
      expect(spread).toBeGreaterThanOrEqual(1);
      expect(spread).toBeLessThanOrEqual(5);
      expect(Math.abs((ex.book(s.symbol).mid() ?? 0) - s.startPrice)).toBeLessThan(6);
    }
  });

  it('prints trades on the tape and keeps the tape bounded', () => {
    const ex = new Exchange(harbor, STOCKS);
    run(ex, new Random(2), MARKET_OPEN, 30 * MS_PER_SECOND);
    const tape = ex.stocks.get('ABC')!.tape;
    expect(tape.length).toBeGreaterThan(5);
    expect(tape.length).toBeLessThanOrEqual(40);
    expect(ex.book('ABC').lastPrice).not.toBeNull();
  });

  it('follows a move in fair value within a few lags', () => {
    const ex = new Exchange(harbor, STOCKS);
    const random = new Random(3);
    let now = run(ex, random, MARKET_OPEN, 2 * MS_PER_SECOND);
    const moved = new Map(fair);
    moved.set('ABC', 4150);
    for (let i = 0; i < 1500; i++, now += TICK) ex.step(now, TICK, moved, 1, random);
    expect(Math.abs((ex.book('ABC').mid() ?? 0) - 4150)).toBeLessThan(6);
  });

  it('does nothing to the books when the market is closed, and empties them at the close', () => {
    const ex = new Exchange(harbor, STOCKS);
    let now = run(ex, new Random(4), MARKET_OPEN, 2 * MS_PER_SECOND);
    ex.submit('ABC', { owner: 'firm', side: 'buy', price: 4000, size: 100 }, now);
    const gone = ex.close();
    expect(gone).toEqual([{ symbol: 'ABC', owner: 'firm', id: expect.any(Number) as number }]);
    expect(ex.book('ABC').count()).toBe(0);
    now = run(ex, new Random(5), now, MS_PER_SECOND, 0);
    expect(ex.book('ABC').count()).toBe(0);
  });

  it('routes a firm order against the crowd and reports its trades for the tick', () => {
    const ex = new Exchange(harbor, STOCKS);
    const now = run(ex, new Random(6), MARKET_OPEN, 2 * MS_PER_SECOND);
    const ask = ex.quote('ABC').ask!;
    const { trades } = ex.submit('ABC', { owner: 'firm', side: 'buy', price: ask, size: 100, ioc: true }, now)!;
    expect(trades.length).toBeGreaterThan(0);
    expect(trades[0]!.buyer).toBe('firm');
    expect(ex.tickTrades.some((t) => t.trade.buyer === 'firm')).toBe(true);
  });

  it('saves and loads to the same quotes', () => {
    const ex = new Exchange(harbor, STOCKS);
    run(ex, new Random(7), MARKET_OPEN, 2 * MS_PER_SECOND);
    const copy = new Exchange(harbor, STOCKS);
    copy.load(JSON.parse(JSON.stringify(ex.save())) as ReturnType<Exchange['save']>);
    expect(copy.quote('ABC')).toEqual(ex.quote('ABC'));
    expect(copy.stocks.get('ABC')!.belief).toBe(ex.stocks.get('ABC')!.belief);
  });
});
