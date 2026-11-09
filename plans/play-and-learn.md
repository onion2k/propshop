# Playing and learning: the nine points, specified

State: specified 2026-11-09 in plan mode and agreed; part A built 2026-11-09, part B next. Each part is built by the `builder`
agent, tests first, then checked and looked at headless, committed and pushed on its own before the next starts.
What was seen in the look through the game, and the first ideas, are in this file's history (`2519aa1`).

## Context

Chris agreed twelve points from the look through the game; the way in (three) is built (`2519aa1`). He asked for
the other nine, and the two small ones, before the options desk. His choices (2026-11-09):

- **Order:** the learning points first (the page only), then the game points, each its own commit.
- **Running cost:** a weekly rent, charged at Friday's close.
- **An end:** targets only. The firm cannot go bust.
- **Pacing:** a watch mode, a new speed beside the fixed ones.

What the code has today, from reading it: no rent, target or end; a fill does not say who was on the other side;
no event for a delivery or a closed triangle (`stats.arbRoundTrips` is never added to); nothing slows for an
event; no notice component; a lesson has no link; a block's card shows no record; the Overview's five sections
all render from the first minute.

## Part A: learning (page only; no change to what the sim does)

One builder run, one commit. Pure working goes in `src/ui/overview.ts` (or a new pure file beside it) with tests
in `test/overview.test.ts`; words that teach go in `src/content/signals.ts`, each concept linked to its glossary
entry; a UI test for each in `test/ui.test.tsx`.

1. **An Overview that grows** (`src/ui/OverviewPanel.tsx`, `Comparisons.tsx`). Position and Today always. Trends
   and Comparisons appear from the first close (`s.days.length > 0`, or a stored night); Signals when
   `readSignals` returns one. Until then one muted line under Today says what will come and when. The same in
   Free play. The existing empty-state sentences inside a section stay for its sub-parts.
2. **Lessons that take you there** (`src/content/lessons.ts`, `FirstWeekPanel.tsx`, `App.tsx`). `Lesson` gains an
   optional `go: { page, tab?, target? }` (`target` a `data-tut` name). `App` gets one `goTo(place)` built from
   what the tutorial already does (`setPage`, `openTab`, the `tut-target` outline and `scrollIntoView` in
   `Tutorial.tsx`), handed down by context. The current lesson shows a "Take me there" button; none if the page
   is not shown at this stage. Every lesson of the stages and of `DESK_LESSONS` gets a `go`; a test holds that
   each names a real page, tab and target.
3. **Each block's record, and why** (`StrategyPanel.tsx`). On a block's card: days traded, net, fees, from
   `blockDays()` (`overview.ts:271`, the 60 days kept), and one line from a pure `blockVerdict(record)`:
   has not traded; earns; the signal earns but fees take it (gross > 0, net < 0); the signal itself loses
   (gross < 0). Words in `signals.ts`, with a "Read more" term (spread, fees, adverse selection). "No record
   yet" before the first close, in a line of fixed height.
4. **"Why did I lose money today?"** A pure `dayCause(d: DayReport)`: of fees, fines, rollover, storage, the
   worst block's net and the worst symbol's net, the largest loss, as one sentence with its figure; for a day
   that earned, the largest gain. First line of each day in `DaysPanel.tsx`, and joined to the Overview's
   yesterday sentence. Part B adds "taken by a rival" to its candidates.
5. **The Market page by desk** (`MarketPanel.tsx`, `FirmPanel.tsx` `Scorecard`). With more than one desk open the
   watchlist is one `tbody` per desk under a heading row (`DESK_NAMES`); with one, as now. The races table always
   lists the stocks' venues and lists another desk's venue once it has had an order today. If the snapshot does
   not carry an instrument's or venue's desk, `snapshot()` adds it (a field, no behaviour).
6. **Currency balances** (`OverviewPanel.tsx`, `FirmPanel.tsx`): a currency shows once it is non-zero or a day
   report has fills on the currencies desk; a pure `shownBalances(s)`.
