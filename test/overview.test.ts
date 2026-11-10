import { SAME_CENTS } from '../src/content/experiments';
import { glossary } from '../src/content';
import { MS_PER_YEAR, type DayReport, type Snapshot, type UpgradeOffer } from '../src/sim';
import { delta, price, totalGreeks, type HeldOption } from '../src/sim/options';
import type { Night, StoredMeasures } from '../src/ui/nights';
import {
  SESSION_MINUTES,
  blockDays,
  blockRecord,
  blockVerdict,
  comingLine,
  dayCause,
  deskGreeks,
  expiryLines,
  scenario,
  progressText,
  ordersToday,
  rivalLines,
  rivalRows,
  overviewShown,
  racesVenues,
  shopLatency,
  shownBalances,
  tradedVenues,
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

describe('an Overview that grows', () => {
  it('shows Position and Today always, and the rest as the game earns them', () => {
    expect(overviewShown([], [], 0)).toEqual({ trends: false, comparisons: false, signals: false });
    expect(overviewShown([day(1)], [], 0)).toEqual({ trends: true, comparisons: true, signals: false });
    // A stored night alone is enough, e.g. one kept from before.
    expect(overviewShown([], [night(1, { baseline: [0, 0, 0] })], 0)).toEqual({
      trends: true,
      comparisons: true,
      signals: false,
    });
    expect(overviewShown([day(1)], [], 2).signals).toBe(true);
    // Signals can show before a close only if the game raised one.
    expect(overviewShown([], [], 1).signals).toBe(true);
  });

  it('says in a line what will come and when, and nothing once everything is shown', () => {
    const none = comingLine(overviewShown([], [], 0))!;
    expect(none).toMatch(/first close/);
    expect(none).toMatch(/Trends/);
    expect(none).toMatch(/Comparisons/);
    expect(none).toMatch(/Signals/);
    const closed = comingLine(overviewShown([day(1)], [], 0))!;
    expect(closed).not.toMatch(/first close/);
    expect(closed).toMatch(/Signals/);
    expect(comingLine(overviewShown([day(1)], [], 1))).toBeNull();
  });
});

describe('a block record and why', () => {
  const t = (realised: number, fees: number, fills = 5) => ({ fills, realised, fees });
  const days = [
    day(1, { byBlock: { a: t(500, 100), b: t(100, 300), c: t(-200, 50), d: t(0, 0, 0) } }),
    day(2, { byBlock: { a: t(300, 100) } }),
    day(3, {}),
  ];

  it('counts days traded, gross, fees and net over the days kept', () => {
    expect(blockRecord(days, 'a')).toEqual({ days: 2, fills: 10, gross: 800, fees: 200, net: 600 });
    expect(blockRecord(days, 'b')).toEqual({ days: 1, fills: 5, gross: 100, fees: 300, net: -200 });
    // A block that only appears with no fills has not traded.
    expect(blockRecord(days, 'd')).toEqual({ days: 0, fills: 0, gross: 0, fees: 0, net: 0 });
    expect(blockRecord(days, 'nope').days).toBe(0);
  });

  it('reads has not traded, earns, fees take it, and the signal itself loses', () => {
    expect(blockVerdict(blockRecord(days, 'nope')).kind).toBe('none');
    expect(blockVerdict(blockRecord(days, 'a')).kind).toBe('earns');
    expect(blockVerdict(blockRecord(days, 'b')).kind).toBe('fees');
    expect(blockVerdict(blockRecord(days, 'c')).kind).toBe('loses');
  });

  it('gives each verdict words and a term the glossary has', () => {
    for (const id of ['nope', 'a', 'b', 'c']) {
      const v = blockVerdict(blockRecord(days, id));
      expect(v.text.length).toBeGreaterThan(20);
      if (v.term) expect(glossary(v.term), v.term).toBeDefined();
    }
    expect(blockVerdict(blockRecord(days, 'b')).term).toBe('maker-taker');
    expect(blockVerdict(blockRecord(days, 'c')).term).toBe('adverse-selection');
  });
});

describe('why a day lost or earned', () => {
  const t = (realised: number, fees: number, fills = 5) => ({ fills, realised, fees });

  it('names the largest loss of a day that lost, with its figure', () => {
    const fees = dayCause(
      day(1, { pnl: -900, fees: 700, fines: 100, byBlock: { momentum: t(-200, 100) }, bySymbol: {} }),
    );
    expect(fees.kind).toBe('fees');
    expect(fees.amount).toBe(-700);
    expect(fees.text).toContain('$7.00');
    const fine = dayCause(day(1, { pnl: -1500, fees: 100, fines: 1200 }));
    expect(fine.kind).toBe('fines');
    expect(fine.text).toContain('$12.00');
    const roll = dayCause(day(1, { pnl: -5000, fees: 10, rollover: -4000, storage: -300 }));
    expect(roll.kind).toBe('rollover');
    const store = dayCause(day(1, { pnl: -5000, fees: 10, storage: -4000, rollover: 50 }));
    expect(store.kind).toBe('storage');
    const block = dayCause(day(1, { pnl: -5000, fees: 10, byBlock: { momentum: t(-4000, 100), arbitrage: t(10, 5) } }));
    expect(block.kind).toBe('block');
    expect(block.text).toContain('Momentum');
    expect(block.amount).toBe(-4100);
    const sym = dayCause(
      day(1, {
        pnl: -5000,
        fees: 10,
        bySymbol: { QNT: t(-4000, 100), ABC: t(10, 5) },
        byBlock: { momentum: t(-500, 10) },
      }),
    );
    expect(sym.kind).toBe('symbol');
    expect(sym.text).toContain('QNT');
  });

  it('names Friday’s rent when it is the largest loss, and not when a bigger thing lost, nor on a day that earned', () => {
    const rent = dayCause(day(4, { pnl: -160_000, rent: 160_000, fees: 100, byBlock: { momentum: t(100, 100) } }));
    expect(rent.kind).toBe('rent');
    expect(rent.amount).toBe(-160_000);
    expect(rent.text).toContain('$1,600.00');
    expect(rent.text).toMatch(/Rent took/);
    expect(rent.term).toBe('day-cause');
    // The block lost more than the rent: the block is named.
    const bigger = dayCause(day(4, { pnl: -300_000, rent: 16_000, byBlock: { momentum: t(-280_000, 1_000) } }));
    expect(bigger.kind).toBe('block');
    // A day that earned after the rent is explained by what earned, not by the rent.
    const up = dayCause(day(4, { pnl: 50_000, rent: 16_000, byBlock: { momentum: t(70_000, 4_000) } }));
    expect(up.kind).toBe('block');
    // A day with no rent field is as it was.
    expect(dayCause(day(3, { pnl: -900, fees: 700 })).kind).toBe('fees');
  });

  it('words a target’s two figures, and the glossary has the rent entry the page links to', () => {
    expect(progressText({ have: 124_000, of: 200_000, unit: 'cents' })).toBe('$1,240.00 of $2,000.00');
    expect(progressText({ have: 3, of: 5, unit: 'days' })).toBe('3 of 5 days');
    expect(progressText({ have: 0, of: 1, unit: 'days' })).toBe('0 of 1 day');
    expect(glossary('rent')).toBeDefined();
  });

  it('names the largest gain of a day that earned', () => {
    const c = dayCause(day(1, { pnl: 3000, fees: 50, byBlock: { momentum: t(3200, 100), arbitrage: t(10, 5) } }));
    expect(c.kind).toBe('block');
    expect(c.amount).toBe(3100);
    expect(c.text).toMatch(/earned/);
    const carry = dayCause(day(1, { pnl: 9000, fees: 50, rollover: 9000, byBlock: {} }));
    expect(carry.kind).toBe('rollover');
  });

  it('says a quiet day when nothing traded and nothing was charged', () => {
    const c = dayCause(day(1));
    expect(c.kind).toBe('quiet');
    expect(c.text).toMatch(/nothing/i);
    expect(c.term).toBeNull();
  });

  it('links a term the glossary has', () => {
    const c = dayCause(day(1, { pnl: -10, fees: 10 }));
    expect(c.term).not.toBeNull();
    expect(glossary(c.term!)).toBeDefined();
  });
});

describe('the Market page by desk and the shop by venue', () => {
  const ex = (id: string, desk = 'stocks') => ({ id, desk }) as Snapshot['exchanges'][number];
  const stock = (symbol: string, desk: string, venues: string[], watched = true) =>
    ({ symbol, desk, watched, exchanges: venues.map((id) => ({ id })) }) as unknown as Snapshot['stocks'][number];
  const order = (exchange: string, sentAt: number) => ({ exchange, sentAt }) as Snapshot['orders'][number];
  const DAY = 86_400_000;
  /** Day 3, 10:00. */
  const NOW = 3 * DAY + 10 * 3_600_000;
  const base = (over: Partial<Snapshot> = {}) =>
    ({
      now: NOW,
      calendar: { day: 3, timeOfDay: 10 * 3_600_000 },
      exchanges: [ex('HARBOR'), ex('LAKESIDE'), ex('EASTHOLM', 'fx'), ex('PRAIRIE', 'futures')],
      stocks: [
        stock('AAA', 'stocks', ['HARBOR', 'LAKESIDE']),
        stock('EURUSD', 'fx', ['EASTHOLM'], false),
        stock('IXF', 'futures', ['PRAIRIE'], false),
      ],
      orders: [],
      latency: { HARBOR: 12, LAKESIDE: 12, EASTHOLM: 40 },
      balances: [],
      days: [],
      ...over,
    }) as unknown as Snapshot;

  it("takes today's orders only", () => {
    const s = base({ orders: [order('HARBOR', NOW - 1000), order('EASTHOLM', 2 * DAY + 1000)] });
    expect(ordersToday(s).map((o) => o.exchange)).toEqual(['HARBOR']);
  });

  it("always lists the stocks' venues, and another desk's once it has had an order today", () => {
    expect(racesVenues(base()).map((e) => e.id)).toEqual(['HARBOR', 'LAKESIDE']);
    const yesterday = base({ orders: [order('EASTHOLM', 2 * DAY + 1000)] });
    expect(racesVenues(yesterday).map((e) => e.id)).toEqual(['HARBOR', 'LAKESIDE']);
    const today = base({ orders: [order('EASTHOLM', NOW - 1000)] });
    expect(racesVenues(today).map((e) => e.id)).toEqual(['HARBOR', 'LAKESIDE', 'EASTHOLM']);
  });

  it('shows a currency once it is non-zero or a day report has fills on the currencies desk', () => {
    const bal = (currency: string, amount: number) => ({ currency, name: currency, amount, minor: 100, dollars: 0 });
    const s = base({ balances: [bal('EUR', 0), bal('JPY', 0)] });
    expect(shownBalances(s)).toEqual([]);
    expect(shownBalances({ ...s, balances: [bal('EUR', 5), bal('JPY', 0)] }).map((b) => b.currency)).toEqual(['EUR']);
    const traded = { ...s, days: [day(1, { byDesk: { fx: { fills: 2, realised: 0, fees: 0 } } })] };
    expect(shownBalances(traded).map((b) => b.currency)).toEqual(['EUR', 'JPY']);
    // Fills on another desk do not count.
    const other = { ...s, days: [day(1, { byDesk: { futures: { fills: 2, realised: 0, fees: 0 } } })] };
    expect(shownBalances(other)).toEqual([]);
  });

  it('trades the venues of watched instruments and of the orders sent today', () => {
    expect(tradedVenues(base())).toEqual(['HARBOR', 'LAKESIDE']);
    const s = base({ orders: [order('EASTHOLM', NOW - 1000)] });
    expect(tradedVenues(s)).toEqual(['HARBOR', 'LAKESIDE', 'EASTHOLM']);
  });

  it('writes an offer as before and after for the venues traded, and folds the rest', () => {
    const offer = {
      latency: { HARBOR: 0.6, LAKESIDE: 4.4, EASTHOLM: 30 },
      dataLatency: { HARBOR: 0.6, LAKESIDE: 4.4, EASTHOLM: 30 },
    } as unknown as UpgradeOffer;
    const s = base({ latency: { HARBOR: 12, LAKESIDE: 12, EASTHOLM: 40 } });
    const out = shopLatency(offer, s);
    expect(out.traded).toBe('HARBOR 12ms → 600µs, LAKESIDE 12ms → 4.4ms');
    expect(out.rest).toBe('EASTHOLM 30ms');
    // Data that lags the orders is said.
    const lag = { ...offer, dataLatency: { ...offer.dataLatency, LAKESIDE: 9 } } as UpgradeOffer;
    expect(shopLatency(lag, s).traded).toContain('LAKESIDE 12ms → 4.4ms, data 9ms');
    // The offer in use has no before.
    const inUse = { ...offer, inUse: true } as UpgradeOffer;
    expect(shopLatency(inUse, s).traded).toBe('HARBOR 600µs, LAKESIDE 4.4ms');
  });
});

describe('rivals as characters', () => {
  it('writes a sentence a rival: quotes taken with their worth, and races beaten with the median', () => {
    const lines = rivalLines({
      takenBy: { 'Harbor Quant': { count: 14, cents: 31_000 }, 'Midtown Capital': { count: 2, cents: -500 } },
      beatenBy: { 'Harbor Quant': { count: 22, medianMs: 0.4 }, 'Bayview Systems': { count: 3, medianMs: 2 } },
    });
    expect(lines.map((l) => l.name)).toEqual(['Harbor Quant', 'Bayview Systems', 'Midtown Capital']);
    expect(lines[0]!.text).toBe(
      'Harbor Quant took 14 quotes off you, worth $310.00, and beat you to 22 orders by a median 400µs.',
    );
    expect(lines[1]!.text).toBe('Bayview Systems beat you to 3 orders by a median 2ms.');
    expect(lines[2]!.text).toContain('2 quotes off you, though the price did not run against you');
    for (const l of lines) expect(glossary(l.term), l.term).toBeDefined();
    expect(rivalLines({})).toEqual([]);
    expect(rivalLines({ takenBy: {}, beatenBy: {} })).toEqual([]);
  });

  it('adds a rival to the candidates for a day that lost, and only then', () => {
    const lost = day(1, { pnl: -9000, fees: 100, takenBy: { 'Harbor Quant': { count: 9, cents: 8000 } } });
    const c = dayCause(lost);
    expect(c.kind).toBe('rival');
    expect(c.text).toContain('Harbor Quant');
    expect(c.text).toContain('$80.00');
    expect(c.amount).toBe(-8000);
    // Smaller than the fees: the fees win.
    expect(dayCause(day(1, { pnl: -900, fees: 700, takenBy: { X: { count: 1, cents: 100 } } })).kind).toBe('fees');
    // A day that earned is never explained by a loss; a taken quote that cost nothing is no cause.
    expect(dayCause(day(1, { pnl: 5000, fees: 100, takenBy: { X: { count: 1, cents: 4000 } } })).kind).not.toBe(
      'rival',
    );
    expect(dayCause(day(1, { pnl: -5000, fees: 100, takenBy: { X: { count: 1, cents: -4000 } } })).kind).not.toBe(
      'rival',
    );
  });

  it('rows each rival with what it runs, where it sits, and what it took today and this week', () => {
    const rows = rivalRows({
      competitors: [
        {
          id: 'bot:a',
          name: 'Harbor Quant',
          latency: {},
          fills: 0,
          pnl: 0,
          todayPnl: 0,
          location: 'Colo',
          runs: ['arbitrage'],
        },
        {
          id: 'bot:b',
          name: 'Midtown Capital',
          latency: {},
          fills: 0,
          pnl: 0,
          todayPnl: 0,
          location: 'City',
          runs: ['anticipate'],
        },
      ],
      takenToday: { 'Harbor Quant': { count: 2, cents: 100 } },
      calendar: { week: 2, open: true } as Snapshot['calendar'],
      days: [
        day(1, { week: 1, takenBy: { 'Harbor Quant': { count: 50, cents: 9999 } } }),
        day(8, { week: 2, takenBy: { 'Harbor Quant': { count: 3, cents: 200 } } }),
      ],
    });
    expect(rows[0]).toMatchObject({ name: 'Harbor Quant', location: 'Colo', today: { count: 2, cents: 100 } });
    expect(rows[0]!.runs).toEqual(['Cross-exchange arbitrage']);
    expect(rows[0]!.week).toEqual({ count: 5, cents: 300 });
    expect(rows[1]!.today).toEqual({ count: 0, cents: 0 });
    expect(rows[1]!.week).toEqual({ count: 0, cents: 0 });
  });

  it('counts today once after the close, when the day is already among the kept days', () => {
    const rows = rivalRows({
      competitors: [
        {
          id: 'bot:a',
          name: 'Harbor Quant',
          latency: {},
          fills: 0,
          pnl: 0,
          todayPnl: 0,
          location: 'Colo',
          runs: ['arbitrage'],
        },
      ],
      takenToday: { 'Harbor Quant': { count: 3, cents: 200 } },
      calendar: { week: 2, open: false } as Snapshot['calendar'],
      days: [day(8, { week: 2, takenBy: { 'Harbor Quant': { count: 3, cents: 200 } } })],
    });
    expect(rows[0]!.today).toEqual({ count: 3, cents: 200 });
    expect(rows[0]!.week).toEqual({ count: 3, cents: 200 });
  });
});

describe('the options desk’s expiry in the day', () => {
  const t = (realised: number, fees: number, fills = 5) => ({ fills, realised, fees });
  const line = (made: number, symbol = 'OC00') => ({
    symbol,
    right: 'call' as const,
    strike: 5300,
    qty: 10,
    settled: 40,
    cash: 40_000,
    made,
  });

  it('names the expiry when it is the largest loss of a day that lost, or the largest gain of one that earned', () => {
    const lost = dayCause(
      day(1, { pnl: -9000, fees: 100, expired: [line(-8000)], byBlock: { momentum: t(-500, 10) } }),
    );
    expect(lost.kind).toBe('expiry');
    expect(lost.amount).toBe(-8000);
    expect(lost.text).toContain('$80.00');
    expect(lost.text).toMatch(/expiry/i);
    expect(lost.term).toBe('cash-settlement');
    const won = dayCause(day(1, { pnl: 9000, fees: 100, expired: [line(7000), line(2000, 'OP00')] }));
    expect(won.kind).toBe('expiry');
    expect(won.amount).toBe(9000);
    expect(won.text).toMatch(/earned|paid/);
  });

  it('is not named when something bigger lost, nor when it is on the wrong side of the day', () => {
    expect(dayCause(day(1, { pnl: -9000, expired: [line(-100)], byBlock: { momentum: t(-8000, 10) } })).kind).toBe(
      'block',
    );
    expect(dayCause(day(1, { pnl: -9000, fees: 7000, expired: [line(500)] })).kind).toBe('fees');
    expect(glossary(dayCause(day(1, { pnl: -9000, expired: [line(-8000)] })).term!)).toBeDefined();
  });

  it('puts each option held to the close in a line: what it was, what it settled at, what it paid', () => {
    const lines = expiryLines(
      day(1, { expired: [line(1234), { ...line(-500, 'OP00'), right: 'put', qty: -3, cash: 0, settled: 0 }] }),
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]!.symbol).toBe('OC00');
    expect(lines[0]!.text).toMatch(/10 .*call/i);
    expect(lines[0]!.text).toContain('$400.00');
    expect(lines[0]!.text).toContain('+$12.34');
    expect(lines[1]!.text).toMatch(/short 3|3 short/i);
    expect(lines[1]!.text).toMatch(/nothing|worthless|out of the money/i);
    expect(expiryLines(day(1))).toEqual([]);
  });
});

