# The way in: a staged start, the cover's words, the experiments in order

Agreed by Chris 2026-11-09; the nine later points are in `plans/play-and-learn.md`.
State: specified 2026-11-09 in plan mode; to be built by the `builder` agent, then checked and looked at headless
by this session. Commit and push when it is done.

## Context

Chris asked (2026-11-09), before the options desk, for a look through the game for what would make it teach
better and play better. Twelve points came back and he agreed them all: the first three now, the other nine noted
for later. The first three are the way in:

1. **Free play switches the stages off.** `Root.tsx`'s `openFree` calls `store.setReveal(true)`, and it is the only
   door to the open game. A new player lands on 29 instruments, 9 venues, 19 blocks and an 11-rack shop. The
   staged game (one block, three tabs, one next step) is reached only by unticking a box in the First week tab.
2. **The cover and the top bar are out of date.** "on stocks and then futures"; "an HFT sim".
3. **The experiments are a flat list.** Seven cards saying "Not done": no grouping, and no record of whether the
   guess was right, though the result page already works it out (`guess === answerOf(a, b)`).

## What changes

### 1. Two doors to the one game (`src/ui/Root.tsx`)

- The list ends with two buttons where there is one:
  - **Run the firm**, the primary one: `store.setReveal(false)`, then the app. Beside it: "Start in a spare room
    with one block. The game opens a stage at a time, as you learn it."
  - **Free play**: as now, `store.setReveal(true)`. "The same firm, with everything shown."
- It is one game and one save, as now: the two doors differ only in the show-everything switch, which the First
  week tab still has. So nothing in the store or the save changes.
- Known and accepted, and said in the plan's edge cases:
  - a desk opened under Free play stays open in the sim (its rival has joined); back in the staged view the page
    hides it again, as the switch has always done;
  - a save from before the stages (no `propshop.stages.v1`) opens every stage through either door, as now.
- The way back ("Experiments" in the back bar) is unchanged.

### 2. The words (`src/ui/Cover.tsx`, `src/ui/TopBar.tsx`)

- `TAGLINE`: "Run a small trading firm on stocks, then futures, currencies and metals, where the fast firm eats
  the slow one's lunch."
- The top bar's "an HFT sim" becomes "a trading sim", with no glossary term on it (the `hft` entry stays, linked
  where it is used). The README and `CLAUDE.md` wording stays for part 9 of `plans/trading.md`.

### 3. The experiments, grouped and scored (`src/ui/Root.tsx`, `src/ui/ExperimentPage.tsx`)

- **Grouped by desk**, in the order the desks open: Stocks (the headline, a few miles, the free option), Futures
  (the lead), Currencies (last look), Metals (the fix, delivery). The group is the experiment's first `desks`
  entry, or stocks; the heading is `DESK_NAMES` from `src/content/stages.ts`. Nothing is locked: the experiments
  are how a player meets the game, so all seven stay open.
- **The first guess is kept.** `onDone(id)` becomes `onDone(id, right)`, called where it is now, with
  `guess === answerOf(a, b)`. `propshop.experiments.v1` grows from `{ done }` to `{ done, called }`, where
  `called` is `Record<id, boolean>`, written the first time an experiment finishes and not changed by a re-run
  (a second go knows the answer).
- **Each card says** "Not done", "Done: you called it" or "Done: you guessed wrong". An experiment done before
  this change has no record and says "Done".
- **A score line** under the heading once one is recorded: "You called 3 of the 4 you guessed."
- A stored value of the old shape reads as before; a `called` that is not an object of booleans is ignored
  (`loadDone`'s care, extended).

## Files

- `src/ui/Root.tsx`: the two doors, the groups, the score, the storage shape.
- `src/ui/ExperimentPage.tsx`: `onDone`'s second argument.
- `src/ui/Cover.tsx`, `src/ui/TopBar.tsx`: the words.
- `src/ui/styles.css`: the group headings and the two doors, at 375 and 1280.
- `test/ui.test.tsx`: the Root and cover tests below.
- `CLAUDE.md`: the layout line on `Root.tsx` and `propshop.experiments.v1`; `README.md`: "Experiments, first"
  names the two doors.
- `plans/way-in.md` (this plan and its result), `plans/play-and-learn.md` (the nine for later), and a line in
  `plans/trading.md`'s state pointing at both.

Not touched: `src/sim`, the store, the save, the stage table.

## The nine for later (`plans/play-and-learn.md`)

Written as a list with what was seen and the first idea for each, none specified yet:

- **As a game:** stakes and a goal (running costs for a seat, a target a stage, an end: beat Harbor Quant or go
  bust); rivals as characters (what each took from you, in the day report); pacing (slow for a headline, a fix,
  an expiry; fast between); moments marked (a won race, a triangle, a delivery, a margin call, a fine).
- **For learning:** an Overview that grows with what it has to say; lessons that take you to the place; each
  block's record and the reason it loses; "why did I lose money today?" in the day report; the Market page by
  desk.
- **Smaller:** currency balances before the currencies desk is used; the shop's latency walls as "what changes
  for you".

## Edge cases

- **Stored experiments of the old shape** (`{ done }`): read, shown "Done", not counted in the score.
- **Storage full or forbidden:** the mark and the score still show on screen for the visit, as `markDone` does now.
- **A re-run:** does not change the first guess's record.
- **An injected list** (`experiments` prop, the tests' `tiny()`): no `desks`, so it groups under Stocks.
- **Run the firm after Free play:** the switch goes off; the stage is the one the lessons have reached.
- **Closed hours, held sim:** the list still holds the sim; both doors release it, as Free play does now.

## Check

- Tests first, in `test/ui.test.tsx`, failing before the change:
  - Run the firm opens the app with `store.getReveal()` false and no Desk page; Free play with it true;
  - the list groups the seven under four desk headings, in order;
  - a right guess stores `{ done: ['tiny'], called: { tiny: true } }`, the card says so and the score line
    counts it; a re-run with a wrong guess leaves the record;
  - an old `{ done }` value shows "Done" and no score;
  - the cover's tagline and the top bar's words.
- `npm run check` green.
- Looked at headless with Playwright at 1280 and 375: the list, both doors, a finished experiment's card; no
  overflow, no console errors.
- The report says what was not checked.

## Result

Built 2026-11-09 by the builder agent, UI only.

- `src/ui/Root.tsx`: two doors ("Run the firm", `setReveal(false)`; "Free play", `setReveal(true)`) with their
  muted lines; the list grouped under `DESK_NAMES` headings (first `desks` entry, or stocks; a desk with no
  experiment shows no heading); `propshop.experiments.v1` is `{ done, called }`, the first finish only; cards say
  Not done / Done: you called it / Done: you guessed wrong / Done; the score line shows once one is recorded.
  An old `{ done }` reads as "Done" and no score; a `called` that is not booleans is ignored per entry.
- `src/ui/ExperimentPage.tsx`: `onDone(id, right)`, `right` worked out from the two runs' measures and the guess.
- `src/ui/Cover.tsx`, `src/ui/TopBar.tsx`: the new words; the top bar's Term is gone.
- `src/ui/styles.css`: `.exp-group h2`, `.exp-score`, `.exp-doors` (two columns, one under 600px).
- `test/ui.test.tsx`: new and updated Root and cover tests (doors, groups, right and wrong record, a re-run
  leaving it, old shape, top bar words), seen failing before the change.
- `CLAUDE.md`, `README.md`: updated.

Checked: the tests above and `npm run check` (see the report). Not checked: the look at 375 and 1280 (the parent
session's headless pass); that "Run the firm" after Free play shows the stage lessons have reached, by eye.
