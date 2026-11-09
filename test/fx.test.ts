// The currencies desk, part 5a: money in currencies, the cross, rollover and the dealer's last look. The desk is
// in the game's content and closed; each test here opens it. See plans/desk-fx.md.
import { vi } from 'vitest';
import { CONTENT } from '../src/content';
import { ASHFORD, EASTHOLM, FX_DESK, PAIRS } from '../src/content/fx';
import { Game, MS_PER_DAY, decimalsOf, MS_PER_HOUR, TICK_MS, rolloverDays, toHome, type Rate } from '../src/sim';
import { BACKGROUND, Exchange, type SubmitResult } from '../src/sim/exchange';
import { Firm } from '../src/sim/firm';
import { Random } from '../src/sim/random';
import { LAST_STAGE, shows } from '../src/content';
import { raceSentence } from '../src/ui/Race';
import { REVEAL_KEY, createStore, type Storage } from '../src/ui/store';

const H = MS_PER_HOUR;
const at = (d: number, ms: number) => d * MS_PER_DAY + ms;
const run = (g: Game, until: number, dt = 1000) => {
  while (g.now < until) g.step(Math.min(dt, until - g.now));
};
const ticks = (ms: number) => ms / TICK_MS;

/**
 * The game with the currencies desk open, the player's blocks off, so only what a test does trades, and the
 * player watching the pairs (the laptop's four symbols would otherwise be stocks).
 */
function fxGame(seed: number, content = CONTENT): Game {
  const g = new Game(content, seed);
  for (const b of g.firm.blocks) b.enabled = false;
  g.openDesk(FX_DESK);
  g.firm.setWatch(['EURUSD', 'USDJPY', 'EURJPY']);
  return g;
}

/** A hand market order, stepped until it has finished. */
function trade(g: Game, symbol: string, side: 'buy' | 'sell', size: number, exchange: string) {
  const r = g.hand({ symbol, side, size, exchange, type: 'market' });
  expect(r.ok).toBe(true);
  g.stepTicks(ticks(1000));
}

describe('money in currencies', () => {
  it('moves the base and the quote balances by exact integers on a fill, and the fee from cash', () => {
    const g = fxGame(3);
    g.stepTicks(ticks(5000));
    const cash = g.firm.cash;
    trade(g, 'EURJPY', 'buy', 3, EASTHOLM.id);
    const cross = g.firm.fills.filter((f) => f.symbol === 'EURJPY');
    expect(cross.length).toBeGreaterThan(0);
    const lots = cross.reduce((n, f) => n + f.size, 0);
    const yen = cross.reduce((n, f) => n + 10 * f.size * f.price, 0);
    const fees = cross.reduce((n, f) => n + f.fee, 0);
    // A lot is a thousand euros, a hundred thousand euro cents; a point of a lot is ten yen.
    expect(g.firm.balances.get('EUR')).toBe(lots * 1000 * 100);
    expect(g.firm.balances.get('JPY')).toBe(-yen);
    expect(Number.isInteger(g.firm.balances.get('JPY'))).toBe(true);
    // Neither leg is the dollar: cash pays the fee alone.
    expect(g.firm.cash).toBe(cash - fees);
    expect(g.firm.position('EURJPY')).toBe(lots);

    // A dollar-based pair: the dollar leg is cash itself.
    const before = g.firm.cash;
    const yenBefore = g.firm.balances.get('JPY')!;
    trade(g, 'USDJPY', 'buy', 2, EASTHOLM.id);
    const dollar = g.firm.fills.filter((f) => f.symbol === 'USDJPY');
    const n = dollar.reduce((k, f) => k + f.size, 0);
    expect(n).toBeGreaterThan(0);
    expect(g.firm.cash).toBe(before + n * 1000 * 100 - dollar.reduce((k, f) => k + f.fee, 0));
    expect(g.firm.balances.get('JPY')).toBe(yenBefore - dollar.reduce((k, f) => k + 10 * f.size * f.price, 0));
  }, 60_000);

  it('converts a balance to dollars through toHome alone, rounded there', () => {
    const rates = new Map<string, Rate>([
      ['EUR', { mid: 10850, perPoint: 1e-4, inverse: false }],
      ['JPY', { mid: 15000, perPoint: 1e-4, inverse: true }],
    ]);
    // A thousand euros at 1.0850 is $1,085; 1,500 yen at 150.00 is $10; the dollar is itself.
    expect(toHome('EUR', 100_000, rates)).toBe(108_500);
    expect(toHome('JPY', 1500, rates)).toBe(1000);
    expect(toHome('USD', 123, rates)).toBe(123);
    expect(toHome('JPY', 1, rates)).toBe(1);
    expect(toHome('EUR', -3, rates)).toBe(-3);

    const g = fxGame(3);
    g.stepTicks(ticks(5000));
    trade(g, 'EURJPY', 'buy', 2, EASTHOLM.id);
    const f = g.firm;
    const byBalances = () => f.cash + [...f.balances].reduce((n, [c, b]) => n + toHome(c, b, g.market.rates), 0);
    expect(f.equity(g.market, g.now)).toBe(byBalances());
    // A currency position is counted through its balances only, never also by its mark.
    f.positions.get('EURJPY')!.avgCost = 0;
    expect(f.equity(g.market, g.now)).toBe(byBalances());
    // A yen balance's dollars move with the rate while nothing trades.
    const rate = g.market.rates.get('JPY')!;
    const was = f.equity(g.market, g.now);
    rate.mid += 100;
    expect(f.equity(g.market, g.now)).toBe(byBalances());
    expect(f.equity(g.market, g.now)).toBeGreaterThan(was);
  }, 60_000);
});

