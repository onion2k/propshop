import { CONTENT } from '../src/content';
import {
  BACKTEST_WINDOW_MS,
  Game,
  MAX_DAY_PINS,
  MAX_INTRADAY,
  MAX_VARIANTS,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  Run,
  TICK_MS,
  pinTimes,
  startOf,
  testNight,
  variants,
  type Pin,
  type Setup,
  type UpgradeOffer,
  type Variant,
} from '../src/sim';
import { MARKET_OPEN } from '../src/sim/clock';
import type { Scheduled } from '../src/sim/news';

const SEED = 7;
const WINDOW = 6 * MS_PER_SECOND;
const START_AT = MARKET_OPEN + MS_PER_MINUTE;

const HOME: Setup = {
  location: 'home',
  network: 'consumer',
  computer: 'server',
  watched: [],
  blocks: [
    { id: 'momentum', enabled: true, params: {} },
    { id: 'arbitrage', enabled: true, params: {} },
  ],
};
const COLO: Setup = { ...HOME, location: 'colo-harbor', network: 'microwave', computer: 'rack' };

function offersFor(game: Game): UpgradeOffer[] {
  return game.snapshot().shop;
}

function drain<T, R>(gen: Generator<T, R>): { out: T[] } {
  const out: T[] = [];
  for (;;) {
    const n = gen.next();
    if (n.done) return { out };
    out.push(n.value);
  }
}

type Result = { kind: 'result'; variantId: string; pin: string; measures: import('../src/sim').Measures };
function results(events: { kind: string }[]): Result[] {
  return events.filter((e): e is Result => e.kind === 'result');
}

const start = startOf(CONTENT, SEED, START_AT);
const pin: Pin = { label: 'open', at: start.now, save: start };
const baseline: Variant = { id: 'baseline', kind: 'baseline', label: 'As it is', setup: COLO };

describe('variants does not touch the setup it is given', () => {
  it("leaves a block it proposes to swap in switched off, in the caller's own objects", () => {
    const g = new Game(CONTENT, SEED);
    g.firm.cash += 100_000_000;
    g.buyUpgrade('computer', 'server');
    const s = g.snapshot();
    const setup: Setup = { location: 'home', network: 'consumer', computer: 'server', watched: [], blocks: s.blocks };
    const before = JSON.stringify(s.blocks);
    variants(
      setup,
      s.shop,
      s.blocks.map((b) => b.id),
    );
    expect(JSON.stringify(s.blocks)).toBe(before);
  });
});

describe('testNight', () => {
  it('measures the baseline twice on one pin to identical measures', () => {
    const a = results(drain(testNight(CONTENT, [pin], [baseline], 500, WINDOW)).out);
    const b = results(drain(testNight(CONTENT, [pin], [baseline], 5000, WINDOW)).out);
    expect(a).toHaveLength(1);
    expect(a[0]!.measures).toEqual(b[0]!.measures);
    expect(a[0]!.pin).toBe('open');
    expect(a[0]!.variantId).toBe('baseline');
  });

  it('measures a variant equal to the baseline the same as the baseline, and does not touch the pin', () => {
    const twin: Variant = { ...baseline, id: 'twin', kind: 'param', label: 'Same' };
    const before = JSON.stringify(start.now) + start.firm.cash;
    const r = results(drain(testNight(CONTENT, [pin], [baseline, twin], 1000, WINDOW)).out);
    expect(r.map((x) => x.variantId)).toEqual(['baseline', 'twin']);
    expect(r[1]!.measures).toEqual(r[0]!.measures);
    expect(JSON.stringify(start.now) + start.firm.cash).toBe(before);
  });

  it('yields progress, and a result per pin and variant', () => {
    const off: Variant = {
      ...baseline,
      id: 'off',
      kind: 'toggle',
      label: 'Off',
      setup: { ...COLO, blocks: [{ id: 'arbitrage', enabled: false, params: {} }] },
    };
    const { out } = drain(testNight(CONTENT, [pin, { ...pin, label: 'afternoon' }], [baseline, off], 400, WINDOW));
    expect(results(out)).toHaveLength(4);
    expect(out.some((e) => e.kind === 'progress')).toBe(true);
  });

  it('shows a different variant measuring something different', () => {
    const idle: Variant = {
      ...baseline,
      id: 'idle',
      kind: 'toggle',
      label: 'Nothing on',
      setup: { ...COLO, blocks: [{ id: 'arbitrage', enabled: false, params: {} }] },
    };
    const long = 40 * MS_PER_SECOND;
    const r = results(drain(testNight(CONTENT, [pin], [baseline, idle], 5000, long)).out);
    expect(r[1]!.measures.fills).toBe(0);
    expect(r[1]!.measures.fees).toBe(0);
    expect(r[0]!.measures.fills).toBeGreaterThan(0);
    expect(r[0]!.measures.fees).toBeGreaterThan(0);
  });

  it('clamps the window to before the close', () => {
    const g = new Game(CONTENT, SEED);
    g.skipToOpen();
    while (g.now < 16 * MS_PER_HOUR - 1.5 * MS_PER_MINUTE) g.step(MS_PER_MINUTE);
    const p: Pin = { label: 'afternoon', at: g.now, save: g.save() };
    const r = results(drain(testNight(CONTENT, [p], [baseline], 5000, BACKTEST_WINDOW_MS)).out);
    expect(r).toHaveLength(1);
  });
});

