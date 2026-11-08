# Venues, sessions and desks: part 2 of the trading roadmap

State: built 2026-11-08, on Opus; checked as below, all green. See `plans/trading.md`, part 2, and `plans/instruments.md` for part 1.

## Context

Every exchange lists every symbol, keeps the stocks' hours (09:30 to 16:00, Monday to Friday, `clock.ts`), and
the market draws every symbol's chance from one `world` stream. The desks to come trade on venues of their own,
with their own hours (a futures venue nearly round the clock, currencies all week), list only their own
instruments, and must not change the stocks' morning by opening. This part builds that ground and changes
nothing a player sees: the content still has one desk, the stocks.

## What changes

- **Sessions** (`src/sim/session.ts`): a venue's hours as a weekly list of open spans, from Monday 00:00, so a
  session may cross midnight or run all week. `daily(open, close, days)` builds the usual kind (a close before the
  open crosses midnight, as a futures venue's 18:00 to 17:00 does). `isOpenIn`, `nextOpenIn`, `nextCloseIn` and
  `activityIn` (busy at either end of a span, quiet in its middle, as the stocks' day is). `STOCK_SESSION` is
  the stocks' hours in this form, and a test holds it equal to `isMarketOpen` and `nextOpen`.
- **Venues:** `ExchangeSpec` gains `desk` (default `stocks`) and `session` (absent, the stocks' hours, worked
  out by `clock.ts` exactly as now). An exchange opens, quiets and closes on its own session; at its own close
  its books empty and the orders go back to their owners, as the stocks' do now. A venue with a session of its own
  refuses an order that arrives while it is closed; a stock venue keeps today's behaviour.
- **Listing:** an instrument is listed on its `venues`, or, absent, on every venue of its desk (`desk` on the
  instrument, default `stocks`). An exchange has books for what it lists and no others: `lists(symbol)`;
  `quoteAsOf` of an unlisted symbol is null; the market's history samples, the snapshot, the firm's mark and view
  and the news's mid read only the venues that list a symbol.
- **Desks:** a desk is open or not. The market keeps every instrument and venue and steps only those of open desks:
  `market.stocks` and `market.exchanges` are the live ones (so the firm's view, the snapshot and the samples see
  only open desks), `market.instruments` and `market.venues` all of them. `Game.openDesk(id)`; the stocks desk is
  always open. The open desks are saved (`SavedGame.desks`, optional; absent, the stocks alone).
- **Streams by desk:** `world` stays the stocks'; each other desk draws its fair values and sector factors from
  `world:<desk>`, and each venue's crowd from `crowd:<venue>` as now. The stocks' factor loop, the news picker
  and the day's regime drifts read the stocks desk alone, so a desk's instruments add no draw to `world`. A save
  without a desk's stream, or a venue's crowd stream, has it derived from the seed when loaded.
- **The clock by venue:** `market.isOpenFor(symbol, now)` (any listing venue open) is what a hand order is refused
  on; `Game.nextOpenOf(venue)`; the top bar, the day, the day's report and `skipToOpen` stay the stocks'.

## Not in this part

A desk's own news, regime and market factor (each desk's plan); firms' blocks trading outside the stocks' hours
(the futures desk's plan: today a firm's blocks act while the stocks are open); margin, settlement and expiry
(part 3); any UI for desks; content with a second desk.

## Check

- The held game of `test/instruments.test.ts` to the bit; the PACE harness over seven setups and the night
  harness's day equal to the figures taken before part 1 (`/private/tmp/claude-501/sz/pace-before.log`,
  `night-before.json`).
- `test/sessions.test.ts`: the stocks' session equal to the clock over a fortnight of sampled times; a daily
  session crossing midnight and one running all week open, close and give their next open and close; a venue of
  a test desk with its own hours opens and closes on them, its books empty at its close; opening the desk leaves
  the stocks' fair values and headlines the same as a game without it; a desk not open is not stepped (its fair
  values, books and stream untouched); an instrument listed on one venue has no book on the others, and a quote of
  it there is null; a save with a desk open loads open, and one without the desk's stream derives it.
- `npm run check` green.

Result, 2026-11-08: the held game of part 1 equal to the bit; PACE over the seven setups and the rivals, and the
night harness's day, identical to the figures from before part 1; the eight session tests green (the stocks'
session equal to the clock at 4,400 sampled times, activity included); `npm run check` green, 439 tests.
