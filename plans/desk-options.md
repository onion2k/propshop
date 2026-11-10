# The options desk: part 7 of the trading roadmap

State: specified 2026-11-10 on Opus, in plan mode, and agreed; 7a to 7f built 2026-11-10, **the desk built**. Built a part at a time (7a to 7f) by the `builder` agent, tests first, then reviewed
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

## Result for 7c

(Built 2026-11-10, on sonnet by the `builder` agent, not committed.)

**Built.** `ExchangeSpec.quoter` (`halfSpreadVol`, `size`, `takeRate`, `types.ts`), set on POX only
(`src/content/options.ts`: 1 volatility point, 1,000 contracts a side, one taker a second a book). `Exchange.step`
takes the market's half-spreads and, on a venue with a quoter, runs `quoterTurn` in place of `crowd`: the belief moves
as before (same lag, same noise draw); the quoter finds its own bid and ask in the book (`OrderBook.firstOf`, so it
keeps no state and nothing is saved by the exchange), keeps each while it is at the price the belief gives and holds at
least half its size, and otherwise cancels and posts again, tucked inside a firm's quote as the crowd's posts are. The
bid is `floor((belief - half) / tick)`, the ask `ceil((belief + half) / tick)`, at least a tick over the bid; a bid at
or under nought is not posted. The half-spread in price points is `halfSpreadVol` × 0.01 × vega, worked out with the
option's price in `Market.optionFair` (vega at the same skewed volatility and time, so no extra volatility read), kept
in `quoteHalf` (twelve entries at most) and saved as `half` beside `vol`, so a save loads to the same future. Takers:
one `chance` a turn from `crowd:POX` (not drawn at rate 0), then a side and a size from 1 to `size`, an IOC at the
touch, whoever rests there.

