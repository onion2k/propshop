# Instruments: part 1 of the trading roadmap

State: built 2026-11-08, on Opus at Chris's word; checked as below, all green. See `plans/trading.md`, part 1.

## Context

Everything in the sim is a stock: `StockSpec` is the only instrument, and a position's value is `qty × price` in
cents, written out at each place it is needed (no value function existed), with a multiplier of one assumed.
The futures, currencies, metals and options desks need contracts worth many times their price, prices counted in
units other than cents, and their own tick sizes. This part makes room for them and changes nothing a player
sees.

## What changes

- **`InstrumentSpec`** (`src/sim/types.ts`) is `StockSpec`'s fields plus, all optional, with the stock's case as
  the default: `kind` (`equity`, `index`, `future`, `option`, `fx`, `metal`; default `index` where there are
  constituents, else `equity`), `multiplier` (default 1), `priceUnit` (cents per integer price point, default
  1), `tickSize` (price points; absent, the exchange's rule), and, unused until later parts, `venues`
  (part 2), `underlying` and `expiry` (part 3). `StockSpec` stays as a name for the same type, and the
  content's list stays `stocks`, until part 2 brings venues.
- **Value in one place:** `src/sim/instrument.ts` has `scaleOf(spec)` (`priceUnit × multiplier`, cents per
  point of one unit held) and `valueOf(scale, qty, price)`, which is exactly `qty * price` at a scale of one,
  so a stock's every figure is the same to the bit. `kindOf(spec)` and `tickOf(spec, rules)` beside them.
- **The market** builds `scales`, symbol to scale, once. `flow.ts` hands it to every firm each tick, as it hands
  them the exchanges' fees; `Firm.unrealised` and `Firm.equity` read it from the market they are given.
- **Every value site** goes through `valueOf`: the firm's unrealised, equity, realised on a closing fill, cash
  on a fill, exposure (held and resting), and the leverage check on sending; the snapshot's unrealised and the
  hand order's slippage in `game.ts`. What stays a price, not a value, is left: the average cost, the tape's and
  a hand order's average fill price, and fees, which are per share now and per contract later.
- **Tick size by instrument:** an instrument with its own `tickSize` is quoted on that grid; one without uses
  the exchange's rule, as every stock does.

## Not in this part

Venues, sessions and streams by desk (part 2); margin, settlement and expiry (part 3); the UI, which shows
only stocks and keeps its cents; the content's experiments and lessons, which read stock fills in cents. A
hard-coded one-cent step remains in the market maker, anticipate, the script block, the desk's limit box and
the chart's axis: each desk's plan names the ones it reaches. The crowd places its orders within
`PLACEMENT_RANGE` (6) and pulls them past `STALE_DISTANCE` (8) of its belief, in cents, not ticks, so an
instrument on a grid coarser than about eight points gets no crowd quotes: the futures desk's plan scales
these by the tick, and measures what that does to the lab's five-cent grid, which they now serve.

## Check

- `test/instruments.test.ts` holds a busy colocated game (four blocks and a hand order, 616 fills, five minutes
  into the open) to the fingerprint and the firm's cash, realised, fees, unrealised, equity and exposure taken
  before the change, at commit `074c5df`, and the rivals' cash; and tests `valueOf`, `scaleOf`, `kindOf` and a
  contract with a multiplier and its own tick.
- The PACE harness on one seed, twenty minutes, over seven setups, and the night harness over one seed and a
  day, read the same before and after, to the cent.
- `npm run check` green.

Result, 2026-11-08: the held game equal to the bit; PACE over the seven setups and the rivals, and the night
harness's day with its signals and comparisons, identical before and after; `npm run check` green, 431 tests.