describe('Measures by block', () => {
  it('splits fills, realised and fees by block, adding up to the totals', () => {
    const run = new Run(CONTENT, start, COLO, 40 * MS_PER_SECOND);
    while (!run.advance(5000)) {
      /* chunks */
    }
    const m = run.measures();
    const blocks = Object.values(m.byBlock);
    expect(m.fills).toBeGreaterThan(0);
    expect(blocks.reduce((s, b) => s + b.fills, 0)).toBe(m.fills);
    expect(blocks.reduce((s, b) => s + b.fees, 0)).toBe(m.fees);
    expect(Object.keys(m.byBlock).every((k) => k === 'arbitrage' || k === 'momentum')).toBe(true);
  });
});

describe('pins replay the live game', () => {
  it('a Run from a pin equals continuing the live game under the same setup, for P&L', () => {
    const g = new Game(CONTENT, SEED);
    g.skipToOpen();
    g.configure(COLO);
    while (g.now < START_AT) g.step();
    const saved = structuredClone(g.save());
    const net = () => g.firm.realised - g.firm.feesPaid + g.firm.unrealised(g.market, g.now);
    const before = net();
    const run = new Run(CONTENT, saved, COLO, 20 * MS_PER_SECOND);
    while (!run.advance(5000)) {
      /* chunks */
    }
    while (g.now < START_AT + 20 * MS_PER_SECOND) g.step();
    expect(run.measures().pnl).toBe(net() - before);
    expect(run.game.fingerprint()).toBe(g.fingerprint());
  });
});

