import { CONTENT } from '../src/content';
import { GC, METALS_DESK, METAL_SERIES, METAL_VENUES, SPOT, STORAGE, SUPPLY_NEWS } from '../src/content/metals';
import { Game, MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, MS_PER_YEAR, TICK_MS, type SavedGame } from '../src/sim';
import { isOpenIn } from '../src/sim/session';
import type { Content } from '../src/sim/types';

const H = MS_PER_HOUR;
/** Simulated ms at a weekday (Monday 0) and a time of day, in the game's first week. */
const at = (weekday: number, time: number) => weekday * MS_PER_DAY + time;

/** The miner and two other stocks, the stock exchanges and the metals desk: no rivals, so a day steps quickly. */
const METALS: Content = {
  ...CONTENT,
  stocks: CONTENT.stocks.filter((s) => ['ABC', 'QNT', 'RDG'].includes(s.symbol)),
  exchanges: [...CONTENT.exchanges.filter((e) => e.desk === undefined), ...METAL_VENUES],
  series: METAL_SERIES,
  instruments: SPOT,
  currencies: [],
  competitors: [],
};

/** A game with the metals desk open, the player's blocks off. */
function metalsGame(content: Content = METALS, seed = 3): Game {
  const g = new Game(content, seed);
  g.openDesk(METALS_DESK);
  for (const b of g.firm.blocks) b.enabled = false;
  return g;
}

/** Step in coarse strides to `until`: a test of the daily passes, not of the books. */
const run = (g: Game, until: number, stride = 1000) => {
  while (g.now < until) g.step(Math.min(stride, until - g.now));
};

const value = (g: Game, symbol: string, qty: number) =>
  Math.abs(qty * (g.market.scales.get(symbol) ?? 1) * g.market.markOf(symbol));

describe('the metals desk, closed', () => {
  it('is in the content with the miner, three venues, two spots and two series of three', () => {
    expect(METALS.stocks.map((s) => s.symbol)).toContain('RDG');
    const g = new Game(CONTENT, 1);
    expect(g.market.desks).toContain(METALS_DESK);
    expect(g.market.isDeskOpen(METALS_DESK)).toBe(false);
    expect(g.market.live('GC')).toHaveLength(3);
    expect(g.market.live('SI')).toHaveLength(3);
    expect(g.market.stocks.some((s) => s.desk === METALS_DESK)).toBe(false);
    expect(g.deskNews.map((n) => n.desk)).toEqual([METALS_DESK]);
  });

  it('draws nothing and saves nothing of its leases or news', () => {
    const g = new Game(METALS, 2);
    run(g, at(0, 18 * H), 60_000);
    expect(g.deskNews[0]!.started).toBe(false);
    expect(g.deskNews[0]!.published).toHaveLength(0);
    expect(g.market.leases.get('XAU')).toBe(0.003);
    const saved = g.save();
    expect(saved.deskNews).toBeUndefined();
    expect(saved.market.leases).toBeUndefined();
    expect(saved.market.reads).toBeUndefined();
  });
});

