import {
  BEATEN_MIN_RACES,
  BEATEN_SHARE,
  BLEED_DAYS,
  CONCENTRATED_MIN_FILLS,
  CONCENTRATED_SHARE,
  FEES_SHARE,
  MAX_SIGNALS,
  RIVAL_MIN_PNL,
  WEATHER_MIN_DAYS,
  signals,
  CONTENT,
  glossary,
  stageOf,
  shows,
  type Signal,
} from '../src/content';
import { Game, variants, type DayReport, type Setup, type Snapshot, type Tally } from '../src/sim';

const ALL = () => true;
const T = (realised: number, fees = 0, fills = 10): Tally => ({ realised, fees, fills });

function day(n: number, over: Partial<DayReport> = {}): DayReport {
  return {
    day: n,
    weekday: 'Mon',
    week: 1,
    pnl: 0,
    equityAtClose: 0,
    byBlock: {},
    bySymbol: {},
    races: { won: 0, beaten: 0, missed: 0 },
    fees: 0,
    fines: 0,
    headlines: [],
    latency: {},
    rivals: [],
    ...over,
  };
}

/** A game on a server with momentum and arbitrage, so the shop's next rungs and the variants are real. */
function fixture() {
  const g = new Game(CONTENT, 3);
  g.firm.cash += 100_000_000;
  g.buyUpgrade('computer', 'server');
  g.setBlock('arbitrage', { enabled: true });
  g.setBlock('marketMaker', { enabled: false });
  return g;
}
const snap = (g: Game = fixture()): Snapshot => g.snapshot();
const setupOf = (s: Snapshot): Setup => ({
  location: s.infra.location,
  network: s.infra.network,
  computer: s.infra.computer,
  watched: [],
  blocks: s.blocks,
});
const blockIds = (s: Snapshot) => s.blocks.map((b) => b.id);
const ids = (xs: Signal[]) => xs.map((x) => x.id);
const of = (xs: Signal[], kind: Signal['kind']) => xs.find((x) => x.kind === kind);
/** Each prefer id must be one variants() makes for the snapshot's own setup. */
function expectMakes(s: Snapshot, sig: Signal) {
  const made = variants(setupOf(s), s.shop, blockIds(s), { prefer: sig.prefer });
  const have = new Set(made.flatMap((v) => [v.id, v.about ?? '']));
  for (const p of sig.prefer) expect(have.has(p), p).toBe(true);
  // and asking for them puts them first
  expect(made[1]!.id === sig.prefer[0] || made[1]!.about === sig.prefer[0]).toBe(true);
}

