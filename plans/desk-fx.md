# The currencies desk: part 5 of the trading roadmap

State: specified 2026-11-09 on Opus, in plan mode, and agreed; built 2026-11-09, 5a to 5d, by the `builder` agent
on Opus at Chris's word, a part at a time (results below). Its checks are met but two: the floor with the desk open
is part 5½'s, and the night harness was not run with the desk open. The pairs' jumps (5d) were not in the plan:
the builder added them to meet the tuning check, and they wait on Chris. See `plans/trading.md`, part 5, and the foundation in
`plans/instruments.md` and `plans/sessions.md`. Chris chose (2026-11-09): balances by currency, a last look that
refuses when the dealer's price has moved against it, and the desk at stage 4.

## Context

The futures desk taught the lead. The currencies desk teaches arbitrage at its purest, with three legs, in a market
that does not close: three real currencies (the dollar, the euro, the yen; the rates are the sim's own), so
EUR/USD, USD/JPY and their cross EUR/JPY, on two fictional venues: a book like the stock exchanges, and a dealer
who may refuse your fill a few milliseconds after it sees it. Its lessons: a pip and why prices have four places;
the triangle; three legs, so two filled and one missed; last look as the maker's free option seen from the other
side; a market open all week; rollover and carry; and that the firm counts in dollars while it holds yen.

The roadmap says part 5 needs parts 1 and 2 only: no margin, no expiry. The leverage cap holds, counted in dollars.

## The numbers (drafts, for the builder to measure and Chris to tune)

- **Prices in pips.** EUR/USD near 1.0850, a price point a pip (0.0001 dollars): 10850. USD/JPY near 150.00, a
  point a pip (0.01 yen): 15000. EUR/JPY near 162.75 (16275), derived (below). One unit is a lot of 1,000 of the
  base currency (`multiplier` 1000). So a point of one lot is 10 cents for EUR/USD and 10 yen for the two yen pairs:
  `scaleOf` gives it already, read as minor units of the quote currency.
- **Moves.** About 0.5% a day for each pair, so about 11 pips an hour for EUR/USD; a dollar factor shared by both
  (EUR/USD falls when USD/JPY rises), drawn from `world:fx`.
- **Rates for rollover:** dollar 4.5%, euro 3.0%, yen 0.5% a year, on 360 days, three days' worth on Wednesday
  night, less 0.5% a year the venue keeps either way.
- **Fees** stay in dollar cents a lot (a quarter of a cent a lot on the book, nothing on the dealer, whose price
  is its fee): fees are the firm's, in dollars, as now.
- **Hours:** Sunday 17:00 to Friday 17:00, both venues, without a break; rollover at 17:00 each weekday.
- **Venues:** the book (crowd lag 80 ms, the cross's book four times slower, as an index's is) and the dealer (lag
  40 ms, a last look of 5 ms, refusing when its price has moved more than half a pip past the fill). Both in a
  fictional financial centre east of the stocks, about 35 ms of fibre from home; a rack there offered once the desk
  is open. Names are drafts for Chris.

## Parts

- **5a. Money in currencies (the sim, desk closed).**
  - `InstrumentSpec` gains `currency` (the quote's; absent, the dollar) and, for `kind: 'fx'`, `base`. Content
    gains its currencies: id, minor units (cents, euro cents, the yen itself), the pair that prices it in dollars,
    its rate.
  - The firm keeps `cash` (dollar cents) and `balances`, an integer per other currency in its minor units. An fx
    fill moves the base balance by `qty × multiplier × minor` and the quote's by `valueOf(scale, qty, price)`, both
    integers, no average cost involved; the fee from `cash`. A position's `qty` (lots) is still kept, for the
    blocks, flattening and the page. Equity is `cash` plus each balance in dollars plus the stocks as now; an fx
    position is counted through its balances only, never also by its mark.
  - **One conversion, in `src/sim/instrument.ts`:** `toHome(currency, amount, rates)`, dollar cents from a balance
    at the mid of its pricing pair (multiply for the euro, divide for the yen), rounded there and nowhere else. The
    market hands the rates to every firm each tick, as it hands the scales; while the venues are shut the rate is
    the last mid. A fill's `realised` in yen is turned to dollars at that moment, for the reports only; cash and
    balances stay exact.
  - Exposure for the leverage cap: the gross of the balances in dollars, plus the stocks as now. The daily loss
    limit reads equity, so it sees a yen balance lose value: that is the lesson, not a bug.
  - **Rollover**, at 17:00 each weekday, on each fx position: its notional times the base's rate less the quote's,
    less the venue's half a percent, over 360, into the quote's balance, rounded; three days on Wednesday. Draws
    nothing. Dollar cash earns nothing, so the stocks' game is unchanged.
  - **The cross** is derived like the future: `cross: [legA, legB]` on its spec, fair the product of the legs'
    fairs scaled to its points, worked out each tick, drawing nothing; `isDerived` and `settleDerived` learn it.
    The two pairs drift through `driftDesk` on `world:fx`, which learns a signed loading (`beta`) on the desk's
    factor.
  - **Last look** on an `ExchangeSpec` (`lastLook: { holdMs, refuseTicks }`): a taker order that would fill against
    the dealer is held `holdMs`, on the batch path's queue (`submit`, `runBatch` in `src/sim/exchange.ts`), then
    filled at the held price if the dealer's belief has not moved past it by `refuseTicks`, else refused: the order
    comes back `refused`, its race says "refused by the dealer after 5 ms", and no fill is told. Only the player's and
    the rivals' orders are looked at; the crowd's are not.
  - The save: `SavedFirm.balances`, optional (absent, none), so every save from before loads as it is; version
    stays 3.
- **5b. Blocks, a rival, a rack.** `triangle` (when one pair's price and the product of the other two disagree by
  more than a threshold in pips after fees, three IOC legs on one venue, chosen by a parameter; a missed leg is
  scratched, as arbitrage does now); `carry` (hold a set number of lots of the pair whose rollover pays most,
  through 17:00, out at a stop). `DESK_BLOCKS.fx`. A rival running the triangle from a rack at the centre, joining
  when the desk opens. The rack, with distances to every venue; every location's distance to the centre.
- **5c. The page.** Prices shown to the instrument's places (`price()` in `src/ui/format.ts` takes the decimals,
  worked out from the instrument; the Market page's rows and day change; the hand order's limit box in
  `src/ui/DeskPanel.tsx`, which multiplies by a hundred now). The firm's balances by currency with each in dollars;
  rollover in the day's report; the "By desk" table gains the currencies. `'desk:fx': 4` and its blocks at 4.
  Glossary: currency pair, base and quote, pip, lot, cross rate, triangular arbitrage, dealer, last look, rollover,
  home currency (carry exists; its words widen).
- **5d. Lessons, experiment, tuning.** `DESK_LESSONS.fx`: "Count in pips", "Close a triangle", "Be refused",
  "Earn the rollover", opening no stage. The experiment "last look": one window, the same triangle on the book and
  on the dealer, the seed found by reading `world:fx` for a fast dollar move in the first quarter hour. The PACE
  harness gets the desk's setups.

## Edge cases

The weekend: both venues shut, positions and balances held, equity marked at Friday's last mids, rollover not run
on Saturday or Sunday (Wednesday carries it). A fill refused after it matched. Three legs, two filled. A yen balance
whose dollar value moves while nothing trades. A desk not open: nothing of it steps, no balances. A save from before
the desk: no balances, desk closed. Skipping to the open while the desk is open: it steps the night, as the futures
desk does now.

## Not in this part

A headline that moves the dollar (the stocks' inflation print would; the news is the stocks' alone); margin on
currencies; a dealer who quotes each firm differently; more than one home currency; tenths of a pip.

## Check

- **5a, desk closed:** the held game of `test/instruments.test.ts` to the bit; PACE and the night harness's day
  equal to the figures before. New `test/fx.test.ts`: a fill moves two balances by exact integers; equity converts
  through `toHome` alone; the cross's fair is the product of its legs each tick and draws nothing; the two pairs
  draw only from `world:fx` and opening the desk leaves the stocks' fair values and headlines the same; rollover
  credits the right sign and three days on Wednesday, nothing at the weekend; last look refuses a fill whose price
  the dealer has moved away from in the hold, and fills one it has not; a save with balances loads to the same
  future.
- **The cost:** the step-rate test's figure with the desk open beside closed (six books more, open all week), and
  how long a skip to the open takes with it open, in `docs/measured.md`. If the floor breaks with the desk open, the
  builder stops and says so.
- **5b to 5d:** tests for the blocks in `test/fxblocks.test.ts`; the page looked at headless at 1280 and 375, no
  overflow, no console errors; the lessons in `test/lessons.test.ts`; the experiment in `test/experiments.test.ts`.
  Tuning: the triangle earns from a rack at the centre and not from home, and on the dealer a fast firm is refused
  more often than a slow one, over three seeds; figures in `docs/measured.md`.
- `npm run check` green at the end of every part, and the plan's state and results written into
  `plans/desk-fx.md` as each lands.

## Also found while playing the futures desk (2026-11-09), not in this part

- The top bar still says "an HFT sim" under the title: part 9's words.
- An average cost is a float, so a closing fill's `realised`, and cash with it, can be fractional cents; a rival's
  P&L showed `32240.00000000328`. Older than the desks. The currencies' balances avoid it by design; the stocks'
  path is untouched here.

## Results

Result for 5a, 2026-11-09: the desk in the sim, closed. The held game equal to the bit; its fingerprint moved for the
game's content (`50fb0670` to `914a5ecf`) only because the content carries the closed desk, and is `50fb0670` again
with the currencies taken out; the stocks-only fingerprint unchanged (`c08c8813`). The night harness's day
byte-identical before and after; PACE over every setup identical row for row. `test/fx.test.ts`, 13 tests: two
balances moved by exact integers, equity through `toHome` alone, the cross the product of its legs drawing nothing,
the pairs on `world:fx` alone with the stocks' fair values and headlines unchanged by opening the desk, rollover
once a weekday and three times on Wednesday, last look refusing a fill the dealer's price has left and filling one it
has not, a save with balances loading to the same future. The venues are Eastholm Currency Exchange (the book, lag
80 ms, a quarter of a cent a lot) and Ashford Bank's dealing desk (lag 40 ms, no fee, a look of 5 ms refusing past
half a pip), both Sunday 17:00 to Friday 17:00. The cost broke the check: the step rate with the desk open is about
55,000 ticks a second against the floor of 75,000, and the futures desk open was already about 65,000, unseen
because the gate opens no desk. Chris chose to finish the desk and take the step rate as a part of its own before
the metals desk (`plans/trading.md`, 5½; figures in `docs/measured.md`). A currency pair's gross counts both of a
cross's currencies toward the leverage cap, a stricter measure than one leg. An order held at the dealer during a
save is lost on load, as a batch's pending orders already are.

