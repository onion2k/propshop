# The overview: the firm read over time, not the market by the millisecond

State: built 2026-11-07, all five parts, uncommitted. A night is 21 runs and takes 48 to 52 s from the close on the desktop, the live sim keeping its frames beside it; a pin stalls a frame 45 to 50 ms on the desktop and about 185 throttled four times; layout shift on the Overview 0 to 0.02. Figures and what they leave open are in CLAUDE.md's "What is not held".

## Context

The game opens on the Market page: books, quotes, gaps, the live order list. A real HFT shop does not watch
that. The machines trade; the people read what the machines did over hours and days (P&L by strategy, fill
and race rates, costs, how each day's character treated each strategy) and decide what to change, then test
the change before betting the firm on it. Propshop teaches the millisecond well and the desk's real job
badly: today the only view over time is the Days tab (one report a close, a bar chart), buried in Reports.

The change: a new **Overview** page becomes the page the game opens on. It shows the firm's position, trends
over days, **signals** about what to try next, and **comparisons** of the current setup against variations
of it and other strategies, measured overnight on the same day. Every chart, signal and comparison says
what it shows and how to read it. The Market page stays, one tab along.

Decided with Chris: comparisons are measured by re-running sampled windows of the day, not estimated from
logs; the game proposes the variants from its signals, and the player may queue one of their own.

## What is already there to build on

- `DayReport` (`src/sim/game.ts:79`): per day P&L, by block, by stock, races won/beaten/missed, fees, fines,
  headlines with what they moved, latency, rivals' P&L, halts, regime. Sixty kept and saved.
- `Run`, `startOf`, `Setup` (`src/sim/experiment.ts`): run a window of up to five minutes from a save under a
  setup, and measure it. Chance is in streams, so two runs from one save see the same fair values and news.
- `Game.configure(setup)` (`game.ts:577`), `Game.save()` / `Game.load()` (a save is about 7 MB; clone first).
- The day chart in `src/ui/DaysPanel.tsx` and `src/ui/Chart.tsx`; `Term` and the glossary for explanations;
  the experiments' result sentence in `src/content/experiments.ts` (verdict written from the numbers).
- The rivals are other strategies on the same day already: their day P&L is in each report.

## The page

Top to bottom, each section with a one-line "how to read this" under its heading and a fuller note folded
behind it, and `Term` links where a concept is named.

1. **Position.** Equity, today so far, this week, cash, open positions, the setup in one line (where, which
   link, which computer, which blocks), and a verdict on yesterday in one sentence.
2. **Today so far.** Equity through the day by the minute, one line per block, so a block that bleeds at the
   open or on a headline shows it. New, bounded series (below).
3. **Trends.** Over every day kept: daily P&L bars with equity (moved from Days); P&L by block, day by day;
   race share won with the firm's latency against the fastest rival's; fees as a share of gross; and a small
   table of each block's average day by regime ("the maker earns on calm days and loses on trending ones").
4. **Signals.** At most six, newest first, each: what was seen (with the number), why it matters (the
   lesson), and what would test it (a link to its comparison, if one ran). Written by content from the
   reports, so the words and the thresholds live together. First set:
   - _Beaten in races_: a share of races lost to a named rival, by a median of N ms → test the next rung of
     link or location.
   - _Fees eat the edge_: fees over half of gross → test a higher threshold (fewer, better trades).
   - _A block bleeds_: a block below nought three days running → test it switched off.
   - _Lives by the weather_: a block's sign flips with the regime → no test; a lesson on regimes.
   - _Out of capacity_: orders dropped → test the next computer.
   - _One stock carries it_: over 70% of P&L from one symbol → test watching another; may be luck.
   - _A rival does it better_: a rival running the same kind of strategy earns more → its latency gap.
   - _A free slot_: the computer runs fewer blocks than it can → test adding one.
5. **Comparisons.** Last night's tests: the current setup and each variant over the same three windows of
   the day, P&L per window and in total, races, fees, and a verdict (better / about the same / worse,
   written like the experiments' sentence), with "better in 3 of 3 windows" or "mixed" so a lucky window is
   not read as an edge. For an upgrade: its price and the days it would take to pay at the measured gain.
   Beneath, each variant tested on more than one night keeps its record ("better on 4 of 5 nights").
   A **Test tonight** form: one change of the player's own (a block on or off, one parameter, one upgrade).
   And the rivals on the same day, as the strategies the firm did not run.
6. **Explanations.** New glossary entries: backtest, sample, overfitting (a change that wins one window),
   payback, attribution (which block earned what), regime dependence. Each section's note links them.

The Market page keeps the books, gaps and live orders; the Days tab keeps the archive of reports, without its
chart.

## How the comparisons run

- **Three pinned saves a day**, taken by the live game: at the open, one minute before the day's largest
  scheduled headline (headlines are scheduled when the game is built, so this is known in the morning), and
  at 14:30. Each window is five minutes. `MAX_DAY_PINS = 3`, held for the current day only, in memory, not in
  the browser's storage (21 MB is too much): a reload loses that day's tests, and the page says so.
- **At the close** the store hands the pins, the setup at the close and the variants to a **Web Worker**. It
  runs the current setup and each variant on each window (seven setups by three windows is 21 runs of five
  minutes, about a minute on a desktop) and posts results back as each finishes. The baseline is re-run, not
  the live numbers, so baseline and variants are alike, and if the setup changed during the day the page says
  the baseline is the setup at the close.
- **Variants**: from the signals, then one step either way on each enabled block's main parameter, one swap of
  a block for another shown at the player's stage, and the next rung of each upgrade, up to
  `MAX_VARIANTS = 6`, plus the player's one. Only features shown at the stage are proposed.
- **Results** are small and kept in the browser under `propshop.tests.v1`, the last `MAX_NIGHTS = 20` nights.
- **Without a worker** (jsdom, or a browser that refuses one), the same function runs on the main thread in
  closed hours under the store's frame budget.
- The crowd answers each firm's orders, so the variant's books differ from the day that was; the comparison
  says so, as the experiment result page does.

## Parts

1. **Sim** (`src/sim/`): a bounded intraday series in the game, per minute, equity and P&L by block
   (`MAX_INTRADAY = 400`, saved; a save without it loads with none); `byBlock` and fees in `Run`'s `Measures`;
   `src/sim/backtest.ts`, a pure `testNight(content, pins, baseline, variants)` that yields one result per run,
   and `variants(setup, offers, shown)`. Tests in `test/backtest.test.ts`: a variant equal to the baseline
   measures the same; one run is deterministic; the pins of a day from a save replay the same windows.
2. **Signals** (`src/content/signals.ts`): pure, from `DayReport[]` and the snapshot to signals with their
   numbers, words and proposed variant. Tests in `test/signals.test.ts`, one per signal, on hand-made reports,
   and one for none on a quiet day.
3. **Worker and store** (`src/backtest.worker.ts`, `src/ui/store.ts`): the pins, the close's queue, the
   results' storage and the main-thread fallback. Tests with the fallback in jsdom: a close produces a night's
   results; a reload mid-day produces none and says why.
4. **The page** (`src/ui/OverviewPanel.tsx` and small charts beside it, `src/ui/App.tsx`): Overview first
   and the default page, the Days tab's chart moved here, the glossary entries, a tutorial step that points at
   it after the Reports step. A UI test sees the page on a fresh game (position, an empty "nothing yet" for
   trends and comparisons, each explained) and after a close with results.
5. **Measure and write down**: CLAUDE.md's layout and edge cases (closed hours: the night's tests run then;
   a reload; a setup changed mid-day; no worker), what is not held (how long a night's tests take on a desktop
   and on a throttled phone, and the cost of a pin to the frame), layout shift on the new page.

Parts 1 and 2 can run in parallel (2 needs only `DayReport` and the variant type, fixed first in part 1's
types); 3 needs 1; 4 needs 2 and 3; 5 last. A well-specified part is built on `sonnet` (the `builder` agent),
per the house rules; the switch is Chris's, in the model menu.

## Edge cases

- **closed hours:** the tests run in the evening; skipping to the open does not wait for them, and results
  arrive labelled with the day they tested.
- **a fresh game:** no days, no pins; every section says what will appear and when.
- **halted day or a day of no trades:** windows still run; a variant that trades where the baseline did not
  is still compared.
- **a stage:** no signal or variant names a block or feature the stage hides.
- **a tip:** the dark web's trades are the player's, not a block's: the tests leave tips out and say so.
- **saved:** results and the intraday series survive a reload; the pins do not.
- **a slow phone:** the worker keeps the live sim's frames; if a night's tests are not done by the next open
  they finish during the day.

## Risks

- `Game.save()` on the main thread three times a day: measure it; if one costs more than a frame, take it
  between frames and accept the one dropped frame, recorded.
- Measured in part 3 (Node, a 9.3 MB save): `game.save()` is under half a millisecond, but the
  `structuredClone` a pin needs is about 105 ms, six frames, three times a day, and handing the pins to the
  worker at the close clones them again. Measured in a browser (2026-11-07): `structuredClone` 45 to 50 ms on the
  desktop (3 frames), 165 to 230 ms throttled four times (10 to 14); the first open of a game is 2 ms, the rest
  45 to 50 ms; the close 42 to 64 ms, throttled 169. Left as it is, three stalls and a close a day.
- Three five-minute windows are a small sample: the page must make "mixed" the common honest answer, and
  that is itself the lesson (overfitting).
- Momentum from home currently loses (CLAUDE.md, -200 a day since the streams): the first signals a new
  player sees may be "it bleeds". That is a pacing question for the PACE harness, not this plan.

## Verification

- `npm run check` green, with the new tests above.
- Headless with the project's Playwright setup (borrowed from `~/projects/artshape-game-template`), at 1280
  and 375 wide: a fresh game opens on Overview; run through a close at 300×; the night's comparisons appear
  with the current setup's row matching across windows; the trends match the Days reports; no console errors.
- The worker's night timed on a desktop and with the CPU throttled four times; the live sim's frame rate at
  10× while it runs, against the figures in CLAUDE.md.
- Layout shift on Overview over fifteen seconds at 10×, by the browser's score.
