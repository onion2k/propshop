# The lab, and the microscope

State: building, part 1 of 4.

## Context

The game teaches how to win in this market. The deeper question in high-frequency trading is why the
market looks the way it does, and the way to learn that is to change the market and watch who earns. And
the game's central idea, latency, is told in sentences; two milliseconds at a time it becomes something to
watch. Two features: a lab of market rules, and a microscope.

## The lab

Rules an exchange may run, each a real policy built or proposed to blunt speed, settable per exchange from
a Lab tab on the Reports page, saved with the game:

- **Speed bump** (ms): every order and every quote through that exchange takes this much longer, both ways.
  IEX's 350 microseconds, scaled to the game's ticks. Blunts a race against that venue's quotes.
- **Batch auction** (ms): orders do not match on arrival; they wait for the next batch and match then, ties
  by lot rather than by time. Budish, Cramton and Shim's proposal. Removes the race entirely within a batch.
- **Transaction tax** (cents a share): charged to both sides of every fill. Kills the thin edges first.
- **Minimum resting time** (ms): a resting order cannot be cancelled before it has rested this long. Makers
  who cannot pull a stale quote widen or leave.
- **Tick size** (cents): prices on a coarser grid. Spreads cannot be narrower than a tick, so makers earn
  more a fill and arbitrage finds fewer gaps.
- **Post-only allowed**: off, and a post-only order is treated as a plain one, so makers pay the taker fee
  when the market moves through them.

Each rule has an explainer with its real-world origin. The Lab shows a scoreboard since the rules last
changed: each firm's P&L from that moment, yours among them, so the effect of a change is read off the
rivals as much as off yourself.

## The microscope

A mode, entered from a button beside the speed buttons, that pauses the game and shows, for the picked
stock, the three exchanges with the top of each book, every firm with a line to each exchange, and every
message in flight as a dot on its line with how far along it is: orders going out, fills and acks coming
back, yours and the rivals'. Step buttons advance one tick, ten, or fifty. A log beneath says what moved in
the step: sent, arrived, filled, refused, pulled. The exchanges show their crowd's belief against the true
fair value, so the lag that makes a gap is visible as a distance.

## Parts

- [x] 1. The rules in the sim: types, per-exchange settings on the game, the speed bump in latency, the batch
      in the exchange, the tax in the firm, the minimum rest in cancel, the tick in the book and the crowd,
      post-only honoured or not; saved; tests for each.
- [x] 2. The Lab tab with the controls, the explainers and the scoreboard; a UI test.
- [x] 3. Messages in flight exposed in the snapshot for every firm, with the exchanges' beliefs; the
      microscope mode on the game with step; tests.
- [x] 4. The microscope panel, drawn in SVG, with its step buttons and log; a UI test.

## Verification

`npm run check` green. Headless: a batch auction on every exchange brings the fast and slow firms' win
rates together; a speed bump on HARBOR cuts the fastest rival's earnings on it; a two-cent tax ends
arbitrage. In the browser: the Lab changes the rivals' scoreboard within a simulated hour; the microscope
shows an order leaving, arriving and a fill returning, tick by tick.