describe('the pairs and their cross', () => {
  it("prices the cross at the product of its legs' fairs each tick, drawing nothing", () => {
    const g = fxGame(5);
    for (let i = 0; i < 500; i++) {
      g.step();
      const a = g.market.fair.get('EURUSD')!;
      const b = g.market.fair.get('USDJPY')!;
      expect(g.market.fair.get('EURJPY')).toBeCloseTo((a * b) / 10_000, 6);
    }
    // Without the cross, the desk's stream is where it is with it: the cross drew nothing.
    const noCross = { ...CONTENT, instruments: (CONTENT.instruments ?? []).filter((s) => s.symbol !== 'EURJPY') };
    const with_ = fxGame(5);
    const without = fxGame(5, noCross);
    run(with_, at(0, 7 * H));
    run(without, at(0, 7 * H));
    expect(with_.save().streams.desks?.fx).toBe(without.save().streams.desks?.fx);
    expect(with_.market.fair.get('EURUSD')).toBe(without.market.fair.get('EURUSD'));
  }, 120_000);

  it("draws only from world:fx, and opening the desk leaves the stocks' fair values and headlines the same", () => {
    const shut = new Game(CONTENT, 7);
    for (const b of shut.firm.blocks) b.enabled = false;
    const open = fxGame(7);
    run(shut, at(0, 10 * H + 30 * 60_000));
    run(open, at(0, 10 * H + 30 * 60_000));
    for (const s of CONTENT.stocks) expect(open.market.fair.get(s.symbol)).toBe(shut.market.fair.get(s.symbol));
    expect(open.news.published.map((h) => h.text)).toEqual(shut.news.published.map((h) => h.text));
    expect(open.news.published.length).toBeGreaterThan(0);
    expect(open.save().streams.world).toBe(shut.save().streams.world);
    // The pairs moved, on their own stream; shut, they did not, and the stream is untouched.
    expect(open.market.fair.get('EURUSD')).not.toBe(10850);
    expect(shut.market.fair.get('EURUSD')).toBe(10850);
    expect(open.save().streams.desks?.fx).not.toBe(Random.derive(7, 'world:fx').save());
    expect(shut.save().streams.desks?.fx).toBe(Random.derive(7, 'world:fx').save());
    // EUR/USD falls when USD/JPY rises: the dollar factor loads on them with opposite signs.
    const spec = (s: string) => CONTENT.instruments!.find((x) => x.symbol === s)!;
    expect(Math.sign(spec('EURUSD').beta!)).toBe(-Math.sign(spec('USDJPY').beta!));
  }, 120_000);
});

