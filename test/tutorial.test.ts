import { CONTENT, STAGES, TUTORIAL, introSteps, shows, type Feature } from '../src/content';
import { Game, isMarketOpen } from '../src/sim';
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
  it('has ten steps for stage 1, each with words and a page, pointing at things that exist and are shown', () => {
    expect(TUTORIAL.map((t) => t.id)).toEqual([
      'welcome',
      'watchlist',
      'exchanges',
      'clock',
      'blocks',
      'params',
      'shop',
      'risk',
      'reports',
      'go',
    ]);
    // Everything a stage 1 card points at is on the screen of a new game.
    const targets = ['pages', 'watchlist', 'quotes', 'speed', 'firm', 'strategy', 'shop', 'risk', 'tabs'];
    for (const step of TUTORIAL) {
      expect(step.text.length).toBeGreaterThan(80);
      expect(['market', 'strategy', 'reports']).toContain(step.page);
      if (step.target) expect(targets).toContain(step.target);
    }
    expect(TUTORIAL[0]!.enter?.speed).toBe(0);
  });

  it('never switches a block on, and names nothing that stage 1 hides', () => {
    for (const step of TUTORIAL) {
      expect(step.enter?.enable ?? []).toEqual([]);
      expect(step.text).not.toMatch(/arbitrage|\bgaps?\b|\brace|\bdesk\b|microscope|market maker|dark web|rivals?\b/i);
    }
  });

  it('gives each later stage intro cards that exist, and points them at things their stage shows', () => {
    const pageOf: Record<string, string> = { gaps: 'gaps', 'desk-ticket': 'page:desk' };
    for (const st of STAGES) {
      expect(introSteps(st.id).map((t) => t.id)).toEqual(st.intro);
      if (st.id > 1) expect(st.intro.length).toBeGreaterThan(0);
      for (const step of introSteps(st.id)) {
        expect(step.text.length).toBeGreaterThan(80);
        const feature = step.target ? pageOf[step.target] : undefined;
        if (feature) expect(shows(feature as Feature, st.id)).toBe(true);
        expect(step.enter?.enable ?? []).toEqual([]);
      }
    }
    expect(introSteps(2)[0]!.target).toBe('gaps');
    expect(introSteps(4)[0]!.target).toBe('desk-ticket');
  });

  it('waits at the clock for the open at speed', () => {
    const g = new Game(CONTENT, 61);
    const clock = TUTORIAL.find((t) => t.id === 'clock')!.waitFor!;
    expect(clock.check(g.snapshot())).toBe(false);
    g.skipToOpen();
    g.setSpeed(10);
    while (!isMarketOpen(g.now)) g.step();
    expect(clock.check(g.snapshot())).toBe(true);
  });

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
