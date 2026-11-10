// The options desk's model quoter (plans/desk-options.md, 7c): one bid and one ask a book, at the belief plus or
// minus a half-spread in volatility points, re-posted only when a rounded price moves; customer takers from the
// venue's own crowd stream.
import { CONTENT } from '../src/content';
import { OPTIONS_DESK, POX } from '../src/content/options';
import {
  Game,
  MS_PER_DAY,
  MS_PER_HOUR,
  type Content,
  type ExchangeSpec,
  type InstrumentSpec,
  type SavedGame,
} from '../src/sim';
import { BACKGROUND, Exchange } from '../src/sim/exchange';
import { isOption } from '../src/sim/instrument';
import { Random } from '../src/sim/random';

const H = MS_PER_HOUR;
const MIN = 60_000;
const DT = 2;
const at = (d: number, ms: number) => d * MS_PER_DAY + ms;

/** A bare venue with a quoter and nothing else about it: no noise, a lag of 100 ms. */
function bare(quoter: Partial<NonNullable<ExchangeSpec['quoter']>> = {}, lag = 100) {
  const spec: ExchangeSpec = {
    id: 'Q',
    name: 'Quoter test',
    city: 'Nowhere',
    feePerShare: 0,
    lag,
    noise: 0,
    quoter: { halfSpreadVol: 1, size: 1000, takeRate: 0, ...quoter },
  };
  const ex = new Exchange(spec, [{ symbol: 'X', startPrice: 1000 }]);
  const random = Random.derive(1, 'crowd:Q');
  let now = 0;
  const fair = new Map([['X', 1000]]);
  const half = new Map([['X', 2.5]]);
  /** Step `ms` of simulated time at the venue's tick, returning after each tick via `each`. */
  const run = (ms: number, each?: () => void) => {
    for (let t = 0; t < ms; t += DT) {
      now += DT;
      ex.step(now, DT, fair, 1, random, half);
      each?.();
    }
  };
  const book = () => ex.stocks.get('X')!.book;
  return { ex, fair, half, run, book, random, now: () => now };
}

