// The options desk's blocks in a live game (plans/desk-options.md, 7d): what each desk's blocks see, the view's
// options, the rival Bluestem Volatility, replay and saves with the desk open and blocks on, the short options'
// margin and the books with a maker in them.
import { CONTENT } from '../src/content';
import { OPTIONS_DESK, POX } from '../src/content/options';
import {
  Game,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_YEAR,
  calendarOf,
  valueOf,
  type Content,
  type InstrumentSpec,
  type SavedGame,
} from '../src/sim';
import { isOption } from '../src/sim/instrument';
import { delta, impliedFrom } from '../src/sim/options';
import { DESK_BLOCKS, DESK_SEES, blockById, type MarketView } from '../src/sim/strategy';
import { infrastructureFrom } from '../src/sim/upgrades';

const H = MS_PER_HOUR;
const MIN = 60_000;
const at = (d: number, ms: number) => d * MS_PER_DAY + ms;
const NO_RIVALS: Content = { ...CONTENT, competitors: [] };

type Peek = { view(now: number, m: Game['market'], n: []): MarketView; impliedCache: { computed: number } };
const viewOf = (g: Game, firm: unknown = g.firm) => (firm as Peek).view(g.now, g.market, []);

/** The player's firm on the Prairie rack, with the blocks given on and the rest off. */
function raced(content: Content, seed: number, on: string[], desks: string[] = [OPTIONS_DESK]): Game {
  const g = new Game(content, seed);
  for (const d of desks) g.openDesk(d);
  g.firm.infra = infrastructureFrom(CONTENT, { location: 'colo-prairie', network: 'microwave', computer: 'rack' });
  for (const b of g.firm.blocks) b.enabled = on.includes(b.id);
  g.skipToOpen();
  return g;
}

const run = (g: Game, until: number, stride = 2) => {
  while (g.now < until) g.step(Math.min(stride, until - g.now));
};
const clone = (g: Game): Game => Game.load(g.content, JSON.parse(JSON.stringify(g.save())) as SavedGame);
const options = (g: Game): InstrumentSpec[] => g.market.instruments.filter(isOption);

describe('what a desk’s blocks see', () => {
  it('names the options desk as seeing the futures desk’s symbols, and no other desk as seeing another’s', () => {
    expect(DESK_SEES.options).toEqual(['futures']);
    expect(Object.keys(DESK_SEES)).toEqual(['options']);
    expect(DESK_BLOCKS.options).toEqual(['optionMaker', 'parity', 'eventVol']);
  });

  it('shows an options block the index future and the options; a currencies block still sees no futures', () => {
    const g = raced(NO_RIVALS, 3, ['optionMaker', 'triangle', 'basisArb'], ['fx', 'metals', 'futures', OPTIONS_DESK]);
    const seen: Record<string, readonly string[]> = {};
    for (const id of ['optionMaker', 'triangle', 'basisArb']) {
      vi.spyOn(blockById(id), 'decide').mockImplementation((v: MarketView) => {
        seen[id] = v.symbols;
        return [];
      });
    }
    try {
      const everything = g.market.stocks.map((s) => s.symbol);
      g.firm.setWatch(everything);
      g.firm.infra = { ...g.firm.infra, computer: { ...g.firm.infra.computer, maxSymbols: 100 } };
      g.stepTicks(50);
      const deskOf = (symbol: string) => g.market.stocks.find((s) => s.symbol === symbol)?.desk ?? 'stocks';
      const desks = (id: string) => new Set((seen[id] ?? []).map(deskOf));
      expect(seen.optionMaker?.length).toBeGreaterThan(0);
      expect(desks('optionMaker')).toEqual(new Set(['stocks', 'futures', OPTIONS_DESK]));
      expect(seen.optionMaker).toContain('IDX');
      expect(seen.optionMaker!.some((s) => s.startsWith('IXF'))).toBe(true);
      // The currencies block sees the stocks and its own pairs: no future, no option.
      expect(desks('triangle')).toEqual(new Set(['stocks', 'fx']));
      // The futures block is as it was: the stocks and the futures, no option.
      expect(desks('basisArb')).toEqual(new Set(['stocks', 'futures']));
    } finally {
      vi.restoreAllMocks();
    }
  }, 60_000);
});