**Result for 5b, 2026-11-09.** Built, not committed. The view carries `pairs` (base, quote, lot in minor units, a
point of a lot in dollar cents at the rate now, the live venues, and a cross's legs and scale) and `rollover` (the
content's rates and spread), both absent while no pair is live. `triangle` (threshold in pips of the cross after
three fees, lots, venue 0 the book or 1 the dealer; a missed leg is traded into line with the other two, a whole
triangle is held) and `carry` (lots, stop in pips from what the block paid, a wait after a stop; at the content's
rates it holds USD/JPY long, 3.5% a year after the spread) join a firm off when the desk opens
(`DESK_BLOCKS.fx`). The rack in Eastholm (`COLO_EASTHOLM`, $80,000, 0.1 ms to both venues, its own distance to
every other) and Kestrel Currency (triangle on the book, 20 lots, 1 pip, watching the currencies alone) join when
the desk opens. A rival now sees only the desks its spec names (`watches`), else the stocks and its own desk: with
the desk open and the dollar jumped ten times from 06:00, Harbor Quant sent 337 orders in the pairs before and none
after. Desk closed: `test/instruments.test.ts` unchanged and passing (`914a5ecf`, `c08c8813`). `test/fxblocks.test.ts`
22 tests; `npm run check` green (502 tests). In passing, unmeasured: about 68,000 ticks a second headless with the
desk open at 06:00 and the stocks' rivals seeing the pairs, about 76,000 once they do not.

