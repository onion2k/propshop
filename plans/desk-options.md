# The options desk: part 7 of the trading roadmap

State: specified 2026-11-10 on Opus, in plan mode, and agreed; 7a and 7b built 2026-11-10, 7c next. Built a part at a time (7a to 7f) by the `builder` agent, tests first, then reviewed
and looked at headless by this session, committed and pushed on its own before the next part starts. The house rule
is to build on `sonnet`; the metals desk was built on Opus at Chris's word, and the model menu is his.

Chris chose (2026-11-10):

- **Daily expiries, two live:** today's and tomorrow's, at the stocks' 16:00 close.
- **A small chain and a model quoter:** about twelve books, quoted by a maker that prices from a model and re-quotes
  only when its price moves. If every desk open falls under 35,000 ticks a second, the builder stops.
- **Implied volatility from trailing realised plus a premium:** with a fixed skew, a rise into a known release and a
  fall after it, and a small wander on `world:options`. The seller earns on quiet days and loses on trending and
  news days.
- **A public calendar:** each morning the times of the day's market-wide headlines are published. What they say,
  and which way they move the market, stay hidden. The times are read from the schedule that already exists, so
  nothing new is drawn.

## Context

The four desks before this one taught the following:

- the stocks desk: speed and the book;
- futures: the lead, carry, margin and expiry;
- currencies: three-legged arbitrage and a dealer;
- metals: the curve, delivery and the fix.

None of them teaches risk that is a sensitivity rather than a position.

The options desk teaches:

- an option as insurance and as a bet;
- the premium and what it buys;
- implied against realised volatility, and that a market maker sells the first and lives by the second;
- delta and the hedge;
- gamma, and why a trending day hurts the seller;
- theta;
- put-call parity as an arbitrage;
- volatility rising into a known release and collapsing after it.

What exists to build on, from the code:

- **`kind: 'option'`** is already in `InstrumentKind` (`src/sim/types.ts:6`). Nothing branches on it.
- **Weekly series** (`ContractSeriesSpec`, `liveContracts`, `MAX_LIVE_PER_SERIES = 6` in `src/sim/instrument.ts`) are
  listed by `Market.refreshContracts` and expired in `Game.contracts()`. A daily period works, but a Saturday would
  be listed too.
- **Derived fair values that draw nothing** come from `Market.settleDerived` (`src/sim/market.ts:664`): `carried`
  for `IXF` and `crossed` for EUR/JPY.
- **Variation points on a venue** exist already: the dealer's `lastLook` and the fix's `auctions`
  (`src/sim/exchange.ts`).
- **Margin** works as follows today:
  - a margined fill moves only the fee and what it realises;
  - a fill that is not margined pays in full, which is how a premium would be paid;
  - `marginRequired` and `checkMargins` / `Firm.marginCall` handle the rest.
- **Desk machinery:** `DeskNews`, the rivals with a `desk`, `DESK_BLOCKS`, `DESK_LESSONS`, `DESK_NAMES`, the stage
  table, and experiments with `desks`.
- **Regimes** are a pure hash of seed and day (`src/sim/regime.ts`), applied to the stocks desk alone.

What the code does not do, and this plan must add:

- **Cash at expiry.** `Firm.expire` pays nothing for a position that is not margined (`firm.ts:1172`), so an option
  expiring in the money would pay no cash.
- **Margin on a short option.** It would fall under the leverage cap at its premium's value. That is far too little
  for a short option far from the money.
- **The hedge.** An options block would see only stocks and the options desk (`symbolsFor`, `firm.ts:1078`), not
  `IXF`.
- **A venue for the options desk.** The crowd steps a venue only when the venue's own desk is open
  (`refreshLive`). The Prairie Board is the futures desk's, and trades nearly round the clock.
- **The microscope** cannot move a price. It only steps time.
- **A public schedule.** No headline is public ahead of time, and watch mode never slows before one.

## The numbers (drafts, for the builder to measure and Chris to tune)

- **Underlying:** the index `IDX`, near $52.97. The options are European and settled in cash at the index's value at
  the 16:00 close, rounded to the grid.
