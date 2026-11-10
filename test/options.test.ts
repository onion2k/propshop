import { CONTENT } from '../src/content';
import { OPTIONS, OPTIONS_DESK, OPTION_SERIES, POX } from '../src/content/options';
import {
  Game,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_YEAR,
  REJECT_MARGIN,
  calendarOf,
  liveContracts,
  scaleOf,
  valueOf,
  type Content,
  type InstrumentSpec,
  type SavedGame,
} from '../src/sim';
import { TRADING_YEAR_MS, openMsBetween } from '../src/sim/clock';
import { isOption } from '../src/sim/instrument';
import { OPTION_REPRICE_CENTS, OPTION_REPRICE_MS } from '../src/sim/market';
import { delta, price, skewed } from '../src/sim/options';

const H = MS_PER_HOUR;
const at = (d: number, ms: number) => d * MS_PER_DAY + ms;

/** The game's own content with no rivals, so a day steps quickly. */
const NO_RIVALS: Content = { ...CONTENT, competitors: [] };

/** A game with the options desk open and the player's blocks off, at 06:00 on the first Monday. */
function optGame(seed = 1, content: Content = NO_RIVALS): Game {
  const g = new Game(content, seed);
  g.openDesk(OPTIONS_DESK);
  for (const b of g.firm.blocks) b.enabled = false;
  return g;
}

/** Step in coarse strides: a test of the daily passes, not of the books. */
const run = (g: Game, until: number, stride = 1000) => {
  while (g.now < until) g.step(Math.min(stride, until - g.now));
};

const options = (g: Game): InstrumentSpec[] => g.market.instruments.filter(isOption);
const clone = (g: Game): Game => Game.load(g.content, JSON.parse(JSON.stringify(g.save())) as SavedGame);
const index = (g: Game) => g.market.fair.get('IDX')!;
const SECONDS_PER_YEAR = TRADING_YEAR_MS / 1000;

describe('the options desk, closed', () => {
  it('is in the content: a venue, six series of two, strikes about the index, nothing drawn', () => {
    const g = new Game(CONTENT, 1);
    expect(g.market.desks).toContain(OPTIONS_DESK);
    expect(g.market.isDeskOpen(OPTIONS_DESK)).toBe(false);
    expect(OPTION_SERIES).toHaveLength(6);
    const listed = options(g);
    expect(listed).toHaveLength(12);
    // Today's and tomorrow's, at the stocks' close.
    expect([...new Set(listed.map((o) => o.expiry!))].sort((a, b) => a - b)).toEqual([at(0, 16 * H), at(1, 16 * H)]);
    const centre = Math.round(index(g) / OPTIONS.strikeStep) * OPTIONS.strikeStep;
    for (const expiry of [at(0, 16 * H), at(1, 16 * H)])
      for (const right of ['call', 'put'] as const) {
        const strikes = listed
          .filter((o) => o.expiry === expiry && o.right === right)
          .map((o) => o.strike!)
          .sort((a, b) => a - b);
        expect(strikes).toEqual([centre - OPTIONS.strikeStep, centre, centre + OPTIONS.strikeStep]);
      }
    for (const o of listed) {
      expect(o.underlying).toBe('IDX');
      expect(o.multiplier).toBe(100);
      expect(o.settlement).toBe('cash');
      expect(o.margin).toBeUndefined();
      expect(scaleOf(o)).toBe(100);
      expect(g.market.venue(POX.id).lists(o.symbol)).toBe(true);
    }
    // Closed: the venue is not stepped, the firms do not see it, and nothing of its state is saved.
    expect(g.market.exchanges.map((e) => e.id)).not.toContain(POX.id);
    expect(g.market.stocks.some(isOption)).toBe(false);
    g.skipToOpen();
    g.stepTicks(200);
    const saved = g.save().market;
    expect(saved.vol).toBeUndefined();
    expect(saved.strikes).toBeDefined();
  });

  it('draws nothing from its stream while closed', () => {
    const g = new Game(CONTENT, 4);
    const before = g.streams.desks[OPTIONS_DESK]!.save();
    g.skipToOpen();
    g.stepTicks(500);
    expect(g.streams.desks[OPTIONS_DESK]!.save()).toBe(before);
  });
});

