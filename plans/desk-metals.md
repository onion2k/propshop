# The metals desk: part 6 of the trading roadmap

State: specified 2026-11-09 on Opus, in plan mode, and agreed; built 6a to 6f the same day by the `builder` agent
on Opus at Chris's word, a part at a time. The fix-against-the-minute check is not met, by Chris's choice. See `plans/trading.md`, "Metals, third" and part
6; the foundation in `plans/instruments.md`, `plans/sessions.md`, `plans/margin.md`, and the two desks before it,
`plans/desk-futures.md` and `plans/desk-fx.md`. Chris chose (2026-11-09):

- a gold miner as a real stock on the stocks desk, with the stocks' seeds found again;
- the fix as a real call auction that holds the crowd too;
- a curve that moves, by a lease rate that wanders and jumps on supply news.

## Context

The futures desk taught the lead and the currencies desk arbitrage with three legs. The metals desk teaches:

- the futures curve: contango, backwardation, and what storage and borrowing cost;
- that supply news can flip the curve;
- delivery, the trap of holding a contract to expiry;
- the fix as a batch auction, which the Lab's batch only half is ("a real batch auction would hold the crowd too",
  `src/ui/LabPanel.tsx`);
- pairs across desks (the miner against the metal);
- the gold-silver ratio;
- a market that is open somewhere at almost any hour.

What exists to build on:

- the desks, streams, rivals, stages and lessons;
- weekly series with a carried fair value, margin, settlement at the first listing venue's close and the margin
  call;
- delivery into the underlying, paid in cash (`Firm.expire`, tested with a made-up metal in `test/margin.test.ts`);
- sessions with spans and gaps (`src/sim/session.ts`);
- rollover's daily pass and its line in the day's P&L, which storage copies;
- the experiment shape;
- the PACE rows by desk.

What is new:

- a stock that the metals read;
- a carry that moves;
- storage and the lease;
- a call auction at set times;
- news for a desk on its own stream;
- the blocks.

## The numbers (drafts, for the builder to measure and Chris to tune)

- **Gold** `XAU` near $2,400.00 an ounce. A point is ten cents (`priceUnit` 10), so it starts at 24000. A lot is 10
  ounces (`multiplier` 10), about $24,000, near what a stocks block risks.
- **Silver** `XAG` near $30.00. A point is a cent, and a lot is 500 ounces, about $15,000. The gold-silver ratio
  starts near 80. Silver moves about twice gold's daily percentage.
- **Futures**, weekly as the roadmap says:
  - series `GC` and `SI`, three live expiries each (`live: 3`), so the curve has three points;
  - one lot each, as the spot;
  - margined like `IXF`;
  - `settlement: 'delivery'` into the spot;
  - listed on the New York-like venue alone, which settles them at its close.
- **Carry** = the dollar rate (4.5%, the currencies' figure) + storage − the metal's lease rate, a year.
  - Storage is 0.5% of value a year, larger than the real figure so that a night of it shows.
  - Leases start at 0.3% for gold and 0.8% for silver, so the curve starts in contango. Each lease wanders on
    `world:metals` around its start.
  - A supply headline lifts a lease by several percent and it decays back over a day or two. A squeeze takes carry
    below zero, and the curve is then in backwardation.
- **Venues**, names drafts for Chris, all three opening only when the desk opens. Times are the sim's clock, the
  stocks' (New York):

  | Venue                     | City                    | Lists                                                                       | Hours                                            | Lag          |
  | ------------------------- | ----------------------- | --------------------------------------------------------------------------- | ------------------------------------------------ | ------------ |
  | Sundar Gold Exchange      | Port Sundar, Asian-like | spot                                                                        | 19:00–03:00, Sunday to Thursday nights           | slow, 300 ms |
  | Thamesford Bullion Market | Thamesford, London-like | spot                                                                        | 03:00–12:00 weekdays, the fix at 05:30 and 10:00 | quick, 60 ms |
  | Hudson Metals Exchange    | Hudson, New York-like   | spot 08:20–17:00, futures 18:00–17:00 Sunday to Friday as the Prairie Board | quick, 50 ms                                     |

  So a position has a market somewhere at nearly every hour of the week. Distances from every location; racks at
  Thamesford and at Hudson.

- **The miner**: Ridgeline Mining `RDG` near $45, in a new sector, Mining, not in the index.
- **Storage** is charged at 17:00 each weekday (three nights on Friday) on spot metal held long. A spot short pays
  the lease rate instead (it has borrowed the metal). Both go into cash and that day's P&L, as rollover does.

## Parts

### 6a. The miner: the stocks' world moves once, on purpose

- Add sector Mining to `FACTORS` and stock `RDG` to `src/content/stocks.ts`, listed on the three stock exchanges as
  any stock, with company news like the rest.
- This changes what `world` draws for every seed, so it is done alone, first:
  - the held fingerprints in `test/instruments.test.ts` move, with the before and after written in the result;
  - the five experiments' seeds are found again by the method each one's comment gives, and
    `test/experiments.test.ts` holds what each briefing promises;
  - the stage harness and the stocks' PACE rows are run before and after, and the figures recorded. The economy
    is not re-tuned unless a stage or a row moves past what `docs/measured.md` records as its band.
  - The desks-open fingerprint moves too.
- After 6a nothing else in this plan may move the stocks' world: 6b to 6f hold the new fingerprints to the bit with
  the metals desk closed.

### 6b. Metals in the sim, desk closed

- `src/content/metals.ts`: the three venues, the spot metals (`kind: 'metal'`, `desk: 'metals'`), the two series,
  the rates, the racks and the distances, wired in `src/content/index.ts` as the other desks are.
- **Gold reads the stocks' Mining factor.** Its fair value is its own wander (`driftDesk` on `world:metals`) times
  the Mining factor's level at a set loading. That loading is read, not drawn, as `IXF` reads `IDX`. So opening the
  desk draws nothing from `world` and moves nothing of the stocks. Silver takes gold's factor at its own loading,
  plus its own wander. While the desk is shut neither is stepped; opened, each takes the factor's level at once.
- **A carry that moves.**
  - A series may name its metal's lease (`carryFrom` on `ContractSeriesSpec`, or the builder's better name) in place
    of a fixed `carry`.
  - The market keeps each metal's lease rate, wandering on `world:metals`.
  - `carried` in `src/sim/market.ts` reads the carry now.
  - `ContractView.carry` leaves `sharedParts` (cached by the live set) for the per-tick part, as the pairs'
    `pointValue` did in 5½.
- **Storage and the lease** are a daily pass at 17:00 copying rollover (`Firm.rollover`, `DayReport.rollover`).
  `DayReport.storage` holds what was charged, in that day's P&L. It draws nothing.
