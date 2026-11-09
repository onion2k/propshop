# From a high-frequency sim to a trading sim

State: parts 1 to 6 built, 1 to 4 on 2026-11-08, 5 to 6 on 2026-11-09; the futures desk's lead check unmet, by
Chris's choice (part 4), and the metals desk's fix-against-the-minute check too (part 6). Next: the options desk
(part 7), to be specified.

## Context

Propshop teaches one corner of trading well: speed, geography, the order book, the crowd and the race for a gap
that lasts milliseconds. It teaches nothing about what most of a trading floor does: contracts that expire,
money borrowed against margin, markets that never close, prices that are a model of other prices, and risk
that is not a position but a sensitivity. The change is to grow the game from one desk into a firm of
**desks**, each a market with its own lesson arc, opened one after another. The stocks desk is the first and
stays as it is; the rest follow in the order where each one leans on what came before it.

This plan is the roadmap. Each desk gets a plan of its own (`plans/desk-<name>.md`), specified on `opus` in
plan mode when its turn comes and built on `sonnet` by the `builder` agent. Nothing here is built from this
file alone.

What does not change: learning first (memory, "Propshop is learning first"); experiments as the way a player
meets each idea, measured from two runs and never written in; one seed in named streams; stepped time; integer
prices; every list bounded; every concept in the glossary; the sim pure and the UI without logic. No remote API
(discarded, do not revisit), no real data, no real money, nothing that is advice.

## What the sim assumes today, and must stop assuming

Read from the code on 2026-11-07:

- **Everything is a stock.** `StockSpec` (`src/sim/types.ts`) is the only instrument. A position's value is
  `qty × price` in cents (`Firm.equity`, `src/sim/firm.ts:350`); there is no contract multiplier, no expiry,
  no currency.
- **Every exchange lists every symbol.** `new Exchange(e, stocks)` (`src/sim/market.ts`) builds a book for each
  stock on each exchange: thirteen symbols on three exchanges, 39 books.
- **One session for everything.** `MARKET_OPEN` and `MARKET_CLOSE` (`src/sim/clock.ts`) are 09:30 to 16:00,
  Monday to Friday, for every exchange.
- **One risk rule.** Gross exposure up to equity times `maxLeverage` (four) and a daily loss limit
  (`firm.ts:259`, `:678`). There is no margin, no settlement and no premium.
- **Fair value is drawn for every symbol from `world`,** except the index, which is the average of its
  constituents and draws nothing. That exception is the pattern for every derived instrument below.
- **Positions are held overnight** and valued at the next open; only a halt flattens.
- **A tick is 2 ms** (`TICK_MS`, `src/sim/game.ts:50`), and the step-rate test's floor of 75,000 ticks a second
  is already brushed under the full suite (CLAUDE.md). Every book added is paid for there.

## The shape of the change

1. **Instruments, not stocks.** An `InstrumentSpec` with a `kind` (`equity`, `index`, `future`, `option`,
   `fx`, `metal`) and what each kind needs: a **contract multiplier** (an index future is 50 times the index);
   a **price unit**, what the integer counts (cents for a stock, a hundredth of a cent for a currency pair, ten
   cents for gold); a **tick size**; the **venues** that list it; and, for a contract, its **underlying** and
   **expiry**. Prices stay integers. Value in dollars is `price × unit × multiplier × qty`, worked out in one
   place and nowhere else. `StockSpec` becomes the `equity` kind, and the content's stocks keep their ids.
2. **Venues with their own hours.** Each venue has a session: the stock exchanges as now, the futures venue
   nearly round the clock with an hour's break, currencies all week, metals in London, New York and an Asian
   session. "Closed hours" becomes "this venue's closed hours". The calendar and the skip to the open learn
   what the next open of _which_ venue is.
3. **Derived fair values draw nothing.** A future's fair value is its underlying plus the carry to its expiry.
   An option's is a model of its underlying and a volatility. A currency cross is the product of the two pairs
   it is made from. Only what is truly new draws chance: a volatility path, a metal's supply news, an interest
   rate. This keeps the rule that nothing the firm does reaches `world`.
4. **One world stream per desk.** `world` stays the stocks' world. Each new desk draws from its own
   (`world:futures`, `world:fx`, `world:metals`, `world:options`) and each venue's crowd from its own
   `crowd:<venue>` stream. So opening a desk does not change the stocks' morning, an experiment on one desk is
   the same morning whatever the other desks do, and a desk not yet opened need not be stepped at all. That is
   the performance answer as well as the fairness one.