describe('rollover', () => {
  it('runs once each weekday at 17:00, three days on Wednesday, none at the weekend', () => {
    for (const [day, days] of [
      [0, 1],
      [1, 1],
      [2, 3],
      [3, 1],
      [4, 1],
      [5, 0],
      [6, 0],
    ] as const)
      expect(rolloverDays(at(day, 17 * H))).toBe(days);
    const g = fxGame(2);
    const spy = vi.spyOn(g.firm, 'rollover');
    run(g, at(7, 6 * H), 60_000);
    expect(spy.mock.calls.map((c) => c[0])).toEqual([1, 1, 3, 1, 1]);
  }, 120_000);

  it('credits the rate difference less the venue spread, over 360 days, into the quote balance, rounded', () => {
    const f = new Firm('t', 'Test', 0, null as never, []);
    f.fx = new Map([
      ['EURUSD', { base: 'EUR', quote: 'USD', units: 100_000 }],
      ['USDJPY', { base: 'USD', quote: 'JPY', units: 100_000 }],
    ]);
    f.scales = new Map([
      ['EURUSD', 10],
      ['USDJPY', 10],
    ]);
    const yearly = new Map([
      ['USD', 0.045],
      ['EUR', 0.03],
      ['JPY', 0.005],
    ]);
    const mids = new Map([
      ['EURUSD', 10850],
      ['USDJPY', 15000],
    ]);
    const markOf = (s: string) => mids.get(s)!;
    // Long two lots of EUR/USD: $2,170 earning 3% and paying 4.5%, less the half percent: -$43.40 a year, -12 cents a day.
    f.positions.set('EURUSD', { qty: 2, avgCost: 10850 });
    f.rollover(1, markOf, yearly, 0.005);
    expect(f.cash).toBe(-12);
    f.rollover(3, markOf, yearly, 0.005);
    expect(f.cash).toBe(-12 - 36);
    f.positions.delete('EURUSD');
    // Long three lots of USD/JPY earns the dollar's 4.5% against the yen's 0.5%, less the venue's: 43.75 yen, 44.
    f.positions.set('USDJPY', { qty: 3, avgCost: 15000 });
    f.rollover(1, markOf, yearly, 0.005);
    expect(f.balances.get('JPY')).toBe(44);
    // Short, the venue keeps its half percent either way: -56.25 yen, -56.
    f.positions.set('USDJPY', { qty: -3, avgCost: 15000 });
    f.rollover(1, markOf, yearly, 0.005);
    expect(f.balances.get('JPY')).toBe(44 - 56);
    // Nothing on no days, and nothing for a flat position.
    f.rollover(0, markOf, yearly, 0.005);
    f.positions.set('USDJPY', { qty: 0, avgCost: 0 });
    f.rollover(1, markOf, yearly, 0.005);
    expect(f.balances.get('JPY')).toBe(-12);
    expect(f.cash).toBe(-48);
  });
});

describe("the dealer's last look", () => {
  const SYMBOL = [{ symbol: 'EURUSD', startPrice: 10850 }];
  const quiet = (belief: number) => new Map([['EURUSD', belief]]);
  /** The dealer with one ask of ten lots at 10851 and its belief at 10850.5, and a firm's buy sent at it. */
  function dealer() {
    const ex = new Exchange(ASHFORD, SYMBOL);
    ex.submit('EURUSD', { owner: BACKGROUND, side: 'sell', price: 10851, size: 10 }, 0);
    ex.stocks.get('EURUSD')!.belief = 10850.5;
    const got: SubmitResult[] = [];
    const r = ex.submit('EURUSD', { owner: 'firm', side: 'buy', price: 10853, size: 2, ioc: true }, 0, (x) =>
      got.push(x),
    );
    return { ex, got, r };
  }
  const random = new Random(1);

  it('holds a firm taker order, then fills it at the held price where the dealer has not moved', () => {
    const { ex, got, r } = dealer();
    expect(r).toBeNull();
    ex.step(2, 2, quiet(10850.5), 0, random);
    ex.step(4, 2, quiet(10850.5), 0, random);
    expect(got).toEqual([]);
    ex.step(6, 2, quiet(10850.5), 0, random);
    expect(got.length).toBe(1);
    expect(got[0]!.refused).toBeNull();
    expect(got[0]!.trades.map((t) => [t.price, t.size])).toEqual([[10851, 2]]);
    expect(ex.tickTrades.length).toBe(1);
  });

  it('refuses it where the dealer moved past the held price in the hold, and tells no fill', () => {
    const { ex, got } = dealer();
    ex.stocks.get('EURUSD')!.belief = 10852;
    for (const t of [2, 4, 6]) ex.step(t, 2, quiet(10852), 0, random);
    expect(got.length).toBe(1);
    expect(got[0]!.refused).toBe('refused by the dealer after 5 ms');
    expect(got[0]!.trades).toEqual([]);
    expect(ex.tickTrades).toEqual([]);
    expect(ex.book('EURUSD').quote().askSize).toBe(10);
  });

  it("looks only at a firm's taker orders: the crowd's, and an order that would rest, go in at once", () => {
    const { ex } = dealer();
    const crowd = ex.submit(
      'EURUSD',
      { owner: BACKGROUND, side: 'buy', price: 10851, size: 1, ioc: true },
      0,
      () => {},
    );
    expect(crowd?.trades.length).toBe(1);
    const resting = ex.submit('EURUSD', { owner: 'firm', side: 'buy', price: 10840, size: 1 }, 0, () => {});
    expect(resting?.order.remaining).toBe(1);
    // The book, which has no last look, takes the firm's taker order at once.
    const book = new Exchange(EASTHOLM, SYMBOL);
    book.submit('EURUSD', { owner: BACKGROUND, side: 'sell', price: 10851, size: 10 }, 0);
    expect(
      book.submit('EURUSD', { owner: 'firm', side: 'buy', price: 10851, size: 1, ioc: true }, 0, () => {}),
    ).not.toBeNull();
  });

  it('comes back to the firm refused, its race saying so, with no fill', () => {
    const g = fxGame(3);
    g.stepTicks(ticks(5000));
    const dealerEx = g.market.venue(ASHFORD.id);
    g.hand({ symbol: 'EURUSD', side: 'buy', size: 1, exchange: ASHFORD.id, type: 'market' });
    // Step until the order is held at the dealer, then move the dealer's price up three pips and keep it there.
    let held = false;
    for (let i = 0; i < ticks(1000) && !held; i++) {
      g.step();
      held = dealerEx.held() > 0;
    }
    expect(held).toBe(true);
    for (let i = 0; i < ticks(500); i++) {
      if (dealerEx.held() > 0) {
        g.market.fair.set('EURUSD', g.market.fair.get('EURUSD')! + 3);
        g.market.anchor.set('EURUSD', g.market.anchor.get('EURUSD')! + 3);
        dealerEx.stocks.get('EURUSD')!.belief += 3;
      }
      g.step();
    }
    const o = [...g.firm.orders.values()].find((x) => x.symbol === 'EURUSD')!;
    expect(o.status).toBe('refused');
    expect(o.reason).toBe('refused by the dealer after 5 ms');
    expect(g.firm.fills.filter((f) => f.symbol === 'EURUSD')).toEqual([]);
    const story = g.snapshot().orders.find((x) => x.localId === o.localId)!;
    expect(raceSentence(story, {}, g.now)).toBe('Refused by the dealer after 5 ms.');
  }, 60_000);
});

