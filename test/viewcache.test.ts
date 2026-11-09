// The view a firm decides on is built from things kept between decisions (plans/desk-speed.md): the watch list's
// plan, the latencies, the records of a firm's holdings and orders, and what the market builds once for every firm.
// Each is good only while what it was made from is, so these play a game with the change in it (a desk opened, a
// watch list or a computer changed, a contract rolling, a save loaded, a venue's bump moved) and, at some builds
// of every firm's view, work out what the view should be from the firm and the market as they stand and compare.
import { CONTENT } from '../src/content';
import { Game, MS_PER_HOUR, MS_PER_MINUTE, TICK_MS } from '../src/sim';
import { Firm } from '../src/sim/firm';
import { STOCKS_DESK, deskOf, inHome, isCarried } from '../src/sim/instrument';
import type { Market } from '../src/sim/market';
import { BLOCKS, type MarketView, type SeenDepth, type SeenQuote } from '../src/sim/strategy';
import { TAPE_VIEW } from '../src/sim/strategy';
import { infrastructureFrom } from '../src/sim/upgrades';
import type { Headline } from '../src/sim/types';
import { IXF } from '../src/content/futures';

type Build = (
  now: number,
  market: Market,
  news: readonly Headline[],
  include?: readonly string[],
) => { view: MarketView };

/** What the view's quotes, tape and the rest should be, worked out afresh from the firm and the market. */
function expected(firm: Firm, _view: MarketView, market: Market, now: number) {
  const f = firm as unknown as { desks: readonly string[] | null };
  const live = f.desks === null ? market.stocks : market.stocks.filter((s) => f.desks!.includes(deskOf(s)));
  const symbols = firm.watching(live.map((s) => s.symbol));
  const watched = market.stocks.filter((s) => symbols.includes(s.symbol));
  const quotes: Record<string, Record<string, SeenQuote>> = {};
  for (const e of market.exchanges) {
    const seen = now - firm.dataLatency(e.id);
    const per: Record<string, SeenQuote> = {};
    for (const s of watched) {
      const q = e.quoteAsOf(s.symbol, seen);
      if (q) per[s.symbol] = q;
    }
    quotes[e.id] = per;
  }
  const sectors: Record<string, string> = {};
  const constituents: Record<string, readonly string[]> = {};
  const contracts: Record<string, unknown> = {};
  const pairs: Record<string, unknown> = {};
  for (const s of market.stocks) {
    sectors[s.symbol] = s.sector;
    if (s.constituents) constituents[s.symbol] = s.constituents;
    if (isCarried(s))
      contracts[s.symbol] = {
        underlying: s.underlying,
        expiry: s.expiry,
        carry: s.carry,
        multiplier: s.multiplier ?? 1,
      };
    const pair = market.fx.get(s.symbol);
    if (pair) {
      const scale = market.crossScale.get(s.symbol);
      pairs[s.symbol] = {
        base: pair.base,
        quote: pair.quote,
        units: pair.units,
        scale: market.scales.get(s.symbol) ?? 1,
        pointValue: inHome(pair.quote, market.scales.get(s.symbol) ?? 1, market.rates),
        venues: market.venuesOf(s.symbol).map((e) => e.id),
        ...(s.cross && scale !== undefined ? { cross: { legs: s.cross, scale } } : {}),
      };
    }
  }
  const roll = market.rollover;
  const rollover =
    roll && Object.keys(pairs).length > 0
      ? { at: roll.at, spread: roll.spread, basis: roll.basis, rates: Object.fromEntries(market.yearly) }
      : undefined;
  const latency: Record<string, number> = {};
  for (const e of market.exchanges) latency[e.id] = firm.latency(e.id);
  const open = [...firm.orders.values()].filter(
    (o) => o.status === 'inflight' || o.status === 'resting' || o.status === 'cancelling',
  );
  const tape: Record<string, Record<string, unknown>> = {};
  const depth: Record<string, Record<string, SeenDepth>> = {};
  for (const e of market.exchanges) {
    const seen = now - firm.dataLatency(e.id);
    tape[e.id] = {};
    depth[e.id] = {};
    for (const s of watched) {
      if (e.lists(s.symbol)) tape[e.id]![s.symbol] = e.tapeAsOf(s.symbol, seen, TAPE_VIEW);
      const q = quotes[e.id]?.[s.symbol];
      if (q) depth[e.id]![s.symbol] = depthOf(q);
    }
  }
  return {
    symbols,
    quotes,
    sectors,
    constituents,
    contracts,
    pairs,
    rollover,
    latency,
    open,
    tape,
    depth,
    blockPositions: Object.fromEntries([...firm.blockPositions].map(([b, m]) => [b, Object.fromEntries(m)])),
    blockCosts: Object.fromEntries([...firm.blockCosts].map(([b, m]) => [b, Object.fromEntries(m)])),
    mids: Object.fromEntries(firm.mids),
    exchanges: market.exchanges.map((e) => e.id),
  };
}

