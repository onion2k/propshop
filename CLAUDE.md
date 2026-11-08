# Propshop: working on it

A browser game about high-frequency trading: the player runs a small prop
trading firm on a simulated market, builds a strategy from blocks, and buys
lower latency. It is a learning tool first, for the author and for players.
React, Vite, TypeScript, Vitest. The README says what the game is and
teaches; this file says how it is made. The house rules in
`~/.claude/CLAUDE.md` apply too. No guardrails kit yet, by choice.

## Commands

    npm run dev          the game at http://localhost:5181
    npm run check        formatting, types, lint, unit tests (~15 s)
    npm test             unit tests alone (Vitest, test/)
    npm run format       prettier, writing
    PACE=1 npx vitest run test/pace.test.ts
                         what each setup earns a day, headless, one seed: the economy's tuning harness
    STAGE_PACE=1 STAGE_SEEDS=1 STAGE_DAYS=1 npx vitest run test/stagepace.test.ts
                         when each lesson ticks and each stage opens, for scripted players (test/player.ts)

Node 24 (`.nvmrc`): npm 10 under Node 23 cannot resolve Vitest 5's peers.

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

## Rules for the code

- Chance comes from one seed, in named streams handed in: `world` (fair value, news), one `crowd:<exchange>`
  each, and `dark`. No `Math.random`, no `Date.now` in the sim: the same seed replays the same game. Nothing
  the firm does may draw from `world`: that is what makes two runs of one morning the same morning.
- Time is stepped: `game.step()` advances one fixed tick of simulated
  time. The wall clock never reaches the sim.
- Prices are integer cents and sizes integer shares: no float drift in
  money. Fair values are floats and are rounded at the book.
- Every list the sim keeps is bounded, and the bound is named beside it.
- Each concept the player meets has a glossary entry, and the UI links
  to it where the concept is used.

## Edge cases

For anything new, check what it does:

- **closed hours:** the books are empty, nothing fills, and a block sends nothing; skipping to the open lands
  the overnight news on the way.
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
  is the setup at the close, and the night says so. Without a worker (jsdom, or a browser that refuses one) the
  same job runs on the main thread, in closed hours only, within the frame budget. A day closed while the store
  is held (the cover, the list, an experiment) records no night. A tip is the player's, not a block's: the tests
  leave it out.

## What is not held

- The economy's pacing is measured by the PACE harness over three seeds and tuned by hand; nothing holds
  it. A run of `PACE=1 PACE_MINUTES=20 npx vitest run test/pace.test.ts` takes about ten minutes.
- The figures below are from before chance was split into streams (2026-11-06), which changed every draw. One
  seed at twenty minutes since, dollars a day: home momentum -200 (was 2,200); colocated arbitrage 8,400;
  Harbor Quant 14,900; the maker positive everywhere (home 1,600, colocated 7,000, city 4,800); city momentum
  -300; city arbitrage -1,700, and 190 held near; mean reversion -5,000 to -10,600. Not re-run over three
  seeds: if home momentum stays below nought, the first lesson of free play (momentum earns from home) is out
  of reach.
- What each setup earned on 2026-11-02 on the twelve-stock universe, dollars a day over three seeds: home
  momentum 2,200; home arbitrage about nought; colocated arbitrage 6,900; the fastest rival 11,000; the
  colocated maker 3,300 at two cents and 38,000 joining the touch on every book; pairs 600 colocated; mean
  reversion -4,000 to -10,000; index arbitrage fires a few hundred times an hour from a rack and loses about
  a thousand on scratched legs.
- From home the laptop runs one block and only momentum earns, so the first rung of the shop (city office,
  leased fibre, server) is priced at 18,000 together: about a week of momentum, so the first latency lesson
  comes early. Colocation and the links keep their weight. Measured on 2026-11-04 from the city, dollars a
  day over three seeds: momentum 2,600; the maker 1,900; arbitrage -400, and 200 held to gaps within ten
  milliseconds; arbitrage with the maker 1,300. The city teaches that a few miles is not colocation.