describe('the save', () => {
  it('carries the balances, and a save with them loads to the same future', () => {
    const g = fxGame(3);
    g.stepTicks(ticks(5000));
    trade(g, 'EURJPY', 'buy', 2, EASTHOLM.id);
    expect(g.firm.balances.size).toBeGreaterThan(0);
    const saved = g.save();
    expect(saved.version).toBe(3);
    expect(saved.firm.balances).toEqual(Object.fromEntries(g.firm.balances));
    const copy = Game.load(CONTENT, JSON.parse(JSON.stringify(saved)) as typeof saved);
    expect(copy.firm.balances).toEqual(g.firm.balances);
    g.stepTicks(ticks(2000));
    copy.stepTicks(ticks(2000));
    expect(copy.fingerprint()).toBe(g.fingerprint());
    expect(copy.firm.equity(copy.market, copy.now)).toBe(g.firm.equity(g.market, g.now));
  }, 60_000);

  it('leaves a firm with no balances saved as it was', () => {
    const g = new Game(CONTENT, 3);
    expect('balances' in g.save().firm).toBe(false);
  });
});

describe('the desk, on the page', () => {
  function memoryWith(entries: [string, string][]): Storage {
    const data = new Map<string, string>(entries);
    return {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    };
  }

  it('opens at stage 4, in free play, and not before', () => {
    expect(shows(`desk:${FX_DESK}`, 3)).toBe(false);
    expect(shows(`desk:${FX_DESK}`, 4)).toBe(true);
    expect(shows(`desk:${FX_DESK}`, LAST_STAGE)).toBe(true);
    const free = createStore(CONTENT, memoryWith([[REVEAL_KEY, '1']]), 1);
    expect(free.game.market.isDeskOpen('futures')).toBe(true);
    expect(free.game.market.isDeskOpen(FX_DESK)).toBe(true);
    expect(free.game.market.exchanges.map((e) => e.id)).toContain(ASHFORD.id);
    expect(free.game.competitors.map((c) => c.name)).toContain('Kestrel Currency');
    const fresh = createStore(CONTENT, null, 1);
    expect(fresh.game.market.isDeskOpen(FX_DESK)).toBe(false);
  });

  it("counts a price's places from the instrument: a pip of the euro in dollars is four, of the yen two", () => {
    const [eurusd, usdjpy, eurjpy] = PAIRS;
    expect(decimalsOf(eurusd!, 100)).toBe(4);
    expect(decimalsOf(usdjpy!, 1)).toBe(2);
    expect(decimalsOf(eurjpy!, 1)).toBe(2);
    expect(decimalsOf(CONTENT.stocks[0]!, 100)).toBe(2);
  });
});
