// Part 7a of plans/desk-options.md: the public calendar. The times of the day's market-wide headlines, read from
// the schedule that already exists; never the text, the direction or the size; nothing drawn.
import { CONTENT } from '../src/content';
import { Game, MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, calendarOf, isWeekday } from '../src/sim';
import { watchSpeed, WATCH_LEAD, WATCH_SLOW, WATCH_FAST } from '../src/ui/watch';

const SEEDS = [1, 2, 3];

/** Step in coarse strides to `until`: a test of the schedule, not of the books. */
const run = (g: Game, until: number, stride = 60_000) => {
  while (g.now < until) g.step(Math.min(stride, until - g.now));
};

/** What really happened on a day: every market-scope headline published that day, by time. */
const truth = (g: Game, day: number) =>
  g.news.published
    .filter((h) => h.sector === null && Math.floor(h.at / MS_PER_DAY) === day)
    .map((h) => h.at)
    .sort((a, b) => a - b);

describe('calendarOf: the day’s market-wide releases', () => {
  it.each(SEEDS)('seed %i: at the open it lists exactly the market-scope headlines the day then brings', (seed) => {
    const g = new Game(CONTENT, seed);
    let weekdays = 0;
    let withReleases = 0;
    for (let day = 0; day < 5; day++) {
      // At the open (a minute before, as skipToOpen lands): the whole day is already on the schedule.
      g.skipToOpen();
      expect(Math.floor(g.now / MS_PER_DAY)).toBe(day);
      const atOpen = calendarOf(g, day).map((c) => c.at);
      run(g, (day + 1) * MS_PER_DAY - 1);
      expect(atOpen).toEqual(truth(g, day));
      weekdays++;
      if (atOpen.length > 0) withReleases++;
      run(g, (day + 1) * MS_PER_DAY);
    }
    expect(weekdays).toBe(5);
    expect(withReleases).toBeGreaterThan(0);
  });

  it.each(SEEDS)('seed %i: from the first minute of a new game, today and tomorrow are known', (seed) => {
    const g = new Game(CONTENT, seed);
    const first = calendarOf(g, 0).map((c) => c.at);
    const second = calendarOf(g, 1).map((c) => c.at);
    run(g, 2 * MS_PER_DAY - 1);
    expect(first).toEqual(truth(g, 0));
    expect(second).toEqual(truth(g, 1));
  });

  it('leaves out company and sector headlines, and carries only a time and a neutral label', () => {
    const g = new Game(CONTENT, 2);
    g.skipToOpen();
    const all = [...g.news.scheduled, ...g.news.published].filter((h) => Math.floor(h.at / MS_PER_DAY) === 0);
    const market = all.filter((h) => h.sector === null);
    expect(all.length).toBeGreaterThan(market.length);
    const cal = calendarOf(g, 0);
    expect(cal).toHaveLength(market.length);
    for (const item of cal) {
      expect(Object.keys(item).sort()).toEqual(['at', 'label']);
      expect(item.label).toBe('A market release');
    }
    const text = JSON.stringify(cal);
    for (const h of market) expect(text).not.toContain(h.text);
    expect(cal.map((c) => c.at)).toEqual([...cal.map((c) => c.at)].sort((a, b) => a - b));
  });

  it('is empty on a weekend and sorted by time', () => {
    const g = new Game(CONTENT, 1);
    expect(isWeekday(5)).toBe(false);
    run(g, 4 * MS_PER_DAY + 20 * MS_PER_HOUR);
    expect(calendarOf(g, 5)).toEqual([]);
    expect(calendarOf(g, 6)).toEqual([]);
  });

  it('is in the snapshot for today, and draws nothing: a same-seed game stays bit-identical', () => {
    const make = () => {
      const g = new Game(CONTENT, 3);
      g.skipToOpen();
      return g;
    };
    const a = make();
    const b = make();
    expect(a.snapshot().releases).toEqual(calendarOf(a, 0));
    for (let i = 0; i < 20; i++) {
      calendarOf(a, 0);
      a.snapshot();
      a.nextMoment();
    }
    a.stepTicks(300);
    b.stepTicks(300);
    expect(JSON.stringify(a.save())).toBe(JSON.stringify(b.save()));
    expect(a.fingerprint()).toBe(b.fingerprint());
  });
});

describe('nextMoment: a release', () => {
  it('reports the next market release while a venue trades, by name, from the schedule, and nothing of company news', () => {
    for (const seed of SEEDS) {
      const g = new Game(CONTENT, seed);
      const day = [...calendarOf(g, 0), ...calendarOf(g, 1)].map((c) => c.at);
      const known = new Set(day);
      expect(known.size).toBeGreaterThan(0);
      let seen = 0;
      while (g.now < MS_PER_DAY - MS_PER_MINUTE) {
        g.step(60_000);
        const m = g.nextMoment()!;
        if (m.kind === 'release') {
          seen++;
          expect(known.has(m.at)).toBe(true);
          expect(m.label).toBe('A market release');
          expect(m.at).toBeGreaterThan(g.now);
        } else if (day.some((t) => t > g.now && t < m.at && g.market.exchanges.some((e) => e.isOpen(t)))) {
          throw new Error(`a release at ${day.find((t) => t > g.now)} was passed over for ${m.kind}`);
        }
      }
      expect(seen).toBeGreaterThan(0);
    }
  });

  it('is the release just before it, whichever other moment is later', () => {
    const g = new Game(CONTENT, 1);
    const during = calendarOf(g, 0).find((c) => c.at > 9.5 * MS_PER_HOUR) ?? calendarOf(g, 0)[0]!;
    run(g, during.at - 61_000);
    run(g, during.at - 3000, 1000);
    expect(g.nextMoment()).toEqual({ at: during.at, kind: 'release', label: 'A market release' });
  });
});

describe('watchSpeed with a release', () => {
  it('slows from the lead before a release as for a fix, and is fast before the lead', () => {
    const next = { at: 100_000, kind: 'release' as const, label: 'A market release' };
    expect(watchSpeed(100_000 - WATCH_LEAD - 1, next, null, null).speed).toBe(WATCH_FAST);
    expect(watchSpeed(100_000 - WATCH_LEAD, next, null, null)).toMatchObject({
      speed: WATCH_SLOW,
      slow: 'moment',
      until: 100_000,
    });
  });
});

describe('a release in closed hours', () => {
  /** The first market-wide release on the schedule that falls outside the stocks' hours on a weekday. */
  const overnight = (g: Game) =>
    g.news.scheduled.find((h) => {
      const t = h.at % MS_PER_DAY;
      return (
        h.sector === null &&
        isWeekday(Math.floor(h.at / MS_PER_DAY)) &&
        (t < 9.5 * MS_PER_HOUR || t >= 16 * MS_PER_HOUR)
      );
    });

  it('is no moment while no open venue trades at it, and is one once the futures desk is open', () => {
    let found = false;
    for (let seed = 1; seed <= 20 && !found; seed++) {
      const g = new Game(CONTENT, seed);
      const h = overnight(g);
      if (!h) continue;
      found = true;
      run(g, h.at - MS_PER_MINUTE);
      // Stocks only: nothing trades before the open, so the next moment is not this release.
      expect(g.nextMoment()?.at).not.toBe(h.at);
      g.openDesk('futures');
      const prairieOpen = g.market.exchanges.some((e) => e.spec.desk === 'futures' && e.isOpen(h.at));
      if (prairieOpen) expect(g.nextMoment()).toMatchObject({ at: h.at, kind: 'release' });
    }
    expect(found).toBe(true);
  });
});