describe('gold reads the miners', () => {
  it('takes the Mining factor at its loading, at once, when the desk opens', () => {
    const g = new Game(METALS, 4);
    g.market.factors.sectors.set('mining', 100);
    g.openDesk(METALS_DESK);
    expect(g.market.fair.get('XAU')).toBeCloseTo(24000 * (1 + (0.6 * 100) / 10_000), 9);
    expect(g.market.fair.get('XAG')).toBeCloseTo(3000 * (1 + (1.2 * 100) / 10_000), 9);
    // And its moves after: a rise in the miners lifts gold by the loading's share of it.
    const before = g.market.fair.get('XAU')!;
    g.market.factors.sectors.set('mining', 150);
    (g.market as unknown as { read(s: unknown): void }).read(g.market.stock('XAU'));
    expect(g.market.fair.get('XAU')).toBeCloseTo(before * (1 + (0.6 * 50) / 10_000), 9);
  });

  // The hard rule of the desk: opening it moves nothing of the stocks' world.
  it('leaves every stock fair value and headline the same with the desk open as shut', () => {
    const play = (open: boolean) => {
      const g = new Game(CONTENT, 9);
      if (open) g.openDesk(METALS_DESK);
      g.skipToOpen();
      g.stepTicks((90 * 1000) / TICK_MS);
      return g;
    };
    const shut = play(false);
    const open = play(true);
    const stocks = CONTENT.stocks.map((s) => s.symbol);
    expect(stocks.map((s) => open.market.fair.get(s))).toEqual(stocks.map((s) => shut.market.fair.get(s)));
    expect(open.market.factors.sectors).toEqual(shut.market.factors.sectors);
    expect(open.news.published.map((h) => [h.at, h.text])).toEqual(shut.news.published.map((h) => [h.at, h.text]));
    expect(open.news.scheduled.map((h) => [h.at, h.text])).toEqual(shut.news.scheduled.map((h) => [h.at, h.text]));
    expect(open.streams.world.save()).toBe(shut.streams.world.save());
    // And gold did move, from the miners and its own wander.
    expect(open.market.fair.get('XAU')).not.toBe(24000);
    expect(shut.market.fair.get('XAU')).toBe(24000);
  }, 120_000);
});

describe('a carry that moves', () => {
  it('is the dollar rate and storage less the lease, and the future is the spot carried by it', () => {
    const g = metalsGame();
    run(g, at(0, 7 * H), 1000);
    const lease = g.market.leases.get('XAU')!;
    expect(lease).not.toBe(0.003);
    const [near, , far] = g.market.live('GC');
    const view = g.market.sharedParts().contracts[near!]!;
    expect(view.carry).toBeCloseTo(0.05 - lease, 12);
    const spec = g.market.stock(far!);
    const years = (spec.expiry! - g.now) / MS_PER_YEAR;
    g.step(TICK_MS);
    const carry = 0.05 - g.market.leases.get('XAU')!;
    expect(g.market.fair.get(far!)).toBeCloseTo(
      g.market.fair.get('XAU')! * (1 + carry * (years - TICK_MS / MS_PER_YEAR)),
      6,
    );
    // The curve starts in contango: each later expiry dearer.
    const curve = g.market.live('GC').map((s) => g.market.fair.get(s)!);
    expect(curve[0]).toBeLessThan(curve[1]!);
    expect(curve[1]).toBeLessThan(curve[2]!);
  });

  it('flips the curve into backwardation when a squeeze lifts the lease past the carry', () => {
    const g = metalsGame();
    run(g, at(0, 7 * H), 1000);
    g.market.shiftLease('XAU', 0.08);
    g.step(TICK_MS);
    const spot = g.market.fair.get('XAU')!;
    const curve = g.market.live('GC').map((s) => g.market.fair.get(s)!);
    expect(curve[0]).toBeLessThan(spot);
    expect(curve[1]).toBeLessThan(curve[0]!);
    expect(curve[2]).toBeLessThan(curve[1]!);
    // The views the blocks read say so too, as new objects.
    const views = g.market.sharedParts().contracts;
    expect(views[g.market.live('GC')[0]!]!.carry).toBeLessThan(0);
  });

  it('moves with supply news, which lands only in the metals venues hours', () => {
    const g = metalsGame(METALS, 5);
    const leaseJumps: { text: string; jump: number }[] = [];
    while (g.now < at(5, 0)) {
      const before = new Map(g.market.leases);
      g.step(60_000);
      for (const h of g.deskNews[0]!.tickPublished) {
        const s = h.symbols[0]!;
        leaseJumps.push({ text: h.text, jump: g.market.leases.get(s)! - before.get(s)! });
      }
    }
    const published = g.deskNews[0]!.published;
    expect(published.length).toBeGreaterThan(5);
    for (const h of published) {
      expect(METAL_VENUES.some((v) => isOpenIn(v.session!, h.at))).toBe(true);
      expect(h.symbols.every((s) => ['XAU', 'XAG'].includes(s))).toBe(true);
    }
    // A fire or a strike lifts the lease by a few percent; a find lowers it.
    const fire = leaseJumps.find((j) => j.text.startsWith('Fire'));
    const found = leaseJumps.find((j) => j.text.startsWith('New'));
    expect(fire?.jump).toBeGreaterThan(0.02);
    expect(found?.jump).toBeLessThan(-0.003);
    // It is drawn on the desk's stream: the stocks' news is the same as a game with the desk shut.
    const shut = new Game(METALS, 5);
    while (shut.now < at(5, 0)) shut.step(60_000);
    expect(g.news.published.map((h) => h.text)).toEqual(shut.news.published.map((h) => h.text));
  }, 120_000);

  it('has no supply news on Saturday, when every metals venue is shut', () => {
    const sat = at(5, 0);
    for (const v of METAL_VENUES)
      for (let t = sat; t < sat + MS_PER_DAY; t += MS_PER_MINUTE) expect(isOpenIn(v.session!, t)).toBe(false);
    expect(SUPPLY_NEWS.templates.length).toBe(4);
  });
});

