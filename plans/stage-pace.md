# Measure when each stage opens

State: built and measured, 2026-11-05, not committed.

## Context

The game now opens in five stages, each opened by a lesson (`src/content/stages.ts`). Nobody has measured
when they actually open. A stage whose lesson rarely ticks strands a player, with only the Show everything
switch to get them out. Two things found while writing this spec make the timing depend on the player, not
the economy:

- The firm starts with $200,000, so fibre ($5,000) can be bought in the first minute, which opens stage 2
  at once. The tutorial says to see what you earn first.
- `race` (which opens stage 3) ticks on any order beaten by a rival (`s.orders.some(o => o.beatenBy.length > 0)`),
  so momentum's own orders may open stage 3 without arbitrage ever being switched on.

So this tool plays the game headless as scripted players with different habits, and reports when each
lesson ticks and each stage opens. It is a measurement, like PACE, not a gate.

## What

`STAGE_PACE=1 npx vitest run test/stagepace.test.ts` prints, for each player and seed, the trading day and
clock time each lesson ticked and each stage opened. It also gives the real minutes that took at 10× and at
60×, which is what a player feels, and "not by day N" for anything that never came.

- **It drives the real store**: `createStore(CONTENT, null, seed)` (`src/ui/store.ts`), stepping
  `store.game.step()` and calling `store.publish()` every 250 ms of simulated time, about what the page does
  at 10×. Lessons tick and stages open through the store's own code (`getProgress`, `getStage`), not a copy.
- **Two players**, in `test/player.ts`, each a pure function from (progress, snapshot) to the actions due now:
  - **follower** does each current lesson's task as soon as it is current: momentum from home; fibre once
    `home` is done; arbitrage on (momentum off first, since the laptop runs one block) for `race` and `cost`;
    the market maker at a two-cent half spread for `maker`; a 5,000-share market buy at the desk for `hand`;
    a resting 5,000-share bid a cent under the best for `used`. It skips each night to the open.
  - **sitter** keeps momentum on and never switches a block or touches the desk. It buys fibre once `home`
    is done and skips nights. It shows what opens without following the tasks.
- **Options:** `STAGE_SEEDS` (default `1,2,3`), `STAGE_DAYS` (cap, default 10 trading days), `STAGE_PLAYERS`.
  Each run stops early once stage 5 opens.

## Where it stands now

- The sim steps about 93,000 ticks a second (`game.test.ts`). That makes a trading day about two minutes of
  wall time and a week about ten, plus the cost of publishing.
- The follower can't open stage 3's `week` lesson before week 2, so a full follower run is at least five
  trading days, about 12 minutes a seed.
- Two players over three seeds is roughly an hour run serially, or about 25 minutes with one process per seed.

## Acceptance criteria

1. The gated run prints one block per player and seed, with the time each lesson ticked and each stage
   opened (trading day, clock, and real minutes at 10× and 60×), and "not by day N" for each one that didn't.
2. Each player's policy is a pure function, unit-tested in `test/player.test.ts` as part of the normal check.
3. Every action is checked in the snapshot after it lands; a block that didn't switch fails the run loudly.
4. The same seed gives the same report, checked in the normal check on a short run.
5. On every seed the follower's `home` lesson ticks within the first trading hour. Momentum from home is
   known to earn, so if it doesn't, the player is broken, not the game.

## Edge cases

- **Closed hours:** both players skip to the open. A purchase or a tick at night is reported at its time,
  and the skip lands the overnight news as in the game.
- **One leg only:** the follower's arbitrage scratches its own legs, which costs cash. It is reported, not
  avoided.
- **Capacity:** the laptop runs one block, so the follower switches a block off before the next one on.
  The fibre purchase doesn't change the computer.
- **A tip:** the dark web may unlock. Both players ignore its tips, so no fine is reachable.
- **Saved:** not reachable; the store gets no storage.
- **A slow firm:** both play from home, with fibre after `home`. That is the point.

## Decisions (each with my recommendation)

1. **The two players.** The follower gives the soonest a stage can open; the sitter shows what opens on its
   own. A third, an eager buyer of fibre at minute one, isn't needed: it opens stage 2 at once by
   construction. **Recommend follower and sitter.**
2. **Publish every 250 ms of simulated time.** At 300× the page publishes only about every five seconds,
   and the `race` check reads a bounded list of recent orders, so publishing less often could miss a
   beaten order. 250 ms is the cautious end and is an option to change. **Recommend 250 ms.**
3. **Cap at 10 trading days.** Anything past two weeks is a stall worth a fix, not a number worth an
   exact figure. **Recommend 10.**
4. **This measures; it changes no stage rule.** The figures go into CLAUDE.md's "What is not held", dated,
   like PACE's. Whether to move a stage's opening lesson is your call once they're in.

## Performance risk

The tool runs only when asked. Its unit tests and the short determinism run add about 3 seconds to
`npm run check`, which takes about 18 now; this will be measured. Nothing in the game changes.

## Test plan

- **Unit** (`test/player.test.ts`):
  - Each policy's actions for each current lesson.
  - No action is repeated once it is in effect: no buying twice, no toggling a block that is already set.
  - The follower turns a block off before the next one on.
  - Determinism: three minutes of the follower on one seed, twice, gives the same progress.
- **The instrument** (gated run, one seed, two days):
  - Watch the follower step through `home`, `seat`, `gap` and `race`, with each action showing in the
    snapshot.
  - Check that `home` ticks within the first hour.
  - Run it twice and compare.
- **No fuzzer, no end-to-end, no pictures:** the project has none, and the tool has no page.
- **No baseline or gate:** this is a measurement. A later change is told from noise by its spread over the
  three seeds, which the report prints.

## Parts

- [x] 1. `test/player.ts`: the follower and the sitter as pure policies, and the step that applies an
      action through the store. Check: `test/player.test.ts`.
- [x] 2. `test/stagepace.test.ts`: the gated runner and its report. Check: determinism in `player.test.ts`;
      the report's shape on a one-day run.
- [x] 3. Trust the instrument: one seed, two days, by eye, and twice. Check: `home` within an hour, actions
      seen in the snapshot, same report twice.
- [x] 4. The full run: three seeds, both players, one process per seed. Write the figures into CLAUDE.md
      ("What is not held", dated) and the command into Commands. Check: `npm run check`, and the time it now
      takes.

Built on Sonnet by the `builder` agent, as before. The full run takes about half an hour and goes in the
background.

## What it found, 2026-11-05

Three seeds, one trading day each, run in parallel (about 4.5 minutes). One day was enough: the follower opens
stage 5 within the day, and the sitter cannot pass stage 3 at all, so ten days would have added nothing.

|                                  | Seed 1  | Seed 2  | Seed 3  |
| -------------------------------- | ------- | ------- | ------- |
| Follower, stage 2 and 3 together | 4.0 min | 1.7 min | 2.6 min |
| Follower, stage 4                | 6.4 min | 7.9 min | 7.9 min |
| Follower, stage 5                | 6.6 min | 8.2 min | 8.2 min |
| Sitter, stage 3, then nothing    | 4.0 min | 1.7 min | 2.6 min |

Trading minutes after the first open. `race` ticked in the first ten seconds on every seed, on momentum's
orders. `home` came within the hour on every seed, as criterion 5 asks.

The stage rule was changed on the strength of this: see `plans/stage-rule.md` for what the harness measured after.
