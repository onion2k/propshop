// The step-rate floors. Run alone, after the rest of `npm run check` (`npm run floors`), so they measure the sim and
// not a machine busy with the other test files; skipped in a plain `npm test` unless FLOORS is set.
import { CONTENT } from '../src/content';
import { Game, MS_PER_MINUTE, MS_PER_SECOND, StrideTracker, TICK_MS, strideAt } from '../src/sim';

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
    // desk's work. Set at 35,000 by Chris after part 6; lowered to 32,000 by Chris after part 7f (2026-11-10), when the
    // machine read HEAD at 33,900 to 35,100 and the options desk with its tuned customers 34,300 to 34,800: slower is fine.
    expect(rate).toBeGreaterThan(32_000);
  });

  floor('steps at least ten times faster rough through the quiet, every desk open', () => {
    const open = () => {
      const g = new Game(CONTENT, 12);
      for (const d of g.market.desks) g.openDesk(d);
      // No headline in the stretch: the quiet is what is measured, not the windows that follow news.
      g.news.scheduled = [];
      for (const n of g.deskNews) n.scheduled = [];
      return g;
    };
    // Exact: simulated ms per wall second, from the same two minutes the other floors time.
    const exact = ticksPerSecond(open()) * TICK_MS;
    // Rough: fifteen minutes from 09:40, stepped by the chooser as the store steps it, its own cost in.
    const g = open();
    g.skipToOpen();
    while (g.now < 9 * 3_600_000 + 40 * MS_PER_MINUTE) g.step(MS_PER_MINUTE);
    const tracker = new StrideTracker(g);
    const from = g.now;
    const until = from + 15 * MS_PER_MINUTE;
    let steps = 0;
    let fine = 0;
    const start = performance.now();
    while (g.now < until) {
      const dt = strideAt(tracker.view(g));
      if (dt === TICK_MS) fine++;
      g.step(Math.min(dt, until - g.now));
      steps++;
    }
    const wall = performance.now() - start;
    const rough = ((g.now - from) / wall) * 1000;
    process.stderr.write(
      `rough: ${Math.round(rough)} sim ms/s (${Math.round(rough / 1000)}x), exact ${Math.round(exact)} (${Math.round(exact / 1000)}x), ` +
        `${(rough / exact).toFixed(1)} times, ${steps} steps, ${fine} exact\n`,
    );
    // A quiet stretch: no window in it (the fixes and the close are further off than the stretch).
    expect(fine).toBe(0);
    // A tripwire, not the target: measured about 38 times with the blocks asleep (docs/measured.md, 2026-11-10).
    expect(rough).toBeGreaterThan(10 * exact);
  });
});
