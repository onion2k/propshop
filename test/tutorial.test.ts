import { CONTENT, TUTORIAL } from '../src/content';
import { Game, MS_PER_MINUTE, TICK_MS, isMarketOpen } from '../src/sim';
import { createStore, TUTORIAL_KEY, type Storage } from '../src/ui/store';

function memory(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('the tutorial', () => {
  it('has a dozen or so steps, each with words and a page, pointing at things that exist', () => {
    expect(TUTORIAL.length).toBeGreaterThan(10);
    const targets = ['pages', 'watchlist', 'quotes', 'speed', 'firm', 'strategy', 'shop', 'risk', 'tabs'];
    for (const step of TUTORIAL) {
      expect(step.text.length).toBeGreaterThan(80);
      expect(['market', 'strategy', 'reports']).toContain(step.page);
      if (step.target) expect(targets).toContain(step.target);
    }
    expect(TUTORIAL[0]!.enter?.speed).toBe(0);
  });

  it(
    'waits at the clock for the open at speed, at the gap for one, and at the race for an order',
    { timeout: 60_000 },
    () => {
      const g = new Game(CONTENT, 61);
      const clock = TUTORIAL.find((t) => t.id === 'clock')!.waitFor!;
      const gap = TUTORIAL.find((t) => t.id === 'gap')!.waitFor!;
      const race = TUTORIAL.find((t) => t.id === 'race')!.waitFor!;
      expect(clock.check(g.snapshot())).toBe(false);
      g.skipToOpen();
      g.setSpeed(10);
      while (!isMarketOpen(g.now)) g.step();
      expect(clock.check(g.snapshot())).toBe(true);
      expect(gap.check(g.snapshot())).toBe(false);
      for (let i = 0; i < (20 * MS_PER_MINUTE) / TICK_MS && !race.check(g.snapshot()); i++) g.step();
      expect(gap.check(g.snapshot())).toBe(true);
      expect(race.check(g.snapshot())).toBe(true);
    },
  );

  it('keeps where it stands in the store, and starts fresh on a reset', () => {
    const storage = memory();
    const store = createStore(CONTENT, storage, 62);
    expect(store.getTutorial()).toEqual({ state: 'fresh' });
    store.setTutorial({ state: 'at', step: 3 });
    expect(storage.data.get(TUTORIAL_KEY)).toContain('"step":3');
    const again = createStore(CONTENT, storage, 63);
    expect(again.getTutorial()).toEqual({ state: 'at', step: 3 });
    again.setTutorial({ state: 'done' });
    expect(createStore(CONTENT, storage, 64).getTutorial()).toEqual({ state: 'done' });
    again.reset(1);
    expect(again.getTutorial()).toEqual({ state: 'fresh' });
    expect(storage.data.has(TUTORIAL_KEY)).toBe(false);
  });
});
