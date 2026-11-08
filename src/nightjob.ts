// One night's job, as a worker (or the main thread) runs it: the pins and the variants in, a stream of events out.
// A plain module with no Worker in it, so a test can call it and the main-thread fallback can share it.

import { testNight, type NightEvent, type Pin, type Variant } from './sim';
import type { Content } from './sim';

/** What the store hands the runner at the close. */
export interface NightJob {
  pins: Pin[];
  /** The baseline first, as `variants` gives them. */
  variants: Variant[];
  /** Each window's length, ms of simulated time; the tests' default where absent. */
  windowMs?: number;
}

/** What a runner tells the store: the night's own events, then `end` (or `error`, which also ends it). */
export type JobEvent = NightEvent | { kind: 'end' } | { kind: 'error'; message: string };

/** The ticks a worker runs between progress notes; it has a thread of its own, so this is large. */
export const WORKER_TICKS_PER_YIELD = 5000;

/** The night's events then `end`; an exception in a run becomes `error` and the generator stops. */
export function* jobEvents(
  content: Content,
  job: NightJob,
  ticksPerYield = WORKER_TICKS_PER_YIELD,
): Generator<JobEvent, void, undefined> {
  try {
    yield* testNight(content, job.pins, job.variants, ticksPerYield, job.windowMs);
  } catch (e) {
    yield { kind: 'error', message: e instanceof Error ? e.message : String(e) };
    return;
  }
  yield { kind: 'end' };
}

/** Run a whole job, posting each event; what the worker's message handler does. */
export function handleJob(content: Content, job: NightJob, post: (e: JobEvent) => void): void {
  for (const e of jobEvents(content, job)) post(e);
}
