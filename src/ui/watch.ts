// Watch mode: the speed that runs fast through the quiet and slows for the moments worth seeing. Pure: the store
// asks it, with the clock and the sim's public schedule, and runs the sim as it says. It is told when headlines
// landed, never ahead of an unannounced headline (when one will): the schedule is the sim's, and slowing ahead of company or sector news
// would tell the player it was coming. A market-wide release is different: its time is public (the economic
// calendar), so it is a moment like a fix.

import { WATCH_LEAD, WATCH_TAIL, fineWindow, type NextMoment } from '../sim';

export { WATCH_LEAD, WATCH_TAIL };

/** The speed through the quiet: the top one. */
export const WATCH_FAST = 300;
/** The speed for the stretch around a moment. */
export const WATCH_SLOW = 1;
/** The speed the sim is set to while watching, so a reader of a save that knows no watch sees the top speed. */
export const WATCH_SPEED = WATCH_FAST;
/** The store's key for the choice: '1' while watching. */
export const WATCH_KEY = 'propshop.watch.v1';

export interface WatchDecision {
  /** Simulated ms per wall ms. */
  speed: number;
  /** Why it is slow: a public moment (its lead or tail), or a headline's tail; null when fast. */
  slow: 'moment' | 'headline' | null;
  /** The simulated time at which this answer may next change; the store cuts its chunk to land there. */
  until: number;
}

/**
 * The speed at `now`. `next` is the sim's next public moment, `lastMoment` the time of the last one that has come
 * (null if none is known), `lastHeadline` the time the last headline landed. Slow from `WATCH_LEAD` before `next` to
 * `WATCH_TAIL` after it, and for `WATCH_TAIL` after a headline; where tails overlap or meet it stays slow until the
 * later one ends, so two moments close together do not flicker up to the top speed between.
 */
export function watchSpeed(
  now: number,
  next: NextMoment | null,
  lastMoment: number | null,
  lastHeadline: number | null,
): WatchDecision {
  const w = fineWindow(now, next ? next.at : null, lastMoment, lastHeadline);
  if (w.slow !== null) return { speed: WATCH_SLOW, slow: w.slow as 'moment' | 'headline', until: w.until };
  return { speed: WATCH_FAST, slow: null, until: w.until };
}
