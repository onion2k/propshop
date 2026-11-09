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
    npm test             unit tests alone (Vitest, test/), without the step-rate floors
    npm run floors       the step-rate floors, alone (test/speed.test.ts)
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
DOM and `src/content`) and the unit tests. No gate keeps a baseline: the performance floors are two tests in
`test/speed.test.ts`, `steps fast enough for the top speed` (no desk open, 75,000 ticks a second) and `steps fast
enough with every built desk open` (35,000). The check runs them alone after the rest (`npm run floors`; `npm test`
skips them), since beside the other files they fail under load (see `docs/measured.md`). The harnesses above
measure; they hold nothing.

## Layout

- `src/sim/` is the market and the firm, pure TypeScript. It imports
  nothing from React, the DOM or `src/content`; lint holds that. Content is
  handed in at construction. `src/sim/index.ts` is the one surface the UI
  uses, and is what a remote API would later stand behind.
- `src/ui/` is React components with no game logic. `src/main.tsx` wires
  the two together and runs the sim loop; `src/ui/Root.tsx` shows the cover
  first, then the experiments list (grouped by desk), both with the sim held; its two doors open `App`: Run the firm
  (`setReveal(false)`, staged) and Free play (`setReveal(true)`, everything shown).
  `ExperimentPage.tsx` runs an experiment's two runs itself, under the same frame budget as the store.
  The free-play save is kept packed (`src/ui/savefile.ts`: gzip and base64 behind `gz:`, packed in
  `src/save.worker.ts`) and unpacked before the store is made; a plain JSON save still reads.
- The **Overview** grows: Position and Today from the first minute, Trends and Comparisons from the first close (a
  day kept or a stored night), Signals when one is raised, one muted line saying what is to come (`overviewShown`,
  `comingLine` in `src/ui/overview.ts`). The same pure file holds `blockRecord` / `blockVerdict` (a block card's
  record and why), `dayCause` (what lost or made a day: Days tab and the yesterday sentence), `racesVenues`,
  `shownBalances` and `shopLatency`; their words are in `src/content/signals.ts`. A lesson's optional `go` (a `Place`:
  page, Reports tab, `data-tut` target; `GO_TARGETS` lists the targets) is what "Take me there" does, through
  `GoContext` (`src/ui/Go.ts`) held by `App`. The snapshot's stocks and exchanges carry their `desk`; the watchlist is
  one `tbody` a desk when more than one is open, the races table lists a non-stock venue only after an order there
  today, a currency balance shows once non-zero or after a day with fills on the currencies desk, and the shop shows
  latency for the venues traded (watched, or ordered today) with the rest in a `details`.
- The **Overview** is the page the game opens on (`src/ui/OverviewPanel.tsx`, its sections and charts beside it;
  the Market page is one tab along). `src/ui/overview.ts` works out its verdicts, records, payback and trends,
  pure; `src/content/signals.ts` is the signals (thresholds and words together) from the day reports. The night's
  tests: `src/sim/backtest.ts` is `testNight` and `variants`, pure; `src/nightjob.ts` is one job as a plain module,
  `src/backtest.worker.ts` carries it in a Web Worker, and `src/ui/nights.ts` holds the stored nights, the
  player's own test and the main-thread runner. The store pins the live game three times a day (the open, a
  minute before the day's largest scheduled headline, 14:30; `MAX_DAY_PINS`) in memory only, and at the close
  hands the pins to the runner. The browser keeps `propshop.tests.v1`, the last `MAX_NIGHTS` nights' results.