describe('a daily series', () => {
  it('lists no Saturday or Sunday, and after Friday lists Monday and Tuesday', () => {
    const series = OPTION_SERIES[0]!;
    expect(series.weekdays).toBe(true);
    const expiries = (now: number) => liveContracts(series, now).map((c) => c.expiry!);
    // Monday morning: today's and tomorrow's.
    expect(expiries(at(0, 6 * H))).toEqual([at(0, 16 * H), at(1, 16 * H)]);
    // Friday morning: Friday's and the next weekday, Monday's.
    expect(expiries(at(4, 6 * H))).toEqual([at(4, 16 * H), at(7, 16 * H)]);
    // Friday after the close, and all weekend: Monday's and Tuesday's.
    for (const now of [at(4, 16 * H), at(4, 20 * H), at(5, 3 * H), at(5, 20 * H), at(6, 12 * H), at(7, 3 * H)])
      expect(expiries(now), String(now)).toEqual([at(7, 16 * H), at(8, 16 * H)]);
    // A week of lookups: never a weekend expiry, always two.
    for (let now = 0; now < 21 * MS_PER_DAY; now += 5 * H) {
      const e = expiries(now);
      expect(e).toHaveLength(2);
      for (const x of e) expect(Math.floor(x / MS_PER_DAY) % 7).toBeLessThan(5);
    }
  });

  it('is what the market lists through a weekend', () => {
    const g = new Game(NO_RIVALS, 2);
    run(g, at(5, 3 * H), 60_000);
    for (const o of options(g)) expect(Math.floor(o.expiry! / MS_PER_DAY) % 7).toBeLessThan(5);
    expect(options(g)).toHaveLength(12);
    expect(Math.min(...options(g).map((o) => o.expiry!))).toBe(at(7, 16 * H));
  });
});

