// The targets: something to play for at each stage, and a standing goal. A target is a pure function of the
// snapshot, like a lesson, and opens nothing: the stages still open on the lessons. The firm can never go bust, so
// a target is only ever met, never lost. The page keeps the ones met (`propshop.targets.v1`: id to the simulated
// time it was first met) so a target once ticked stays ticked, whatever the days kept say later.

import type { DayReport, Snapshot } from '../sim';
import { featureStage, type StageId } from './stages';

/** The two figures a target shows ("$1,240 of $2,000"): what the firm has, and what the target asks. */
export interface TargetProgress {
  have: number;
  of: number;
  /** Cents are shown as money; days and weeks as counts. */
  unit: 'cents' | 'days';
}

export interface Target {
  id: string;
  title: string;
  /** Said in a sentence: what is asked, and why it is worth asking. */
  explain: string;
  /** The first stage it is listed at: a stage's own, or its desk's. */
  stage: StageId;
  /** A desk's target is listed with the desk. */
  desk?: string;
  /** Glossary ids worth reading beside it. */
  terms: string[];
  done: (s: Snapshot) => boolean;
  progress: (s: Snapshot) => TargetProgress;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** The weeks whose Friday has closed, each as its days (at most the days kept), oldest first. */
export function closedWeeks(days: readonly DayReport[]): DayReport[][] {
  const weeks = new Map<number, DayReport[]>();
  for (const d of days) weeks.set(d.week, [...(weeks.get(d.week) ?? []), d]);
  return [...weeks.values()].filter((w) => w.some((d) => d.weekday === 'Fri'));
}

/** This week's closed days, and today's result while the market is open. */
function thisWeek(s: Snapshot): { days: DayReport[]; today: number } {
  return { days: s.days.filter((d) => d.week === s.calendar.week), today: s.open ? s.dayPnl : 0 };
}

/** The week's rent: the Friday's, once it has been charged, else what the setup in use will be charged. */
function weekRent(s: Snapshot, days: readonly DayReport[]): number {
  const paid = sum(days.map((d) => d.rent ?? 0));
  return paid > 0 ? paid : s.rentDue;
}

/** What a desk's rack costs a week: the one in use there, else the cheapest it offers. 0 where the desk has none. */
export function deskRent(s: Pick<Snapshot, 'shop'>, desk: string): number {
  const racks = s.shop.filter((o) => o.kind === 'location' && 'desk' in o.spec && o.spec.desk === desk);
  const mine = racks.find((o) => o.inUse);
  if (mine) return mine.spec.rent ?? 0;
  return racks.length === 0 ? 0 : Math.min(...racks.map((o) => o.spec.rent ?? 0));
}

/** A desk's net in a day: what its fills realised, less their fees. */
const deskNet = (d: DayReport, desk: string): number => {
  const t = d.byDesk?.[desk];
  return t ? t.realised - t.fees : 0;
};

function deskTarget(desk: string, title: string, explain: string): Target {
  return {
    id: `desk-${desk}`,
    title,
    explain,
    stage: featureStage(`desk:${desk}`),
    desk,
    terms: ['rent'],
    done: (s) => {
      const rent = deskRent(s, desk);
      return rent > 0 && closedWeeks(s.days).some((w) => sum(w.map((d) => deskNet(d, desk))) >= rent);
    },
    progress: (s) => {
      const { days } = thisWeek(s);
      return {
        have: Math.max(0, sum(days.map((d) => deskNet(d, desk)))),
        of: deskRent(s, desk),
        unit: 'cents',
      };
    },
  };
}

export const TARGETS: readonly Target[] = [
  {
    id: 'day-up',
    title: 'End a day up',
    explain: 'Close one session with more than you opened it with, after fees. The first proof that the setup earns.',
    stage: 1,
    terms: ['pnl'],
    done: (s) => s.days.some((d) => d.pnl > 0),
    progress: (s) => ({ have: Math.min(1, s.days.filter((d) => d.pnl > 0).length), of: 1, unit: 'days' }),
  },
  {
    id: 'seat-rent',
    title: 'Earn the seat’s rent',
    explain:
      'A week whose trading, before the rent, is at least the rent it was charged at Friday’s close, so the week ends ' +
      'level or up. A seat has to earn its keep every week, not once.',
    stage: 2,
    terms: ['rent'],
    // The week's result is after its rent, so "covers the rent" is a week that ends at nought or more.
    done: (s) => closedWeeks(s.days).some((w) => sum(w.map((d) => d.rent ?? 0)) > 0 && sum(w.map((d) => d.pnl)) >= 0),
    progress: (s) => {
      const { days, today } = thisWeek(s);
      const rent = weekRent(s, days);
      // Before the rent: the days' results with the rent put back, and today so far.
      const earned = sum(days.map((d) => d.pnl + (d.rent ?? 0))) + today;
      return { have: Math.max(0, earned), of: rent, unit: 'cents' };
    },
  },
  {
    id: 'no-halt-week',
    title: 'A week with no halt',
    explain:
      'Trade all five days without hitting the daily loss limit or a margin call. A firm that is halted is flat, ' +
      'and a week of halts is a week of rent paid for nothing.',
    stage: 3,
    terms: ['risk-limits'],
    done: (s) =>
      closedWeeks(s.days).some(
        (w) =>
          w.length >= 5 &&
          w.every((d) => (d.halts ?? []).length === 0) &&
          sum(w.map((d) => sum(Object.values(d.byBlock).map((t) => t.fills)))) > 0,
      ),
    progress: (s) => {
      const { days } = thisWeek(s);
      const clean = days.some((d) => (d.halts ?? []).length > 0) || s.halt ? 0 : days.length;
      return { have: Math.min(5, clean), of: 5, unit: 'days' };
    },
  },
  deskTarget(
    'futures',
    'Futures pay their rack',
    'A week in which the futures desk nets more than its rack costs. A rack is a fixed cost; it earns its place only ' +
      'if the desk it serves does.',
  ),
  {
    id: 'seat-back',
    title: 'Earn back the seat',
    explain:
      'The days kept (the last sixty, rent included) earn at least what the seat you sit in cost to buy: its office, ' +
      'line and computer. The price is paid once; the rent goes on.',
    stage: 4,
    terms: ['rent'],
    done: (s) => seatPrice(s) > 0 && sum(s.days.map((d) => d.pnl)) >= seatPrice(s),
    progress: (s) => ({ have: Math.max(0, sum(s.days.map((d) => d.pnl))), of: seatPrice(s), unit: 'cents' }),
  },
  deskTarget(
    'fx',
    'Currencies pay their rack',
    'A week in which the currencies desk nets more than its rack costs. Rollover is not counted: only what the ' +
      'fills made, less their fees.',
  ),
  deskTarget(
    'metals',
    'Metals pay their rack',
    'A week in which the metals desk nets more than its rack costs. Storage and the lease are not counted: only ' +
      'what the fills made, less their fees.',
  ),
];

/** What the setup in use cost to buy, in cents: the three prices added up. */
export function seatPrice(s: Pick<Snapshot, 'shop'>): number {
  return sum(s.shop.filter((o) => o.inUse).map((o) => o.spec.price));
}

/** The targets listed at a stage: its own, the earlier stages' and the desks that are shown by then. */
export function targetsShown(stage: StageId): Target[] {
  return TARGETS.filter((t) => t.stage <= stage);
}

/** The standing goal: beat Harbor Quant's week. Both figures are the week's results after the rent. */
export const STANDING_RIVAL = 'Harbor Quant';

export interface StandingGoal {
  rival: string;
  /** Cents this week: the closed days and today so far, for the firm and for the rival. */
  you: number;
  them: number;
  winning: boolean;
}

/** Null where the rival is not in the game. */
export function standingGoal(s: Snapshot): StandingGoal | null {
  const c = s.competitors.find((x) => x.name === STANDING_RIVAL);
  if (!c) return null;
  const { days, today } = thisWeek(s);
  const you = sum(days.map((d) => d.pnl)) + today;
  const them = sum(days.map((d) => d.rivals.find((r) => r.name === STANDING_RIVAL)?.pnl ?? 0)) + c.todayPnl;
  return { rival: STANDING_RIVAL, you, them, winning: you > them };
}
