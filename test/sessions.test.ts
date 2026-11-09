import { CONTENT } from '../src/content';
import {
  Game,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  TICK_MS,
  isMarketOpen,
  nextClose,
  nextOpen,
  type ExchangeSpec,
  type InstrumentSpec,
  type SavedGame,
} from '../src/sim';
import { activity } from '../src/sim/clock';
import { Random } from '../src/sim/random';
import {
  STOCK_SESSION,
  activityIn,
  daily,
  isOpenIn,
  nextCloseIn,
  nextOpenIn,
  span,
  type SessionSpec,
} from '../src/sim/session';

/** The game's content without its futures desk, so a test's own desk is the only one. */
const STOCKS_ONLY = { ...CONTENT, exchanges: CONTENT.exchanges.filter((e) => e.desk === undefined), series: [] };

const H = MS_PER_HOUR;
const MON = 0;
const FRI = 4;
const SUN = 6;
/** Week one's day `d` (Monday 0) at `ms` past midnight. */
const at = (d: number, ms: number) => d * MS_PER_DAY + ms;

/** A futures venue's hours: 18:00 to 17:00 the next day, opening Sunday to Thursday, an hour's break each day. */
const FUTURES_HOURS: SessionSpec = daily(18 * H, 17 * H, [SUN, 0, 1, 2, 3]);

const PRAIRIE: ExchangeSpec = {
  id: 'PRAIRIE',
  name: 'Prairie Board',
  city: 'Prairie',
  feePerShare: 0.1,
  lag: 30,
  noise: 0.5,
  desk: 'futures',
  session: FUTURES_HOURS,
};
const TF: InstrumentSpec = {
  symbol: 'TF',
  name: 'Test future',
  sector: 'equity index',
  desk: 'futures',
  startPrice: 500_000,
  hourlyVol: 400,
  jumpsPerSecond: 0,
  jumpSize: 0,
};
/** The game's content with the test desk: every location given a distance to the Prairie Board. */
const WITH_DESK = {
  ...STOCKS_ONLY,
  stocks: [...CONTENT.stocks, TF],
  exchanges: [...STOCKS_ONLY.exchanges, PRAIRIE],
  locations: CONTENT.locations.map((l) => ({ ...l, distance: { ...l.distance, PRAIRIE: 12 } })),
};
/** The same with two stocks, for the tests that run long and only need the stocks there. */
const SMALL_DESK = { ...WITH_DESK, stocks: [...CONTENT.stocks.filter((s) => !s.constituents).slice(0, 2), TF] };
const STOCK_SYMBOLS = CONTENT.stocks.map((s) => s.symbol);

/** A game with the player idle, five minutes into the stocks' open. */
function fiveMinutesIn(g: Game): Game {
  for (const b of g.firm.blocks) b.enabled = false;
  g.skipToOpen();
  g.stepTicks((6 * MS_PER_MINUTE) / TICK_MS);
  return g;
}

const stockFairs = (g: Game) => STOCK_SYMBOLS.map((s) => g.market.fair.get(s));
const headlines = (g: Game) => g.news.published.map((h) => [h.at, h.text, JSON.stringify(h.moves)]);

describe('sessions', () => {
  it("hold the stocks' hours equal to the clock, to the millisecond, over three weeks", () => {
    const times: number[] = [];
    for (let t = 0; t < 21 * MS_PER_DAY; t += 7 * MS_PER_MINUTE + 13) times.push(t);
    for (let d = 0; d < 21; d++)
      for (const m of [9.5 * H, 16 * H]) for (const e of [-1, 0, 1]) times.push(at(d, m) + e);
    for (const t of times) {
      expect(isOpenIn(STOCK_SESSION, t), `open ${t}`).toBe(isMarketOpen(t));
      expect(nextOpenIn(STOCK_SESSION, t), `next open ${t}`).toBe(nextOpen(t));
      expect(nextCloseIn(STOCK_SESSION, t), `next close ${t}`).toBe(nextClose(t));
      expect(activityIn(STOCK_SESSION, t), `activity ${t}`).toBe(activity(t));
    }
  });

  it('open a session across midnight, with a daily break and a weekend', () => {
    expect(isOpenIn(FUTURES_HOURS, at(MON, 2 * H))).toBe(true); // opened Sunday 18:00
    expect(isOpenIn(FUTURES_HOURS, at(MON, 17.5 * H))).toBe(false); // the break
    expect(isOpenIn(FUTURES_HOURS, at(MON, 18.5 * H))).toBe(true);
    expect(isOpenIn(FUTURES_HOURS, at(FRI, 17.5 * H))).toBe(false); // Friday's close is the week's
    expect(isOpenIn(FUTURES_HOURS, at(5, 12 * H))).toBe(false); // Saturday
    expect(nextOpenIn(FUTURES_HOURS, at(MON, 17.5 * H))).toBe(at(MON, 18 * H));
    expect(nextCloseIn(FUTURES_HOURS, at(MON, 10 * H))).toBe(at(MON, 17 * H));
    expect(nextOpenIn(FUTURES_HOURS, at(FRI, 17.5 * H))).toBe(at(SUN, 18 * H));
    // Busy at either end of its span and quiet in the middle, as the stocks' day is.
    expect(activityIn(FUTURES_HOURS, at(MON, 18 * H) + 1)).toBeGreaterThan(activityIn(FUTURES_HOURS, at(1, 5 * H)));
    expect(activityIn(FUTURES_HOURS, at(MON, 17.5 * H))).toBe(0);
  });

  it('run a session all week as one span, through the turn of the week', () => {
    const fx = span(SUN, 17 * H, FRI, 17 * H);
    expect(isOpenIn(fx, at(2, 3 * H))).toBe(true);
    expect(isOpenIn(fx, at(5, 12 * H))).toBe(false);
    expect(isOpenIn(fx, 7 * MS_PER_DAY)).toBe(true); // Monday 00:00 of week two, mid-span
    expect(nextCloseIn(fx, at(SUN, 20 * H))).toBe(at(FRI + 7, 17 * H));
    expect(nextOpenIn(fx, at(2, 3 * H))).toBe(at(SUN, 17 * H));
  });
});

