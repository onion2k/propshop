# The fill race: what happened to each order

State: landed on main at e0e8e3f, 2026-11-02.

## Context

The first slice shows fills as lines. It does not show the thing the game is about: that the order was sent
against a quote already tens of milliseconds old, took as long again to arrive, and found someone faster had
taken the quote first. The sim has every number for that story. This feature tells it, order by order, so
latency stops being a statistic and becomes something the player watches lose them a trade.

## What is built

- **Each order carries its story.** `OpenOrder` gains `seenAt` (when the exchange published the quote the
  order was priced from), `arrivedAt` (when it reached the exchange), `ackAt` (when the firm heard back) and
  `beatenBy`: the trades that took the quoted liquidity on the same side at that price or better between
  `seenAt` and `arrivedAt`, each with the owner, the time and the size. The firm sets `seenAt` when it sends,
  the exchange delivery sets `arrivedAt` and reads the tape for `beatenBy`, and the ack carries both back.
- **The snapshot exposes recent orders,** open and finished, newest first, up to thirty, with their stories,
  and the rivals' ids mapped to names so the UI can say who.
- **The UI tells the story under each order.** In the firm panel, an Orders list replaces the split between
  open orders and fills: each order is a line (side, size, symbol, exchange, price, what filled) with a
  race bar beneath it: saw, sent, arrived, heard, as ticks on a timeline scaled to the longest; and a
  sentence: "Filled 200 at 41.02", or "Missed: Harbor Quant took 300 at 41.02, 1.4ms before you arrived",
  or "Scratched a leftover leg". Hover or tap a tick for the number.

## Parts

- [x] 1. Sim: the story on the order, the exchange reading the tape, tests for a race won and lost.
- [x] 2. Snapshot: recent orders with stories and rival names; a test.
- [x] 3. UI: the Orders list with race bars and sentences; the UI test reads one.

## Verification

`npm run check` green. In the browser, from the home office, most arbitrage legs show a missed race with a
rival's name and the gap in milliseconds; from colocation, most show filled.
