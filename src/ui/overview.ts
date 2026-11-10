// What the Overview page works out from the reports and the nights' tests: verdicts, records, payback, trends.
// Pure, no React and no state; the page only presents it. Money in cents.

import {
  BLOCK_VERDICT_WORDS,
  CALENDAR_WORDS,
  DAY_CAUSE_TERM,
  DAY_CAUSE_WORDS,
  EXPIRY_CAUSE_TERM,
  OPTIONS_WORDS,
  OVERVIEW_COMING_WORDS,
  RIVAL_DAY_WORDS,
  RIVAL_TERM,
  shows,
  type StageId,
  type TargetProgress,
} from '../content';
import { answerOf, type Answer } from '../content/experiments';
import {
  BLOCKS,
  MS_PER_YEAR,
  STOCKS_DESK,
  formatTime,
  optionPrice,
  paramChangeLabel,
  type DayReport,
  type HeldOption,
  type Measures,
  type Snapshot,
  type UpgradeOffer,
} from '../sim';
import { dollarPrice, money, ms } from './format';
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

// ---------------------------------------------------------------------------------------------------------------
// Part A of play-and-learn: what the Overview shows and when, a block's record, why a day went as it did, which
// venues and currencies are worth a row, and the shop's latency for the venues the firm trades.

export interface OverviewShown {
  trends: boolean;
  comparisons: boolean;
  signals: boolean;
}

/** The Overview's sections beyond Position and Today: Trends and Comparisons from the first close, Signals when one is raised. */
export function overviewShown(
  days: readonly DayReport[],
  nights: readonly Night[],
  signalCount: number,
): OverviewShown {
  const closed = days.length > 0 || nights.length > 0;
  return { trends: closed, comparisons: closed, signals: signalCount > 0 };
}

/** One muted line on what is still to come and when; null once every section is shown. */
export function comingLine(shown: OverviewShown): string | null {
  if (!shown.trends) return OVERVIEW_COMING_WORDS.first;
  if (!shown.signals) return OVERVIEW_COMING_WORDS.signals;
  return null;
}

export interface BlockRecord {
  /** Days kept on which the block filled. */
  days: number;
  fills: number;
  /** Realised before fees, and fees, and the net of the two, cents, over the days kept. */
  gross: number;
  fees: number;
  net: number;
}

/** A block's record over the days kept (the sim keeps 60). */
export function blockRecord(days: readonly DayReport[], id: string): BlockRecord {
  const r: BlockRecord = { days: 0, fills: 0, gross: 0, fees: 0, net: 0 };
  for (const d of days) {
    const t = d.byBlock[id];
    if (!t || t.fills === 0) continue;
    r.days += 1;
    r.fills += t.fills;
    r.gross += t.realised;
    r.fees += t.fees;
  }
  r.net = r.gross - r.fees;
  return r;
}

export type BlockVerdictKind = 'none' | 'earns' | 'fees' | 'loses';

/** Has not traded; earns; the signal earns but the fees take it (gross above nought, net below); the signal itself loses (gross below nought). */
export function blockVerdict(r: BlockRecord): { kind: BlockVerdictKind; text: string; term: string | null } {
  const kind: BlockVerdictKind = r.fills === 0 ? 'none' : r.gross < 0 ? 'loses' : r.net < 0 ? 'fees' : 'earns';
  return { kind, ...BLOCK_VERDICT_WORDS[kind] };
}

export interface DayCause {
  kind: 'fees' | 'fines' | 'rent' | 'rollover' | 'storage' | 'expiry' | 'block' | 'symbol' | 'rival' | 'quiet';
  /** Cents, signed: what it did to the day. */
  amount: number;
  text: string;
  term: string | null;
}

/**
 * Of fees, fines, rent, rollover, storage, the worst block's net and the worst stock's net, the largest loss, for a day
 * that lost; for a day that earned, the largest gain among the ones that can gain. A tie goes to the first listed.
 */