**Result for 5c, 2026-11-09.** Built, not committed. `'desk:fx': 4` in the stage table with `block:triangle` and
`block:carry`; 5a's guard in `shows()` is gone, since every desk the content has is named (`test/stages.test.ts`
holds that, and each desk feature's stage). The store opens the desk at stage 4, in free play and for a save from
before the stages, as it does futures, and Kestrel Currency joins with it. The snapshot carries each instrument's
`decimals` (`decimalsOf` in `src/sim/instrument.ts`, from its price unit and its quote's minor units: EUR/USD 4, the
yen pairs 2, stocks and futures 2), a pair's `pair` (base, quote, lot, a cross's legs), each position's `decimals`
and its `unrealised` in dollars through `toHome`, `balances` (each currency whose pricing pair is live, its amount and
its dollars; empty while the desk is closed), and `dealer` on a venue with a last look. `price()` takes the places;
the Market page's rows, day change, head, fair, quotes, ladder, chart axis and gap prices, the firm's positions and
orders, the races and the hand order's limit box use them. A pair's row says "euro in dollars" or "cross of EUR/USD
and USD/JPY". Balances, each with its dollar value, sit in the Overview's position and the firm panel, a fixed row a
currency from the moment the desk opens. The 17:00 rollover is written into that day's report in dollars (absent
where nothing was held), and "By desk" names the desks (Stocks, Futures, Currencies). A refused order says
"refused" in the orders list, linked to last look, and its race says so. `ParamSpec.choices` names a parameter's
values; the triangle's venue is offered as "the book" or "the dealer". Ten glossary entries and carry widened.
`test/instruments.test.ts` unchanged (`914a5ecf`, `c08c8813`); `npm run check` green (524 tests). Looked at headless
at 1280 and 375: no overflow, no console errors. Found, not changed: a rollover lands between the close and the next
open, so no day's P&L counts it (nor the pairs' overnight moves); with the pairs watched, momentum trades them 200
lots at a time; the gap line's edge for a pair is still written in cents a share.

