# Experiments: the same day, one change

State: built 2026-11-06, all four parts, uncommitted. Seen headless at 1280 and 375 wide: three experiments end to end, runs 2 to 3.5 s, layout shift during a run under 0.01, no console errors.

## Context

Chris finds Propshop working but not fun: there's nothing to do and nothing to learn, because the information is opaque. What the code shows:

- **The player has three verbs: switch a block on, buy an upgrade, wait.** Nearly every lesson task in `src/content/lessons.ts` is "let a few minutes pass".
- **The answers are fixed and handed over.** Most choices are measured losers (CLAUDE.md), and the lesson text tells the player what they should have found.
- **The races happen in milliseconds**, and the player sees them only afterwards, as rows in a list. The Microscope (`src/ui/Microscope.tsx`), which slows time down, opens at stage 4.
- **Feedback is slow**: stage 5 takes about three real hours at 10×.

The change is to make **experiments** the way a player meets the game. An experiment is a short window of one trading day. The player runs it once as given, picks **one change**, guesses its effect (**more / about the same / less**), and then runs **the same window again**. They compare the two side by side, and the key moments are replayed slowed a hundred times on the Microscope's map. The answer is measured from the two runs, never written in. The open week stays as **Free play**, with stage gating dropped. The first slice is the whole loop with **three experiments**, enough to judge whether it's fun.

Decided with Chris: the open week becomes free play; the first slice is the loop plus three experiments; the guess is one of three answers.

## The finding that shapes the build: one change today makes a different day

`Game` holds one `Random` (`src/sim/game.ts:311`). Everything draws from it in turn inside `tick` (`src/sim/flow.ts`): the fair-value drift and jumps (`market.ts:157–194`), each exchange's crowd (`exchange.ts:347–396`), news scheduling (`news.ts:76–113`) and the dark web. The crowd's draws depend on the state of the book (`bids < TARGET_DEPTH && random.chance(...)`, a pull draw per resting order). So the player's first order shifts the stream, and the fair value and news diverge too. A "same day" comparison would be meaningless.

**Fix: split chance into streams.** Each stream is derived from the seed with a fixed salt:

- `world`: fair value, factors, jumps, news scheduling and text. Nothing the player does reaches it.
- `crowd:<exchange>`: one per exchange.
- `dark`: the dark web.

The fair-value path and the headlines are then identical whatever the firm does. The crowd still reacts to the player's orders, which is honest ("your orders moved the book"), and the compare view says so. The rule "one seeded Random, handed in" still holds in spirit: it becomes one seed, with named streams handed in.

This changes every draw, so **every measured figure in CLAUDE.md moves**. Free-play saves move from `version: 1` to `2`. A v1 save loads with its streams derived from its saved state: a valid game, just a different future from before. CLAUDE.md's edge case says a save "from another version is refused"; rewrite it to say what v1 now does.

## Parts, in order

Each part depends on the one before (part 3's seeds depend on part 1's streams; part 4 needs part 2), so they run one after another, not in parallel sessions.

### 1. Chance in streams (sim)

- `src/sim/random.ts`: `Random.derive(seed, salt)`. Mulberry32 seeded from a hash of the seed and the salt.
- `src/sim/game.ts`: `random` becomes `streams: { world, crowd: Record<exchangeId, Random>, dark }`. Thread these through `news.step`, `tick` → `market.step` (drift takes `world`; `exchange.step` takes its own crowd stream) and `dark.step`. Update `save` / `load` / `fingerprint`. `SavedGame.version` becomes 2, and v1 is loaded as above.
- Tests in `test/game.test.ts`, with the existing tests kept green:
  - Two games from one seed, one firm idle and one running arbitrage colocated, have identical fair-value histories and identical news (time, symbol, text, noise) over five sim-minutes after the open.
  - The determinism and save round-trip tests still pass.
  - A v1 save loads and steps.
