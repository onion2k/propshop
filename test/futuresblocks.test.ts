import { CONTENT } from '../src/content';
import { Game, MS_PER_DAY, MS_PER_HOUR, TICK_MS, type SavedGame } from '../src/sim';
import { infrastructureFrom } from '../src/sim/upgrades';
import { blockById, paramsFrom, type Intent, type MarketView, type SeenQuote } from '../src/sim/strategy';

function quote(bid: number, ask: number, size = 500): SeenQuote {
  return {
    bid,
    ask,
    bidSize: size,
    askSize: size,
    bid2: bid - 1,
    ask2: ask + 1,
    bid2Size: size,
    ask2Size: size,
    at: 0,
  };
}

const NOW = 10 * MS_PER_HOUR;
const WEEK_OUT = NOW + 7 * MS_PER_DAY;
/** The near contract a week out at 3.5% carry: its fair price is the index times this. */
const K = 1 + (0.035 * 7) / 365;

/** The index at 5,300/5,301 on HARBOR and its future on the Prairie Board, fairly priced, unless told otherwise. */
function view(over: { future?: SeenQuote; index?: SeenQuote } & Partial<MarketView> = {}): MarketView {
  const { future, index, ...rest } = over;
  const fair = Math.round(5300.5 * K);
  return {
    now: NOW,
    symbols: ['IXF1', 'IXF2', 'IDX'],
    sectors: { IDX: 'index', IXF1: 'index future', IXF2: 'index future' },
    constituents: {},
    exchanges: ['HARBOR', 'PRAIRIE'],
    quotes: {
      HARBOR: { IDX: index ?? quote(5300, 5301) },
      PRAIRIE: { IXF1: future ?? quote(fair, fair + 1), IXF2: quote(fair + 4, fair + 5) },
    },
    tape: {},
    depth: {},
    fees: { HARBOR: 0.3, PRAIRIE: 0.5 },
    latency: { HARBOR: 1, PRAIRIE: 9 },
    mids: {},
    positions: {},
    blockPositions: {},
    cash: 20_000_000,
    openOrders: [],
    recentFills: [],
    news: [],
    contracts: {
      IXF1: { underlying: 'IDX', expiry: WEEK_OUT, carry: 0.035, multiplier: 100 },
      IXF2: { underlying: 'IDX', expiry: WEEK_OUT + 7 * MS_PER_DAY, carry: 0.035, multiplier: 100 },
    },
    ...rest,
  };
}

const orders = (xs: Intent[]) =>
  xs.flatMap((o) => (o.kind === 'order' ? [`${o.side} ${o.size} ${o.symbol}@${o.price} ${o.exchange}`] : []));

describe('basis arbitrage', () => {
  const b = blockById('basisArb');
  const p = paramsFrom(b.spec);

  it('does nothing while the future is the index carried to expiry', () => {
    expect(b.decide(view(), p)).toEqual([]);
  });

  it('sells a rich future and buys its index, a hundred index shares a contract', () => {
    expect(orders(b.decide(view({ future: quote(5315, 5316) }), p))).toEqual([
      'sell 1 IXF1@5315 PRAIRIE',
      'buy 100 IDX@5301 HARBOR',
    ]);
  });

  it('buys a cheap future and sells its index', () => {
    expect(orders(b.decide(view({ future: quote(5289, 5290) }), p))).toEqual([
      'buy 1 IXF1@5290 PRAIRIE',
      'sell 100 IDX@5300 HARBOR',
    ]);
  });

  it('unwinds both legs once the basis is back', () => {
    const held = view({ blockPositions: { basisArb: { IXF1: -1, IDX: 100 } }, positions: { IXF1: -1, IDX: 100 } });
    expect(orders(b.decide(held, p)).sort()).toEqual(
      [`buy 1 IXF1@${Math.round(5300.5 * K) + 1} PRAIRIE`, 'sell 100 IDX@5300 HARBOR'].sort(),
    );
  });
});