- **One contract is a hundred times the index,** as with `IXF`, so a delta of 0.5 on ten calls is hedged by five
  futures.
- **The chain:**
  - two live expiries, today's and the next weekday's, each expiring at 16:00;
  - three strikes on each: at the money and one step either side;
  - calls and puts, so twelve books.
- **Strike step:** about one day's move of the index. The draft is $0.50; the builder measures the index's daily
  move first and sets the step to it.
- **Strikes are centred on the index when the expiry is listed** and kept for that expiry's life. A gap through a
  strike leaves the chain off-centre until the next day's listing.
- **Premiums are on the one-cent grid.** An option at the money expiring the same day is worth roughly $0.20 to
  $0.40, which is $20 to $40 a contract. A block trades tens of contracts.
- **The model is Black-Scholes on the index** at the futures' carry (3.5%), worked out in floats and rounded at the
  book.
- **Volatility:** the at-the-money implied volatility for an expiry is built from these parts:
  - **Trailing realised:** the index's realised volatility, an exponentially weighted average of its fair-value
    returns sampled each second. This is read from the stocks, not drawn.
  - **A premium:** about 15% of the realised figure.
  - **A wander:** small, drawn from `world:options`.
  - **Event variance:** a fixed amount for each published release before the expiry, added to the expiry's total
    variance. It is gone once the release lands, and that is the crush.
- **Skew:** a fixed linear tilt in log-moneyness, with puts dearer. The draft is 10% of the at-the-money volatility
  for each 1% of moneyness.
- **The venue:** the Prairie Options Exchange (name a draft).
  - It is in the Prairie Board's building, on the options desk, and trades in the stocks' hours, 09:30 to 16:00.
  - Every location's distance to it equals its distance to the Prairie Board. The Prairie rack serves both, at a
    tenth of a millisecond.
  - It adds no rack and no rent.
- **Margin:**
  - **A long option** is paid in full, as a share is. It counts toward the leverage cap at its premium's value.
  - **A short option** posts the premium plus 15% of the index's value less any amount out of the money, with a
    floor of the premium plus 10% (exchange-style). Maintenance is the same figure at its current mark.
  - Below maintenance, the margin call flattens short options with the futures.

## Parts

### 7a. The calendar: the stocks desk, public times, nothing drawn

- **A pure `calendarOf(game, day)`** gives the day's market-scope headlines: their times and a neutral label
  ("A market release"), never the text, direction or size.
  - The times come from `news.scheduled` and `news.published`, which are scheduled a day ahead (`LOOKAHEAD`), so
    the whole day is known at the open.
  - The snapshot carries `calendar: { at, label }[]`.
- **Watch mode:** `game.nextMoment()` gains a `release` kind, so watch mode slows from `WATCH_LEAD` before a
  published release, as it does for a fix.
  - Company and sector headlines, and `DeskNews`, stay unannounced.
  - `src/ui/watch.ts`'s "never ahead of a headline" now reads "never ahead of an unannounced headline".
- **The page:** Today and the News tab show "Releases today: 10:42, 14:05". There is a glossary entry, "economic
  calendar".
- **Nothing the firm does reads the calendar yet.** The stocks' blocks are unchanged.
- **Check:** the held fingerprints in `test/instruments.test.ts` hold to the bit, and so do the experiments'
  pinned figures. A test holds that the calendar lists exactly the market-scope headlines of the day, at the open,
  for three seeds.

### 7b. Options in the sim, desk closed

- **`src/sim/options.ts`, pure:**
  - `price`, `delta`, `gamma`, `theta` and `vega` for a call or a put;
  - `impliedFrom(price, …)` by bisection, with a bounded iteration count named beside it;
  - tests against known values and put-call parity.
- **The instrument:**
  - `InstrumentSpec` gains `right?: 'call' | 'put'` and `strike?` (price points). Its `kind` is `'option'`, its
    `underlying` is `IDX`, and it has an `expiry`.
  - An `isOption` helper sits beside `isCarried`.
  - `ContractSeriesSpec` gains `weekdays?: true`, so a daily series lists no Saturday or Sunday.
  - There is one series for each right and strike offset (−1, 0, +1): six series, each `live: 2`.
