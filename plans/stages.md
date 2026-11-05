# Open the game a stage at a time

State: built, not committed, on 2026-11-05. Looked at in the browser pane: a fresh game at stage 1, and stage 2 opening on a
fibre purchase, at desktop and phone width. The play-through of part 0, a game run over days, is still not done.

## Context

A new player is met by everything at once: four pages, seven report tabs, eight blocks and a script, the
desk, the microscope, the gap view and the race under every order. There are two onboarding paths (a
14-step tutorial and the 10 first-week lessons) that overlap and point different ways. And the first thing
they teach is arbitrage, which from home earns about nothing, with arbitrage switched on at the start
(`Firm.defaultBlocks(['arbitrage'])`, `src/sim/game.ts:321`).

The fix is to show a little at a time: the game opens small, and each lesson done opens the next idea, so
each feature arrives when it is the lesson. Nothing is removed from the sim.

## What

Five stages. Each opens when a lesson in the stage before it is done, and opening it shows a short card
pointing at what is new (the tutorial's card, reused).

| Stage                 | Opens when                                                             | What it shows (on top of the stages before)                                                                                                          | Its lessons        |
| --------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1 Spare room          | at the start                                                           | Market page (watchlist, quotes, ladder, firm panel's orders), Strategy page with **momentum only**, risk, shop; Reports with First week, Days, Learn | home, seat         |
| 2 A better seat       | `seat` done (any purchase; fibre is 5,000, about two days of momentum) | arbitrage and the sniper; the gap line, gap list and counter; the race under each order and the scorecard; Rivals tab                                | gap, race, cost    |
| 3 The day's character | `race` done                                                            | market maker, mean reversion, news reaction; News tab; Dark web tab once the sim unlocks it, as now                                                  | maker, noise, week |
| 4 By hand             | `maker` done                                                           | Desk page, microscope                                                                                                                                | hand, used         |
| 5 The whole firm      | `used` done                                                            | pairs, index arbitrage, the script; Lab tab                                                                                                          | none               |

- **One path.** The tutorial becomes stage 1's walk-through (welcome, watchlist, exchanges, clock,
  blocks, params, shop, risk, reports, go), with momentum in place of arbitrage. Its gap, race,
  read-race and desk steps move into the intro cards for stages 2 and 4. The First week lists lessons by
  stage, with stages that are not open yet shown by name only.
- **A new game starts with momentum on**, not arbitrage. This is the one change to the sim: the start
  blocks move into content `START`, handed in as now.
- **Show everything:** a switch in the First week tab opens every stage at once. It is kept under its own
  storage key and survives Start again.

## Where it stands now

The figures from CLAUDE.md, 2026-11-02/04: momentum from home earns 2,200 a day and arbitrage from home
about nothing. So a new player earns from the first day, and stage 2 opens after about two to eight
trading days, depending on what they buy first (fibre 5,000; the first rung, all three items, 18,000).

## Acceptance criteria

1. A fresh game shows Market, Strategy and Reports; Strategy lists momentum only, and it is on; Reports
   shows First week, Days and Learn; there is no Desk page, gap line, race or scorecard.
2. A stage is a pure function of lesson progress (and the switch): `stageOf(progress)`,
   `shows(feature, stage)` in `src/content/stages.ts`, beside the lessons.
3. When `seat` is done, the arbitrage block, the gap view, the races and Rivals appear, with an intro card
   pointing at the gap view. The same holds for each stage after it.
4. A block that is switched on is always shown, even if its stage is not open yet.
5. Show everything opens every stage at once. It persists across a reload and across Start again.
6. A save from before this change, or any save whose progress has a lesson past stage 1 done, opens every
   stage, so no one is set back.
7. The tutorial covers stage 1 only, never switches arbitrage on, and does not point at anything hidden.
8. The First week's lessons run in stage order, with each locked stage shown by its name.

## Edge cases

- **Closed hours:** a stage can open after hours (a purchase at night). Its card shows, and nothing in the
  sim changes.
- **One leg only:** not reachable; arbitrage is unchanged.
- **Capacity:** the laptop runs one block, and momentum is it. Blocks that are hidden are off, so they use
  no capacity.
- **A tip:** the dark web keeps its own unlock in the sim. The tab appears only once stage 3 is open and
  the sim has unlocked it.
- **Saved:** stage state comes from progress, which is already saved, and the save version is unchanged.
  An old game keeps its blocks; only a new game starts on momentum.
- **A slow firm:** not reachable.

## Decisions (each with my recommendation)

1. **Three exchanges from the start, not two.** Hiding one exchange in the view would hide where
   momentum's own fills land. The tutorial already says "one stock, three exchanges", and it is the
   gap view and the races that are heavy, not the rows. **Recommend three.**
2. **Locks are in the UI only.** The sim keeps every block, so PACE, rivals and saves are untouched.
   Stopping the sim from running a locked block would buy nothing a player can see. **Recommend UI only.**
3. **Stages open on lessons, not on money.** This keeps one path, needs no new saved state, and a lesson
   done is a natural moment to show the card. The cost: a player who never trips the `race` check stays at
   stage 2, which is what the switch is for. **Recommend lessons.**
4. **The words** on the stage cards, the trimmed tutorial and the reordered lessons are drafted by the
   builder and edited by you.

## Performance risk

None to speak of. The stage is a lookup over at most ten progress ids per render, and nothing new runs in
the sim loop. No budget applies.

## Test plan

- **Unit** (`test/stages.test.ts`): stage for each progress set; `shows` for each feature at each stage;
  the switch; an old save's progress opens everything; every lesson belongs to exactly one stage.
- **Lessons and tutorial** (`test/lessons.test.ts`, `test/tutorial.test.ts`): lessons in stage order; no
  tutorial step targets a feature hidden at stage 1; no step enables arbitrage.
- **Sim** (`test/game.test.ts`): a new game's start blocks come from content, with momentum on. Check
  that PACE sets its own blocks and is unaffected.
- **UI** (`test/ui.test.tsx`): criteria 1, 3, 4, 5 and 6 through the store, in jsdom.
- **No fuzzer or end-to-end harness exists** (CLAUDE.md), so neither is extended.
- **Pictures:** a fresh game and stage 2 just opened, at desktop and phone width. The project has no
  Playwright setup, so these are taken by hand in the browser pane. Say so in the report.

## Parts

Builder's note on part 0: the play-through of a fresh game was not done by the builder, who had no browser. The stage table is
unchanged. Part 7's pictures were not taken either, nor a dev server started.

Decisions made in the build: a save from before the stages is one with a save and no `propshop.stages.v1` key (a
new game, and Start again, write it); this replaces "progress has a lesson past stage 1", which a new player
can meet (a week passes with no purchase). Stages are consecutive: a stage opens only if the one before it has.
The `anticipate` block is held to stage 5 with the script. `PACE` sets every block it uses, so is unaffected.

- [ ] 0. Play a fresh game and note where it overwhelms; adjust the stage table if needed. Check: notes
      written in `plans/stages.md`.
- [x] 1. `src/content/stages.ts`, with the stage table and `stageOf`/`shows`. Check: `test/stages.test.ts`.
- [x] 2. Start blocks in content `START`, momentum on. Check: `game.test.ts`, `npm run check`.
- [x] 3. Store: the show-everything key, and the old-save rule. Check: store and UI tests.
- [x] 4. Hide by stage in `App.tsx`, `StrategyPanel.tsx`, `MarketPanel.tsx`/`Gaps.tsx` and
      `FirmPanel.tsx` (race, scorecard). Check: `ui.test.tsx` criteria 1 and 4.
- [x] 5. Stage intro cards through `TutorialCard`; trim the tutorial; reorder the lessons and group them
      by stage in `FirstWeekPanel`. Check: `tutorial.test.ts`, `lessons.test.ts`, UI criterion 3.
- [x] 6. The switch in the First week tab. Check: UI criterion 5.
- [x] 7. Verify once: `npm run check`, a mutation check (open stage 2 at the start and watch criterion 1
      fail), pictures, and README and CLAUDE.md updated. Leave the user's save as it was.

The spec is made here on Opus. The build goes to Sonnet: a session switched to it, or the `builder` agent.

Looked at, 2026-11-05: a fresh game shows Market, Strategy and Reports, momentum alone and on, no gap view,
races or microscope. Buying fibre opens stage 2: the game pauses and the first card lights the gap view, with
the counter now in the heading. A phone's width fits with no sideways scroll; there the card covers the panel
it points at, as the tutorial's cards do. The Dark web tab waits for the sim's unlock, as the edge case says.