describe('pinTimes', () => {
  function day(seed = SEED) {
    const g = new Game(CONTENT, seed);
    g.skipToOpen();
    return g;
  }
  const dayStart = (g: Game) => Math.floor(g.now / MS_PER_DAY) * MS_PER_DAY;

  it('gives the open, the largest scheduled headline less a minute, and half past two', () => {
    const g = day();
    const d = dayStart(g);
    const pins = pinTimes(g);
    expect(pins[0]).toEqual({ label: 'open', at: d + MARKET_OPEN });
    expect(pins.at(-1)).toEqual({ label: 'afternoon', at: d + 14.5 * MS_PER_HOUR });
    expect(pins.length).toBeLessThanOrEqual(MAX_DAY_PINS);
    expect(pins.map((p) => p.label)).toContain('headline');
    const h = pins.find((p) => p.label === 'headline')!;
    expect(h.at % TICK_MS).toBe(0);
    const best = g.news.scheduled
      .filter((s) => s.at >= d + MARKET_OPEN && s.at < d + 16 * MS_PER_HOUR)
      .map((s) => ({
        s,
        size: Math.max(...Object.entries(s.moves).map(([k, v]) => Math.abs(v) / (g.market.fair.get(k) ?? 1))),
      }))
      .sort((a, b) => b.size - a.size)[0]!;
    expect(h.at).toBe(Math.floor((best.s.at - MS_PER_MINUTE) / TICK_MS) * TICK_MS);
  });

  it('is pure: it draws nothing from any stream and leaves the game as it was', () => {
    const g = day();
    const before = g.fingerprint();
    expect(pinTimes(g)).toEqual(pinTimes(g));
    expect(g.fingerprint()).toBe(before);
  });

  function withHeadlines(g: Game, hs: Partial<Scheduled>[]) {
    const d = dayStart(g);
    g.news.scheduled = hs.map((h, i) => ({
      id: 900 + i,
      at: d + 12 * MS_PER_HOUR,
      text: 'x',
      symbols: ['ABC'],
      sector: null,
      direction: 1,
      moves: { ABC: 100 },
      priceInMs: 1000,
      noise: false,
      ...h,
    }));
    return d;
  }

  it('skips the headline pin where there is no headline in the session, or only noise', () => {
    const g = day();
    withHeadlines(g, []);
    expect(pinTimes(g).map((p) => p.label)).toEqual(['open', 'afternoon']);
    withHeadlines(g, [{ moves: { ABC: 0 }, noise: true }]);
    expect(pinTimes(g).map((p) => p.label)).toEqual(['open', 'afternoon']);
  });

  it('skips a headline that falls inside the open window, or too near the close, or over the afternoon window', () => {
    const g = day();
    const d = dayStart(g);
    withHeadlines(g, [{ at: d + MARKET_OPEN + 3 * MS_PER_MINUTE }]);
    expect(pinTimes(g).map((p) => p.label)).toEqual(['open', 'afternoon']);
    withHeadlines(g, [{ at: d + 15.98 * MS_PER_HOUR }]);
    expect(pinTimes(g).map((p) => p.label)).toEqual(['open', 'afternoon']);
    withHeadlines(g, [{ at: d + 14.5 * MS_PER_HOUR + 2 * MS_PER_MINUTE }]);
    expect(pinTimes(g).map((p) => p.label)).toEqual(['open', 'afternoon']);
    withHeadlines(g, [{ at: d + 11 * MS_PER_HOUR }]);
    expect(pinTimes(g).map((p) => p.label)).toEqual(['open', 'headline', 'afternoon']);
  });

  it('picks the larger of two headlines by its move against the price', () => {
    const g = day();
    const d = dayStart(g);
    withHeadlines(g, [
      { at: d + 11 * MS_PER_HOUR, moves: { ABC: 10 } },
      { at: d + 12 * MS_PER_HOUR, moves: { ABC: 500 } },
    ]);
    expect(pinTimes(g).find((p) => p.label === 'headline')!.at).toBe(d + 12 * MS_PER_HOUR - MS_PER_MINUTE);
  });
});