- **Delivery** reuses `Firm.expire`. A long delivered into spot pays storage from that night. A short delivered is
  short spot and pays the lease.
- **Supply news.**
  - A second `News` for the metals desk, on `world:metals`, timed by the metals venues' hours, not the stocks'.
  - Its templates: a mine strike, a new deposit, central-bank buying, a refinery fire.
  - Each moves the metal's fair value and its lease, so a squeeze flips the curve.
  - It does not run while the desk is shut. Its bound is named beside it.
- **Settlement of the futures** at Hudson's close, the first listing venue as now.
- **The save.** Leases and the metals news are saved optional (absent, as before); the version stays 3.
- **Cost.** The gate `steps fast enough with every built desk open` will open metals too, since it opens
  `market.desks`. If it falls under 40,000, the builder stops and says so, as 5a did.

### 6c. The fix, a call auction that holds the crowd

- `ExchangeSpec.auctions: { at: number; callMs: number }[]`: times of day, weekdays only.
- From `at − callMs` to `at`, the venue's continuous matching stops for the symbols it lists:
  - Orders rest uncrossed.
  - An IOC from a firm is refused with "in the fix: send a resting order".
  - The crowd keeps quoting, and its takers rest at their limit instead of crossing. Each tick of the call the venue
    publishes an indicative price and volume, seen by firms through their data latency as quotes are.
- At `at` the book uncrosses at one price:
  - the price that trades the most, then the least left over, then the nearest the crowd's belief;
  - every fill is at that price, in price-time priority.
- The fix (time, price, volume) goes in a bounded log on the venue (`MAX_FIXES`, named beside it), and continuous
  trading resumes.
- The call is worked out from the clock, so a save mid-call needs nothing new.
- No venue has `auctions` before this part, so nothing moves with the desk closed. The Lab's batch is untouched.
- Saturday, Sunday and a venue closed at `at`: no fix.

### 6d. Blocks, a rival, racks

- **`curve`**: a calendar spread. When two live expiries' spread differs from what the carry now implies by more
  than a threshold, buy the cheap one and sell the dear. Out at a stop, and before the near one's expiry.
- **`fixArb`**: in the call, when the indicative fix differs from the spot that Hudson's front future implies
  (unwound by the carry) by more than a threshold, rest into the fix on the cheap side and hedge in the future.
  Hedge only what the fix filled.
- **`crossPairs`**: the pairs block's ratio and band across two symbols of any desks, set to the miner against gold
  or gold against silver (the ratio). Reuse `src/sim/strategy/pairs.ts`'s working where it can be shared.
- Add `DESK_BLOCKS.metals` for these three blocks.
- **A rival**, name a draft: Aldgate Metals, on a rack at Thamesford running `fixArb`, joining when the desk opens.
- **Racks** at Thamesford and Hudson, with distances to every venue, and every location's distance to the three
  venues.

### 6e. The page

- Prices to the instrument's places (`decimalsOf`): ten-cent gold.
- A small curve on the Market page for a metal: spot and the three expiries' prices against their dates, with
  contango or backwardation named.
- The fix on the Market page: "In the fix: 8 s, indicative $2,412.30" during the call, and the day's fixes after.
- Storage and the lease in the day's report and the "By desk" table.
- `'desk:metals': 5` and its blocks at 5, after "the whole firm" lessons that teach pairs. `DESK_NAMES.metals`.
- Glossary: spot, futures curve, contango, backwardation, lease rate, storage, delivery (widened), fix, call
  auction, uncrossing price, gold-silver ratio, miner.

### 6f. Lessons, experiments, tuning

- `DESK_LESSONS.metals`, opening no stage:
  - "Read the curve";
  - "Watch it flip" (a supply headline turns it);
  - "Take delivery" (hold a contract into expiry, and see the metal and the storage);
  - "Trade the fix";
  - "The miner and the metal".
- **Experiment "the fix"**: the same buy of so many lots sent continuously in the minute before the 10:00 fix, and
  rested into the fix. Measured against the fix price and the mid. Seed found by reading `world:metals` for a morning
  with a move in the call.
- **Experiment "delivery"**: on expiry day, roll the week's contract the minute before against holding it through
  expiry. The window holds the expiry. The storage the delivered metal will cost each night is stated from the run's
  numbers if the window cannot reach 17:00.
- **PACE rows** `metals …`: each block from home and from the racks, and the rival beside them. P&L is the equity's
  move, as the currencies' rows.

## Edge cases

- **An order in the call:** a resting order joins, an IOC is refused, a cancel is honoured.
- **A call with nothing to cross:** no fix, said so in the log, and trading resumes.
- **A fix on a weekend or with the venue closed:** none.
- **The miner:** it moves with the Mining factor while the metals desk is shut. Gold, opened later, takes the factor's
  level at once and draws nothing for the link.
- **A short spot held overnight** pays the lease. A delivered short is a spot short.
- **Storage and the lease** are not charged at the weekend; Friday carries three nights.
- **The curve flipping mid-week:** the curve block's stop.
- **Three sessions:** the spot trades on whichever venue is open. Friday 17:00 to Sunday 18:00 nothing does.
- **Skipping to the open with the desk open** steps the night, as the other desks do.
- **A save from before the desk:** no leases, no storage, desk closed.
- **A save from before 6a:** it loads with its own stocks. A save holds its stocks' state, so check that a save
  without `RDG` loads as a good game and say what it does.

## Not in this part

Platinum and palladium; a lease market to trade; the miner's own news from the metals desk; a fix on Hudson or
Sundar; options on metals; a real delivery location (warehouses).

## Check

- **6a:** the stocks' figures before and after (fingerprints, PACE stocks rows, stage harness), the five
  experiments' new seeds and their tests green. Chris is told what moved.
- **6b to 6f, desk closed:** the post-6a fingerprints to the bit; the desks-open fingerprint moves only as metals
  joins it (recorded).
- **New tests:**
  - `test/metals.test.ts`: gold reads the factor and draws nothing from `world`; opening the desk leaves the stocks'
    fair values and headlines the same; the lease moves the carry and a supply headline flips the curve; storage and
    the lease are charged with the right sign, three nights on Friday and none at the weekend; delivery into spot
    then storage; a save with leases loads to the same future.
  - `test/fix.test.ts`: the call refuses an IOC and rests a limit; the uncrossing price trades the most; one price
    for every fill; no cross means no fix; the crowd rests in the call; no fix at the weekend; a save mid-call loads
    to the same future.
  - `test/metalblocks.test.ts` for the blocks.
