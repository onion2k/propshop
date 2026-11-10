// The two lengths of a step, apart from the game so the flow can read them without a cycle.

/** One tick of simulated time, in ms. A colocated firm is within a tick of its exchange; a home office is twenty
    away; a trading day is nearly twelve million. */
export const TICK_MS = 2;
/**
 * The coarse step of the rough fast-forward (`src/sim/stride.ts`): through the quiet at the top speed the store steps
 * this long, not a tick. A draft. It is a multiple of `TICK_MS` and divides `MS_PER_MINUTE` and the loss and margin
 * check's grid, so the minute records and the checks still land; every firm decides at least this often (the slowest
 * computer decides every 50 ms).
 */
export const ROUGH_MS = 500;

/**
 * Whether a step of `dt` ms is a rough one: longer than a tick and no longer than `ROUGH_MS`. The jumps over closed
 * hours (a minute) and the experiments' warm-ups are longer and are not: they are stepped as they always were.
 */
export const isRough = (dt: number): boolean => dt > TICK_MS && dt <= ROUGH_MS;