describe('the fair value of an option', () => {
  it("is the model's, from the index, the time left and the volatility, each tick", () => {
    const g = optGame(1);
    g.skipToOpen();
    run(g, at(0, 11 * H));
    expect(g.market.exchanges.map((e) => e.id)).toContain(POX.id);
    for (const o of options(g)) {
      const s = index(g);
      const t = (o.expiry! - g.now) / MS_PER_YEAR;
      const sigma = g.market.optionVol(o, g.now);
      expect(sigma).toBeGreaterThan(0);
      expect(g.market.fair.get(o.symbol)!).toBeCloseTo(price(o.right!, s, o.strike!, t, sigma, OPTIONS.rate), 9);
    }
  });

  it('is built from the realised volatility, a premium, a wander, the releases to come and the skew', () => {
    const g = optGame(1);
    g.skipToOpen();
    run(g, at(0, 11 * H));
    const vol = g.market.volatility;
    const realised = Math.sqrt(vol.variance * SECONDS_PER_YEAR);
    expect(g.market.realisedVol()).toBeCloseTo(realised, 12);
    const atm = Math.max(OPTIONS.floorVol, realised * (1 + OPTIONS.premium) + vol.wander);
    expect(g.market.atmVol()).toBeCloseTo(atm, 12);
    for (const o of options(g)) {
      const t = (o.expiry! - g.now) / MS_PER_YEAR;
      // The releases between now and the expiry, from the public calendar.
      let n = 0;
      for (let d = Math.floor(g.now / MS_PER_DAY); d <= Math.floor(o.expiry! / MS_PER_DAY); d++)
        for (const r of calendarOf(g, d)) if (r.at > g.now && r.at <= o.expiry!) n++;
      // Trading time: the open hours in full, the shut ones at a small weight.
      const open = openMsBetween(g.now, o.expiry!);
      const years = (open + OPTIONS.closedWeight * (o.expiry! - g.now - open)) / TRADING_YEAR_MS;
      expect(g.market.tradingYears(g.now, o.expiry!)).toBeCloseTo(years, 14);
      const total = atm * atm * years * OPTIONS.diffusionShare + n * OPTIONS.eventVariance;
      expect(g.market.expiryVariance(o.expiry!, g.now)).toBeCloseTo(total, 12);
      const forward = index(g) * Math.exp(OPTIONS.rate * t);
      const expected = skewed(Math.sqrt(total / t), o.strike!, forward, OPTIONS.skew);
      expect(g.market.optionVol(o, g.now)).toBeCloseTo(expected, 10);
    }
  });

  it('is dearer for a put than a call of the same strike is cheap: the skew tilts one volatility a strike', () => {
    const g = optGame(1);
    g.skipToOpen();
    run(g, at(0, 11 * H));
    const today = options(g).filter((o) => o.expiry === at(0, 16 * H));
    const calls = today.filter((o) => o.right === 'call').sort((a, b) => a.strike! - b.strike!);
    const vols = calls.map((o) => g.market.optionVol(o, g.now));
    expect(vols[0]!).toBeGreaterThan(vols[1]!);
    expect(vols[1]!).toBeGreaterThan(vols[2]!);
    // A call and a put of one strike share a volatility, so parity holds on the fair values.
    for (const c of calls) {
      const p = today.find((o) => o.right === 'put' && o.strike === c.strike)!;
      const t = (c.expiry! - g.now) / MS_PER_YEAR;
      const lhs = g.market.fair.get(c.symbol)! - g.market.fair.get(p.symbol)!;
      expect(lhs).toBeCloseTo(index(g) - c.strike! * Math.exp(-OPTIONS.rate * t), 8);
    }
    // A call's delta is its model delta.
    const c = calls[1]!;
    const t = (c.expiry! - g.now) / MS_PER_YEAR;
    expect(delta('call', index(g), c.strike!, t, g.market.optionVol(c, g.now), OPTIONS.rate)).toBeGreaterThan(0.2);
  });

  it('wanders on its own stream, once a tick while open, and the realised volatility is read, not drawn', () => {
    const g = optGame(1);
    g.skipToOpen();
    const stream = g.streams.desks[OPTIONS_DESK]!;
    const before = stream.save();
    g.step(1000);
    expect(stream.save()).not.toBe(before);
    expect(g.market.volatility.wander).not.toBe(0);
  });
});

describe('the crush', () => {
  /** A seed with a market-wide release inside the session on day 0 or 1. */
  function withRelease(): { g: Game; at: number } {
    for (let seed = 1; seed < 40; seed++) {
      const g = optGame(seed);
      g.skipToOpen();
      const times = [...calendarOf(g, 0), ...calendarOf(g, 1)].map((r) => r.at);
      const r = times.find((t) => t > g.now + 60_000 && t < at(0, 15 * H));
      if (r !== undefined) return { g, at: r };
    }
    throw new Error('No seed with a release in the session');
  }

  it("takes the event's share of an expiry's variance away at the release, and only then", () => {
    const { g, at: release } = withRelease();
    const expiry = at(0, 16 * H);
    run(g, release - 2000);
    const probe = (now: number) => g.market.expiryVariance(expiry, now, 0.2);
    // Variance one second before and one second after the release, the volatility held: the drop is the event.
    const drop = probe(release - 1) - probe(release + 1);
    expect(drop).toBeGreaterThan(OPTIONS.eventVariance * 0.999);
    expect(drop).toBeLessThan(OPTIONS.eventVariance * 1.001);
    // And in the game: the expiry's variance, as the market prices it, falls across the release by about the event.
    let last = g.market.expiryVariance(expiry, g.now);
    let seen = 0;
    while (g.now < release + 3000) {
      g.step(1000);
      const v = g.market.expiryVariance(expiry, g.now);
      if (g.now >= release && last - v > OPTIONS.eventVariance * 0.5) seen = last - v;
      last = v;
    }
    expect(seen).toBeGreaterThan(OPTIONS.eventVariance * 0.85);
    expect(seen).toBeLessThan(OPTIONS.eventVariance * 1.15);
  });

  it('carries no event variance for an expiry that has already gone, or a release that is already published', () => {
    const g = optGame(3);
    g.skipToOpen();
    const gone = at(0, 10 * H);
    expect(g.market.expiryVariance(gone, g.now, 0.2)).toBeLessThanOrEqual(
      0.2 * 0.2 * g.market.tradingYears(g.now, gone),
    );
    expect(g.market.expiryVariance(g.now + 1, g.now, 0.2)).toBeLessThan(OPTIONS.eventVariance);
  });
});

