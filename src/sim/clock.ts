// Simulated time. The sim counts milliseconds from midnight on the Monday the game starts, and this file turns
// that number into a weekday, a time of day and whether the market is open. Nothing here reads the wall clock.

export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;
export const MS_PER_WEEK = 7 * MS_PER_DAY;
/** A year of carry: 365 days. */
export const MS_PER_YEAR = 365 * MS_PER_DAY;

/** The market opens at 09:30 and closes at 16:00, Monday to Friday. */
export const MARKET_OPEN = 9 * MS_PER_HOUR + 30 * MS_PER_MINUTE;
export const MARKET_CLOSE = 16 * MS_PER_HOUR;

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface Calendar {
  /** Days since the game began, Monday of week one being day zero. */
  day: number;
  /** Weeks since the game began, from one. */
  week: number;
  weekday: Weekday;
  /** Milliseconds since midnight. */
  timeOfDay: number;
  open: boolean;
}

export function isWeekday(day: number): boolean {
  return day % 7 < 5;
}

export function calendar(now: number): Calendar {
  const day = Math.floor(now / MS_PER_DAY);
  const timeOfDay = now - day * MS_PER_DAY;
  return {
    day,
    week: Math.floor(day / 7) + 1,
    weekday: WEEKDAYS[day % 7] ?? 'Mon',
    timeOfDay,
    open: isWeekday(day) && timeOfDay >= MARKET_OPEN && timeOfDay < MARKET_CLOSE,
  };
}

export function isMarketOpen(now: number): boolean {
  return calendar(now).open;
}

/** The next moment the market opens, strictly after now if it is open now. */
export function nextOpen(now: number): number {
  let day = Math.floor(now / MS_PER_DAY);
  if (now - day * MS_PER_DAY >= MARKET_OPEN) day += 1;
  while (!isWeekday(day)) day += 1;
  return day * MS_PER_DAY + MARKET_OPEN;
}

/** The next moment the market closes: the end of today's session if it is open, else the end of the next one. */
export function nextClose(now: number): number {
  const day = Math.floor(now / MS_PER_DAY);
  if (isWeekday(day) && now - day * MS_PER_DAY < MARKET_CLOSE) return day * MS_PER_DAY + MARKET_CLOSE;
  return nextOpen(now) - MARKET_OPEN + MARKET_CLOSE;
}

/**
 * How busy the market is at this time of day, from zero to one: trading clusters at the open and the close
 * and goes quiet over lunch. Closed hours are zero.
 */
export function activity(now: number): number {
  const c = calendar(now);
  if (!c.open) return 0;
  const session = (c.timeOfDay - MARKET_OPEN) / (MARKET_CLOSE - MARKET_OPEN);
  const edge = Math.min(session, 1 - session);
  return 0.35 + 0.65 * Math.exp(-edge * 10);
}

/** hh:mm:ss, for logs and the top bar. */
export function formatTime(now: number): string {
  const { timeOfDay } = calendar(now);
  const h = Math.floor(timeOfDay / MS_PER_HOUR);
  const m = Math.floor((timeOfDay % MS_PER_HOUR) / MS_PER_MINUTE);
  const s = Math.floor((timeOfDay % MS_PER_MINUTE) / MS_PER_SECOND);
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** A span of time in words: "2h 14m", "38s", "450ms". */
export function formatSpan(ms: number): string {
  if (ms < MS_PER_SECOND) return `${Math.round(ms)}ms`;
  if (ms < MS_PER_MINUTE) return `${Math.floor(ms / MS_PER_SECOND)}s`;
  if (ms < MS_PER_HOUR)
    return `${Math.floor(ms / MS_PER_MINUTE)}m ${Math.floor((ms % MS_PER_MINUTE) / MS_PER_SECOND)}s`;
  if (ms < MS_PER_DAY) return `${Math.floor(ms / MS_PER_HOUR)}h ${Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE)}m`;
  return `${Math.floor(ms / MS_PER_DAY)}d ${Math.floor((ms % MS_PER_DAY) / MS_PER_HOUR)}h`;
}