describe('the view’s options', () => {
  it('are absent while the desk is closed', () => {
    const g = new Game(NO_RIVALS, 2);
    expect(viewOf(g).options).toBeUndefined();
  });

  it('list each live option with its right, strike, expiry and underlying', () => {
    const g = raced(NO_RIVALS, 2, []);
    run(g, g.now + 2 * MIN, 10);
    const v = viewOf(g);
    const chain = v.options!.chain;
    expect(Object.keys(chain).sort()).toEqual(
      options(g)
        .map((o) => o.symbol)
        .sort(),
    );
    for (const o of options(g)) {
      expect(chain[o.symbol]).toMatchObject({
        right: o.right,
        strike: o.strike,
        expiry: o.expiry,
        underlying: 'IDX',
        multiplier: 100,
      });
    }
    expect(v.options!.rate).toBe(0.035);
  });

  it('give an implied volatility inverted from the book’s mid, never from the market’s belief or its volatility', () => {
    const g = raced(NO_RIVALS, 2, []);
    run(g, g.now + 2 * MIN, 10);
    const v = viewOf(g);
    let checked = 0;
    for (const o of options(g)) {
      const c = v.options!.chain[o.symbol]!;
      const q = v.quotes[POX.id]?.[o.symbol];
      if (!q || q.bid === null || q.ask === null) {
        expect(c.iv).toBeNull();
        continue;
      }
      const t = (o.expiry! - v.now) / MS_PER_YEAR;
      expect(c.iv).toBe(impliedFrom(o.right!, (q.bid + q.ask) / 2, c.spot!, o.strike!, t, 0.035));
      checked++;
    }
    // At 0DTE only the options near the money have a two-sided book that implies a volatility.
    expect(checked).toBeGreaterThanOrEqual(4);
    // Change the market's volatility state: the view is the same, for it only reads books.
    const before = Object.fromEntries(Object.entries(v.options!.chain).map(([s, c]) => [s, c.iv]));
    g.market.volatility.variance *= 9;
    g.market.volatility.wander += 0.3;
    const after = viewOf(g);
    expect(Object.fromEntries(Object.entries(after.options!.chain).map(([s, c]) => [s, c.iv]))).toEqual(before);
  });

  it('carry the day’s market-wide releases from the public calendar, times only', () => {
    const g = raced(NO_RIVALS, 5, []);
    for (const when of [at(0, 10 * H), at(0, 14 * H), at(0, 23 * H)]) {
      run(g, when, 500);
      const day = Math.floor(g.now / MS_PER_DAY);
      expect(viewOf(g).options!.releases).toEqual(calendarOf(g, day).map((x) => x.at));
    }
    expect(viewOf(g).options!.releases.length).toBeGreaterThan(0);
  }, 120_000);

  it('cost a firm with no options block nothing: no inversion is done unless a block reads them', () => {
    const g = raced(NO_RIVALS, 4, ['momentum']);
    run(g, g.now + 3 * MIN);
    // The view is built every decision and the desk is open; nobody has read the options.
    expect((g.firm as unknown as Peek).impliedCache.computed).toBe(0);
    const v = viewOf(g);
    expect((g.firm as unknown as Peek).impliedCache.computed).toBe(0);
    // Reading the options (their strikes and expiries) is not reading a volatility either.
    expect(Object.keys(v.options!.chain)).toHaveLength(12);
    expect((g.firm as unknown as Peek).impliedCache.computed).toBe(0);
    const ivs = () => Object.values(viewOf(g).options!.chain).map((c) => c.iv);
    ivs();
    const first = (g.firm as unknown as Peek).impliedCache.computed;
    expect(first).toBeGreaterThan(0);
    // Read again with the books as they were: the same mids, nothing more to work out.
    ivs();
    expect((g.firm as unknown as Peek).impliedCache.computed).toBe(first);
  });

  it('work an option out again only when its mid moves, not every decision', () => {
    const g = raced(NO_RIVALS, 4, ['optionMaker']);
    const decisions = 3 * 60 * 100; // three minutes of a decision every 10 ms
    run(g, g.now + 3 * MIN);
    const computed = (g.firm as unknown as Peek).impliedCache.computed;
    expect(computed).toBeGreaterThan(0);
    // Twelve options a decision would be 216,000 inversions; mids move far less often than that.
    expect(computed).toBeLessThan((decisions * 12) / 5);
  });
});