- **Strikes:**
  - Each strike is fixed when its contract is listed, from the index's fair value then, rounded to the step.
  - Strikes are saved, as an optional `strikes` on `SavedMarket`. This is because a contract is listed again from
    the save's time on load, and the index's value at the original listing is not known then.
  - A save without them is from before the desk.
- **Volatility state on the market:**
  - the realised average, read from `IDX` each second;
  - the wander, drawn from `world:options`;
  - the event variance, from the calendar.
- `Market.step` makes its own call for the options desk's draw, since a desk with only derived instruments
  registers no desk factors.
- The volatility state is saved optionally, written only while the desk is open, like `leases`.
- **Fair value:** `settleDerived` prices each live option from the model each tick, while the desk is open only.
  Nothing is drawn for the price itself.
- **Expiry:**
  - `Game.contracts()` settles an option at its intrinsic value against the index's settlement price.
  - `Firm.expire` learns that an option, unmargined, moves cash by `valueOf(scale, qty, intrinsic)`, so the long
    receives it and the short pays it.
  - An option out of the money pays nothing and is gone.
- **Margin:**
  - A short option's requirement, as in the numbers above, joins `marginRequired`, the order check and
    `Firm.marginCall`.
  - A long option keeps the leverage-cap path.
- **The content:** `src/content/options.ts` holds the venue, its distances (copied from the Prairie Board's), the six
  series, the volatility numbers and the rival. It is wired in `src/content/index.ts`.
- **Check:**
  - Fingerprints move once, for the closed content only, as each desk's did, with the before and after written in
    the result. With the desk closed, every figure of the held game is the same.
  - `test/options.test.ts` holds:
    - fair value against the model;
    - the crush: an expiry's variance falls by the event's share at the release;
    - expiry in and out of the money, long and short;
    - the short's margin and its margin call;
    - a weekend that lists nothing;
    - opening the desk draws nothing from `world` and leaves the stocks' fair values and headlines the same;
    - a save from the previous tick loads to the same future.

### 7c. The model quoter, and the step rate

- **`ExchangeSpec.quoter: { halfSpreadVol, size, takeRate }`**, a variation point beside `lastLook` and `auctions`.
- On a venue with a quoter, the crowd's step for a book is replaced as follows:
  - The book's belief follows the option's fair value with the venue's lag, as now, so a fast firm watching the
    future can pick off a stale quote.
  - The quoter rests one bid and one ask at the belief, plus or minus a half-spread in volatility points turned
    into cents through vega. It re-posts only when either rounded price moves.
  - It skips the 24-deep replenishment and the stale sweep.
  - Customer takers arrive at `takeRate`, drawn from `crowd:<venue>`. They pay the spread, which is what a maker
    earns.
- **The step rate:**
  - the floors before and after, three runs each, both trees taken in turn;
  - a profile if it is not clear where the cost lands;
  - if `steps fast enough with every built desk open` falls under 35,000, the builder stops and says so;
  - figures in `docs/measured.md`.
- **Check:** a test holds that the quoter re-posts only on a price change, and that its quotes go stale with the
  lag. The floors pass.

### 7d. Blocks, the hedge's reach, the rival

- **The hedge's reach:** a desk may name the desks its blocks see as well (`DESK_SEES.options = ['futures']`, beside
  `DESK_BLOCKS`). `symbolsFor` reads it, and no other desk changes.
- **The view gains `options`:** for each live option, its `right`, `strike`, `expiry` and `underlying`. Its implied
  volatility is inverted from the book's mid by `impliedFrom`, never handed in from the crowd's belief.
- **`optionMaker`:**
  - rests a bid and an ask on each option at the book's implied volatility plus or minus its edge (a parameter, in
    volatility points);
  - with `hedge` on, keeps the net delta within a threshold of contracts by trading `IXF`;
  - flattens before 15:55 on the day's expiry.