- **Moments** (`src/ui/Moments.tsx`, one line in a fixed-height slot under the top bar, `aria-live="polite"`): the
  sim tells two more events, `delivery` (the player's firm only, from `Firm.expire`, which now returns what it
  delivered) and `round` (`Firm.takeRounds`; the triangle, once its fills have touched all three pairs since the
  block was last flat, netting what they moved at home at their moments' rates, fees out; `stats.arbRoundTrips` is
  counted there, and only for the triangle). The round in progress is saved as an optional `rounds`. The snapshot
  gains `racesWon`. `src/ui/momentChoice.ts` is the pure chooser: of the events since last looked (`openMemory`
  starts a page at the save's time, so a reload replays nothing), the highest of `MOMENT_RANK`, the latest in its
  rank, a kind at most once a `MOMENT_GAP_MS` of simulated time, held `MOMENT_HOLD_MS` of wall time, a feature the
  stage hides spent and not marked. The words are `MOMENT_WORDS` (`signals.ts`).
- **Watch mode** (a speed beside 1× to 300×): `game.nextMoment()` (`game.ts`) is a pure read of the public schedule
  (the stocks' open or close, a fix of an open desk's venue, none at the weekend, the soonest expiry of the live
  contracts of open desks) and nothing drawn; `src/ui/watch.ts` is `watchSpeed(now, next, lastMoment, lastHeadline)`,
  pure: 300× through the quiet, 1× from `WATCH_LEAD` (5 s) before a moment to `WATCH_TAIL` (10 s) after it and after a
  `news` event, never ahead of a headline. The store (`setWatching`, `getWatching`, `getWatchState`) keeps the choice
  under `propshop.watch.v1` and sets the game's speed to 300 (so a save and an old reader see the top speed); it holds
  only while the game is at 300, so a pause or another speed ends it. In `pump` the wall time is spent in segments,
  each at the speed it is worth there, and `runTicks` (given the speed it holds) cuts its chunk to land on a lead or a
  tail's end and returns when the answer changes; the budget, the pins and the night's pump are as before. The top
  bar's `.watching` slot keeps its room; its words are `WATCH_WORDS`, glossary `watch-mode`.
- **Rivals as characters:** `Fill.against` is the other side's owner (from `Trade.buyer`/`seller`, through
  `Firm.onTrade`), and `Fill.resting` marks a fill of a resting order that the other side crossed to take (never at a
  fix). In `Game.step`, a resting fill against a named rival (the crowd, `bg`, and the firm's own `firm` are not) is
  counted in `today.takenBy` and queued in `today.markouts` (bounded by `MAX_MARKOUTS`), and marked out against the
  exchange's mid `MARKOUT_MS` (1 s) later (at the close, whatever waits is marked then, or counts nought where the book
  is empty); the `DayReport.takenBy` is `{ count, cents }` a rival, cents being how far the mid ran against the quote
  (negative where for it). `today` is saved whole, so pending marks are saved with it, as optional fields, no version
  change. Nothing draws from any stream. The words are `RIVAL_DAY_WORDS` in `signals.ts`, working in `rivalLines`
  and `rivalRows` (`overview.ts`), the page in `DaysPanel.tsx` and `RivalsPanel.tsx`; `dayCause` has `rival`. Tests:
  `test/rivals.test.ts`, `test/overview.test.ts`, `test/ui.test.tsx` "Part B". `experiment.ts` does not measure a
  picked-off quote, so nothing was reused.