describe('the options desk’s greeks and the what-if', () => {
  const S = 5300;
  const R = 0.035;
  const T = 0.5 / 365;
  const NOW = 2_000_000;
  const o = (right: 'call' | 'put', qty: number, strike = 5300, vol = 0.22): HeldOption => ({
    symbol: `${right}${strike}`,
    right,
    strike,
    expiry: NOW + T * MS_PER_YEAR,
    qty,
    multiplier: 100,
    vol,
  });
  const ctx = { spot: S, rate: R, now: NOW };

  it('is nought for nothing moved, or nothing held', () => {
    expect(scenario([o('call', 10)], 0, 0, ctx)).toBe(0);
    expect(scenario([], 0.02, 5, ctx)).toBe(0);
  });

  it('revalues a long call at the model: the index up 2% gains what the model says', () => {
    const want = 10 * 100 * (price('call', S * 1.02, 5300, T, 0.22, R) - price('call', S, 5300, T, 0.22, R));
    const got = scenario([o('call', 10)], 0.02, 0, ctx);
    expect(got).toBeCloseTo(want, 6);
    expect(got).toBeGreaterThan(0);
    expect(scenario([o('call', 10)], -0.02, 0, ctx)).toBeLessThan(0);
    // And the same for a put the other way about.
    expect(scenario([o('put', 10)], 0.02, 0, ctx)).toBeLessThan(0);
    expect(scenario([o('put', 10)], -0.02, 0, ctx)).toBeGreaterThan(0);
  });

  it('moves the volatility in points: five up gains a long option what the model says, and costs a short', () => {
    const want = 10 * 100 * (price('call', S, 5300, T, 0.27, R) - price('call', S, 5300, T, 0.22, R));
    expect(scenario([o('call', 10)], 0, 5, ctx)).toBeCloseTo(want, 6);
    expect(scenario([o('call', 10)], 0, 5, ctx)).toBeGreaterThan(0);
    expect(scenario([o('call', -10)], 0, 5, ctx)).toBeCloseTo(-want, 6);
    expect(scenario([o('call', 10)], 0, -5, ctx)).toBeLessThan(0);
  });

  it('hurts a short straddle whichever way the index goes, and a long one gains: gamma', () => {
    const short = [o('call', -10), o('put', -10)];
    const long = [o('call', 10), o('put', 10)];
    for (const move of [-0.05, -0.02, 0.02, 0.05]) {
      expect(scenario(short, move, 0, ctx), String(move)).toBeLessThan(0);
      expect(scenario(long, move, 0, ctx), String(move)).toBeGreaterThan(0);
    }
    // Both are hurt more by five points of volatility than by none.
    expect(scenario(short, 0.02, 5, ctx)).toBeLessThan(scenario(short, 0.02, 0, ctx));
    expect(scenario(short, 0, -5, ctx)).toBeGreaterThan(0);
  });

  it('agrees with delta for a small move, and leaves its inputs alone', () => {
    const held = [o('call', 10)];
    const frozen = JSON.stringify(held);
    const small = scenario(held, 0.0005, 0, ctx);
    const viaDelta = 10 * 100 * delta('call', S, 5300, T, 0.22, R) * S * 0.0005;
    expect(small / viaDelta).toBeGreaterThan(0.97);
    expect(small / viaDelta).toBeLessThan(1.03);
    expect(JSON.stringify(held)).toBe(frozen);
  });

  it('keeps the volatility above nought however far down it is moved, and values an expired option at its worth', () => {
    expect(Number.isFinite(scenario([o('call', 10, 5300, 0.03)], 0, -50, ctx))).toBe(true);
    const gone = { ...o('call', 10, 5200), expiry: NOW };
    expect(scenario([gone], 0, 5, ctx)).toBe(0);
    expect(scenario([gone], 0.02, 0, ctx)).toBeCloseTo(10 * 100 * S * 0.02, 6);
  });

  it('works the desk’s greeks from the snapshot: delta in index units, the futures that hedge it, gamma, theta, vega', () => {
    const held = [o('call', 10), o('put', -4)];
    const g = totalGreeks(held, S, R, NOW);
    const s = {
      options: { underlying: 'IDX', spot: S, rate: R, held, greeks: g },
      stocks: [{ symbol: 'IXF0', contract: { underlying: 'IDX', multiplier: 100 } }],
    } as unknown as Snapshot;
    const out = deskGreeks(s)!;
    expect(out.delta).toBeCloseTo(g.delta, 9);
    // A hundred to a contract of the future: sell as many as the delta is long.
    expect(out.hedge).toBeCloseTo(-g.delta / 100, 9);
    expect(out.gamma).toBe(g.gamma);
    expect(out.theta).toBe(g.theta);
    expect(out.vega).toBe(g.vega);
    expect(out.held).toBe(2);
    // The multiplier is the future's own, and a hundred where none is listed.
    const lone = { ...s, stocks: [] } as unknown as Snapshot;
    expect(deskGreeks(lone)!.hedge).toBeCloseTo(-g.delta / 100, 9);
    expect(deskGreeks({ ...s, options: undefined })).toBeNull();
  });
});
