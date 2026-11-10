// The rough fast-forward (plans/rough-speed.md): which step comes next. At the top speed the store steps `ROUGH_MS`
// through the quiet and `TICK_MS` around the moments worth seeing, and this is the pure chooser. The windows are
// watch mode's: `WATCH_LEAD` before each public moment, `WATCH_TAIL` after it and after any headline. It reads game
// state and nothing else (no wall clock, no stream), so one speed history replays to one game.

import { ROUGH_MS, TICK_MS, type Game } from './game';

/** Simulated ms at 1× before a public moment that watch mode slows from, and the rough stride goes exact. A draft. */
export const WATCH_LEAD = 5000;
/** Simulated ms at 1× after a public moment, or after a headline lands, that watch mode stays slow for. A draft. */
export const WATCH_TAIL = 10_000;

/** What `strideAt` reads: the clock and the sim's public schedule, and the last moment and headline to come. */
export interface StrideView {
  now: number;
  /** The next public moment (`Game.nextMoment`), or null. */
  nextAt: number | null;
  /** The last public moment that has come, or null if none is known. */
  lastMoment: number | null;
  /** The time the last headline landed, of any kind, or null. */
  lastHeadline: number | null;
  /** The time of the player's last action (a hand order, a block switched on, a parameter changed), or null. */
  lastAction: number | null;
  /** How long before `nextAt` the exact window begins: `WATCH_LEAD`, and a fix's whole call before a fix. */
  lead: number;
  /** The next time a step must land on (`Game.nextLanding`): a scheduled headline or a venue's open or close. */
  landing: number | null;
}

/** Why the game is exact at `now`, and the simulated time at which the answer may next change. */
export interface FineWindow {
  /** A public moment (its lead or tail), a headline's tail, the player's own action, or null in the quiet. */
  slow: 'moment' | 'headline' | 'action' | null;
  until: number;
}

/**
 * Whether `now` is in a fine window, and when the answer may next change: slow from `WATCH_LEAD` before `nextAt` to
 * `WATCH_TAIL` after a moment, and for `WATCH_TAIL` after a headline; where tails overlap or meet it stays slow until
 * the later one ends. In the quiet, `until` is where the next lead begins. The one source of the windows: watch mode
 * (`src/ui/watch.ts`) and the stride both read it.
 */
export function fineWindow(
  now: number,
  nextAt: number | null,
  lastMoment: number | null,
  lastHeadline: number | null,
  lastAction: number | null = null,
  lead: number = WATCH_LEAD,
): FineWindow {
  const momentEnds = lastMoment !== null && lastMoment <= now ? lastMoment + WATCH_TAIL : -Infinity;
  const headlineEnds = lastHeadline !== null && lastHeadline <= now ? lastHeadline + WATCH_TAIL : -Infinity;
  const actionEnds = lastAction !== null && lastAction <= now ? lastAction + WATCH_TAIL : -Infinity;
  const inLead = nextAt !== null && now >= nextAt - lead;
  const tailUntil = Math.max(momentEnds, headlineEnds, actionEnds);
  if (inLead) return { slow: 'moment', until: nextAt };
  if (now < tailUntil) {
    const slow = actionEnds >= tailUntil ? 'action' : headlineEnds > momentEnds ? 'headline' : 'moment';
    return { slow, until: tailUntil };
  }
  return { slow: null, until: nextAt !== null ? nextAt - lead : Infinity };
}

/**
 * The next step, in ms. `TICK_MS` inside a fine window. Otherwise `ROUGH_MS` to the next multiple of `ROUGH_MS`, cut
 * short to land on the start of the next window or on the landing (a scheduled headline's millisecond, rounded up to
 * a tick; a venue's open or close), so none is crossed.
 */
export function strideAt(v: StrideView): number {
  const w = fineWindow(v.now, v.nextAt, v.lastMoment, v.lastHeadline, v.lastAction, v.lead);
  if (w.slow !== null) return TICK_MS;
  // Both the window's start and a landing may be off the tick (a headline is scheduled to the millisecond): the step
  // lands on the tick that reaches them, as an exact step would have published them.
  const target = Math.ceil((v.landing === null ? w.until : Math.min(w.until, v.landing)) / TICK_MS) * TICK_MS;
  return Math.max(TICK_MS, Math.min(ROUGH_MS - (v.now % ROUGH_MS), target - v.now));
}

/**
 * Builds the view of a game: the next moment and the last one (both worked out from the game, `Game.nextMoment` and
 * `Game.lastMomentAt`, not from what was seen), the last headline and the next landing. It keeps the one thing the
 * game does not know, the time of the player's last action, which the store tells it (`acted`).
 */
export class StrideTracker {
  lastAction: number | null = null;

  // The game is read afresh each time; the constructor takes it so a tracker belongs to one game.
  constructor(_game?: Game) {}

  /** The player acted at `now`: a hand order, a block switched on or a parameter changed. */
  acted(now: number): void {
    this.lastAction = now;
  }

  /** The view of `game` now. Draws nothing. */
  view(game: Game): StrideView {
    const next = game.nextMoment();
    return {
      now: game.now,
      nextAt: next?.at ?? null,
      lastMoment: game.lastMomentAt(),
      lastHeadline: game.lastHeadlineAt(),
      lastAction: this.lastAction,
      lead: next ? game.leadOf(next.at, WATCH_LEAD) : WATCH_LEAD,
      landing: game.nextLanding(),
    };
  }
}
