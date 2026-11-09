// What the Overview page works out from the reports and the nights' tests: verdicts, records, payback, trends.
// Pure, no React and no state; the page only presents it. Money in cents.

import { shows, type StageId } from '../content';
import { answerOf, type Answer } from '../content/experiments';
import { BLOCKS, paramChangeLabel, type DayReport, type Measures, type Snapshot } from '../sim';
import type { Change, Night, StoredMeasures } from './nights';

/** The length of a full session in minutes: a payback scales the tested minutes up to it. */
export const SESSION_MINUTES = 390;

/** "better" and "worse" in a word, so a colour never carries them alone. */
export const VERDICT_WORD: Record<Answer, string> = { better: 'better', same: 'about the same', worse: 'worse' };

export function blockName(id: string): string {
  return BLOCKS.find((b) => b.spec.id === id)?.spec.name ?? (id === 'hand' ? 'Hand trades' : id);
}

const net = (t: { realised: number; fees: number }): number => t.realised - t.fees;
const sum = (xs: readonly number[]): number => xs.reduce((n, x) => n + x, 0);

/** The experiments' band, on two stored measures of one window: `answerOf` reads only the P&L. */
export function windowVerdict(baseline: StoredMeasures, variant: StoredMeasures): Answer {
  return answerOf({ ...baseline, beaten: [] }, { ...variant, beaten: [] });
}

export interface WindowCell {
  pin: string;
  /** Null where the variant or the baseline has no run of this window. */
  pnl: number | null;
  races: number | null;
  fees: number | null;
  verdict: Answer | null;
}

export interface ComparisonRow {
  id: string;
  label: string;
  kind: string;
  price: number | undefined;
  about: string | undefined;
  /** The ids of the signals that asked for this variant. */
  signals: string[];
  windows: WindowCell[];
  /** Over the windows both it and the baseline ran. */
  total: { pnl: number; races: number; fees: number; verdict: Answer | null };
  /** Windows compared, and how each went. */
  compared: number;
  better: number;
  worse: number;
  same: number;
  /** `better` or `worse` when every compared window said so; `same` likewise; else `mixed`; `none` with no window. */
  tag: 'better' | 'worse' | 'same' | 'mixed' | 'none';
  /**
   * Where every window is about the same but the variant sits on one side of the baseline in each of two or more:
   * a consistent lean is worth a second night even when no window clears the noise. Null otherwise.
   */
  lean: 'higher' | 'lower' | null;
  /** "better in 3 of 3 windows", or "mixed: better in 2 of 3 windows, about the same in 1". */
  summary: string;
  /** The extra P&L over the baseline across the compared windows. */
  gain: number;
  /** Minutes tested: the compared windows' length. */
  minutes: number;
  /** Days to pay the price back at the measured gain, a rough extrapolation; null where there is none. */
  payback: number | null;
}

const racesOf = (m: StoredMeasures): number => m.races.won + m.races.beaten + m.races.missed;

/**
 * Days to pay `price` back if the tested gain held for a full session: the gain over `minutes` tested is scaled to
 * `SESSION_MINUTES`. Null where the gain is not above nought, the price is missing or nothing was tested.
 */
export function paybackDays(price: number | undefined, gain: number, minutes: number): number | null {
  if (price === undefined || price <= 0 || !(gain > 0) || !(minutes > 0)) return null;
  const perDay = (gain * SESSION_MINUTES) / minutes;
  return price / perDay;
}

/** "under a day", "about 3 days": the payback in words, for the page. */
export function paybackText(days: number): string {
  if (days < 1) return 'under a day';
  if (days < 10) return `about ${days < 1.5 ? 1 : Math.round(days)} day${Math.round(days) === 1 ? '' : 's'}`;
  return `about ${Math.round(days)} days`;
}

/** The ids of the windows a night ran, in the order they were pinned. */
function windowsOf(night: Night): Night['pins'] {
  return night.pins;
}