describe('expiry', () => {
  /** A game one second before the close with a position in each of today's six options; the strikes set by `set`. */
  function atExpiry(qty: number) {
    const g = optGame(5);
    g.skipToOpen();
    run(g, at(0, 16 * H) - 1000);
    // What the index settles at on the next second, from a twin: the same game, the same seed, the same future.
    const twin = clone(g);
    twin.step(1000);
    const settle = twin.market.settlementPrice('IDX');
    const today = options(g).filter((o) => o.expiry === at(0, 16 * H));
    expect(today).toHaveLength(6);
    const calls = today.filter((o) => o.right === 'call');
    const puts = today.filter((o) => o.right === 'put');
    // A call is in the money below the settlement, a put above it; one of each exactly at it.
    const places: [InstrumentSpec, number][] = [];
    [-40, 0, 40].forEach((off, i) => {
      calls[i]!.strike = settle + off;
      puts[i]!.strike = settle - off;
      places.push([calls[i]!, Math.max(0, -off)], [puts[i]!, Math.max(0, -off)]);
    });
    for (const [o] of places) g.firm.positions.set(o.symbol, { qty, avgCost: 30 });
    const cash = g.firm.cash;
    const realised = g.firm.realised;
    return { g, places, cash, realised, settle };
  }

  it.each([3, -2])(
    'pays the long and charges the short the intrinsic value, nothing out of the money (%i)',
    (qty) => {
      const { g, places, cash, realised, settle } = atExpiry(qty);
      expect(places.map(([, v]) => v)).toEqual([40, 40, 0, 0, 0, 0]);
      g.step(1000);
      expect(g.now).toBe(at(0, 16 * H));
      expect(g.market.settlementPrice('IDX')).toBe(settle);
      let paid = 0;
      let made = 0;
      for (const [o, intrinsic] of places) {
        paid += valueOf(scaleOf(o), qty, intrinsic);
        made += valueOf(scaleOf(o), qty, intrinsic - 30);
        expect(g.firm.positions.get(o.symbol)?.qty ?? 0).toBe(0);
      }
      expect(paid).not.toBe(0);
      expect(g.firm.cash - cash).toBe(paid);
      expect(g.firm.realised - realised).toBeCloseTo(made, 6);
      // Gone: delisted, tomorrow's and the day after's listed.
      expect(options(g).filter((o) => o.expiry === at(0, 16 * H))).toHaveLength(0);
      expect([...new Set(options(g).map((o) => o.expiry!))].sort((a, b) => a - b)).toEqual([
        at(1, 16 * H),
        at(2, 16 * H),
      ]);
      expect(g.market.venue(POX.id).lists(places[0]![0].symbol)).toBe(false);
    },
    120_000,
  );

  it('pays nothing exactly at the strike, and nothing out of the money, whoever holds it', () => {
    const { g, places, cash } = atExpiry(5);
    // Keep only the options that settle worth nothing.
    for (const [o, v] of places) if (v > 0) g.firm.positions.delete(o.symbol);
    g.step(1000);
    expect(g.firm.cash).toBe(cash);
    expect(g.firm.equity(g.market, g.now)).toBe(cash);
  }, 120_000);
});