describe('storage and the lease', () => {
  it('charges a long storage and a short its lease, one night a weekday, three on Friday, none at the weekend', () => {
    const g = metalsGame();
    run(g, at(0, 7 * H), 1000);
    g.firm.positions.set('XAU', { qty: 2, avgCost: 24000 });
    g.firm.positions.set('XAG', { qty: -3, avgCost: 3000 });
    const charge = (weekday: number) => {
      g.now = at(weekday, STORAGE.at);
      const cash = g.firm.cash;
      g.storage(STORAGE);
      return g.firm.cash - cash;
    };
    const night = (weekday: number) =>
      -Math.round((value(g, 'XAU', 2) * STORAGE.rate * weekday) / 365) -
      Math.round((value(g, 'XAG', 3) * g.market.leases.get('XAG')! * weekday) / 365);
    expect(charge(1)).toBe(night(1));
    expect(charge(1)).toBeLessThan(0);
    expect(charge(4)).toBe(night(3));
    expect(charge(5)).toBe(0);
    expect(charge(6)).toBe(0);
  });

  it('goes into that day s report and P&L at 17:00', () => {
    const g = metalsGame();
    run(g, at(0, 16 * H + 1000), 1000);
    g.firm.positions.set('XAU', { qty: 1, avgCost: 24000 });
    run(g, at(0, 17 * H) - 1000, 1000);
    const report = g.days[g.days.length - 1]!;
    expect(report.storage).toBeUndefined();
    const cash = g.firm.cash;
    g.step(2000);
    const charged = g.firm.cash - cash;
    expect(charged).toBe(-Math.round((value(g, 'XAU', 1) * STORAGE.rate) / 365));
    const after = g.days[g.days.length - 1]!;
    expect(after.storage).toBe(charged);
    expect(after.pnl).toBe(report.pnl + charged);
    expect(after.equityAtClose).toBe(report.equityAtClose + charged);
  }, 120_000);
});

