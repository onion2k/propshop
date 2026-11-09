import { CONTENT } from '../src/content';
import { Game, MS_PER_MINUTE, TICK_MS } from '../src/sim';
import { Exchange } from '../src/sim/exchange';
import { kindOf, scaleOf, tickOf, valueOf } from '../src/sim/instrument';
import { Market } from '../src/sim/market';
import type { InstrumentSpec } from '../src/sim/types';
import { infrastructureFrom } from '../src/sim/upgrades';
import { EXCHANGES, STOCKS } from './fixtures';

/** A colocated firm with four blocks and a hand order, five minutes into the open: every value path at work. */
function busyGame(content = CONTENT): Game {
  const g = new Game(content, 1);
  g.firm.infra = infrastructureFrom(CONTENT, { location: 'colo-harbor', network: 'microwave', computer: 'rack' });
  const on = ['momentum', 'arbitrage', 'marketMaker', 'indexArb'];
  for (const b of g.firm.blocks) b.enabled = on.includes(b.id);
  g.firm.setWatch(['IDX', ...CONTENT.stocks.filter((s) => !s.constituents).map((s) => s.symbol)]);
  g.skipToOpen();
  g.stepTicks((2 * MS_PER_MINUTE) / TICK_MS);
  g.hand({ symbol: 'QNT', side: 'buy', size: 5000, exchange: 'best', type: 'market' });
  g.stepTicks((3 * MS_PER_MINUTE) / TICK_MS);
  return g;
}

const BLOCKS_ON = ['momentum', 'basisArb', 'leadLag', 'carry', 'triangle'];
const EXPECTED_DESKS_OPEN: unknown[] = [
  [1, '87d3edc1', 445, 445, [97, 0, 69, 0, 79]],
  [2, 'ea81a08b', 261, 299, [74, 0, 88, 0, 137]],
];

