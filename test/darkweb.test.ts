import { MARKET_OPEN, MS_PER_DAY } from '../src/sim/clock';
import { DarkWeb, HEAT_FINE_LINE, HEAT_PER_TIP } from '../src/sim/darkweb';
import { Firm } from '../src/sim/firm';
import { Market } from '../src/sim/market';
import { News } from '../src/sim/news';
import { Random } from '../src/sim/random';
import { EXCHANGES, SLOW, STOCKS, TEMPLATES } from './fixtures';

function setup(seed: number) {
  const market = new Market(STOCKS, EXCHANGES);
  const news = new News(TEMPLATES, STOCKS);
  const random = new Random(seed);
  const firm = new Firm('firm', 'Mine', 100_000_000, SLOW, Firm.defaultBlocks());
  const dark = new DarkWeb();
  news.step(MARKET_OPEN, market, random);
  return { market, news, random, firm, dark };
}

describe('DarkWeb', () => {
  it('offers nothing until unlocked, then three tips at a time', () => {
    const { news, random, firm, dark } = setup(41);
    dark.step(MARKET_OPEN, firm, news, random);
    expect(dark.offers).toHaveLength(0);
    dark.unlocked = true;
    dark.step(MARKET_OPEN, firm, news, random);
    expect(dark.offers).toHaveLength(3);
    for (const t of dark.offers) expect(t.at).toBeGreaterThan(MARKET_OPEN);
  });

  it('sells some real leaks and some lies', () => {
    const { news, random, firm, dark } = setup(42);
    dark.unlocked = true;
    const seen = { real: 0, fake: 0 };
    for (let i = 0; i < 40; i++) {
      dark.step(MARKET_OPEN + i * 1000, firm, news, random);
      for (const t of [...dark.offers]) {
        if (t.headlineId === null) seen.fake++;
        else {
          seen.real++;
          expect(news.scheduled.some((h) => h.id === t.headlineId && h.text === t.text)).toBe(true);
        }
        dark.buy(t.id, firm);
      }
    }
    expect(seen.real).toBeGreaterThan(5);
    expect(seen.fake).toBeGreaterThan(2);
  });

  it('charges for a tip and raises the heat', () => {
    const { news, random, firm, dark } = setup(43);
    dark.unlocked = true;
    dark.step(MARKET_OPEN, firm, news, random);
    const tip = dark.offers[0]!;
    const cash = firm.cash;
    dark.buy(tip.id, firm);
    expect(firm.cash).toBe(cash - tip.price);
    expect(firm.heat).toBe(HEAT_PER_TIP);
    expect(dark.offers.find((t) => t.id === tip.id)).toBeUndefined();
    expect(() => dark.buy(tip.id, firm)).toThrow();
  });

  it('cools the heat each day, and fines a hot firm sooner or later', () => {
    const { news, random, firm, dark } = setup(44);
    dark.step(MARKET_OPEN, firm, news, random);
    firm.heat = 10;
    dark.step(MS_PER_DAY + MARKET_OPEN, firm, news, random);
    expect(firm.heat).toBeCloseTo(8.5);
    firm.heat = HEAT_FINE_LINE * 3;
    let fined = 0;
    for (let day = 2; day < 30 && fined === 0; day++) {
      firm.heat = HEAT_FINE_LINE * 3;
      dark.step(day * MS_PER_DAY + MARKET_OPEN, firm, news, random);
      fined = dark.fines.length;
    }
    expect(fined).toBe(1);
    expect(firm.finesPaid).toBeGreaterThan(0);
    expect(firm.cash).toBe(100_000_000 - firm.finesPaid);
  });

  it('saves and loads', () => {
    const { news, random, firm, dark } = setup(45);
    dark.unlocked = true;
    dark.step(MARKET_OPEN, firm, news, random);
    const copy = new DarkWeb();
    copy.load(JSON.parse(JSON.stringify(dark.save())) as ReturnType<DarkWeb['save']>);
    expect(copy.offers).toEqual(dark.offers);
    expect(copy.unlocked).toBe(true);
  });
});