5. **Margin, not leverage.** The risk officer holds a rule per kind. Stocks keep the leverage cap. A future has
   **initial and maintenance margin** and is **settled every day**, so its profit or loss is cash at each
   close. An option's buyer pays a **premium** and its seller posts margin. Currency positions carry an
   overnight **rollover**. A **margin call** is the new halt: below maintenance, the firm is flattened on that
   desk at the best price in view, as a halt does now.
6. **Contracts that expire.** A future or an option lists, trades and expires. At expiry it settles to its
   underlying (cash) or is **delivered** (the metal: a position held into delivery has to be paid for and
   stored). The live contracts are a bounded list, named beside it, and each desk's content says how many
   expiries it runs at once.
7. **Desks in the firm.** P&L, the day report, the overview's signals and comparisons and the scorecard are by
   desk as well as by block. The firm's capital is one pot, and later (part 8) the player sets each desk's risk
   budget.
8. **Desks in the game.** The stage table gets a desk dimension: each desk has its own stages and lessons, and
   a desk opens when the one before it has a stage done that it leans on (futures after the stocks' "A better
   seat"; options after futures). The cover's experiments list is grouped by desk. Free play shows every desk
   open, as now.
9. **Saves.** `SavedGame.version` 3. A version 2 save loads as a firm with only the stocks desk open, the same
   future it had, because the new desks draw from new streams. A version 1 save loads as now. Any other version
   is refused.

## The desks, in order

Each line is what the desk's own plan will specify. The lessons are the point; the blocks, upgrades and
experiments exist to make them felt.

### Stocks (built)

Speed, geography, the order book, the crowd, the maker's free option, news, regimes, the desk by hand. No
change but its name, and that the lessons later desks lean on are marked so.

### Futures, first

Why first: the most new ideas for the fewest new mechanics, and it extends the latency lessons instead of
setting them aside. In the real market the index future trades a long way from the stocks and moves first;
firms paid for microwave towers to carry its price across.

- **Market:** a new venue in a fictional inland city, the Prairie Board, listing a future on the index in two
  expiries. Its crowd hears the market factor first; the stock exchanges' crowds hear it later, as they hear
  the future's price. That lead is new behaviour for the crowd, drawn from the futures world, and it is what
  makes the desk teach.
- **Lessons:** the basis and why it is not zero (carry); the future leads and the stocks follow, and the lead
  is worth what your link to the Prairie Board is worth; leverage you did not notice (one contract is a lot of
  index); variation margin turning a loss into cash every night; the margin call; expiry and the roll; a
  calendar spread.
- **Blocks:** basis arbitrage (future against the index's stocks, an extension of index arbitrage); lead-lag
  (trade the stocks on the future's move); roll.
- **Upgrades:** fibre and microwave to the Prairie Board, a rack there.
- **Experiments:** "the lead": the same morning, fibre against microwave to the future. "The roll": roll a day
  early against on the last day.
- **Edge cases:** expiry day; the future trading while the stocks are closed (overnight news lands in the
  future first); a margin call during the day; one leg only, where the stocks fill and the future misses.

### Currencies, second

Why second: small to build (three books and a block) and it teaches arbitrage in its purest form, now with
three legs, and a market that does not close.

- **Market:** three real currencies, the dollar (the firm's home), the euro and the yen, so EUR/USD and USD/JPY
  and their cross EUR/JPY, on two fictional venues: an exchange-style book
  and a **dealer venue** with "last look", where a dealer may refuse your fill a few milliseconds after it
  sees it.
- **Lessons:** triangular arbitrage; a pip, and why prices are quoted to four places; three legs, so two
  filled and one missed; last look as the maker's free option seen from the other side; a market open all week,
  so no close to hide behind; rollover and carry (holding the currency that pays more).
- **Blocks:** triangle arbitrage; carry.
- **Experiments:** "last look": the same triangle on the book and on the dealer venue.
- **Edge cases:** the weekend close; a venue that refuses after the fill; the firm's P&L in dollars while a
  position is in another currency.

### Metals, third

Why third: built on the futures desk's contracts and margin, adding the curve, physical delivery and a
round-the-clock market in three places.

- **Market:** gold and silver as spot and as futures in several expiries; venues in a London-like, a New
  York-like and an Asian city, each with its own session; a twice-daily **fix**, an auction that holds the
  crowd as well as the firms (the batch auction the lab's note says a real one would be); a miner on the stocks
  desk that tracks gold.
- **Lessons:** the futures curve, contango and backwardation, and what storage and borrowing cost; supply news
  flips the curve; delivery, the trap of holding a contract to expiry; the fix as a batch auction; pairs across
  desks (the miner against the metal); the gold-silver ratio.
- **Blocks:** curve (calendar spread on the slope); fix arbitrage; cross-desk pairs.
- **Experiments:** "the fix": the same order sent continuously and into the fix. "Delivery": roll against
  hold.
- **Edge cases:** delivery and storage cost; three sessions, so a position always has a market somewhere; a
  supply shock.

### Options, fourth

Why last: the biggest build and the biggest idea, and it needs futures' expiry and margin and the stocks'
regimes and scheduled news to teach with.

- **Market:** calls and puts on the index, a small chain (`MAX_STRIKES` either side of the money by
  `MAX_EXPIRIES`, about twenty books), on the futures venue. A volatility path of its own, with a skew. The
  crowd quotes in volatility and turns it into prices with the model; the model is floats, rounded at the book.
- **Lessons:** an option as insurance and as a bet; the premium and what it buys; implied against realised
  volatility, and that the market maker sells the first and lives by the second; delta and the hedge; gamma, and
  why a trending day hurts the seller (the stocks desk's regimes again); theta; put-call parity as an
  arbitrage; volatility rising before a scheduled headline and falling after it (the headlines are known in the
  morning already).
- **Blocks:** options market maker with a delta hedge in the future; parity arbitrage; volatility before news.
- **Experiments:** "the hedge": hedged against unhedged on one trending morning. "The crush": hold through the
  headline against sell before it.
- **Edge cases:** expiry in and out of the money; a hedge whose leg misses; a gap through a strike on news.
- **Explanations:** the heaviest glossary of any desk. Each greek is shown as a number on the position, and
  moving the underlying in the microscope shows what it does.

### The firm across desks, after the four

Capital and risk budgets by desk; what the desks' P&L do together (they are not independent, and on a market
day they all lose at once); a stress test, a past day replayed against today's positions. The overview's
signals and comparisons work across desks ("the futures desk's lead pays for the stocks desk's losses").

## Not planned, and why

- **Bonds and rates:** relative value over days and months, a timescale the 2 ms tick does not serve. A rate
  appears only as the carry in the futures, currencies and metals.
- **Crypto perpetuals:** a funding rate and venues open all hours; currencies and futures teach both.
- **Energy:** delivery is taught by metals.
- **Investing over months:** the sim's clock is milliseconds and a game is weeks. A coarser clock would be a
  different game.

## The compressions the game makes, to be said in each desk's "what is not held"

- Futures and metals expire **weekly**, not monthly or quarterly, so a roll comes within an evening's play;
  options' expiries are decided in their own plan.
- One home currency; the firm's books are in dollars.
- One volatility path a day for options, with a fixed skew; no volatility surface fitted to the crowd.
- A contract's size is chosen so one is about what the stocks desk's one block risks. Real contract sizes would
  be beyond a small firm's means.

## Questions for Chris, answered 2026-11-08

- [x] **Real currencies, not fictional ones:** the dollar, the euro and the yen, to ground the desk in something
      the player knows. The venues stay fictional and the rates are the sim's own, drawn from `world:fx` at
      realistic sizes (a pip, a day's move), not real history; the README's "no real money, no real exchanges,
      no real companies" still holds.
- [x] **One firm with desks,** one pot of capital, desks opened in turn, each desk on its own streams.
- [x] **The order as proposed:** futures, currencies, metals, options. Futures adds two books, which matters
      while the step-rate test is near its floor.
- [x] **Weekly expiries** for futures and metals. For options, daily or weekly is decided in its own plan: real
      index options now expire daily, so daily would be accurate, and it puts the volatility crush inside a day.

## Parts

Each part is its own plan in `plans/`, specified when its turn comes, and is held to the definition of done on
its own. Part 1 must change nothing a player sees.

- [x] **1. Instruments** (`plans/instruments.md`, built 2026-11-08): `InstrumentSpec` with kind, multiplier, price unit, tick size,
      venues, underlying, expiry; `StockSpec` folded in; value worked out in one place. Check: a fingerprint of
      a seed's game over a day, taken before the change and held equal after it; `npm run check` green; the PACE
      harness on one seed reads the same to the dollar.
- [x] **2. Venues and sessions** (`plans/sessions.md`, built 2026-11-08): per-venue hours, the calendar and the skip to the open
      by venue, a venue listing a subset of instruments, the world and crowd streams by desk, a desk not open
      not stepped. Check: the same fingerprint; a test venue with other hours opens and closes on them; opening
      a desk leaves the stocks' fair values and headlines the same.
- [x] **3. Margin, settlement and expiry** (`plans/margin.md`, built 2026-11-08): the risk rule per kind, daily variation
      settlement, the margin call, the contract lifecycle (list, trade, expire, settle in cash or deliver), the
      bounded list of live contracts, P&L by desk, save version 3. Check: hand-made tests of a future through
      a settlement, a margin call and an expiry; a version 2 save loads to the same future.
- [x] **4. Futures desk** (`plans/desk-futures.md`, built 2026-11-08): as above. Check: the desk's plan's own, and
      the PACE harness says the lead is worth the microwave. The second is not met: a rack and microwave beat home
      by about 780 a day against microwave's 120,000, and Chris chose to leave the stocks' books as they are
      (2026-11-08). "The roll" is dropped as an experiment; its block and lesson teach it.
- [x] **5. Currencies desk** (`plans/desk-fx.md`, specified and built 2026-11-09, on Opus): balances by currency,
      a dealer with last look, the desk at stage 4. Check: the desk's plan's own, met but the floor with the desk
      open (part 5½). From the Eastholm rack the triangle earns about 1,070 a day on the book and 470 with the
      dealer, from home nothing; the dealer refuses 14% of the rack's orders and none from home. The pairs jump
      now and then to get there, which the plan did not say; Chris kept them (2026-11-09).
- [x] **5½. The step rate with desks open** (`plans/desk-speed.md`, before the metals desk): found 2026-11-09, the
      futures desk open runs at about 65,000 ticks a second, the currencies about 55,000, both about 46,000,
      against the floor of 75,000 with none open (figures and profile in `docs/measured.md`). Chris chose to finish
      the currencies desk first. Check: the floor with every built desk open, and a gate that opens them.
      Specified 2026-11-09 as exact cuts only, then decide; built the same day: with both desks open about 38,000
      to 50,000 ticks a second (none 69,500 to 78,600, same machine and load), a game day at top speed about 450 s
      against 285 with none, the game unchanged to the bit. Chris chose a gate (2026-11-09), a test in
      `test/game.test.ts` that opens every built desk and holds 40,000 as a tripwire (it read 59,000 alone and
      50,000 under the whole suite); the floor with none open stays at 75,000.
- [x] **6. Metals desk** (`plans/desk-metals.md`, specified 2026-11-09): a miner on the stocks desk with the seeds
      found again, the fix as a call auction that holds the crowd, a curve moved by a lease rate. Check: the desk's
      plan's own. Built 2026-11-09 on Opus, six parts: the curve flips, delivery pays storage, `fixArb` earns from
      the Thamesford rack and not from home; the fix does not beat the continuous minute for a large gold buy,
      accepted by Chris. The tripwire with every desk open is now 35,000.
- [ ] **7. Options desk** (`plans/desk-options.md`).
- [ ] **8. The firm across desks** (`plans/firm-desks.md`).
- [ ] **9. The words**: README and CLAUDE.md say "a game about trading", the cover's tagline and the game's
      first card say so, and CLAUDE.md's layout, edge cases and what is not held have the desks.

Parts 1 to 3 are the foundation and go in order. Part 5 needs parts 1 and 2 only (no margin beyond leverage,
no expiry), so it can be built beside part 3. Parts 4, 6 and 7 go in order. Part 9's README and CLAUDE.md lines
move with each part that changes them; the tagline moves with part 4, when there is a second desk to name (moved
2026-11-09: the cover's own line, no longer the glossary's "High-frequency trading").

## Risks

- **Step rate.** Every desk adds books. With desks unopened not stepped, a new player pays nothing, but free
  play with every desk open could add 30 or more books to the 39, and the step rate is already at its floor.
  Each desk's plan measures its cost per tick; the Web Worker the overview plan uses for the night's tests is
  the place the live sim would move if the frame budget cannot hold it.
- **Saves.** About 7 MB now, mostly the quote logs. Every book adds a log. Bound them by desk, and measure.
- **The economy.** Each desk needs tuning by the PACE harness so its first lesson is within reach, as the
  stocks desk's first lesson may not be now (home momentum is below nought on one seed since the streams).
- **Breadth over depth.** Four desks done thinly would teach less than one done well. Each desk lands with its
  experiments before the next is specified, and Chris plays it before the next one starts.
- **The model.** An option priced by a formula the crowd also uses has no edge to find but speed and
  volatility. That is honest for a market maker and should be said, not hidden.
