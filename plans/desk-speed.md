# The step rate with desks open: part 5½ of the trading roadmap

State: specified 2026-11-09 on Opus, in plan mode, and agreed; built 2026-11-09 by
the `builder` agent. See `plans/trading.md`, part 5½, and "Speed and frames" in `docs/measured.md`. Chris chose
(2026-11-09): exact cuts only, then decide. Nothing here may change the game; the floor and the gate wait on the
figure this part brings back.

## Context

The tick is 2 ms of game time and stays so (latency is the game). The floor in `steps fast enough for the top speed`
(`test/game.test.ts`, 75,000 ticks a second) opens no desk, and is a tripwire, not a promise: in the page the sim
gets 8 ms a frame, so 300× reaches about 70× on the desktop with none open. Measured again on 2026-11-09 (esbuild
bundle of `Game`, seed 12, `skipToOpen`, 10 s warm-up, 4 minutes timed, load about 1.3): none 74,400; futures 56,800;
currencies 51,300; both 40,900. So a game day at top speed goes from about 5 minutes to about 7.

Profiled with both open against none: opening both adds about 11 µs a tick, and about 8 µs of it is the firms'
deciding. Per decision each firm rebuilds things that change rarely or never, and every rack rival decides every
tick:

- `narrowed` in `src/sim/firm.ts` copies the whole view with `Object.getOwnPropertyDescriptors` for each desk a
  firm sees, every decision: 8% of a tick on its own.
- `Firm.view` (18% inclusive, 16.5% self) rebuilds `sectors`, `constituents`, `contracts`, `pairs` (with
  `venuesOf` and `inHome` each), `rollover`, `latency`, `blockPositions`, `blockCosts` and `mids` records, and
  filters every order for `openOrders`; it asks `quoteAsOf` of every venue for every watched symbol, listed there or
  not; it filters with `includes` inside `filter`.
- `Firm.decide` (12% self) rebuilds `deskOfSymbol` and the per-desk symbol lists every decision.
- Garbage collection is 7–11% of a tick, much of it these per-decision objects.

The exchanges' side (the crowd's staggered turns, `logQuotes` on touched books only) is already lean, and any change
to what the crowd draws would change the game.

## What is built

All in `src/sim/firm.ts` and `src/sim/market.ts` unless named; each cut must leave every firm's decisions, in the
same order, with the same intents.

1. **A held game with the desks open, first.** In `test/instruments.test.ts`, beside the two held fingerprints,
   one with `openDesk('futures')` and `openDesk('fx')`, two seeds, ten minutes from the open, the player on a rack
   with a stocks block, a futures block and a desk block from the currencies enabled (so narrowed views are
   exercised), and the rivals as content has them. Recorded on the tree as it is, before any cut; it is the proof
   that each cut is exact. The two fingerprints there now stay as they are.
2. **`narrowed` by prototype.** `Object.create(view)` with an own `symbols`: the getters for `tape` and `depth`
   are closures and keep working. The per-desk symbol lists and `deskOfSymbol` are kept on the firm and rebuilt
   only when the watched list or the market's live instruments change.
3. **What every firm sees alike, built once.** The market keeps `sectors`, `constituents`, `contracts`, the
   exchanges' ids and the pairs' fixed parts (base, quote, units, scale, venues, cross), rebuilt when its live
   instruments change (a counter bumped by `openDesk`, a contract listed or expired); `pairs` with `pointValue`
   and `rollover` rebuilt when the rates move, at most once a tick, not once a firm. Views hand out the same
   objects; their types are already readonly, and a block that writes into one is a bug (a test reads one before
   and after a busy run).
4. **What a firm sees of itself, kept until it changes.** `latency` and `fees` until the firm's infrastructure
   changes; `mids` (the arrays are the same) until a symbol is added; `blockPositions` and `blockCosts` until a
   fill; `openOrders` until an order's status changes, in the orders map's own order, as now.
5. **Quotes only where listed.** The watched symbols each venue lists, kept with the lists in 2; every venue keeps
   its (possibly empty) record in `quotes`, so a block reading `view.quotes[venue]` finds one as now.
6. **Then profile again,** and take any further cut that is exact and measured (a cheaper `includes`, fewer
   per-decision arrays, `logQuotes` comparing before it builds its depth); stop where the next cut would change
   what anything draws or decides.

## Not in this part

Any change to the floor or the gate (Chris decides on the figure); anything that changes the game: rivals deciding
less often, the crowd's turns or draws, the tick, quote-log length; a worker for the sim.

## Check

- The held fingerprints: the two now in `test/instruments.test.ts` unchanged, and the new desks-open one unchanged
  from before the first cut, after every cut.
