import { CONTENT } from '../src/content';
import { Game, MS_PER_MINUTE, TICK_MS, isMarketOpen, type SavedGame } from '../src/sim';
import { Market } from '../src/sim/market';
import { deriveStreams } from '../src/sim/random';
import { MARKET_OPEN } from '../src/sim/clock';
import { infrastructureFrom } from '../src/sim/upgrades';

const bySector = (sector: string) => CONTENT.stocks.filter((s) => s.sector === sector).map((s) => s.symbol);

describe('the universe', () => {
  it('has twelve stocks in four sectors and an index over all of them', () => {
    const stocks = CONTENT.stocks.filter((s) => !s.constituents);
    expect(stocks).toHaveLength(12);
    expect(new Set(stocks.map((s) => s.sector)).size).toBe(4);
    const index = CONTENT.stocks.find((s) => s.constituents)!;
    expect(index.constituents).toHaveLength(12);
    expect(index.constituents).toEqual(stocks.map((s) => s.symbol));
  });

  it('prices the index at the average of its constituents, every tick', () => {
    const m = new Market(CONTENT.stocks, CONTENT.exchanges, CONTENT.factors);
    const random = deriveStreams(
      1,
      CONTENT.exchanges.map((e) => e.id),
    );
    const index = CONTENT.stocks.find((s) => s.constituents)!;
    const average = () => index.constituents!.reduce((a, c) => a + m.fair.get(c)!, 0) / index.constituents!.length;
    expect(m.fair.get('IDX')).toBeCloseTo(average(), 6);
    for (let i = 0; i < 2000; i++) m.step(MARKET_OPEN + i * TICK_MS, TICK_MS, random.world, random.crowd);
    expect(m.fair.get('IDX')).toBeCloseTo(average(), 6);
    expect(m.fair.get('IDX')).not.toBe(index.startPrice);
  });

  it('moves stocks of one sector together more than stocks of different sectors', { timeout: 120_000 }, () => {
    // Returns over a minute, many minutes, with the crowd off: the factors alone.
    const m = new Market(CONTENT.stocks, CONTENT.exchanges, CONTENT.factors);
    const random = deriveStreams(
      2,
      CONTENT.exchanges.map((e) => e.id),
    );
    const symbols = CONTENT.stocks.filter((s) => !s.constituents).map((s) => s.symbol);
    const series: Record<string, number[]> = Object.fromEntries(symbols.map((s) => [s, []]));
    let now = 0;
    for (let k = 0; k < 400; k++) {
      const before = Object.fromEntries(symbols.map((s) => [s, m.fair.get(s)!]));
      for (let i = 0; i < 30; i++, now += 1000) m.step(now, 1000, random.world, random.crowd);
      for (const s of symbols) series[s]!.push(Math.log(m.fair.get(s)! / before[s]!));
    }
    const corr = (a: number[], b: number[]) => {
      const ma = a.reduce((x, y) => x + y, 0) / a.length;
      const mb = b.reduce((x, y) => x + y, 0) / b.length;
      let num = 0;
      let da = 0;
      let db = 0;
      for (let i = 0; i < a.length; i++) {
        num += (a[i]! - ma) * (b[i]! - mb);
        da += (a[i]! - ma) ** 2;
        db += (b[i]! - mb) ** 2;
      }
      return num / Math.sqrt(da * db);
    };
    const tech = bySector('technology');
    const util = bySector('utilities');
    const within = corr(series[tech[0]!]!, series[tech[1]!]!);
    const across = corr(series[tech[0]!]!, series[util[0]!]!);
    expect(within).toBeGreaterThan(0.15);
    expect(within).toBeGreaterThan(across + 0.1);
    expect(across).toBeGreaterThan(-0.2);
  });

  it('lets a firm watch only as many symbols as its computer allows, and saves the list', () => {
    const g = new Game(CONTENT, 3);
    const all = CONTENT.stocks.map((s) => s.symbol);
    expect(g.firm.infra.computer.maxSymbols).toBe(4);
    expect(g.firm.watching(all)).toEqual(all.slice(0, 4));
    expect(g.snapshot().watching).toEqual({ count: 4, max: 4 });
    g.setWatch('ABC', false);
    g.setWatch('IDX', true);
    expect(g.firm.watching(all)).toEqual(['QNT', 'LMN', 'VRT', 'IDX']);
    g.setWatch('MNO', true);
    // A fifth is kept on the list but the laptop looks at four.
    expect(g.firm.watch).toHaveLength(5);
    expect(g.firm.watching(all)).toHaveLength(4);
    g.firm.infra = infrastructureFrom(CONTENT, { location: 'home', network: 'consumer', computer: 'rack' });
    expect(g.firm.watching(all)).toHaveLength(5);
    const b = Game.load(CONTENT, JSON.parse(JSON.stringify(g.save())) as SavedGame);
    expect(b.firm.watch).toEqual(g.firm.watch);
    expect(
      b
        .snapshot()
        .stocks.filter((s) => s.watched)
        .map((s) => s.symbol),
    ).toEqual(['QNT', 'LMN', 'VRT', 'MNO', 'IDX']);
  });

  it('shows the blocks only what is watched', () => {
    const g = new Game(CONTENT, 4);
    g.setBlock('arbitrage', { enabled: false });
    g.setBlock('momentum', { enabled: false });
    g.setBlock('script', { enabled: true, source: 'log(symbols.join(","))' });
    g.firm.setWatch(['MNO', 'XYZ']);
    g.skipToOpen();
    while (!isMarketOpen(g.now)) g.step();
    for (let i = 0; i < MS_PER_MINUTE / 10 / TICK_MS; i++) g.step();
    expect(g.snapshot().script.log[0]).toBe('MNO,XYZ');
    expect(g.snapshot().stocks.find((s) => s.symbol === 'MNO')?.dayChange).not.toBeNull();
  });
});