describe('desks and venues', () => {
  it("leave the stocks' fair values and headlines alone, whether a desk is there, closed or open", () => {
    // Seed 8: six headlines by five minutes in (seed 7 had them until the miner moved the stocks' world, 2026-11-09).
    const plain = fiveMinutesIn(new Game(CONTENT, 8));
    const closed = fiveMinutesIn(new Game(WITH_DESK, 8));
    const open = new Game(WITH_DESK, 8);
    open.openDesk('futures');
    fiveMinutesIn(open);
    expect(stockFairs(closed)).toEqual(stockFairs(plain));
    expect(stockFairs(open)).toEqual(stockFairs(plain));
    expect(headlines(closed)).toEqual(headlines(plain));
    expect(headlines(open)).toEqual(headlines(plain));
    expect(headlines(plain).length).toBeGreaterThan(0);
  }, 60_000);

  it('do not step a desk that is not open: its fair values, books and stream are untouched', () => {
    const g = fiveMinutesIn(new Game(WITH_DESK, 7));
    expect(g.market.fair.get('TF')).toBe(500_000);
    expect(g.market.venue('PRAIRIE').quote('TF').bid).toBeNull();
    expect(g.market.stocks.map((s) => s.symbol)).not.toContain('TF');
    expect(g.market.exchanges.map((e) => e.id)).not.toContain('PRAIRIE');
    expect(g.snapshot().stocks.map((s) => s.symbol)).not.toContain('TF');
    expect(g.save().streams.desks?.futures).toBe(Random.derive(7 >>> 0, 'world:futures').save());
  }, 60_000);

  it('step an open desk on its own stream, and list its instrument on its own venue only', () => {
    const g = new Game(WITH_DESK, 7);
    g.openDesk('futures');
    fiveMinutesIn(g);
    expect(g.market.fair.get('TF')).not.toBe(500_000);
    const prairie = g.market.venue('PRAIRIE');
    expect(prairie.lists('TF')).toBe(true);
    expect(prairie.quote('TF').bid).not.toBeNull();
    const harbor = g.market.venue('HARBOR');
    expect(harbor.lists('TF')).toBe(false);
    expect(prairie.lists('QNT')).toBe(false);
    expect(harbor.quoteAsOf('TF', g.now)).toBeNull();
    expect(() => harbor.book('TF')).toThrow(/does not list TF/);
    const snap = g.snapshot().stocks.find((s) => s.symbol === 'TF')!;
    expect(snap.exchanges.map((e) => e.id)).toEqual(['PRAIRIE']);
  }, 60_000);

  it('open and close a venue on its own hours: its books empty at its close, and an order then is refused', () => {
    const g = new Game(SMALL_DESK, 7);
    g.openDesk('futures');
    for (const b of g.firm.blocks) b.enabled = false;
    const prairie = g.market.venue('PRAIRIE');
    // Monday 06:00 to 16:59, a second at a time: the venue has been open since Sunday evening.
    while (g.now < at(MON, 17 * H) - 10_000) g.step(1000);
    g.stepTicks(1000);
    expect(prairie.quote('TF').bid).not.toBeNull();
    while (g.now < at(MON, 17 * H) + 10_000) g.stepTicks(500);
    expect(prairie.quote('TF').bid).toBeNull();
    expect(prairie.quote('TF').ask).toBeNull();
    const r = prairie.submit('TF', { owner: 'x', side: 'buy', price: 500_000, size: 1 }, g.now);
    expect(r?.refused).toBe('market closed');
    expect(g.market.isOpenFor('TF', g.now)).toBe(false);
    expect(g.market.isOpenFor('QNT', g.now)).toBe(false);
    expect(g.nextOpenOf('PRAIRIE')).toBe(at(MON, 18 * H));
    while (g.now < at(MON, 18 * H) + 5 * MS_PER_MINUTE) g.stepTicks(500);
    expect(prairie.quote('TF').bid).not.toBeNull();
    expect(g.market.isOpenFor('TF', g.now)).toBe(true);
  }, 120_000);

  it('keep a desk open across a save, and derive a stream an older save lacks', () => {
    const g = new Game(WITH_DESK, 7);
    g.openDesk('futures');
    fiveMinutesIn(g);
    const saved = JSON.parse(JSON.stringify(g.save())) as SavedGame;
    expect(saved.desks).toEqual(['futures']);
    const back = Game.load(WITH_DESK, saved);
    expect(back.market.exchanges.map((e) => e.id)).toContain('PRAIRIE');
    expect(back.fingerprint()).toBe(g.fingerprint());
    // A save from before desks: no desks, no desk streams, no crowd stream for the new venue.
    const old = JSON.parse(JSON.stringify(new Game(CONTENT, 7).save())) as SavedGame;
    const loaded = Game.load(WITH_DESK, old);
    expect(loaded.market.exchanges.map((e) => e.id)).not.toContain('PRAIRIE');
    loaded.openDesk('futures');
    expect(() => loaded.stepTicks(100)).not.toThrow();
  }, 60_000);
});