describe('margin on a short option', () => {
  const S_SHARE = 0.15;
  const FLOOR = 0.1;

  /** An open game a few seconds into the session, with the step run once so the firm has what the market hands it. */
  function held() {
    const g = optGame(2);
    g.skipToOpen();
    run(g, at(0, 10 * H));
    return g;
  }

  const required = (g: Game, o: InstrumentSpec, qty: number, premium: number) => {
    const s = index(g);
    const otm = o.right === 'call' ? Math.max(0, o.strike! - s) : Math.max(0, s - o.strike!);
    const p = valueOf(100, qty, premium);
    return Math.max(p + valueOf(100, qty, s) * S_SHARE - valueOf(100, qty, otm), p + valueOf(100, qty, s) * FLOOR);
  };

  it('is the premium plus 15% of the index less the amount out of the money, floored at the premium plus 10%', () => {
    const g = held();
    const today = options(g).filter((o) => o.expiry === at(0, 16 * H));
    const calls = today.filter((o) => o.right === 'call').sort((a, b) => a.strike! - b.strike!);
    const [itm, atm, otm] = calls as [InstrumentSpec, InstrumentSpec, InstrumentSpec];
    // Make them clearly in, at, and far out of the money, so each branch of the rule is met.
    itm.strike = Math.round(index(g)) - 100;
    atm.strike = Math.round(index(g));
    otm.strike = Math.round(index(g)) + 1500;
    for (const o of [itm, atm, otm]) {
      g.firm.positions.set(o.symbol, { qty: -10, avgCost: 40 });
      expect(g.firm.marginRequired('initial')).toBeCloseTo(required(g, o, 10, 40), 4);
      g.firm.positions.delete(o.symbol);
    }
    // The far one hits the floor, the near one does not.
    expect(required(g, otm, 10, 40)).toBeCloseTo(valueOf(100, 10, 40) + valueOf(100, 10, index(g)) * FLOOR, 4);
    expect(required(g, atm, 10, 40)).toBeCloseTo(valueOf(100, 10, 40) + valueOf(100, 10, index(g)) * S_SHARE, 4);
    // Maintenance is the same rule at the mark.
    g.firm.positions.set(atm.symbol, { qty: -10, avgCost: 40 });
    expect(g.firm.marginRequired('maintenance', new Map([[atm.symbol, 90]]))).toBeCloseTo(required(g, atm, 10, 90), 4);
    expect(g.firm.marginedHeld()).toEqual([atm.symbol]);
  }, 120_000);

  it('asks nothing of a long option, which is paid for in full and counts toward the leverage cap', () => {
    const g = held();
    const o = options(g).find((x) => x.right === 'put')!;
    g.firm.positions.set(o.symbol, { qty: 10, avgCost: 40 });
    expect(g.firm.marginRequired('initial')).toBe(0);
    expect(g.firm.marginedHeld()).toEqual([]);
    expect((g.firm as unknown as { exposure(): number }).exposure()).toBe(valueOf(100, 10, 40));
    // A short one is out of the cap's reckoning, in the margin's.
    g.firm.positions.set(o.symbol, { qty: -10, avgCost: 40 });
    expect((g.firm as unknown as { exposure(): number }).exposure()).toBe(0);
    expect(g.firm.marginRequired('initial')).toBeGreaterThan(0);
  }, 120_000);

  it('refuses a sale past the initial margin and takes one within it', () => {
    const g = held();
    g.firm.setWatch([options(g)[0]!.symbol]);
    const o = options(g).find((x) => x.expiry === at(0, 16 * H) && x.right === 'call')!;
    const q = g.market.venue(POX.id).quote(o.symbol);
    const bid = q.bid ?? 20;
    // $200,000 of cash: one contract of this needs about $800 of margin, so 100 is $80,000 and 1,000 is $800,000.
    g.hand({ symbol: o.symbol, side: 'sell', size: 1000, exchange: POX.id, type: 'limit', price: bid });
    g.stepTicks(1000);
    expect([...g.firm.orders.values()].some((x) => x.reason === REJECT_MARGIN)).toBe(true);
    expect(g.firm.positions.get(o.symbol)?.qty ?? 0).toBe(0);
    g.hand({ symbol: o.symbol, side: 'sell', size: 5, exchange: POX.id, type: 'limit', price: bid });
    g.stepTicks(1000);
    const rejected = [...g.firm.orders.values()].filter((x) => x.reason === REJECT_MARGIN);
    expect(rejected).toHaveLength(1);
  }, 120_000);

  it('flattens a short option, with the rest, when equity falls below the maintenance margin', () => {
    const g = held();
    const o = options(g).find((x) => x.expiry === at(0, 16 * H) && x.right === 'put')!;
    g.firm.setWatch([o.symbol]);
    // Three hundred short is about $250,000 of margin against $200,000 held: below maintenance with nothing lost.
    g.firm.positions.set(o.symbol, { qty: -300, avgCost: 30 });
    g.firm.cash += valueOf(100, 300, 30);
    const need = g.firm.marginRequired('maintenance', new Map([[o.symbol, 30]]));
    expect(need).toBeGreaterThan(g.firm.equity(g.market, g.now));
    const calls: unknown[] = [];
    g.on((e) => e.kind === 'margin' && calls.push(e));
    g.stepTicks(3000);
    expect(calls.length).toBeGreaterThan(0);
    expect([...g.firm.orders.values()].some((x) => x.block === 'risk' && x.symbol === o.symbol)).toBe(true);
    expect(g.firm.halt).toBeNull();
  }, 120_000);
});