export function dayCause(d: DayReport): DayCause {
  const gain = d.pnl >= 0;
  const candidates: { kind: DayCause['kind']; amount: number; text: (a: string) => string }[] = [];
  const add = (kind: DayCause['kind'], amount: number, text: (a: string) => string) => {
    if (gain ? amount > 0 : amount < 0) candidates.push({ kind, amount, text });
  };
  add('fees', -d.fees, DAY_CAUSE_WORDS.fees);
  add('fines', -d.fines, DAY_CAUSE_WORDS.fines);
  add('rent', -(d.rent ?? 0), DAY_CAUSE_WORDS.rent);
  if (d.rollover !== undefined) add('rollover', d.rollover, (a) => DAY_CAUSE_WORDS.rollover(a, gain));
  if (d.storage !== undefined) add('storage', d.storage, (a) => DAY_CAUSE_WORDS.storage(a, gain));
  // What the options held to the close settled for, against their cost: not in any fill, so named on its own.
  const expiry = sum((d.expired ?? []).map((x) => x.made));
  if (d.expired) add('expiry', expiry, (a) => DAY_CAUSE_WORDS.expiry(a, gain));
  const pick = (tallies: Record<string, { realised: number; fees: number }>) => {
    const rows = Object.entries(tallies).map(([id, t]) => [id, net(t)] as const);
    if (rows.length === 0) return null;
    return rows.reduce((a, b) => (gain ? (b[1] > a[1] ? b : a) : b[1] < a[1] ? b : a));
  };
  const block = pick(d.byBlock);
  if (block) add('block', block[1], (a) => DAY_CAUSE_WORDS.block(blockName(block[0]), a, gain));
  const symbol = pick(d.bySymbol);
  if (symbol) add('symbol', symbol[1], (a) => DAY_CAUSE_WORDS.symbol(symbol[0], a, gain));
  // What rivals took off resting quotes is a mark-out, not a charge: it can only explain a day that lost.
  const taken = Object.entries(d.takenBy ?? {}).sort((a, b) => b[1].cents - a[1].cents)[0];
  const takenTotal = sum(Object.values(d.takenBy ?? {}).map((t) => t.cents));
  if (taken && !gain && takenTotal > 0) add('rival', -takenTotal, (a) => DAY_CAUSE_WORDS.rival(taken[0], a));
  let best: (typeof candidates)[number] | undefined;
  for (const c of candidates) if (!best || Math.abs(c.amount) > Math.abs(best.amount)) best = c;
  if (!best) return { kind: 'quiet', amount: 0, text: DAY_CAUSE_WORDS.quiet, term: null };
  return {
    kind: best.kind,
    amount: best.amount,
    text: best.text(money(Math.abs(best.amount))),
    term: best.kind === 'expiry' ? EXPIRY_CAUSE_TERM : DAY_CAUSE_TERM,
  };
}

/** One line of the day's expiry: an option held to the close, what it settled at and what that was worth. */
export interface ExpiryLine {
  symbol: string;
  text: string;
  /** In the money at the close: it paid something. */
  inTheMoney: boolean;
}

/** The options the firm held to the close, a line each, in the order they were settled. */
export function expiryLines(d: Pick<DayReport, 'expired'>): ExpiryLine[] {
  return (d.expired ?? []).map((x) => {
    const held = OPTIONS_WORDS.expiryLine(x.qty, x.right, x.symbol, dollarPrice(x.strike));
    const settle =
      x.settled > 0
        ? OPTIONS_WORDS.settledIn(dollarPrice(x.settled), money(Math.abs(x.cash)), x.cash >= 0)
        : OPTIONS_WORDS.settledOut;
    return {
      symbol: x.symbol,
      inTheMoney: x.settled > 0,
      text: `${held}: ${settle}, ${OPTIONS_WORDS.againstCost(money(x.made, true))}`,
    };
  });
}

/** The smallest volatility the what-if leaves an option: a move down never takes it to nought. */
export const SCENARIO_MIN_VOL = 0.01;

/**
 * The options desk revalued in a what-if, in cents: the model's price of each option held with the index moved by
 * `indexMove` (a share, 0.02 is up 2%) and its volatility by `volMove` (points, 5 is five up), less its price now, over
 * the contracts and their multipliers. At once, with the time left as it is. Pure: it touches no game.
 */
