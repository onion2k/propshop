import { SAME_CENTS } from '../src/content/experiments';
import type { DayReport } from '../src/sim';
import type { Night, StoredMeasures } from '../src/ui/nights';
import {
  SESSION_MINUTES,
  blockDays,
  compare,
  feeShares,
  latestWithRuns,
  paybackDays,
  paybackText,
  raceShares,
  recordOverNights,
  regimeTable,
  weekPnl,
  windowVerdict,
} from '../src/ui/overview';

const m = (pnl: number, races = 0, fees = 0): StoredMeasures => ({
  pnl,
  fills: 0,
  races: { won: races, beaten: 0, missed: 0 },
  byExchange: {},
  byBlock: {},
  fees,
});

const PINS = ['open', 'headline', 'afternoon'] as const;
const FIVE_MIN = 5 * 60_000;
const BIG = 5 * SAME_CENTS;

/** A night with a baseline and variants, each given its P&L on the three windows. */
function night(day: number, results: Record<string, [number, number, number]>, extra: Partial<Night> = {}): Night {
  const ids = Object.keys(results);
  return {
    day,
    closedAt: 0,
    status: 'done',
    windowMs: FIVE_MIN,
    variants: ids.map((id) => ({
      id,
      kind: id === 'baseline' ? 'baseline' : id.startsWith('upgrade') ? 'upgrade' : 'toggle',
      label: id,
      ...(id.startsWith('upgrade') ? { price: 1_000_000 } : {}),
      signals: [],
    })),
    pins: PINS.map((p, i) => ({ label: p, at: i })),
    runs: ids.flatMap((id) => PINS.map((p, i) => ({ variantId: id, pin: p, at: i, measures: m(results[id]![i]!) }))),
    missing: [],
    setupChanged: false,
    skipped: false,
    reason: null,
    playerNote: null,
    ...extra,
  };
}

describe('windowVerdict', () => {
  it('reads better, same and worse with the experiments band', () => {
    expect(windowVerdict(m(0), m(BIG))).toBe('better');
    expect(windowVerdict(m(0), m(-BIG))).toBe('worse');
    expect(windowVerdict(m(0), m(SAME_CENTS))).toBe('same');
    // A tenth of a large baseline is the band.
    expect(windowVerdict(m(10 * BIG), m(10 * BIG + BIG))).toBe('same');
    expect(windowVerdict(m(10 * BIG), m(10 * BIG + 2 * BIG))).toBe('better');
  });
});

