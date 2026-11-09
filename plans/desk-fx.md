# The currencies desk: part 5 of the trading roadmap

State: specified 2026-11-09 on Opus, in plan mode, and agreed; to be built on
`sonnet` by the `builder` agent, a part at a time. See `plans/trading.md`, part 5, and the foundation in
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