**Result for 5d, 2026-11-09.** Built, not committed. First the fixes 5b and 5c found. A block sees the stocks and
its own desk: the stocks' blocks and the script the stocks alone, a desk's blocks (`DESK_BLOCKS`) that desk and the
stocks; with the currencies open the player's momentum no longer trades the pairs, and with the futures open the
player's market maker no longer quotes IXF. The triangle's dollar leg is as many lots as the euro leg is worth in
dollars, rounded, kept to the whole holding so the rounding never adds up: ten lots of the cross and the euro at
1.0850 want eleven of the dollar, 22,000 yen left short where ten left 128,000 long. The firm keeps each block's
average cost in a pair (`blockCosts`, saved where there is one, so a stocks save is as it was), and carry's stop
reads it, not the 200-fill log. A gap in a pair is in pips, the fees turned into pips at what a pip of a lot is
worth, in the gap line, the list and the firm's episodes. A choice parameter is named by its choice in the night's
variants, the player's own test and the Overview ("Triangular arbitrage: Venue to the dealer"). The Strategy page
links lead-lag, carry, basis arbitrage and roll to their entries. The 17:00 rollover is counted in that day's P&L,
its equity at the close and so the week's; the next day starts from the equity it left.

Then the part. `DESK_LESSONS.fx`: "Count in pips", "Close a triangle", "Be refused", "Earn the rollover", opening no
stage, in a First week section of their own ("The currencies desk"). The experiment "last look": seed 30, two
minutes from 9:31:00 with the desk open, the dollar jumping 8.7 pips against the yen 41 seconds in; the triangle
at 100 lots with the dealer from the rack in Eastholm (2 of 29 legs filled in full, 1 refused and 26 gone after the
look, $79); on the book better (90 of 90, $299), the dealer from home the same (4 legs, none refused), the book
from home worse (4 lost to Kestrel, −$24). A run's measures count what a dealer refused (`refused`). The PACE
harness has the desk's setups.

Tuning. A smooth wander never left the cross out of line by more than three spreads, so the triangle earned
nothing from anywhere and the dealer refused almost nothing. Each pair now jumps a few pips about once in a hundred
seconds (`jumpsPerSecond` and `jumpSize` on the pairs, drawn from `world:fx`, reverting as a stock's do): content
of the desk alone, the stocks' game and the futures desk untouched. Over three seeds, an hour from the open,
dollars a day: the triangle on the book from home −16, on fibre 0, from the rack 1,069; with the dealer from home
−11 and refused 0 of 291 orders, from the rack 466 and refused 91 of 632 (14%); carry 56. The check is met. The
defaults are as they were (triangle 1 pip and 10 lots, Kestrel 1 pip and 20 lots, carry 10 lots and 50 pips): 0.5
pips earned 1,230 a day on twice the fills, 2 pips 728. Most of what the dealer turns down is not refused: held
5 ms, the order finds the crowd has repriced the book, and meets nothing. Figures in `docs/measured.md`.

Desk closed: `test/instruments.test.ts` unchanged (`914a5ecf`, `c08c8813`). The stage harness opens every stage at
the moment it did before. PACE's setups from before the desk (the stocks' and the
futures desk's, 46 rows over three seeds) read the same before 5d and after, to the dollar. `npm run check` green.