/** The depth a quote shows, as the firm works it out. */
function depthOf(q: SeenQuote & { depth?: SeenDepth }): SeenDepth {
  if (q.depth) return { bids: q.depth.bids.map((l) => ({ ...l })), asks: q.depth.asks.map((l) => ({ ...l })) };
  const side = (p1: number | null, s1: number, p2: number | null, s2: number) => [
    ...(p1 !== null ? [{ price: p1, size: s1, largest: s1 }] : []),
    ...(p2 !== null ? [{ price: p2, size: s2, largest: s2 }] : []),
  ];
  return { bids: side(q.bid, q.bidSize, q.bid2, q.bid2Size), asks: side(q.ask, q.askSize, q.ask2, q.ask2Size) };
}

/**
 * Watches every view built while `play` runs: one build in `every`, it is compared with what the firm and market
 * say it should be, and the shared pieces are written down to see that no block (or anything else) changed them.
 */
function watching(every: number, play: () => void, market: () => Market): { checked: number; changed: string[] } {
  const proto = Firm.prototype as unknown as { build: Build };
  const original = proto.build;
  const frozen = new Map<object, string>();
  const decides = new Map<(typeof BLOCKS)[number], (typeof BLOCKS)[number]['decide']>();
  let calls = 0;
  let n = 0;
  let checked = 0;
  proto.build = function (this: Firm, now, m, news, include) {
    const out = original.call(this, now, m, news, include);
    if (n++ % every === 0) {
      checked++;
      const want = expected(this, out.view, m, now);
      const v = out.view;
      expect(v.symbols).toEqual(want.symbols);
      expect(v.exchanges).toEqual(want.exchanges);
      expect(v.sectors).toEqual(want.sectors);
      expect(v.constituents).toEqual(want.constituents);
      expect(v.contracts).toEqual(want.contracts);
      expect(v.pairs ?? {}).toEqual(want.pairs);
      expect(v.rollover).toEqual(want.rollover);
      expect(v.latency).toEqual(want.latency);
      expect(v.openOrders).toEqual(want.open);
      expect(v.blockPositions).toEqual(want.blockPositions);
      expect(v.blockCosts ?? {}).toEqual(want.blockCosts);
      expect(v.mids).toEqual(want.mids);
      expect(v.quotes).toEqual(want.quotes);
      for (const e of Object.keys(want.quotes)) expect(Object.keys(v.quotes[e]!)).toEqual(Object.keys(want.quotes[e]!));
      expect(v.tape).toEqual(want.tape);
      expect(v.depth).toEqual(want.depth);
      for (const part of [v.sectors, v.constituents, v.contracts, v.pairs, v.rollover, v.exchanges, v.latency]) {
        if (part && !frozen.has(part)) frozen.set(part, JSON.stringify(part));
      }
      for (const part of [v.blockPositions, v.blockCosts, ...Object.values(v.quotes)]) {
        if (part && !frozen.has(part)) frozen.set(part, JSON.stringify(part));
      }
    }
    return out;
  };
  // A block is shown the view narrowed to the stocks and its own desk: its symbols are those, in the view's order.
  for (const b of BLOCKS) {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- called back with its own block as `this`
    const decide = b.decide;
    decides.set(b, decide);
    b.decide = function (this: unknown, view, params) {
      if (calls++ % 5 === 0) {
        const own = view.symbols.filter((s) => {
          const d = deskOf(market().stock(s));
          return d === STOCKS_DESK || d === deskOfBlock(b.spec.id);
        });
        expect([...view.symbols]).toEqual(own);
      }
      return decide.call(this, view, params);
    };
  }
  try {
    play();
  } finally {
    proto.build = original;
    for (const [b, d] of decides) b.decide = d;
  }
  const changed = [...frozen]
    .filter(([part, json]) => JSON.stringify(part) !== json)
    .map(([, json]) => json.slice(0, 80));
  return { checked, changed };
}