- `src/sim/experiment.ts` runs an experiment: `startOf` builds the starting save, `Run` runs a window from it
  under a setup and measures it, `Prepare` pins a save before each chosen moment, `replayAt` gives the game at
  one. A save is about 7 MB (the exchanges' quote logs), so a run keeps its start and at most `MAX_PINNED`
  more, and the two runs of an experiment share one start. `Game.save()` and `Game.load()` share live
  objects: clone a save before keeping it.
- `art/` is source pictures; what the page serves is the WebP beside
  `src/main.tsx`.
- `src/content/futures.ts` is the futures desk: the Prairie Board, its distances, the rack there, and the index
  future series (`IXF`, the index carried to expiry), all in the content and closed until the desk opens
  (`plans/desk-futures.md`). Its blocks (`basisArb`, `leadLag`, `roll` in `src/sim/strategy/`) join a firm, off,
  when the desk opens (`DESK_BLOCKS`), and read the listed contracts from the view's `contracts`. The store opens
  the desk at stage 3 (`desk:futures` in the stage table), in free play and for a save from before the stages;
  its rival (`desk` on a competitor) joins the game when it opens.
- `src/content/fx.ts` is the currencies desk (`plans/desk-fx.md`): the dollar, the euro and the yen, EUR/USD,
  USD/JPY and their cross EUR/JPY (derived, like the index future), a book (EASTHOLM) and a dealer with last look
  (ASHFORD), the rack there and rollover's rates. Its blocks are `triangle` and `carry`; it opens at stage 4. A
  block sees the stocks and its own desk only; the stocks' blocks and the script see the stocks.
- `src/content/metals.ts` is the metals desk (`plans/desk-metals.md`): spot gold and silver on Sundar (nights) and
  Thamesford (days, with the fix at 05:30 and 10:00), weekly futures `GC` and `SI` on Hudson, delivered into spot,
  the lease rates that move their carry, storage, supply news on `world:metals`, the racks at Thamesford and
  Hudson. Gold reads the stocks' Mining factor (the miner `RDG`) and draws nothing for it. Its blocks are `curve`,
  `fixArb` and `crossPairs`, its rival Aldgate Metals; it opens at stage 5.
- `src/content/` is stocks, exchanges, news templates, upgrades, glossary, the lessons, the tutorial and
  `stages.ts`: the stage table, `stageOf(progress)` and `shows(feature, stage)`, pure. Stages hide things in
  the UI only; the sim keeps every block. A new game's blocks come from content `START`. The browser keeps
  `propshop.stages.v1` (the last stage whose intro was seen; a save without it is from before the stages and
  opens every stage) and `propshop.reveal.v1` (show everything; it survives Start again, and Free play sets
  it). `experiments.ts` is the four experiments: seed, desks open, window, setup, changes, the moments worth replaying,
  and the result sentence written from the two runs' numbers. The browser keeps `propshop.experiments.v1`,
  `{ done, called }`: the ones done and whether the first guess was right.
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
- **currencies:** a firm keeps dollar `cash` and an integer balance in each other currency's minor units; an fx
  fill moves two balances, and `toHome` in `src/sim/instrument.ts` is the one rounded conversion to dollars, at the
  last mid (held over the weekend). Rollover lands at 17:00 each weekday (three days on Wednesday) and counts in
  that day's P&L. The dealer holds a taker order 5 ms and refuses it if its price moved against it. A save without
  balances has none.
- **metals:** a venue with `auctions` stops continuous matching for `CALL_MS` before each fix: an IOC is refused,
  the crowd rests, an indicative is published, and at the time the book uncrosses at one price (none if nothing
  crosses, none at the weekend), with Thamesford's clients' flow drawn from its crowd stream. Storage is charged at
  17:00 each weekday (three nights on Friday) on metal held long; a short pays the lease, which may go negative. A
  future held to expiry is delivered as spot and its storage follows. Spot trades on whichever venue is open, and
  from Friday 17:00 to Sunday 18:00 none is.
- **one leg only:** an arbitrage whose far leg misses leaves a position; the block scratches its own.
- **capacity:** orders past the computer's limit are dropped and counted, never queued.
- **a tip:** real or made up, and the fine that may follow days later.
- **saved:** a save from the previous tick loads to the same future. Saves are version 3; a version 2 save, from
  before margin, loads as it is. A version 1 save, from before the streams, loads with its streams drawn from its
  one random state: a good game, not the future it had. Any other version is refused. The live contracts are not
  saved: they are listed again from the save's time, by the same steps a running game took. The page's save is packed in a worker, so the save begun as the page closes may not
  land: a reload comes back to the last one written, at most ten seconds (`SAVE_EVERY`) of play behind.
- **margin:** an instrument with a `margin` is held, not bought: a fill moves cash by the fee and what it
  realises, equity counts its unrealised, the leverage cap leaves it out and an order past the initial margin is
  refused. It settles at its first listing venue's close (cash moves, equity does not); below the maintenance
  margin the firm is flattened in what is margined and trades on; at expiry it closes at the final price, or is
  delivered as its underlying, and the next contract of its series is listed (`MAX_LIVE_PER_SERIES`).
- **the same morning:** an experiment's two runs see the same fair values and headlines; the crowd answers
  each firm's orders, so the books differ, and the result page says so.
- **a slow firm:** latency of twenty ticks sees the past and arrives late; a colocated one is one tick.
- **watch mode:** closed hours run at 300× to the open's lead (skip to open as before); two moments inside one tail
  stay at 1× through both; a desk not open has no fix or expiry moments; held, nothing advances; the night's tests
  get the frame's leftover budget as always.
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
  cannot be throttled, so the night's length on a phone is a guess. Every desk open steps about 38,800 to 39,000 ticks a
  second (2026-11-09, with metals), a game day at top speed about 580 s against 285 with none; the gate is a tripwire at 35,000.
- **Watch mode's lead and tail:** `WATCH_LEAD` 5 s and `WATCH_TAIL` 10 s are drafts. A headline of a desk (`deskNews`,
  not a `news` event) does not slow it; a reload forgets a tail that was running (only the log's last open or close
  is known).
- **Layout shift:** held by hand. A section, desk heading, venue row or balance appearing is appended below what is there; a block card's record line has fixed height. What changes as the market runs keeps its room (fixed P&L columns, the
  scorecard and legend from the start, fixed-height rows, the top bar's slots); measured headless, not gated.
- **The look:** no end-to-end or picture test. The UI test is React Testing Library in jsdom; the page is looked
  at headless by hand, at 375 and 1280 wide.
- **The moments:** the ranking, the minute and the hold (`momentChoice.ts`) and the words are drafts; the look of
  the line at 375 and 1280 wide is not gated. The triangle's round counts the fills of its three pairs, not a
  measured edge, and a rival's is counted but never told. The stock `arbitrage` block's rounds are not counted.
- **The mark-out:** one second after a taken quote, against the exchange's mid; a draft, held by the replay and save
  tests, not by a figure for what a rival's take is worth.
- **The experiments' answers:** `test/experiments.test.ts` holds what each briefing promises (the headline in the
  window, every change measurable, the answers not all alike), not which answer each change gets.
- **What the Overview teaches:** the signals' thresholds and words are drafts, and the verdict band
  (`SAME_CENTS`, $100 a window) makes most changes from home "about the same"; the night harness reads it.
- **Storage:** a storage full from other keys refuses the save, caught in `store.save`, and nothing says so.
- No fuzzer and no invariants file.

## Plans

The roadmap being built is `plans/trading.md` (one firm, desks opened in turn); each desk has its own
`plans/desk-<name>.md`. `plans/first-slice.md` and the rest are the record of what was built before it.