describe('compare', () => {
  it('says better in N of M windows when every window is better', () => {
    const rows = compare(night(1, { baseline: [0, 0, 0], 'toggle:a': [BIG, BIG, BIG] }));
    const r = rows.find((x) => x.id === 'toggle:a')!;
    expect(r.windows.map((w) => w.verdict)).toEqual(['better', 'better', 'better']);
    expect(r.tag).toBe('better');
    expect(r.summary).toBe('better in 3 of 3 windows');
    expect(r.total.pnl).toBe(3 * BIG);
    expect(r.gain).toBe(3 * BIG);
  });

  it('says mixed when the windows disagree, so a lucky window is not an edge', () => {
    const r = compare(night(1, { baseline: [0, 0, 0], 'toggle:a': [BIG, -BIG, 0] })).find((x) => x.id === 'toggle:a')!;
    expect(r.tag).toBe('mixed');
    expect(r.summary).toBe('mixed: better in 1 of 3 windows, worse in 1, about the same in 1');
    expect(r.better).toBe(1);
    expect(r.worse).toBe(1);
    expect(r.same).toBe(1);
  });

  it('names only what happened in a mixed night, never "worse in 0"', () => {
    const r = compare(night(1, { baseline: [0, 0, 0], 'toggle:a': [BIG, 0, 0] })).find((x) => x.id === 'toggle:a')!;
    expect(r.summary).toBe('mixed: better in 1 of 3 windows, about the same in 2');
    const w = compare(night(1, { baseline: [0, 0, 0], 'toggle:a': [0, -BIG, -BIG] })).find((x) => x.id === 'toggle:a')!;
    expect(w.summary).toBe('mixed: worse in 2 of 3 windows, about the same in 1');
  });

  it('notes the side when every window is about the same but on one side of the baseline', () => {
    const lo = compare(night(1, { baseline: [500, 500, 500], 'toggle:a': [450, 470, 440] })).find(
      (x) => x.id === 'toggle:a',
    )!;
    expect(lo.tag).toBe('same');
    expect(lo.lean).toBe('lower');
    expect(lo.summary).toBe('about the same in 3 of 3 windows, though lower in every one');
    const even = compare(night(1, { baseline: [500, 500, 500], 'toggle:a': [450, 520, 500] })).find(
      (x) => x.id === 'toggle:a',
    )!;
    expect(even.lean).toBeNull();
    expect(even.summary).toBe('about the same in 3 of 3 windows');
    const one = compare(night(1, { baseline: [500, 0, 0], 'toggle:a': [550, 0, 0] }));
    expect(one[1]!.lean).toBeNull();
  });

  it('says worse and about the same in all windows', () => {
    const rows = compare(night(1, { baseline: [0, 0, 0], 'toggle:a': [-BIG, -BIG, -BIG], 'toggle:b': [0, 1, 2] }));
    expect(rows.find((x) => x.id === 'toggle:a')!.summary).toBe('worse in 3 of 3 windows');
    expect(rows.find((x) => x.id === 'toggle:b')!.summary).toBe('about the same in 3 of 3 windows');
  });

  it('keeps the baseline as the first row with no verdicts, and compares only windows both ran', () => {
    const n = night(1, { baseline: [0, 0, 0], 'toggle:a': [BIG, BIG, BIG] });
    n.runs = n.runs.filter((r) => !(r.variantId === 'toggle:a' && r.pin === 'afternoon'));
    const rows = compare(n);
    expect(rows[0]!.id).toBe('baseline');
    expect(rows[0]!.windows.every((w) => w.verdict === null)).toBe(true);
    expect(rows[0]!.tag).toBe('none');
    const a = rows[1]!;
    expect(a.compared).toBe(2);
    expect(a.windows[2]!.pnl).toBeNull();
    expect(a.summary).toBe('better in 2 of 2 windows');
    expect(a.minutes).toBe(10);
  });

  it('gives a night with no runs rows that say no window ran', () => {
    const n = night(1, { baseline: [0, 0, 0], 'toggle:a': [0, 0, 0] }, { runs: [], status: 'none' });
    expect(compare(n).every((r) => r.tag === 'none' && r.summary === 'no window ran')).toBe(true);
  });
});

describe('payback', () => {
  it('scales the tested minutes to a 390-minute session', () => {
    // 15 tested minutes gain 50,000: 26 times that in a session.
    const days = paybackDays(1_300_000, 50_000, 15)!;
    expect(days).toBeCloseTo(1_300_000 / (50_000 * (SESSION_MINUTES / 15)), 6);
    expect(days).toBeCloseTo(1, 6);
  });

  it('is none when the gain is nought or less, the price is missing or nothing was tested', () => {
    expect(paybackDays(1_000_000, 0, 15)).toBeNull();
    expect(paybackDays(1_000_000, -5000, 15)).toBeNull();
    expect(paybackDays(undefined, 5000, 15)).toBeNull();
    expect(paybackDays(1_000_000, 5000, 0)).toBeNull();
  });

  it('is on an upgrade row only, and none where the upgrade did not gain', () => {
    const rows = compare(
      night(1, { baseline: [0, 0, 0], 'upgrade:location:city': [BIG, BIG, BIG], 'toggle:a': [BIG, BIG, BIG] }),
    );
    const up = rows.find((r) => r.id === 'upgrade:location:city')!;
    expect(up.payback).toBeCloseTo(1_000_000 / ((3 * BIG * SESSION_MINUTES) / 15), 6);
    expect(rows.find((r) => r.id === 'toggle:a')!.payback).toBeNull();
    const loser = compare(night(1, { baseline: [0, 0, 0], 'upgrade:location:city': [-BIG, 0, 0] }));
    expect(loser[1]!.payback).toBeNull();
  });

  it('is none where the gain is within the noise: about the same in total is not a reason to buy', () => {
    const rows = compare(night(1, { baseline: [0, 0, 0], 'upgrade:location:city': [100, 100, 100] }));
    expect(rows[1]!.total.verdict).toBe('same');
    expect(rows[1]!.payback).toBeNull();
  });

  it('writes days in words', () => {
    expect(paybackText(0.4)).toBe('under a day');
    expect(paybackText(3.2)).toBe('about 3 days');
    expect(paybackText(40.6)).toBe('about 41 days');
  });
});

