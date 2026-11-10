// A measurement, not a check: ROUGH_PLAY=1 npx vitest run test/roughplay.test.ts plays the scripted players
// (test/player.ts) through PLAY_DAYS (2) trading days exactly, 2 ms a step, and again at the top speed (300×, the
// quiet fast-forwarded with the blocks asleep, as the page runs it), and prints what each earned and what it reached:
// the day's P&L, the rent due, the targets and lessons met. PLAY_SEEDS (1,2,3) and PLAY_PLAYERS (follower,sitter)
// change the run; PLAY_OUT is the JSON. It holds nothing; plans/rough-speed.md says what it is for.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONTENT } from '../src/content';
import { createStore } from '../src/ui/store';
import { POLICIES, play } from './player';

const measure = process.env.ROUGH_PLAY ? it : it.skip;
const SEEDS = (process.env.PLAY_SEEDS ?? '1,2,3').split(',').map(Number);
const PLAYERS = (process.env.PLAY_PLAYERS ?? 'follower,sitter').split(',');
const MODES = (process.env.PLAY_MODES ?? 'exact,top').split(',');
const DAYS = Number(process.env.PLAY_DAYS ?? 2);
const OUT = process.env.PLAY_OUT ?? join(tmpdir(), 'roughplay.json');

measure('scripted players, exact and at the top speed', { timeout: 6 * 3_600_000 }, () => {
  const rows: object[] = [];
  for (const seed of SEEDS) {
    for (const name of PLAYERS) {
      for (const topSpeed of [false, true].filter((t) => MODES.includes(t ? 'top' : 'exact'))) {
        const store = createStore(CONTENT, null, seed);
        const started = Date.now();
        const start = store.getSnapshot().equity;
        // A player whose action the game refuses (down past the loss limit, say) is stopped there and says so.
        let stopped: string | null = null;
        let run: ReturnType<typeof play> | null = null;
        try {
          run = play(store, POLICIES[name]!, { player: name, seed, days: DAYS, topSpeed });
        } catch (e) {
          stopped = e instanceof Error ? e.message : String(e);
        }
        const s = store.getSnapshot();
        const row = {
          seed,
          player: name,
          mode: topSpeed ? 'top speed, slept' : 'exact',
          equityChange: Math.round((s.equity - start) / 100),
          dayPnl: s.days.map((d) => Math.round(d.pnl / 100)),
          fills: store.game.firm.stats.fillsReceived,
          rentDue: Math.round(s.rentDue / 100),
          rentPaid: Math.round(s.rentPaid / 100),
          targets: Object.keys(store.getTargets()),
          stopped,
          lessons: Object.keys(store.getProgress()),
          stage: store.getStage(),
          infra: s.infra,
          blocks: s.blocks.filter((b) => b.enabled).map((b) => b.id),
          actions: run?.actions.length ?? null,
          seconds: Math.round((Date.now() - started) / 1000),
        };
        rows.push(row);
        process.stderr.write(JSON.stringify(row) + '\n');
      }
    }
  }
  writeFileSync(OUT, JSON.stringify(rows, null, 2));
});
