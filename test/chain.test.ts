// The options chain as the Market page reads it (src/ui/options.ts): rows by strike, a call and a put for each expiry,
// implied volatility inverted from the book's middle, delta from the model, the straddle's move, and the watch list
// the chain's shortcut writes. Pure working over the snapshot.
import { CONTENT } from '../src/content';
import { OPTIONS_DESK } from '../src/content/options';
import { Game, MS_PER_DAY, MS_PER_HOUR, MS_PER_YEAR, type Content, type Snapshot } from '../src/sim';
import { delta, impliedFrom, skewed, tradingVol } from '../src/sim/options';
import { infrastructureFrom } from '../src/sim/upgrades';
import { chainOf, straddleOf, timeToGo, watchChain } from '../src/ui/options';

const H = MS_PER_HOUR;
const at = (d: number, ms: number) => d * MS_PER_DAY + ms;
const NO_RIVALS: Content = { ...CONTENT, competitors: [] };

function snap(desks: string[] = [OPTIONS_DESK], seed = 1, until = at(0, 10 * H + 30 * 60_000)): Snapshot {
  const g = new Game(NO_RIVALS, seed);
  for (const d of desks) g.openDesk(d);
  for (const b of g.firm.blocks) b.enabled = false;
  while (g.now < until) g.step(Math.min(1000, until - g.now));
  return g.snapshot();
}

describe('timeToGo', () => {
  it('says hours and minutes, then minutes and seconds, then seconds, then that it is over', () => {
    expect(timeToGo(5 * H + 30 * 60_000 + 20_000)).toBe('5h 30m');
    expect(timeToGo(42 * 60_000 + 10_000)).toBe('42m 10s');
    expect(timeToGo(58_000)).toBe('58s');
    expect(timeToGo(0)).toBe('expired');
    expect(timeToGo(-5)).toBe('expired');
  });
});

describe('chainOf', () => {
  const s = snap();
  const chain = chainOf(s)!;

  it('is nothing while the desk is closed', () => {
    expect(chainOf(snap([], 1, at(0, 7 * H)))).toBeUndefined();
  });

  it('is two expiries, soonest first, each three strikes by a call and a put, rows by strike', () => {
    expect(chain.expiries.map((e) => e.expiry)).toEqual([at(0, 16 * H), at(1, 16 * H)]);
    for (const e of chain.expiries) {
      expect(e.rows).toHaveLength(3);
      const strikes = e.rows.map((r) => r.strike);
      expect(strikes).toEqual([...strikes].sort((a, b) => a - b));
      expect(strikes[1]! - strikes[0]!).toBe(100);
      for (const r of e.rows) {
        expect(r.call!.symbol).toMatch(/^OC/);
        expect(r.put!.symbol).toMatch(/^OP/);
      }
    }
    expect(chain.expiries[0]!.left).toBe(at(0, 16 * H) - s.now);
  });

  it('reads each cell’s bid and ask as the firm sees them, and its watched state', () => {
    for (const e of chain.expiries)
      for (const r of e.rows)
        for (const c of [r.call!, r.put!]) {
          const st = s.stocks.find((x) => x.symbol === c.symbol)!;
          expect(c.bid).toBe(st.bid);
          expect(c.ask).toBe(st.ask);
          expect(c.watched).toBe(st.watched);
        }
  });

  it('inverts the implied volatility from the middle of the book, and takes delta from the model at it', () => {
    const t = (e: number) => (e - s.now) / MS_PER_YEAR;
    let checked = 0;
    for (const e of chain.expiries)
      for (const r of e.rows)
        for (const c of [r.call!, r.put!]) {
          if (c.bid === null || c.ask === null) continue;
          const right = c === r.call ? 'call' : 'put';
          const iv = impliedFrom(right, (c.bid + c.ask) / 2, chain.spot, r.strike, t(e.expiry), s.options!.rate);
          if (iv === null) {
            expect(c.iv).toBeNull();
            continue;
          }
          // Shown on the trading clock, as the realised figure is; the delta is the model's, on the calendar's.
          const shown = tradingVol(iv, s.now, e.expiry, s.options!.closedWeight);
          expect(c.iv).toBeCloseTo(shown, 12);
          expect(c.delta).toBeCloseTo(delta(right, chain.spot, r.strike, t(e.expiry), iv, s.options!.rate), 12);
          checked++;
        }
    expect(checked).toBeGreaterThanOrEqual(8);
    // A call's delta is between nought and one, a put's between minus one and nought.
    for (const e of chain.expiries)
      for (const r of e.rows) {
        if (r.call!.delta !== null) expect(r.call!.delta).toBeGreaterThanOrEqual(0);
        if (r.call!.delta !== null) expect(r.call!.delta).toBeLessThanOrEqual(1);
        if (r.put!.delta !== null) expect(r.put!.delta).toBeLessThanOrEqual(0);
        if (r.put!.delta !== null) expect(r.put!.delta).toBeGreaterThanOrEqual(-1);
      }
  });

  it('keeps a cell with no quote, with its figures empty rather than guessed', () => {
    const bare: Snapshot = {
      ...s,
      stocks: s.stocks.map((x) => (x.option ? { ...x, bid: null, ask: null } : x)),
    };
    const c = chainOf(bare)!;
    for (const e of c.expiries)
      for (const r of e.rows)
        for (const cell of [r.call!, r.put!]) {
          expect(cell.bid).toBeNull();
          expect(cell.iv).toBeNull();
          expect(cell.delta).toBeNull();
        }
  });
});

