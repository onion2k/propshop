# Propshop

A browser game about high-frequency trading, built to learn it. You run a
tiny proprietary trading firm on a simulated stock market with three
exchanges. You build a strategy out of blocks, or write one, watch it trade,
and spend what it makes on a better office, a faster line and bigger
computers, because in this business the fast firm eats the slow one's lunch.

Play it: clone, `nvm use`, `npm install`, `npm run dev`, open
http://localhost:5181.

## What is in it

- **A market, not a price feed.** Twelve fictional stocks in four sectors
  and an index over them trade on three fictional exchanges, each with its
  own price-time order book fed by a crowd of background traders. Stocks
  move with the market, with their sector and on their own. Each exchange's
  crowd learns about a move at its own pace, so for a few hundred
  milliseconds they disagree, and that disagreement is what every firm in
  the game is racing for.
- **Latency you can feel.** Your view of each exchange is as old as your
  distance from it, and your orders take as long again to arrive. From a
  home office that is tens of milliseconds; from a rack in the exchange
  building it is a tenth of one. With racks at several exchanges your
  orders land at once, and what still takes time is the other exchange's
  quote crossing the link to you.
- **Every order tells its race.** When was the quote you priced from
  published, when did your order leave, when did it arrive, and who took
  the quote before you, by how many milliseconds and by name.
- **Eight strategy blocks and a script.** Cross-exchange arbitrage, market
  making, momentum, mean reversion, a stale-quote sniper, pairs, index
  arbitrage and news reaction, each with explained parameters and the day
  it suits. Or write your own in JavaScript, with a loop budget, no chance,
  and the page out of reach.
- **A watchlist your hardware bounds.** A laptop follows four symbols, a
  server eight, a rack all of them; the blocks see only what is watched.
  Scale is the thing an upgrade buys.
- **Rivals who are faster than you.** Four firms run the same arbitrage
  from better seats. The fastest sits in two exchange buildings on a
  microwave line and earns about ten thousand a day.
- **Days with a character.** Calm, trending, choppy or news-heavy, drawn
  from the seed, named in the top bar and kept in the day report. The block
  that worked yesterday is the wrong one today.
- **News, real and noise.** Headlines move a stock's fair value over
  seconds; some read like news and move nothing. The dark web will sell you
  tomorrow's headlines, some of them lies, and the regulator keeps a file.
- **A risk officer and a regulator.** A daily loss limit halts you for the
  day; a leverage cap refuses an order that would carry more than you can;
  quote stuffing and order floods are noticed at the close.
- **A guided first week.** Eight things to see, ticked off by the game as
  each happens, with what it meant revealed after.
- **A report every close,** by block, by stock and by race, with a chart of
  the days.
- **A glossary** behind every underlined term: order books, the spread,
  latency, colocation, maker and taker fees, adverse selection, insider
  trading and the rest.

## What it is for

Learning. The simulation is honest in the ways that teach: a slow firm
loses races to a named rival and scratches the leg it is left with; a market
maker's resting quote is a free option for everyone faster; news is priced in
over seconds, not at once; and a signal that the textbook swears by can turn
out, measured in the market you are in, to be worth less than the spread.
The same seed replays the same game, so anything you see can be seen again.

## Developing it

TypeScript, Vite, React, Vitest. The simulation in `src/sim` is headless
and seeded, reaches nothing in the page, and is used by the UI through one
file, `src/sim/index.ts`. `npm run check` runs formatting, types, lint and
the tests. `PACE=1 npx vitest run test/pace.test.ts` measures what each
setup earns a day, which is how the economy is tuned. `CLAUDE.md` says how
the code is laid out and what is not held; `plans/` records each piece of
work, what it found, and where it landed.

No real money, no real exchanges, no real companies. Nothing here is advice.