- Re-measure the headline PACE setups on one seed, in the background. Update CLAUDE.md's figures, or mark them "before the streams" where a full three-seed run isn't done.

### 2. The experiment runner (sim, pure)

New file `src/sim/experiment.ts`, exported through `src/sim/index.ts`:

- `Setup`: `{ location, network, computer, watched: string[], blocks: BlockSetting[] }`. A new method, `Game.configure(setup)`, sets the infrastructure through `infrastructureFrom` with no purchase, and sets the blocks and watchlist. It is for experiments only.
- `startOf(content, seed, startAt)`: builds a `Game` and skips to the open. It then steps the warm-up, about a minute, to `startAt` and returns a `SavedGame`. This is the experiment's fixed starting world. It is computed once per experiment and cached in memory.
- `class Run`: made from a start save plus a setup. It runs to `startAt + windowMs` in chunks (`advance(ticks)`), so the UI can budget it per frame the way the store does (`BUDGET_MS`). While running it:
  - collects **measures** from game events: net P&L after fees, fills, and races won / beaten / missed by exchange, with each beaten race's rival and margin;
  - collects the **moments** the experiment asks for (see part 3);
  - keeps a **checkpoint save every 5 sim-seconds**, bounded by the window (`MAX_CHECKPOINTS` named beside it).
- `replayAt(run, at)` loads the nearest checkpoint at or before `at − 40 ms` and steps to `at − 40 ms`. It returns a live `Game` for the Microscope to step tick by tick. This is exact, because a run has no input after its setup.
- Tests in `test/experiment.test.ts`:
  - Same start and setup give the same measures and fingerprint.
  - A replay at a moment reaches the same fingerprint as the full run at that tick.
  - The checkpoints stay within their bound.

### 3. Three experiments (content)

New file `src/content/experiments.ts`. Each experiment is plain data plus pure functions:

`{ id, title, briefing, seed, startAt, windowMs, baseline: Setup, changes: Change[], question(change), measure, moments(run), explain(a, b) }`

`Change` is `{ id, label, apply(setup) }`, and the player picks one of three or four. `question` gives the three-way guess. The correct answer is **computed from the two runs' `measure`**, with "about the same" meaning within a named tolerance. `explain(a, b)` writes the result sentence from the numbers, for example "From the city you won 14 more races; the 9 you still lost were all at HARBOR, 38 ms away".

1. **The headline.** Momentum from home, a two-minute window holding a real headline. Changes:
   - double the size;
   - halve the entry threshold;
   - switch to news reaction.

   Moments: the headline lands; the entry fill; the exit.

   Teaches: momentum rides a move that takes seconds, and it pays the spread on every entry and exit.

2. **A few miles.** Arbitrage from home, a two-minute window with many gaps. Changes:
   - city office;
   - leased fibre;
   - a rack at PACIFIC.

   Moments: the closest race lost, the widest race lost, and a race won.

   Teaches: a millisecond is worth money, and a few miles is not colocation.