**The numbers, and why.** Half-spread 1 volatility point: vega at the money is about 53 a unit of volatility today
(0.5 cent a point) and about 120 tomorrow, on a one-cent tick, so the spread comes out 1 to 3 cents, a firm's quote
across a stale one still has room, and a far option is the tick. 1,000 contracts a side is the size of the old crowd's
touch (100 to 5,000 in orders of 100 to 500). One taker a second (the old crowd's was 3 a second at full activity) is
enough to wear a side under half its size every few seconds and make the quoter re-post, without flooding the tape.
All drafts.

**Books at seed 1, 10:30 on day 0** (the options alone open with the futures, player's blocks off, no rivals). Before
(ordinary crowd): about 45 orders a book, spread one cent everywhere, three levels of 1,000 to 5,000. After: two orders
a book.

| option                               | fair  | bid x size | ask x size |
| ------------------------------------ | ----- | ---------- | ---------- |
| OC00 5300 call, today (at the money) | 10.20 | 9 x 1000   | 11 x 1000  |
| OC01 5300 call, tomorrow             | 19.71 | 18 x 1000  | 21 x 1000  |
| OP00 5300 put, today                 | 44.66 | 44 x 813   | 46 x 882   |
| OPm0 5200 put, today (far)           | 6.65  | 6 x 1000   | 7 x 1000   |
| OCp0 5400 call, today (far)          | 0.03  | none       | 1 x 1000   |

Mean spread over the twelve: 2.1 cents (1.0 before). The fair values are the same as before to the bit: a book does
not feed the price.

**Step rate.** Interleaved, the tree at HEAD then this one, three times, `npm run floors` alone, all four desks open
(none open in brackets): HEAD 35,909 / 36,187 / 35,709 (89,272 / 89,441 / 88,919); this tree 36,920 / 36,871 / 36,825
(90,352 / 89,072 / 88,475). Taken in turn earlier, before any change: 38,554 / 38,193 / 37,912 (94,235 / 94,472 /
94,019), and after: 36,562 / 37,153 / 36,515 (89,278 / 89,040 / 88,434): the machine drifted about 5% between those
two sets (the none-open figure, which the change does not touch, moved with it), so the interleaved pair is the
comparison: about 2.6% saved (+940 ticks a second), the floor 5.2% to 5.5% over 35,000. Futures, fx and
metals alone, in the same minutes as this tree's four-desk figure: 38,700 to 39,000 against 36,800 to 37,600, so
the options desk now costs about 4% of the rate, where it cost 7 to 8%. The profile of this tree (esbuild bundle, seed
12, `node --cpu-prof`, four minutes): `quoterTurn` and its helpers are not among the first thirty frames; what is
left is the strategy views (`build`, `decide`), the other desks' crowds (`cancelWhere`, `crowd`, `aggregate`) and the
normal draws. The floors pass, so the tripwire stays at 35,000.

**Tests (written before the code; the first run of them was cut short and they were first seen to pass once the code
existed, so none was seen to fail).** `test/quoter.test.ts` (14): the bid and ask at the belief and the half-spread;
two orders a book at most; re-posts exactly when a rounded price moves; stale with the lag (a fast firm lifts the old
ask 100 cents under fair, the quote catches up in a second); no bid at or under nought; ask over bid under a tick;
refill after a taker; the stream drawn once a turn and nothing for a re-post; the quoter on POX only; the games' books
two-sided with spreads that differ; closed hours empty; takers from `crowd:POX` alone (every other stream, fair
value, volatility, news and venue's saved book the same as with takers off); replay; a save from the previous tick
loads to the same future, mid-quote and across the 16:00 close. Held to the bit: every fingerprint in
`test/instruments.test.ts` and `test/metalblocks.test.ts` and `test/experiments.test.ts` (the options desk is closed
in all). `npm run check` green: 862 passed, 6 skipped (the harnesses).

**Not checked.** A firm trading the options (no block yet: 7d); the look; the quoter's real spread against a maker's
edge (7d, 7f); the margin of 5.2% on a loaded machine (it was 1.2% at 7b and drifts 5% on this one with the day);
a firm's order across the belief makes the quoter re-post that side every turn until the belief catches up (cheap, and
it ends with the lag, but not measured); partial fills are topped up by re-posting at the same price, losing the queue
place, which no block yet sees.

## Result for 7d

(Built 2026-11-10, on sonnet by the `builder` agent, not committed.)

**Built.** `DESK_SEES.options = ['futures']` (`strategy/index.ts`), read by `Firm.symbolsFor`; no other desk sees past
its own. The view's `options` (`OptionsView`/`OptionView`/`OptionStatic` in `strategy/types.ts`; `strategy/optionsView.ts`):
a `LazyOptions` object every view carries, built when a block first reads it, with each live option's `right`, `strike`,
`expiry`, `underlying`, `multiplier`, the `spot` the firm sees (the index book's mid, else the nearest future's mid less
its carry counted to the second) and an `iv` inverted from the mid of the option's own book by `impliedFrom` (a getter,
worked out when read), `impliedAt(symbol, price)` for a mid a block asks about, `rate`, and `releases`, today's
market-wide release times from the public calendar (`Market.todaysReleases`, handed `calendarOf` by the game), times
only. `Firm.impliedCache` keeps an inversion while its mid, spot and time (in steps of a fiftieth of the time left) stand:
a pure memo, so a reloaded game works out the same numbers; a firm with no options block on does none. Three blocks,
`optionMaker`, `parity`, `eventVol` (`strategy/`), in `DESK_BLOCKS.options` and `BLOCKS`, joining a firm off when the
desk opens (and, on a load, a save of the desk from before them). The rival, Bluestem Volatility (`bluestem`, in
`COMPETITORS`): the Prairie rack, microwave, `desk: 'options'`, `watches: ['futures', 'options']` (not the stocks: it
prices the index from the future, and a rack follows twenty symbols against twenty-eight), `optionMaker` with `hedge: 1`,
`edge: 1` (the quoter's own half-spread: it queues at the touch rather than standing inside it) and `every: 500`. A new optional `StrategyBlock.pace(params)`: `Firm.decide` runs a paced block at the first decision of
each interval and makes no decision at all (no view, no equity) where every block the firm has on is paced out.

**Parameters and defaults.**

| block         | parameter                       | default                      |
| ------------- | ------------------------------- | ---------------------------- |
| `optionMaker` | `every` (think every)           | 50 ms (Bluestem 500)         |
|               | `edge`                          | 0.5 vol. points (Bluestem 1) |
|               | `size`                          | 5 contracts                  |
|               | `maxPosition`                   | 20 contracts an option       |
|               | `requote` (requote when off by) | 1 cent                       |
|               | `hedge`                         | on                           |
|               | `hedgeBand`                     | 2 contracts of the future    |
|               | `flattenBefore`                 | 5 minutes (15:55)            |
| `parity`      | `threshold`                     | 1 cent an index unit         |
|               | `contracts`                     | 1                            |
|               | `maxContracts`                  | 5 sets                       |
| `eventVol`    | `buyBefore`                     | 10 minutes                   |
|               | `sellBefore`                    | 20 seconds                   |
|               | `through`                       | off (sell before)            |
|               | `sellAfter` (when held through) | 60 seconds                   |
|               | `contracts`                     | 5                            |

**A day, seed 1, the first Monday, from the Prairie rack with defaults, Bluestem in** (`test/optionpace.test.ts`; dollars;
the player follows the index, its future and the options). Bluestem Volatility alone (no player block): P&L +128,988, 58,844
fills, 196,393 option contracts and 89,077 index-future contracts traded, the largest net delta 41.0 contracts of the
future (the market's own model delta with the market's volatility, sampled every five seconds, against a hedge band of 2:
the hedge looks twice a second and a jump moves the delta between), the largest position in any one option 24 (limit 20
and a quote of 5), never margin-called, no book crossed in 4,692 looks. The three blocks, one at a time, with Bluestem
beside them: `optionMaker` +116,048 (83,266 fills; 242,848 option and 137,803 future contracts; Bluestem +90,440 beside
it, the two sharing the customers); `parity` +125 (35 contracts, all in the first seconds of the session, where the
three books settle at different ticks: it trades a set, a leg misses and it scratches the rest; over two hours of
one-second looks at the live books it found no gap after fees); `eventVol` -21 (the day's first release in the session
was at 13:43; it bought and sold a straddle of 5 and 5, four fills, and the rise into the release did not cover the
spread and the fees). The maker's money is the spread it earns from customers who take at the touch at random: nobody
takes it in the informed way (7f).

**What 7c left, and what was done.** (1) A firm's order across the quoter's price: the quoter now tucks the price a side
is to be posted at inside the best order of anyone else on the far side (`OrderBook.bestOutside`) before it compares it
with what rests, so a side held off the belief by a firm's order is left alone (the old code cancelled and posted it
every turn, 200 times in two seconds in the test; now none). (2) A partly filled order: a side worn under half its size is
topped up behind what is left (`OrderBook.tally`, `cancelOwned`), so the front of the queue is kept, up to
`MAX_QUOTER_ORDERS` (4) orders a side at one price, past which it is posted afresh; two 7c tests that said "one order a
side" now say "one price a side". (3) A maker inside the quoter's spread on a one-cent tick: the player's `optionMaker`
at its defaults (edge 0.5) and a test firm one cent inside both sides: the book stayed two-sided and uncrossed, and the
customers met the inside quotes. Bluestem, as set for the step rate, quotes at an edge of one point and so queues behind
the quoter; the inside case is the player's and the tests'.

**Step rate.** `npm run floors` alone, the tree at HEAD then this one, three times each, interleaved on an idle machine: every desk
open HEAD 36,007 / 36,199 / 36,172, this tree 35,162 / 35,464 / 35,140 (the floor, with Bluestem in, passes all three by
0.4% to 1.3%; HEAD was 3% over it on this hour and 4 to 8% over on others); none open 87,437 / 87,793 / 87,353 against
87,535 / 87,892 / 87,156. The first build with Bluestem thinking every 10 ms read 28,800 in a bundle against 40,000
(a quarter under); inversions repeated because the spot moved with the clock, a filter an option, the view's `options` as
a getter in the view literal (3%), equity marking over every venue and a decision made when every block was paced out
were found by `node --cpu-prof` and cut; what is left is the rival's orders and fills (about 1.5%). **It is thin**: a
quicker Bluestem (50 or 100 ms, or an edge inside the spread) read 34,700 to 35,900 against the same HEAD, and the next
desk or block will not fit. The tripwire stays at 35,000.

**Tests.** `test/optionblocks.test.ts` (39: each block by hand on `optionWorld`, `test/fixtures.ts`), `test/optionrival.test.ts`
(18: `DESK_SEES`, the view, the rival, replay, saves, margin, the books, the pace), `test/quoter.test.ts` (+3, two edited),
`test/optionpace.test.ts` (the day, skipped unless `OPTION_PACE`). Seen failing before the code: the block, view, rival,
`DESK_SEES`, save and margin tests all failed (`No strategy block optionMaker`, then the missing view); of the quoter's
three, the queue place and the every-turn re-post failed and the two-sided-book test passed (it guards the case). Written
after the code and not seen to fail: the pace test, the flatten-keeps-the-hedge test (the hedge-guard test was seen to
fail by setting the guard to nought). Held to the bit: every fingerprint in `test/instruments.test.ts` and
`test/metalblocks.test.ts` and `test/experiments.test.ts` (the options desk is closed in all).

**Found and decided.**

- **A rack follows twenty symbols; the chain is twelve, the index's future two and the stocks fourteen.** A player on a
  rack who leaves the watch list alone sees the stocks, the future and four calls, so `eventVol` and `parity` did nothing in
  the first harness day. The harness sets the list; 7e needs the page to (a Watch-the-options shortcut, or the options
  desk's blocks to ask for their symbols).
- **The step rate is the constraint on the rival.** See above: Bluestem is an edge of one point and a look every 500 ms
  because a quicker or tighter one fell under the floor. It still makes $129,000 a day and the player's maker at its
  defaults $116,000: the spread from customers who take at random, with no adverse selection (and a player's maker
  inside the spread takes customers from it, $90,000). 7f must put adverse selection in or the desk is a money machine
  and a rival that earns more than ten times Harbor Quant.
- **Parity is nearly dormant.** Over two hours of one-second looks at the real books the best conversion or reversal after
  fees was about a cent short (the books are one model's); it trades only in the first moments of the session. 7f's "Find
  parity" lesson needs a source of mispricing (a rival's stale quote, a jump the call and the put book see at different
  times).
- **`eventVol` buys the strike nearest the index, not the centre of the chain** (the index had fallen 76 cents since the
  listing at 06:00): the straddle's legs then have unequal books, and a leg with none is skipped, the other bought alone.
  It lost $21 on the one release, as when the rise into a release is under the spread.

**Not checked.** The look (no page); a day on more than one seed or a trending day (one Monday, one seed: the figures above
are an anecdote, not a pace); the maker on a Friday (the future it hedges in expires at the options' own 16:00, so the
hedge moves to the next contract from ten minutes out, tested by hand and not played); the step rate on a loaded machine
or another hour (0.4% to 1.3% over); a `parity` that finds a real gap (the live books held none but the first seconds' jitter, so the tests are by hand); `eventVol` held through a
release in a live game (tested by hand); a rack follows twenty symbols so a player's options blocks see nothing until the
watch list names the options (7e); the margin call of a rival played from a real drawdown (tested with a book set by
hand); `Game.load` of a 7b or 7c save with the desk open (it gives the player's firm the three new blocks, off, and the
desk's rival, by the same code that gives a desk opened by another its blocks; no test loads such a save).

**What I noticed and left alone.** The cap of 20 symbols on a rack against 28 listed once the options desk is open; the
view's `options` is reached through `symbols`, so a player who watches too few options sees fewer (7e). `OrderBook.firstOf`
is now used only by a test. The generic `Firm.mark` change (venues that list the symbol) and the paced `decide` apply to
every desk and every firm; they change no pinned figure. `README.md`'s blocks line lists the stocks' blocks only.

## Result for 7e

(Built 2026-11-10, on sonnet by the `builder` agent, not committed.)

**Built.**

- The chain, `src/ui/OptionsDesk.tsx`, with its working in `src/ui/options.ts` (`chainOf`, `straddleOf`, `timeToGo`,
  `chainWatched`, `watchChain`), on the Market page between the watchlist and the selected symbol's detail. A table an
  expiry, a row a strike, a call and a put each with bid, ask, implied volatility (inverted from the middle of the book
  by `impliedFrom`) and delta (the model's at it), a watch box on each outer edge, the expiry's time to go, the line
  "The market expects a move of ±$X by the close" (the call and put at the strike nearest the index) and the at-the-money
  implied volatility against the realised. The options leave the watchlist (the chain is where they are watched and
  picked); a click on a cell picks the option and the detail below shows its books and its terms.
- Position: the desk's greeks (`OptionsPosition.tsx`) from `Snapshot.options`, worked out by `Game.optionsNow()` in
  `snapshot()` only (`totalGreeks`, `src/sim/options.ts`): delta in index units, the futures to hedge, gamma, theta a day
  and vega a point. `scenario(positions, indexMove, volMove, ctx)` in `src/ui/overview.ts` and its two sliders (±2%,
  ±5 points). The `stocks` entries of options carry `option` (right, strike, expiry, underlying, multiplier).
- The day's report: `DayReport.expired` (what each option held to the close settled at, paid and made), added to the
  Options row of By desk and the option's By stock row with no fill; a list under the By desk grid; `dayCause`'s
  "expiry"; an `expiry` event and moment (between a delivery and a round).
- Stage 6, "Volatility" (`LAST_STAGE` 6): `'desk:options': 6` with its three blocks, `StageId` widened, the sixth intro
  card, `Stage.needs` so that stage 5 asks for the futures desk's three lessons before stage 6, which stay the futures
  desk's (shown at stage 3). `DESK_NAMES.options`, so the cover's group heading is ready for 7f's experiments.
- 22 glossary entries, each linked where the page uses it (a test collects the links from the chain, the greeks, the
  what-if and the report and finds all 22); the words in `OPTIONS_WORDS` and `MOMENT_WORDS.expiry`, `DAY_CAUSE_WORDS.expiry`.
- `Game.setWatchList` and `store.setWatchList`, for the shortcut.
- Layout: a fixed table layout with set column widths, one-line cells of one height, a dash for a missing quote, the
  straddle, volatility, watch and legend lines each with a fixed height, and the table scrolling inside its own box
  at 375 wide. Written from the CSS alone: not looked at (below).

**What a player on the Prairie rack sees by default when the desk opens.** The rack follows twenty symbols and, with
the list never set, the first twenty listed. With every desk open (39 listed: 13 stocks, the index, `EURUSD`,
`USDJPY`, `EURJPY`, `XAU`, `XAG`, `IXF0`, `IXF1`, the metals' six, the options' twelve) that is the thirteen stocks, the
index, the three pairs, the two metals and `IXF0`: **no option and not the second future**, so the player's options
blocks (and `eventVol` and `parity` especially) see nothing until the list names the options. With the futures and
options alone open (28 listed) it is the stocks, `IXF0`, `IXF1` and four calls. The chain says "Your blocks see 0 of 12
options (watching 20 of 20)" and offers "Watch the chain", which puts the index, both futures and the twelve options in
first and refills from what was watched in listing order (five places on a rack), saying what it let go (thirteen
symbols on the default rack: GRD to RDG, the pairs and the metals). A single option is watched by its box, which is
disabled while the computer is full.

**Speed.** Nothing runs per tick: the page's work is in the snapshot and the components, the expiry once a day at 16:00.
`npm run floors` alone, HEAD (`a6ca0ab`, a worktree) then this tree, three times each, interleaved: every desk open
HEAD 36,527 / 36,542 / 36,177, this tree 36,265 / 36,321 / 36,330; none open HEAD 90,671 / 90,717 / 90,263, this tree
90,360 / 89,743 / 90,373. Both floors pass in all runs (35,000 is 3.5% to 4.1% under). Details in `docs/measured.md`.

**The money.** The options maker earns about $116,000 a day (Bluestem about $129,000), because the quoter's customers
are uninformed. **This is 7f's to tune and 7e does not touch it; but the desk is now reachable with it:** at stage 6 and
in free play a player who watches the chain and turns `optionMaker` on collects it. Do not ship stage 6 as it is.

**Tests (written first; the first run failed for the missing code, as listed).** `test/chain.test.ts` (new, 13),
`test/optionsreport.test.ts` (new, 17), `test/overview.test.ts` (+ scenario, greeks, expiry), `test/moments.test.ts`
(+ the expiry moment), `test/stages.test.ts` (the sixth stage and `needs`), `test/ui.test.tsx` "Options" (16): the chain,
watching an option, the shortcut, the greeks, the what-if at ±2% and ±5 points, the expiry in the report, the 22 terms.
Updated by the stage: `test/ui.test.tsx` (21 blocks listed with everything shown, six stage headings), `test/stages.test.ts`
(the stage table to 6, the desk test), `test/targets.test.ts` (stage 6 has no target yet), `test/moments.test.ts` (the rank).
Held to the bit: every fingerprint in `test/instruments.test.ts` and `test/metalblocks.test.ts` and `test/experiments.test.ts`
(the options desk is closed in them all, and the snapshot gains nothing while it is).

**Found and fixed on the way.** `Exchange.takersSince` threw `POX does not list OC00` for an order that was in the wire
when its option was delisted at the close (the rent test, which plays a Friday in free play, found it now that free play
opens the desk). `submit` and `cancel` already refused an unlisted symbol; `takersSince` now returns nothing for one. A hand
order's `exchange.quote` in the same case is the same hazard and is left (below).

**Not checked.**

- The look: no dev server was started, as asked. The chain at 1280 and 375 wide, its fixed room, the scrolling box, the
  sliders and the report are untested by eye; jsdom has no layout, so the tests hold the structure and the figures, not the
  widths. The chain's 540px minimum and the greeks block's grid at 375 are the first things to look at.
- The stage harness with the sixth stage, and a staged game played to stage 6 by the lessons through the page (the store test
  does it with stored progress).
- The scenario against the sim: it is the model's repricing at once, not a replay; gamma and vega as the sim's own books move are not compared.
- The chain's reading in the late afternoon or after the close (the straddle moves to tomorrow's by a test); a day with the index gapped
  through the chain's strikes.
- The hand order's `exchange.quote` for an unlisted symbol, and the moment's wording on screen.

**What I noticed and left alone.**

- Stage 6 has no target (`test/targets.test.ts` now says so); 7f's `deskTarget('options')` needs the Prairie rack's rent, which
  the options desk has no rack of its own to read, so the helper needs a rack lookup.
- `Stage.needs` means a player who skips the futures lessons is held at stage 5 and the options desk stays closed; a game with the futures desk
  open from a save, or in free play, is not held.
- With the desk open in an existing staged game and the watch list unset, the player's list is the first twenty, which
  now leaves out the second future as well as the options.
- `eventVol` and `parity` are dormant on the default list for the same reason; 7f's lessons ("Hedge the delta", "Find parity") should
  start from the shortcut.
- `README.md`'s blocks line lists the stocks' blocks only.

**Fixed after review (2026-11-10): the implied volatility on the trading clock.** The chain inverted the mid on calendar
time and showed that beside the realised figure, which is quoted on a trading year: at 10:30 with 5.5 h left it read
69% against 23%, a premium of 46 points. `tradingVol(iv, from, to, closedWeight)` (`src/sim/options.ts`, exported through
`src/sim`) now converts, `iv * sqrt(calendar years / trading years)` with `Market.tradingYears`' own count, and the chain's
cells, the at-the-money line and its premium use it (`Snapshot.options.closedWeight` carries the weight). The delta
is still the model's, at the calendar-time volatility it was inverted at. The glossary entry and the line say it is on
the trading clock. Fresh free-play game, seed 1, `skipToOpen` then one hour (10:30, day 0): at the money implied 21.4%
against realised 16.3% (the market's at-the-money 20.3%), a premium of 5.1 points. Today (strikes 5200 / 5300 / 5400)
calls 24.1 / 21.5 / none, puts 25.1 / 21.4 / 19.8; tomorrow calls 24.0 / 19.8 / none, puts 23.6 / 19.5 / 16.1 (no bid on
the far call). The straddle: ±$0.59. The tomorrow header no longer says 16:00 twice. Tests: `test/chain.test.ts` (the
conversion, and every cell within 0.02 + 10% of the market's own skewed figure; both failed before), `test/ui.test.tsx`
(one 16:00 in a heading).

**The 7d blocks are untouched, and their round trip is self-consistent** (invert on calendar time, price at the
inverted volatility plus or minus the edge on the same time). But **`optionMaker`'s `edge` (and Bluestem's 1 point) is
therefore in calendar-volatility points**: a point is about 2.3 times smaller in trading terms at 10:30 today (the
ratio is the displayed figure over the calendar one), and the ratio grows towards the close. The parameter's wording
("volatility points") and 7f's tuning should know it.

## Result for 7f

(Built 2026-11-10, on sonnet by the `builder` agent, tests first, not committed. Figures in `docs/measured.md`, "The options desk's lessons, experiments and tuning (7f)".)

**Built.** The tuning (the heart of it, below); `DESK_LESSONS.options`, six lessons, all with `go: market / options` and a task
that begins "Watch the chain" (`insure`, `implied`, `hedge`, `gamma`, `parity`, `crush`: `src/content/lessons.ts`, told apart by
the symbols of the fills since a day's options are gone from the snapshot the next day); the experiments "the hedge" (seed 122, a
trending Monday, the release at 09:46:10 four minutes into the window) and "the crush" (seed 54, a calm Monday, the first release
at 11:03:14), both `desks: ['futures', 'options']` and filed under Options on the cover (`Root` reads the last desk an experiment
opens); the PACE rows `options home/prairie maker`, `unhedged`, `parity`, `eventVol` and Bluestem beside them (`test/pace.test.ts`),
and `test/optionpace.test.ts` rewritten to run a seed, a weekday and a block a run and report the day's regime and the straddle at the
money; the target `desk-options` ("Options pay the Prairie rack", `optionsTarget` in `src/content/targets.ts`), the options blocks' net
(hedge in the future included) and the options held to the close over a closed week against the futures desk's rack's rent, and the "a
target every stage" test restored to every stage.

**The tuning: what was changed and why.**

- _The market_ (`POX.quoter`, new fields in `ExchangeSpec.quoter`): customers a book about every 50 seconds (was a second), in orders of
  up to 10 contracts (was up to 1,000), net buyers by moneyness and by right (`buy`: 0.75 / 0.60 / 0.50 for a call out of / at / in the
  money, 0.92 / 0.65 / 0.50 for a put, so a maker ends short options and long delta), a few informed (`informed`: while the fair value is
  three ticks past a touch, 5 a second, up to 5 contracts: a stale quote is picked off), and the half-spread 2.5 volatility points
  (was 1, so the maker could not stand a whole tick inside it). Drawn only from `crowd:POX`; nothing when the desk is closed.
- _The blocks_ (defaults, `optionMaker`): `requote` 0 (was 1: a quote a cent off is the best price just when the market has left it:
  +0.10 cents a contract of edge with it, +1.0 without), `edge` 1.5 calendar points (was 0.5), `hedgeBand` 20 (was 2: a trade with nearly
  every fill), `flattenBefore` 30 minutes (was 5: the last half hour is all gamma). Bluestem: edge 2 (was 1), the rest default.
- _Four faults in the hedge_ found on the way and fixed with tests that failed first: an option whose expiry's books were all one-sided
  for a look dropped out of the net delta and the hedge traded the difference each way every second or two (7,000 futures contracts a day;
  Bluestem 76,000 and -$52,000 on one news Monday); the delta was worked at the index book's mid, which lags the future and drops out
  when one-sided (now the nearest future's price); the delta was worked at a volatility that flipped with whether a quote of the block's
  own was the touch (now the view's); the hedge chased the delta through the flattening (now it waits, and waits when it can read no
  volatility at all).
- _Before and after:_ seed 1's first Monday, the player's maker +$116,048 and Bluestem +$128,988 with the first customers; now the hedged
  maker -$961 on that (trending) day, Bluestem alone +$7,849. Over twelve days of three seeds (hedged, from the Prairie rack, by the day's
  regime, dollars a day): calm +3,524, trending -246, choppy -2,715, news -401; weighted +428 a day, +2,138 a week against the rack's $1,600.
  Unhedged: +4,721, +892, -2,535, +88, +1,228 a day. The hedge cuts the standard deviation of the days 21% ($3,278 to $2,577), the worst
  drawdown inside a day 35% ($6,586 to $4,279) and the worst close 6% ($4,672 to $4,387: that day is choppy, and its loss is jumps and
  gamma, not delta), and costs $750 a day (728 futures contracts at about a dollar's spread). Bluestem alone +$6,135 a day, +$30,674 a
  week (0.4 of Harbor Quant's day); beside a hedged player about +$100 a day, calm +2,945, choppy -2,880. From home (a laptop watches
  four symbols) the maker loses on five of six days. `parity` +$140 a day on the days it trades (10 contracts), `eventVol` -$25.
  The straddle seller by regime over those twelve days: calm +45, trending +0.3, choppy -28, news -0.3 points a straddle (+4.3 on
  average, price over payout 1.07, 7 days of 12), the 50 days of 7b +0.9: the 15% premium is not visible in so few days and was not
  touched, since it fixes a closed option's fair value and so every held fingerprint.
- _Edge on the page's clock._ `optionMaker`'s `edge` is in calendar-volatility points. On the chain's trading clock a point is 0.43 of a
  point for today's options and 0.63 to 0.75 for tomorrow's: the player's 1.5 is 0.65 for today's, Bluestem's 2 is 0.86, the quoter's 2.5
  is 1.1. The parameter's wording says so.

**The lessons, and how a player reaches each.** All six: Take me there to the chain on the Market page, press Watch the chain, then
`insure` buy a put by hand and hold it through 16:00; `implied` sell a call and a put at one strike by hand and hold both; `hedge` turn
on the option maker and let it trade options and the future; `gamma` play the maker through a trending or news-heavy day; `parity` turn on
the parity block through a headline; `crush` turn on the event straddle through a release. `done` is a pure function of the snapshot in each.

**The experiments.** The hedge: baseline the hedged maker, +$132 on 42 fills; turn the hedge off -$420 (worse), hedge closely (5 contracts)
+$274 (better), quote wider +$217 on 7 fills (about the same). The crush: baseline 50 calls and puts bought four minutes ahead and held
through the release, -$660 (bought at $27 a contract, sold at $21); sell a minute before -$160 (better), three minutes before -$210
(better), twice the size -$1,320 (worse). `test/experiments.test.ts` holds what each promises (the release in the window, the moments, the
future traded or not, the straddle bought and sold in full) and pins their runs; the existing seven are unchanged to the bit.

**Stage harness.** See "Stage 6" in `docs/measured.md`.

**Held to the bit.** Every fingerprint in `test/instruments.test.ts` and `test/metalblocks.test.ts` and every figure in
`test/experiments.test.ts` for the first seven experiments: the options desk is closed in them all.

**Step rate.** Taken in turn with HEAD, three times each: HEAD 34,579 / 34,407 / 34,367 and 34,135 / 34,328 / 34,231; this tree
33,380 / 33,773 / 33,689 at first and, after a cut, 33,373 / 34,206 / 34,061. **Under the 35,000 tripwire in all of them, HEAD's
included** (the machine ran about 5% slower than at 7e, where HEAD read 36,265); not lowered by the builder. Reviewed: this session read
34,272 and 34,830, and Chris lowered the tripwire to 32,000 ("slower is fine", 2026-11-10). The cut: an optional `option` property
on POX's twelve `StockState` objects made the property reads in the exchange loops every venue shares see another shape, +2.4% on the
step; the terms now live in a map. 1.0% under HEAD is left, inside the spread.

**Checks.** `npm run check`: prettier, types and lint clean, 1,011 tests pass (7 skipped, the harnesses); the step-rate floor fails
(34,596 ticks a second every desk open against the 35,000 tripwire, 85,261 with none open, which passes), as HEAD does on this machine
today (above); green once the tripwire was lowered to 32,000. One test, `sends a hand order from the desk` (3.5 s alone, at HEAD too, against a 5 s limit), timed out under the full
parallel run and was given a 30 s timeout; the options report tests (3 s each) are as near their limit and passed. Written first and seen
to fail: the customers' bias, size and informed tests (4 of 8 failed before the exchange had them; the puts' own shares were written
with the code), the lessons, the stage and the target tests, the hedge tests (chase, hedge's own price, one-sided expiry, unreadable
volatility), and two existing save tests that caught a real fault of the first build (a save from the previous tick did not load to the
same future: the option's terms for the customers were not restored). Written after the code, not seen to fail: the default
`requote` and `flattenBefore` test, the experiments' pins and promises.

**Not done or not checked.**

- The look: the page was not opened (no dev server, as asked). The chain's first-time view with the lessons, the Options group on the
  cover and the experiments' pages at 1280 and 375 wide are untested by eye.
- Three seeds and twelve days are not a pace: one day a cell, the regimes' means rest on three days each. The hedge's cut of the worst
  close is small (6%) and rests on one choppy day.
- Bluestem's loss of $52,000 on seed 2's news Monday was found in the harness and fixed, and not seen again; Bluestem was not run on more
  than those twelve days after the fixes.
- The stage harness ran one seed, with both scripted players, for eight days.
- The PACE hour rows are the first hour scaled to a day (the busiest hour for customers and the quietest for gamma): read the whole days.
- The 15% premium still does not show in the straddle seller's figures; the volatility numbers were left because they fix every closed
  option's fair value.
- Parity trades only 10 contracts on a day and the lesson's done needs a call, a put and the future: on a day with no gap it does not tick.

**What I noticed and left alone.** `optionMaker`'s `size` (5) and `maxPosition` (20) are the numbers the tuning was done at; the hedge
experiment's quotes of 25 and 100 are the experiment's own. `OrderBook.firstOf` is still used only by a test. The scripted players of
`test/player.ts` do not play the futures desk's lessons, so they never open stage 6.