- **`parity`:**
  - when the call less the put differs from the future less the strike (discounted) by more than a threshold after
    fees, trades the three legs (a conversion or a reversal);
  - holds to expiry, where they net out;
  - scratches a missed leg as `basisArb` does.
- **`eventVol`:**
  - buys today's at-the-money straddle a set number of minutes before the day's first release;
  - sells it a set number of seconds before the release, or holds through it (`through` on).
- **Wiring:** `DESK_BLOCKS.options` holds these three, and each joins the firm off when the desk opens.
- **The rival** (name a draft): Bluestem Volatility, on the Prairie rack, running `optionMaker` hedged. It joins
  when the desk opens.
- **Check:** each block's hand-made test on fixture content, and the triangle-style scratch of a missed leg. A
  rival-and-replay test holds that the same seed gives the same game.

### 7e. The page

- **The Market page's chain** (`src/ui/OptionsDesk.tsx`, beside `MetalsDesk.tsx`):
  - rows by strike, columns of call and put for each expiry;
  - bid and ask, implied volatility and delta in each cell;
  - the expiry's time to go;
  - "the market expects a move of ±$X by the close", the straddle's price.
- **Position:**
  - the options desk's greeks, totalled from the model at the current fair value, in the snapshot only and not
    computed each tick;
  - delta in index units, and as futures to hedge;
  - gamma, theta a day, and vega a volatility point.
- **What if:**
  - a pure `scenario(positions, indexMove, volMove)` in `src/ui/overview.ts`, with two sliders under the greeks;
  - it shows the desk's P&L if the index moves ±2% and the volatility ±5 points;
  - it does not touch the sim.
  - The roadmap's "moving the underlying in the microscope" becomes this. The microscope steps time and stays as
    it is.
- **The day's report:**
  - the options desk in "By desk";
  - the expiry's settlement in the day's lines;
  - `dayCause` learns "the expiry".
- **The stage and the names:**
  - `'desk:options': 6` and its blocks at stage 6.
  - A new stage 6, "Volatility". It is reached when stage 5 has lessons: the futures desk's three ("basis",
    "overnight", "lead"), which teach the expiry and margin that options lean on.
  - `LAST_STAGE` becomes 6.
  - `DESK_NAMES.options = 'Options'`.
  - The `momentChoice` feature for a delivery or round of the desk, and the cover's experiments grouped by desk.
- **Glossary**, the heaviest of any desk: option, call, put, strike, premium, in the money, out of the money,
  intrinsic value, time value, implied volatility, realised volatility, the volatility premium, skew, delta, gamma,
  theta, vega, delta hedge, put-call parity, conversion, the crush, cash settlement. Each is linked where the page
  uses it.
- **Check:**
  - UI tests in `test/ui.test.tsx` "Options": the chain, the greeks and the scenario.
  - `test/stages.test.ts`'s desk list.
  - Looked at headless at 1280 and 375: no overflow, no console errors, and the chain's room fixed so nothing
    shifts as quotes change.

### 7f. Lessons, experiments, tuning, a target

- **`DESK_LESSONS.options`**, opening no stage, each with its `go`:
  - "Buy insurance" (a put, and what the premium bought by the close);
  - "Implied against realised";
  - "Hedge the delta";
  - "Gamma on a trending day";
  - "Find parity";
  - "Watch the crush".
- **Experiment "the hedge":**
  - `optionMaker` hedged against unhedged, from the Prairie rack, on a trending morning;
  - the seed is found by reading `regimeFor` for a trending day with a move in the window;
  - `desks: ['futures', 'options']`.
- **Experiment "the crush":**
  - `eventVol` holding the straddle through the day's first release, against selling it a minute before;
  - the seed is found by reading the calendar for a release early in the session.
- **PACE rows** `options …`: each block from home and from the Prairie rack, with the rival beside them. The
  maker's premium, spread and take rate are tuned until the hedged maker earns on calm days and loses on trending
  ones over three seeds, and the hedge cuts its worst day. Figures in `docs/measured.md`.
- **A target:** `deskTarget('options', …)`, the desk's week netting above the Prairie rack's rent.
- **Check:** `test/experiments.test.ts` holds what each new briefing promises. The other experiments' pinned
  figures do not move.