describe('a paced block', () => {
  const calls = (every: number) => {
    const g = raced(NO_RIVALS, 3, ['optionMaker']);
    g.firm.setBlock('optionMaker', { params: { every } });
    let n = 0;
    const real = blockById('optionMaker').decide.bind(blockById('optionMaker'));
    vi.spyOn(blockById('optionMaker'), 'decide').mockImplementation((v: MarketView, p) => {
      n++;
      return real(v, p);
    });
    try {
      run(g, g.now + 5000);
    } finally {
      vi.restoreAllMocks();
    }
    return n;
  };

  it('runs at the first decision of each interval of its pace, and at every decision with none', () => {
    // The Prairie rack decides every 10 ms: 500 decisions in five seconds.
    expect(calls(0)).toBe(500);
    expect(calls(100)).toBe(50);
    expect(calls(1000)).toBe(5);
  }, 120_000);
});

describe('the rival, Bluestem Volatility', () => {
  const bluestem = CONTENT.competitors.find((c) => c.id === 'bluestem');

  it('is in the content as the options desk’s rival, on the Prairie rack, running optionMaker hedged', () => {
    expect(bluestem).toBeDefined();
    expect(bluestem!.name).toBe('Bluestem Volatility');
    expect(bluestem!.desk).toBe(OPTIONS_DESK);
    expect(bluestem!.location).toBe('colo-prairie');
    expect(bluestem!.computer).toBe('rack');
    // It quotes where the venue's quoter does and looks twice a second: cheap to step, and one a fast firm can pick off.
    expect(bluestem!.blocks).toEqual([{ id: 'optionMaker', params: { hedge: 1, every: 500, edge: 1 } }]);
    expect(bluestem!.watches).toEqual(expect.arrayContaining(['futures', OPTIONS_DESK]));
  });

  it('joins when the desk opens, not before, and trades the options', () => {
    const g = new Game(CONTENT, 7);
    expect(g.competitors.some((c) => c.id === 'bot:bluestem')).toBe(false);
    g.openDesk(OPTIONS_DESK);
    const rival = g.competitors.find((c) => c.id === 'bot:bluestem')!;
    expect(rival).toBeDefined();
    expect(rival.blocks.filter((b) => b.enabled).map((b) => b.id)).toEqual(['optionMaker']);
    g.skipToOpen();
    run(g, g.now + 30 * MIN, 2);
    const mine = rival.fills.filter((f) => g.market.optionSpecs.has(f.symbol));
    expect(mine.length).toBeGreaterThan(0);
    expect(rival.fills.every((f) => f.block === 'optionMaker')).toBe(true);
  }, 240_000);

  it('is a different game from one without it, and the same game for the same seed', () => {
    const play = (c: Content, seed: number) => {
      const g = new Game(c, seed);
      g.openDesk(OPTIONS_DESK);
      for (const b of g.firm.blocks) b.enabled = false;
      g.skipToOpen();
      run(g, g.now + 20 * MIN, 2);
      return g;
    };
    const a = play(CONTENT, 9);
    const b = play(CONTENT, 9);
    expect(a.fingerprint()).toBe(b.fingerprint());
    expect(play(NO_RIVALS, 9).fingerprint()).not.toBe(a.fingerprint());
  }, 240_000);

  it('draws nothing from the stocks’ world: their fair values and headlines are what they are without it', () => {
    const fairs = (c: Content) => {
      const g = new Game(c, 11);
      g.openDesk(OPTIONS_DESK);
      for (const b of g.firm.blocks) b.enabled = false;
      g.skipToOpen();
      run(g, g.now + 5 * MIN, 2);
      return {
        fair: Object.fromEntries(
          g.market.stocks.filter((s) => !isOption(s)).map((s) => [s.symbol, g.market.fair.get(s.symbol)]),
        ),
        news: g.save().news,
      };
    };
    expect(fairs(CONTENT)).toEqual(fairs(NO_RIVALS));
  }, 240_000);
});

