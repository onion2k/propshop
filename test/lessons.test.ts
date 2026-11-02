import { CONTENT, LESSONS, REGIMES } from '../src/content';
import { Game, MS_PER_MINUTE, MS_PER_SECOND, TICK_MS, isMarketOpen, regimeFor, type Snapshot } from '../src/sim';
import { infrastructureFrom } from '../src/sim/upgrades';

function fresh(): Snapshot {
  return new Game(CONTENT, 1).snapshot();
}

describe('lessons', () => {
  it('are eight, in order, each with words', () => {
    expect(LESSONS).toHaveLength(8);
    for (const l of LESSONS) {
      expect(l.task.length).toBeGreaterThan(20);
      expect(l.lesson.length).toBeGreaterThan(100);
      expect(l.terms.length).toBeGreaterThan(0);
    }
  });

  it('none is done at the start', () => {
    const s = fresh();
    for (const l of LESSONS) expect(l.done(s)).toBe(false);
  });

  it('gap: done once two exchanges are seen crossed', { timeout: 60_000 }, () => {
    const gap = LESSONS[0]!;
    // Gaps come with jumps, and a calm day has few: take a seed whose first day is choppy.
    let seed = 1;
    while (regimeFor(REGIMES, seed, 0).id !== 'choppy') seed++;
    const g = new Game(CONTENT, seed);
    g.skipToOpen();
    while (!isMarketOpen(g.now)) g.step();
    for (let i = 0; i < (15 * MS_PER_MINUTE) / TICK_MS && g.firm.stats.gapsSeen <= 5; i++) g.step();
    expect(gap.done(g.snapshot())).toBe(true);
    expect(g.snapshot().gapsSeen).toBeGreaterThan(5);
  });

  it(
    'race and cost: done once arbitrage from home has lost a race, and more races than it won',
    { timeout: 120_000 },
    () => {
      const g = new Game(CONTENT, 3);
      g.skipToOpen();
      let done = false;
      for (let i = 0; i < (40 * MS_PER_MINUTE) / TICK_MS && !done; i++) {
        g.step();
        if (i % 5000 === 0) done = LESSONS[1]!.done(g.snapshot()) && LESSONS[2]!.done(g.snapshot());
      }
      expect(done).toBe(true);
    },
  );

  it('home: done once momentum has earned', { timeout: 120_000 }, () => {
    const g = new Game(CONTENT, 4);
    for (const b of g.firm.blocks) b.enabled = b.id === 'momentum';
    g.skipToOpen();
    let done = false;
    for (let i = 0; i < (60 * MS_PER_MINUTE) / TICK_MS && !done; i++) {
      g.step();
      if (i % 5000 === 0) done = LESSONS[3]!.done(g.snapshot());
    }
    expect(done).toBe(true);
  });

  it('maker: done after ten market maker fills', { timeout: 30_000 }, () => {
    const g = new Game(CONTENT, 5);
    for (const b of g.firm.blocks) b.enabled = b.id === 'marketMaker';
    g.setBlock('marketMaker', { params: { halfSpread: 2 } });
    g.skipToOpen();
    for (let i = 0; i < (5 * MS_PER_MINUTE) / TICK_MS; i++) g.step();
    expect(LESSONS[4]!.done(g.snapshot())).toBe(true);
  });

  it('noise: done once a real and a noise headline have settled', { timeout: 30_000 }, () => {
    const g = new Game(CONTENT, 6);
    g.skipToOpen();
    let done = false;
    for (let d = 0; d < 5 && !done; d++) {
      while (!isMarketOpen(g.now)) g.step(MS_PER_SECOND);
      while (isMarketOpen(g.now) && !done) {
        g.step(MS_PER_MINUTE);
        done = LESSONS[5]!.done(g.snapshot());
      }
      g.skipToOpen();
    }
    expect(done).toBe(true);
  });

  it('seat: done once anything is bought', () => {
    const g = new Game(CONTENT, 7);
    expect(LESSONS[6]!.done(g.snapshot())).toBe(false);
    g.firm.infra = infrastructureFrom(CONTENT, { location: 'city', network: 'consumer', computer: 'laptop' });
    expect(LESSONS[6]!.done(g.snapshot())).toBe(true);
  });

  it('week: done on Monday of week two', () => {
    const g = new Game(CONTENT, 8);
    expect(LESSONS[7]!.done(g.snapshot())).toBe(false);
    g.now = 7 * 24 * 60 * MS_PER_MINUTE;
    expect(LESSONS[7]!.done(g.snapshot())).toBe(true);
  });
});
