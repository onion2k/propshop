import { MARKET_OPEN, MS_PER_DAY, MS_PER_HOUR, MS_PER_SECOND } from '../src/sim/clock';
import { Market } from '../src/sim/market';
import { News } from '../src/sim/news';
import { deriveStreams } from '../src/sim/random';
import { EXCHANGES, STOCKS, TEMPLATES, TICK } from './fixtures';

function setup(seed: number) {
  const market = new Market(STOCKS, EXCHANGES);
  const news = new News(TEMPLATES, STOCKS);
  const random = deriveStreams(
    seed,
    EXCHANGES.map((e) => e.id),
  );
  return { market, news, random };
}

describe('News', () => {
  it('schedules a day ahead and publishes when due, on weekdays only', () => {
    const { market, news, random } = setup(31);
    news.step(0, market, random.world);
    expect(news.scheduled.length).toBeGreaterThan(5);
    expect(news.scheduled.every((h) => h.at >= 0 && h.at < MS_PER_DAY)).toBe(true);
    const saturday = 5 * MS_PER_DAY;
    const { market: m2, news: n2, random: r2 } = setup(32);
    n2.step(saturday, m2, r2.world);
    expect(n2.scheduled.every((h) => h.at >= 6 * MS_PER_DAY)).toBe(true);
    expect(n2.scheduled.filter((h) => h.at < 7 * MS_PER_DAY)).toHaveLength(0);
  });

  it('moves the fair value of the stocks named, by the size written on the headline, and not for noise', () => {
    const { market, news, random } = setup(33);
    news.step(0, market, random.world);
    const real = {
      ...news.scheduled[0]!,
      at: MARKET_OPEN + 1000,
      symbols: ['ABC'],
      moves: { ABC: 60 },
      priceInMs: 5000,
      noise: false,
    };
    const noise = {
      ...news.scheduled[1]!,
      at: MARKET_OPEN + 2000,
      symbols: ['XYZ'],
      moves: { XYZ: 0 },
      priceInMs: 5000,
      noise: true,
    };
    news.scheduled = [real, noise];
    const before = new Map(market.anchor);
    let now = MARKET_OPEN;
    for (let i = 0; i < 3000; i++, now += TICK) {
      news.step(now, market, random.world);
      market.step(now, TICK, random.world, random.crowd);
    }
    expect(news.published.map((h) => h.id)).toEqual([real.id, noise.id]);
    expect(market.anchor.get('ABC')! - before.get('ABC')!).toBeCloseTo(60, 6);
    expect(market.anchor.get('XYZ')! - before.get('XYZ')!).toBe(0);
    expect(market.fair.get('ABC')! - before.get('ABC')!).toBeGreaterThan(40);
  });

  it('gives strategies the feed without the answers', () => {
    const { market, news, random } = setup(34);
    news.step(0, market, random.world);
    news.step(MS_PER_DAY, market, random.world);
    const feed = news.feed();
    expect(feed.length).toBeGreaterThan(0);
    expect(Object.keys(feed[0]!)).toEqual(['id', 'at', 'text', 'symbols', 'sector', 'direction']);
  });

  it('fills the template holes', () => {
    const { market, news, random } = setup(35);
    news.step(0, market, random.world);
    for (const h of news.scheduled) expect(h.text).not.toMatch(/\{/);
  });

  it('keeps the feed bounded and the schedule moving', () => {
    const { market, news, random } = setup(36);
    for (let day = 0; day < 20; day++) news.step(day * MS_PER_DAY + MARKET_OPEN + MS_PER_HOUR, market, random.world);
    expect(news.published.length).toBeLessThanOrEqual(100);
    expect(news.scheduled.length).toBeLessThan(60);
  });

  it('saves and loads', () => {
    const { market, news, random } = setup(37);
    news.step(MS_PER_SECOND, market, random.world);
    const copy = new News(TEMPLATES, STOCKS);
    copy.load(JSON.parse(JSON.stringify(news.save())) as ReturnType<News['save']>);
    expect(copy.scheduled).toEqual(news.scheduled);
  });
});