## Edge cases

- **Expiry:**
  - In the money, the long receives intrinsic value and the short pays it.
  - Out of the money, nothing is paid.
  - Exactly at the strike, nothing is paid.
  - An option held through 16:00 by a firm whose block was turned off still settles.
- **A gap through a strike on news:** the chain is off-centre until the next listing, and the deltas of the far
  strikes jump.
- **A hedge whose leg misses:** `optionMaker` re-hedges on its next turn, and `parity` scratches its own.
- **Closed hours:** the options venue is closed outside 09:30 to 16:00 while the Prairie Board trades. A held
  option is marked at its last mid. The hedge in `IXF` can trade overnight, but there is no option to trade
  against it.
- **A weekend:** Friday's listing is for Monday, and Monday's theta covers three nights of calendar time.
- **The futures desk closed:** the options desk opens only at stage 6, after futures (stage 3). In free play both
  are open. A save with options open and futures not is refused as a desk set, or futures is opened with it; the
  builder chooses and tests.
- **A release in closed hours:** it is on the calendar, but carries no event variance for an expiry that has
  already gone.
- **The short's margin call** flattens short options and futures together, under `risk`.
- **A save from before the desk:** no strikes, no volatility state, the desk closed.
- **The experiments and the night's tests:** a window holds at most one expiry. The night's tests cover the
  options blocks as any other.
- **No bust:** equity below nought changes nothing, as now.

## What is not held (for CLAUDE.md)

- **The volatility numbers:** the premium, the skew, the event variance and the quoter's spread are drafts tuned by
  PACE.