- The market maker is near break-even and lives by the day's regime: about -900 dollars a day over three
  seeds at home and colocated, with a calm day positive and a trending day not. It reads the book without
  its own orders in it (`touchExcluding`); what it still cannot beat is the fastest bot taking a quote in
  the tick before its cancel lands.
- Latency below one tick (2ms) is one tick: a colocated firm and one a millisecond away are the same.
- Hand trading is a measured loser, as the desk is meant to show. One seed, twenty minutes, dollars a day: a
  person at the desk sending momentum's calls as 2,000-share market orders from home loses about 23,000, and
  65,000 to 134,000 at 5,000 shares; Harbor Quant earns 8,000 to 11,000 more a day while a 2,000-share hand is
  sweeping, because the sweep opens gaps that the arbitrage firms race for. The crowd's visible top is mostly
  2,000 shares or more, so a 2,000-share order fits one exchange and only 5,000 sweeps.
- Chasing a sweep's print (`anticipate`) loses here, however it is cut: -27,000 to -165,000 a day across five
  designs, and the rival Shadow Trading runs the jump alone, near nought. The first child's print comes from
  PACIFIC, whose data takes 15 ms to reach even racks at every exchange; a slow trader's children spread over
  about 20 ms; and with a cleared-level trigger and a one-tick FPGA the chaser was still second in 32 of 43
  races. The jump on a large single resting order (`largest` in the depth) is about break-even.
- The lab's batch auction batches the firms' orders and not the crowd's, so a waiting order meets a market
  that has moved; every firm loses under it, the fastest most. A real batch auction would hold the crowd too.
- The crowd acts on each book once in five ticks, staggered. Every book is swept on its turn: a sweep keyed
  to the exchange's clock once left four books in five never swept, and everything fed on them.
- The sim gets at most 8 ms of each frame (`BUDGET_MS` in the store); what does not fit is dropped, not owed,
  and the top bar says the speed reached when it falls short. Measured headless with the CPU throttled four
  times, about a mid-range phone: 1× and 10× hold 60 frames a second; 60× and 300× hold about 49, with the sim
  reaching 20×. Before the budget they ran at one frame a second with 800 ms stalls. A worker would lift the
  ceiling; the sim's one surface is the seam for it. On 2026-11-07, a fresh game in an open market, 12 s at each
  speed: the desktop's 300× reaches 70 to 75 at 60 frames a second, so a game day (23,400 s) takes about 300 s,
  not 78 (8 ms of 16.7 is under half the time, at about 52,000 ticks a second); throttled, 300× reaches 21 at
  54 frames, a day about 18 minutes. A game two days old holds about 50 frames at 10× throttled, on the
  Overview and the Market alike.
- No end-to-end browser test: the UI test is React Testing Library in jsdom. Looked at by hand in the
  browser pane, whose frames run slowly when it is not in front.
- When the stages open is measured by the stage harness and held by nothing. A stage opens when every lesson of
  the one before is done. Measured on 2026-11-05 over three seeds, seven trading days, in trading time after the
  first open: a player who does each task at once opens stage 2 at 1.7 to 4.0 minutes, stage 3 at 5.6 to 7.7
  (after twenty arbitrage races), stage 4 when a noise headline and a real one have settled (5.8, 167 and 252
  minutes, the widest spread), and stage 5 at Monday of week 2, about three and a quarter real hours at 10×
  or half an hour at 60×. A player who keeps momentum and buys fibre stays at stage 2. Under the first rule,
  one lesson a stage, all five opened within eight minutes. A run of three seeds in parallel takes about
  27 minutes.
- Layout shift is held by hand, not by a gate. What changes as the market runs keeps its room: the P&L in fixed
  columns, positions, the scorecard and legend from the start, orders and gap rows of a fixed height, quote
  columns and the top bar's slots. Measured headless on 2026-11-05 with the browser's layout-shift score over
  fifteen seconds at 10×, on a fresh game with everything shown: the phone 0.33 to 0.03; the desktop's market
  page about 0.6, nearly all of it the orders and gaps lists moving down a row as the newest arrives, which is
  their design. The other pages 0. Playwright is borrowed from `~/projects/artshape-game-template`; there is
  none here. The Overview, 2026-11-07, the same way: the phone 0 in every case; the desktop 0 to 0.02 (a fresh
  game 0 to 0.015, two days and their nights 0.001), the charts block moving as the first points arrive.