describe('signals', () => {
  it('gives nothing but the free slot on a fresh game, and nothing on a full computer', () => {
    const g = new Game(CONTENT, 3);
    expect(signals([], snap(g), { shown: ALL })).toEqual([]);
    g.firm.cash += 100_000_000;
    g.buyUpgrade('computer', 'server');
    const out = signals([], snap(g), { shown: ALL });
    expect(out.map((x) => x.kind)).toEqual(['slot']);
    expectMakes(snap(g), out[0]!);
  });

  it('does not offer a free slot when no block is shown and off', () => {
    const g = new Game(CONTENT, 3);
    g.firm.cash += 100_000_000;
    g.buyUpgrade('computer', 'server');
    const out = signals([], snap(g), { shown: (f) => f === 'block:momentum' });
    expect(out).toEqual([]);
  });

  it('beaten: fires at the share of races, not under it, and prefers the next link and location', () => {
    const s = snap();
    const d = (beaten: number) =>
      day(1, {
        races: { won: 20 - beaten, beaten, missed: 0 },
        beatenBy: { 'Harbor Quant': { count: beaten, medianMs: 4 } },
      });
    const total = BEATEN_MIN_RACES * 2;
    const at = Math.ceil(BEATEN_SHARE * total);
    const at2 = signals([day(0), d(at)], s, { shown: ALL });
    const hit = of(at2, 'beaten')!;
    expect(hit).toBeDefined();
    expect(hit.seen).toMatch(/Harbor Quant/);
    expect(hit.seen).toMatch(/4 ms/);
    expect(hit.prefer).toEqual(['upgrade:location:city', 'upgrade:network:fibre']);
    expectMakes(s, hit);
    expect(of(signals([day(1), d(at - 1)], s, { shown: ALL }), 'beaten')).toBeUndefined();
    // too few races to say
    const few = day(1, {
      races: { won: 1, beaten: 3, missed: 0 },
      beatenBy: { 'Harbor Quant': { count: 3, medianMs: 4 } },
    });
    expect(of(signals([few], s, { shown: ALL }), 'beaten')).toBeUndefined();
  });

  it('fees: fires at half of gross, not under it, preferring a higher threshold on the costliest block', () => {
    const s = snap();
    const d = (fees: number) => day(1, { byBlock: { arbitrage: T(1000, fees), momentum: T(0, 0) } });
    const gross = 1000;
    const at = Math.ceil(FEES_SHARE * gross);
    const hit = of(signals([d(at)], s, { shown: ALL }), 'fees')!;
    expect(hit).toBeDefined();
    expect(hit.prefer).toEqual(['param:arbitrage:minEdge:up']);
    expectMakes(s, hit);
    expect(of(signals([d(at - 1)], s, { shown: ALL }), 'fees')).toBeUndefined();
  });

  it('fees: on momentum prefers a higher threshold, its second parameter, and the night makes it', () => {
    const s = snap();
    const d = day(1, { byBlock: { momentum: T(1000, 900), arbitrage: T(0, 0) } });
    const hit = of(signals([d], s, { shown: ALL }), 'fees')!;
    expect(hit.prefer).toEqual(['param:momentum:threshold:up']);
    expect(hit.test).toMatch(/Raise Momentum's threshold/);
    expectMakes(s, hit);
  });

  it('fees: prefers nothing for a block no parameter makes trade less, and says no test runs', () => {
    const g = fixture();
    g.setBlock('newsReaction', { enabled: true });
    const s = snap(g);
    const d = day(1, { byBlock: { newsReaction: T(1000, 900) } });
    const hit = of(signals([d], s, { shown: ALL }), 'fees')!;
    expect(hit.prefer).toEqual([]);
    expect(hit.test).toMatch(/no change the game can test/i);
  });

  it('bleeds: fires on the third losing day running, not the second, preferring it off', () => {
    const s = snap();
    const lose = (n: number) => day(n, { byBlock: { momentum: T(-500, 100), arbitrage: T(500, 10) } });
    const days = Array.from({ length: BLEED_DAYS }, (_, i) => lose(i));
    const hit = of(signals(days, s, { shown: ALL }), 'bleeds')!;
    expect(hit.id).toBe('bleeds:momentum');
    expect(hit.prefer).toEqual(['off:momentum']);
    expectMakes(s, hit);
    expect(of(signals(days.slice(1), s, { shown: ALL }), 'bleeds')).toBeUndefined();
    // a winning day among them breaks the run
    const broken = [lose(0), day(1, { byBlock: { momentum: T(900, 10) } }), lose(2)];
    expect(of(signals(broken, s, { shown: ALL }), 'bleeds')).toBeUndefined();
    // days it did not run do not count against it
    const gaps = [lose(0), day(1), lose(2), lose(3)];
    expect(of(signals(gaps, s, { shown: ALL }), 'bleeds')?.id).toBe('bleeds:momentum');
  });

  it('weather: fires when the sign flips with at least two days of each regime, with no test', () => {
    const s = snap();
    const calm = (n: number) => day(n, { regime: 'calm', byBlock: { arbitrage: T(800, 10) } });
    const trend = (n: number) => day(n, { regime: 'trending', byBlock: { arbitrage: T(-300, 10) } });
    const days = [calm(0), trend(1), calm(2), trend(3)];
    expect(WEATHER_MIN_DAYS).toBe(2);
    const hit = of(signals(days, s, { shown: ALL }), 'weather')!;
    expect(hit.id).toBe('weather:arbitrage');
    expect(hit.test).toBeNull();
    expect(hit.prefer).toEqual([]);
    expect(hit.term).toBe('regimes');
    expect(of(signals([calm(0), trend(1), calm(2)], s, { shown: ALL }), 'weather')).toBeUndefined();
    // the same sign in both is not weather
    const same = [
      calm(0),
      calm(1),
      day(2, { regime: 'trending', byBlock: { arbitrage: T(100) } }),
      day(3, { regime: 'trending', byBlock: { arbitrage: T(100) } }),
    ];
    expect(of(signals(same, s, { shown: ALL }), 'weather')).toBeUndefined();
  });

  it('capacity: fires on any dropped order yesterday, preferring the next computer', () => {
    const s = snap();
    const hit = of(signals([day(0, { dropped: 0 }), day(1, { dropped: 1 })], s, { shown: ALL }), 'capacity')!;
    expect(hit.prefer).toEqual(['upgrade:computer:rack']);
    expectMakes(s, hit);
    expect(of(signals([day(1, { dropped: 0 })], s, { shown: ALL }), 'capacity')).toBeUndefined();
    expect(
      of(signals([day(1, { dropped: 5 }), day(2, { dropped: 0 })], s, { shown: ALL }), 'capacity'),
    ).toBeUndefined();
  });

  it('concentrated: fires at the share of net from one symbol with enough fills, and has no variant', () => {
    const s = snap();
    const fills = CONCENTRATED_MIN_FILLS / 2;
    const d = (a: number, b: number, n = fills) => day(1, { bySymbol: { ABC: T(a, 0, n), XYZ: T(b, 0, n) } });
    const total = 1000;
    const top = CONCENTRATED_SHARE * total;
    const hit = of(signals([d(top, total - top)], s, { shown: ALL }), 'concentrated')!;
    expect(hit.prefer).toEqual([]);
    expect(hit.test).toMatch(/another stock/);
    expect(hit.seen).toMatch(/ABC/);
    expect(of(signals([d(top - 1, total - top + 1)], s, { shown: ALL }), 'concentrated')).toBeUndefined();
    expect(of(signals([d(top, total - top, fills - 1)], s, { shown: ALL }), 'concentrated')).toBeUndefined();
  });

  it('rival: fires when a rival running the same block earned more and is faster, preferring the next link', () => {
    const s = snap();
    const d = (rival: number) =>
      day(1, { byBlock: { arbitrage: T(0, 0) }, rivals: [{ name: 'Harbor Quant', pnl: rival }] });
    const hit = of(signals([d(RIVAL_MIN_PNL)], s, { shown: ALL }), 'rival')!;
    expect(hit.seen).toMatch(/Harbor Quant/);
    expect(hit.seen).toMatch(/ms/);
    expect(hit.prefer).toEqual(['upgrade:location:city', 'upgrade:network:fibre']);
    expectMakes(s, hit);
    expect(of(signals([d(RIVAL_MIN_PNL - 1)], s, { shown: ALL }), 'rival')).toBeUndefined();
    // Shadow runs anticipate, which the firm does not: it is not a rival at this block
    const other = day(1, { byBlock: { arbitrage: T(0, 0) }, rivals: [{ name: 'Shadow Trading', pnl: 1e9 }] });
    expect(of(signals([other], s, { shown: ALL }), 'rival')).toBeUndefined();
  });

  it('slot: prefers a block that is shown and off, and one that variants() proposes', () => {
    const g = fixture();
    g.setBlock('arbitrage', { enabled: false });
    const s = snap(g);
    const hit = of(signals([], s, { shown: ALL }), 'slot')!;
    expect(hit.prefer).toHaveLength(1);
    expect(s.blocks.find((b) => b.id === hit.prefer[0])?.enabled).toBe(false);
    expectMakes(s, hit);
  });

  it('never names a block or feature the stage hides', () => {
    const s = snap();
    const stage1 = (f: string) => !f.startsWith('block:arbitrage') && f !== 'races';
    const days = [0, 1, 2].map((n) =>
      day(n, {
        byBlock: { arbitrage: T(-500, 900), momentum: T(-100, 10) },
        races: { won: 0, beaten: 20, missed: 0 },
        beatenBy: { 'Harbor Quant': { count: 20, medianMs: 4 } },
        rivals: [{ name: 'Harbor Quant', pnl: 1e9 }],
        dropped: 3,
      }),
    );
    const out = signals(days, s, { shown: stage1 });
    expect(out.length).toBeGreaterThan(0);
    for (const x of out) {
      expect(x.kind).not.toBe('beaten');
      expect(x.kind).not.toBe('rival');
      expect(x.id).not.toMatch(/arbitrage/);
      expect(JSON.stringify(x)).not.toMatch(/rbitrage|Arbitrage/);
    }
    // and the real stage table agrees: stage 1 hides races and arbitrage
    expect(shows('races', stageOf({}))).toBe(false);
  });

  it('is quiet on a good, ordinary day', () => {
    const s = snap();
    const good = (n: number) =>
      day(n, {
        regime: 'calm',
        byBlock: { momentum: T(5000, 400), arbitrage: T(4000, 300) },
        bySymbol: { ABC: T(3000, 300, 30), XYZ: T(3000, 200, 30), DEF: T(3000, 200, 30) },
        races: { won: 18, beaten: 2, missed: 0 },
        beatenBy: { 'Harbor Quant': { count: 2, medianMs: 3 } },
        rivals: [{ name: 'Harbor Quant', pnl: 100 }],
        dropped: 0,
      });
    expect(signals([good(0), good(1), good(2), good(3)], s, { shown: ALL })).toEqual([]);
  });

  it('keeps at most six, strongest first', () => {
    const g = fixture();
    const s = snap(g);
    const open = { ...s, blocks: s.blocks.map((b) => ({ ...b, enabled: true })) };
    const blocks = ['momentum', 'arbitrage', 'sniper', 'marketMaker', 'meanReversion', 'newsReaction'];
    const lose = (n: number) =>
      day(n, {
        byBlock: Object.fromEntries(blocks.map((b) => [b, T(-1000 * (blocks.indexOf(b) + 1), 10)])),
        bySymbol: { ABC: T(-9000, 0, 100), XYZ: T(-10, 0, 100) },
        races: { won: 0, beaten: 20, missed: 0 },
        beatenBy: { 'Harbor Quant': { count: 20, medianMs: 4 } },
        dropped: 4,
      });
    const out = signals([lose(0), lose(1), lose(2)], open, { shown: ALL });
    expect(out).toHaveLength(MAX_SIGNALS);
    expect(MAX_SIGNALS).toBe(6);
    for (let i = 1; i < out.length; i++) expect(out[i - 1]!.strength).toBeGreaterThanOrEqual(out[i]!.strength);
    expect(new Set(ids(out)).size).toBe(out.length);
  });

  it('gives no beaten or capacity signal from a report without beatenBy or dropped', () => {
    const s = snap();
    const old = day(1, { races: { won: 0, beaten: 30, missed: 0 } });
    expect('beatenBy' in old).toBe(false);
    const out = signals([old, old, old], s, { shown: ALL });
    expect(of(out, 'beaten')).toBeUndefined();
    expect(of(out, 'capacity')).toBeUndefined();
  });

  it('writes words, a term that exists, and a test only where there is one', () => {
    const g = fixture();
    const s = snap(g);
    const lose = (n: number) =>
      day(n, {
        regime: n % 2 ? 'calm' : 'trending',
        byBlock: { momentum: T(n % 2 ? 900 : -900, 400), arbitrage: T(0, 0) },
        bySymbol: { ABC: T(-9000, 0, 100) },
        races: { won: 0, beaten: 20, missed: 0 },
        beatenBy: { 'Harbor Quant': { count: 20, medianMs: 4 } },
        rivals: [{ name: 'Harbor Quant', pnl: 1e6 }],
        dropped: 2,
      });
    const out = signals([lose(0), lose(1), lose(2), lose(3)], s, { shown: ALL });
    expect(out.length).toBeGreaterThan(3);
    for (const x of out) {
      expect(x.title.length).toBeGreaterThan(0);
      expect(x.seen).toMatch(/\d/);
      expect(x.why.length).toBeGreaterThan(20);
      if (x.term) expect(glossary(x.term), x.term).toBeDefined();
      if (x.kind !== 'weather') expect(x.test).not.toBeNull();
    }
  });
});