describe('variants', () => {
  const g = new Game(CONTENT, SEED);
  const offers = offersFor(g);
  const shown = ['momentum', 'arbitrage', 'marketMaker', 'meanReversion', 'pairs'];
  const fitsCheck = (v: Variant) => {
    const t = new Game(CONTENT, SEED);
    expect(() => t.configure(v.setup)).not.toThrow();
  };

  it('starts with the baseline, the setup itself', () => {
    const vs = variants(HOME, offers, shown);
    expect(vs[0]).toMatchObject({ id: 'baseline', kind: 'baseline', setup: HOME });
  });

  it('proposes each kind, within the cap, in a stable order, all of which configure', () => {
    const vs = variants(HOME, offers, shown);
    expect(vs.length - 1).toBeLessThanOrEqual(MAX_VARIANTS);
    expect(vs.length).toBeGreaterThan(2);
    expect(new Set(vs.map((v) => v.id)).size).toBe(vs.length);
    expect(variants(HOME, offers, shown)).toEqual(vs);
    for (const v of vs) fitsCheck(v);
    expect(vs.some((v) => v.kind === 'param')).toBe(true);
  });

  it('steps a first param up and down by its step, clamped, and skips a step that changes nothing', () => {
    const vs = variants({ ...HOME, blocks: [{ id: 'momentum', enabled: true, params: {} }] }, offers, []);
    const params = vs.filter((v) => v.id.startsWith('param:momentum:lookback:'));
    expect(params).toHaveLength(2);
    const [up, down] = params;
    expect(up!.setup.blocks[0]!.params).not.toEqual(down!.setup.blocks[0]!.params);
    // At its minimum, only the step up remains.
    const key = Object.keys(up!.setup.blocks[0]!.params)[0]!;
    const lo = down!.setup.blocks[0]!.params[key]!;
    const min = variants({ ...HOME, blocks: [{ id: 'momentum', enabled: true, params: { [key]: -1e9 } }] }, offers, []);
    expect(min.filter((v) => v.id.startsWith('param:momentum:lookback:')).length).toBeLessThan(2);
    expect(lo).toBeLessThan(up!.setup.blocks[0]!.params[key]!);
  });

  it("tests a new player's momentum a size larger as well, since size is what moves a window beyond the noise", () => {
    // From home the first parameter and the upgrades change a window by tens of dollars; size scales it.
    const start: Setup = {
      ...HOME,
      location: 'home',
      network: 'consumer',
      computer: 'laptop',
      blocks: [{ id: 'momentum', enabled: true, params: {} }],
    };
    const ids = variants(start, offers, ['momentum']).map((v) => v.id);
    expect(ids).toContain('param:momentum:size:up');
    expect(ids).toContain('param:momentum:lookback:up');
    expect(ids.length - 1).toBeLessThanOrEqual(MAX_VARIANTS);
    const size = variants(start, offers, ['momentum']).find((v) => v.id === 'param:momentum:size:up')!;
    expect(size.setup.blocks[0]!.params.size).toBe(300);
  });

  it('switches a block off only where more than one is on', () => {
    expect(variants(HOME, offers, []).filter((v) => v.kind === 'toggle')).toHaveLength(2);
    const one = variants({ ...HOME, blocks: [HOME.blocks[0]!] }, offers, []);
    expect(one.filter((v) => v.kind === 'toggle')).toHaveLength(0);
  });

  it('swaps a block only for one that is shown, and never an unknown or already-on one', () => {
    const vs = variants(HOME, offers, ['momentum', 'arbitrage']);
    expect(vs.filter((v) => v.kind === 'swap')).toHaveLength(0);
    const sw = variants(HOME, offers, ['marketMaker']).filter((v) => v.kind === 'swap');
    expect(sw).toHaveLength(1);
    expect(sw[0]!.setup.blocks.filter((b) => b.enabled).map((b) => b.id)).toContain('marketMaker');
    expect(sw[0]!.setup.blocks.filter((b) => b.enabled)).toHaveLength(2);
  });

  it('offers the next rung of each upgrade kind with its price, not one owned or in use', () => {
    const one: Setup = { ...HOME, blocks: [HOME.blocks[0]!] };
    const ups = variants(one, offers, []).filter((v) => v.kind === 'upgrade');
    expect(ups.length).toBeGreaterThan(0);
    for (const u of ups) {
      expect(u.price).toBeGreaterThan(0);
      expect(u.about).toBeTruthy();
    }
    const nets = ups.filter((u) => CONTENT.networks.some((n) => n.id === u.about));
    expect(nets).toHaveLength(1);
    expect(nets[0]!.about).toBe('fibre');
  });

  it('drops a variant the computer cannot hold', () => {
    const laptop: Setup = { ...HOME, computer: 'laptop', blocks: [{ id: 'momentum', enabled: true, params: {} }] };
    const vs = variants(laptop, offers, shown);
    for (const v of vs) fitsCheck(v);
    // A swap keeps the count; an off variant is not offered for one block.
    expect(vs.some((v) => v.kind === 'toggle')).toBe(false);
  });

  it('puts the preferred first, then caps, and appends the player beyond the cap', () => {
    const all = variants(HOME, offers, shown);
    const last = all[all.length - 1]!;
    const preferred = variants(HOME, offers, shown, { prefer: [last.id] });
    expect(preferred[1]!.id).toBe(last.id);
    const byAbout = variants(HOME, offers, shown, { prefer: ['arbitrage'] });
    expect(byAbout[1]!.about).toBe('arbitrage');
    const player: Variant = {
      id: 'player',
      kind: 'player',
      label: 'Mine',
      setup: { ...HOME, blocks: [{ id: 'arbitrage', enabled: true, params: {} }] },
    };
    const withPlayer = variants(HOME, offers, shown, { player });
    expect(withPlayer.length).toBeLessThanOrEqual(MAX_VARIANTS + 2);
    expect(withPlayer.at(-1)!.kind).toBe('player');
    expect(withPlayer.length - 1).toBeLessThanOrEqual(MAX_VARIANTS + 1);
    const bad = variants(HOME, offers, shown, {
      player: { ...player, setup: { ...HOME, computer: 'laptop' } },
    });
    expect(bad.some((v) => v.kind === 'player')).toBe(false);
  });
});

