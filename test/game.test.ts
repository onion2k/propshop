import { CONTENT } from '../src/content';
import { Game, MS_PER_MINUTE, MS_PER_SECOND, TICK_MS, isMarketOpen, nextOpen, type SavedGame } from '../src/sim';
import { MARKET_OPEN, MS_PER_DAY } from '../src/sim/clock';

function run(g: Game, ms: number) {
  for (let i = 0; i < ms / TICK_MS; i++) g.step();
}

/** Through the open and on to the close in coarse steps, where a test does not care about the trading between. */
function throughTheDay(g: Game) {
  while (!isMarketOpen(g.now)) g.step(MS_PER_MINUTE);
  while (isMarketOpen(g.now)) g.step(MS_PER_MINUTE);
}

describe('Game', () => {
  it('starts before the open on Monday with the arbitrage block on and nothing traded', () => {
    const g = new Game(CONTENT, 1);
    const s = g.snapshot();
    expect(s.calendar.weekday).toBe('Mon');
    expect(s.open).toBe(false);
    expect(s.nextChange).toBe(MARKET_OPEN);
    expect(s.cash).toBe(CONTENT.startingCash);
    expect(s.blocks.find((b) => b.id === 'arbitrage')?.enabled).toBe(true);
    expect(s.fills).toEqual([]);
    expect(s.latency.HARBOR).toBe(44);
    expect(s.shop.length).toBe(10);
    expect(s.news.length).toBe(0);
    expect(s.dark.unlocked).toBe(false);
  });

  it('skips to a minute before the open, landing overnight news on the way', () => {
    const g = new Game(CONTENT, 2);
    g.skipToOpen();
    expect(g.now).toBe(MARKET_OPEN - MS_PER_MINUTE);
    expect(isMarketOpen(g.now)).toBe(false);
    run(g, 2 * MS_PER_MINUTE);
    expect(isMarketOpen(g.now)).toBe(true);
    expect(g.log.some((e) => e.kind === 'open')).toBe(true);
  });

  it('advances by the speed, and not at all when paused', () => {
    const g = new Game(CONTENT, 3);
    const t0 = g.now;
    g.setSpeed(0);
    g.advance(1000);
    expect(g.now).toBe(t0);
    g.setSpeed(10);
    g.advance(100);
    expect(g.now).toBe(t0 + 1000);
    g.setSpeed(300);
    g.advance(10_000);
    // Capped, so a hidden tab does not hang the page catching up.
    expect(g.now).toBe(t0 + 1000 + 15000 * TICK_MS);
  });

  it('trades through a few minutes of the open, with fills, a P&L and the bots ahead', () => {
    const g = new Game(CONTENT, 4);
    g.skipToOpen();
    run(g, 3 * MS_PER_MINUTE);
    const s = g.snapshot();
    expect(s.open).toBe(true);
    expect(s.orders.length).toBeGreaterThan(0);
    expect(s.competitors.some((c) => c.fills > 0)).toBe(true);
    expect(s.stocks[0]!.exchanges[0]!.seen).not.toBeNull();
    expect(s.stocks[0]!.history.length).toBeGreaterThan(100);
    expect(Number.isFinite(s.equity)).toBe(true);
    expect(Number.isFinite(s.dayPnl)).toBe(true);
  });

  it('tells the story of each order, naming who won the race', () => {
    const g = new Game(CONTENT, 13);
    g.skipToOpen();
    run(g, 2 * MS_PER_MINUTE);
    const s = g.snapshot();
    expect(s.orders.length).toBeGreaterThan(0);
    expect(s.orders.length).toBeLessThanOrEqual(30);
    const heard = s.orders.filter((o) => o.ackAt !== null);
    expect(heard.length).toBeGreaterThan(0);
    const beaten = heard.filter((o) => o.beatenBy.length > 0);
    expect(beaten.length).toBeGreaterThan(0);
    for (const b of beaten) for (const t of b.beatenBy) expect(s.names[t.owner]).toBeDefined();
    const filled = s.orders.find((o) => o.filled > 0);
    expect(filled?.fee).toBeGreaterThan(0);
  });

  it('runs the script block and keeps its source through a save', () => {
    const g = new Game(CONTENT, 14);
    g.setBlock('arbitrage', { enabled: false });
    g.setBlock('script', { enabled: true, source: 'log("tick", now)' });
    g.skipToOpen();
    run(g, 2 * MS_PER_MINUTE);
    const s = g.snapshot();
    expect(s.script.error).toBeNull();
    expect(s.script.log.length).toBeGreaterThan(0);
    const b = Game.load(CONTENT, JSON.parse(JSON.stringify(g.save())) as SavedGame);
    expect(b.firm.blocks.find((x) => x.id === 'script')?.source).toBe('log("tick", now)');
    g.setBlock('script', { source: 'while (true) {}' });
    run(g, MS_PER_SECOND);
    expect(g.snapshot().script.error).toMatch(/budget/);
  });

  it('runs an upgrade through the shop and lowers the latency', () => {
    const g = new Game(CONTENT, 5);
    const before = g.firm.latency('HARBOR');
    g.firm.cash = 1000;
    expect(() => g.buyUpgrade('network', 'microwave')).toThrow();
    g.firm.cash += 100 * 100_000_000;
    g.buyUpgrade('location', 'colo-harbor');
    g.buyUpgrade('network', 'fibre');
    expect(g.firm.latency('HARBOR')).toBeLessThan(before / 10);
    const offer = g.snapshot().shop.find((o) => o.spec.id === 'colo-harbor')!;
    expect(offer.owned && offer.inUse).toBe(true);
    // Switching back to something owned is free.
    const cash = g.firm.cash;
    g.buyUpgrade('location', 'home');
    expect(g.firm.cash).toBe(cash);
  });

  it('closes the day with a record, and unlocks the dark web after a profitable week', () => {
    const g = new Game(CONTENT, 6);
    g.skipToOpen();
    run(g, MS_PER_SECOND);
    throughTheDay(g);
    expect(g.days).toHaveLength(1);
    expect(g.log.some((e) => e.kind === 'close')).toBe(true);
    // Through to Friday's close, made rich on the way.
    for (let d = 1; d < 5; d++) {
      g.skipToOpen();
      run(g, MS_PER_SECOND);
      g.firm.cash += 1_000_000;
      throughTheDay(g);
    }
    expect(g.days).toHaveLength(5);
    expect(g.dark.unlocked).toBe(true);
    expect(g.log.some((e) => e.kind === 'unlock')).toBe(true);
    expect(nextOpen(g.now)).toBe(7 * MS_PER_DAY + MARKET_OPEN);
  });

  it('writes a report of the day at the close', { timeout: 120_000 }, () => {
    const g = new Game(CONTENT, 15);
    g.skipToOpen();
    run(g, 10 * MS_PER_MINUTE);
    const iocs = [...g.firm.orders.values()].filter((o) => o.ioc && o.status !== 'inflight').length;
    while (isMarketOpen(g.now)) g.step(MS_PER_MINUTE);
    const r = g.days[0]!;
    expect(r.weekday).toBe('Mon');
    expect(r.week).toBe(1);
    expect(r.equityAtClose).toBe(g.firm.equity(g.market, g.now));
    expect(r.pnl).toBe(g.snapshot().dayPnl);
    const fills = Object.values(r.byBlock).reduce((n, t) => n + t.fills, 0);
    expect(fills).toBe(g.firm.stats.fillsReceived);
    expect(Object.values(r.bySymbol).reduce((n, t) => n + t.fills, 0)).toBe(fills);
    expect(r.byBlock.arbitrage?.fees).toBe(g.firm.feesPaid);
    expect(r.races.won + r.races.beaten + r.races.missed).toBeGreaterThanOrEqual(iocs);
    expect(r.headlines.length).toBeGreaterThan(0);
    expect(r.latency.HARBOR).toBe(44);
    expect(r.rivals.map((x) => x.name)).toEqual(CONTENT.competitors.map((c) => c.name));
    expect(r.rivals.some((x) => x.pnl !== 0)).toBe(true);
    const b = Game.load(CONTENT, JSON.parse(JSON.stringify(g.save())) as SavedGame);
    expect(b.days[0]).toEqual(r);
  });

  it('loads a day saved before the report existed', () => {
    const g = new Game(CONTENT, 16);
    const saved = g.save();
    saved.days = [{ day: 0, weekday: 'Mon', pnl: 1234 }];
    delete saved.today;
    const b = Game.load(CONTENT, JSON.parse(JSON.stringify(saved)) as SavedGame);
    expect(b.days[0]).toMatchObject({ day: 0, pnl: 1234, week: 1, races: { won: 0, beaten: 0, missed: 0 } });
  });

  it('sells and records a tip once unlocked', () => {
    const g = new Game(CONTENT, 7);
    g.dark.unlocked = true;
    g.skipToOpen();
    run(g, 2 * MS_PER_SECOND);
    const offers = g.snapshot().dark.offers;
    expect(offers.length).toBe(3);
    const tip = g.buyTip(offers[0]!.id);
    expect(g.snapshot().dark.bought[0]).toEqual(tip);
    expect(g.firm.heat).toBeGreaterThan(0);
  });

  it('is deterministic: one seed, one game', () => {
    const a = new Game(CONTENT, 8);
    const b = new Game(CONTENT, 8);
    const c = new Game(CONTENT, 9);
    for (const g of [a, b, c]) {
      g.skipToOpen();
      run(g, 2 * MS_PER_MINUTE);
    }
    expect(a.fingerprint()).toBe(b.fingerprint());
    expect(a.fingerprint()).not.toBe(c.fingerprint());
    expect(a.snapshot().fills).toEqual(b.snapshot().fills);
  });

  it('saves and loads to the same future', () => {
    const a = new Game(CONTENT, 10);
    a.skipToOpen();
    run(a, 30 * MS_PER_SECOND);
    a.setBlock('marketMaker', { enabled: true, params: { halfSpread: 3 } });
    const saved = JSON.parse(JSON.stringify(a.save())) as SavedGame;
    const b = Game.load(CONTENT, saved);
    expect(b.fingerprint()).toBe(a.fingerprint());
    run(a, 10 * MS_PER_SECOND);
    run(b, 10 * MS_PER_SECOND);
    expect(b.fingerprint()).toBe(a.fingerprint());
    expect(b.snapshot().blocks).toEqual(a.snapshot().blocks);
    expect(b.firm.infra.location.id).toBe(a.firm.infra.location.id);
  });

  it('refuses a save from another version', () => {
    const g = new Game(CONTENT, 11);
    const saved = { ...g.save(), version: 2 } as unknown as SavedGame;
    expect(() => Game.load(CONTENT, saved)).toThrow(/version/);
  });

  it('steps fast enough for the top speed', () => {
    const g = new Game(CONTENT, 12);
    g.skipToOpen();
    run(g, 10 * MS_PER_SECOND);
    const start = performance.now();
    run(g, 2 * MS_PER_MINUTE);
    const wall = performance.now() - start;
    const ticksPerSecond = ((2 * MS_PER_MINUTE) / TICK_MS / wall) * 1000;
    process.stderr.write(`${Math.round(ticksPerSecond)} ticks/s\n`);
    // The top speed is 300x: 150,000 ticks a wall second. Hold it to half that here, where the machine may be busy.
    expect(ticksPerSecond).toBeGreaterThan(75_000);
  });
});
