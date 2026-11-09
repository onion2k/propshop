import { CONTENT, LESSONS, REGIMES } from '../src/content';
import {
  Game,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  TICK_MS,
  isMarketOpen,
  regimeFor,
  type Content,
  type DayReport,
  type Snapshot,
} from '../src/sim';
import { infrastructureFrom } from '../src/sim/upgrades';
import { METALS_DESK, METAL_SERIES, METAL_VENUES, SPOT } from '../src/content/metals';

function fresh(): Snapshot {
  return new Game(CONTENT, 1).snapshot();
}

const L = (id: string) => LESSONS.find((l) => l.id === id)!;

describe('lessons', () => {
  it("are the stocks' ten in stage order, then the futures desk's three, the currencies desk's four and the metals desk's five, each with words", () => {
    expect(LESSONS.map((l) => l.id)).toEqual([
      'home',
      'seat',
      'gap',
      'race',
      'cost',
      'maker',
      'noise',
      'hand',
      'used',
      'week',
      'basis',
      'overnight',
      'lead',
      'pips',
      'triangle',
      'refused',
      'rollover',
      'curve',
      'flip',
      'delivery',
      'fix',
      'miner',
    ]);
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
    const gap = L('gap');
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
      // A new game starts on momentum; the race needs arbitrage.
      g.setBlock('momentum', { enabled: false });
      g.setBlock('arbitrage', { enabled: true });
      g.skipToOpen();
      let done = false;
      for (let i = 0; i < (40 * MS_PER_MINUTE) / TICK_MS && !done; i++) {
        g.step();
        if (i % 5000 === 0) done = L('race').done(g.snapshot()) && L('cost').done(g.snapshot());
      }
      expect(done).toBe(true);
    },
  );

  it('race and cost: a beaten momentum order ticks neither, a beaten arbitrage order ticks race', () => {
    const order = (over: Record<string, unknown>) =>
      ({
        block: 'momentum',
        ioc: true,
        ackAt: 1,
        filled: 0,
        size: 100,
        beatenBy: [{}],
        ...over,
      }) as unknown as Snapshot['orders'][number];
    const withOrders = (orders: Snapshot['orders']) => ({ ...fresh(), orders });
    const momentum = withOrders(Array.from({ length: 30 }, () => order({})));
    expect(L('race').done(momentum)).toBe(false);
    expect(L('cost').done(momentum)).toBe(false);
    const arb = withOrders([order({ block: 'arbitrage' })]);
    expect(L('race').done(arb)).toBe(true);
    expect(L('cost').done(arb)).toBe(false);
    const many = withOrders(Array.from({ length: 20 }, () => order({ block: 'arbitrage' })));
    expect(L('cost').done(many)).toBe(true);
    // Mixed: twenty momentum losses do not make up arbitrage's twenty.
    const mixed = withOrders([
      ...Array.from({ length: 19 }, () => order({ block: 'arbitrage' })),
      ...Array.from({ length: 5 }, () => order({})),
    ]);
    expect(L('cost').done(mixed)).toBe(false);
  });

  it('home: done once momentum has earned', { timeout: 120_000 }, () => {
    const g = new Game(CONTENT, 4);
    for (const b of g.firm.blocks) b.enabled = b.id === 'momentum';
    g.skipToOpen();
    let done = false;
    for (let i = 0; i < (60 * MS_PER_MINUTE) / TICK_MS && !done; i++) {
      g.step();
      if (i % 5000 === 0) done = L('home').done(g.snapshot());
    }
    expect(done).toBe(true);
  });

  it('maker: done after ten market maker fills', { timeout: 30_000 }, () => {
    const g = new Game(CONTENT, 5);
    for (const b of g.firm.blocks) b.enabled = b.id === 'marketMaker';
    g.setBlock('marketMaker', { params: { halfSpread: 2 } });
    g.skipToOpen();
    for (let i = 0; i < (5 * MS_PER_MINUTE) / TICK_MS; i++) g.step();
    expect(L('maker').done(g.snapshot())).toBe(true);
  });

  it('noise: done once a real and a noise headline have settled', { timeout: 30_000 }, () => {
    const g = new Game(CONTENT, 6);
    g.skipToOpen();
    let done = false;
    for (let d = 0; d < 5 && !done; d++) {
      while (!isMarketOpen(g.now)) g.step(MS_PER_SECOND);
      while (isMarketOpen(g.now) && !done) {
        g.step(MS_PER_MINUTE);
        done = L('noise').done(g.snapshot());
      }
      g.skipToOpen();
    }
    expect(done).toBe(true);
  });

  it('seat: done once anything is bought', () => {
    const g = new Game(CONTENT, 7);
    expect(L('seat').done(g.snapshot())).toBe(false);
    g.firm.infra = infrastructureFrom(CONTENT, { location: 'city', network: 'consumer', computer: 'laptop' });
    expect(L('seat').done(g.snapshot())).toBe(true);
  });

  it('week: done on Monday of week two', () => {
    const g = new Game(CONTENT, 8);
    expect(L('week').done(g.snapshot())).toBe(false);
    g.now = 7 * 24 * 60 * MS_PER_MINUTE;
    expect(L('week').done(g.snapshot())).toBe(true);
  });

  it(
    'hand and used: done by a 5,000 market buy read, and by a bid that has rested two seconds',
    { timeout: 60_000 },
    () => {
      const [hand, used] = [LESSONS.find((l) => l.id === 'hand')!, LESSONS.find((l) => l.id === 'used')!];
      const g = new Game(CONTENT, 3);
      g.skipToOpen();
      while (!isMarketOpen(g.now)) g.step();
      for (let i = 0; i < (10 * MS_PER_SECOND) / TICK_MS; i++) g.step();
      expect(hand.done(g.snapshot())).toBe(false);
      expect(used.done(g.snapshot())).toBe(false);
      const stock = g.snapshot().stocks[0]!;
      g.hand({ symbol: stock.symbol, side: 'buy', size: 5000, exchange: 'best', type: 'market' });
      g.hand({
        symbol: stock.symbol,
        side: 'buy',
        size: 5000,
        exchange: 'HARBOR',
        type: 'limit',
        price: (stock.bid ?? 100) - 1,
      });
      for (let i = 0; i < (6 * MS_PER_SECOND) / TICK_MS; i++) g.step();
      const s = g.snapshot();
      expect(hand.done(s)).toBe(
        s.orders.some((o) => o.block === 'hand' && o.beatenBy.length > 0) ||
          new Set(s.fills.filter((f) => f.block === 'hand').map((f) => f.exchange)).size >= 2,
      );
      expect(used.done(s)).toBe(true);
    },
  );

  describe("the currencies desk's", () => {
    /** A snapshot with the desk open, and these fills, orders and days in it. */
    function withFx(over: Partial<Snapshot> = {}): Snapshot {
      const g = new Game(CONTENT, 9);
      g.openDesk('fx');
      return { ...g.snapshot(), ...over };
    }
    const fill = (block: string, symbol: string) => ({ block, symbol }) as unknown as Snapshot['fills'][number];

    it('Count in pips: done by a hand fill in a pair, not in a stock', () => {
      expect(L('pips').done(withFx({ fills: [fill('hand', CONTENT.stocks[0]!.symbol)] }))).toBe(false);
      expect(L('pips').done(withFx({ fills: [fill('triangle', 'EURUSD')] }))).toBe(false);
      expect(L('pips').done(withFx({ fills: [fill('hand', 'EURUSD')] }))).toBe(true);
    });

    it('Count in pips: done in a game by ten lots bought by hand', { timeout: 60_000 }, () => {
      const g = new Game(CONTENT, 9);
      g.openDesk('fx');
      // A laptop watches four symbols: the pair has to be one of them for its quote to reach the desk.
      g.firm.setWatch(['EURUSD']);
      g.stepTicks((10 * MS_PER_SECOND) / TICK_MS);
      expect(L('pips').done(g.snapshot())).toBe(false);
      expect(g.hand({ symbol: 'EURUSD', side: 'buy', size: 10, exchange: 'EASTHOLM', type: 'market' }).ok).toBe(true);
      g.stepTicks(MS_PER_SECOND / TICK_MS);
      expect(L('pips').done(g.snapshot())).toBe(true);
    });

    it('Close a triangle: done once the triangle has filled in the cross and both legs', () => {
      const two = [fill('triangle', 'EURUSD'), fill('triangle', 'USDJPY')];
      expect(L('triangle').done(withFx({ fills: two }))).toBe(false);
      expect(L('triangle').done(withFx({ fills: [...two, fill('hand', 'EURJPY')] }))).toBe(false);
      expect(L('triangle').done(withFx({ fills: [...two, fill('triangle', 'EURJPY')] }))).toBe(true);
    });

    it('Be refused: done by an order the dealer refused', () => {
      const order = (status: string) => ({ status }) as unknown as Snapshot['orders'][number];
      expect(L('refused').done(withFx({ orders: [order('cancelled'), order('rejected')] }))).toBe(false);
      expect(L('refused').done(withFx({ orders: [order('refused')] }))).toBe(true);
    });

    it('Earn the rollover: done by a day whose report has a rollover paid', () => {
      const day = (rollover?: number) => ({ ...(rollover === undefined ? {} : { rollover }) }) as unknown as DayReport;
      expect(L('rollover').done(withFx({ days: [day(), day(-40)] }))).toBe(false);
      expect(L('rollover').done(withFx({ days: [day(), day(49)] }))).toBe(true);
    });
  });

  describe("the metals desk's", () => {
    /** A snapshot with the desk open, and these fields over it. */
    function withMetals(over: Partial<Snapshot> = {}): Snapshot {
      const g = new Game(CONTENT, 9);
      g.openDesk(METALS_DESK);
      return { ...g.snapshot(), ...over };
    }
    type Row = Snapshot['stocks'][number];
    /** The snapshot's rows with these symbols watched and the rest not, each changed as asked. */
    const rows = (s: Snapshot, watched: string[], change: (r: Row) => Row = (r) => r) =>
      s.stocks.map((r) => change({ ...r, watched: watched.includes(r.symbol) }));
    const fill = (block: string, symbol: string, over: Record<string, unknown> = {}) =>
      ({ block, symbol, ...over }) as unknown as Snapshot['fills'][number];

    it('Read the curve: done by watching a metal and one of its futures, not either alone nor the index future', () => {
      const s = withMetals();
      const gc = s.stocks.find((r) => r.contract?.underlying === 'XAU')!.symbol;
      expect(L('curve').done({ ...s, stocks: rows(s, ['XAU']) })).toBe(false);
      expect(L('curve').done({ ...s, stocks: rows(s, [gc]) })).toBe(false);
      expect(L('curve').done({ ...s, stocks: rows(s, ['XAU', 'XAG']) })).toBe(false);
      expect(L('curve').done({ ...s, stocks: rows(s, ['XAU', gc]) })).toBe(true);
    });

    it('Watch it flip: done once a watched curve is in backwardation after a supply headline, not in contango', () => {
      const s = withMetals();
      const gc = s.stocks.find((r) => r.contract?.underlying === 'XAU')!.symbol;
      const headline = { desk: METALS_DESK } as unknown as Snapshot['deskNews'][number];
      const flipped = (r: Row): Row => (r.contract ? { ...r, contract: { ...r.contract, carry: -0.01 } } : r);
      // The curve as it starts is in contango.
      expect(s.stocks.find((r) => r.symbol === gc)!.contract!.carry).toBeGreaterThan(0);
      expect(L('flip').done({ ...s, stocks: rows(s, ['XAU', gc]), deskNews: [headline] })).toBe(false);
      expect(L('flip').done({ ...s, stocks: rows(s, ['XAU', gc], flipped), deskNews: [] })).toBe(false);
      expect(L('flip').done({ ...s, stocks: rows(s, [], flipped), deskNews: [headline] })).toBe(false);
      expect(L('flip').done({ ...s, stocks: rows(s, ['XAU', gc], flipped), deskNews: [headline] })).toBe(true);
    });

    it('Take delivery: done by metal delivered and a night of storage or the lease, not by metal bought', () => {
      const day = (storage?: number) => ({ ...(storage === undefined ? {} : { storage }) }) as unknown as DayReport;
      const pos = (delivered?: number) =>
        ({ symbol: 'XAU', qty: 1, ...(delivered === undefined ? {} : { delivered }) }) as Snapshot['positions'][number];
      expect(L('delivery').done(withMetals({ positions: [pos()], days: [day(-330)] }))).toBe(false);
      expect(L('delivery').done(withMetals({ positions: [pos(1)], days: [day()] }))).toBe(false);
      expect(L('delivery').done(withMetals({ positions: [pos(1)], days: [day(-330)] }))).toBe(true);
    });

    it('Trade the fix: done by a fill on the fix venue at a fix and its price, not by a fill in continuous trading', () => {
      const s = withMetals();
      const fixAt = 10 * MS_PER_HOUR;
      const exchanges = s.exchanges.map((e) =>
        e.id === 'THAMESFORD' ? { ...e, fixes: [{ at: fixAt, symbol: 'XAU', price: 24_010, volume: 40 }] } : e,
      );
      const at = (t: number, price: number) => fill('hand', 'XAU', { exchange: 'THAMESFORD', at: t, price });
      expect(L('fix').done({ ...s, exchanges, fills: [at(fixAt + 500, 24_011)] })).toBe(false);
      expect(L('fix').done({ ...s, exchanges, fills: [at(fixAt - 60_000, 24_010)] })).toBe(false);
      expect(L('fix').done({ ...s, exchanges, fills: [at(fixAt + 70, 24_010)] })).toBe(true);
    });

    it('The miner and the metal: done once the cross-desk pair has filled in both legs', () => {
      const legs = [fill('crossPairs', 'RDG'), fill('crossPairs', 'XAU')];
      expect(L('miner').done(withMetals({ fills: [legs[0]!] }))).toBe(false);
      expect(L('miner').done(withMetals({ fills: [legs[0]!, fill('hand', 'XAU')] }))).toBe(false);
      expect(L('miner').done(withMetals({ fills: legs }))).toBe(true);
    });

    /** The miner and two other stocks, the stock exchanges and the metals desk, no rivals: a week steps quickly. */
    const METALS: Content = {
      ...CONTENT,
      stocks: CONTENT.stocks.filter((s) => ['ABC', 'QNT', 'RDG'].includes(s.symbol)),
      exchanges: [...CONTENT.exchanges.filter((e) => e.desk === undefined), ...METAL_VENUES],
      series: METAL_SERIES,
      instruments: SPOT,
      currencies: [],
      competitors: [],
    };
    const run = (g: Game, until: number, stride = TICK_MS) => {
      while (g.now < until) g.step(Math.min(stride, until - g.now));
    };

    it('Trade the fix: done in a game by a buy rested into the 10:00 fix', { timeout: 60_000 }, () => {
      const g = new Game(METALS, 3);
      g.openDesk(METALS_DESK);
      for (const b of g.firm.blocks) b.enabled = false;
      // A laptop watches four symbols: the metal has to be one of them for its quote to reach the desk.
      g.firm.setWatch(['XAU']);
      run(g, 10 * MS_PER_HOUR - 20 * MS_PER_SECOND, MS_PER_MINUTE);
      run(g, 10 * MS_PER_HOUR - 15 * MS_PER_SECOND);
      const ind = g
        .snapshot()
        .stocks.find((r) => r.symbol === 'XAU')!
        .exchanges.find((e) => e.id === 'THAMESFORD')!.seen!.indicative!;
      const order = { symbol: 'XAU', side: 'buy', size: 1, exchange: 'THAMESFORD', type: 'limit' } as const;
      expect(g.hand({ ...order, price: ind.price! + 50 }).ok).toBe(true);
      run(g, 10 * MS_PER_HOUR - TICK_MS);
      expect(L('fix').done(g.snapshot())).toBe(false);
      run(g, 10 * MS_PER_HOUR + MS_PER_SECOND);
      expect(L('fix').done(g.snapshot())).toBe(true);
    });

    it(
      'Take delivery: done in a game by a gold future held through Friday into the evening',
      { timeout: 120_000 },
      () => {
        const g = new Game(METALS, 3);
        g.openDesk(METALS_DESK);
        for (const b of g.firm.blocks) b.enabled = false;
        const near = g.market.live('GC')[0]!;
        g.firm.setWatch([near]);
        run(g, 10 * MS_PER_HOUR, MS_PER_MINUTE);
        run(g, 10 * MS_PER_HOUR + 5 * MS_PER_SECOND);
        expect(g.hand({ symbol: near, side: 'buy', size: 1, exchange: 'HUDSON', type: 'market' }).ok).toBe(true);
        run(g, 10 * MS_PER_HOUR + 10 * MS_PER_SECOND);
        expect(g.firm.positions.get(near)?.qty).toBe(1);
        // Friday 13:30 the contract expires and is delivered; 17:00 the metal pays three nights of storage.
        run(g, 4 * MS_PER_DAY + 17 * MS_PER_HOUR + MS_PER_MINUTE, MS_PER_MINUTE);
        const s = g.snapshot();
        expect(s.positions.find((p) => p.symbol === 'XAU')?.delivered).toBe(1);
        expect(L('delivery').done(s)).toBe(true);
      },
    );
  });
});
