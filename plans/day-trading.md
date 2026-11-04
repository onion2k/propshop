# The desk: trading by hand against the machines

State: agreed 2026-11-04, being built.

## Context

The player runs blocks. They never place an order themselves, so the game cannot yet show the thing most
people mean by "trading": a person watching a chart and clicking buy. Day trading was a living when the tape
was slow enough to read; it is not now, and the reason is the game's own subject. Every order a human sends
is public information to someone a hundred times faster, and the sim already has everyone needed to act on
it. A human click is about 250 ms, which is 125 ticks here against a colocated rival's one: a day trader is
the slowest firm in the market, and nothing more.

The lesson is not that the machines rob the retail trader. Spreads are narrower than they were and a small
order usually fills at the touch or better. What has gone is the edge: the tape is faster than anyone
reading it, and a large or a resting order leaks what its owner means to do. The game should show both, in
the player's own fills, and then hand them the firm as the answer.

## What is built

- **Hand orders.** `Game.hand(intent)` sends an order as the block `hand`, through the firm's own path, so
  it gets the same risk checks, capacity count, story and race bar as any block's. Before it leaves it waits
  the firm's **reaction time**, a fixed span of simulated time from content (`desk.reactionMs`, 250), so a
  player at pause or at 1× is as slow as a person and the wall clock stays out of the sim. A hand order
  while the market is closed is refused with the reason "market closed". Pending hand orders are saved with
  the firm. The intent may name an exchange or `best`, which routes to the best visible price and, for a
  size past that quote, on to the next exchanges in price order: the sweep a retail router does.
- **The tape and the depth in the view.** `MarketView` gains `tape`: each exchange's recent trades per
  symbol as they have reached the firm, the last twenty, with aggressor and size; and `depth`, the top
  three levels a side as seen. Rivals read these as the player does: nothing names whose order it is.
- **One new rival, running one new block.** `anticipate`, run by a new colocated firm sitting at every
  exchange, does the three things the day trader meets:
  - _Chase the print._ A trade on one exchange larger than the crowd's (the crowd takes 100 to 1,000
    shares; the threshold is a parameter, default 1,500) is a sweep in progress: take the same side on the
    other exchanges before the rest of it arrives, and offer the shares back a cent worse. The slow order
    fills its first child at the screen price and the rest against the rival.
  - _Jump the big order._ A resting level larger than the crowd's (default 1,500) is a free option: quote a
    cent inside it. Filled and the price goes the right way, keep it; goes the wrong way, hit the big order
    behind for a cent's loss. The day trader's resting bid fills only when the price is coming through it.
  - _Fade._ The market maker already cancels ahead of takers; it gains a rule to pull the quote on the side
    a large print has just hit on another exchange. The player clicks a bid they can see and finds it gone.
    Each is a parameter the player can read. The block is in the registry and buyable later, so the player
    can run the predator once they have paid for the seat.
- **The desk page.** A chart, a ticket (symbol, exchange or best, side, size, limit or market, Send), and
  the Orders list as it is, with one added line under each hand order: the touch when the player clicked,
  the touch when the order arrived, and the fill, in cents a share, named _slippage_ and linked. A running
  total for the day: what hand trading cost against the quote at the click.
- **Two lessons and a tutorial step.** "Trade by hand": send a 2,000-share market buy on best and read who
  was there first. "See your order used": rest a 2,000-share bid a cent under the touch and watch the level
  in front of it fill and empty. The tutorial points at the desk once.
- **Glossary:** slippage, order anticipation, quote fade, price improvement, payment for order flow (the
  last as an entry only: the wholesaler who buys retail flow is not in the sim yet, and the entry says so).
- **The harness** gains a hand setup: the momentum block at the desk's reaction time, one order of 2,000 at
  a time, from home. It stands in for the person, so the loss is measured and not asserted.

## Not in this

A wholesaler internalising retail flow, stop orders held at a broker, and a separate prologue mode. Each is
a plan of its own if the desk earns it.

## Parts

- [ ] 1. Sim: hand orders with reaction time, `best` routing, the closed-market refusal, the save; tape and
      depth in the view; tests on a hand order's race from home and from colocation.
- [ ] 2. Sim: the `anticipate` block and its rival, the maker's fade; tests on hand-built views for each of
      the three; the harness setup, run over three seeds, numbers written into the project file.
- [ ] 3. UI: the desk page, the slippage line and total, the lessons, the tutorial step, the glossary; a UI
      test that sends a hand order and reads its slippage line.

## Verification

`npm run check` green. The harness shows the hand setup losing to the quote at the click by a measurable
amount from home and by less from colocation, and the new rival earning. In the browser, a 2,000-share
market buy from home shows its first child filled and the rest beaten by the new rival by name; a resting
2,000-share bid shows a level appear a cent in front of it.
