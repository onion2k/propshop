import { CONTENT, REGIMES } from '../src/content';
import { Game, MS_PER_MINUTE, TICK_MS, isMarketOpen, regimeFor, type SavedGame } from '../src/sim';
import { driftSign } from '../src/sim/regime';
import { MARKET_CLOSE, MARKET_OPEN } from '../src/sim/clock';

function dayOf(seed: number, id: string, from = 0): number {
  for (let d = from; d < 400; d++) if (d % 7 < 5 && regimeFor(REGIMES, seed, d).id === id) return d;
  throw new Error(`no ${id} day`);
}

function openOn(g: Game, day: number) {
  g.now = day * 86_400_000 + MARKET_OPEN - MS_PER_MINUTE;
  while (!isMarketOpen(g.now)) g.step();
}

describe('regimes', () => {
  it('are a function of the seed and the day, with every kind coming', () => {
    const a = regimeFor(REGIMES, 7, 3);
    expect(regimeFor(REGIMES, 7, 3)).toBe(a);
    const ids = new Set<string>();
    for (let d = 0; d < 60; d++) ids.add(regimeFor(REGIMES, 7, d).id);
    expect(ids.size).toBe(4);
    expect(regimeFor(REGIMES, 8, 3).id === a.id && regimeFor(REGIMES, 8, 4).id === regimeFor(REGIMES, 7, 4).id).toBe(
      false,
    );
    const signs: number[] = [];
    for (let d = 0; d < 20; d++) for (let i = 0; i < 3; i++) signs.push(driftSign(7, d, i));
    expect(signs.some((s) => s === 1)).toBe(true);
    expect(signs.some((s) => s === -1)).toBe(true);
  });

  it('names the day from the open, and the report keeps it', { timeout: 60_000 }, () => {
    const g = new Game(CONTENT, 7);
    expect(g.snapshot().regime).toBeNull();
    const day = dayOf(7, 'calm');
    openOn(g, day);
    expect(g.snapshot().regime?.id).toBe('calm');
    while (isMarketOpen(g.now)) g.step(MS_PER_MINUTE);
    expect(g.days[0]?.regime).toBe('calm');
    expect(g.snapshot().regime?.id).toBe('calm');
    const b = Game.load(CONTENT, JSON.parse(JSON.stringify(g.save())) as SavedGame);
    expect(b.seed).toBe(7);
    expect(b.market.regime.id).toBe('calm');
  });

  it('gives a choppy day more gaps than a calm one', { timeout: 120_000 }, () => {
    const gaps = (id: string) => {
      const g = new Game(CONTENT, 9);
      openOn(g, dayOf(9, id));
      for (let i = 0; i < (10 * MS_PER_MINUTE) / TICK_MS; i++) g.step();
      return g.firm.stats.gapsSeen;
    };
    expect(gaps('choppy')).toBeGreaterThan(gaps('calm') * 1.5);
  });

  it('gives a news-heavy day more headlines', { timeout: 60_000 }, () => {
    const count = (id: string) => {
      const g = new Game(CONTENT, 11);
      const day = dayOf(11, id);
      g.now = day * 86_400_000;
      g.step();
      return g.news.scheduled.filter((h) => Math.floor(h.at / 86_400_000) === day).length;
    };
    expect(count('news')).toBeGreaterThan(count('calm') * 2);
  });

  it('drifts a trending day the way its sign says, over the session', { timeout: 120_000 }, () => {
    const g = new Game(CONTENT, 13);
    // No news, so the anchor moves by the drift and nothing else.
    g.news.regimeFor = () => ({ newsRate: 0, newsSize: 0 });
    g.news.scheduled = [];
    const day = dayOf(13, 'trending');
    openOn(g, day);
    const start = new Map(g.market.anchor);
    while (isMarketOpen(g.now)) g.step(MS_PER_MINUTE);
    const regime = regimeFor(REGIMES, 13, day);
    g.market.stocks.forEach((s, i) => {
      const moved = g.market.anchor.get(s.symbol)! - start.get(s.symbol)!;
      const expected = (driftSign(13, day, i) * regime.driftBps * start.get(s.symbol)!) / 10_000;
      expect(moved).toBeCloseTo(expected, 0);
    });
    expect(MARKET_CLOSE - MARKET_OPEN).toBeGreaterThan(0);
  });
});