- The night's tests, headless Chrome on 2026-11-07, one 12-core machine: a night is 3 pinned windows by 7
  setups, 21 runs of five simulated minutes. Close to `done` with the sim stopped: 48 to 52 s over eight
  nights, and the same with the sim running at 10× or 300×. CDP's CPU throttle refuses a worker, so the page
  throttled four times changed nothing; a phone-speed core is a guess from the stepping rate (a fourth), 190 to
  200 s. The main-thread fallback was not timed in a browser. Live sim beside a night, desktop: 60 frames a
  second at 10× and 59 at 300×, the speed reached as without (9.9; 76 to 81 against 70 to 75). Throttled, a
  game two days old, 10×: 51.5 frames a second with a night, 51.3 without; 300×: 47.4 and 48.7, reaching 14.7
  and 17.5, each window holding a pin or two. The worker has a core of its own; a phone with fewer may differ.
- A pin costs a stall the frame budget cannot cut: `structuredClone` of a save, which is 8 MB five minutes into
  the open and 9.5 MB by 14:30 (`game.save()` itself under 1 ms), takes 45 to 50 ms on the desktop and 165 to
  230 ms throttled four times (3 frames; 10 to 14). Timed as `publish()` at the pin: the first open of a game
  2 ms (empty quote logs), every later open, the headline and 14:30 pins 45 to 50 ms, throttled 183 and 185;
  the close, handing the pins to the worker, 42 to 64 ms (once 137), throttled 169. In real play at 300× the
  longest frames at pins were 33 to 50 ms against 17, once 117. Three pins and a close a day.
- Overview odds and ends: `propshop.tests.v1` is about 9,000 characters a night (8,700 to 9,100 after one),
  so 180,000 at twenty, under 4% of the usual 5,000,000-character limit. The verdict band (`SAME_CENTS`, $100 a
  window) makes most five-minute variants "about the same" from home. The signals' thresholds and words are
  drafts, tuned by nothing. On a phone the comparisons table scrolls sideways and hides the total and the "N of
  M" summary.
- The free-play save, 5 minutes into the open, is about 8 million characters of JSON (6.2 million the quote
  logs), past `localStorage`'s usual 5 million; packed it is 540,000 to 630,000. Measured headless on
  2026-11-08: the main thread pays 7 to 8 ms a save (JSON and the copy to the worker; 27 to 33 throttled four
  times), the worker 50 more; at 300× over 32 s the worst frames match the parent's (33 ms; throttled 83, at
  56.7 frames a second against 54.6). Packed on the main thread, gzip and base64 held a frame 50 ms, and 170 to
  200 ms throttled: Chrome's `CompressionStream` runs on the calling thread. A storage still full, from other
  keys, is caught in `store.save` and says nothing.
- No fuzzer and no invariants file yet.
- The experiments' seeds were picked by searching (the day's headlines are scheduled when the game is built,
  so a seed's news is read without running it). `test/experiments.test.ts` holds what each briefing promises:
  the headline in the window, every change measurable, the three answers not all alike. It does not hold
  which answer each change gets; on 2026-11-06 they were: the headline, size better, threshold same, news
  better; a few miles, city worse, fibre better, rack better; the free option, wider better, aside better,
  city same. A run of two minutes takes 2 to 3.5 seconds in the browser.
- `steps fast enough for the top speed` in `game.test.ts` starts timing a minute before the open, so a closed
  market flatters it: alone it reads about 77,000 ticks a second, but the open market alone is about 52,000,
  and under the whole suite it falls under its floor of 75,000 now and then. Alone on 2026-11-07, after the
  Overview's sim changes: 95,000 (four runs, 94,900 to 96,200).

## Plans

The agreed plan for the first slice is `plans/first-slice.md`.
