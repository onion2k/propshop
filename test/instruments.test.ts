import { CONTENT } from '../src/content';
import { Game, MS_PER_MINUTE, TICK_MS } from '../src/sim';
import { Exchange } from '../src/sim/exchange';
import { kindOf, scaleOf, tickOf, valueOf } from '../src/sim/instrument';
import { Market } from '../src/sim/market';
import type { Content, InstrumentSpec } from '../src/sim/types';
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

/** The game's content without the metals desk (plans/desk-metals.md 6b): what the held fingerprints were taken on. */
const NO_METALS: Content = {
  ...CONTENT,
  exchanges: CONTENT.exchanges.filter((e) => e.desk !== 'metals'),
  series: (CONTENT.series ?? []).filter((s) => s.contract.desk !== 'metals'),
  instruments: (CONTENT.instruments ?? []).filter((s) => s.desk !== 'metals'),
  deskNews: [],
  locations: CONTENT.locations.filter((l) => l.desk !== 'metals'),
};

const BLOCKS_ON = ['momentum', 'basisArb', 'leadLag', 'carry', 'triangle'];
const EXPECTED_DESKS_OPEN: unknown[] = [
  [1, '5a409e9e', 481, 498, [119, 0, 100, 0, 79]],
  [2, '473e9068', 261, 314, [64, 0, 113, 0, 137]],
];

// The two below moved on 2026-11-09 when Hudson stopped listing the spot (6c's amendment to 6b), every other figure the
// same: closed 'd7fa5a46' and 'cecb8650', open 'beafb15' and '5c3e6bd3' before.
const EXPECTED_METALS_CLOSED: unknown[] = [
  [1, '9326e341', 481, 498, [119, 0, 100, 0, 79]],
  [2, '4f30cd6d', 261, 314, [64, 0, 113, 0, 137]],
];
// Moved on 2026-11-09 with the desk's blocks and its rival (plans/desk-metals.md 6d): the firm is given the three blocks,
// off, and Aldgate Metals joins as the desk opens, so the save carries both (without the rival, 'a650dd47' and
// '1ffa9dfe'); every other figure is the same. Before, seed 1 was 'adab4574' and seed 2 '1f0cdc79'.
// Moved again on 2026-11-09 with 6f, every other figure the same: the metals' crowd trades in lots of one (the books
// and their logs differ), and Aldgate's fixArb asks 4 bp (its saved parameters). Before, 'b0c0774' and 'b4c4cf9f'.
const EXPECTED_METALS_OPEN: unknown[] = [
  [1, '23255924', 481, 498, [119, 0, 100, 0, 79]],
  [2, 'f3320a6b', 261, 314, [64, 0, 113, 0, 137]],
];

describe('instruments, folded in from stocks', () => {
  // Taken on 2026-11-08 at commit 074c5df, before instruments existed: a stock is an instrument with a multiplier
  // of one and a price in cents, so the same seed and setup must give the same game to the bit. Every figure moved
  // once, on purpose, on 2026-11-09, when the miner (RDG, plans/desk-metals.md 6a) changed what `world` draws: 616
  // fills, cash -5,744,615, equity 20,056,935 and fingerprint '914a5ecf' before; the stocks-only one was 'c08c8813'.
  it('leave a busy colocated game exactly as it was', () => {
    const g = busyGame();
    const f = g.firm;
    expect(f.stats.fillsReceived).toBe(579);
    expect(f.cash).toBe(4000789);
    expect(f.realised).toBe(-29823.998351899692);
    expect(f.feesPaid).toBe(16636);
    expect(f.unrealised(g.market, g.now)).toBe(1786.4983519045836);
    expect(f.equity(g.market, g.now)).toBe(19955326.5);
    expect((f as unknown as { exposure(): number }).exposure()).toBe(65216953.942824565);
    expect(g.competitors.map((c) => c.cash)).toEqual([200000000, 199999956, 200000940, 200004460, 200000000]);
    // The save now carries the futures desk, there and closed (its venue's books, streams and contracts), so the
    // whole game's fingerprint moved on 2026-11-08 while every figure above stayed; without the desk it is the same.
    // It moved again on 2026-11-09 for the currencies desk, there and closed (its venues' books and streams, its
    // pairs' fair values and factor, the rates); without that desk it was '50fb0670', the futures desk's, until the
    // miner moved the stocks' world on 2026-11-09.
    // It moved again on 2026-11-09 for the metals desk, there and closed (its three venues' books and streams, the
    // spot metals' fair values and factor, the six contracts), every figure above the same; without that desk it is
    // 'd8661a66', the miner's, still. It was 'ab8d1400' until Hudson stopped listing the spot (6c's amendment to 6b).
    expect(g.fingerprint()).toBe('702a3c4f');
    expect(busyGame(NO_METALS).fingerprint()).toBe('d8661a66');
    const stocksOnly = { ...CONTENT, exchanges: CONTENT.exchanges.filter((e) => e.desk === undefined), series: [] };
    expect(busyGame(stocksOnly).fingerprint()).toBe('a45526ec');
  }, 120_000);

  // Taken on 2026-11-09 at commit f94384f, before the step-rate cuts of plans/desk-speed.md: both desks open, the
  // player on a rack with a stocks block, a futures block and a currencies block, so the narrowed views are at work,
  // and the rivals as content has them. Every cut to how a firm builds its view must leave these as they are. They
  // moved once, on purpose, on 2026-11-09 with the miner (plans/desk-metals.md 6a): before, seed 1 was '87d3edc1',
  // 445 fills, 445 orders, [97, 0, 69, 0, 79], and seed 2 'ea81a08b', 261, 299, [74, 0, 88, 0, 137].
  it('leave a game with both desks open exactly as it was', () => {
    const play = (seed: number, content = NO_METALS, desks = ['futures', 'fx']): Game => {
      const g = new Game(content, seed);
      for (const d of desks) g.openDesk(d);
      g.firm.infra = infrastructureFrom(CONTENT, { location: 'colo-harbor', network: 'microwave', computer: 'rack' });
      const on = BLOCKS_ON;
      for (const b of g.firm.blocks) b.enabled = on.includes(b.id);
      g.skipToOpen();
      g.stepTicks((10 * MS_PER_MINUTE) / TICK_MS);
      return g;
    };
    const seen = (content: Content, desks?: string[]) =>
      [1, 2].map((seed) => {
        const g = play(seed, content, desks);
        const byBlock = (id: string) => [...g.firm.orders.values()].filter((o) => o.block === id).length;
        return [seed, g.fingerprint(), g.firm.stats.fillsReceived, g.firm.stats.ordersSent, BLOCKS_ON.map(byBlock)];
      });
    // Held on the content without the metals desk, as they were taken (plans/desk-metals.md 6b).
    expect(seen(NO_METALS)).toEqual(EXPECTED_DESKS_OPEN);
    // With it there and closed, every figure is the same and the fingerprint carries the closed desk.
    expect(seen(CONTENT)).toEqual(EXPECTED_METALS_CLOSED);
    // And with the metals desk open too: taken on 2026-11-09 when it was built (6b), moved with its rival (6d).
    expect(seen(CONTENT, ['futures', 'fx', 'metals'])).toEqual(EXPECTED_METALS_OPEN);
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
