// The options desk as the snapshot and the day's report tell it (plans/desk-options.md, 7e): the desk's greeks, worked
// out in the snapshot and never per tick; the expiry's settlement in the report, in By desk and as an event; and the
// watch list set whole, which the chain's shortcut uses.
import { CONTENT } from '../src/content';
import { OPTIONS_DESK } from '../src/content/options';
import {
  Game,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_YEAR,
  valueOf,
  type Content,
  type GameEvent,
  type SavedGame,
} from '../src/sim';
import { isOption } from '../src/sim/instrument';
import { delta, gamma, price, theta, totalGreeks, vega, type HeldOption } from '../src/sim/options';
import { infrastructureFrom } from '../src/sim/upgrades';

const H = MS_PER_HOUR;
const at = (d: number, ms: number) => d * MS_PER_DAY + ms;
const NO_RIVALS: Content = { ...CONTENT, competitors: [] };

function optGame(seed = 1): Game {
  const g = new Game(NO_RIVALS, seed);
  g.openDesk(OPTIONS_DESK);
  for (const b of g.firm.blocks) b.enabled = false;
  return g;
}
const run = (g: Game, until: number, stride = 1000) => {
  while (g.now < until) g.step(Math.min(stride, until - g.now));
};
const optionsOf = (g: Game) => g.market.instruments.filter(isOption);

describe('totalGreeks', () => {
  const S = 5300;
  const R = 0.035;
  const T = 10 / 365;
  const NOW = 1_000_000;
  const held = (right: 'call' | 'put', qty: number, strike = 5300, vol = 0.25): HeldOption => ({
    symbol: `${right}${strike}`,
    right,
    strike,
    expiry: NOW + T * MS_PER_YEAR,
    qty,
    multiplier: 100,
    vol,
  });

  it('is nought for nothing held', () => {
    expect(totalGreeks([], S, R, NOW)).toEqual({ delta: 0, gamma: 0, theta: 0, vega: 0 });
  });

  it('totals a position in index units: contracts times the multiplier times the model delta', () => {
    const g = totalGreeks([held('call', 10)], S, R, NOW);
    expect(g.delta).toBeCloseTo(10 * 100 * delta('call', S, 5300, T, 0.25, R), 9);
    expect(g.delta).toBeGreaterThan(400);
    expect(g.delta).toBeLessThan(700);
    // A short is the same with the signs turned.
    const short = totalGreeks([held('call', -10)], S, R, NOW);
    expect(short.delta).toBeCloseTo(-g.delta, 9);
    expect(short.gamma).toBeCloseTo(-g.gamma, 9);
    expect(short.theta).toBeCloseTo(-g.theta, 9);
    expect(short.vega).toBeCloseTo(-g.vega, 9);
  });

  it('signs a long option: gamma and vega for it, theta against', () => {
    const g = totalGreeks([held('call', 3)], S, R, NOW);
    expect(g.gamma).toBeGreaterThan(0);
    expect(g.vega).toBeGreaterThan(0);
    expect(g.theta).toBeLessThan(0);
    // A long put has a negative delta.
    expect(totalGreeks([held('put', 3)], S, R, NOW).delta).toBeLessThan(0);
  });

  it('adds the positions: a long straddle has little delta and double the gamma and the vega', () => {
    const c = totalGreeks([held('call', 1)], S, R, NOW);
    const both = totalGreeks([held('call', 1), held('put', 1)], S, R, NOW);
    expect(both.gamma).toBeCloseTo(2 * c.gamma, 9);
    expect(both.vega).toBeCloseTo(2 * c.vega, 9);
    expect(Math.abs(both.delta)).toBeLessThan(30);
  });

  it('counts gamma a dollar of the index, theta a calendar day and vega a volatility point, in cents', () => {
    const o = held('call', 1);
    const g = totalGreeks([o], S, R, NOW);
    // Gamma: the delta (index units) moves by this for a dollar (100 points) of the index.
    const d0 = 100 * delta('call', S, 5300, T, 0.25, R);
    const d1 = 100 * delta('call', S + 100, 5300, T, 0.25, R);
    expect(g.gamma).toBeCloseTo(100 * 100 * gamma(S, 5300, T, 0.25, R), 9);
    expect((d1 - d0) / g.gamma).toBeGreaterThan(0.9);
    expect((d1 - d0) / g.gamma).toBeLessThan(1.1);
    // Theta: the value (cents a contract) lost to a calendar day passing.
    const lost = 100 * (price('call', S, 5300, T - 1 / 365, 0.25, R) - price('call', S, 5300, T, 0.25, R));
    expect(lost / g.theta).toBeGreaterThan(0.9);
    expect(lost / g.theta).toBeLessThan(1.1);
    expect(g.theta).toBeCloseTo((100 * theta('call', S, 5300, T, 0.25, R)) / 365, 9);
    // Vega: the value gained to a point of volatility.
    const gained = 100 * (price('call', S, 5300, T, 0.26, R) - price('call', S, 5300, T, 0.25, R));
    expect(gained / g.vega).toBeGreaterThan(0.99);
    expect(gained / g.vega).toBeLessThan(1.01);
    expect(g.vega).toBeCloseTo((100 * vega(S, 5300, T, 0.25, R)) / 100, 9);
  });

  it('is the intrinsic delta and nothing else at expiry', () => {
    const o = { ...held('call', 1, 5200), expiry: NOW };
    expect(totalGreeks([o], S, R, NOW)).toEqual({ delta: 100, gamma: 0, theta: 0, vega: 0 });
  });
});

