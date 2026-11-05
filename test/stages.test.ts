import { CONTENT, LESSONS, STAGES, introSteps, lessonStage, shows, stageOf, type Feature } from '../src/content';
import { BLOCKS } from '../src/sim';
import { createStore, PROGRESS_KEY, REVEAL_KEY, SAVE_KEY, STAGES_KEY, type Storage } from '../src/ui/store';

const done = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, 1000]));

describe('stageOf', () => {
  it('is 1 with nothing done, and each stage opens on the one lesson before it', () => {
    expect(stageOf({})).toBe(1);
    expect(stageOf(done('home'))).toBe(1);
    expect(stageOf(done('seat'))).toBe(2);
    expect(stageOf(done('seat', 'gap', 'cost'))).toBe(2);
    expect(stageOf(done('seat', 'race'))).toBe(3);
    expect(stageOf(done('seat', 'race', 'maker'))).toBe(4);
    expect(stageOf(done('seat', 'race', 'maker', 'used'))).toBe(5);
  });

  it('does not skip: a later opener without the one before it stays where it is', () => {
    expect(stageOf(done('race'))).toBe(1);
    expect(stageOf(done('seat', 'maker'))).toBe(2);
    expect(stageOf(done('week', 'used'))).toBe(1);
  });

  it('has every lesson in exactly one stage, and the lessons in stage order', () => {
    const listed = STAGES.flatMap((s) => s.lessons);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual(LESSONS.map((l) => l.id).sort());
    expect(LESSONS.map((l) => l.id)).toEqual(listed);
    for (const l of LESSONS) expect(lessonStage(l.id)).toBeDefined();
    for (const st of STAGES) {
      if (st.opensWith) expect(lessonStage(st.opensWith)).toBe(st.id - 1);
    }
  });
});

describe('shows', () => {
  const table: [Feature, number][] = [
    ['block:momentum', 1],
    ['block:arbitrage', 2],
    ['block:sniper', 2],
    ['gaps', 2],
    ['races', 2],
    ['tab:rivals', 2],
    ['block:marketMaker', 3],
    ['block:meanReversion', 3],
    ['block:newsReaction', 3],
    ['tab:news', 3],
    ['tab:dark', 3],
    ['page:desk', 4],
    ['microscope', 4],
    ['block:pairs', 5],
    ['block:indexArb', 5],
    ['block:script', 5],
    ['tab:lab', 5],
  ];
  it.each(table)('%s opens at stage %i and not before', (feature, at) => {
    for (let stage = 1; stage <= 5; stage++) expect(shows(feature, stage as 1)).toBe(stage >= at);
  });

  it('places every block the sim has', () => {
    for (const b of BLOCKS) {
      expect(shows(`block:${b.spec.id}`, 5)).toBe(true);
      expect(shows(`block:${b.spec.id}`, 1)).toBe(b.spec.id === 'momentum');
    }
  });

  it('gives each stage after the first intro cards', () => {
    for (const st of STAGES) expect(introSteps(st.id).length).toBe(st.id === 1 ? 0 : st.intro.length);
  });
});

function memory(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('the store and the stages', () => {
  it('starts a new game at stage 1 and writes the stages key', () => {
    const storage = memory();
    const store = createStore(CONTENT, storage, 1);
    expect(store.getStage()).toBe(1);
    expect(store.getIntro()).toBeNull();
    expect(storage.data.get(STAGES_KEY)).toBe('{"seen":1}');
  });

  it('opens stage 2 when seat is done, due an intro until it is dismissed, and keeps that across a reload', () => {
    const storage = memory();
    const store = createStore(CONTENT, storage, 1);
    store.game.firm.cash = 100_000_000_00;
    store.buyUpgrade('network', 'fibre');
    expect(store.getStage()).toBe(2);
    expect(store.getIntro()).toBe(2);
    store.dismissIntro();
    expect(store.getIntro()).toBeNull();
    store.save();
    const again = createStore(CONTENT, storage, 2);
    expect(again.getStage()).toBe(2);
    expect(again.getIntro()).toBeNull();
  });

  it('opens everything for a save from before the stages (a save and no stages key)', () => {
    const storage = memory();
    const old = createStore(CONTENT, storage, 3);
    old.save();
    storage.data.delete(STAGES_KEY);
    const store = createStore(CONTENT, storage, 4);
    expect(store.getStage()).toBe(5);
    expect(store.getIntro()).toBeNull();
    // Still the old game, so the key is not written over it.
    expect(storage.data.has(STAGES_KEY)).toBe(false);
    // Start again is a new game, and stages.
    store.reset(9);
    expect(store.getStage()).toBe(1);
    expect(storage.data.get(STAGES_KEY)).toBe('{"seen":1}');
  });

  it('opens everything for an old save whose progress is past stage 1', () => {
    const storage = memory();
    createStore(CONTENT, storage, 3).save();
    storage.data.delete(STAGES_KEY);
    storage.data.set(PROGRESS_KEY, JSON.stringify(done('gap', 'race', 'home')));
    const store = createStore(CONTENT, storage, 4);
    expect(store.getStage()).toBe(5);
  });

  it('keeps show everything across a reload and across Start again', () => {
    const storage = memory();
    const store = createStore(CONTENT, storage, 5);
    expect(store.getReveal()).toBe(false);
    store.setReveal(true);
    expect(store.getStage()).toBe(5);
    expect(storage.data.get(REVEAL_KEY)).toBe('1');
    expect(createStore(CONTENT, storage, 6).getStage()).toBe(5);
    store.reset(7);
    expect(store.getReveal()).toBe(true);
    expect(store.getStage()).toBe(5);
    expect(storage.data.get(REVEAL_KEY)).toBe('1');
    store.setReveal(false);
    expect(store.getStage()).toBe(1);
    expect(storage.data.has(REVEAL_KEY)).toBe(false);
    expect(storage.data.has(SAVE_KEY)).toBe(false);
  });
});
