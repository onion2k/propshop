import {
  DESK_LESSONS,
  CONTENT,
  LAST_STAGE,
  LESSONS,
  featureStage,
  placed,
  STAGES,
  introSteps,
  lessonStage,
  shows,
  stageOf,
  type Feature,
} from '../src/content';
import { BLOCKS } from '../src/sim';
import { createStore, PROGRESS_KEY, REVEAL_KEY, SAVE_KEY, STAGES_KEY, type Storage } from '../src/ui/store';

const done = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, 1000]));

const S1 = ['home', 'seat'];
const S2 = ['gap', 'race', 'cost'];
const S3 = ['maker', 'noise'];
const S4 = ['hand', 'used', 'week'];
// Stage 5 asks for the futures desk's three lessons before stage 6, which they teach the expiry and margin for.
const S5 = ['basis', 'overnight', 'lead'];

describe('stageOf', () => {
  it('opens stage n only when stage n-1 is open and all its lessons are done', () => {
    expect(stageOf({})).toBe(1);
    expect(stageOf(done('home'))).toBe(1);
    expect(stageOf(done('seat'))).toBe(1);
    expect(stageOf(done(...S1))).toBe(2);
    expect(stageOf(done(...S1, 'gap', 'race'))).toBe(2);
    expect(stageOf(done(...S1, ...S2))).toBe(3);
    expect(stageOf(done(...S1, ...S2, 'maker'))).toBe(3);
    expect(stageOf(done(...S1, ...S2, ...S3))).toBe(4);
    expect(stageOf(done(...S1, ...S2, ...S3, 'hand', 'used'))).toBe(4);
    expect(stageOf(done(...S1, ...S2, ...S3, ...S4))).toBe(5);
    // Stage 6, Volatility, needs the futures desk's three as well.
    expect(stageOf(done(...S1, ...S2, ...S3, ...S4, 'basis', 'overnight'))).toBe(5);
    expect(stageOf(done(...S1, ...S2, ...S3, ...S4, ...S5))).toBe(6);
    expect(stageOf(done(...S1, ...S2, ...S3, ...S4, ...S5, 'fix', 'curve'))).toBe(6);
  });

  it('does not skip: a later stage’s lessons without the earlier ones stay where they are', () => {
    expect(stageOf(done('race'))).toBe(1);
    expect(stageOf(done('seat', 'maker'))).toBe(1);
    expect(stageOf(done(...S1, ...S3))).toBe(2);
    expect(stageOf(done(...S1, ...S3, ...S4))).toBe(2);
    expect(stageOf(done(...S1, ...S2, ...S4))).toBe(3);
    expect(stageOf(done(...S1, ...S2, ...S3, ...S5))).toBe(4);
    expect(stageOf(done(...S1, ...S2, ...S3, ...S5, 'hand', 'used'))).toBe(4);
  });

  it('ends at Volatility: six stages, the sixth with no lessons of its own and the fifth needing the futures three', () => {
    expect(LAST_STAGE).toBe(6);
    expect(STAGES).toHaveLength(6);
    expect(STAGES[5]!.name).toBe('Volatility');
    expect(STAGES[5]!.lessons).toEqual([]);
    expect(STAGES[4]!.needs).toEqual(S5);
    expect(introSteps(6).length).toBeGreaterThan(0);
    // The needed lessons stay the futures desk's, shown at its stage; they do not move to stage 5.
    expect(lessonStage('basis')).toBe(3);
    expect(DESK_LESSONS.futures).toEqual(S5);
  });

  it('puts week in stage 4, and stage 5 needs it', () => {
    expect(lessonStage('week')).toBe(4);
    expect(STAGES.find((s) => s.id === 4)!.lessons).toEqual(S4);
    expect(stageOf(done(...S1, ...S2, ...S3, 'hand', 'used'))).toBe(4);
    expect(stageOf(done(...S1, ...S2, ...S3, 'week'))).toBe(4);
  });

  it("has every lesson in exactly one stage or one desk, the stages' in order and then the desks'", () => {
    const listed = [...STAGES.flatMap((s) => s.lessons), ...Object.values(DESK_LESSONS).flat()];
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual(LESSONS.map((l) => l.id).sort());
    expect(LESSONS.map((l) => l.id)).toEqual(listed);
    for (const l of LESSONS) expect(lessonStage(l.id)).toBeDefined();
    // A desk's lessons sit at the desk's stage and open no stage: all the stocks' done is the last stage.
    expect(lessonStage('lead')).toBe(3);
    for (const id of ['pips', 'triangle', 'refused', 'rollover']) expect(lessonStage(id)).toBe(4);
    // The options desk's six sit at its stage, the last, and open nothing: stage 6 is the end whatever is done.
    for (const id of DESK_LESSONS.options!) expect(lessonStage(id)).toBe(6);
    expect(
      stageOf({
        ...Object.fromEntries(STAGES.flatMap((s) => [...s.lessons, ...(s.needs ?? [])]).map((id) => [id, 1])),
        ...done(...DESK_LESSONS.options!),
      }),
    ).toBe(6);
    const stocks = Object.fromEntries(STAGES.flatMap((s) => s.lessons).map((id) => [id, 1]));
    expect(stageOf(stocks)).toBe(5);
    expect(stageOf({ ...stocks, ...done(...S5) })).toBe(6);
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
    ['desk:futures', 3],
    ['block:basisArb', 3],
    ['block:leadLag', 3],
    ['block:roll', 3],
    ['desk:fx', 4],
    ['block:triangle', 4],
    ['block:carry', 4],
    ['desk:metals', 5],
    ['block:curve', 5],
    ['block:fixArb', 5],
    ['block:crossPairs', 5],
    ['desk:options', 6],
    ['block:optionMaker', 6],
    ['block:parity', 6],
    ['block:eventVol', 6],
  ];
  it.each(table)('%s opens at stage %i and not before', (feature, at) => {
    for (let stage = 1; stage <= 6; stage++) expect(shows(feature, stage as 1)).toBe(stage >= at);
  });

  it('places every block the sim has', () => {
    for (const b of BLOCKS) {
      expect(shows(`block:${b.spec.id}`, LAST_STAGE)).toBe(true);
      expect(shows(`block:${b.spec.id}`, 1)).toBe(b.spec.id === 'momentum');
    }
  });

  it('places every desk the content has by name, so none opens by falling to the default', () => {
    // An unnamed desk would fall to the last stage and open in free play before its page was built: each is named in
    // the table instead. The metals desk is named at the last stage on purpose (plans/desk-metals.md 6e), after the
    // stage that teaches pairs, which its miner-and-the-metal block builds on.
    const store = createStore(CONTENT, null, 1);
    const desks = store.game.market.desks;
    expect(desks).toEqual(['futures', 'fx', 'metals', 'options']);
    for (const d of desks) expect(placed(`desk:${d}`), d).toBe(true);
    expect(placed('desk:nowhere')).toBe(false);
    expect(featureStage('desk:metals')).toBe(5);
    expect(featureStage('desk:options')).toBe(6);
  });

  it('opens the options desk at stage 6 and in free play, and at no stage before it', () => {
    expect(featureStage('desk:options')).toBe(6);
    expect(featureStage('desk:options')).toBe(LAST_STAGE);
    expect(shows('desk:options', 5)).toBe(false);
    expect(shows('desk:options', 6)).toBe(true);
    const staged = createStore(CONTENT, null, 1);
    expect(staged.game.market.isDeskOpen('options')).toBe(false);
    const store = createStore(CONTENT, null, 1);
    store.setReveal(true);
    expect(store.game.market.isDeskOpen('metals')).toBe(true);
    expect(store.game.market.isDeskOpen('options')).toBe(true);
    // The options desk needs the futures desk, and it is open with it.
    expect(store.game.market.isDeskOpen('futures')).toBe(true);
  });

  it('opens the options desk when the sixth stage is reached by the lessons, and not at the fifth', () => {
    const storage = memory();
    storage.data.set(PROGRESS_KEY, JSON.stringify(done(...S1, ...S2, ...S3, ...S4)));
    const five = createStore(CONTENT, storage, 1);
    expect(five.getStage()).toBe(5);
    expect(five.game.market.isDeskOpen('options')).toBe(false);
    const other = memory();
    other.data.set(PROGRESS_KEY, JSON.stringify(done(...S1, ...S2, ...S3, ...S4, ...S5)));
    // The intros are told in turn: the fifth's has been seen, so the sixth's is the one due.
    other.data.set(STAGES_KEY, '{"seen":5}');
    const six = createStore(CONTENT, other, 1);
    expect(six.getStage()).toBe(6);
    expect(six.game.market.isDeskOpen('options')).toBe(true);
    expect(six.getIntro()).toBe(6);
  });

  it('opens the metals desk after every stocks lesson is done, and not before', () => {
    const before = done(...S1, ...S2, ...S3, 'hand', 'used');
    expect(shows('desk:metals', stageOf(before))).toBe(false);
    expect(shows('desk:metals', stageOf(done(...S1, ...S2, ...S3, ...S4)))).toBe(true);
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

  it('opens stage 2 when home and seat are done, due an intro until it is dismissed, and keeps that across a reload', () => {
    const storage = memory();
    storage.data.set(PROGRESS_KEY, JSON.stringify(done('home')));
    const store = createStore(CONTENT, storage, 1);
    store.game.firm.cash = 100_000_000_00;
    store.buyUpgrade('network', 'fibre');
    expect(store.getStage()).toBe(2);
    expect(store.getIntro()).toBe(2);
    store.dismissIntro();
    expect(store.getIntro()).toBeNull();
    void store.save();
    const again = createStore(CONTENT, storage, 2);
    expect(again.getStage()).toBe(2);
    expect(again.getIntro()).toBeNull();
  });

  it('never falls below the last stage whose card was shown', () => {
    const storage = memory();
    storage.data.set(STAGES_KEY, '{"seen":5}');
    storage.data.set(PROGRESS_KEY, JSON.stringify(done('home', 'seat')));
    const store = createStore(CONTENT, storage, 2);
    expect(store.getStage()).toBe(5);
    expect(store.getIntro()).toBeNull();
  });

  it('opens everything for a save from before the stages (a save and no stages key)', () => {
    const storage = memory();
    const old = createStore(CONTENT, storage, 3);
    void old.save();
    storage.data.delete(STAGES_KEY);
    const store = createStore(CONTENT, storage, 4);
    expect(store.getStage()).toBe(LAST_STAGE);
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
    void createStore(CONTENT, storage, 3).save();
    storage.data.delete(STAGES_KEY);
    storage.data.set(PROGRESS_KEY, JSON.stringify(done('gap', 'race', 'home')));
    const store = createStore(CONTENT, storage, 4);
    expect(store.getStage()).toBe(LAST_STAGE);
  });

  it('keeps show everything across a reload and across Start again', () => {
    const storage = memory();
    const store = createStore(CONTENT, storage, 5);
    expect(store.getReveal()).toBe(false);
    store.setReveal(true);
    expect(store.getStage()).toBe(LAST_STAGE);
    expect(storage.data.get(REVEAL_KEY)).toBe('1');
    expect(createStore(CONTENT, storage, 6).getStage()).toBe(LAST_STAGE);
    store.reset(7);
    expect(store.getReveal()).toBe(true);
    expect(store.getStage()).toBe(LAST_STAGE);
    expect(storage.data.get(REVEAL_KEY)).toBe('1');
    store.setReveal(false);
    expect(store.getStage()).toBe(1);
    expect(storage.data.has(REVEAL_KEY)).toBe(false);
    expect(storage.data.has(SAVE_KEY)).toBe(false);
  });
});