function runOf(night: Night, variantId: string, pin: string) {
  return night.runs.find((r) => r.variantId === variantId && r.pin === pin);
}

/** "better in 1 of 3 windows, about the same in 2": only the verdicts that happened, the first with its "of N". */
function mixedParts(better: number, worse: number, same: number, compared: number): string {
  const parts = (
    [
      ['better', better],
      ['worse', worse],
      ['about the same', same],
    ] as const
  ).filter(([, n]) => n > 0);
  return parts
    .map(([word, n], i) => (i === 0 ? `${word} in ${n} of ${compared} windows` : `${word} in ${n}`))
    .join(', ');
}

/** The night as a table of rows: the baseline first, then each variant, each against the baseline on the same window. */
export function compare(night: Night): ComparisonRow[] {
  const pins = windowsOf(night);
  return night.variants.map((v) => {
    const windows: WindowCell[] = pins.map((p) => {
      const mine = runOf(night, v.id, p.label);
      const base = runOf(night, 'baseline', p.label);
      return {
        pin: p.label,
        pnl: mine ? mine.measures.pnl : null,
        races: mine ? racesOf(mine.measures) : null,
        fees: mine ? mine.measures.fees : null,
        verdict: mine && base && v.id !== 'baseline' ? windowVerdict(base.measures, mine.measures) : null,
      };
    });
    const both = pins
      .map((p) => ({ mine: runOf(night, v.id, p.label), base: runOf(night, 'baseline', p.label) }))
      .filter((x) => x.mine && x.base);
    const shown = pins.map((p) => runOf(night, v.id, p.label)).filter((r) => r !== undefined);
    const compared = v.id === 'baseline' ? 0 : both.length;
    const count = (a: Answer) => windows.filter((w) => w.verdict === a).length;
    const better = count('better');
    const worse = count('worse');
    const same = count('same');
    const mine = both.map((x) => x.mine!.measures);
    const base = both.map((x) => x.base!.measures);
    const gain = sum(mine.map((m) => m.pnl)) - sum(base.map((m) => m.pnl));
    const minutes = (compared * night.windowMs) / 60_000;
    const totalVerdict: Answer | null =
      compared === 0
        ? null
        : answerOf({ pnl: sum(base.map((m) => m.pnl)) } as Measures, { pnl: sum(mine.map((m) => m.pnl)) } as Measures);
    let tag: ComparisonRow['tag'] = 'none';
    let summary = 'no window ran';
    let lean: ComparisonRow['lean'] = null;
    if (compared > 0) {
      if (better === compared) tag = 'better';
      else if (worse === compared) tag = 'worse';
      else if (same === compared) tag = 'same';
      else tag = 'mixed';
      if (tag === 'same' && compared >= 2) {
        if (both.every((x) => x.mine!.measures.pnl > x.base!.measures.pnl)) lean = 'higher';
        else if (both.every((x) => x.mine!.measures.pnl < x.base!.measures.pnl)) lean = 'lower';
      }
      summary =
        tag === 'better'
          ? `better in ${better} of ${compared} windows`
          : tag === 'worse'
            ? `worse in ${worse} of ${compared} windows`
            : tag === 'same'
              ? `about the same in ${same} of ${compared} windows${lean ? `, though ${lean} in every one` : ''}`
              : `mixed: ${mixedParts(better, worse, same, compared)}`;
    }
    return {
      id: v.id,
      label: v.label,
      kind: v.kind,
      price: v.price,
      about: v.about,
      signals: v.signals,
      windows,
      total: {
        pnl: sum(shown.map((r) => r.measures.pnl)),
        races: sum(shown.map((r) => racesOf(r.measures))),
        fees: sum(shown.map((r) => r.measures.fees)),
        verdict: totalVerdict,
      },
      compared,
      better,
      worse,
      same,
      tag,
      lean,
      summary,
      gain,
      minutes,
      // A gain inside the noise band pays back nothing: "about the same" is not a reason to buy.
      payback:
        (v.kind === 'upgrade' || v.kind === 'player') && totalVerdict === 'better'
          ? paybackDays(v.price, gain, minutes)
          : null,
    };
  });
}