- `npm run check` green.
- The stage harness (`STAGE_PACE=1 STAGE_SEEDS=1 STAGE_DAYS=1`) identical before and after; PACE with
  `PACE_ONLY` set to the futures and currencies rows and three stocks rows, identical to the dollar.
- The rates, before and after, alone, three runs each, none, futures, currencies, both, by the bundle method in
  `docs/measured.md`; the profile's top lines after. Written into `docs/measured.md` and the results of
  `plans/desk-speed.md`, with how long a game day takes at top speed with every desk open, for Chris to set the
  gate on.
- `plans/trading.md` part 5½ left unticked, its line saying what was reached and that the gate waits on Chris.
- Commit and push when done (Chris, 2026-11-09).

## Results

### Result, 2026-11-09

Built on the tree at `f94384f`; nothing committed. The game is the same to the bit: the three held fingerprints
(`914a5ecf`, `c08c8813` and the new desks-open one, two seeds) did not move, the stage harness and PACE (the futures
and currencies rows and the stocks rows `home arb`, `home momentum`, `colo mm`, `home hand`; thirty lines, three
seeds, to the dollar) are identical before and after.

Ticks a second by the bundle method, alone, three runs each, before then after, taken in the same half hour:

| desks open | before        | after         | gain |
| ---------- | ------------- | ------------- | ---- |
| none       | 69,500        | 78,100-79,300 | +13% |
| futures    | 51,400-52,400 | 62,100-62,500 | +20% |
| currencies | 46,900-47,500 | 58,400-59,000 | +24% |
| both       | 37,600-38,000 | 49,500-50,500 | +32% |

A game day at top speed with every desk open: about 450 s, from about 590 s (the 52,000 ticks a second and 300 s
for none open, scaled by the ratio of the rates; the plan's "about 7 minutes" was a looser scaling). The floor in
`game.test.ts` and the gate are as they were, for Chris to set on these figures.

What was done, against the items above:

- Item 1: the desks-open fingerprint in `test/instruments.test.ts`, two seeds, with the orders each enabled block
  sent, recorded before any cut.
- Item 2: `narrowed` is `Object.create(view)` with an own `symbols`; the per-desk symbol lists and which symbols are
  another desk's are worked out once in a firm's plan, kept until the watch list (compared by value, so a list changed
  in place too), the computer's `maxSymbols`, its desks or the market's live set change.
- Item 3: `Market.sharedParts()` (sectors, constituents, contracts, venue ids) and `Market.pairParts()` (the pairs
  and the rollover) are built once for every firm, on `Market.liveStamp`, which `refreshLive` and `load` bump;
  the pairs again when a rate's mid has moved. `flow.ts` hands every firm the same bump, tax and fee tables, new
  ones only when a venue's value changes.
- Item 4: a firm keeps its latency table (until its infrastructure, a bump or the live venues change), its `mids`
  record (until a symbol is added), its block positions and costs (until a fill or an expiry) and its open orders
  (until an order is added or changes status, or the orders' count changes). Each is replaced, never changed in
  place, so a decision's view keeps what it was given. None is saved; a loaded firm builds its own.
- Item 5: quotes, tape and depth ask only the venues that list a symbol.
- Item 6: `Exchange.logQuotes` trims the quote log with `shift` (the splice of a 400-entry array was 3.5% of a
  tick). Tried and dropped: reusing a venue's quotes, tape and depth record when none of its books had moved
  (65% hits, no gain). Not taken: `logQuotes` comparing before it builds its depth (a quarter of the calls could
  skip the allocation; about 1%).
- `test/viewcache.test.ts` proves the invalidation: at some builds of every firm's view, in a game with both desks
  open, a desk opened mid-game, the watch list changed (also in place), the computer changed, a venue's speed bump
  moved, contracts listed and expired every three minutes, and a game loaded from a save, the view is compared with
  what the firm and the market say it should be (checked to fail when an invalidation is taken out), the shared
  pieces are checked unchanged at the end, and each block is shown only the stocks and its own desk.

Left, because it would change the game: rivals deciding less often (builds are about one a tick across the six
firms already); anything in the crowd's turns or draws (the crowd is 18% of a tick and the drift 9%); and the
blocks' own reading, which is the rest of the firms' 40%. One difference a player's script could see: a narrowed
view now stands on the full view, so `Object.keys` or a spread of `view` in a script shows only `symbols` (reading
any field is as before).

Chris chose a gate, 2026-11-09: `steps fast enough with every built desk open` in `test/game.test.ts` opens every
desk the content has (`market.desks`) on the floor test's setup and holds 40,000 ticks a second. Three runs alone
read 58,900 to 59,000 (the floor test beside it 100,900 to 102,500); under the whole of `npm run check`, 50,000.