3. **The free option.** A colocated market maker at two cents, a three-minute window with a headline. Changes:
   - widen to five cents;
   - stand aside for the headline (the block's existing parameter, if it has one; otherwise drop this option);
   - move to the city.

   Moments: the worst adverse fill and who took it.

   Teaches: adverse selection.

Seeds are found by an env-gated search, `EXP_SEARCH=1 npx vitest run test/experiments.test.ts`, which prints candidates. The ordinary test holds what each briefing promises:

- the window holds a real headline (1 and 3) or at least N gaps (2);
- the baseline makes every listed change produce a measurable difference;
- the three answers aren't all the same across the changes, so the guess means something.

Each concept an experiment names has a glossary entry, and the briefing links it, as now.

### 4. The experiments page (UI)

- `src/ui/Root.tsx`: cover → **Experiments** list → an experiment. A **Free play** button in the list opens today's `App` with the store as it is.
  - Free play shows every stage, with stage gating dropped: the store's reveal is set on entry, and the stage code is left alone.
  - The first-week lessons and the tutorial stay in free play, unchanged, for now.
  - Which experiments are done is kept under `propshop.experiments.v1`.
- New file `src/ui/ExperimentPage.tsx`. One screen with steps:
  1. **Briefing**: what the window is, what's running, and the glossary links.
  2. **Run as given**: a compact live view, run under the frame budget. It shows the price chart for the experiment's symbol with your fills marked, your P&L, and the race count.
  3. **Pick one change**, then **guess**: more, about the same, or less.
  4. **Run again** with the change.
  5. **Side by side**: the two measures in fixed columns. Your guess is marked right or wrong, with `explain`'s sentence under it.
  6. **Moments**: up to three buttons per run. Each opens the replay.
  7. **Next experiment** / **Try another change**. Another change reruns only run B.
- **Replay**: `src/ui/Microscope.tsx` takes `onStep(n)` in place of `store`. Its only store use is `store.stepTicks`, at `Microscope.tsx:69`. The free-play call site passes `store.stepTicks`. In an experiment it runs on the `replayAt` game and adds:
  - **Play slowed** (one tick per 200 ms, a hundred times slower than real time) and a one-tick step;
  - a caption from the moment, e.g. "Harbor Quant's order arrived 23 ms before yours. Your view of LAKESIDE was 38 ms old."
- Phone width: the steps stack and the side-by-side becomes two rows. Layout keeps its room as the run goes (fixed columns), as elsewhere.
- Tests in `test/ui.test.tsx`:
  - The list shows the three experiments and Free play.
  - An experiment walks from briefing to result with the runner stubbed to tiny windows.
  - A wrong guess is marked wrong.
  - A moment opens the replay.

## Critical files

- **Sim:** `src/sim/random.ts`, `game.ts`, `flow.ts`, `market.ts`, `exchange.ts`, `news.ts`, `darkweb.ts`, `index.ts`, and the new `experiment.ts`.
- **Content:** the new `src/content/experiments.ts`, plus glossary entries if a term is missing.
- **UI:** `src/ui/Root.tsx`, `Microscope.tsx`, the new `ExperimentPage.tsx`, `App.tsx` (Microscope call site), `styles.css`.
- **Tests:** `test/game.test.ts`, the new `experiment.test.ts` and `experiments.test.ts`, `ui.test.tsx`.
- **Docs:**
  - `CLAUDE.md`: layout, the chance rule, the save edge case and re-measured figures, and a "What is not held" line on what experiment seeds promise.
  - `README.md`: the experiments come first in "What is in it".
  - `plans/experiments.md`: this plan, recorded at the start of the build.

## Out of scope for this slice

- Converting the other lessons into experiments.
- Removing the stages, lessons or tutorial code.
- A campaign or money across experiments.
- Number guesses.
- Making the crowd's draws independent of the book.

## Verification

- `npm run check` is green.
- `test/game.test.ts` shows the world streams are untouched by the firm.
- `test/experiment.test.ts` shows replay is exact.
- `test/experiments.test.ts` shows each experiment's promises hold on its seed.
- Seen headless with Playwright, borrowed from `~/projects/artshape-game-template` as before, at desktop and phone width:
  - Play each of the three experiments end to end: run, change, guess, compare, open a moment and play it slowed.
  - Screenshot each result and replay.
  - Time each run: a two-minute window should finish in under ten real seconds unthrottled.
  - Then open Free play and see the old game run with everything shown.
- Re-measure layout shift on the experiment page during a run (target near 0), as CLAUDE.md does for the others.

## Who builds it

Per the house rules, this plan is made on Opus. Parts 1, 2 and 4 are well specified and are built on Sonnet: switch the session's model in the model menu, or hand each part to the `builder` agent in turn. Part 3, choosing seeds and writing the questions and explanations so they teach, is design work and is better on Opus. The builder reads `~/projects/guardrails/GUARDRAILS.md` first, as the house rules ask of a project without the kit.