function deskOfBlock(id: string): string {
  if (['basisArb', 'leadLag', 'roll'].includes(id)) return 'futures';
  if (['triangle', 'carry'].includes(id)) return 'fx';
  return STOCKS_DESK;
}

const RACK = { location: 'colo-harbor', network: 'microwave', computer: 'rack' };
const ON = ['momentum', 'arbitrage', 'marketMaker', 'basisArb', 'leadLag', 'carry', 'triangle', 'anticipate'];

function rackGame(content = CONTENT, seed = 3): Game {
  const g = new Game(content, seed);
  g.firm.infra = infrastructureFrom(content, RACK);
  for (const b of g.firm.blocks) b.enabled = ON.includes(b.id);
  return g;
}

const minutes = (m: number) => (m * MS_PER_MINUTE) / TICK_MS;

describe('the view a firm decides on, built from what is kept', () => {
  it('is what a fresh build would give, with both desks open, for the player and every rival', () => {
    const g = rackGame();
    g.openDesk('futures');
    g.openDesk('fx');
    g.skipToOpen();
    const r = watching(
      9,
      () => {
        g.stepTicks(minutes(3));
        g.hand({ symbol: 'QNT', side: 'buy', size: 3000, exchange: 'best', type: 'market' });
        g.stepTicks(minutes(1));
      },
      () => g.market,
    );
    expect(r.checked).toBeGreaterThan(1000);
    expect(r.changed).toEqual([]);
    expect(g.firm.stats.fillsReceived).toBeGreaterThan(0);
  }, 240_000);

  it('follows a desk opened mid-game, and the watch list and computer changed under it', () => {
    const g = rackGame();
    g.skipToOpen();
    const r = watching(
      7,
      () => {
        g.stepTicks(minutes(1));
        g.openDesk('futures');
        g.stepTicks(minutes(1));
        g.openDesk('fx');
        g.stepTicks(minutes(1));
        g.firm.setWatch(['IDX', 'QNT', 'EURUSD', ...g.market.live('IXF')]);
        g.stepTicks(minutes(1));
        // The firm's own list changed in place, as a test may leave it.
        g.firm.watch.push('USDJPY');
        g.stepTicks(minutes(1));
        g.firm.infra = infrastructureFrom(CONTENT, { location: 'home', network: 'consumer', computer: 'laptop' });
        g.stepTicks(minutes(1));
        g.firm.setWatch([]);
        g.firm.infra = infrastructureFrom(CONTENT, RACK);
        g.stepTicks(minutes(1));
        // A venue puts a speed bump in.
        g.market.exchange('HARBOR').rules.speedBumpMs = 5;
        g.stepTicks(minutes(1));
      },
      () => g.market,
    );
    expect(r.checked).toBeGreaterThan(500);
    expect(r.changed).toEqual([]);
  }, 240_000);

  it('follows contracts listed and expired as time passes', () => {
    // A contract a few minutes long: one expires, and the next is listed, again and again.
    const content = {
      ...CONTENT,
      series: [{ ...IXF, period: 3 * MS_PER_MINUTE, expiresAt: 9.5 * MS_PER_HOUR + MS_PER_MINUTE }],
    };
    const g = rackGame(content);
    g.openDesk('futures');
    g.skipToOpen();
    const before = g.market.live('IXF').join();
    const r = watching(
      9,
      () => g.stepTicks(minutes(8)),
      () => g.market,
    );
    expect(g.market.live('IXF').join()).not.toBe(before);
    expect(r.checked).toBeGreaterThan(500);
    expect(r.changed).toEqual([]);
  }, 240_000);

  it('starts from nothing in a game loaded from a save, and goes on exactly as the game it came from', () => {
    const g = rackGame();
    g.openDesk('futures');
    g.openDesk('fx');
    g.skipToOpen();
    g.stepTicks(minutes(2));
    const copy = Game.load(CONTENT, structuredClone(g.save()));
    let a = '';
    let b = '';
    const r = watching(
      11,
      () => {
        g.stepTicks(minutes(2));
        copy.stepTicks(minutes(2));
        a = g.fingerprint();
        b = copy.fingerprint();
      },
      () => g.market,
    );
    expect(b).toBe(a);
    expect(r.checked).toBeGreaterThan(500);
    expect(r.changed).toEqual([]);
  }, 240_000);
});