describe('delivery', () => {
  for (const qty of [2, -2]) {
    it(`delivers a ${qty > 0 ? 'long' : 'short'} held into expiry as spot, which then pays ${qty > 0 ? 'storage' : 'the lease'}`, () => {
      const g = metalsGame();
      run(g, at(4, 13.5 * H) - 60_000, 60_000);
      const near = g.market.live('GC')[0]!;
      expect(g.market.stock(near).expiry).toBe(at(4, 13.5 * H));
      const price = g.market.settlementPrice(near);
      g.firm.positions.set(near, { qty, avgCost: price });
      run(g, at(4, 13.5 * H), 1000);
      expect(g.firm.positions.has(near)).toBe(false);
      const metal = g.firm.positions.get('XAU')!;
      // One lot of the future is one lot of the spot: ten ounces.
      expect(metal.qty).toBe(qty);
      const cash = g.firm.cash;
      run(g, at(4, 17 * H) + 1000, 1000);
      const rate = qty > 0 ? STORAGE.rate : g.market.leases.get('XAU')!;
      expect(g.firm.cash - cash).toBe(-Math.round((value(g, 'XAU', qty) * rate * 3) / 365));
    }, 120_000);
  }

  it('pays for delivered metal at the final price, in its own lots', () => {
    const g = metalsGame();
    run(g, at(4, 13.5 * H) - 1000, 60_000);
    const near = g.market.live('GC')[0]!;
    g.firm.positions.set(near, { qty: 1, avgCost: g.market.settlementPrice(near) });
    const cash = g.firm.cash;
    g.step(1000);
    const final = g.firm.positions.get('XAU')!.avgCost;
    expect(cash - g.firm.cash).toBeCloseTo(100 * final, 0);
    expect(final).toBeGreaterThan(20000);
  });
});

describe('settlement', () => {
  it('settles the futures at Hudson s close, and nothing at the spot venues', () => {
    const g = metalsGame();
    const live = [...g.market.live('GC'), ...g.market.live('SI')];
    expect(g.market.settlesOn('HUDSON').sort()).toEqual(live.sort());
    expect(g.market.settlesOn('SUNDAR')).toEqual([]);
    expect(g.market.settlesOn('THAMESFORD')).toEqual([]);
    expect(GC.contract.venues).toEqual(['HUDSON']);
  });

  // Amended in 6c (Chris, after 6b): Hudson lists the futures only; the spot trades on Sundar and Thamesford.
  it('lists the spot on Sundar and Thamesford, and only the futures on Hudson', () => {
    const g = metalsGame();
    for (const metal of ['XAU', 'XAG']) {
      expect(g.market.venuesOf(metal).map((e) => e.id)).toEqual(['SUNDAR', 'THAMESFORD']);
    }
    const hudson = [...g.market.venue('HUDSON').stocks.keys()].sort();
    expect(hudson).toEqual([...g.market.live('GC'), ...g.market.live('SI')].sort());
  });
});

describe('saves with the desk open', () => {
  it('keep the leases, the reads and the supply news, version 3, and load to the same future', () => {
    const g = metalsGame(METALS, 6);
    run(g, at(0, 7 * H), 1000);
    g.firm.positions.set('XAU', { qty: 1, avgCost: 24000 });
    const saved = JSON.parse(JSON.stringify(g.save())) as SavedGame;
    expect(saved.version).toBe(3);
    expect(saved.market.leases?.XAU).toBe(g.market.leases.get('XAU'));
    expect(saved.market.reads).toBeDefined();
    expect(saved.deskNews?.[METALS_DESK]).toBeDefined();
    const back = Game.load(METALS, saved);
    expect(back.fingerprint()).toBe(g.fingerprint());
    run(g, at(1, 7 * H), 5000);
    run(back, at(1, 7 * H), 5000);
    expect(back.fingerprint()).toBe(g.fingerprint());
    expect(back.deskNews[0]!.published.map((h) => h.text)).toEqual(g.deskNews[0]!.published.map((h) => h.text));
    expect(back.firm.cash).toBe(g.firm.cash);
  }, 120_000);

  it('load a save from before the desk with no leases, the desk closed', () => {
    const g = new Game(METALS, 7);
    run(g, at(0, 7 * H), 60_000);
    const saved = JSON.parse(JSON.stringify(g.save())) as SavedGame;
    const back = Game.load(METALS, saved);
    expect(back.market.isDeskOpen(METALS_DESK)).toBe(false);
    expect(back.market.leases.get('XAU')).toBe(0.003);
    expect(back.fingerprint()).toBe(g.fingerprint());
  });
});
