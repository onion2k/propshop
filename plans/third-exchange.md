# A third exchange, and racks at more than one

State: building, part 1 of 3.

## Context

Two exchanges give one gap to race for. The shop's text already says what real firms do: colocate at both
and run a fast line between them. Neither is in the game. A third exchange on the far coast gives three
gaps, two of them across the country, and racks at several sites make the link between them the thing to
pay for, which is where the real arms race went.

## What is built

- **Data and order latency split.** A location's `distance` is how far an order travels to each exchange;
  an optional `dataDistance` is how far that exchange's quotes travel to the firm's decision, and defaults
  to `distance`. `latencyTo` keeps meaning orders; `dataLatencyTo` is new. The firm reads quotes as of
  `now - dataLatency` and sends orders at `now + latency`. A rack at an exchange puts orders a tenth of a
  millisecond away; the other exchange's quotes still cross the link, so with racks at HARBOR and LAKESIDE
  the LAKESIDE quote is as late as the link but the LAKESIDE order is instant: half the round trip of one
  rack. The snapshot carries both, and the shop and the market heading show both where they differ.
- **PACIFIC,** a third exchange on the west coast: the cheapest fee, the slowest crowd. The home office is
  in the west, fifteen milliseconds from it and forty from the others. New racks: at PACIFIC; at HARBOR and
  LAKESIDE together; at all three. A fourth rival sits at PACIFIC, and the fastest rival moves to the
  HARBOR-and-LAKESIDE racks on microwave. The arbitrage block, which already takes the best bid and ask
  across every exchange, needs no change to race three.
- **The market panel** shows three rows a stock and three lines a chart.

## Parts

- [x] 1. `dataDistance`, `dataLatencyTo`, the firm reading data late and sending orders fast; tests.
- [x] 2. Content: PACIFIC, the distances, the racks, the rivals; the pacing harness run again.
- [x] 3. The panel, the shop and the heading; the chart's third colour; a UI test.

## Verification

`npm run check` green. The pacing harness shows the dual-rack rival earning the most. In the browser, the
shop lists orders and data latency apart for the dual racks, and the market shows three rows a stock.