- **One volatility path a day, a fixed skew, no surface fitted to the crowd** (`plans/trading.md`'s compressions).
- **Three strikes:** the chain does not follow the index within a day.
- **American exercise, dividends and early assignment** are not modelled.

## Not in this plan

- Options on a single stock, on gold or on currencies.
- A volatility index.
- Weekly or monthly options.
- A surface or a fitted skew.
- The firm across desks (part 8).
- The fault found in part E: a game saved the tick before a close, loaded, does not empty the crowd's books at that
  close. It stays recorded and is not fixed here.

## Verification, for each part

- Tests first, failing before the change. `npm run check` green, the floors with it.
- The fingerprints:
  - 7a holds them to the bit;
  - 7b moves them once, for the closed content, and says so;
  - 7c to 7f hold the new ones with the desk closed.
- B-style replay: the same seed replays the same game, and a save from the previous tick loads to the same future.
- Looked at headless with Playwright at 1280 and 375, with the dev server by `preview_start` and stopped after:
  - the pages each part touches, with no overflow and no console errors;
  - for 7f, one session with the hedged maker, read through the page.
- `CLAUDE.md`, `README.md`, the glossary and `docs/measured.md` brought up to date in each part's commit. The part's
  result in `plans/desk-options.md` says what was not checked.

## Result for 7a

(Built 2026-11-10, on sonnet by the `builder` agent, not committed.)

**Built.** `src/sim/calendar.ts` (`calendarOf(game, day)`, `CALENDAR_LABEL`, `isMarketWide`), exported through
`src/sim/index.ts` (with `isWeekday`). A headline is market-wide when `sector === null`: `Scheduled` carries no
`scope`, and adding one would have changed the saved news, so the existing field is read instead. `Game.nextMoment()`
gains kind `release` (the next market-wide headline in `news.scheduled`, strictly after now). The snapshot carries
`releases: { at, label }[]` for today. The page: `Releases.tsx`, in Today and on the News tab, a `min-height` line
"Releases today: 10:42, 14:05" (or "none"), its heading linking the new glossary entry `economic-calendar`;
`releaseTimes` in `overview.ts`, `CALENDAR_WORDS` in `signals.ts`, `WATCH_WORDS.termOf.release`. `watchSpeed` needed
no change (it does not look at the kind); only its comment, now "never ahead of an unannounced headline". CLAUDE.md
and README updated. Nothing the firm or a block does reads the calendar; nothing is drawn from any stream.

**What the plan got wrong.**

- The snapshot already has a `calendar` (the clock: `calendar(now)`), so the new field is `releases`.
- The day is whole at the open, and also at the first step of a new game (the constructor schedules days 0 and 1;
  the schedule is always filled to `now + LOOKAHEAD` and a day is scheduled in full at once). After `skipToOpen`
  the day, and the next, are whole. No work-around was needed.
- Overnight headlines (06:00 to 09:30) are in the day's calendar and have already landed by the open, so "Releases
  today" at 09:30 can list a time that has passed. It is the day's list, not what is left.
- A release is now a moment, so `nextMoment()` is a release (not the open) when one falls overnight. Four tests in
  `test/watch.test.ts` and one in `test/ui.test.tsx` that assert the stocks-only open or close now clear the market
  releases from the schedule first (`quiet`); their assertions are unchanged.

**Tests (written failing first).** `test/calendar.test.ts` (12): the calendar equals the day's market-scope
headlines at the open for seeds 1, 2 and 3 over five days, from the first minute for days 0 and 1, company and
sector headlines left out, only `at` and `label` carried, weekend empty, snapshot equals `calendarOf`, reading
changes nothing (save and fingerprint bit-identical), `nextMoment` reports a release (never passing one over) and
`watchSpeed` slows from the lead before it. `test/ui.test.tsx` "Part 7a" (3): the line, its fixed room across an
hour, "none", and the glossary entry.

**Checks.** Node 24.21 (the default shell had 23.4; `.nvmrc` wants 24). `npm run check` green: 46 files passed,
811 tests passed, 6 skipped (the harnesses), the floors 2 of 2 (83,249 ticks/s with no desk open against 75,000;
38,202 with futures, fx and metals open against 35,000; a second run 83,666 and 38,236). `test/instruments.test.ts`
(fingerprints) and `test/experiments.test.ts` (pinned figures) pass unchanged, bit for bit, as the sim step is
untouched and `nextMoment` and the snapshot only read.

**Not checked.** The look of the line at 375 and 1280 wide (not looked at headless; no dev server was started). Watch
mode through the store with a real release was tested only at `nextMoment` and `watchSpeed`, not by a `createStore`
pump. The TopBar's text for a release ("A market release in 12 s", linked to the glossary) is untested beyond the
`termOf` entry. The calendar is not saved or reloaded as such: it is read from the saved news schedule.

Reviewed after the hand-back (2026-11-10): a release is a moment only while a venue of an open desk is open at it.
As built, watch mode slowed to 1× at 06:00 for an overnight release in a game of the stocks alone, where nothing could
trade on it; now it does so only where the futures desk (or another trading at that hour) is open. A test holds both
sides (`test/calendar.test.ts`, "a release in closed hours"). The `quiet` step in the watch tests is kept: with the
futures desk open those tests would still meet the release first.
Looked at headless (2026-11-10, 1280 and 375): "Releases today: 11:41, 11:44, 12:45, 15:02" in Today on a staged
game, the same line on the News tab in Free play, no overflow, no console errors. Watch mode from 30 s before the
11:41 release ran fast to the lead and then at 1× through it, the bar reading "Watching: A market release". The
gate: 812 tests, the floors 83,528 and 37,994.

## Result for 7b

(Built 2026-11-10, on sonnet by the `builder` agent, not committed. Tuned after the first hand-back, at Chris's word: the floor now passes and the volatility is set to the index's measured day; see "Tuning" at the end.)

**Built.** `src/sim/options.ts` (model, greeks, `impliedFrom` by bisection with `IMPLIED_ITERATIONS = 60`, `skewed`,
`intrinsic`); `InstrumentSpec.right/strike/shortMargin`, `ContractSeriesSpec.weekdays/strikeOffset`,
`OptionsSpec` and `Content.options` (`types.ts`); `isOption` and the daily `liveContracts` (`instrument.ts`); in
`Market`: strikes at listing (`strikeFor`, saved as `strikes`), the volatility state (`volatility`, saved as `vol` only
while the desk is open), `atmVol`, `expiryVariance`, `optionVol`, the options' fair value in `settleDerived` (a
`derived` list rebuilt when the live set changes), the wander's one draw per tick from `world:options`;
`releasesBetween` (`calendar.ts`); `Game.contracts()` settles an option at intrinsic and `Firm.expire(..., option)`
pays cash; `Firm.marginRequired`, the order check, `marginedHeld`, `marginCall` and `exposure` know a short option;
`DESK_REQUIRES` (options needs futures: opening one opens both, a save with options alone loads with both);
`src/content/options.ts` wired in `src/content/index.ts`; `'desk:options'` placed at `LAST_STAGE + 1` so no game opens it.
**Quoter: none.** The books are quoted by the ordinary crowd. That needed one fix in `Exchange.crowd`: a taker's walk
through nought on a cheap book sent an order at a price of nought or less (`Bad order`); it is now not sent (all draws
before it are unchanged, so no other venue differs).