describe('saves with the desk open and blocks on', () => {
  const ALL = ['optionMaker', 'parity', 'eventVol'];

  it('load a save from the previous tick to the same future, blocks and Bluestem in', () => {
    const g = raced(CONTENT, 6, ALL);
    g.firm.setBlock('eventVol', { enabled: true, params: { buyBefore: 60, sellBefore: 5 } });
    run(g, g.now + 2 * MIN);
    const back = clone(g);
    expect(back.fingerprint()).toBe(g.fingerprint());
    expect(back.firm.blocks.filter((b) => b.enabled).map((b) => b.id)).toEqual(ALL);
    for (let i = 0; i < 3000; i++) {
      g.step(2);
      back.step(2);
      if (i % 600 === 0) expect(back.fingerprint()).toBe(g.fingerprint());
    }
    expect(back.fingerprint()).toBe(g.fingerprint());
    expect(g.competitors.find((c) => c.id === 'bot:bluestem')!.fills.length).toBeGreaterThan(0);
  }, 240_000);

  it('load to the same future across the flattening before 15:55 and the 16:00 expiry', () => {
    const g = raced(CONTENT, 6, ALL);
    run(g, at(0, 15 * H + 54 * MIN + 50_000), 1000);
    const back = clone(g);
    expect(back.fingerprint()).toBe(g.fingerprint());
    for (let i = 0; i < 4000; i++) {
      g.step(2);
      back.step(2);
    }
    expect(back.fingerprint()).toBe(g.fingerprint());
    // Across 15:55 the block flattened today’s options, so Bluestem holds none of them at the close.
    run(g, at(0, 16 * H) - 2, 100);
    run(back, at(0, 16 * H) - 2, 100);
    const todays = (f: Game['firm']) =>
      [...f.positions].filter(([s, p]) => p.qty !== 0 && g.market.optionSpecs.get(s)?.expiry === at(0, 16 * H));
    expect(todays(g.competitors.find((c) => c.id === 'bot:bluestem')!).length).toBeLessThanOrEqual(2);
    expect(back.fingerprint()).toBe(g.fingerprint());
  }, 600_000);
});

describe('Bluestem’s short options under margin', () => {
  it('are margined, and a margin call flattens the options and the futures together', () => {
    const g = new Game(CONTENT, 5);
    g.openDesk(OPTIONS_DESK);
    for (const b of g.firm.blocks) b.enabled = false;
    // The rival is left with nothing to do, so what it holds is what the test gives it.
    const rival = g.competitors.find((c) => c.id === 'bot:bluestem')!;
    for (const b of rival.blocks) b.enabled = false;
    g.skipToOpen();
    run(g, at(0, 10 * H), 200);
    // Cancel what it rests; then give it a book of short puts and a long future, more than its cash carries.
    const put = options(g).find((o) => o.right === 'put' && o.expiry === at(0, 16 * H) && o.symbol.startsWith('OP0'))!;
    const future = g.market.live('IXF')[0]!;
    rival.positions.set(put.symbol, { qty: -3000, avgCost: 30 });
    rival.cash += valueOf(100, 3000, 30);
    rival.positions.set(future, { qty: 40, avgCost: g.market.fair.get(future)! });
    expect(rival.marginedHeld().sort()).toEqual([future, put.symbol].sort());
    const need = rival.marginRequired('maintenance', new Map([[put.symbol, 30]]));
    expect(need).toBeGreaterThan(rival.equity(g.market, g.now));
    g.stepTicks(1500);
    const risk = [...rival.orders.values()].filter((o) => o.block === 'risk');
    expect(new Set(risk.map((o) => o.symbol))).toEqual(new Set([future, put.symbol]));
    // Both are being worked down, a book’s depth a time.
    expect(rival.positions.get(put.symbol)!.qty).toBeGreaterThan(-3000);
    expect(rival.positions.get(future)!.qty).toBeLessThan(40);
  }, 120_000);

  it('are refused past the initial margin like any firm’s: a sale that would take it over is not sent', () => {
    const g = new Game(NO_RIVALS, 5);
    g.openDesk(OPTIONS_DESK);
    for (const b of g.firm.blocks) b.enabled = false;
    g.skipToOpen();
    run(g, at(0, 10 * H), 200);
    const o = options(g).find((x) => x.right === 'call' && x.expiry === at(0, 16 * H))!;
    g.firm.setWatch([o.symbol]);
    const need = g.firm.marginRequired('initial');
    expect(need).toBe(0);
    g.hand({ symbol: o.symbol, side: 'sell', size: 5000, exchange: POX.id, type: 'limit', price: 1 });
    g.stepTicks(500);
    expect(g.firm.positions.get(o.symbol)?.qty ?? 0).toBe(0);
  }, 120_000);
});