export function scenario(
  positions: readonly HeldOption[],
  indexMove: number,
  volMove: number,
  ctx: { spot: number; rate: number; now: number },
): number {
  let total = 0;
  for (const o of positions) {
    const t = Math.max(0, o.expiry - ctx.now) / MS_PER_YEAR;
    const vol = Math.max(SCENARIO_MIN_VOL, o.vol + volMove / 100);
    const before = optionPrice(o.right, ctx.spot, o.strike, t, o.vol, ctx.rate);
    const after = optionPrice(o.right, ctx.spot * (1 + indexMove), o.strike, t, vol, ctx.rate);
    total += o.qty * o.multiplier * (after - before);
  }
  return total === 0 ? 0 : total;
}

/** The desk's greeks as Position says them: delta in index units, the futures that would hedge it, and the rest. */
export interface DeskGreeks {
  /** The options held, and the contracts net of long and short. */
  held: number;
  contracts: number;
  delta: number;
  /** Futures to trade to cancel the delta: positive is buy, negative sell. */
  hedge: number;
  gamma: number;
  theta: number;
  vega: number;
}

/** The index future's multiplier where the snapshot lists none of its futures: a hundred, as the chain's contracts are. */
const FUTURE_MULTIPLIER = 100;

/** The options desk's totals from the snapshot, or null while the desk is closed. */
export function deskGreeks(s: Pick<Snapshot, 'options' | 'stocks'>): DeskGreeks | null {
  const o = s.options;
  if (!o) return null;
  const future = s.stocks.find((x) => x.contract?.underlying === o.underlying);
  const lot = future?.contract?.multiplier ?? FUTURE_MULTIPLIER;
  return {
    held: o.held.length,
    contracts: sum(o.held.map((h) => h.qty)),
    delta: o.greeks.delta,
    hedge: -o.greeks.delta / lot,
    gamma: o.greeks.gamma,
    theta: o.greeks.theta,
    vega: o.greeks.vega,
  };
}

/** The orders sent since midnight of the game's day: the snapshot keeps the last few, of this day and the last. */
export function ordersToday(s: Pick<Snapshot, 'now' | 'calendar' | 'orders'>): Snapshot['orders'] {
  const start = s.now - s.calendar.timeOfDay;
  return s.orders.filter((o) => o.sentAt >= start);
}

/** The races table's venues: the stocks' always, another desk's once an order has gone to it today. */
export function racesVenues(s: Pick<Snapshot, 'now' | 'calendar' | 'orders' | 'exchanges'>): Snapshot['exchanges'] {
  const used = new Set(ordersToday(s).map((o) => o.exchange));
  return s.exchanges.filter((e) => e.desk === STOCKS_DESK || used.has(e.id));
}

/** A currency is worth a row once it is non-zero, or once a day report has fills on the currencies desk. */
export function shownBalances(s: Pick<Snapshot, 'balances' | 'days'>): Snapshot['balances'] {
  const traded = s.days.some((d) => (d.byDesk?.fx?.fills ?? 0) > 0);
  return s.balances.filter((b) => traded || b.amount !== 0);
}

/** The venues the firm trades: those of the instruments it watches and those of today's orders, in the order met. */
export function tradedVenues(s: Pick<Snapshot, 'now' | 'calendar' | 'orders' | 'stocks'>): string[] {
  const out: string[] = [];
  const add = (id: string) => void (out.includes(id) || out.push(id));
  for (const st of s.stocks) if (st.watched) for (const e of st.exchanges) add(e.id);
  for (const o of ordersToday(s)) add(o.exchange);
  return out;
}

/**
 * An offer's latency to the venues the firm trades, "HARBOR 12ms → 600µs" (the offer in use has no before; data that
 * lags the orders is said), and the rest of the venues, for a fold.
 */
