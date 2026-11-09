// The step-rate floors. Run alone, after the rest of `npm run check` (`npm run floors`), so they measure the sim and
// not a machine busy with the other test files; skipped in a plain `npm test` unless FLOORS is set.
import { CONTENT } from '../src/content';
import { Game, MS_PER_MINUTE, MS_PER_SECOND, TICK_MS } from '../src/sim';

const floor = process.env.FLOORS ? it : it.skip;

function ticksPerSecond(g: Game): number {
  g.skipToOpen();
  for (let i = 0; i < (10 * MS_PER_SECOND) / TICK_MS; i++) g.step();
  const start = performance.now();
  for (let i = 0; i < (2 * MS_PER_MINUTE) / TICK_MS; i++) g.step();
  return ((2 * MS_PER_MINUTE) / TICK_MS / (performance.now() - start)) * 1000;
}

describe('The step rate', () => {
  floor('steps fast enough for the top speed', () => {
    const rate = ticksPerSecond(new Game(CONTENT, 12));
    process.stderr.write(`${Math.round(rate)} ticks/s\n`);
    // The top speed is 300x: 150,000 ticks a wall second. Hold it to half that here.
    expect(rate).toBeGreaterThan(75_000);
  });

  floor('steps fast enough with every built desk open', () => {
    const g = new Game(CONTENT, 12);
    const desks = g.market.desks;
    expect(desks.length).toBeGreaterThanOrEqual(2);
    for (const d of desks) g.openDesk(d);
    const rate = ticksPerSecond(g);
    process.stderr.write(`${desks.join('+')} open: ${Math.round(rate)} ticks/s\n`);
    // A tripwire, not the top speed: with metals, every desk open read about 38,800 to 39,000 alone on 2026-11-09
    // (docs/measured.md), a game day at top speed about 580 s. A new desk that pulls this under is part of that
    // desk's work. Set at 35,000 by Chris after part 6.
    expect(rate).toBeGreaterThan(35_000);
  });
});
