// A measurement, not a check: STAGE_PACE=1 npx vitest run test/stagepace.test.ts plays the game headless as the
// scripted players in test/player.ts and prints when each lesson ticked and each stage opened (trading day, clock,
// and the real minutes that took at 10x and 60x). STAGE_SEEDS (1,2,3), STAGE_DAYS (10) and STAGE_PLAYERS
// (follower,sitter) change the run; STAGE_ACTIONS=1 also lists each action taken. Each run stops early once stage 5 opens.
import { CONTENT } from '../src/content';
import { createStore } from '../src/ui/store';
import { POLICIES, formatRun, openMinutes, play } from './player';

const measure = process.env.STAGE_PACE ? it : it.skip;
const SEEDS = (process.env.STAGE_SEEDS ?? '1,2,3').split(',').map(Number);
const DAYS = Number(process.env.STAGE_DAYS ?? 10);
const PLAYERS = (process.env.STAGE_PLAYERS ?? 'follower,sitter').split(',');

measure('stage pace', { timeout: 6 * 3_600_000 }, () => {
  const blocks: string[] = [];
  for (const seed of SEEDS) {
    for (const name of PLAYERS) {
      const policy = POLICIES[name];
      if (!policy) throw new Error(`No player ${name}`);
      const started = Date.now();
      const run = play(createStore(CONTENT, null, seed), policy, { player: name, seed, days: DAYS });
      const acts = process.env.STAGE_ACTIONS ? `\n${run.actions.map((a) => `    ${a}`).join('\n')}` : '';
      const text = `${formatRun(run)}${acts}\n  (took ${((Date.now() - started) / 1000).toFixed(0)} s)`;
      process.stderr.write(text + '\n');
      blocks.push(text);
      // Momentum from home is known to earn: if `home` is slow the player is broken, not the game.
      if (name === 'follower') {
        const home = run.lessons.home;
        expect(home, `follower seed ${seed}: home never ticked`).toBeDefined();
        expect(
          openMinutes(home?.at ?? 0),
          `follower seed ${seed}: home within the first trading hour`,
        ).toBeLessThanOrEqual(60);
      }
    }
  }
});
