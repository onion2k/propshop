# Propshop: working on it

A browser game about high-frequency trading: the player runs a small prop
trading firm on a simulated market, builds a strategy from blocks, and buys
lower latency. It is a learning tool first, for the author and for players.
React, Vite, TypeScript, Vitest. The README says what the game is and
teaches; this file says how it is made. The house rules in
`~/.claude/CLAUDE.md` apply too. No guardrails kit yet, by choice. Cut down and given its missing headings
on 2026-11-08 from commit `d20c8e3`; the figures went to `docs/measured.md`.

## Commands

    npm run dev          the game at http://localhost:5181
    npm run check        formatting, types, lint, unit tests (~15 s)
    npm test             unit tests alone (Vitest, test/)
    npm run format       prettier, writing
    PACE=1 npx vitest run test/pace.test.ts
                         what each setup earns a day, headless, one seed: the economy's tuning harness
    STAGE_PACE=1 STAGE_SEEDS=1 STAGE_DAYS=1 npx vitest run test/stagepace.test.ts
                         when each lesson ticks and each stage opens, for scripted players (test/player.ts)
    NIGHT_PACE=1 NIGHT_SEEDS=1 NIGHT_DAYS=1 npx vitest run test/nightpace.test.ts
                         whole days through the store, and what each night's tests and signals say (~6 min a day)

Node 24 (`.nvmrc`): npm 10 under Node 23 cannot resolve Vitest 5's peers.

## The gates

`npm run check` is the only gate, and there is no pre-commit hook: run it by hand before a commit. It holds
formatting (Prettier), types (`tsc`, both configs), lint (ESLint, which also keeps `src/sim` free of React, the
DOM and `src/content`) and the unit tests. No gate keeps a baseline: the one performance floor is a test,
`steps fast enough for the top speed` in `test/game.test.ts` (75,000 ticks a second), which fails under load
(see `docs/measured.md`). The harnesses above measure; they hold nothing.

## Layout

- `src/sim/` is the market and the firm, pure TypeScript. It imports
  nothing from React, the DOM or `src/content`; lint holds that. Content is
  handed in at construction. `src/sim/index.ts` is the one surface the UI
  uses, and is what a remote API would later stand behind.
- `src/ui/` is React components with no game logic. `src/main.tsx` wires
  the two together and runs the sim loop; `src/ui/Root.tsx` shows the cover
  first, then the experiments list, both with the sim held; Free play opens `App` with everything shown.
  `ExperimentPage.tsx` runs an experiment's two runs itself, under the same frame budget as the store.
  The free-play save is kept packed (`src/ui/savefile.ts`: gzip and base64 behind `gz:`, packed in
  `src/save.worker.ts`) and unpacked before the store is made; a plain JSON save still reads.
- The **Overview** is the page the game opens on (`src/ui/OverviewPanel.tsx`, its sections and charts beside it;
  the Market page is one tab along). `src/ui/overview.ts` works out its verdicts, records, payback and trends,
  pure; `src/content/signals.ts` is the signals (thresholds and words together) from the day reports. The night's
  tests: `src/sim/backtest.ts` is `testNight` and `variants`, pure; `src/nightjob.ts` is one job as a plain module,
  `src/backtest.worker.ts` carries it in a Web Worker, and `src/ui/nights.ts` holds the stored nights, the
  player's own test and the main-thread runner. The store pins the live game three times a day (the open, a
  minute before the day's largest scheduled headline, 14:30; `MAX_DAY_PINS`) in memory only, and at the close
  hands the pins to the runner. The browser keeps `propshop.tests.v1`, the last `MAX_NIGHTS` nights' results.
