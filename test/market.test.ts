import { MARKET_CLOSE, MARKET_OPEN, MS_PER_MINUTE, MS_PER_SECOND } from '../src/sim/clock';
import { Market } from '../src/sim/market';
import { deriveStreams, saveStreams, loadStreams, type Streams } from '../src/sim/random';
import { EXCHANGES, STOCKS, TICK } from './fixtures';

const streams = (seed: number) =>
  deriveStreams(
    seed,
    EXCHANGES.map((e) => e.id),
  );

function run(m: Market, random: Streams, from: number, ms: number) {
  let closed = null;
  for (let t = from; t < from + ms; t += TICK) {
    const r = m.step(t, TICK, random.world, random.crowd);
    if (r.closed) closed = r.closed;
  }
  return { now: from + ms, closed };
}

describe('Market', () => {
  it('lets the two exchanges disagree, and crossed quotes appear and vanish', () => {
    const m = new Market(STOCKS, EXCHANGES);
    const random = streams(12);
    let now = run(m, random, MARKET_OPEN, 2 * MS_PER_SECOND).now;
    let crossed = 0;
    let ticks = 0;
    for (; ticks < 30000; ticks++, now += TICK) {
      m.step(now, TICK, random.world, random.crowd);
      const a = m.exchange('HARBOR').quote('ABC');
      const b = m.exchange('LAKESIDE').quote('ABC');
      if (a.ask !== null && b.bid !== null && a.ask < b.bid) crossed++;
      if (b.ask !== null && a.bid !== null && b.ask < a.bid) crossed++;
    }
    // Some of the minute is an arbitrage, most of it is not: that is the game.
    expect(crossed).toBeGreaterThan(5);
    expect(crossed).toBeLessThan(ticks / 20);
  });

  it('moves fair value toward a shock over its window', () => {
    const m = new Market(STOCKS, EXCHANGES);
    const random = streams(12);
    const before = m.fair.get('ABC')!;
    m.shock('ABC', 200, 10 * MS_PER_SECOND);
    run(m, random, MARKET_OPEN, 10 * MS_PER_SECOND);
    expect(m.anchor.get('ABC')).toBeCloseTo(4300, 6);
    // The fair value itself follows the anchor only slowly, so half a minute in it has moved but not arrived.
    run(m, random, MARKET_OPEN + 10 * MS_PER_SECOND, 30 * MS_PER_SECOND);
    expect(m.fair.get('ABC')!).toBeGreaterThan(before + 1);
  });

  it('reports the close once, with the other resting orders', () => {
    const m = new Market(STOCKS, EXCHANGES);
    const random = streams(13);
    const start = MARKET_CLOSE - 2 * MS_PER_SECOND;
    run(m, random, start, MS_PER_SECOND);
    m.exchange('HARBOR').submit('XYZ', { owner: 'firm', side: 'sell', price: 2600, size: 50 }, start + MS_PER_SECOND);
    const { closed } = run(m, random, start + MS_PER_SECOND, 2 * MS_PER_SECOND);
    expect(closed).toEqual([{ symbol: 'XYZ', owner: 'firm', id: expect.any(Number) as number }]);
    const again = run(m, random, MARKET_CLOSE + MS_PER_SECOND, MS_PER_SECOND);
    expect(again.closed).toBeNull();
  });

  it('samples history once a second per stock and keeps it bounded', () => {
    const m = new Market(STOCKS, EXCHANGES);
    run(m, streams(14), MARKET_OPEN, 20 * MS_PER_SECOND);
    const h = m.history.get('ABC')!;
    expect(h.length).toBe(20);
    expect(h[h.length - 1]!.mids.HARBOR).not.toBeNull();
    run(m, streams(15), MARKET_OPEN + 20 * MS_PER_SECOND, 16 * MS_PER_MINUTE);
    expect(m.history.get('ABC')!.length).toBe(900);
  });

  it('saves and loads whole', () => {
    const m = new Market(STOCKS, EXCHANGES);
    const random = streams(16);
    const { now } = run(m, random, MARKET_OPEN, 3 * MS_PER_SECOND);
    const copy = new Market(STOCKS, EXCHANGES);
    copy.load(JSON.parse(JSON.stringify(m.save())) as ReturnType<Market['save']>);
    const r2 = loadStreams(saveStreams(random));
    run(m, random, now, MS_PER_SECOND);
    run(copy, r2, now, MS_PER_SECOND);
    expect(copy.exchange('HARBOR').quote('ABC')).toEqual(m.exchange('HARBOR').quote('ABC'));
    expect(copy.fair.get('XYZ')).toBe(m.fair.get('XYZ'));
  });
});
