# The futures desk: part 4 of the trading roadmap

State: 4a and 4b built 2026-11-08, on Opus; 4c to 4e to come, each built and checked in turn. See
`plans/trading.md`, part 4, and the foundation in `plans/instruments.md`, `plans/sessions.md`, `plans/margin.md`.

## Context

The foundation is in: instruments with a scale, venues with their own hours and desks, margin, settlement and
expiry. This part opens the first desk a player sees: a future on the index, traded on a venue of its own, the
Prairie Board, in a fictional inland city. It teaches the basis and carry, leverage you did not notice, variation
margin turning a loss into cash every night, the margin call, expiry and the roll, and above all the lead: the
future moves first and the stocks follow, and the lead is worth what your link to the Prairie Board is worth.

## The numbers

- The index starts near $52.97 (the average of the twelve stocks). One contract is a hundred times the index,
  about $5,300; margin 8% initial and 6% maintenance, about $420 and $320 a contract.
- Carry 3.5% a year (interest less dividends), the real order: a contract a week out is about 3.5 cents over the
  index, two weeks out about 7: the basis, on the one-cent grid, without compressing anything.
- Weekly expiries, Friday at 16:00 with the stocks' close, two listed (the near and the next).
- The Prairie Board's crowd catches up with a move in 50 ms; the stock exchanges' in 250 to 600 ms, and their
  index books four times slower. The future moves first because its crowd is quicker: that is the lead, and a
  firm that sees the Prairie Board soon enough trades the stocks before their crowds catch up.
- Its hours: 18:00 to 17:00, Sunday evening to Friday, with an hour's break each day.
- Distances to the Prairie Board, one-way ms of fibre: home 15, city 18, a rack at Harbor 18, at Lakeside 9, at
  Pacific 14, at two or all three 9. A rack at the Prairie Board is a location of its own (4c).

## Parts

- **4a. The sim.** A future's fair value derived from its underlying and carry: `fair × (1 + carry × time to
expiry in years)`, worked out each tick and drawing nothing, so it converges on the index at expiry (the final
  settlement). A derived instrument registers no sector factor. The crowd's placement and staleness distances
  count in the instrument's own grid where it has one (the lab's exchange grid keeps cents, as now). The firms
  decide while any open desk's venue is open, not only in the stocks' hours: a stocks-only game is the same.
- **4b. The content.** The Prairie Board, the index future series (`IXF`), and every location's distance to it,
  behind the futures desk, which stays closed: nothing changes for a player yet.
- **4c. Blocks and upgrades.** Basis arbitrage (the future against the index's book), lead-lag (the stocks on the
  future's move), roll (out of the near contract before expiry); fibre and microwave to the Prairie Board and a
  rack there; the rivals who trade it.
- **4d. The page.** The desk opens at the stage after "A better seat" and in free play; the Market page shows the
  future beside the stocks with its expiry, basis and margin; the Overview's position and day report by desk; the
  glossary (future, basis, carry, margin, variation margin, margin call, expiry, roll, lead-lag).
- **4e. Lessons, experiments and tuning.** The desk's lessons; experiments "the lead" (fibre against microwave
  to the Prairie Board, one morning) and "the roll" (a day early against the last day); the PACE harness until
  lead-lag from a rack beats it from home by the price of the microwave.

## Edge cases (for the desk as a whole)

Expiry day; the future trading while the stocks are closed (overnight news lands in the future first); a margin
call during the day; one leg only, where the stocks fill and the future misses; a desk not open (nothing of it
steps); a save from before the desk (it loads with the desk closed).

## Check, for 4a and 4b

- The held game of `test/instruments.test.ts` to the bit, the PACE harness and the night harness's day equal to
  the figures from before part 1, with the futures content in and the desk closed.
- `test/futures.test.ts`: a derived future's fair value is its underlying's carried to expiry each tick, meets it
  at expiry, and draws nothing from its desk's stream; the crowd quotes an instrument on a coarse grid of its own;
  a firm decides at 20:00 while an open desk's venue is open, and not when none is; with the desk opened the
  Prairie Board's book moves before the stocks' index book after a market move (the lead, measured).
- `npm run check` green.

Result for 4a and 4b, 2026-11-08: every figure of the held game equal, its fingerprint equal for the stocks-only
content (`c08c8813`) and moved for the game's (`50fb0670`), which now carries the closed desk; PACE and the night
harness's day identical to the figures from before part 1; the lead measured at 90 ms for the future against 736
for HARBOR's index book; `npm run check` green, 451 tests.
