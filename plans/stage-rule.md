# Open each stage when the one before is done

State: built and measured, 2026-11-05, not committed.

## Context

The stage harness (`test/stagepace.test.ts`, measured 2026-11-05 over three seeds) shows the stages don't
pace anything. A player who does each task opens all five within 6.6 to 8.2 trading minutes, under a minute
of real time at 10×. There are three causes:

- Each stage opens on one lesson from the stage before (`opensWith` in `src/content/stages.ts`), and the
  lessons it uses are the quickest.
- `race` ticks on any order beaten by a rival (`src/content/lessons.ts`), and momentum's orders are beaten
  in the first ten seconds. So stage 3 opens together with stage 2, before arbitrage has been seen.
- `cost` counts every IOC order, momentum's included, so it isn't about arbitrage either.

The fix: a stage opens only when **every** lesson of the stage before is done, and the two arbitrage lessons
count only arbitrage's orders.

## What

- **The rule.** Stage n opens when stage n−1 is open and all its lessons are done. `opensWith` goes. The new
  path:
  - Stage 2 needs `home` and `seat`.
  - Stage 3 needs `gap`, `race` and `cost`.
  - Stage 4 needs `maker` and `noise`.
  - Stage 5 needs `hand`, `used` and `week`.
- **`week` moves from stage 3 to stage 4** (decision 1). The desk doesn't need a week of play first. The
  whole firm (pairs, index arbitrage, the script, the Lab) is what should wait for the second week. The
  First week lists it under stage 4.
- **`race` and `cost` count arbitrage's orders only** (`o.block === 'arbitrage'`). Their tasks already
  say to switch arbitrage on.
- **A stage never closes again.** The stage in force is the higher of the rule's stage and the last stage
  whose card was shown (`seen`, already kept under `propshop.stages.v1`). A game played under today's
  quicker rule keeps what it has opened.
- **The scripted follower** (`test/player.ts`) goes to the desk once stage 4 is open, not once `maker` is
  done, and keeps the maker running until then.

## Where it stands now, and what to expect

| Trading time after the first open | Now (seeds 1–3)        | Expected after                                                   |
| --------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| Stage 2 (follower)                | 1.7 to 4.0 min         | about the same: `home` then fibre                                |
| Stage 3 (follower)                | same moment as stage 2 | after `cost`: about 8 min                                        |
| Stage 4 (follower)                | 6.4 to 7.9 min         | when `noise` ticks: it came at 5, 167 and 252 min for the sitter |
| Stage 5 (follower)                | 6.6 to 8.2 min         | Monday of week 2: trading day 6                                  |
| Sitter (momentum and fibre only)  | stage 3, then nothing  | stage 2, then nothing: stage 3 needs arbitrage                   |

Stage 5 at day 6 is about 3¼ real hours at 10×, 33 minutes at 60× and 7 minutes at 300×, with nights
skipped. The harness will measure all of this after the build.

## Acceptance criteria

1. `stageOf(progress)` opens stage n only when stage n−1 is open and all its lessons are done. Each stage's
   lessons are listed once, in order.
2. `week` belongs to stage 4. The First week shows it there, and stage 5 needs it.
3. `race` and `cost` tick on arbitrage's orders only. A beaten momentum order ticks neither.
4. The stage in force never falls below `seen`. A store holding `{"seen":5}` with only `home` and `seat` done
   is at stage 5.
5. The stage harness, run for seven trading days on seeds 1 to 3, shows these stage times:
   - **follower:** stage 3 after `cost`, stage 4 after `noise`, stage 5 on trading day 6;
   - **sitter:** held at stage 2.

## Edge cases

- **Closed hours:** `week` can tick over the weekend, so stage 5 can open at night. Its card shows, and
  nothing in the sim changes.
- **One leg only:** arbitrage's scratched legs are its orders, so they count toward `race` and `cost`, as
  they should.
- **Capacity:** unchanged. The laptop still runs one block, and the lesson tasks say which.
- **A tip:** the dark web still unlocks on the sim's own rule (a profitable week). The tab follows stage 3,
  as now.
- **Saved:** progress is already saved, and the `seen` floor keeps saves from today's rule at their stage.
  Saves from before the stages are still treated as old and open everything.
- **A slow firm:** from home, `cost` needs twenty arbitrage races with more beaten than won. The trial run
  ticked it in under four minutes of arbitrage.

## Decisions (each with my recommendation)

1. **`week` gates stage 5, not stage 4.** Gating the desk on a week of play would hold back the hand-trading
   lesson, which is quick and doesn't depend on anything else. **Recommend stage 5.**
2. **Keep the `seen` floor.** Otherwise anyone mid-game when this lands loses pages and blocks they were
   using. **Recommend keeping it.**
3. **`gap` stays in stage 2**, though it usually ticks at stage 1, since the firm counts gaps whatever is
   running. It's then simply already done when stage 2 opens. Moving it would change nothing a player sees.
   **Recommend leaving it.**

## Performance risk

None in the game: the rule is a lookup over ten ids. The harness's seven-day run is about 30 minutes a seed,
so the three seeds run in parallel, in the background. `npm run check` is unchanged apart from rewritten
tests.

## Test plan

- **Unit** (`test/stages.test.ts`):
  - the stage for each progress set, including all-but-one lesson of a stage;
  - every lesson in exactly one stage, and `week` in stage 4;
  - stage 5 needs `week`.
- **Lessons** (`test/lessons.test.ts`): `race` and `cost` on built snapshots, with a beaten momentum order
  (ticks neither) and a beaten arbitrage order (ticks `race`).
- **Store and UI** (`test/ui.test.tsx`, store tests): the `seen` floor (criterion 4). The stage-3 and stage-4
  tests build their progress from whole stages.
- **Player** (`test/player.test.ts`): the follower's desk actions wait for stage 4.
- **Harness** (criterion 5): seven days, seeds 1 to 3, in parallel. The figures replace the 2026-11-05 lines
  in CLAUDE.md and `plans/stage-pace.md`.
- **Mutation:** put `opensWith` back for stage 3 and see the stages test fail.

## Parts

- [x] 1. `stages.ts`: the new rule, `week` in stage 4, `opensWith` gone. Check: `test/stages.test.ts`.
- [x] 2. `lessons.ts`: `race` and `cost` count arbitrage's orders only, with `week` moved after `used`.
      Check: `test/lessons.test.ts`.
- [x] 3. Store: the `seen` floor. Check: the store and UI tests.
- [x] 4. `test/player.ts`: desk actions on stage 4. Check: `test/player.test.ts`.
- [x] 5. Verify: `npm run check`, the mutation, the seven-day harness on three seeds, and CLAUDE.md and the
      plan updated with the new figures.

Built on Sonnet by the `builder` agent: parts 1 to 4, and part 5 up to the harness run, which the lead runs
in the background.

## What it measured, 2026-11-05

Seven trading days, seeds 1 to 3, one process a seed (about 27 minutes). Trading minutes after the first open.

|                   | Seed 1  | Seed 2  | Seed 3  |
| ----------------- | ------- | ------- | ------- |
| Follower, stage 2 | 4.0     | 1.7     | 2.6     |
| Follower, stage 3 | 6.4     | 7.7     | 5.6     |
| Follower, stage 4 | 166.8   | 252.2   | 5.8     |
| Follower, stage 5 | day 6   | day 6   | day 6   |
| Sitter            | stage 2 | stage 2 | stage 2 |

Stage 4 waits on `noise`, which needs a noise headline and a real one both settled, and that is the widest
spread: six minutes to four hours of trading.