7. **The shop's latency** (`ShopPanel.tsx`, a pure helper): each offer says "HARBOR 12 ms → 0.6 ms" for the
   venues the firm trades (venues of watched instruments and of today's orders), and folds the rest into a
   `details`.

Layout shift: a section, a venue row or a balance appearing is a one-off; each is appended below what is there.

## Part B: rivals as characters (sim and page)

- `Fill` gains an optional `against` (the other side's owner), passed through `Firm.onTrade` from `Trade.buyer` /
  `seller`. For a resting fill of the player's taken by a named rival, the game notes the fill and marks it out
  against the mid `MARKOUT_MS` (1 s) later, in a bounded pending list (bound named). The day tallies
  `takenBy: Record<rival, { count, cents }>` on the `DayReport` (optional field; no save version change).
  If `experiment.ts` already measures a picked-off quote, reuse its working.
- `beatenBy` (count and median margin) stays as it is; a lost race has no honest money figure, and the plan does
  not invent one.
- **Day report:** a sentence a rival, from `signals.ts`: "Harbor Quant took 14 quotes off you, worth $310, and
  beat you to 22 orders by a median 0.4 ms."
- **Rivals tab** (`RivalsPanel.tsx`): each rival a row with what it runs, where it sits, and what it took today
  and this week; the latency grid below.
- Edge cases: a rival joined mid-day; the crowd (not a rival) is not named; closed hours; a save without the
  field; nothing draws from any stream, so the same seed replays the same game (a test holds it).

## Part C: moments marked

- New `GameEvent` kinds: `delivery` (symbol, units, value) from `Firm.expire`, and `round` (block, net) when a
  `triangle` round closes (and `stats.arbRoundTrips` is counted at last). `LOG_LENGTH` bounds them as now.
- A `Moments` line (`src/ui/Moments.tsx`) in a slot of fixed height under the top bar, `aria-live="polite"`: the
  latest of a margin call, a fine, a halt, a delivery, a closed round, the day's first race won, an unlock; held
  a few wall seconds; at most one a kind a simulated minute (named constants); a link to its place through
  Part A's `goTo`. No animation under `prefers-reduced-motion`. Pure choosing in a helper with tests.
- Edge cases: 300× (many events a frame: the latest of the highest rank wins); the sim held; a reload (nothing
  replays); stages (a moment of a feature not yet shown is not marked).

## Part D: watch mode

- The sim gains a pure `game.nextMoment()`: the next of the open, the close, a fix (`auctions[].at`, open venues),
  an expiry (`market.nextExpiry`), as `{ at, kind, label }`. Public times only.
- The store gains a speed `watch` beside 1× to 300×: 300× through the quiet; 1× from `WATCH_LEAD` (5 s) before a
  public moment to `WATCH_TAIL` (10 s) after; and 1× for `WATCH_TAIL` after a headline lands. It does not slow
  before a headline: the schedule is the sim's, and slowing ahead would tell the player news is coming.
  `runTicks` cuts its chunk to land on the lead, as it does for a pin.
- The top bar's speed row gets "watch", and its slot a line: "Gold fix in 12 s" / "Watching: headline".
- Edge cases: closed hours (runs fast to the open's lead); two moments inside one tail; the frame budget
  unchanged; the wall clock still never reaches the sim; the tutorial's `speed` card.

## Part E: stakes and a goal

- **Rent.** `UpgradeSpec` gains `rent` (cents a week; home, consumer line and laptop are free). Draft: about 2% of
  the price a week. Charged on what is in use at Friday's close, to every firm, rivals too, so the tables stay
  fair. It counts in Friday's P&L and the report carries `rent`; `dayCause` learns it. The shop says "$1,500 a
  week"; Position says what is due on Friday. No draw from any stream; no save version change (an old save pays
  from its next Friday).
- **Tuning.** Before and after, `PACE=1` and the night harness: each seat's week must cover its rent for the
  setup it is meant for. The figures and the command go in `docs/measured.md`; the rents are drafts and
  `CLAUDE.md`'s "What is not held" says so.
- **Targets** (`src/content/stages.ts`, pure): one a stage, `{ id, title, done(s), progress(s) }`, shown in the
  First week tab and in Position, ticked in `propshop.targets.v1`. Drafts: end a day up; earn back the seat
  (the week covers its price and rent); a week with no halt; one for each desk (its week nets above its rack's
  rent). The standing goal: beat Harbor Quant's week, both figures shown. A target opens nothing: the stages
  still open on lessons. No bust: equity below zero changes nothing, as now.
- Edge cases: closed hours and a skipped Friday close; a desk rack bought mid-week (full week's rent, said in
  the shop); the experiments and the night's tests (their windows hold no Friday close; a test holds that the
  experiments' answers are unchanged); a held store; Free play (same sim, same rent; targets shown).

## Each part's check

- Tests first, failing before the change; `npm run check` green (the floors with it).
- Looked at headless with Playwright at 1280 and 375 (dev server by `preview_start`, stopped after): the pages the
  part touches, no overflow, no console errors.
- B, C and E: a same-seed replay test, and a save from the previous tick loads to the same future.
- `CLAUDE.md`, `README.md` and the glossary brought up to date in the same commit; the plan's Result says what
  was not checked.

## Not in this plan

Going bust; a money figure for a lost race; phone speed; the options desk (part 7 of `plans/trading.md`), which
follows.

## Result: part A

Built 2026-11-09 by the builder, tests first (each failing on a missing export or element before the change).

- **1, an Overview that grows.** `overviewShown` and `comingLine` (`src/ui/overview.ts`), words in `OVERVIEW_COMING_WORDS`
  (`signals.ts`); `OverviewPanel.tsx` renders Trends and Comparisons from the first close (a day kept or a stored night),
  Signals when `readSignals` returns one, and one `.ov-coming` line under Today. The same in Free play.
- **2, lessons that take you there.** `Lesson.go` (a `Place`) on all 22 lessons; `GO_PAGES`, `GO_TABS`, `GO_TARGETS` in
  `lessons.ts`; `GoContext` (`src/ui/Go.ts`) with `go` and `can`, built in `App.tsx` from `setPage`, `openTab` and the
  tutorial's `tut-target` outline and `scrollIntoView` (the outline fades after 4 wall seconds). `FirstWeekPanel`
  shows "Take me there" on the current lesson only, and not when the page or tab is not shown at the stage.
- **3, a block's record.** `blockRecord` and `blockVerdict` (`overview.ts`; days traded, fills, gross, fees, net over the
  days kept, computed directly rather than from `blockDays`, which holds net only); words in `BLOCK_VERDICT_WORDS`;
  `BlockRecord` in `StrategyPanel.tsx`, a two-line-high slot; "No record yet" before the first close.
- **4, why a day.** `dayCause` and `DAY_CAUSE_WORDS`; first line of each report in `DaysPanel.tsx`, and joined to the
  Overview's yesterday sentence. New glossary entry `day-cause`.
- **5, Market by desk.** `desk` added to the snapshot's `stocks` and `exchanges` (`src/sim/game.ts`, the only sim touch:
  two fields, no behaviour). Watchlist one `tbody` a desk (in the order stocks, futures, currencies, metals) under a
  `.desk-row` heading when more than one is open. `racesVenues` / `ordersToday`: the stocks' venues always (HARBOR,
  LAKESIDE and PACIFIC are all stocks-desk venues), another desk's after an order there today.
- **6, balances.** `shownBalances`, used by the Overview and the firm panel.
- **7, the shop.** `shopLatency` and `tradedVenues`; each offer says "HARBOR 44ms -> 12.1ms" for the venues watched or
  ordered today, data that lags the orders after it, the rest in `details.offer-rest`. The format is the project's
  `ms()` ("600µs", not "0.6 ms"). The old `latencies()` helper in `ShopPanel.tsx` is gone, being unused.

Tests: `test/overview.test.ts` (the pure working of all seven), `test/lessons.test.ts` (each `go` names a real page,
tab and target), `test/ui.test.tsx` "Part A" (one or more for each point, including that every lesson's target is on
its page with everything shown). Changed existing tests, and why: the fresh-Overview test (now two sections, and a
second test for after a close, whose "no night tested yet" is now "nothing ran" because the pushed day has no pins);
"shows the races and the rivals" and "queues the player's own change" (seed a stored night, since Comparisons wait for
a close); the dual-rack shop test (now reads the before and after for the venues traded).

Not checked: the look at 375 and 1280 wide (no browser here), layout shift in a real run, console errors in a browser.
Decision for Chris: the "Test tonight" form lives in Comparisons, so it now waits for the first close, and a player
cannot queue a change on day one for the first night's tests.
