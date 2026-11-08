import { CONTENT } from '../src/content';
import {
  Game,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_WEEK,
  REJECT_MARGIN,
  daily,
  type Content,
  type ContractSeriesSpec,
  type ExchangeSpec,
  type InstrumentSpec,
  type SavedGame,
} from '../src/sim';

/** The game's content without its futures desk, so a test's own desk is the only one. */
const STOCKS_ONLY = { ...CONTENT, exchanges: CONTENT.exchanges.filter((e) => e.desk === undefined), series: [] };

const H = MS_PER_HOUR;
const at = (d: number, ms: number) => d * MS_PER_DAY + ms;

/** A futures venue open 18:00 to 17:00, Sunday to Thursday evenings, so a Monday morning finds it open. */
const PRAIRIE: ExchangeSpec = {
  id: 'PRAIRIE',
  name: 'Prairie Board',
  city: 'Prairie',
  feePerShare: 0.5,
  lag: 30,
  noise: 0.5,
  desk: 'futures',
  session: daily(18 * H, 17 * H, [6, 0, 1, 2, 3]),
};

/** A spot metal on the futures desk, what the delivered contract is on. */
const MT: InstrumentSpec = {
  symbol: 'MT',
  name: 'Test metal',
  sector: 'metal',
  desk: 'futures',
  startPrice: 200_000,
  hourlyVol: 300,
  jumpsPerSecond: 0,
  jumpSize: 0,
};

const CONTRACT = {
  name: 'Test future',
  sector: 'equity index',
  desk: 'futures',
  kind: 'future' as const,
  multiplier: 5,
  margin: { initial: 0.1, maintenance: 0.08 },
  startPrice: 500_000,
  hourlyVol: 400,
  jumpsPerSecond: 0,
  jumpSize: 0,
};

/** Weekly, expiring Mondays at 15:00, two live: TF0 expires on the game's first day, TF1 a week later. */
const TF: ContractSeriesSpec = {
  root: 'TF',
  contract: { ...CONTRACT, settlement: 'cash' },
  period: MS_PER_WEEK,
  expiresAt: 15 * H,
  live: 2,
};
const DF: ContractSeriesSpec = {
  root: 'DF',
  contract: {
    ...CONTRACT,
    name: 'Test metal future',
    sector: 'metal',
    settlement: 'delivery',
    underlying: 'MT',
    startPrice: 200_000,
  },
  period: MS_PER_WEEK,
  expiresAt: 15 * H,
  live: 2,
};

/** Two stocks beside the desk, not the twelve: the stocks only have to be there, and fewer books step faster. */
const DESK: Content = {
  ...STOCKS_ONLY,
  stocks: [...CONTENT.stocks.filter((s) => !s.constituents).slice(0, 2), MT],
  exchanges: [...STOCKS_ONLY.exchanges, PRAIRIE],
  locations: CONTENT.locations.map((l) => ({ ...l, distance: { ...l.distance, PRAIRIE: 12 } })),
  series: [TF, DF],
};

/** A game at 06:00 on the first Monday with the futures desk open, the player's blocks off, watching the desk. */
function deskGame(content: Content = DESK): Game {
  const g = new Game(content, 3);
  g.openDesk('futures');
  for (const b of g.firm.blocks) b.enabled = false;
  g.firm.setWatch(['TF0', 'TF1', 'DF0', 'DF1', 'MT']);
  g.stepTicks(2000);
  return g;
}

/** Buy (or sell, if negative) at a limit a little through the touch, and wait for it to come back. */
function trade(g: Game, symbol: string, qty: number) {
  const q = g.market.venue('PRAIRIE').quote(symbol);
  const side = qty > 0 ? 'buy' : 'sell';
  const price = side === 'buy' ? q.ask! + 100 : q.bid! - 100;
  const r = g.hand({ symbol, side, size: Math.abs(qty), exchange: 'PRAIRIE', type: 'limit', price });
  g.stepTicks(1000);
  return r;
}

const held = (g: Game, symbol: string) => g.firm.positions.get(symbol)?.qty ?? 0;
const run = (g: Game, until: number) => {
  while (g.now < until) g.step(Math.min(1000, until - g.now));
};