describe('lead-lag', () => {
  const b = blockById('leadLag');
  const p = paramsFrom(b.spec);

  it('does nothing while the index is where the future says', () => {
    expect(b.decide(view(), p)).toEqual([]);
  });

  it('buys the index when the future says it is going up, and trades nothing on the future', () => {
    expect(orders(b.decide(view({ future: quote(5320, 5321) }), p))).toEqual([`buy ${p.shares} IDX@5301 HARBOR`]);
  });

  it('sells the index when the future says it is going down', () => {
    expect(orders(b.decide(view({ future: quote(5280, 5281) }), p))).toEqual([`sell ${p.shares} IDX@5300 HARBOR`]);
  });

  it('gets out once the index has caught up', () => {
    const held = view({ blockPositions: { leadLag: { IDX: 1000 } }, positions: { IDX: 1000 } });
    expect(orders(b.decide(held, p))).toEqual(['sell 500 IDX@5300 HARBOR']);
  });
});

describe('roll', () => {
  const b = blockById('roll');
  const p = paramsFrom(b.spec);

  it('holds the near contract', () => {
    expect(orders(b.decide(view(), p))).toEqual([`buy 1 IXF1@${Math.round(5300.5 * K) + 1} PRAIRIE`]);
  });

  it('moves to the next contract within its roll window before expiry', () => {
    const late = view({
      now: WEEK_OUT - 2 * MS_PER_HOUR,
      blockPositions: { roll: { IXF1: 1 } },
      positions: { IXF1: 1 },
    });
    const fair = Math.round(5300.5 * K);
    expect(orders(b.decide(late, p)).sort()).toEqual(
      [`buy 1 IXF2@${fair + 5} PRAIRIE`, `sell 1 IXF1@${fair} PRAIRIE`].sort(),
    );
  });
});

describe("the firm's view", () => {
  it('carries each listed contract, its underlying, expiry, carry and multiplier, once the desk is open', () => {
    const viewOf = (g: Game) =>
      (g.firm as unknown as { view(now: number, m: Game['market'], n: []): MarketView }).view(g.now, g.market, []);
    const closed = new Game(CONTENT, 2);
    expect(viewOf(closed).contracts ?? {}).toEqual({});
    const g = new Game(CONTENT, 2);
    g.openDesk('futures');
    const c = viewOf(g).contracts!;
    expect(Object.keys(c)).toEqual(g.market.live('IXF'));
    expect(c[g.market.live('IXF')[0]!]).toEqual({
      underlying: 'IDX',
      expiry: 4 * MS_PER_DAY + 16 * MS_PER_HOUR,
      carry: 0.035,
      multiplier: 100,
    });
  });

  it('gives a firm the desk blocks when the desk opens, off, and keeps them across a save', () => {
    const g = new Game(CONTENT, 2);
    const ids = () => g.firm.blocks.map((b) => b.id);
    expect(ids()).not.toContain('basisArb');
    g.openDesk('futures');
    expect(ids()).toEqual(expect.arrayContaining(['basisArb', 'leadLag', 'roll']));
    expect(g.firm.blocks.filter((b) => ['basisArb', 'leadLag', 'roll'].includes(b.id)).every((b) => !b.enabled)).toBe(
      true,
    );
    const back = Game.load(CONTENT, JSON.parse(JSON.stringify(g.save())) as SavedGame);
    expect(back.firm.blocks.map((b) => b.id)).toEqual(ids());
  });
});

describe('lead-lag in a live game', () => {
  it('buys the index from a rack at the Prairie Board after the market jumps, before the index catches up', () => {
    const g = new Game(CONTENT, 6);
    g.openDesk('futures');
    g.firm.infra = infrastructureFrom(CONTENT, { location: 'colo-prairie', network: 'microwave', computer: 'rack' });
    for (const b of g.firm.blocks) b.enabled = b.id === 'leadLag';
    g.firm.setWatch(['IDX', ...g.market.live('IXF')]);
    g.skipToOpen();
    g.stepTicks((5 * 60_000) / TICK_MS);
    const fillsBefore = g.firm.fills.filter((f) => f.block === 'leadLag').length;
    for (const s of CONTENT.stocks.filter((x) => !x.constituents))
      g.market.shock(s.symbol, Math.round(g.market.fair.get(s.symbol)! * 0.01), 10);
    g.stepTicks(1000);
    const bought = g.firm.fills.filter((f) => f.block === 'leadLag' && f.symbol === 'IDX' && f.side === 'buy');
    expect(bought.length).toBeGreaterThan(0);
    expect(g.firm.fills.filter((f) => f.block === 'leadLag').length).toBeGreaterThan(fillsBefore);
  }, 120_000);
});