- **The page** looked at headless at 1280 and 375: no overflow, no console errors.
- **The lessons** in `test/lessons.test.ts`, the experiments in `test/experiments.test.ts`.
- **Tuning**, over three seeds, figures in `docs/measured.md`:
  - the curve flips to backwardation at least once in a game week on most seeds;
  - a firm holding into delivery pays storage that a rolling firm does not;
  - `fixArb` earns from the Thamesford rack and not from home;
  - the fix gives a better average price than the continuous minute for a large order, on most seeds.
- **The gate** `steps fast enough with every built desk open` holds 40,000 with metals open (or the builder stops).
- `npm run check` green at the end of every part, and the state and results written into `plans/desk-metals.md` as
  each lands. Commit and push when the whole part is done (Chris, 2026-11-09).

## Chris's choices while building

- 2026-11-09, after 6a: the step-rate floors run alone, after the rest of the check (`npm run floors`,
  `test/speed.test.ts`); momentum's lower figures with the miner are accepted for now and looked at again in 6f;
  "the lead" keeps seed 338, found by its own method, though it now answers "microwave worse".
- 2026-11-09, after 6b: Hudson lists the futures only. Spot trades on Sundar by night and Thamesford by day, and the
  futures cover the rest. The tripwire with every desk open is set again after 6f, at what it reads less a margin,
  with the day's length at top speed recorded; until then it may read under 40,000.
- 2026-11-09, after 6f: the tripwire with every desk open is 35,000 (it reads 38,800 to 39,000 alone, a game day
  at top speed about 580 s). The fix not beating the continuous minute for a large gold buy is accepted and said so:
  gold's book is a tick wide and refills at once, and a large order lifts the fix it buys at; play testing may
  revisit it (lasting impact, or a book that thins before the fix). The fix experiment keeps seed 2013, where the
  fix beats the mid but loses in money as gold rises into 10:00. `fixArb`'s 4 bp default, Aldgate's 4 bp and the
  clients' flow (70% of calls, 10 to 200 lots, the last 150 ms) are kept. The lease is left unbounded. Momentum
  over nine seeds does not hold the drop seeds 1 to 3 showed, and is not re-tuned.

## Results

### Result for 6a, 2026-11-09