describe('margined instruments', () => {
  it('cost only the fee to hold, count their unrealised in equity, and stay out of the leverage cap', () => {
    const g = deskGame();
    const cash = g.firm.cash;
    trade(g, 'TF1', 4);
    expect(held(g, 'TF1')).toBe(4);
    expect(cash - g.firm.cash).toBe(g.firm.feesPaid);
    const pos = g.firm.positions.get('TF1')!;
    const mark = g.market.venue('PRAIRIE').book('TF1').mid()!;
    const unrealised = 4 * (mark - pos.avgCost) * 5;
    expect(Math.abs(g.firm.equity(g.market, g.now) - (g.firm.cash + unrealised))).toBeLessThan(4 * 5 * 200);
    expect((g.firm as unknown as { exposure(): number }).exposure()).toBe(0);
  }, 120_000);

  it('refuse an order past the initial margin, and take one within it and one that reduces', () => {
    const g = deskGame();
    // One contract is $25,000 and needs $2,500 of margin: a hundred need $250,000, more than the $200,000 held.
    trade(g, 'TF1', 100);
    expect(held(g, 'TF1')).toBe(0);
    expect([...g.firm.orders.values()].some((o) => o.reason === REJECT_MARGIN)).toBe(true);
    trade(g, 'TF1', 50);
    expect(held(g, 'TF1')).toBe(50);
    trade(g, 'TF1', 50);
    expect(held(g, 'TF1')).toBe(50);
    trade(g, 'TF1', -20);
    expect(held(g, 'TF1')).toBe(30);
  }, 120_000);

  it("settle every night at the venue's close: cash moves by the variation, the average cost becomes the price", () => {
    const g = deskGame();
    trade(g, 'TF1', 2);
    run(g, at(0, 17 * H) - 2);
    const before = g.firm.positions.get('TF1')!.avgCost;
    const cash = g.firm.cash;
    const realised = g.firm.realised;
    run(g, at(0, 17 * H) + 2000);
    const after = g.firm.positions.get('TF1')!;
    expect(after.qty).toBe(2);
    expect(Number.isInteger(after.avgCost)).toBe(true);
    expect(after.avgCost).not.toBe(before);
    expect(g.firm.cash - cash).toBeCloseTo(2 * 5 * (after.avgCost - before), 6);
    expect(g.firm.realised - realised).toBeCloseTo(2 * 5 * (after.avgCost - before), 6);
  }, 120_000);

  it('flatten the margined positions of a firm whose equity falls below the maintenance margin', () => {
    const g = deskGame();
    trade(g, 'TF1', 50);
    expect(held(g, 'TF1')).toBe(50);
    // Losses elsewhere: the firm keeps $40,000 against $100,000 of maintenance on fifty contracts.
    g.firm.cash -= 16_000_000;
    const calls: unknown[] = [];
    g.on((e) => e.kind === 'margin' && calls.push(e));
    g.stepTicks(3000);
    expect(calls.length).toBeGreaterThan(0);
    expect(held(g, 'TF1')).toBe(0);
    // It trades on: a call is not a halt.
    expect(g.firm.halt).toBeNull();
  }, 120_000);
});

describe('contracts that expire', () => {
  it('close a cash contract at the final price at expiry, delist it and list the next, never more than live', () => {
    const g = deskGame();
    expect(g.market.live('TF')).toEqual(['TF0', 'TF1']);
    trade(g, 'TF0', 3);
    expect(held(g, 'TF0')).toBe(3);
    run(g, at(0, 15 * H) + 2000);
    expect(held(g, 'TF0')).toBe(0);
    expect(g.firm.positions.get('TF0')?.qty ?? 0).toBe(0);
    expect(g.market.live('TF')).toEqual(['TF1', 'TF2']);
    expect(g.market.venue('PRAIRIE').lists('TF0')).toBe(false);
    expect(g.market.venue('PRAIRIE').lists('TF2')).toBe(true);
    expect(g.market.instruments.filter((s) => s.symbol.startsWith('TF')).length).toBe(2);
    // The P&L of the three contracts is cash now, and nothing of them is left to mark.
    expect(g.firm.equity(g.market, g.now)).toBe(g.firm.cash);
  }, 120_000);

  it('deliver a contract held into expiry as its underlying, paid for in cash', () => {
    const g = deskGame();
    trade(g, 'DF0', 2);
    expect(held(g, 'DF0')).toBe(2);
    run(g, at(0, 15 * H) - 2);
    const cash = g.firm.cash;
    run(g, at(0, 15 * H) + 2000);
    expect(held(g, 'DF0')).toBe(0);
    const metal = g.firm.positions.get('MT')!;
    expect(metal.qty).toBe(10);
    // Paid the final price for ten units, less the last day's variation it was paid on the contracts.
    const final = metal.avgCost;
    expect(Number.isInteger(final)).toBe(true);
    expect(cash - g.firm.cash).toBeGreaterThan(10 * final - 2 * 5 * 50_000);
    expect(cash - g.firm.cash).toBeLessThan(10 * final + 2 * 5 * 50_000);
  }, 120_000);
});

describe('saves', () => {
  it('are version 3, load a version 2 save to the same future, and keep the live contracts', () => {
    const plain = new Game(CONTENT, 5);
    plain.skipToOpen();
    plain.stepTicks(5000);
    const v2 = JSON.parse(JSON.stringify(plain.save())) as SavedGame;
    expect(v2.version).toBe(3);
    (v2 as unknown as { version: number }).version = 2;
    const a = Game.load(CONTENT, v2);
    const b = Game.load(CONTENT, JSON.parse(JSON.stringify(plain.save())) as SavedGame);
    a.stepTicks(5000);
    b.stepTicks(5000);
    expect(a.fingerprint()).toBe(b.fingerprint());

    const g = deskGame();
    trade(g, 'TF1', 2);
    run(g, at(0, 15 * H) + 5000);
    const saved = JSON.parse(JSON.stringify(g.save())) as SavedGame;
    const back = Game.load(DESK, saved);
    expect(back.market.live('TF')).toEqual(['TF1', 'TF2']);
    expect(back.fingerprint()).toBe(g.fingerprint());
    g.stepTicks(3000);
    back.stepTicks(3000);
    expect(back.fingerprint()).toBe(g.fingerprint());
  }, 120_000);
});