- `src/sim/experiment.ts` runs an experiment: `startOf` builds the starting save, `Run` runs a window from it
  under a setup and measures it, `Prepare` pins a save before each chosen moment, `replayAt` gives the game at
  one. A save is about 7 MB (the exchanges' quote logs), so a run keeps its start and at most `MAX_PINNED`
  more, and the two runs of an experiment share one start. `Game.save()` and `Game.load()` share live
  objects: clone a save before keeping it.
- `art/` is source pictures; what the page serves is the WebP beside
  `src/main.tsx`.
- `src/content/` is stocks, exchanges, news templates, upgrades, glossary, the lessons, the tutorial and
  `stages.ts`: the stage table, `stageOf(progress)` and `shows(feature, stage)`, pure. Stages hide things in
  the UI only; the sim keeps every block. A new game's blocks come from content `START`. The browser keeps
  `propshop.stages.v1` (the last stage whose intro was seen; a save without it is from before the stages and
  opens every stage) and `propshop.reveal.v1` (show everything; it survives Start again, and Free play sets
  it). `experiments.ts` is the three experiments: seed, window, setup, changes, the moments worth replaying,
  and the result sentence written from the two runs' numbers. The browser keeps `propshop.experiments.v1`,
  the ones done.
- `test/` is Vitest, one file per sim module, `stages.test.ts` for the stages, `experiments.test.ts` for the
  experiments' seeds, and `ui.test.tsx` for the UI.

## Model features

- **Something the player sees:** the Overview's comparisons. Pure working in `src/ui/overview.ts` with its
  tests in `test/overview.test.ts`; the component in `src/ui/Comparisons.tsx`; a UI test in `test/ui.test.tsx`
  on a stored night; words that teach in `src/content/signals.ts`, with a glossary entry for each concept.
- **Something in the sim:** `src/sim/backtest.ts`, pure, exported through `src/sim/index.ts`, with
  `test/backtest.test.ts`; its worker seam in `src/nightjob.ts` and `src/backtest.worker.ts`.
- **A tool that measures:** `test/nightpace.test.ts`, a Vitest file skipped unless its variable is set, that
  writes JSON; its findings go in `docs/measured.md` with the date and the command.

## The test API

- `createStore(content, storage, seed, clock?, runner?, options?)` in `src/ui/store.ts`: with no clock the sim
  runs every tick asked; a `Storage` is three functions, so a test passes a `Map`; a `NightRunner` can be faked
  to hold or emit a night's events (`test/nights.test.ts`). `store.game` is the live `Game`, to step or set
  directly, then `store.publish()` to let the store see it.
- `new Game(content, seed)`, `skipToOpen()`, `step(ms)`, `stepTicks(n)`, `snapshot()`, `save()` / `Game.load()`.
  `test/fixtures.ts` is small content to reason about by hand; `CONTENT` is the game's own.
- `test/player.ts`: scripted players (`follower`, `sitter`) and `play(store, policy, opts)`.
- In the browser, `window.propshop` is the store, for Playwright and the console.

## Rules for the code

- Chance comes from one seed, in named streams handed in: `world` (the stocks' fair value, news), one
  `world:<desk>` for each other desk, one `crowd:<exchange>` each, and `dark`. No `Math.random`, no `Date.now` in the sim: the same seed replays the same game. Nothing
  the firm does may draw from `world`: that is what makes two runs of one morning the same morning.
- Time is stepped: `game.step()` advances one fixed tick of simulated
  time. The wall clock never reaches the sim.
- Prices are integer price points (cents, for a stock) and sizes integer units: no float drift in money. Fair
  values are floats and are rounded at the book. A quantity and a price become money in `src/sim/instrument.ts`
  (`valueOf`, by the instrument's `scaleOf`) and nowhere else.
- Every list the sim keeps is bounded, and the bound is named beside it.
- Each concept the player meets has a glossary entry, and the UI links
  to it where the concept is used.

## Edge cases

For anything new, check what it does:

- **closed hours:** the books are empty, nothing fills, and a block sends nothing; skipping to the open lands
  the overnight news on the way. Hours are each venue's: one without a `session` keeps the stocks' (the clock),
  one with its own opens, quiets and closes on it, empties its books at its own close and refuses an order that
  arrives while closed. The firm's blocks, the day and its report are still the stocks'.
- **a desk not open:** its instruments and venues are kept and not stepped, and the firms and the page do not see
  them (`market.stocks` and `market.exchanges` are the live ones; `instruments` and `venues` all). Opening one draws
  from its own `world:<desk>` stream and changes nothing of the stocks' (their factors, news and regime drifts read
  the stocks desk alone). An instrument is listed on its `venues`, or every venue of its desk.
- **one leg only:** an arbitrage whose far leg misses leaves a position; the block scratches its own.
- **capacity:** orders past the computer's limit are dropped and counted, never queued.
- **a tip:** real or made up, and the fine that may follow days later.
- **saved:** a save from the previous tick loads to the same future. A version 1 save, from before the
  streams, loads with its streams drawn from its one random state: a good game, not the future it had. Any
  other version is refused. The page's save is packed in a worker, so the save begun as the page closes may not
  land: a reload comes back to the last one written, at most ten seconds (`SAVE_EVERY`) of play behind.
- **the same morning:** an experiment's two runs see the same fair values and headlines; the crowd answers
  each firm's orders, so the books differ, and the result page says so.
- **a slow firm:** latency of twenty ticks sees the past and arrives late; a colocated one is one tick.
- **the night's tests:** they run in closed hours, after the close, over the three pins of the day just traded;
  skipping to the open does not wait for them, and the results arrive labelled with their day. A reload mid-day
  loses that day's pins (they are in memory only), and the night says why. A setup changed mid-day: the baseline
  is the setup at the close, and the night says so. Without a worker (jsdom, a browser that refuses one, or one that fails
  mid-night) the job runs on the main thread, in closed hours only, within the frame budget, each run told once. A day closed while the store
  is held (the cover, the list, an experiment) records no night. A tip is the player's, not a block's: the tests
  leave it out.

## What is not held

The figures behind each line are in `docs/measured.md`, with their dates.

- **The economy's pacing:** measured by the PACE and night harnesses, tuned by hand, held by nothing. The PACE
  harness scales an hour to a day, which understates momentum, so momentum's pace is read from whole days.
- **When the stages open:** measured by the stage harness, held by nothing.
- **Frames, the frame budget and the stalls** (a pin, the close, a save): measured headless with Playwright,
  borrowed from `~/projects/artshape-game-template` (there is none here), held by nothing. A worker would lift
  the sim's ceiling; the sim's one surface is the seam for it. Phone speed is CPU throttling, and a worker
  cannot be throttled, so the night's length on a phone is a guess.
- **Layout shift:** held by hand. What changes as the market runs keeps its room (fixed P&L columns, the
  scorecard and legend from the start, fixed-height rows, the top bar's slots); measured headless, not gated.
- **The look:** no end-to-end or picture test. The UI test is React Testing Library in jsdom; the page is looked
  at headless by hand, at 375 and 1280 wide.
- **The experiments' answers:** `test/experiments.test.ts` holds what each briefing promises (the headline in the
  window, every change measurable, the answers not all alike), not which answer each change gets.
- **What the Overview teaches:** the signals' thresholds and words are drafts, and the verdict band
  (`SAME_CENTS`, $100 a window) makes most changes from home "about the same"; the night harness reads it.
- **Storage:** a storage full from other keys refuses the save, caught in `store.save`, and nothing says so.
- No fuzzer and no invariants file.

## Plans

The agreed plan for the first slice is `plans/first-slice.md`.
