// A venue's hours: a weekly list of open spans, counted from Monday 00:00, so a session may cross midnight (a
// futures venue's 18:00 to 17:00) or run all week (currencies). The stocks' hours are the plain case, and the
// clock (`clock.ts`) still works them out for every venue without a session of its own; `STOCK_SESSION` is
// the same hours in this form, held equal to the clock by a test.

import { MARKET_CLOSE, MARKET_OPEN, MS_PER_DAY, MS_PER_WEEK } from './clock';

export interface SessionSpec {
  /** Open spans, [start, end) in ms from Monday 00:00, sorted, not overlapping or touching, within the week. */
  readonly spans: readonly (readonly [number, number])[];
}

/** Spans in week time, any order, a span past the week's end wrapping to its start: sorted and merged. */
function normalise(raw: readonly (readonly [number, number])[]): SessionSpec {
  const pieces: [number, number][] = [];
  for (const [s, e] of raw) {
    if (e <= s) continue;
    if (e - s >= MS_PER_WEEK) return { spans: [[0, MS_PER_WEEK]] };
    const start = ((s % MS_PER_WEEK) + MS_PER_WEEK) % MS_PER_WEEK;
    const end = start + (e - s);
    if (end <= MS_PER_WEEK) pieces.push([start, end]);
    else pieces.push([start, MS_PER_WEEK], [0, end - MS_PER_WEEK]);
  }
  pieces.sort((a, b) => a[0] - b[0]);
  const spans: [number, number][] = [];
  for (const p of pieces) {
    const last = spans[spans.length - 1];
    if (last && p[0] <= last[1]) last[1] = Math.max(last[1], p[1]);
    else spans.push([p[0], p[1]]);
  }
  return { spans };
}

/**
 * Open from `open` to `close` (ms past midnight) on each of `days` (Monday 0 to Sunday 6). A close at or before
 * the open is the next day's: 18:00 to 17:00 runs overnight.
 */
export function daily(open: number, close: number, days: readonly number[]): SessionSpec {
  const length = close > open ? close - open : close + MS_PER_DAY - open;
  return normalise(days.map((d) => [d * MS_PER_DAY + open, d * MS_PER_DAY + open + length] as const));
}

/** One span from a day and time to a later day and time in the week, wrapping past Sunday: Sunday 17:00 to Friday 17:00. */
export function span(fromDay: number, fromTime: number, toDay: number, toTime: number): SessionSpec {
  const start = fromDay * MS_PER_DAY + fromTime;
  let end = toDay * MS_PER_DAY + toTime;
  if (end <= start) end += MS_PER_WEEK;
  return normalise([[start, end]]);
}

/** The stocks' hours: 09:30 to 16:00, Monday to Friday. */
export const STOCK_SESSION: SessionSpec = daily(MARKET_OPEN, MARKET_CLOSE, [0, 1, 2, 3, 4]);

/** Where spans begin from closed and end into closed: a span that runs on past the week's turn does not end there. */
function edges(s: SessionSpec): { opens: number[]; closes: number[] } {
  const opens: number[] = [];
  const closes: number[] = [];
  const n = s.spans.length;
  for (let i = 0; i < n; i++) {
    const [start, end] = s.spans[i]!;
    const prev = s.spans[(i - 1 + n) % n]!;
    const next = s.spans[(i + 1) % n]!;
    const continues = start === 0 && prev[1] === MS_PER_WEEK && n > 1;
    const runsOn = end === MS_PER_WEEK && next[0] === 0 && n > 1;
    if (!continues) opens.push(start);
    if (!runsOn) closes.push(end);
  }
  return { opens, closes };
}

const cache = new WeakMap<SessionSpec, { opens: number[]; closes: number[] }>();
function edgesOf(s: SessionSpec): { opens: number[]; closes: number[] } {
  let e = cache.get(s);
  if (!e) {
    e = edges(s);
    cache.set(s, e);
  }
  return e;
}

/** The first of `marks` (week times) strictly after `now`, in absolute time; null where there are none. */
function firstAfter(marks: readonly number[], now: number): number | null {
  if (marks.length === 0) return null;
  const week = Math.floor(now / MS_PER_WEEK) * MS_PER_WEEK;
  for (let k = 0; k < 3; k++) {
    for (const m of marks) {
      const t = week + k * MS_PER_WEEK + m;
      if (t > now) return t;
    }
  }
  return null;
}

/** The last of `marks` at or before `now`, in absolute time. */
function lastAtOrBefore(marks: readonly number[], now: number): number | null {
  if (marks.length === 0) return null;
  const week = Math.floor(now / MS_PER_WEEK) * MS_PER_WEEK;
  for (let k = 0; k < 3; k++) {
    for (let i = marks.length - 1; i >= 0; i--) {
      const t = week - k * MS_PER_WEEK + marks[i]!;
      if (t <= now) return t;
    }
  }
  return null;
}

export function isOpenIn(s: SessionSpec, now: number): boolean {
  const t = now - Math.floor(now / MS_PER_WEEK) * MS_PER_WEEK;
  for (const [start, end] of s.spans) if (t >= start && t < end) return true;
  return false;
}

/** The next moment the session opens, strictly after now. */
export function nextOpenIn(s: SessionSpec, now: number): number {
  return firstAfter(edgesOf(s).opens, now) ?? Infinity;
}

/** The next moment the session closes, strictly after now: the end of this span if open, else of the next. */
export function nextCloseIn(s: SessionSpec, now: number): number {
  return firstAfter(edgesOf(s).closes, now) ?? Infinity;
}

/**
 * How busy the venue is, nought to one: trading clusters at either end of the span it is in and goes quiet in the
 * middle, as the stocks' day does; closed, nought. A session open all week is a steady middle.
 */
export function activityIn(s: SessionSpec, now: number): number {
  if (!isOpenIn(s, now)) return 0;
  const { opens, closes } = edgesOf(s);
  const start = lastAtOrBefore(opens, now);
  const end = firstAfter(closes, now);
  if (start === null || end === null) return 0.35;
  const session = (now - start) / (end - start);
  const edge = Math.min(session, 1 - session);
  return 0.35 + 0.65 * Math.exp(-edge * 10);
}