describe('the books with Bluestem in', () => {
  it('stay two-sided and uncrossed, and its position and net delta stay bounded', () => {
    const g = new Game(CONTENT, 8);
    g.openDesk(OPTIONS_DESK);
    for (const b of g.firm.blocks) b.enabled = false;
    g.skipToOpen();
    const rival = g.competitors.find((c) => c.id === 'bot:bluestem')!;
    const venue = g.market.venue(POX.id);
    const maker = blockById('optionMaker');
    const maxPosition = maker.spec.params.find((p) => p.key === 'maxPosition')!.default;
    const band = maker.spec.params.find((p) => p.key === 'hedgeBand')!.default;
    let samples = 0;
    let crossed = 0;
    const near = new Map<string, { n: number; two: number }>();
    let largestHeld = 0;
    let largestNet = 0;
    const until = g.now + 30 * MIN;
    while (g.now < until) {
      g.step(2);
      if (g.now % 5000 !== 0) continue;
      samples++;
      let net = 0;
      for (const s of options(g)) {
        const q = venue.quote(s.symbol);
        if (q.bid !== null && q.ask !== null && q.bid >= q.ask) crossed++;
        const near_ = Math.abs(s.strike! - g.market.fair.get('IDX')!) <= 100;
        if (near_) {
          const e = near.get(s.symbol) ?? { n: 0, two: 0 };
          e.n++;
          if (q.bid !== null && q.ask !== null) e.two++;
          near.set(s.symbol, e);
        }
        const pos = rival.positions.get(s.symbol)?.qty ?? 0;
        largestHeld = Math.max(largestHeld, Math.abs(pos));
        if (pos !== 0) {
          const t = Math.max(1e-9, (s.expiry! - g.now) / MS_PER_YEAR);
          net += pos * delta(s.right!, g.market.fair.get('IDX')!, s.strike!, t, g.market.optionVol(s, g.now), 0.035);
        }
      }
      for (const [s, p] of rival.positions) if (s.startsWith('IXF')) net += p.qty;
      largestNet = Math.max(largestNet, Math.abs(net));
    }
    expect(samples).toBeGreaterThan(300);
    expect(crossed).toBe(0);
    for (const [, e] of near) expect(e.two / e.n).toBeGreaterThan(0.95);
    // A maker quotes a size either side of a limit, so can pass it by one quote's worth before the next decision.
    expect(largestHeld).toBeLessThanOrEqual(maxPosition + 2 * maker.spec.params.find((p) => p.key === 'size')!.default);
    // The hedge keeps the net delta near its band; the tolerance is the options' own move between decisions.
    expect(largestNet).toBeLessThanOrEqual(band + 25);
  }, 600_000);
});