export function shopLatency(
  o: Pick<UpgradeOffer, 'latency' | 'dataLatency'> & { inUse?: boolean },
  s: Pick<Snapshot, 'now' | 'calendar' | 'orders' | 'stocks' | 'latency'>,
): { traded: string; rest: string } {
  const traded = tradedVenues(s);
  const ids = Object.keys(o.latency);
  // A firm that trades none of them (no instrument watched) is shown them all rather than none.
  const mine = ids.filter((e) => traded.includes(e));
  const first = mine.length > 0 ? mine : ids;
  const line = (e: string) => {
    const next = o.latency[e]!;
    const data = o.dataLatency[e] ?? next;
    const before = s.latency[e];
    const head = o.inUse || before === undefined ? `${e} ${ms(next)}` : `${e} ${ms(before)} → ${ms(next)}`;
    return data === next ? head : `${head}, data ${ms(data)}`;
  };
  return {
    traded: first.map(line).join(', '),
    rest: ids
      .filter((e) => !first.includes(e))
      .map((e) => `${e} ${ms(o.latency[e]!)}`)
      .join(', '),
  };
}

/** One rival's day, in a sentence: the quotes it took off the firm and the races it won. */
export interface RivalLine {
  name: string;
  text: string;
  term: string;
}

/** A sentence a rival that took a quote or won a race that day, the one with more taken first; none for a quiet day. */
export function rivalLines(d: Pick<DayReport, 'takenBy' | 'beatenBy'>): RivalLine[] {
  const names = new Set([...Object.keys(d.takenBy ?? {}), ...Object.keys(d.beatenBy ?? {})]);
  const lines: (RivalLine & { weight: number })[] = [];
  for (const name of names) {
    const taken = d.takenBy?.[name];
    const beaten = d.beatenBy?.[name];
    if (!(taken?.count || beaten?.count)) continue;
    const parts: string[] = [];
    if (taken?.count) parts.push(RIVAL_DAY_WORDS.taken(name, taken.count, taken.cents > 0 ? money(taken.cents) : null));
    if (beaten?.count) {
      const b = RIVAL_DAY_WORDS.beaten(beaten.count, ms(beaten.medianMs));
      parts.push(taken?.count ? `and ${b}` : `${name} ${b}`);
    }
    lines.push({
      name,
      // A name that is not a proper one ("the crowd") still opens the sentence with a capital.
      text: `${parts.join(', ').replace(/^./, (c) => c.toUpperCase())}.`,
      term: RIVAL_TERM,
      weight: (taken?.count ?? 0) + (beaten?.count ?? 0),
    });
  }
  return lines.sort((a, b) => b.weight - a.weight).map(({ weight: _w, ...l }) => l);
}

export interface RivalRow {
  id: string;
  name: string;
  location: string;
  /** The names of the blocks it runs. */
  runs: string[];
  today: { count: number; cents: number };
  /** This week's closed days, and today while it is still open (after the close today is one of them). */
  week: { count: number; cents: number };
}

/** Each rival with what it runs, where it sits, and what it took off the firm's quotes today and this week. */
export function rivalRows(s: Pick<Snapshot, 'competitors' | 'takenToday' | 'days' | 'calendar'>): RivalRow[] {
  const week = s.days.filter((d) => d.week === s.calendar.week);
  // The day's tally is kept until the next open, so once the day has closed it is already in `days`.
  const live = s.calendar.open;
  return s.competitors.map((c) => {
    const today = s.takenToday[c.name] ?? { count: 0, cents: 0 };
    const open = live ? today : { count: 0, cents: 0 };
    const mine = week.map((d) => d.takenBy?.[c.name]).filter((t): t is { count: number; cents: number } => !!t);
    return {
      id: c.id,
      name: c.name,
      location: c.location,
      runs: c.runs.map(blockName),
      today: { ...today },
      week: { count: open.count + sum(mine.map((t) => t.count)), cents: open.cents + sum(mine.map((t) => t.cents)) },
    };
  });
}

/** A target's two figures as the page shows them: "$1,240 of $2,000", "3 of 5 days". */
export function progressText(p: TargetProgress): string {
  if (p.unit === 'cents') return `${money(p.have)} of ${money(p.of)}`;
  return `${p.have} of ${p.of} ${p.of === 1 ? 'day' : 'days'}`;
}

/** The day's market releases as the page says them: "10:42, 14:05", or `none` when the day has none. */
export function releaseTimes(releases: readonly { at: number }[]): string {
  if (releases.length === 0) return CALENDAR_WORDS.none;
  return releases.map((r) => formatTime(r.at).slice(0, 5)).join(', ');
}
