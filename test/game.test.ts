import { CONTENT } from '../src/content';
import { Firm } from '../src/sim/firm';
import {
  FLOOD_DROPPED,
  Game,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  STUFFING_CANCEL_SHARE,
  STUFFING_ORDERS,
  TICK_MS,
  isMarketOpen,
  nextOpen,
  type SavedGame,
} from '../src/sim';
import { MARKET_OPEN, MS_PER_DAY } from '../src/sim/clock';
import { HAND_BLOCK, REJECT_MARKET_CLOSED } from '../src/sim/firm';

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
    expect(s.shop.length).toBe(15);
    expect(s.competitors.map((c) => c.name)).toEqual([
      'Midtown Capital',
      'Lakeside Partners',
      'Bayview Systems',
      'Harbor Quant',
      'Shadow Trading',
    ]);
    expect(s.competitors[3]!.latency.LAKESIDE).toBe(1);
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

  it('trades through the open, with orders, a P&L and the bots ahead', { timeout: 60_000 }, () => {
    const g = new Game(CONTENT, 4);
    g.skipToOpen();
    while (!isMarketOpen(g.now)) g.step();
    for (let i = 0; i < (15 * MS_PER_MINUTE) / TICK_MS && g.firm.orders.size === 0; i++) g.step();
    run(g, 2 * MS_PER_MINUTE);
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

  it('halts the firm for the day when it is down past the loss limit', { timeout: 60_000 }, () => {
    const g = new Game(CONTENT, 17);
    g.setRisk({ dailyLossLimit: 500 });
    expect(g.snapshot().risk.dailyLossLimit).toBe(500);
    // Pay the spread every decision: a strategy that can only lose.
    g.setBlock('arbitrage', { enabled: false });
    g.setBlock('script', {
      enabled: true,
      source:
        'const b = best("ABC"); if (b.bid && b.ask) { buy("ABC", b.ask.exchange, b.ask.price, 100); sell("ABC", b.bid.exchange, b.bid.price, 100); }',
    });
    g.skipToOpen();
    let halted = false;
    for (let i = 0; i < (20 * MS_PER_MINUTE) / TICK_MS && !halted; i++) {
      g.step();
      halted = g.firm.halt !== null;
    }
    expect(halted).toBe(true);
    const s = g.snapshot();
    expect(s.halt?.reason).toMatch(/loss limit/);
    expect(s.halt?.until).toBe(nextOpen(g.now));
    expect(g.log.some((e) => e.kind === 'halt')).toBe(true);
    const sent = g.firm.stats.ordersSent;
    run(g, 10 * MS_PER_SECOND);
    expect(g.firm.stats.ordersSent).toBe(sent);
    while (isMarketOpen(g.now)) g.step(MS_PER_MINUTE);
    expect(g.days[0]!.halts).toHaveLength(1);
    const b = Game.load(CONTENT, JSON.parse(JSON.stringify(g.save())) as SavedGame);
    expect(b.firm.halt).toEqual(g.firm.halt);
    expect(b.firm.risk).toEqual(g.firm.risk);
  });

  it('notes quote stuffing and an order flood at the close, and heats the firm', { timeout: 60_000 }, () => {
    const stuffing = new Game(CONTENT, 18);
    stuffing.setBlock('arbitrage', { enabled: false });
    // Post a bid far from the market and cancel it again, every decision: quoting with no wish to trade.
    stuffing.setBlock('script', {
      enabled: true,
      source: 'for (const o of orders()) cancel(o.localId); buy("ABC", "HARBOR", 3000, 100, false);',
    });
    stuffing.skipToOpen();
    run(stuffing, 3 * MS_PER_MINUTE);
    expect(stuffing.firm.stats.cancelsSent).toBeGreaterThan(STUFFING_ORDERS * STUFFING_CANCEL_SHARE);
    while (isMarketOpen(stuffing.now)) stuffing.step(MS_PER_MINUTE);
    // Two orders a decision is also more than the laptop sends, so this day is a flood as well.
    expect(stuffing.days[0]!.regulator).toContainEqual(expect.stringMatching(/Quote stuffing/) as string);
    expect(stuffing.firm.heat).toBeGreaterThanOrEqual(10);
    expect(stuffing.log.filter((e) => e.kind === 'regulator').length).toBeGreaterThanOrEqual(1);

    // A flood: a script that sends far more than the laptop can.
    const flood = new Game(CONTENT, 18);
    flood.setBlock('arbitrage', { enabled: false });
    flood.setBlock('script', {
      enabled: true,
      source: 'for (let i = 0; i < 50; i++) buy("ABC", "HARBOR", 3000, 100);',
    });
    flood.skipToOpen();
    run(flood, 2 * MS_PER_MINUTE);
    expect(flood.firm.stats.ordersDropped).toBeGreaterThan(FLOOD_DROPPED);
    while (isMarketOpen(flood.now)) flood.step(MS_PER_MINUTE);
    expect(flood.days[0]!.regulator).toEqual([expect.stringMatching(/Order flood/) as string]);
    expect(flood.firm.heat).toBe(5);

    // A quiet day notes nothing.
    const q = new Game(CONTENT, 19);
    q.skipToOpen();
    run(q, MS_PER_MINUTE);
    while (isMarketOpen(q.now)) q.step(MS_PER_MINUTE);
    expect(q.days[0]!.regulator).toEqual([]);
    expect(q.firm.heat).toBe(0);
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

  it('is deterministic: one seed, one game', { timeout: 60_000 }, () => {
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

  it('saves and loads to the same future', { timeout: 60_000 }, () => {
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

  it('fills in blocks a save from before them lacks, and leaves the rivals theirs', () => {
    const g = new Game(CONTENT, 20);
    const saved = g.save();
    saved.firm.blocks = saved.firm.blocks.filter((b) => b.id === 'arbitrage' || b.id === 'momentum');
    const b = Game.load(CONTENT, JSON.parse(JSON.stringify(saved)) as SavedGame);
    expect(b.firm.blocks.map((x) => x.id)).toEqual(Firm.defaultBlocks().map((x) => x.id));
    expect(b.firm.blocks.find((x) => x.id === 'arbitrage')?.enabled).toBe(true);
    expect(b.firm.blocks.find((x) => x.id === 'sniper')?.enabled).toBe(false);
    expect(b.competitors[0]!.blocks.map((x) => x.id)).toEqual(['arbitrage']);
  });

  it('has the anticipation rival, running that block alone, at all three exchanges', () => {
    const g = new Game(CONTENT, 22);
    const rival = g.competitors.find((c) => c.id === 'bot:shadow')!;
    expect(rival.blocks.map((b) => [b.id, b.enabled])).toEqual([['anticipate', true]]);
    expect(rival.infra.computer.decisionEveryMs).toBe(10);
    expect(Object.values(g.snapshot().competitors.find((c) => c.id === 'bot:shadow')!.latency)).toEqual([
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    ]);
    for (const other of g.competitors.filter((c) => c !== rival)) {
      expect(other.blocks.map((b) => b.id)).toEqual(['arbitrage']);
    }
  });

  it('loads a save made before the anticipation rival and gives it the rival as it starts', () => {
    const g = new Game(CONTENT, 23);
    const saved = JSON.parse(JSON.stringify(g.save())) as SavedGame;
    saved.competitors = saved.competitors.filter((c) => c.id !== 'bot:shadow');
    const b = Game.load(CONTENT, saved);
    expect(b.competitors.map((c) => c.id)).toEqual(CONTENT.competitors.map((c) => `bot:${c.id}`));
    expect(b.competitors.at(-1)!.blocks.map((x) => x.id)).toEqual(['anticipate']);
    b.skipToOpen();
    for (let i = 0; i < 2000; i++) b.step();
  });

  it('shows every message on the wire with where it is, and steps by the tick', () => {
    const g = new Game(CONTENT, 21);
    g.skipToOpen();
    while (!isMarketOpen(g.now)) g.step();
    let s = g.snapshot();
    for (let i = 0; i < (5 * MS_PER_MINUTE) / TICK_MS && !s.wire.some((w) => w.owner === 'firm'); i++) {
      g.step();
      s = g.snapshot();
    }
    const mine = s.wire.filter((w) => w.owner === 'firm');
    expect(mine.length).toBeGreaterThan(0);
    for (const w of mine) {
      expect(w.arrivesAt).toBeGreaterThanOrEqual(s.now);
      expect(w.arrivesAt - w.sentAt).toBe(g.firm.latency(w.exchange));
      expect(['order', 'cancel', 'ack', 'fill', 'cancelled', 'cancelRefused', 'rejected']).toContain(w.kind);
    }
    expect(Object.keys(s.beliefs)).toEqual(['HARBOR', 'LAKESIDE', 'PACIFIC']);
    expect(typeof s.beliefs.HARBOR?.ABC).toBe('number');
    const t = g.now;
    g.stepTicks(5);
    expect(g.now).toBe(t + 5 * TICK_MS);
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

describe('Game gap log', () => {
  function withGaps() {
    const g = new Game(CONTENT, 7);
    g.skipToOpen();
    for (let i = 0; i < 40 && g.firm.gapLog.length === 0; i++) run(g, MS_PER_MINUTE);
    return g;
  }

  it('carries the gaps the firm saw in the snapshot, newest first, as copies', () => {
    const g = withGaps();
    const s = g.snapshot();
    expect(s.gaps.length).toBeGreaterThan(0);
    expect(s.gaps.length).toBeLessThanOrEqual(20);
    for (let i = 1; i < s.gaps.length; i++)
      expect(s.gaps[i - 1]!.firstSeen).toBeGreaterThanOrEqual(s.gaps[i]!.firstSeen);
    s.gaps[0]!.edge = 999;
    expect(g.snapshot().gaps[0]!.edge).not.toBe(999);
  });

  it('saves and loads mid-session to the same future', () => {
    const a = withGaps();
    expect(a.firm.gapLog.length).toBeGreaterThan(0);
    const b = Game.load(CONTENT, JSON.parse(JSON.stringify(a.save())) as SavedGame);
    expect(b.snapshot().gaps).toEqual([]);
    run(a, 50_000 * TICK_MS);
    run(b, 50_000 * TICK_MS);
    expect(JSON.stringify(b.save())).toBe(JSON.stringify(a.save()));
  });
});

describe('Game hand orders', () => {
  it('sends a hand order after the reaction time from content, and keeps it through a save', () => {
    const g = new Game(CONTENT, 5);
    expect(g.hand({ symbol: 'ABC', side: 'buy', size: 100, exchange: 'best', type: 'market' })).toMatchObject({
      ok: false,
      reason: REJECT_MARKET_CLOSED,
    });
    while (!isMarketOpen(g.now)) g.step(MS_PER_MINUTE);
    run(g, 5 * MS_PER_SECOND);
    const symbol = CONTENT.stocks[0]!.symbol;
    const clicked = g.now;
    const result = g.hand({ symbol, side: 'buy', size: 100, exchange: 'best', type: 'market' });
    expect(result).toEqual({ ok: true, dueAt: clicked + CONTENT.desk.reactionMs });
    run(g, CONTENT.desk.reactionMs / 2);
    const copy = Game.load(CONTENT, JSON.parse(JSON.stringify(g.save())) as SavedGame);
    for (const game of [g, copy]) {
      expect(game.firm.pendingHand).toHaveLength(1);
      run(game, CONTENT.desk.reactionMs / 2 + TICK_MS);
      const sent = [...game.firm.orders.values()].filter((o) => o.block === HAND_BLOCK && o.status !== 'rejected');
      expect(sent.length).toBeGreaterThan(0);
      expect(sent[0]!.sentAt).toBe(clicked + CONTENT.desk.reactionMs);
    }
    expect(copy.fingerprint()).toBe(g.fingerprint());
  });
});