export interface NightRecord {
  id: string;
  label: string;
  nights: number;
  better: number;
  worse: number;
  same: number;
  /** "better on 4 of 5 nights". */
  text: string;
}

/**
 * For each variant id tested on more than one night, how its nights went: a night counts by its total over the
 * windows it ran, against the baseline's on the same windows. Latest label wins.
 */
export function recordOverNights(nights: readonly Night[]): NightRecord[] {
  const by = new Map<string, { label: string; verdicts: Answer[] }>();
  for (const n of nights) {
    for (const row of compare(n)) {
      if (row.id === 'baseline' || row.compared === 0 || row.total.verdict === null) continue;
      const e = by.get(row.id) ?? { label: row.label, verdicts: [] };
      e.label = row.label;
      e.verdicts.push(row.total.verdict);
      by.set(row.id, e);
    }
  }
  const out: NightRecord[] = [];
  for (const [id, e] of by) {
    if (e.verdicts.length < 2) continue;
    const c = (a: Answer) => e.verdicts.filter((v) => v === a).length;
    const better = c('better');
    out.push({
      id,
      label: e.label,
      nights: e.verdicts.length,
      better,
      worse: c('worse'),
      same: c('same'),
      text: `better on ${better} of ${e.verdicts.length} nights`,
    });
  }
  return out.sort(
    (a, b) => b.better / b.nights - a.better / a.nights || b.nights - a.nights || a.id.localeCompare(b.id),
  );
}

/** The latest night that has at least one run, or null. */
export function latestWithRuns(nights: readonly Night[]): Night | null {
  for (let i = nights.length - 1; i >= 0; i--) if (nights[i]!.runs.length > 0) return nights[i]!;
  return null;
}

/** Yesterday in a sentence: the best block, and the share of races won. */
export function dayVerdict(d: DayReport): string {
  const blocks = Object.entries(d.byBlock);
  if (blocks.length === 0) return 'nothing traded';
  const best = blocks.reduce((a, b) => (net(b[1]) > net(a[1]) ? b : a));
  const races = d.races.won + d.races.beaten + d.races.missed;
  const won = races > 0 ? `${Math.round((100 * d.races.won) / races)}% of races won` : 'no races';
  return `${blockName(best[0])} did best, ${won}`;
}

/** This calendar week's result: the closed days of the week, and the day in progress. */
export function weekPnl(days: readonly DayReport[], week: number, today: number): number {
  return sum(days.filter((d) => d.week === week).map((d) => d.pnl)) + today;
}

export interface BlockDays {
  /** The block ids with any fills over the days kept, in the order first seen. */
  blocks: string[];
  /** Net after fees for each block on each day, oldest first; 0 where it did not run. */
  series: Record<string, number[]>;
}

/** Net per block per day over the days kept, for the blocks `keep` allows. */
export function blockDays(days: readonly DayReport[], keep: (block: string) => boolean = () => true): BlockDays {
  const blocks: string[] = [];
  for (const d of days)
    for (const [id, t] of Object.entries(d.byBlock))
      if (t.fills > 0 && keep(id) && !blocks.includes(id)) blocks.push(id);
  const series: Record<string, number[]> = {};
  for (const b of blocks) series[b] = days.map((d) => (d.byBlock[b] ? net(d.byBlock[b]) : 0));
  return { blocks, series };
}

/** Share of the day's races won, per day: null where there were none. */
export function raceShares(days: readonly DayReport[]): (number | null)[] {
  return days.map((d) => {
    const n = d.races.won + d.races.beaten + d.races.missed;
    return n > 0 ? d.races.won / n : null;
  });
}

