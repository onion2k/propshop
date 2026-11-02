import { CONTENT, LESSONS } from '../src/content';
import { Game, MS_PER_MINUTE, MS_PER_SECOND, TICK_MS, isMarketOpen, type Snapshot } from '../src/sim';
import { infrastructureFrom } from '../src/sim/upgrades';

function fresh(): Snapshot {
  return new Game(CONTENT, 1).snapshot();
}

function after(seed: number, minutes: number, blocks: string[] = ['arbitrage']): Snapshot {
  const g = new Game(CONTENT, seed);
  for (const b of g.firm.blocks) b.enabled = blocks.includes(b.id);
  g.skipToOpen();
  for (let i = 0; i < (minutes * MS_PER_MINUTE) / TICK_MS; i++) g.step();
  return g.snapshot();
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

  it('gap: done once two exchanges are seen crossed', () => {
    const gap = LESSONS[0]!;
    const g = new Game(CONTENT, 2);
    g.skipToOpen();
    for (let i = 0; i < (3 * MS_PER_MINUTE) / TICK_MS; i++) g.step();
    expect(gap.done(g.snapshot())).toBe(true);
    expect(g.snapshot().gapsSeen).toBeGreaterThan(5);
  });

  it(
    'race and cost: done once arbitrage from home has lost a race, and more races than it won',
    { timeout: 60_000 },
    () => {
      const s = after(3, 12);
      expect(LESSONS[1]!.done(s)).toBe(true);
      expect(LESSONS[2]!.done(s)).toBe(true);
    },
  );

  it('home: done once momentum has earned', { timeout: 60_000 }, () => {
    const s = after(4, 20, ['momentum']);
    expect(LESSONS[3]!.done(s)).toBe(true);
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