describe('the snapshot’s options', () => {
  it('has none while the desk is closed, and no option on a stock', () => {
    const g = new Game(NO_RIVALS, 1);
    const s = g.snapshot();
    expect(s.options).toBeUndefined();
    expect(s.stocks.every((x) => x.option === undefined)).toBe(true);
  });

  it('describes each option on the stocks list: right, strike, expiry, underlying, multiplier', () => {
    const g = optGame();
    const s = g.snapshot();
    const listed = optionsOf(g);
    expect(listed).toHaveLength(12);
    for (const o of listed) {
      const st = s.stocks.find((x) => x.symbol === o.symbol)!;
      expect(st.option).toEqual({
        right: o.right,
        strike: o.strike,
        expiry: o.expiry,
        underlying: 'IDX',
        multiplier: 100,
      });
    }
    expect(s.options).toMatchObject({ underlying: 'IDX', rate: 0.035, held: [] });
    expect(s.options!.greeks).toEqual({ delta: 0, gamma: 0, theta: 0, vega: 0 });
    expect(s.options!.spot).toBeCloseTo(g.market.fair.get('IDX')!, 9);
  });

  it('totals the greeks of what the firm holds, at the model’s volatility and the fair value now', () => {
    const g = optGame(2);
    run(g, at(0, 10 * H));
    const [call, put] = [
      optionsOf(g).find((o) => o.right === 'call' && o.expiry === at(0, 16 * H))!,
      optionsOf(g).find((o) => o.right === 'put' && o.expiry === at(1, 16 * H))!,
    ];
    g.firm.positions.set(call.symbol, { qty: 10, avgCost: 30 });
    g.firm.positions.set(put.symbol, { qty: -4, avgCost: 40 });
    const s = g.snapshot();
    const o = s.options!;
    expect(o.held.map((h) => h.symbol).sort()).toEqual([call.symbol, put.symbol].sort());
    const h = o.held.find((x) => x.symbol === call.symbol)!;
    expect(h).toMatchObject({ right: 'call', strike: call.strike, expiry: call.expiry, qty: 10, multiplier: 100 });
    expect(h.vol).toBeCloseTo(g.market.optionVol(call, g.now), 12);
    expect(o.greeks).toEqual(totalGreeks(o.held, o.spot, o.rate, g.now));
    expect(o.greeks.delta).not.toBe(0);
    expect(o.greeks.vega).not.toBe(0);
  });

  it('works the greeks in the snapshot only: a thousand ticks with positions held work out none', () => {
    const g = optGame(3);
    run(g, at(0, 10 * H));
    const call = optionsOf(g).find((o) => o.right === 'call')!;
    g.firm.positions.set(call.symbol, { qty: 5, avgCost: 30 });
    const spy = vi.spyOn(g as unknown as { optionsNow(): unknown }, 'optionsNow');
    for (let i = 0; i < 1000; i++) g.step();
    expect(spy).not.toHaveBeenCalled();
    g.snapshot();
    g.snapshot();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('the expiry in the day’s report', () => {
  /** A game that holds a call and a put at the ends of the chain through the 16:00 expiry, and its tape of events. */
  function expiring(seed: number) {
    const g = optGame(seed);
    run(g, at(0, 11 * H));
    const today = optionsOf(g).filter((o) => o.expiry === at(0, 16 * H));
    const lowCall = today.filter((o) => o.right === 'call').sort((a, b) => a.strike! - b.strike!)[0]!;
    const highPut = today.filter((o) => o.right === 'put').sort((a, b) => b.strike! - a.strike!)[0]!;
    g.firm.positions.set(lowCall.symbol, { qty: 10, avgCost: 30 });
    g.firm.positions.set(highPut.symbol, { qty: -3, avgCost: 25 });
    const events: GameEvent[] = [];
    g.on((e) => events.push(e));
    run(g, at(0, 16 * H) - 2);
    const settle = (u: string) => g.market.settlementPrice(u);
    g.step(2);
    return { g, lowCall, highPut, events, index: settle('IDX') };
  }

  it('lists each option held to the close with what it settled at, what it paid and what it made', () => {
    const { g, lowCall, highPut, index } = expiring(4);
    const report = g.days[g.days.length - 1]!;
    expect(report.expired).toBeDefined();
    const call = report.expired!.find((x) => x.symbol === lowCall.symbol)!;
    const put = report.expired!.find((x) => x.symbol === highPut.symbol)!;
    expect(call).toMatchObject({ right: 'call', strike: lowCall.strike, qty: 10 });
    expect(put).toMatchObject({ right: 'put', strike: highPut.strike, qty: -3 });
    expect(call.settled).toBe(Math.max(0, index - lowCall.strike!));
    expect(put.settled).toBe(Math.max(0, highPut.strike! - index));
    expect(call.cash).toBe(valueOf(100, 10, call.settled));
    expect(call.made).toBe(valueOf(100, 10, call.settled - 30));
    expect(put.cash).toBe(valueOf(100, -3, put.settled));
    expect(put.made).toBe(valueOf(100, -3, put.settled - 25));
  });

  it('puts what the expiry made into the Options row of By desk and the option’s row of By stock, with no fill', () => {
    const { g, lowCall, highPut } = expiring(4);
    const report = g.days[g.days.length - 1]!;
    const made = report.expired!.reduce((n, x) => n + x.made, 0);
    expect(report.byDesk![OPTIONS_DESK]).toEqual({ fills: 0, realised: made, fees: 0 });
    for (const x of report.expired!) {
      expect(report.bySymbol[x.symbol]).toEqual({ fills: 0, realised: x.made, fees: 0 });
    }
    expect(report.expired!.map((x) => x.symbol).sort()).toEqual([lowCall.symbol, highPut.symbol].sort());
    // The expiry is in the day's result. The premiums were never paid here (the positions were set by hand), so the
    // cash that came in is what it made plus what they cost: 10 calls at 30 and 3 puts sold at 25, a hundred to a contract.
    expect(report.pnl).toBeCloseTo(made + 100 * (10 * 30 - 3 * 25), 0);
  });

  it('tells the player of it as one event for each option, with the same figures as the report', () => {
    const { g, events, lowCall, highPut } = expiring(4);
    const told = events.filter((e): e is Extract<GameEvent, { kind: 'expiry' }> => e.kind === 'expiry');
    expect(told.map((e) => e.symbol).sort()).toEqual([lowCall.symbol, highPut.symbol].sort());
    for (const e of told) {
      const line = g.days[g.days.length - 1]!.expired!.find((x) => x.symbol === e.symbol)!;
      expect({ qty: e.qty, cash: e.cash, made: e.made }).toEqual({ qty: line.qty, cash: line.cash, made: line.made });
    }
  });

  it('has nothing to say for a day with no option held to the close', () => {
    const g = optGame(5);
    run(g, at(0, 16 * H) + 2);
    const report = g.days[g.days.length - 1]!;
    expect(report.expired).toBeUndefined();
    expect(report.byDesk?.[OPTIONS_DESK]).toBeUndefined();
  });

  it('keeps the lines through a save and a load, and writes them for no rival', () => {
    const { g } = expiring(6);
    const again = Game.load(g.content, JSON.parse(JSON.stringify(g.save())) as SavedGame);
    expect(again.days[again.days.length - 1]!.expired).toEqual(g.days[g.days.length - 1]!.expired);
  });
});

describe('the watch list, set whole', () => {
  it('replaces the list with the symbols given that exist, cut to the computer’s limit', () => {
    const g = optGame(7);
    g.firm.infra = infrastructureFrom(CONTENT, { location: 'colo-prairie', network: 'microwave', computer: 'rack' });
    const call = optionsOf(g)[0]!.symbol;
    g.setWatchList(['IDX', 'IXF0', call, 'NOPE']);
    const s = g.snapshot();
    expect(s.stocks.filter((x) => x.watched).map((x) => x.symbol)).toEqual(['IDX', 'IXF0', call]);
    expect(s.watching).toEqual({ count: 3, max: 20 });
    // Past the limit, the first the computer can follow.
    g.setWatchList(g.market.stocks.map((x) => x.symbol));
    expect(g.snapshot().watching.count).toBe(20);
  });
});

describe('an order in the wire when its option is delisted', () => {
  it('finds nobody who beat it and is refused by the venue, not thrown on', () => {
    const g = optGame(8);
    const pox = g.market.exchange('POX');
    expect(pox.takersSince('OC99', 0, 'buy', 100, 'firm')).toEqual([]);
    const refused = pox.submit('OC99', { owner: 'firm', side: 'buy', price: 10, size: 1, ioc: true }, g.now);
    expect(refused?.refused).toBeTruthy();
  });
});