**Figures.** Tick 2 ms. The index's close-to-close move, 36 days over four seeds: rms 64 to 100 cents, about 85 cents
(about 1.6%), so the strike step is $1.00 (the draft $0.50 was too fine). Its fair value's per-minute log variance
is 5.4e-7 in the stocks' hours (53% a year) and 2.4e-7 shut. At the money, a day out: about $0.34 a contract, as
the plan expected. Fingerprints (only the closed content moved, every other figure the same): busy colocated game
`702a3c4f` to `e127b1c6`; both desks open, metals closed, seed 1 `e2cafc0` to `3c2375bf`, seed 2 `24803de7` to
`7bffbf2f`; metals open, seed 1 `2d38b623` to `221b0e80`, seed 2 `2b0b4a3d` to `75c1833`; the pairs game in
`test/metalblocks.test.ts` `caf87952` to `cc78a986`. The sets without the options content hold to the bit
(`d8661a66`, the old `EXPECTED_DESKS_OPEN`, `a45526ec`); `test/experiments.test.ts` unchanged.

**Step rate (first build): under the floor,** 32,930 to 33,055; fixed in the tuning below.

**What the plan got wrong / found.**

- **Wrong, and corrected in the tuning:** the first build said the second-sampled realised volatility overstated the
  index's day move (a variance ratio of 0.55 from 36 small samples). Measured over 44 sessions the ratio is about 1
  from a minute to an hour, so the estimator was sound; the overstatement was calendar time against a quote that
  only moves 6.5 hours a day.
- The unplaced `'desk:options'` falls to the last stage and would open at stage 5; it is placed one past the last.
- A fingerprint also moved in `test/metalblocks.test.ts`, which the plan did not name.
- `StageId` has no stage 6, so the placement is a cast; 7e widens it.

**Tests (written first for the model; the sim tests written before the sim code, run after).** `test/optionsmodel.test.ts`
(10), `test/options.test.ts` (22), `test/stages.test.ts` (+1). I did not stash the source to watch the sim tests fail:
they were first run once the code existed. `npm run check`: prettier, types, lint and 845 tests pass (5 skipped files
are the harnesses); the floors: 85,182 for none open (passes), 32,930 for all (fails).

**Not checked.** The step-rate floor (above); the look (no page); watch mode with an expiry of options; the
options books' behaviour beyond not throwing (spreads, depth); a rival or block trading them.

### Tuning (2026-11-10, after the first hand-back)