describe('intraday series', () => {
  function openDay() {
    const g = new Game(CONTENT, SEED);
    g.skipToOpen();
    while (!g.snapshot().open) g.step(MS_PER_MINUTE);
    return g;
  }

  it('records one point a minute while open, and nothing in closed hours', () => {
    const g = new Game(CONTENT, SEED);
    expect(g.snapshot().intraday).toEqual([]);
    g.skipToOpen();
    expect(g.snapshot().intraday).toEqual([]);
    for (let i = 0; i < 5; i++) g.step(MS_PER_MINUTE);
    const s = g.snapshot().intraday;
    const d = Math.floor(g.now / MS_PER_DAY) * MS_PER_DAY;
    expect(s.map((p) => p.at)).toEqual([0, 1, 2, 3, 4].map((m) => d + MARKET_OPEN + m * MS_PER_MINUTE));
    expect(s[0]!.equity).toBe(CONTENT.startingCash);
  });

  it('records equity and each block net so far, realised less fees, as the fills made it', () => {
    const g = new Game(CONTENT, SEED);
    g.skipToOpen();
    g.configure(COLO);
    const net: Record<string, number> = {};
    let seen: Record<string, number> = {};
    let seenAt = 0;
    g.on((e) => {
      if (e.kind === 'fill') net[e.fill.block] = (net[e.fill.block] ?? 0) + e.fill.realised - e.fill.fee;
    });
    while (g.now < MARKET_OPEN + 90 * MS_PER_SECOND) {
      g.step();
      if (g.now % MS_PER_MINUTE === 0 && g.now >= MARKET_OPEN) {
        seen = { ...net };
        seenAt = g.now;
      }
    }
    const last = g.snapshot().intraday.at(-1)!;
    expect(last.at).toBe(seenAt);
    expect(last.byBlock).toEqual(seen);
    expect(Object.values(last.byBlock).every(Number.isInteger)).toBe(true);
  });

  it('is bounded by MAX_INTRADAY and a trading day fits', () => {
    const g = new Game(CONTENT, SEED);
    while (g.now < MS_PER_DAY * 0.5 + 16 * MS_PER_HOUR) g.step(MS_PER_MINUTE);
    expect(MAX_INTRADAY).toBe(400);
    expect(g.snapshot().intraday.length).toBeLessThanOrEqual(MAX_INTRADAY);
    expect(g.snapshot().intraday.length).toBe(390);
  });

  it('is cleared at the open of the next day', () => {
    const g = new Game(CONTENT, SEED);
    while (g.now < 16 * MS_PER_HOUR + 1) g.step(MS_PER_MINUTE);
    expect(g.snapshot().intraday.length).toBeGreaterThan(300);
    while (g.now < MS_PER_DAY + MARKET_OPEN) g.step(MS_PER_MINUTE);
    const s = g.snapshot().intraday;
    expect(s).toHaveLength(1);
    expect(s[0]!.at).toBe(MS_PER_DAY + MARKET_OPEN);
  });

  it('survives save and load, and a save without it loads empty', () => {
    const g = openDay();
    for (let i = 0; i < 4; i++) g.step(MS_PER_MINUTE);
    const saved = JSON.parse(JSON.stringify(g.save())) as ReturnType<Game['save']>;
    expect(saved.intraday!.length).toBeGreaterThan(2);
    const h = Game.load(CONTENT, saved);
    expect(h.snapshot().intraday).toEqual(g.snapshot().intraday);
    const old = { ...saved };
    delete old.intraday;
    expect(old.version).toBe(2);
    expect(Game.load(CONTENT, old).snapshot().intraday).toEqual([]);
  });

  it('does not alter the game it records: same fingerprint stepping with a loaded copy', () => {
    const g = openDay();
    const copy = Game.load(CONTENT, structuredClone(g.save()));
    for (let i = 0; i < 5000; i++) {
      g.step();
      copy.step();
    }
    expect(copy.fingerprint()).toBe(g.fingerprint());
  });
});
