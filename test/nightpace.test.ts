// A measurement, not a check: NIGHT_PACE=1 npx vitest run test/nightpace.test.ts plays whole days through the
// store, as a new player who leaves the starting setup alone, runs each night's tests, and writes what the Overview
// would say: the day's P&L, the signals, and each variant's windows and verdict. NIGHT_SEEDS, NIGHT_DAYS and
// NIGHT_OUT (a JSON file) change the seeds, the days and where it goes. A day and its night take about five minutes.
import { writeFileSync } from 'node:fs';
import { CONTENT, shows, signals } from '../src/content';
import { MS_PER_MINUTE, TICK_MS } from '../src/sim';
import { handleJob, type JobEvent, type NightJob } from '../src/nightjob';
import type { NightRunner } from '../src/ui/nights';
import { compare } from '../src/ui/overview';
import { createStore, type Storage } from '../src/ui/store';

const measure = process.env.NIGHT_PACE ? it : it.skip;
const SEEDS = (process.env.NIGHT_SEEDS ?? '1,2,3').split(',').map(Number);
const DAYS = Number(process.env.NIGHT_DAYS ?? 3);
const OUT = process.env.NIGHT_OUT ?? 'nightpace.json';

/** Holds the night's job until the harness runs it, as a worker would between the close and the open. */
class HeldRunner implements NightRunner {
  held: { job: NightJob; onEvent: (e: JobEvent) => void } | null = null;
  start(job: NightJob, onEvent: (e: JobEvent) => void) {
    this.held = { job, onEvent };
  }
  cancel() {
    this.held = null;
  }
  flush() {
    const h = this.held;
    this.held = null;
    if (h) handleJob(CONTENT, h.job, h.onEvent);
  }
}

function memory(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const usd = (c: number) => Math.round(c / 100);

measure('what the overview says from home', { timeout: 7_200_000 }, () => {
  const out: unknown[] = [];
  for (const seed of SEEDS) {
    const runner = new HeldRunner();
    const store = createStore(CONTENT, memory(), seed, undefined, runner);
    const nights: unknown[] = [];
    for (let d = 0; d < DAYS; d++) {
      store.skipToOpen();
      const before = store.game.days.length;
      while (store.game.days.length === before) store.stepTicks((30 * MS_PER_MINUTE) / TICK_MS);
      runner.flush();
      store.publish();
      const s = store.getSnapshot();
      const stage = store.getStage();
      const day = s.days[s.days.length - 1]!;
      const night = store.getTests().nights.at(-1);
      const sigs = signals(s.days, s, { shown: (f) => shows(f, stage), content: CONTENT });
      nights.push({
        day: day.day,
        stage,
        pnl: usd(day.pnl),
        byBlock: Object.fromEntries(Object.entries(day.byBlock).map(([k, v]) => [k, usd(v.realised - v.fees)])),
        races: day.races,
        fees: usd(day.fees),
        signals: sigs.map((x) => `${x.id}: ${x.seen}`),
        night: night && {
          status: night.status,
          reason: night.reason,
          rows: compare(night).map((r) => ({
            id: r.id,
            windows: r.windows.map((w) => (w.pnl === null ? null : usd(w.pnl))),
            total: usd(r.total.pnl),
            verdicts: r.windows.map((w) => w.verdict),
            tag: r.tag,
            summary: r.summary,
            payback: r.payback,
          })),
        },
      });
      writeFileSync(OUT, JSON.stringify([...out, { seed, nights }], null, 1));
    }
    out.push({ seed, nights });
  }
  writeFileSync(OUT, JSON.stringify(out, null, 1));
});