describe('the quoter on a venue', () => {
  it('rests one bid and one ask at the belief plus or minus the half-spread, rounded outward', () => {
    const t = bare();
    t.run(200);
    const orders = t.book().resting(BACKGROUND);
    expect(orders).toHaveLength(2);
    const q = t.book().quote();
    expect(q.bid).toBe(997); // floor(1000 - 2.5)
    expect(q.ask).toBe(1003); // ceil(1000 + 2.5)
    expect(orders.map((o) => o.remaining)).toEqual([1000, 1000]);
  });

  it('is never deeper than its one order a side: no 24-deep replenishment, no stale sweep', () => {
    const t = bare();
    t.run(10_000);
    expect(t.book().count()).toBe(2);
    // The fair value wanders off: still two orders at any moment, and none left behind at an old price.
    for (let i = 0; i < 40; i++) {
      t.fair.set('X', 1000 + 3 * Math.sin(i / 5) * 5);
      t.run(100, () => expect(t.book().count()).toBeLessThanOrEqual(2));
    }
    expect(t.book().resting(BACKGROUND).length).toBe(2);
  });

  it('re-posts only when a rounded price changes', () => {
    const t = bare();
    t.run(200);
    let ids = t
      .book()
      .resting(BACKGROUND)
      .map((o) => o.id)
      .join();
    let prices = `${t.book().quote().bid}/${t.book().quote().ask}`;
    let reposts = 0;
    let moves = 0;
    // The fair value drifts a tenth of a cent every 20 ms: the rounded prices move now and then, not every turn.
    for (let i = 0; i < 400; i++) {
      t.fair.set('X', 1000 + i * 0.1);
      t.run(20, () => {
        const nowIds = t
          .book()
          .resting(BACKGROUND)
          .map((o) => o.id)
          .join();
        const nowPrices = `${t.book().quote().bid}/${t.book().quote().ask}`;
        // A change of order is a change of price, and a change of price is a change of order, tick by tick.
        expect(nowIds !== ids).toBe(nowPrices !== prices);
        if (nowIds !== ids) reposts++;
        if (nowPrices !== prices) moves++;
        ids = nowIds;
        prices = nowPrices;
      });
    }
    expect(moves).toBeGreaterThan(5);
    expect(reposts).toBe(moves);
    // Eight seconds in ticks of 2 ms is 4,000 ticks, 800 turns: far fewer re-posts than turns.
    expect(reposts).toBeLessThan(120);
  });

  it('goes stale with the lag: after a jump in fair value the quote follows only as the belief does', () => {
    const t = bare({}, 200);
    t.run(500);
    expect(t.book().quote().ask).toBe(1003);
    t.fair.set('X', 1100);
    t.run(20);
    // Twenty milliseconds on, a tenth of the lag: the ask is still near the old price, far under the new fair value.
    expect(t.book().quote().ask!).toBeLessThan(1020);
    // A fast firm lifts it at the old price, a hundred cents under what the thing is worth.
    const hit = t.ex.submit('X', { owner: 'firm', side: 'buy', price: 1050, size: 100, ioc: true }, t.now());
    expect(hit?.trades.length).toBe(1);
    expect(hit!.trades[0]!.price).toBeLessThan(1020);
    // A second of lag-times later the quote has caught up.
    t.run(2000);
    const q = t.book().quote();
    expect(q.bid!).toBeGreaterThan(1090);
    expect(q.ask!).toBeLessThan(1110);
    expect(q.ask!).toBeGreaterThan(1100);
  });

  it('posts no bid at or under nought, and still offers', () => {
    const t = bare();
    t.fair.set('X', 2);
    t.run(2000);
    const q = t.book().quote();
    expect(q.bid).toBeNull();
    expect(q.ask).not.toBeNull();
    expect(q.ask!).toBeGreaterThan(2);
  });

  it('keeps its ask above its bid even where the half-spread is under a tick', () => {
    const t = bare();
    t.half.set('X', 0.01);
    t.run(500);
    const q = t.book().quote();
    expect(q.ask! - q.bid!).toBeGreaterThanOrEqual(1);
  });

  it('refills an order a taker has worn down, at the same price', () => {
    const t = bare({ takeRate: 20 });
    t.run(20_000);
    const trades = t.ex.stocks.get('X')!.tape.length;
    expect(trades).toBeGreaterThan(5);
    // Still quoting two sides, each with at least half its size, after all that.
    const orders = t.book().resting(BACKGROUND);
    expect(orders).toHaveLength(2);
    for (const o of orders) expect(o.remaining * 2).toBeGreaterThanOrEqual(1000);
  });

  it("draws only the belief's normal a turn when no taker can come, and nothing for a re-post", () => {
    const t = bare();
    const probe = Random.load(t.random.save());
    t.fair.set('X', 1010);
    t.run(1000);
    for (let i = 0; i < 1000 / (DT * 5); i++) probe.normal();
    expect(t.random.save()).toBe(probe.save());
  });
});

/** The game's own content with no rivals, and the options venue's quoter changed. */
function content(quoter: Partial<NonNullable<ExchangeSpec['quoter']>> | null): Content {
  return {
    ...CONTENT,
    competitors: [],
    exchanges: CONTENT.exchanges.map((e) =>
      e.id === POX.id ? { ...e, ...(quoter === null ? {} : { quoter: { ...e.quoter!, ...quoter } }) } : e,
    ),
  };
}

function optGame(seed: number, c: Content): Game {
  const g = new Game(c, seed);
  g.openDesk(OPTIONS_DESK);
  for (const b of g.firm.blocks) b.enabled = false;
  g.skipToOpen();
  return g;
}

const options = (g: Game): InstrumentSpec[] => g.market.instruments.filter(isOption);
const clone = (g: Game): Game => Game.load(g.content, JSON.parse(JSON.stringify(g.save())) as SavedGame);
const run = (g: Game, until: number, stride = 2) => {
  while (g.now < until) g.step(Math.min(stride, until - g.now));
};