**Step rate: solved, thinly.** Profile of the first build (esbuild bundle, seed 12, `node --cpu-prof`, all four desks):
pricing was `settleDerived` 1.9% self plus `optionFair` and the normal distribution; the rest of the 13% was the twelve
more books on the ordinary crowd (`cancelWhere` +113 ms in a 6.9 s window, the exchange step +36, `walk`/`quote`/
`aggregate` +65, normal draws), and `settleIndexes` and `refreshRates` (+20 each, scaling with instruments and venues).
Cuts, all inside 7b: the options are priced only in the stocks' hours, and again only when the index has moved
`OPTION_REPRICE_CENTS` (0.2) or `OPTION_REPRICE_MS` (100) has passed (the pricing state is saved in `vol`, so a save
loads to the same future); `settleIndexes` walks the indexes alone; `venuesOf` is kept until the live set changes.
`npm run floors` alone, three runs: all desks open 35,438 / 35,473 / 35,464 (was 32,930 / 33,014 / 33,055; futures,
fx and metals alone 38,085), none open 87,521 / 87,811 / 87,680 (unchanged, 85,182 to 86,294 before). The margin over
35,000 is 1.3%. With the options venue's crowd switched off (a throwaway), 38,000 to 38,100: so the 7c quoter can save
at most about 7%, and it is where any further room must come from.

**The volatility: solved for the average, as far as 50 days say.** Variance ratios against the one-minute figure: 1.12,
1.08, 0.97, 1.04 and 1.27 at 5, 15, 30, 60 minutes and a session; session rms 82.7c, overnight 37.1c. The estimator
stays (each second), now quoted on a trading year (`TRADING_YEAR_MS`, 252 sessions); an expiry counts trading time
(`Market.tradingYears`: open hours in full, shut ones at `closedWeight` 0.07), carries `diffusionShare` (0.83) of the
at-the-money variance and adds `eventVariance` 2.5e-5 per release still to come (the news' own 50 bp: the day's
average of 2.2 releases is 5.5e-5, a quarter of a session, which the realised figure already holds, hence the share).
The crush is then about 3% of a day's variance a release: visible in the fair values, honest in size. New in
`clock.ts`: `openMsBetween`, `TRADING_YEAR_MS`. Start volatility 23%, floor 10%. Straddle, 50 days (seeds 1 to 5, ten
weekdays), the listed strike nearest the index at 09:30, price against intrinsic at 16:00, before then after:

|        | price | intrinsic | price/intrinsic | price/\|move\| | seller wins | seller mean (sd) |
| ------ | ----- | --------- | --------------- | -------------- | ----------- | ---------------- |
| before | 89.4c | 68.6c     | 1.30            | 1.72           | 37/50       | +20.8 (48.1)     |
| after  | 69.5c | 68.6c     | 1.01            | 1.34           | 29/50       | +0.9 (50.8)      |

By regime after (seller, cents a contract, wins): calm +24.0 (10/14), choppy +8.2 (10/14), trending +5.2 (5/11), news
-42.4 (4/11); before: +37.7, +27.7, +24.4, -13.1. Seller wins by seed 3 to 9 of 10, price/intrinsic 0.82 to 1.66. The
seller earns on calm and choppy days, barely on trending ones and loses on news days, but the mean is a fair price, not
a 15% premium: the days run 14% above the diffusion the estimator sees (a session's rms 82.7c against the 77c its
per-minute figure gives, trends drifting), which eats the premium. Fifty days cannot separate a few per cent; left for
7f's PACE. Fingerprints moved a third time (the closed options are listed with a fair value from the new numbers):
busy `e127b1c6` to `47d876ab`; both desks open, metals closed `3c2375bf`/`7bffbf2f` to `18560670`/`de94f65c`; metals open
`221b0e80`/`75c1833` to `993785e9`/`f4478908`; the pairs game `cc78a986` to `8494e64f`. Figures in `docs/measured.md`.
`npm run check` green (848 tests). Not checked: the margin of 1.3% over the floor on a loaded machine; the straddle at
other times of day; the quoter's real saving.

Reviewed after the hand-back (2026-11-10): `npm run check` green here, 848 tests, the floors 88,010 with no desk open
and 35,409 with all four desks open, 1.2% over the tripwire: it will fail under load, and 7c's quoter (at most about
7% back, measured with the options crowd switched off) is what gives it room. The options are priced at most every
`OPTION_REPRICE_MS` (100 ms) or on a move of `OPTION_REPRICE_CENTS` (0.2) in the index, so an option's fair value
can trail the index by up to 100 ms; the crowd's lag is longer than that, so nothing a player sees depends on it.
The premium over realised is not there yet in the straddle measure (a fair price on average); 7f tunes it.