describe('opening the desk', () => {
  it('draws nothing from the stocks: their fair values, headlines and world stream are what they were', () => {
    const play = (open: string[]) => {
      const g = new Game(NO_RIVALS, 7);
      for (const d of open) g.openDesk(d);
      g.skipToOpen();
      run(g, at(0, 12 * H), 2000);
      return g;
    };
    const without = play(['futures']);
    const withOpts = play(['futures', OPTIONS_DESK]);
    const stocks = CONTENT.stocks.map((s) => s.symbol);
    for (const s of stocks) expect(withOpts.market.fair.get(s), s).toBe(without.market.fair.get(s));
    expect(withOpts.streams.world.save()).toBe(without.streams.world.save());
    expect(withOpts.news.published.map((h) => [h.id, h.at, h.text])).toEqual(
      without.news.published.map((h) => [h.id, h.at, h.text]),
    );
    expect(withOpts.news.scheduled).toEqual(without.news.scheduled);
    expect(withOpts.streams.desks['futures']!.save()).toBe(without.streams.desks['futures']!.save());
    expect(withOpts.streams.desks[OPTIONS_DESK]!.save()).not.toBe(without.streams.desks[OPTIONS_DESK]!.save());
  }, 120_000);

  it('opens the futures desk with it, the hedge it will need', () => {
    const g = new Game(NO_RIVALS, 1);
    expect(g.market.isDeskOpen('futures')).toBe(false);
    g.openDesk(OPTIONS_DESK);
    expect(g.market.isDeskOpen(OPTIONS_DESK)).toBe(true);
    expect(g.market.isDeskOpen('futures')).toBe(true);
    // And a save with the options desk and not the futures loads with both open.
    const fresh = new Game(NO_RIVALS, 1);
    fresh.openDesk('futures');
    const saved = JSON.parse(JSON.stringify(fresh.save())) as SavedGame;
    saved.desks = [OPTIONS_DESK];
    const back = Game.load(NO_RIVALS, saved);
    expect(back.market.isDeskOpen(OPTIONS_DESK)).toBe(true);
    expect(back.market.isDeskOpen('futures')).toBe(true);
    expect(back.competitors.map((c) => c.id)).toEqual(g.competitors.map((c) => c.id));
  });
});

