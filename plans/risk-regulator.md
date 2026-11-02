# Risk limits and the regulator

State: building, part 1 of 3.

## Context

Nothing stops a strategy from losing everything in an afternoon, and the only thing the regulator notices
is tips. A real desk has a risk officer who halts a book that is down too much and refuses an order that
would put on more than the firm can carry; a real regulator notices a firm that floods an exchange with
quotes it never means to fill. Both are lessons, and both bound what a wild script can do.

## What is built

- **Risk settings on the firm,** saved: a daily loss limit in cents and a leverage. Defaults: a loss limit
  of two percent of the starting cash, a leverage of four.
- **The halt.** When the day's P&L falls below the limit, the firm is halted until the next open: resting
  orders are pulled, positions are flattened once at the best price it can see, and no block decides. An
  event says so, the top bar shows a banner with the reason and when it lifts, and the day report lists it.
- **The exposure cap.** An order whose notional, added to what the firm already holds and has resting, would
  take gross exposure past equity times the leverage is rejected before it leaves, with a reason the race
  sentence shows. The count is in the capacity line.
- **The regulator.** At the close the game reads the day's orders, cancels and drops. More than a thousand
  orders of which nine in ten were cancelled is quote stuffing; more than five hundred orders dropped for
  capacity is a flood. Each adds heat and a note, in the day report and the log, and the fines that heat
  already brings follow.
- **Glossary:** risk limits, quote stuffing. **Firm panel:** the two settings as sliders.

## Parts

- [x] 1. The firm's risk settings, halt and exposure cap; the game's loss check; tests.
- [x] 2. The regulator's notes at the close; tests.
- [x] 3. The banner, the sliders, the report lines, the glossary; a UI test.

## Verification

`npm run check` green. In the browser, with the loss limit at its lowest, a day from home halts within
minutes and the banner shows; a script that posts and cancels a far order every decision earns a quote
stuffing note at the close and heat above zero.