describe('the implied volatility on the trading clock', () => {
  it('converts by the time counted both ways: the same variance over trading years, not calendar ones', () => {
    // Ten past ten, six hours to the close: trading time is several times the calendar's, so the figure falls.
    const now = at(0, 10 * H);
    const expiry = at(0, 16 * H);
    const cal = 0.7;
    const out = tradingVol(cal, now, expiry, 0.07);
    expect(out).toBeLessThan(cal / 1.5);
    expect(out).toBeGreaterThan(cal / 4);
    // No time to go: nothing to convert.
    expect(tradingVol(cal, expiry, expiry, 0.07)).toBe(cal);
  });

  it('puts the at-the-money figure within two points of the market’s own, skew and releases counted', () => {
    const g = new Game(NO_RIVALS, 1);
    g.openDesk(OPTIONS_DESK);
    for (const b of g.firm.blocks) b.enabled = false;
    g.skipToOpen();
    while (g.now < at(0, 10 * H + 34 * 60_000)) g.step(1000);
    const s = g.snapshot();
    const chain = chainOf(s)!;
    for (const e of chain.expiries) {
      for (const row of e.rows) {
        for (const [right, cell] of [
          ['call', row.call],
          ['put', row.put],
        ] as const) {
          if (!cell || cell.iv === null) continue;
          const years = g.market.tradingYears(g.now, e.expiry);
          const atm = Math.sqrt(g.market.expiryVariance(e.expiry, g.now) / years);
          const forward = chain.spot * Math.exp(0.035 * ((e.expiry - g.now) / MS_PER_YEAR));
          const want = skewed(atm, row.strike, forward, 0.1);
          expect(Math.abs(cell.iv - want), `${right} ${cell.symbol}`).toBeLessThan(0.02 + 0.1 * want);
        }
      }
    }
    // The headline figure: the at-the-money implied against the realised is a few points, not forty.
    expect(chain.atmIv!).toBeGreaterThan(s.options!.atm * 0.8);
    expect(chain.atmIv!).toBeLessThan(s.options!.atm * 1.4);
    expect(chain.atmIv! - s.options!.realised).toBeLessThan(0.15);
  });
});

