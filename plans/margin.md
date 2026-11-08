# Margin, settlement and expiry: part 3 of the trading roadmap

State: built 2026-11-08, on Opus; checked as below, all green. See `plans/trading.md`, part 3; parts 1 and 2 in `plans/instruments.md` and
`plans/sessions.md`.

## Context

A stock is bought outright: cash pays its value, and the risk rule is a cap on gross exposure (four times
equity). A future is not bought: it costs nothing but the fee, the firm posts margin against it, its profit or
loss is paid in cash every night (variation margin), a firm whose equity falls below the maintenance margin is
flattened (the margin call), and the contract expires, settling in cash or by delivery of what it is on. This part
builds that for any instrument with a `margin`, and changes nothing for stocks, which have none.

## What changes

- **Margined instruments.** `InstrumentSpec.margin: { initial, maintenance }`, shares of a contract's value, and
  `settlement: 'cash' | 'delivery'`. The market hands each firm the margins by symbol each tick, as it hands the
  scales. For a margined instrument a fill moves cash by the fee alone, and a closing fill by what it realises;
  equity counts its unrealised P&L, not its value; the leverage cap's exposure leaves it out. An order that would
  take the initial margin of the firm's margined positions and orders past its equity is refused
  (`REJECT_MARGIN`, "not enough margin"); an order that reduces is not.
- **Variation settlement.** When a venue closes on its own hours, each margined instrument whose first listing
  venue it is settles at its fair value on its grid: every firm holding it is paid, or pays, the move since its
  average cost, which becomes the settlement price. Equity is unchanged by it; cash and realised move.
- **The margin call.** Every half second while the firm holds a margined position on an open venue, its equity is
  set against the maintenance margin of those positions, marked. Below it, the firm's resting orders in them are
  cancelled and each is flattened at the best price in view, as a halt flattens; the day's report records it and
  the game emits `margin`. Unlike a halt, the firm trades on.
- **Contracts that expire.** `Content.series` lists contract series: a root, a contract's spec, a period (a
  week), an expiry offset within it and how many are live at once (`live`, at most `MAX_LIVE_PER_SERIES` = 6).
  Contract `k` is `<root><k>`, expiring at `k × period + offset`; the live set is a function of the time, so a
  save needs no list of it. The market lists the live set as time passes (books on its venues, fair value from the
  nearest live contract, or the series' start price) and delists a contract when it has expired and settled.
- **Expiry.** At a contract's expiry, resting orders in it are cancelled and returned, and every holder settles:
  in cash, a last variation at the final price and the position closed; by delivery, the same and then the
  position becomes `quantity × multiplier` units of the underlying at the final price, paid for in cash. Then it is
  delisted and the next is listed.
- **P&L by desk** in the day's report (`byDesk`), where a desk other than the stocks traded that day.
- **Saves** are version 3. A version 2 or 1 save loads as before; nothing new is saved for a game with no series.

## Not in this part

A future's fair value from its underlying and carry, and its crowd's lead (the futures desk, part 4); storage
for a delivered metal (part 6); options' premium and the seller's margin (part 7); any UI or content for these.

## Check

- The held game of `test/instruments.test.ts` to the bit; the PACE harness and the night harness's day equal to
  the figures from before part 1.
- `test/margin.test.ts`, on a test desk with a weekly series: a future's fill costs the fee alone and its equity
  is its unrealised; the initial margin refuses an order past equity and allows one within it and one that
  reduces; at the venue's close a held future settles to the price, cash moving by the variation, equity not; a
  falling market below maintenance flattens the position and is recorded; at expiry a cash contract closes at
  the final price, its book goes and the next is listed, never more than `live`; a delivered contract becomes the
  underlying, paid for; a version 2 save loads to the same future, and a game with live contracts saves and loads
  to the same fingerprint.
- `npm run check` green.

Result, 2026-11-08: the held game of part 1 equal to the bit; PACE over the seven setups and the rivals, and the
night harness's day, identical to the figures from before part 1; the seven margin tests green, each of
settlement and margined cash caught when taken out; `npm run check` green, 446 tests.
