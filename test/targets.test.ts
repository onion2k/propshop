// Part E: the targets are pure functions of the snapshot. Snapshots here are hand-built: only what a target reads.

import {
  STAGES,
  STANDING_RIVAL,
  TARGETS,
  closedWeeks,
  deskRent,
  seatPrice,
  standingGoal,
  targetsShown,
} from '../src/content';
import type { DayReport, Snapshot } from '../src/sim';

const day = (n: number, over: Partial<DayReport> = {}): DayReport => ({
  day: n,
  weekday: (['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const)[n % 7]!,
  week: Math.floor(n / 7) + 1,
  pnl: 0,
  equityAtClose: 0,
  byBlock: { momentum: { fills: 4, realised: 0, fees: 0 } },
  bySymbol: {},
  races: { won: 0, beaten: 0, missed: 0 },
  fees: 0,
  fines: 0,
  headlines: [],
  latency: {},
  rivals: [],
  ...over,
});

const offer = (kind: string, id: string, price: number, rent: number, inUse = false, desk?: string) => ({
  kind,
  spec: { id, price, rent, ...(desk ? { desk } : {}) },
  inUse,
});

function snap(over: Record<string, unknown> = {}): Snapshot {
  return {
    days: [],
    shop: [],
    competitors: [],
    calendar: { week: 1 },
    open: false,
    dayPnl: 0,
    rentDue: 0,
    rentPaid: 0,
    halt: null,
    ...over,
  } as unknown as Snapshot;
}

const target = (id: string) => TARGETS.find((t) => t.id === id)!;
const week = (n: number, pnls: number[], over: (i: number) => Partial<DayReport> = () => ({})) =>
  pnls.map((pnl, i) => day((n - 1) * 7 + i, { pnl, ...over(i) }));

describe('the targets', () => {
  it('are one or more a stage, each listed from its stage, the desks’ at their desk’s stage', () => {
    // Stage 6, Volatility, has no target yet: the options desk's is 7f's (plans/desk-options.md), a week above the
    // Prairie rack's rent, and the desk has no rack of its own to read it from.
    for (const st of STAGES.filter((x) => x.id <= 5))
      expect(
        TARGETS.some((t) => t.stage === st.id),
        `stage ${st.id}`,
      ).toBe(true);
    expect(target('desk-futures').stage).toBe(3);
    expect(target('desk-fx').stage).toBe(4);
    expect(target('desk-metals').stage).toBe(5);
    // A target for a stage not yet shown is not listed.
    expect(targetsShown(1).map((t) => t.id)).toEqual(['day-up']);
    expect(targetsShown(2).map((t) => t.id)).toEqual(['day-up', 'seat-rent']);
    expect(targetsShown(5)).toHaveLength(TARGETS.length);
    expect(new Set(TARGETS.map((t) => t.id)).size).toBe(TARGETS.length);
  });

  it('end a day up: met by one closed day above nought, and not by a loss or a flat day', () => {
    const t = target('day-up');
    expect(t.done(snap())).toBe(false);
    expect(t.done(snap({ days: [day(0, { pnl: -500 }), day(1, { pnl: 0 })] }))).toBe(false);
    expect(t.progress(snap())).toEqual({ have: 0, of: 1, unit: 'days' });
    const met = snap({ days: [day(0, { pnl: -500 }), day(1, { pnl: 1 })] });
    expect(t.done(met)).toBe(true);
    expect(t.progress(met)).toEqual({ have: 1, of: 1, unit: 'days' });
  });

  it('earn the seat’s rent: a closed week with rent whose result, after it, is not below nought', () => {
    const t = target('seat-rent');
    const rent = 36_000;
    // Monday to Thursday earn 60,000, Friday earns 0 before the rent and pays it: the week ends up 24,000.
    const up = week(1, [20_000, 20_000, 10_000, 10_000, -rent], (i) => (i === 4 ? { rent } : {}));
    expect(t.done(snap({ days: up, rentDue: rent }))).toBe(true);
    const down = week(1, [1_000, 1_000, 1_000, 1_000, -rent + 1_000], (i) => (i === 4 ? { rent } : {}));
    expect(t.done(snap({ days: down, rentDue: rent }))).toBe(false);
    // No rent charged (the starting setup) is not a seat that earned anything.
    expect(t.done(snap({ days: week(1, [5_000, 5_000, 5_000, 5_000, 5_000]) }))).toBe(false);
    // Half way through the first week: what was earned before the rent, against the rent due.
    const mid = snap({ days: week(1, [10_000, 8_000]), open: true, dayPnl: 2_000, rentDue: rent });
    expect(t.progress(mid)).toEqual({ have: 20_000, of: rent, unit: 'cents' });
    // A loss never shows below nought.
    expect(t.progress(snap({ days: week(1, [-9_000]), rentDue: rent })).have).toBe(0);
  });

  it('a week with no halt: five closed days, none halted, and something traded', () => {
    const t = target('no-halt-week');
    const clean = week(1, [1, 1, 1, 1, 1]);
    expect(t.done(snap({ days: clean }))).toBe(true);
    expect(
      t.done(snap({ days: week(1, [1, 1, 1, 1, 1], (i) => (i === 2 ? { halts: ['down 5000 dollars'] } : {})) })),
    ).toBe(false);
    expect(t.done(snap({ days: clean.slice(0, 4) }))).toBe(false); // Friday has not closed
    expect(t.done(snap({ days: week(1, [0, 0, 0, 0, 0], () => ({ byBlock: {} })) }))).toBe(false); // nothing traded
    expect(t.progress(snap({ days: clean.slice(0, 3) }))).toEqual({ have: 3, of: 5, unit: 'days' });
    expect(t.progress(snap({ days: clean.slice(0, 3), halt: { reason: 'x', until: 1 } })).have).toBe(0);
  });

  it('earn back the seat: the days kept cover the price of what is in use', () => {
    const t = target('seat-back');
    const shop = [
      offer('location', 'city', 800_000, 16_000, true),
      offer('network', 'fibre', 500_000, 10_000, true),
      offer('computer', 'server', 500_000, 10_000, true),
      offer('computer', 'rack', 6_000_000, 120_000),
    ];
    expect(seatPrice({ shop } as unknown as Snapshot)).toBe(1_800_000);
    expect(t.done(snap({ shop, days: week(1, [500_000, 500_000, 500_000, 200_000, 99_999]) }))).toBe(false);
    expect(t.done(snap({ shop, days: week(1, [500_000, 500_000, 500_000, 200_000, 100_000]) }))).toBe(true);
    // The starting setup cost nothing, so there is nothing to earn back.
    expect(t.done(snap({ shop: [offer('location', 'home', 0, 0, true)], days: week(1, [5, 5, 5, 5, 5]) }))).toBe(false);
    expect(t.progress(snap({ shop, days: week(1, [400_000, -700_000]) }))).toEqual({
      have: 0,
      of: 1_800_000,
      unit: 'cents',
    });
  });

  it('a desk pays its rack: a closed week of the desk’s own net above the rack’s rent', () => {
    const t = target('desk-fx');
    const shop = [offer('location', 'colo-eastholm', 8_000_000, 160_000, true, 'fx'), offer('location', 'home', 0, 0)];
    expect(deskRent({ shop } as unknown as Snapshot, 'fx')).toBe(160_000);
    const byDesk = (net: number) => () => ({ byDesk: { fx: { fills: 3, realised: net + 100, fees: 100 } } });
    expect(t.done(snap({ shop, days: week(1, [0, 0, 0, 0, 0], (i) => (i < 4 ? byDesk(40_000)() : {})) }))).toBe(true);
    expect(t.done(snap({ shop, days: week(1, [0, 0, 0, 0, 0], (i) => (i < 4 ? byDesk(39_999)() : {})) }))).toBe(false);
    // A rack not in use is priced by the cheapest of the desk's: the target shows what it would have to beat.
    const idle = [offer('location', 'colo-eastholm', 8_000_000, 160_000, false, 'fx')];
    expect(t.progress(snap({ shop: idle })).of).toBe(160_000);
    // A desk with no rack offered (not open) can not be met.
    expect(t.done(snap({ days: week(1, [0, 0, 0, 0, 0], () => byDesk(1e9)()) }))).toBe(false);
  });

  it('closedWeeks keeps only the weeks whose Friday has closed', () => {
    const days = [...week(1, [1, 1, 1, 1, 1]), ...week(2, [1, 1])];
    expect(closedWeeks(days)).toHaveLength(1);
  });

  it('never ends the game: no target asks for, or is lost by, a firm below nought', () => {
    // Equity below nought changes nothing: a target is only ever met, and every one still answers.
    const broke = snap({ days: week(1, [-9e9, -9e9, -9e9, -9e9, -9e9]), equity: -1e12 });
    for (const t of TARGETS) {
      expect(() => t.done(broke)).not.toThrow();
      // A week of ruinous losses with no halt is still a week with no halt; the money ones are not met.
      if (t.id !== 'no-halt-week') expect(t.done(broke), t.id).toBe(false);
      expect(t.progress(broke).have).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('the standing goal', () => {
  const rival = (todayPnl: number) => [{ name: STANDING_RIVAL, todayPnl }];
  it('is Harbor Quant’s week against the firm’s, both after the rent, with today so far', () => {
    const days = week(1, [10_000, 10_000], (i) => ({
      rivals: [{ name: STANDING_RIVAL, pnl: i === 0 ? 4_000 : 6_000 }],
    }));
    const g = standingGoal(snap({ days, competitors: rival(2_500), open: true, dayPnl: 1_000 }))!;
    expect(g).toEqual({ rival: STANDING_RIVAL, you: 21_000, them: 12_500, winning: true });
    const behind = standingGoal(snap({ days, competitors: rival(30_000), open: true, dayPnl: 0 }))!;
    expect(behind.winning).toBe(false);
  });
  it('is nothing where the rival is not in the game, and counts only this week’s days', () => {
    expect(standingGoal(snap())).toBeNull();
    const old = [day(0, { pnl: 99_000, rivals: [{ name: STANDING_RIVAL, pnl: 1 }] })];
    const g = standingGoal(snap({ days: old, competitors: rival(0), calendar: { week: 2 } }))!;
    expect(g.you).toBe(0);
    expect(g.them).toBe(0);
  });
});
