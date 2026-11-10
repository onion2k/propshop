# Rough fast-forward: coarse steps through the quiet at the top speed

Agreed 2026-11-10. Specified 2026-11-10 on Opus, in plan mode. Built by the `builder` agent,
tests first, reviewed and looked at headless (with the CPU throttled to a phone's speed) by this session, committed and
pushed on its own.

Chris chose (2026-11-10):

- **The top speed is rough.** At the top speed (300×) the quiet stretches run in coarse steps, and the game says so.
- **Everything else stays exact.** At 1× to 60×, and around the moments, every 2 ms is simulated.
- **Speed changes the game.** The same seed played at different speeds becomes a different game. The experiments and the
  night's tests stay exact.
- **The target:** a 09:30 to 16:00 session in about **2 minutes on his Pixel 7a**, which today reaches about 17× at most.

## Context

The game is too slow to play: a week is mostly waiting.

**What the page reaches at the top speed today** (M4 Pro, headless, 2026-11-10):

| Setup                       | In the session | Overnight |
| --------------------------- | -------------- | --------- |
| Stocks only (a staged game) | 90×            | 301×      |
| Every desk open             | 47×            | 73×       |

A Pixel 7a reaches about 17×, so one session is about 23 minutes. Nights can already be skipped ("skip to open", minute
steps), so the session is the wait.

**What is slow.** A day is 21.6 million 2 ms ticks (`TICK_MS`, `src/sim/game.ts:73`). The cost is the work done for each
simulated second, not for each tick: a profile of stocks only (scratchpad, `node --cpu-prof`) puts about 40% in the
crowd's quoting and cancelling (`cancelWhere`, `countNear`, `quote`, the normal draws) and about 25% in the firms' views
and decisions (`build`, `decide`, `depth`).

**A coarser step helps only when it is coarse.** `Game.step(dt)` already takes any `dt`: the crowd, the fair values and
the takers scale by it, and `skipToOpen` steps a minute at a time. Measured in node, with simulated time against wall
time:

| Step   | Stocks only | Every desk | Cost a step (stocks / every desk) |
| ------ | ----------- | ---------- | --------------------------------- |
| 2 ms   | 131×        | 59×        | 0.015 / 0.034 ms                  |
| 50 ms  | 389×        | 207×       |                                   |
| 250 ms | 1,409×      | 711×       |                                   |
| 500 ms | 2,767×      | 1,283×     | 0.18 / 0.39 ms                    |
| 1 s    | 5,407×      | 2,487×     |                                   |

The cost a step levels off by about 250 ms. So 500 ms is about 21× the 2 ms rate, and takes a phone from about 17× to
about 300× with stocks only, and to about 200× with every desk open. That meets the 2-minute target, before the page's
own cost.

## The design

**One named stride.** `ROUGH_MS = 500` in `src/sim/game.ts`, beside `TICK_MS`. It is a draft, set by the phone
measurement below.

- It divides `MS_PER_MINUTE` and `LOSS_CHECK_EVERY`, and it is a multiple of `TICK_MS`. So the minute records, the loss
  and margin checks, the pins and the backtest's tick-aligned starts all still land.

**A pure chooser of the next step**, `src/sim/stride.ts`: `strideAt(game-state view, now) → dt`.

- **Exact (`TICK_MS`) inside a fine window.** These reuse watch mode's machinery and words:
  - `WATCH_LEAD` before and `WATCH_TAIL` after each of `game.nextMoment()`'s moments: the open, the close, a fix, an
    expiry, a market-wide release;
  - `WATCH_TAIL` after any published headline: a company's, a sector's or a desk's (`DeskNews`).
- **Otherwise `ROUGH_MS`, aligned to the `ROUGH_MS` grid,** and cut short to land exactly on:
  - the start of the next fine window;
  - the next scheduled headline's time (`news.scheduled`), so a headline is published at its own millisecond, never up
    to half a second late. This reads the sim's own schedule to size a step; the player sees no more than they do now;
  - the stocks' and every open venue's open and close.
- It draws nothing and reads only game state, so a given speed history replays to the same game.

**Who uses it.**

- **The store, at 300× only** (watch mode's fast segments included): the store's `runTicks` / `pump` in
  `src/ui/store.ts` calls `game.step(strideAt(...))` in place of `game.step()` and counts steps against
  `MAX_TICKS_PER_ADVANCE` and the frame budget as now.
  - 1×, 10× and 60× step `TICK_MS` as now.
  - The microscope (`stepTicks`), `skipToOpen`, the experiments (`src/sim/experiment.ts`), the night's tests
    (`src/sim/backtest.ts`, `src/nightjob.ts`) and every harness are unchanged and exact.
- **A save** keeps the speed it already has. A save from the previous step, at the same speed, loads to the same future.

**Fair races inside a rough step.** Today `flow.ts` steps the firms in order, the player first, and each `Firm.step`
delivers its own due messages (`Firm.deliver` → `outbound.pop(now)`). Inside a 500 ms step, that would hand the player
every race with a rival whose message arrives in the same step.

- When `dt > TICK_MS`, `tick()` in `src/sim/flow.ts` delivers every firm's due outbound messages merged by arrival time,
  with ties in today's firm order. Then each firm decides as now.
- At `TICK_MS`, nothing changes: the held fingerprints prove it.
- So latency still orders who gets there first. What a rough step loses is the market moving between those arrivals.

**The firms decide** once a rough step (each firm's `decisionEveryMs` is under 500 ms). That is the same for the player
and the rivals.

**The page says so.**

- **The top bar:** its `.watching` slot, or the speed control, shows "rough" while the game steps `ROUGH_MS` and
  "exact" in a fine window, in fixed room (layout shift is held by hand).
- **The words:** they go in `src/content/signals.ts` beside `WATCH_WORDS`.
- **A glossary entry, `fast-forward`:** at the top speed the quiet stretches are simulated in half-second steps, so
  races in them are not exact. Around the moments and after a headline, every 2 ms is simulated. To see the races, slow
  down or watch.
- **The day's report:** it notes what share of the session ran rough, as one line. The night's tests stay exact, and
  the report says so where it compares the two.

**Rules in CLAUDE.md.** "Time is stepped" gains: one fixed tick, or `ROUGH_MS` through the quiet at the top speed,
chosen by `strideAt` from the game's state and the speed, never the wall clock. Also update the edge cases and What is
not held.

## Files

- **New:** `src/sim/stride.ts`; `test/stride.test.ts`.
- **Changed:**
  - `src/sim/game.ts`: `ROUGH_MS`, and a `step(dt)` safe at `ROUGH_MS`;
  - `src/sim/flow.ts`: the merged delivery;
  - `src/sim/firm.ts`: delivery split from deciding, if that is needed for the merge;
  - `src/sim/index.ts`;
  - `src/ui/store.ts`: `runTicks` and `pump`;
  - `src/ui/watch.ts`: share the window logic with `stride.ts`, keeping one source;
  - `src/ui/TopBar.tsx`, `src/content/signals.ts`, `src/content/glossary.ts`;
  - the day report (`src/ui/DaysPanel.tsx`, `src/ui/overview.ts`);
  - `test/speed.test.ts`;
  - `CLAUDE.md`, `README.md`, `docs/measured.md`.

## Edge cases

- **A headline inside a rough step:** the step is cut to land on its time, and a fine window follows.
- **An unannounced headline's lead:** none. The game does not slow before it, so a rough step reveals nothing; the fine
  window follows publication.
- **The close and a venue's close:** the step lands on them exactly. `onClose`, the pins, the night's start and the day's
  report are as at fine steps.
- **A fix or an expiry:** these are fine windows, so the call auction, the settlement and the delivery run exact.
- **Rollover and storage (17:00):** `crossed(now, dt, at)` already handles any `dt`. A test holds that each lands once.
- **The player's hand order at 300×:** it travels with its latency as any message does. A rough step neither slows nor
  speeds it.
- **A margin call:** checked on the `LOSS_CHECK_EVERY` grid, which `ROUGH_MS` divides.
- **Speed changed mid-step:** the store finishes the step it is in; the next step reads the new speed.
- **A save at 300× mid-session:** it loads to the same future at 300×.
- **Closed hours:** unchanged (`skipToOpen`). Overnight at 300× with other desks open runs rough too, so the night gets
  faster as well.
- **A reload during a fine window:** the window is worked out again from the game's state (the log's last moment and
  headline), as watch mode does.

## What it changes, measured, held by nothing

- **What a rough day earns** against an exact one, for the scripted players (`test/player.ts`) and the PACE setups' blocks
  (momentum, arbitrage, market maker, lead-lag, the options maker). It is measured by a harness, `ROUGH_PACE=1`, skipped
  otherwise, writing JSON over three seeds, with the results in `docs/measured.md`.
- **The risk:** a block that lives on gaps between exchanges (arbitrage, lead-lag) earns differently in the quiet. The
  harness says how differently. If a block's rough day is far from its exact day (say beyond ±50%), the report says so
  and the stride is reconsidered, not tuned around.

## Verification

- **Tests first** (`test/stride.test.ts`), each seen to fail before the code:
  - `strideAt` is `TICK_MS` in every kind of fine window and `ROUGH_MS` otherwise;
  - a rough step lands exactly on a scheduled headline, the next window, the close and a venue's close;
  - replay: the same seed at the same speed history gives the same fingerprint;
  - a save from the previous step at 300× loads to the same future;
  - the merged delivery: a rival whose message arrives earlier in a rough step beats the player;
  - rollover and storage land once across rough steps;
  - experiments and night's tests are unchanged, so their pinned figures hold.
- **Unchanged to the bit:** every held fingerprint in `test/instruments.test.ts` and `test/metalblocks.test.ts`, and the
  pinned figures in `test/experiments.test.ts`. Everything at `TICK_MS` is unchanged.
- **The floors:** the two existing floors are unchanged. A third tripwire in `test/speed.test.ts` runs a quiet rough
  session with every desk open and requires at least 10× the exact rate.
- **The phone:**
  - **The throttle:** headless Playwright with `Emulation.setCPUThrottlingRate`, set so a staged stocks-only game at 300×
    reads about 17× in the session (the Pixel 7a).
  - **The measure:** a whole session's wall time, stocks only and every desk open, before and after.
  - **The target:** about 2 minutes with stocks only, and every-desk-open reported.
  - **Rendering:** if the page's own React cost keeps it from the target, the report says how much and where (the frame
    budget, publishing), and the fix is a separate step.
- **Looked at headless** at 1280 and 375 wide: the top bar's "rough" and "exact" in fixed room, the glossary link, and
  the day report's line. No overflow and no console errors.
- **`npm run check`** green.
- **Docs:** `CLAUDE.md`, `README.md` and `docs/measured.md` brought up to date, with the result paragraph saying what was
  not checked.

## Result

Built 2026-11-10 by the `builder` agent, tests first. Added: `src/sim/tick.ts` (`TICK_MS`, `ROUGH_MS`, `isRough`),
`src/sim/stride.ts` (`strideAt`, `fineWindow`, `StrideTracker`; the window constants moved here from `src/ui/watch.ts`,
which now reads `fineWindow`), `Game.nextLanding` and `Game.lastHeadlineAt`, `DayReport.roughMs`, the merged delivery in
`src/sim/flow.ts` (`Firm.stage`, `Firm.deliverOne`, `DelayQueue.popTimed`), `runRough` and `getStride` in the store, the
bar's `.stride` slot, `ROUGH_WORDS`, the glossary entry `fast-forward`, the day report's line, `test/stride.test.ts`, the
third floor in `test/speed.test.ts` and the `ROUGH_PACE` harness (`test/roughpace.test.ts`). Every held fingerprint, the
experiments' pinned figures and the two floors are as they were.

**Chris's decision, 2026-11-10: blocks sleep in the rough stretches.** Built on the same day, tests first. In a rough step
every firm (the player and every rival) decides nothing and sends nothing, and what rests is pulled and returned
(`Firm.sleep`, `Exchange.pullOwner`); a message already on the wire still arrives and is answered, so the merged
delivery in `flow.ts` is kept (a rival's earlier message still beats the player's). The player acting (a hand order, a
block switched, a parameter changed) opens a `WATCH_TAIL` window (`lastAction`), a fix's whole call is exact (`leadOf`),
and the last moment is read from the game (`Game.lastMomentAt`) so a 300× that starts just after a fix, expiry or release
stays exact for its tail. The bar says "fast-forward" and "live".

**What it does to the game.** The first design left the blocks awake in rough steps and was far from the exact game
(arbitrage losing, the maker earning 7 to 10 times; a sweep showed it was the step); that is why they sleep. Asleep,
only 0.3% to 0.7% of a session is live, so at 300× a block earns between nothing and a fifth of its exact day, and
the scripted players earn $0 to $1,750 a day against up to $17,600 (table in `docs/measured.md`). The seats past the
first rung cannot pay their rent at 300× and `seat-back` was met once in six runs against three; the first targets stay
reachable. Rents and targets are Chris's to decide and were not touched. The step-rate tripwire reads 38 times.

**Not checked.** The phone with the blocks asleep, and the page's frame time in a browser (only the store in node). The
scripted players' 300× runs go through the store pumped 100 ms at a time with no clock, not a browser frame. The look at
375 and 1280 wide (the bar's "fast-forward" and "live" in fixed room, the glossary link, the day report's line; no overflow, no
console errors). The UI tests were written after the UI. A reload forgets the player's action window. An order that
arrives and rests in a rough step is pulled at the next one, so it may rest a step or two. A venue's batch auction shorter than 500 ms runs one a step (no content has one). The watch tests'
`runs closed hours fast` was changed to start earlier: the rough pump covers 300 s a wall second, where the tick cap held
it to 30 s.