describe('replay and saves', () => {
  it('give the same game for the same seed', () => {
    const play = () => {
      const g = optGame(9, CONTENT);
      g.skipToOpen();
      run(g, at(0, 11 * H), 2000);
      return g;
    };
    const a = play();
    const b = play();
    expect(a.fingerprint()).toBe(b.fingerprint());
    for (const o of options(a)) expect(b.market.fair.get(o.symbol)).toBe(a.market.fair.get(o.symbol));
  }, 120_000);

  it('load a save from the previous tick to the same future, across an expiry and its listing', () => {
    const g = optGame(6, CONTENT);
    g.skipToOpen();
    run(g, at(0, 16 * H) - 3000);
    const strikes = options(g).map((o) => [o.symbol, o.strike]);
    const back = clone(g);
    expect(options(back).map((o) => [o.symbol, o.strike])).toEqual(strikes);
    expect(back.fingerprint()).toBe(g.fingerprint());
    // Across the 16:00 close (the expiry, the delisting and the listing of the next day's), in single ticks.
    for (let i = 0; i < 2000; i++) {
      g.step(2);
      back.step(2);
    }
    expect(g.now).toBe(at(0, 16 * H) - 3000 + 4000);
    expect(back.fingerprint()).toBe(g.fingerprint());
    expect(options(back).map((o) => [o.symbol, o.strike])).toEqual(options(g).map((o) => [o.symbol, o.strike]));
    expect(back.market.volatility).toEqual(g.market.volatility);
  }, 120_000);

  it('keep the strikes and the volatility state in a save only while the desk is open', () => {
    const g = optGame(6);
    g.skipToOpen();
    run(g, at(0, 11 * H), 5000);
    const saved = g.save().market;
    expect(Object.keys(saved.strikes!).sort()).toEqual(
      options(g)
        .map((o) => o.symbol)
        .sort(),
    );
    expect(saved.vol).toEqual(g.market.volatility);
  });
});

describe('repricing', () => {
  it('prices the options when the index has moved a fifth of a cent or a tenth of a second has passed, not every tick', () => {
    const g = optGame(1);
    g.skipToOpen();
    run(g, at(0, 10 * H));
    const o = options(g)[0]!;
    let changes = 0;
    let last = g.market.fair.get(o.symbol)!;
    let lastSpot = index(g);
    let lastAt = g.now;
    for (let i = 0; i < 2000; i++) {
      g.step(2);
      const f = g.market.fair.get(o.symbol)!;
      if (f !== last) {
        changes++;
        // It changed because an input moved enough, or the time was up.
        expect(Math.abs(index(g) - lastSpot) >= OPTION_REPRICE_CENTS || g.now - lastAt >= OPTION_REPRICE_MS).toBe(true);
        last = f;
        lastSpot = index(g);
        lastAt = g.now;
      }
    }
    expect(changes).toBeGreaterThan(5);
    expect(changes).toBeLessThan(200);
    // Between pricings the fair value is off the model by less than the index's move times the delta: under a cent.
    const t = (o.expiry! - g.now) / MS_PER_YEAR;
    const model = price(o.right!, index(g), o.strike!, t, g.market.optionVol(o, g.now), OPTIONS.rate);
    expect(Math.abs(model - g.market.fair.get(o.symbol)!)).toBeLessThan(1);
  }, 60_000);

  it('prices nothing while the stocks are shut, and the first tick of the session prices all', () => {
    const g = optGame(2);
    g.skipToOpen();
    run(g, at(0, 16 * H) + 60_000);
    const o = options(g)[0]!;
    const shut = g.market.fair.get(o.symbol)!;
    run(g, at(1, 6 * H), 60_000);
    expect(g.market.fair.get(o.symbol)).toBe(shut);
    run(g, at(1, 9 * H + 30 * 60_000) + 1000);
    expect(g.market.fair.get(o.symbol)).not.toBe(shut);
  }, 60_000);
});