describe('instruments, folded in from stocks', () => {
  // Taken on 2026-11-08 at commit 074c5df, before instruments existed: a stock is an instrument with a multiplier
  // of one and a price in cents, so the same seed and setup must give the same game to the bit.
  it('leave a busy colocated game exactly as it was', () => {
    const g = busyGame();
    const f = g.firm;
    expect(f.stats.fillsReceived).toBe(616);
    expect(f.cash).toBe(-5744615);
    expect(f.realised).toBe(62915.67450731223);
    expect(f.feesPaid).toBe(16965);
    expect(f.unrealised(g.market, g.now)).toBe(10984.32549268307);
    expect(f.equity(g.market, g.now)).toBe(20056935);
    expect((f as unknown as { exposure(): number }).exposure()).toBe(75209065.67450732);
    expect(g.competitors.map((c) => c.cash)).toEqual([200000000, 199999972, 200001148, 200002880, 200000000]);
    // The save now carries the futures desk, there and closed (its venue's books, streams and contracts), so the
    // whole game's fingerprint moved on 2026-11-08 while every figure above stayed; without the desk it is the same.
    // It moved again on 2026-11-09 for the currencies desk, there and closed (its venues' books and streams, its
    // pairs' fair values and factor, the rates); without that desk it is '50fb0670', the futures desk's, still.
    expect(g.fingerprint()).toBe('914a5ecf');
    const stocksOnly = { ...CONTENT, exchanges: CONTENT.exchanges.filter((e) => e.desk === undefined), series: [] };
    expect(busyGame(stocksOnly).fingerprint()).toBe('c08c8813');
  }, 120_000);

  // Taken on 2026-11-09 at commit f94384f, before the step-rate cuts of plans/desk-speed.md: both desks open, the
  // player on a rack with a stocks block, a futures block and a currencies block, so the narrowed views are at work,
  // and the rivals as content has them. Every cut to how a firm builds its view must leave these as they are.
  it('leave a game with both desks open exactly as it was', () => {
    const play = (seed: number): Game => {
      const g = new Game(CONTENT, seed);
      g.openDesk('futures');
      g.openDesk('fx');
      g.firm.infra = infrastructureFrom(CONTENT, { location: 'colo-harbor', network: 'microwave', computer: 'rack' });
      const on = BLOCKS_ON;
      for (const b of g.firm.blocks) b.enabled = on.includes(b.id);
      g.skipToOpen();
      g.stepTicks((10 * MS_PER_MINUTE) / TICK_MS);
      return g;
    };
    const seen = [1, 2].map((seed) => {
      const g = play(seed);
      const byBlock = (id: string) => [...g.firm.orders.values()].filter((o) => o.block === id).length;
      return [seed, g.fingerprint(), g.firm.stats.fillsReceived, g.firm.stats.ordersSent, BLOCKS_ON.map(byBlock)];
    });
    expect(seen).toEqual(EXPECTED_DESKS_OPEN);
  }, 120_000);

  /** A future on an index: fifty times the index, quoted in quarter points of a dollar. */
  const FUTURE: InstrumentSpec = {
    symbol: 'IXF',
    name: 'Index future',
    sector: 'index',
    kind: 'future',
    multiplier: 50,
    priceUnit: 100,
    tickSize: 25,
    startPrice: 0,
    hourlyVol: 0,
    jumpsPerSecond: 0,
    jumpSize: 0,
  };

  it('value a stock as quantity times price in cents, and a contract by its unit and multiplier', () => {
    expect(scaleOf(STOCKS[0]!)).toBe(1);
    expect(valueOf(1, 300, 4100)).toBe(300 * 4100);
    expect(valueOf(1, -7, 0.5)).toBe(-3.5);
    // Two contracts at 5,000.25 dollars on a quarter-point grid: 2 × 500,025 points × 100 cents × 50.
    expect(scaleOf(FUTURE)).toBe(5000);
    expect(valueOf(scaleOf(FUTURE), 2, 500_025)).toBe(2 * 500_025 * 5000);
  });

  it('read the kind from the spec, an index from its constituents, and a stock otherwise', () => {
    expect(kindOf(STOCKS[0]!)).toBe('equity');
    expect(kindOf({ ...STOCKS[0]!, constituents: ['ABC'] })).toBe('index');
    expect(kindOf(FUTURE)).toBe('future');
  });

  it("quote on the instrument's own tick where it has one, else the exchange's", () => {
    expect(tickOf(STOCKS[0]!, 1)).toBe(1);
    expect(tickOf(STOCKS[0]!, 5)).toBe(5);
    expect(tickOf(FUTURE, 1)).toBe(25);
    const ex = new Exchange(EXCHANGES[0]!, [...STOCKS, { ...FUTURE, startPrice: 500_000 }]);
    ex.submit('IXF', { owner: 'a', side: 'buy', price: 500_010, size: 1 }, 0);
    expect(ex.book('IXF').quote().bid).toBe(500_000);
    // A stock on the same exchange keeps the exchange's one-cent grid.
    ex.submit('ABC', { owner: 'a', side: 'buy', price: 4013, size: 1 }, 0);
    expect(ex.book('ABC').quote().bid).toBe(4013);
  });

  it('give the market a scale for each instrument, one for every stock', () => {
    const m = new Market([...STOCKS, { ...FUTURE, startPrice: 500_000 }], EXCHANGES);
    for (const s of STOCKS) expect(m.scales.get(s.symbol)).toBe(1);
    expect(m.scales.get('IXF')).toBe(5000);
  });

  it("move a firm's cash, exposure and P&L by the contract's scale, and refuse one past the leverage", () => {
    // A small contract: five units of a $5,000.00 index, $25,000 each. On the exchange's one-cent grid, since the
    // crowd places and pulls its orders within cents of its belief and would leave a coarser grid empty.
    const small: InstrumentSpec = {
      ...FUTURE,
      multiplier: 5,
      priceUnit: 1,
      tickSize: undefined,
      startPrice: 500_000,
      hourlyVol: 50,
    };
    const g = new Game({ ...CONTENT, stocks: [...CONTENT.stocks, small] }, 1);
    for (const b of g.firm.blocks) b.enabled = false;
    g.firm.setWatch(['IXF']);
    g.skipToOpen();
    g.stepTicks((2 * MS_PER_MINUTE) / TICK_MS);
    // Forty of them are a million dollars, past four times the firm's $200,000: refused before it is sent.
    const refused = g.firm.stats.ordersRejected;
    g.hand({ symbol: 'IXF', side: 'buy', size: 40, exchange: 'best', type: 'market' });
    g.stepTicks(1000);
    expect(g.firm.stats.ordersRejected).toBe(refused + 1);
    const cash = g.firm.cash;
    const fees = g.firm.feesPaid;
    // A limit a little through the ask, so a touch that moves during the reaction time still fills.
    const ask = g.market.exchanges[0]!.book('IXF').quote().ask!;
    g.hand({
      symbol: 'IXF',
      side: 'buy',
      size: 2,
      exchange: g.market.exchanges[0]!.id,
      type: 'limit',
      price: ask + 200,
    });
    g.stepTicks(1000);
    const fills = g.firm.fills.filter((f) => f.symbol === 'IXF');
    expect(fills.reduce((n, f) => n + f.size, 0)).toBe(2);
    const paid = fills.reduce((n, f) => n + f.size * f.price * 5, 0);
    expect(cash - g.firm.cash).toBe(paid + g.firm.feesPaid - fees);
    const avg = g.firm.positions.get('IXF')!.avgCost;
    expect((g.firm as unknown as { exposure(): number }).exposure()).toBeGreaterThanOrEqual(2 * avg * 5);
    // Equity marks the contracts at their scale: within a few dollars of the index of their cost.
    const e = g.firm.equity(g.market, g.now);
    expect(Math.abs(e - g.firm.cash - 2 * avg * 5)).toBeLessThan(2 * 5 * 2000);
  }, 60_000);
});
