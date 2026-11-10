// The public calendar: the times of a day's market-wide headlines, read from the schedule the news engine already
// keeps (scheduled a day ahead, so the whole day is known at the open). Only the time and a neutral label are told:
// never the text, the direction or the size. A pure read of the schedule: it draws nothing and changes nothing.

import { MS_PER_DAY } from './clock';
import type { News } from './news';

/** What a release is called, plainly. The page's words (`CALENDAR_WORDS` in `src/content/signals.ts`) use this. */
export const CALENDAR_LABEL = 'A market release';

export interface CalendarItem {
  /** Simulated ms. */
  at: number;
  label: string;
}

/** Whether a headline is market-wide: it names no company and no sector. */
export const isMarketWide = (h: { sector: string | null }): boolean => h.sector === null;

/**
 * The market-wide releases of `day` (days since the game's epoch), by time: those already published and those still
 * scheduled. `game` is anything with the news engine, so a test or a worker can hand in the `Game`.
 */
export function calendarOf(
  game: { readonly news: Pick<News, 'scheduled' | 'published'> },
  day: number,
): CalendarItem[] {
  const from = day * MS_PER_DAY;
  const to = from + MS_PER_DAY;
  const times: number[] = [];
  for (const h of game.news.published) if (isMarketWide(h) && h.at >= from && h.at < to) times.push(h.at);
  for (const h of game.news.scheduled) if (isMarketWide(h) && h.at >= from && h.at < to) times.push(h.at);
  return times.sort((a, b) => a - b).map((at) => ({ at, label: CALENDAR_LABEL }));
}

/**
 * How many market-wide releases are still to come after `after` and no later than `upTo`: those on the schedule (a
 * release already published is behind us). What an option's expiry adds event variance for. Reads the schedule only.
 */
export function releasesBetween(news: Pick<News, 'scheduled'>, after: number, upTo: number): number {
  let n = 0;
  for (const h of news.scheduled) if (h.at > after && h.at <= upTo && isMarketWide(h)) n++;
  return n;
}