describe('the options desk, quoted', () => {
  it('is set on the Prairie Options Exchange and on no other venue', () => {
    const q = POX.quoter!;
    expect(q.halfSpreadVol).toBeGreaterThan(0);
    expect(q.size).toBeGreaterThan(0);
    expect(q.takeRate).toBeGreaterThan(0);
    for (const e of CONTENT.exchanges) if (e.id !== POX.id) expect(e.quoter).toBeUndefined();
  });

  it('shows every option a two-sided market of one order a side, and the spread widens with vega', () => {
    const g = optGame(1, content(null));
    run(g, g.now + 5 * MIN);
    const venue = g.market.venue(POX.id);
    let widest = 0;
    let narrowest = Infinity;
    for (const o of options(g)) {
      const book = venue.stocks.get(o.symbol)!.book;
      const bg = book.resting(BACKGROUND);
      expect(bg.length).toBeLessThanOrEqual(2);
      const q = book.quote();
      expect(q.ask).not.toBeNull();
      if (q.bid !== null) {
        widest = Math.max(widest, q.ask! - q.bid);
        narrowest = Math.min(narrowest, q.ask! - q.bid);
      }
    }
    expect(narrowest).toBeGreaterThanOrEqual(1);
    expect(widest).toBeGreaterThan(narrowest);
  }, 120_000);

  it('sends nothing in closed hours: the books are empty from the close to the next open', () => {
    const g = optGame(2, content(null));
    run(g, at(0, 16 * H) - 60_000, 1000);
    run(g, at(0, 16 * H) + 1000, 10);
    const venue = g.market.venue(POX.id);
    for (const o of options(g)) expect(venue.stocks.get(o.symbol)?.book.count() ?? 0).toBe(0);
    run(g, at(0, 20 * H), 50);
    for (const o of options(g)) expect(venue.stocks.get(o.symbol)?.book.count() ?? 0).toBe(0);
  }, 120_000);

  it('draws its takers from crowd:POX alone: every other stream, fair value and book is as without them', () => {
    const quiet = optGame(3, content({ takeRate: 0 }));
    const busy = optGame(3, content({ takeRate: 5 }));
    run(quiet, quiet.now + 3 * MIN);
    run(busy, busy.now + 3 * MIN);
    const a = quiet.save();
    const b = busy.save();
    // Streams: only crowd:POX differs.
    const sa = a.streams as unknown as { crowd: Record<string, unknown>; [k: string]: unknown };
    const sb = b.streams as unknown as { crowd: Record<string, unknown>; [k: string]: unknown };
    expect(sb.crowd[POX.id]).not.toEqual(sa.crowd[POX.id]);
    for (const k of Object.keys(sa.crowd)) if (k !== POX.id) expect(sb.crowd[k]).toEqual(sa.crowd[k]);
    const { crowd: _ca, ...restA } = sa;
    const { crowd: _cb, ...restB } = sb;
    expect(restB).toEqual(restA);
    // The market: fair values, anchors, volatility and every other venue's books.
    expect(b.market.fair).toEqual(a.market.fair);
    expect(b.market.vol).toEqual(a.market.vol);
    for (const [id, ex] of Object.entries(a.market.exchanges)) {
      if (id !== POX.id) expect(b.market.exchanges[id]).toEqual(ex);
    }
    expect(b.news).toEqual(a.news);
    // And the takers did trade there.
    const tapes = (g: Game) =>
      options(g).reduce((n, o) => n + g.market.venue(POX.id).stocks.get(o.symbol)!.tape.length, 0);
    expect(tapes(busy)).toBeGreaterThan(tapes(quiet));
  }, 240_000);

  it('replays: the same seed gives the same game with the desk open', () => {
    const play = () => {
      const g = optGame(9, content(null));
      run(g, g.now + 2 * MIN);
      return g;
    };
    expect(play().fingerprint()).toBe(play().fingerprint());
  }, 240_000);

  it('loads a save from the previous tick to the same future, mid-quote and across the close', () => {
    const g = optGame(6, content({ takeRate: 4 }));
    run(g, g.now + MIN);
    const back = clone(g);
    expect(back.fingerprint()).toBe(g.fingerprint());
    for (let i = 0; i < 2500; i++) {
      g.step(2);
      back.step(2);
      if (i % 500 === 0) expect(back.fingerprint()).toBe(g.fingerprint());
    }
    expect(back.fingerprint()).toBe(g.fingerprint());
    // Across the 16:00 close, from three seconds before it.
    run(g, at(0, 16 * H) - 3000, 1000);
    const late = clone(g);
    for (let i = 0; i < 2500; i++) {
      g.step(2);
      late.step(2);
    }
    expect(late.fingerprint()).toBe(g.fingerprint());
  }, 240_000);
});