describe('recordOverNights', () => {
  it('counts a night by its total, for variants on more than one night only', () => {
    const nights = [
      night(1, { baseline: [0, 0, 0], 'toggle:a': [BIG, BIG, BIG], 'toggle:b': [BIG, BIG, BIG] }),
      night(2, { baseline: [0, 0, 0], 'toggle:a': [-BIG, -BIG, -BIG] }),
      night(3, { baseline: [0, 0, 0], 'toggle:a': [BIG, BIG, BIG] }),
    ];
    const rec = recordOverNights(nights);
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ id: 'toggle:a', nights: 3, better: 2, worse: 1, text: 'better on 2 of 3 nights' });
  });

  it('skips nights with no runs', () => {
    const nights = [
      night(1, { baseline: [0, 0, 0], 'toggle:a': [BIG, BIG, BIG] }),
      night(2, { baseline: [0, 0, 0], 'toggle:a': [0, 0, 0] }, { runs: [], status: 'none' }),
    ];
    expect(recordOverNights(nights)).toEqual([]);
    expect(latestWithRuns(nights)!.day).toBe(1);
    expect(latestWithRuns([nights[1]!])).toBeNull();
  });
});

function day(n: number, extra: Partial<DayReport> = {}): DayReport {
  return {
    day: n,
    weekday: 'Mon',
    week: 1,
    pnl: 0,
    equityAtClose: 0,
    byBlock: {},
    bySymbol: {},
    races: { won: 0, beaten: 0, missed: 0 },
    fees: 0,
    fines: 0,
    headlines: [],
    latency: {},
    rivals: [],
    ...extra,
  };
}

describe('trends', () => {
  const t = (realised: number, fees: number, fills = 5) => ({ fills, realised, fees });
  const days = [
    day(1, {
      week: 1,
      pnl: 100,
      regime: 'calm',
      byBlock: { momentum: t(300, 100), marketMaker: t(50, 10) },
      races: { won: 3, beaten: 1, missed: 0 },
    }),
    day(2, { week: 1, pnl: -50, regime: 'trending', byBlock: { momentum: t(-100, 20) } }),
    day(3, { week: 2, pnl: 20, regime: 'calm', byBlock: { momentum: t(100, 50) } }),
  ];

  it('sums this week with the day in progress', () => {
    expect(weekPnl(days, 1, 7)).toBe(100 - 50 + 7);
    expect(weekPnl(days, 3, 0)).toBe(0);
  });

  it('lists blocks that ran with net per day, zero where idle, and honours the filter', () => {
    const b = blockDays(days);
    expect(b.blocks).toEqual(['momentum', 'marketMaker']);
    expect(b.series.momentum).toEqual([200, -120, 50]);
    expect(b.series.marketMaker).toEqual([40, 0, 0]);
    expect(blockDays(days, (id) => id === 'momentum').blocks).toEqual(['momentum']);
  });

  it('gives race share, null with no races, and fees over gross, null with no gross', () => {
    expect(raceShares(days)).toEqual([0.75, null, null]);
    const f = feeShares(days);
    expect(f[0]).toBeCloseTo(110 / 350, 6);
    expect(f[1]).toBeNull();
    expect(f[2]).toBeCloseTo(0.5, 6);
  });

  it('averages each block by kind of day', () => {
    const r = regimeTable(days);
    expect(r.regimes).toEqual(['calm', 'trending']);
    const mom = r.rows.find((x) => x.block === 'momentum')!;
    expect(mom.cells.calm).toEqual({ avg: (200 + 50) / 2, days: 2 });
    expect(mom.cells.trending).toEqual({ avg: -120, days: 1 });
    expect(r.rows.find((x) => x.block === 'marketMaker')!.cells.trending).toBeUndefined();
  });
});