describe('straddleOf', () => {
  const s = snap();
  const chain = chainOf(s)!;

  it('is the soonest expiry’s call and put at the strike nearest the index, and the move it expects', () => {
    const x = straddleOf(chain)!;
    expect(x.expiry).toBe(at(0, 16 * H));
    const row = chain.expiries[0]!.rows.reduce((a, b) =>
      Math.abs(b.strike - chain.spot) < Math.abs(a.strike - chain.spot) ? b : a,
    );
    expect(x.strike).toBe(row.strike);
    const mid = (c: { bid: number | null; ask: number | null }) => (c.bid! + c.ask!) / 2;
    expect(x.price).toBeCloseTo(mid(row.call!) + mid(row.put!), 9);
    // The straddle's price is the move the market expects, in the index's points.
    expect(x.move).toBe(x.price);
    // About a day's move of an index near $53: some tens of cents to a dollar and a half.
    expect(x.price).toBeGreaterThan(20);
    expect(x.price).toBeLessThan(150);
  });

  it('falls back on the fair values where a book is empty', () => {
    const bare: Snapshot = { ...s, stocks: s.stocks.map((x) => (x.option ? { ...x, bid: null, ask: null } : x)) };
    const x = straddleOf(chainOf(bare)!)!;
    const row = chainOf(bare)!.expiries[0]!.rows.find((r) => r.strike === x.strike)!;
    const fair = (sym: string) => s.stocks.find((y) => y.symbol === sym)!.fair;
    expect(x.price).toBeCloseTo(fair(row.call!.symbol) + fair(row.put!.symbol), 9);
  });

  it('moves on to tomorrow’s once today’s has expired', () => {
    const late = snap([OPTIONS_DESK], 1, at(0, 16 * H) + 2_000);
    const x = straddleOf(chainOf(late)!)!;
    expect(x.expiry).toBeGreaterThan(late.now);
  });
});

describe('watchChain', () => {
  /** All four desks open, the Prairie rack, the watch list never touched: what a player finds on opening the desk. */
  function allDesks(): Snapshot {
    const g = new Game(NO_RIVALS, 5);
    for (const d of ['futures', 'fx', 'metals', OPTIONS_DESK]) g.openDesk(d);
    g.firm.infra = infrastructureFrom(CONTENT, { location: 'colo-prairie', network: 'microwave', computer: 'rack' });
    g.skipToOpen();
    return g.snapshot();
  }

  it('finds that a rack following twenty of thirty-nine symbols watches no option and not the second future', () => {
    const s = allDesks();
    const watched = s.stocks.filter((x) => x.watched).map((x) => x.symbol);
    expect(s.stocks).toHaveLength(39);
    expect(watched).toHaveLength(20);
    expect(watched.filter((w) => /^O[CP]/.test(w))).toEqual([]);
    expect(watched).toContain('IXF0');
    expect(watched).not.toContain('IXF1');
  });

  it('puts the index, its futures and every live option first, and fills the rest from what was watched', () => {
    const s = allDesks();
    const { watch, dropped } = watchChain(s);
    const opts = s.stocks.filter((x) => x.option).map((x) => x.symbol);
    expect(opts).toHaveLength(12);
    expect(watch).toHaveLength(20);
    expect(watch.slice(0, 3)).toEqual(['IDX', 'IXF0', 'IXF1']);
    for (const o of opts) expect(watch).toContain(o);
    // The five places left go to what was watched, in the order it was listed, leaving the index and futures out.
    expect(watch.slice(15)).toEqual(['ABC', 'QNT', 'LMN', 'VRT', 'XYZ']);
    // What it let go is said: the rest of what was watched.
    expect(dropped).toEqual([
      'GRD',
      'MNO',
      'BRL',
      'SOL',
      'HBK',
      'LKS',
      'PFI',
      'RDG',
      'EURUSD',
      'USDJPY',
      'EURJPY',
      'XAU',
      'XAG',
    ]);
    expect(new Set(watch).size).toBe(watch.length);
  });

  it('orders the options by expiry, then by how near the strike is to the index', () => {
    const s = allDesks();
    const { watch } = watchChain(s);
    const opts = watch.filter((w) => /^O[CP]/.test(w));
    const info = (sym: string) => s.stocks.find((x) => x.symbol === sym)!.option!;
    const spot = s.options!.spot;
    for (let i = 1; i < opts.length; i++) {
      const a = info(opts[i - 1]!);
      const b = info(opts[i]!);
      expect(a.expiry <= b.expiry).toBe(true);
      if (a.expiry === b.expiry) expect(Math.abs(a.strike - spot) <= Math.abs(b.strike - spot)).toBe(true);
    }
  });

  it('cuts to a small computer’s limit, the index first and then the nearest options', () => {
    const s = allDesks();
    const small: Snapshot = { ...s, watching: { ...s.watching, max: 4 } };
    const { watch } = watchChain(small);
    expect(watch).toHaveLength(4);
    expect(watch.slice(0, 3)).toEqual(['IDX', 'IXF0', 'IXF1']);
    expect(watch[3]).toMatch(/^O[CP]/);
  });
});