Built: `RDG`, Ridgeline Mining, $45, sector `mining` (its factor comes with the sector, as every stock sector's
does: `FACTORS` holds the rates, not a list), beta 0.7, not in the index, listed on the three stock exchanges, with
company and sector news as any stock. No stock has a glossary entry or blurb of its own, so the miner has none (the
glossary's miner is 6e). Nothing the firm does draws from `world`. Figures in `docs/measured.md`, "The miner (6a)".

- **Fingerprints** (`test/instruments.test.ts`), before → after: the busy colocated game `914a5ecf` → `d8661a66`
  (616 fills → 579, cash −5,744,615 → 4,000,789, equity 20,056,935 → 19,955,326.5); with the stocks only
  `c08c8813` → `a45526ec`; both desks open, seed 1 `87d3edc1` → `5a409e9e` (445 fills and 445 orders → 481 and
  498), seed 2 `ea81a08b` → `473e9068` (261 and 299 → 261 and 314). The triangle's orders are the same in both.
- **Seeds:** the headline and a few miles 854 → 70; the free option 879 → 537; the lead 566 → 338, its window from
  9:31:05 (was 9:31:06); last look 30, unchanged (`world:fx` is untouched). Every briefing's "forty seconds in" and
  "a minute and a half in" still holds. Changed answers: the headline's news reader is worse (was better); the
  lead's microwave is worse (was better), though it still cuts the races lost from 24 to 9.
- **Moved past the recorded figures, not re-tuned:** stages 3 and 4 open at 1.5 and 1.6 minutes (were 3.4 on this
  harness; 5.6 to 7.7 on 2026-11-05's three seeds); home momentum 339 → 85 and city momentum 599 → 62 a day; the
  colocated hand −8,865 → −28,363. The currencies' rows are the same to the dollar.
- **The step rate:** inside `npm run check` it now reads 74,000 to 83,000 ticks a second (was about 90,000), under
  the 75,000 floor in two of four runs; alone it is about 86,600 (was about 90,000). The check was green in the
  other two runs. Chris to decide.
- A save from before the miner loads as a good game: `RDG` from $45, the crowd quoting it at once.
- Seed-bound tests that moved with the world, re-pointed: `test/sessions.test.ts` seed 7 → 8 (headlines in five
  minutes), `test/experiment.test.ts` 7 → 1 (races in twelve seconds), `test/nights.test.ts` mid-day store after
  the day's last pin, `test/backtest.test.ts` the afternoon pin found by label, `test/regime.test.ts` the drift
  from the fair value at the open (as the game sets it), `test/ui.test.tsx` 14 rows.

### Result for 6b, 2026-11-09

Stopped at the gate: with metals open, `steps fast enough with every built desk open` reads 39,500 to 39,700 ticks
a second alone (`npm run floors`, three runs), under its 40,000. Everything else in 6b is built and its tests pass.
Chris to decide (a cut to the books' cost, fewer metals books, or the tripwire). Figures and the profile in
`docs/measured.md`, "The metals desk in the sim (6b)".

Built:

- `src/content/metals.ts`, wired in `src/content/index.ts`: Sundar (19:00 to 03:00, Sunday to Thursday nights, 300
  ms), Thamesford (03:00 to 12:00 weekdays, 60 ms), Hudson (18:00 to 17:00 Sunday to Friday, 50 ms); spot `XAU`
  (ten-cent points, ten-ounce lots, $2,400) and `XAG` ($30, 500 ounces) on all three; `GC` and `SI`, weekly, three
  live, expiring Friday 13:30, on Hudson alone, margined as `IXF`, delivered; racks at Thamesford and Hudson, and
  every location's distance to the three venues. **Hudson's spot keeps the futures' hours, not 08:20 to 17:00:** a
  venue has one session in the sim. Names and numbers are drafts.
  _Amended in 6c (Chris, after 6b):_ Hudson lists the futures only; the spot trades on Sundar and Thamesford (the
  spots' `venues`), so Hudson's spot and its hours are gone.
- **Gold reads the Mining factor** (`InstrumentSpec.reads`): each tick the metals desk is stepped, an instrument
  takes the stocks' sector factor's move since it last read, at its loading (gold 0.6, silver 1.2), into its fair
  value and anchor; opening the desk takes the whole level at once. Both metals share the desk's own factor
  (`precious`, silver at beta 2) and an own wander on `world:metals`.
- **A carry that moves:** `InstrumentSpec.lease` on a metal and `leaseOf` on its contract. `Market.leases` wander on
  the desk's stream; `carryOf` is the contract's `carry` (4.5% + 0.5%) less the lease, read by `carried`, the
  snapshot and the blocks' `ContractView`, whose contracts are rebuilt (new objects, once for every firm) when a
  lease has moved.
- **Storage and the lease:** `Game.storage` at 17:00 (`Content.storage`), `storageDays` one night Monday to
  Thursday, three on Friday, none at the weekend; `Firm.storage` charges a long storage and a short its lease, from
  cash; `DayReport.storage`, in that day's `pnl` and `equityAtClose`, as rollover. Draws nothing.
- **Delivery** through `Firm.expire`, in the underlying's own lots: a contract delivers its multiplier over the
  spot's (one future lot, one spot lot). The futures desk's test metal has no lot, so it is as it was.
- **Supply news:** `DeskNews` in `src/sim/news.ts` (`Content.deskNews`), on `world:metals`, a day ahead, timed in
  the metals venues' hours (none on Saturday), run only while the desk is open. A strike, a find, central-bank
  buying and a refinery fire, each moving a metal's fair value and its lease (a fire about +6% a year, past the 5%
  carry: the curve flips). Bounds: `MAX_DESK_NEWS_PER_DAY`, `DESK_FEED_LENGTH`. Not in the firms' feed or the page
  yet (6d, 6e).
- **Settlement** at Hudson's close, the first listing venue, by the existing pass.
- **The save**, version 3: `market.leases` and `market.reads` while a leased desk is open, `deskNews` once it ran;
  absent otherwise, so a save with the desk shut is as before.

Checks:

- **Fingerprints:** the held ones (`d8661a66`, `5a409e9e`, `473e9068`) are to the bit on the content without the
  metals desk, and every figure of both tests is the same with it. With the desk there and closed the save carries
  it (three venues' books and streams, the spots, six contracts), so the whole-content fingerprints moved as they
  did for the futures and the currencies: `ab8d1400`, `d7fa5a46`, `cecb8650`; with metals open `beafb15`,
  `5c3e6bd3`. The test now holds both. Chris to confirm this reading of "to the bit".
  _Amended in 6c:_ with Hudson's spot books gone the whole-content ones moved again, every other figure the same:
  `ab8d1400` → `702a3c4f`, `d7fa5a46` → `9326e341`, `cecb8650` → `4f30cd6d`, metals open `beafb15` → `adab4574`,
  `5c3e6bd3` → `1f0cdc79`. The held ones (`d8661a66`, `a45526ec`, `5a409e9e`, `473e9068`) did not move.
- `test/metals.test.ts`, 16 tests: the desk in the content and closed; nothing drawn or saved while shut; gold
  takes the factor at once and moves with it; with the desk open the stocks' fair values, factors, headlines and
  `world` state are the same as shut; the carry is the rate and storage less the lease; a squeeze flips the curve;
  supply news lands only in the metals hours and moves the lease; storage and the lease with their signs, three
  nights Friday, none at the weekend; into the day's report at 17:00; delivery long and short then storage or
  lease; delivery in the spot's lots; settlement at Hudson; a save with leases loads to the same future; a save
  from before the desk. Nine of them fail with the new sim parts taken out of a copy.
- `test/stages.test.ts` held the desks to `futures` and `fx`, each before the last stage: it now lists `metals` and
  leaves it out of that check until 6e places it (the plan's 5 is the last stage, so 6e must settle that test).
- PACE (five rows and their rivals, seed 1) and the stage harness (seed 1, a day) the same to the dollar and the
  line, before and after.

### Result for 6c, 2026-11-09

Built, with the amendment to 6b first (Hudson lists the futures only; see "Amended in 6c" in 6b's result). Figures in
`docs/measured.md`, "The fix (6c)".

- **`ExchangeSpec.auctions`** (`src/sim/types.ts`): `{ at, callMs }[]`, times of day on the sim's clock. Thamesford
  has two, 05:30 and 10:00, each with a call of `CALL_MS`, 30 s of game time (`src/content/metals.ts`): a real bullion
  auction's round, long enough for a firm a few hundred ms away to see the indicative move and answer it many times,
  and short beside the hours between the fixes. A draft for Chris. No other venue has one.
- **The call** (`Exchange.callAt` in `src/sim/exchange.ts`): from `at − callMs` up to `at`, Monday to Friday, while the
  venue is open both now and at `at`, from the clock alone (one cached answer for the last moment asked). In it, for
  every book of the venue: an order rests uncrossed (`OrderBook.place`); a firm's IOC is refused with `REFUSED_IN_FIX`,
  "in the fix: send a resting order"; a cancel is honoured as ever; the crowd keeps quoting about its belief without
  tucking inside the touch, its takers rest at their limit, and its sweep does not pull an order for being across the
  belief (the stale and old orders still go). The check comes before a dealer's look and the Lab's batch, and only on
  a venue with `auctions`; the Lab's `batchMs` path and `LabPanel` are untouched.
- **The indicative**: each tick of the call each book works out where it would uncross (`OrderBook.indicative`) and
  puts it in its quote log entry, `LoggedQuote.indicative` (`{ price, volume, fixAt }`, price null where nothing
  crosses). The least invasive way: a firm's `view.quotes[venue][symbol]` is that log entry as of its data latency,
  so `SeenQuote.indicative` reaches every firm through the latency its quotes have, with no new field on the view and
  nothing built for a venue without fixes, whose quote log takes its old path. The first entry after the call has none.
- **The uncrossing** (`OrderBook.uncross`, at the first tick at or past `at`, before the crowd's turn): of the limits
  in the overlap and the two grid prices either side of the crowd's belief, the price that trades the most, then the
  least left over, then the nearest the belief, then the lower. (Volume and what is left over change only at a limit,
  so the belief's grid prices are the only others that can win.) An iceberg counts its whole remainder. Every fill is
  at that price, bids and asks each in price then time priority; what is left does not cross.
- **Told as fills, the races and the tape**: each trade goes to `tickTrades` and so to its owners as any fill does,
  through their latency. A fix's trades say `fix: true`. No fill at a fix is a taker's (`Firm.onTrade`), so none pays the
  taker fee; a tax would still be paid by both. The tape gets one print for the fix, its whole volume at its price,
  `fix: true` on the `SeenPrint`, owner-less, its aggressor the side left wanting; `takersSince` leaves fix prints out,
  so a fix is never a race lost or won.
- **The fix log**: `Exchange.fixes`, at most `MAX_FIXES` (40, two weeks of Thamesford's), each `{ at, symbol, price,
volume }`, price null and volume 0 for "no fix". Saved on the venue only when it has one (`SavedExchange.fixes`), so
  a venue that never fixed saves as before. `Fix`, `MAX_FIXES`, `REFUSED_IN_FIX`, `Indicative` and `SeenQuote` are
  exported from `src/sim/index.ts`.
- **A save mid-call** needs nothing: the call is `callAt(now)`, and the book holds what rests. Proved by a save 11 s into
  the 10:00 call with the player's order resting, loaded and run past the fix to the same fingerprint, fixes and cash.
- **Coarse steps**: a tick that steps over a whole call (the skip over closed hours steps a minute at a time) still
  reaches the fix, which uncrosses whatever rests; with the crowd uncrossed, that is "no fix".

Checks:

- `test/fix.test.ts`, 19 tests, all failing on the tree before 6c (no `place`, `callAt`, `fixes`): the uncrossing on
  books worked by hand (the most volume, then the least left over, then the belief, then the lower; the grid; price
  then time priority; an iceberg's whole remainder; no cross, nothing done); the call refuses an IOC with the reason,
  rests a crossing limit and honours a cancel, runs for the 30 s before the fix and not at it, rests the crowd's taker;
  none at the weekend or with the venue shut at the fix; the fix at one price, told to the owners, one print, no race,
  logged; "no fix" logged; the log's bound; the indicative in the quote log each tick and gone after; at Thamesford,
  10:00 and 05:30 for both metals, the crowd resting (nothing trading, the book crossed) and the fix at one price; the
  player's IOC refused and its resting order filled at the fix price with no taker fee; the indicative seen through
  the firm's data latency; a save mid-call; nothing with the desk closed.
- **With metals closed, nothing moves:** the held fingerprints (`d8661a66`, `a45526ec`, `5a409e9e`, `473e9068`) and
  the whole-content closed ones (`702a3c4f`, `9326e341`, `4f30cd6d`) the same before and after 6c; the metals-open
  ones (`adab4574`, `1f0cdc79`) did not move either, since that test's ten minutes from the open reach no fix.
  PACE (`PACE=1 PACE_SEEDS=1 PACE_ONLY="home arb,home momentum,colo mm,prairie leadLag mw,fx home triangle book"`,
  15 rows with the rivals, the stocks', futures' and currencies') and the stage harness (`STAGE_PACE=1 STAGE_SEEDS=1
STAGE_DAYS=1`) every line the same before (a copy of the tree before the amendment and 6c) and after.
- **The step rate**, `npm run floors` alone, three runs each of the tree with the amendment alone and with 6c:
  the amendment alone 85,600 to 87,100 with every desk shut and 40,000 to 40,600 with every desk open (six runs:
  40,385, 40,383, 40,044, 40,640, 40,160, 39,977); with 6c 86,000 to 87,100 and 40,000 to 40,100 (40,013, 40,032,
  40,064). Over the 40,000 tripwire in all but one run of the amendment alone, but by a hair; 6b read 39,500 to 39,700.
  Chris re-sets the tripwire after 6f.
- `npm run check`: formatting, types, lint and 583 unit tests green; the floors straight after read 85,386 shut and
  39,766 with every desk open, under the 40,000 tripwire (allowed until 6f).
- Not done here: the page (6e shows the fix), the blocks (`fixArb`, 6d) and the experiment (6f). The plan's 6f
  experiment sends "continuously in the minute before the 10:00 fix": with a 30 s call, the last half of that minute
  is the call, where an IOC is refused; 6f must place its continuous minute before the call, or Chris shortens it.

### Result for 6d, 2026-11-09

Built, not committed. Figures in `docs/measured.md`, "The metals blocks and the rival (6d)".

- **`curve`** (`src/sim/strategy/curve.ts`), a calendar spread a series at a time. Flat, it takes the two nearest
  expiries more than `exitBefore` (24 h) from expiry; at the touch, when the far one's price over the near's is
  dearer or cheaper than `ContractView.carry` now implies by `threshold` (3 bps), it sells the dear and buys the
  cheap, `contracts` a leg, IOC. Held, it is out of both once the gap is within a quarter of the threshold, at a stop
  `stop` (10 bps) past the threshold the wrong way, and once the near one is within `exitBefore` of expiry. Anything
  but two equal and opposite legs (a far leg that missed) is flattened at once. A block holds no state, so the stop is
  measured from the threshold, not from the gap it entered at.
- **`fixArb`** (`src/sim/strategy/fixArb.ts`). In Thamesford's call (`SeenQuote.indicative` on the firm's own
  latency) it compares the indicative with the spot Hudson's front future implies (mid over `carryFactor`, the front
  being the first more than an hour from expiry). When the indicative is cheaper by `threshold` (1 bp) and the fees,
  it rests a buy at the price that still keeps that edge (`floor(implied × (1 − threshold) − fees)`), a sell the other
  way, `lots` (2) of each metal: never an IOC there. It sends nothing where the fix would not cross (price null) or
  where its order could not arrive before the fix, and pulls a resting order once the future has moved its edge away,
  and whatever is left of it once the fix is done. The hedge is the front future, the other way, always as much as
  the block holds of the metal, so it hedges what the fix filled and no more, and buys back a hedge left alone.
  **Flattening, chosen:** both legs come out together, the metal by IOC on its book and the future bought back, once
  the metal's mid is back within a quarter of the threshold of the future-implied spot, or `unwindAfter` (120 s)
  after its fill at the latest; never by an IOC into a call. The edge is the fix's price against fair, so the
  continuous book soon after is where it is taken.
- **`crossPairs`** (`src/sim/strategy/crossPairs.ts`): `legs`, a choice, the miner `RDG` against gold (default) or
  gold against silver; the pairs block's ratio and band; gold sized in `lots`, the other leg the same value at the
  mids; it trades only while both legs are quoted, and scratches a leg left alone. **Shared with `pairs`**
  (`src/sim/strategy/pairs.ts`): `ratioAway`, `namedIn`, `pairWant`, `pairOrders`, `lastPairFill`, the pairs block's
  own working moved out to functions, the same arithmetic in the same order. A game of pairs alone (seed 4, rack,
  ten minutes) is `caf87952`, 55 fills, 51 orders on the tree before and after (held in `test/metalblocks.test.ts`),
  the PACE row `colo pairs` −56 a day both, and `test/strategy.test.ts` green.
- **The view** carries `scales` (each live instrument's `scaleOf`, from the market's shared parts, one object for
  every firm), so a block can match two legs in value and the hedge be sized in contracts.
- `DESK_BLOCKS.metals = ['curve', 'fixArb', 'crossPairs']`. A metals block sees the stocks and the metals
  (`symbolsFor`): the miner and the metals for `crossPairs`, the stocks alone for momentum (tested).
- **Racks:** `colo-thamesford` and `colo-hudson` were already in the locations from 6b, as `COLO_EASTHOLM` is
  (appended in `src/content/index.ts`, `desk: 'metals'`, $80,000 each, as `COLO_EASTHOLM`). Checked: every location
  has a distance over nought to every venue of the content, each rack under 1 ms to its own venue.
- **Aldgate Metals** (`aldgate`, a draft name, `src/content/upgrades.ts`): the Thamesford rack, fibre, a rack
  computer, `desk: 'metals'`, `watches: ['metals']`, `fixArb` at 1 bp and 4 lots. It joins when the metals desk
  opens and not with the others (tested), sees the metals alone, and survives a save. Over seeds 1 to 6, three fixes
  each (Monday 10:00, Tuesday 05:30 and 10:00), it rested 7 to 42 orders and filled once (seed 3, silver at a
  Tuesday fix, hedged and unwound): the sim's indicative stays within 1 to 3 points of the future-implied spot, so
  the fix rarely gives a block an edge. That is 6f's tuning.
- **The mark** (`Market.markOf(symbol, now)`, `Market.midNow`): the mid of the first live listing venue open at
  `now`, else the first live venue's as before, else the fair value. Spot metal at 09:00 now reads Thamesford's book
  (it read the fair value while Sundar was shut). The storage pass and the rollover pass the game's now; the
  snapshot's position marks read the same. The equity's own mark (`Firm.mark`, the first venue with a two-sided quote
  the firm has seen) already fell through to Thamesford and is untouched.

Checks:

- **With metals closed, nothing moved:** the held fingerprints (`d8661a66`, `a45526ec`, `5a409e9e`, `473e9068`) and the
  whole-content closed ones (`702a3c4f`, `9326e341`, `4f30cd6d`); PACE (`PACE=1 PACE_SEEDS=1 PACE_ONLY="home arb,home
momentum,colo mm,prairie leadLag mw,fx home triangle book"`, 15 rows, and `PACE_ONLY="colo pairs"`) every row the
  same to the dollar; the stage harness (`STAGE_PACE=1 STAGE_SEEDS=1 STAGE_DAYS=1`) every line the same. Before was a
  copy of the tree before 6d.
- **Metals open moved, every other figure the same:** seed 1 `adab4574` → `b0c0774`, seed 2 `1f0cdc79` → `b4c4cf9f`
  (481 and 261 fills, 498 and 314 orders, the same). The firm's three new blocks (off) and the rival are both in the
  save; without the rival it is `a650dd47` and `1ffa9dfe`. The mark is not in the save.
- `test/metalblocks.test.ts`, 42 tests, which would not load on the tree before 6d ("No strategy block curve"); the
  mark's test fails with the old mark. `test/ui.test.tsx`'s two "everything shown" counts 15 → 18 blocks.
- **The cost,** `npm run floors` alone, three runs each: before 89,955, 90,266, 91,449 shut and 42,027, 41,993, 41,702
  every desk open; after 84,685, 85,907, 84,346 and 38,489, 38,589, 38,519. Run interleaved with the before copy
  (three rounds), shut is the same (about 85,000 to 86,600 both: the first before runs were the machine) and every desk
  open 39,800 → 38,700, −2.8%. A first cut read 37,800 (−5.4%); a profile of the rival (two minutes from the open,
  every desk open) put it at 91 ms of 1,606, `fixArb`'s decide 54 ms and its view 26 ms, and an early return when the
  block is flat, has nothing resting and Thamesford is in no call (the loop would send nothing) took it to −2.8%.
  The tripwire reads under 40,000, allowed until 6f.
- `npm run check`: formatting, types, lint and 625 unit tests green; the floors after read 85,212 shut and 38,510 every
  desk open, under the 40,000 tripwire (allowed until 6f).
- Not done here: the page (6e: the blocks have no stage, glossary entries or links yet, and show under "Show
  everything"); tuning (6f: the plan's "`fixArb` earns from the Thamesford rack and not from home" is not met yet).
  `crossPairs` reads the firm's sampled mids, which stop while a leg is unquoted, so for its first lookback after the
  miner's open the two windows are not the same moments.

### Result for 6e, 2026-11-09

Built, not committed. The page reads the metals desk; the sim is untouched but for what the snapshot carries.

- **The stage: `'desk:metals': 5`, with `curve`, `fixArb` and `crossPairs`, and the rule relaxed.** The rule "every
  desk before the last stage" came in with 5c (`eece714`), in place of 5a's guard in `shows()`; its comment says what
  it protects: a desk missing from the table falls to `LAST_STAGE` through `featureStage`'s default, and would open in
  free play before its page was built, as metals did through 6b to 6d. Being before the last stage was the way 5c
  proved a desk was named, not the point. The test now asks that every desk is named in the table (`placed`, new in
  `src/content/stages.ts`), and that metals opens once every stocks lesson is done and not before. At 5 the plan's
  order holds: the desk opens with "The whole firm", where pairs opens, so "the miner and the metal" (6f) comes after
  the lesson that teaches pairs. A desk at 5 opens in free play as one at 4 does. `stageOf` is untouched (its history,
  `640bb78` and `6edea3a`, never named the desks). The stage harness stops when stage 5 opens, so a desk at 5 cannot
  move it. `DESK_NAMES.metals` is "Metals".
- **Prices to the places.** `price()` writes never fewer than two places, so gold's ten-cent points read as dollars
  and cents: 24001 at one place is "2400.10" (was "2400.1"). It stays ungrouped, as the tables' columns are narrow;
  `dollarPrice` writes one as money, "$2,400.10", in the curve and the fix line. The limit box steps 0.1 for gold
  (`priceStep(1)`, unchanged) and reads "2400.10" as 24001. A spread on the quotes is in cents at the instrument's
  point (gold's 1 point is 10¢), and the chart's axis takes the room its widest price needs.
- **The curve** (`src/ui/metals.ts` `curveOf`, pure; `CurveView` in `src/ui/MetalsDesk.tsx`): for a metal and for each
  of its futures, spot and the three live expiries at the middle of the touch the firm sees (the fair value, marked
  "fair", where no venue is open), each with its date and its gap to spot, drawn as a line in the text colour; the
  shape in words, "Contango: the later the date, the dearer.", "Backwardation: … The metal now is short.", mixed or
  flat; and the carry now, "the dollar's rate and storage, 5.0%, less the lease, 0.3%". Four fixed rows, a fixed chart
  and room for two lines of words.
- **The fix line** (`fixStateOf`, `FixLine`), on a symbol listed on a venue with fixes: in the call, "In the fix: 20
  s, indicative $2,382.00, 3,900 lots would cross · on THAMESFORD, as you see it 72 ms late", the indicative being the
  one in the firm's seen quote (`SeenQuote.indicative` through its data latency), "not seen yet" before one has
  reached it and "not crossed yet" where it has no price; after, "Fixes today: 05:30 $…, N lots; 10:00 no fix · next
  at 10:00" from the venue's log. Its room is kept, in the call or not.
- **The snapshot** (`src/sim/game.ts`): a metal's `metal` (ounces a lot, its lease now); a contract's `delivery`; the
  seen quote's `indicative` typed (it was there already); a venue with fixes carries `auctions`, `call` and `fixes`;
  and `deskNews`, each open desk's own headlines newest first, labelled with the desk. Nothing saved changes.
- **Supply headlines** on the News tab among the stocks', each "· Metals desk", a move in gold's points written as
  money ("XAU +$1.20"). **Not in the firms' feed, chosen:** `newsReaction` is a stocks block, and since 5d a stocks
  block sees the stocks alone; fed a headline on `XAU` it would either trade what it cannot see or need a desk rule
  of its own. The metals blocks already meet the headline where it lands, in the lease and so the carry and the curve
  (`curve` reads `ContractView.carry`). The day's report lists the stocks' headlines only, as before.
- **The day's report:** "Storage and the lease at 17:00, after the close: −$0.66 on the metal held then …" where
  `DayReport.storage` is set. "By desk" (`.by-desk`) gains a 17:00 column, the currencies' rollover and the metals'
  storage and lease, counted in its Net, and a desk that only held overnight still has its row.
- **Holdings:** a metal held in the firm panel says its ounces and its night, "XAU 20 oz · storage nightly", or
  "XAG 500 oz short · pays the lease"; delivered metal is spot and reads the same.
- **Glossary**, twelve entries, drafts for Chris: spot, futures curve, contango, backwardation, lease rate, storage,
  delivery, the fix, call auction, uncrossing price, gold-silver ratio, miner; carry widened to the metals. Linked
  where used: the curve (futures curve, spot, contango or backwardation, storage, lease), the contract line
  ("delivered as XAU if held at expiry"), the fix line (call auction, uncrossing price, fix), the report (storage,
  lease), the positions, a metal's head (spot, lot, gold-silver ratio), the miner's head. `TERM_FOR`: `curve` →
  futures curve, `fixArb` → the fix, `crossPairs` → miner.
- **Room at a desk's width:** gold's prices are wider than a stock's, so the watchlist's sector is written as small as
  the name and its cells a little tighter, and a quotes table of four-figure prices (`wide-prices`) tighter still,
  its "now" and size columns small. The watchlist and the quotes fit their panel at 1280 as before.

Checks:

- **UI tests** in `test/ui.test.tsx`, eleven, all failing before the build: the places, the box's step; the curve's
  four rows and contango in words for a metal and its future, backwardation for a curve made to fall; the fix line in
  the call (seconds and the firm's indicative) and after (the day's fix from the log, and "no fix"); supply headlines
  in the snapshot and the News tab, labelled; storage in the report and the Metals row of By desk; ounces, storage and
  the lease in the positions; the desk named, its blocks shown and linked; the miner and the ratio linked; the twelve
  glossary entries. `test/stages.test.ts`: the metals features at 5, every desk named, metals after every stocks
  lesson.
- **With metals closed, nothing moved.** The fingerprints in `test/instruments.test.ts` are unchanged: the held
  `d8661a66`, `a45526ec`, `5a409e9e` and `473e9068`, the whole-content closed `702a3c4f`, `9326e341` and `4f30cd6d`, and
  metals open `b0c0774` and `b4c4cf9f`. 7 of 7 passed, both before and after. PACE
  (`PACE=1 PACE_SEEDS=1 PACE_ONLY="home arb,home momentum,colo mm,prairie leadLag mw,fx home triangle book"`, 15
  rows) and the stage harness (`STAGE_PACE=1 STAGE_SEEDS=1 STAGE_DAYS=1`) were run on a copy of the tree from before
  6e and on the tree after it. Every line was the same, apart from the timings. Stage 5 does not open in the
  harness's day, and the harness stops when it does, so neither metals' blocks nor its lessons reach the stocks' path.
- **`npm run check`:** formatting, types, lint and all 641 unit tests green. The floors straight after read 85,669
  ticks a second with every desk shut and 38,639 with every desk open. That is under the 40,000 tripwire, which is
  allowed until 6f (6d read 38,510). The snapshot's new fields are outside the stepping, and the floor steps the
  game, not the page.
- **Looked at headless** with Playwright at 1280 and 375, in free play with every desk open. The page was seen at
  09:59:40 inside Thamesford's call, at 10:00:05 after the fix, after a hand buy of 2 lots of gold, and at 17:00:05.
  The Market page was seen for XAU and the near GC, plus the Overview, the day's report and News. There was no
  horizontal overflow on the page and no console errors. The watchlist and quotes fit their panel at 1280. At 375 the
  report's tables scroll inside the panel, as By block already did. In one free-play game gold's lease had wandered
  to −0.3%, and the curve's line said so ("less the lease, -0.3%"). The 6b sim lets a lease go below nothing.
- **Not done here:** the lessons, the experiments and the tuning (6f). The gap line and the gap list still say "¢ a
  share", which is wrong for a contract or a lot. A gap on the metals needs two spot venues open at once, and Sundar
  and Thamesford do not overlap, so it does not arise. Supply headlines are not in the day's report.

### Result for 6f, 2026-11-09

Built, not committed. Figures in `docs/measured.md`, "The metals desk's lessons, experiments and tuning (6f)".

- **`DESK_LESSONS.metals`** (`src/content/stages.ts`), opening no stage, at stage 5 with the desk, in their own "The
  metals desk" section: "Read the curve" (a metal and one of its futures watched), "Watch it flip" (a watched curve with
  its carry below nothing, after a supply headline), "Take delivery" (metal delivered, still held, and a night's storage
  or lease in a report), "Trade the fix" (a fill on the fix venue at a fix's price, told within 2 s of it), "The miner
  and the metal" (`crossPairs` filled in a stock and a metal). Each task names what to put on the watchlist, as the
  currencies' do. For the delivery check the snapshot's positions carry `delivered`, what of a holding a contract
  delivered, as far as it is still held (from `DELIVERY_BLOCK`). One glossary entry more, "Orders at the fix"
  (`fix-flow`).
- **Experiment "the fix"**, seed 2013 (method in its comment): 25 lots of gold from home, in twelve IOC slices over the
  minute before the call (09:58:30 to 09:59:30); changes: rested into the fix, all at once, the slices from the
  Thamesford rack. A central-bank headline lands at 09:59:30.6. Measured in a run's new **ledger**
  (`Measures.ledger`, kept by a `Run` given `{ ledger: true }`, an experiment's `ledger`): each symbol's units and
  value bought and sold, the mid where each fill was told, the window's fixes, what is held at the end at the mark,
  and cash. The answers: fix worse (10¢ under the mid against the slices' 6¢ over, but $2.67 dearer: gold rose into
  10:00), all at once worse, the rack the same.
- **Experiment "delivery"**, seed 1, Friday 13:27:30 for four minutes, from a Hudson rack: 60 lots of the week's gold
  future held through 13:30; changes: rolled a minute before, closed a minute before, held from home. The window cannot
  reach 17:00, so the result states the storage from the run's own holding at the end: 60 lots, $1,447,588 of gold,
  $20 a night and $59 that Friday, with the firm's cash at −$1,247,253. Answers: rolled worse, closed worse, from home
  the same. At 20 lots all three were "about the same".
- **A later window**: `startOf` takes `warmMs` (`Experiment.warmMs`): the firm idle, the days before stepped a
  minute at a time to `warmMs` before the start, tick by tick from there. The five experiments before pass none and
  start as before. The scripts are the script block's, naming gold and its futures; a script's `symbols` are the
  stocks' (5d), but what it sends is not held to them, so no desk was needed for it (tested).
- **PACE**: nine `metals …` rows (each block from home on a laptop, the Thamesford rack and the Hudson rack, fibre),
  P&L the equity's move, Aldgate beside each `fixArb` row, `PACE_METALS` as `PACE_FX`. A metals row watches gold, the
  miner and gold's two nearest futures first.
- **The tuning harness** `test/metalpace.test.ts` (`METAL_PACE=1`): the four checks.

What was added to give the fix an edge (`src/sim/exchange.ts`, `src/content/metals.ts`):

- **Clients' orders at the fix**, `FixFlow` on an auction (`auctions[].flow`; only Thamesford's two have it): on a
  book's first crowd turn in a call, from the venue's own crowd stream, one draw of whether clients come (70%), their
  side (even), their size (10 to 200 of the crowd's lot, the share of the range a uniform draw squared) and when (in
  the last 150 ms); at that moment one resting order, six grid steps through the belief. Kept on the book as `flow`,
  saved only while a call has one, cleared at the fix. A venue without `flow` draws nothing.
- **`fixArb`** pulls a resting order once the indicative has left its side (a sell rested while the fix was rich kept
  the buy out when clients' selling made it cheap), and its default and Aldgate's threshold is 4 bp (was 1): at 1 bp
  silver's one-cent grid (3.3 bp) made every tick of noise an edge, and home earned by resting on it.

**The crowd's sizes:** a stock's crowd posts 100 to 500 units; for gold that was $2.4M to $12M an order and "3,900
lots would cross". `InstrumentSpec.crowdLot` (absent, 100, so stocks, futures and currencies are as they were): the
spot metals and their futures say 1, so the crowd posts 1 to 5 lots and takes 1 to 10, beside the firms' 1 to 10. A
call now crosses 15 to 30 lots without clients.

**The lease below nothing: left unbounded.** Real gold lease rates have been negative; here it happens after a
deposit find (−1% at most on the lease) and decays back. Below nothing it only steepens the contango, and a short is
paid its (negative) lease, which `Firm.storage` already does by sign. A bound would be a kink in the curve the player
reads for no lesson.

Tuning, seeds 1 to 3 (`METAL_PACE=1 METAL_SEEDS=1,2,3 npx vitest run test/metalpace.test.ts`):

- the curve flips in a game week: gold 4, 1 and 2 times, silver 6, 0, 0. **Met.**
- held into delivery pays storage ($60.19, $60.12, $61.59 on Friday for 60 lots), rolled none. **Met.**
- `fixArb` over nine fixes: home $0 (no fills) on all three; the Thamesford rack $150, $60, $140; the Hudson rack $75,
  $10, $100. **Met.**
- the fix against the minute for 25 lots: **not met.** Against the mid where told the fix is 35¢, 5¢, 35¢ an ounce and
  the slices 9¢, 5¢, 9¢; in average price the fix is better on seed 1 alone. Why, and what would change it, in
  `docs/measured.md`. For Chris.

Checks:

- **With metals closed, nothing moved:** the held fingerprints (`d8661a66`, `a45526ec`, `5a409e9e`, `473e9068`) and the
  whole-content closed ones (`702a3c4f`, `9326e341`, `4f30cd6d`). PACE (`PACE=1 PACE_SEEDS=1 PACE_ONLY="home arb,home
momentum,colo mm,prairie leadLag mw,fx home triangle book"`, 15 rows) and the stage harness (`STAGE_PACE=1
STAGE_SEEDS=1 STAGE_DAYS=1`) every line the same, before (a copy of the tree before 6f) and after, but for the five metals lessons listed "not by day 1" for each player (the harness lists every lesson; stage 5 never opens in its day).
- **Metals open moved, every other figure the same:** seed 1 `b0c0774` → `23255924`, seed 2 `b4c4cf9f` → `f3320a6b`
  (the crowd's lot and Aldgate's threshold).
- Tests, each failing first: `test/lessons.test.ts` (the five, their checks, Trade the fix and Take delivery in a
  game), `test/experiments.test.ts` (the seven; the fix's move and fix in the window and its buy whole in the ledger,
  at the fix's one price when rested; delivery's expiry in the window and the gold held, none when rolled; every change
  measurable, the answers not all alike), `test/ui.test.tsx` (seven experiments). And `test/fix.test.ts` (the clients'
  flow: one order a call, in the last 150 ms, through the belief; the fix leans their way; nothing drawn without flow;
  saved mid-call; the crowd's lot), `test/metalblocks.test.ts` (a script naming gold trades it; Aldgate at 4 bp rests
  into a fix clients pushed off fair, on seed 2).
- **Momentum, nine seeds** (Chris asked): the drop on seeds 1 to 3 does not hold; mean home 2,059 → 1,946 and city
  3,020 → 2,733 $/day, medians 276 → 263 and 285 → 340. Not re-tuned.
- **The step rate**, `npm run floors` alone, three runs each, in turn with the copy before 6f: after 83,940, 84,750,
  84,486 shut and 38,837, 38,823, 39,014 every desk open; before 84,361, 83,306, 84,977 and 38,290, 38,022, 38,563.
- `npm run check`: formatting, types, lint and 657 unit tests green; the floors straight after read 80,764 shut and
  37,042 every desk open, under the 40,000 tripwire, which Chris re-sets now.
- Not done here: the experiments' pages were not looked at headless; the delivery experiment's start steps four days
  on the page's main thread in one go (about 2.3 s here).
