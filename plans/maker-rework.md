# The market maker's own quote is not information

State: building, part 1 of 1.

## Context

The maker lost at every speed. A trace of its fills found why: when the crowd's belief moves, the crowd pulls
its stale quotes and the maker's is left as the best price on that side. The maker then reads the midpoint
from a book whose touch is its own stale quote, so it never re-centres, its quote keeps getting hit as the
price runs, and it cuts a large position at a loss. Real makers read the book without themselves in it.

## What is built

- **A second level in the quote.** `OrderBook.quote()` reports the second-best price and size on each side
  beside the best, and the exchange's quote log carries them, so a firm can see what the touch would be
  without one order at it.
- **`touchExcluding(view, exchange, symbol, block)`** gives the bid and ask on an exchange with the block's
  own resting orders taken out: where the block's order is the whole of the best level, the second level
  is the touch. The market maker centres on that, across exchanges, so its own stale quote never anchors
  its idea of the price, and the requote tolerance then pulls the stale quote the moment the real touch has
  moved past it.

## Parts

- [x] 1. The second level, the helper and the maker's use of it; tests; the pacing harness on the maker.

## Verification

`npm run check` green. The pacing harness shows the colocated maker at a two-cent half spread near break-even
or better, and the home maker losing less than before.