/** Fees over gross (realised, before fees) per day: null where the day made no gross. */
export function feeShares(days: readonly DayReport[]): (number | null)[] {
  return days.map((d) => {
    const gross = sum(Object.values(d.byBlock).map((t) => t.realised));
    const fees = sum(Object.values(d.byBlock).map((t) => t.fees));
    return gross > 0 ? fees / gross : null;
  });
}

/** The nearest exchange's latency in a day's report, ms; null where there is none. */
export function nearest(latency: Record<string, number>): number | null {
  const v = Object.values(latency);
  return v.length ? Math.min(...v) : null;
}

export interface RegimeCell {
  /** Mean net per day it ran, cents. */
  avg: number;
  days: number;
}

export interface RegimeTable {
  regimes: string[];
  rows: { block: string; cells: Record<string, RegimeCell | undefined> }[];
}

/** Each block's average day by kind of day, over the days kept that name one. */
export function regimeTable(days: readonly DayReport[], keep: (block: string) => boolean = () => true): RegimeTable {
  const regimes: string[] = [];
  const acc = new Map<string, Map<string, number[]>>();
  for (const d of days) {
    if (!d.regime) continue;
    if (!regimes.includes(d.regime)) regimes.push(d.regime);
    for (const [id, t] of Object.entries(d.byBlock)) {
      if (t.fills === 0 || !keep(id)) continue;
      const byRegime = acc.get(id) ?? new Map<string, number[]>();
      byRegime.set(d.regime, [...(byRegime.get(d.regime) ?? []), net(t)]);
      acc.set(id, byRegime);
    }
  }
  const rows = [...acc.entries()].map(([block, byRegime]) => ({
    block,
    cells: Object.fromEntries([...byRegime.entries()].map(([k, v]) => [k, { avg: sum(v) / v.length, days: v.length }])),
  }));
  return { regimes, rows };
}

/** Whether the stage shows a block in the Overview's charts and tables: the hand's trades belong to the desk. */
export function blockShown(id: string, stage: StageId): boolean {
  return BLOCKS.some((b) => b.spec.id === id) ? shows(`block:${id}`, stage) : shows('page:desk', stage);
}

/** The name of a window of the day, for a column. */
export function windowLabel(pin: string): string {
  return pin === 'open' ? 'Open' : pin === 'headline' ? 'Before a headline' : pin === 'afternoon' ? '14:30' : pin;
}

/** The firm's setup in a line: where, which link, which computer, which blocks run. */
export function setupLine(s: Snapshot): string {
  const used = (kind: string) => s.shop.find((o) => o.kind === kind && o.inUse)?.spec.name ?? '—';
  const blocks = s.blocks.filter((b) => b.enabled).map((b) => blockName(b.id));
  return `${used('location')} · ${used('network')} · ${used('computer')} · ${blocks.length ? blocks.join(', ') : 'no blocks running'}`;
}

/** The player's queued change in words, from the firm as it is now. */
export function describeChange(change: Change, s: Snapshot): string {
  if (change.kind === 'upgrade') {
    const o = s.shop.find((x) => x.kind === change.upgradeKind && x.spec.id === change.id);
    return o ? `${o.spec.name} (${o.owned ? 'owned' : 'to buy'})` : change.id;
  }
  const spec = BLOCKS.find((b) => b.spec.id === change.block)?.spec;
  const name = spec?.name ?? change.block;
  if (change.kind === 'toggle') {
    const on = s.blocks.find((b) => b.id === change.block)?.enabled ?? false;
    return `${name} switched ${on ? 'off' : 'on'}`;
  }
  const p = spec?.params.find((x) => x.key === change.key);
  return p ? paramChangeLabel(name, p, change.value) : `${name}: ${change.key} to ${change.value}`;
}

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** A day number (days since the game began) as "Mon, week 1". */
export function dayName(day: number): string {
  return `${WEEKDAY_NAMES[((day % 7) + 7) % 7]}, week ${Math.floor(day / 7) + 1}`;
}
