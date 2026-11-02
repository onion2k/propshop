# Two more strategy blocks, and one measured out

State: landed on main at 3b0732c, 2026-11-02.

## Context

Four blocks cover arbitrage, making, momentum and news. The market has more in it to trade on: a price
that has lurched tends to come part of the way back; a side of the touch that thins out is the crowd
pulling quotes ahead of a move; and an exchange whose quote has not caught up with the others is a stale
price to hit. Each is a strategy real desks run, each teaches something the others do not, and each wins on
some kinds of day and loses on others.

## What is built

- **Mean reversion** (`meanReversion`): the midpoint against its average over a lookback; past a threshold
  away, trade back toward it, flatten within half the threshold. Earns on choppy days, bleeds on trending.
- **Order-flow imbalance** was built and taken out. Measured in this market, a heavy bid side is followed by
  the midpoint moving about a cent the other way within five seconds, because the crowd pulls a side after
  its belief has moved, not before; and traded either way, the bounce is worth less than the spread and
  fees a round trip costs: about -13,000 dollars a day whichever way it leaned. A block that can only lose
  is not an addition. The measurement is the lesson, and it is recorded here.
- **Stale-quote sniper** (`sniper`): each exchange's quote against the midpoint of the others; an ask under
  the others by more than a threshold and the fee is bought, a bid over them sold, and the position is
  flattened at the best price in view once the gap has closed. Latency arbitrage without a crossed market.
- Each is a `StrategyBlock` with explained parameters, in the registry and the default settings, with a
  glossary entry the panel links to and a test on hand-built views. The pacing harness measures each at
  home and colocated.

## Parts

- [x] 1. The three blocks and their tests.
- [x] 2. Registry, defaults, glossary, panel links; the pacing harness run on them.

## Verification

`npm run check` green. The pacing harness shows none of the three absurd: each within a few thousand
dollars a day either way, and the sniper earning more colocated than at home.
