# A wider universe: factors, an index, a watchlist

State: landed on main at d57f3fe, 2026-11-02.

## Context

Three stocks in three sectors teach everything that lives inside one stock and nothing that lives between
stocks: correlation, pairs, index arbitrage, scale, diversification. A wider universe with the structure
real markets have, a market factor and sector factors, and an index over the basket, gives each of those a
place in the game. Hardware that can only watch so many names makes scale the thing an upgrade buys.

## What is built

- **Factors.** Each tick the market draws a market move and a move per sector, in basis points, each a
  wander pulled back toward zero. A stock's fair value takes the market move times its beta plus its
  sector's move, on top of its own wander and jumps; the anchor takes the same, so reversion does not fight
  it. Stocks in a sector move together; the whole tape moves together a little.
- **An index.** A stock marked as an index has no wander of its own: its fair value is the average of its
  constituents' fair values, every tick. It trades on every exchange like any other, so it can be cheap or
  dear against its basket for a moment.
- **A watchlist.** A computer watches so many symbols; the firm's `watch` list, saved, is what its blocks
  see. The laptop watches four, the server eight, the rack all. The default is the first few. The rivals
  watch everything their rack allows.
- **Content.** Twelve stocks across technology, utilities, energy and finance, with betas, and one index
  over them. Two blocks: **pairs**, which trades two stocks of one sector against each other when their
  ratio has strayed from its recent average; **index arbitrage**, which buys the index and sells the basket
  when the index is cheap against it, and the reverse, one basket at a time, which takes as many orders as
  the basket has names.
- **The market page** becomes a watchlist table: every symbol with its sector, last price, change on the
  day and whether it is watched, and the selected symbol's exchange rows, ladder and chart beneath.

## Parts

- [x] 1. Factors, the index, the watchlist, in the sim with tests.
- [x] 2. The content and the computers' watch limits; the rivals.
- [x] 3. The two blocks, with tests and glossary entries.
- [x] 4. The market page, with a UI test.
- [x] 5. Throughput held, the pacing harness run, the shop re-sized if needed.

## What the build found

- Thirty-nine books cost four times nine. The crowd now takes each book's turn once in five ticks, staggered,
  and the quote log skips ticks on which nothing changed: throughput went from 19,000 ticks a second back to
  over 100,000. A sweep keyed to the exchange's clock then left four books in five never swept, and every
  maker and bot fed on quotes the crowd should have pulled; each turn is a sweep now.
- A pair's ratio does not come back when a stock's own moves are a slow random walk, so pairs churned at
  -78,000 dollars a day. The stock's own wander now reverts to its anchor with a ten-minute half-life, as a
  liquidity shock does, while the news, the drift and the factors move the anchor itself. Pairs then earns a
  little; mean reversion still loses, as momentum's mirror should on the days momentum wins.
- The midpoint history was per decision, six tenths of a second on a rack. It is sampled every quarter of a
  second and kept for ten minutes, so a lookback means the same on a laptop and a rack.
- An index has no reason to misprice against its basket when both lag the same way. Its crowd is four times
  slower to catch up, as a derivative's is. Index arbitrage then fires from a rack, and loses about a
  thousand a day on the legs of baskets that do not all fill; from a laptop it cannot see the basket at all.

## Verification

`npm run check` green, with the throughput test still over its floor. The pacing harness shows the index
arbitrage block earning more on the rack than on the laptop, which drops most of its legs.
