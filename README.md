# Propshop

A browser game about high-frequency trading, built to learn it. You run a
tiny proprietary trading firm on a simulated stock market with three
exchanges. You build a strategy out of blocks, or write one, watch it trade,
and spend what it makes on a better office, a faster line and bigger
computers, because in this business the fast firm eats the slow one's lunch.

Play it: clone, `nvm use`, `npm install`, `npm run dev`, open
http://localhost:5181.

## What is in it

- **Experiments, first.** A short window of one trading morning, run as
  given. Then pick one change (a better seat, a wider quote, a different
  block), guess whether it will do better, the same or worse, and run the
  same morning again. The two runs sit side by side, the answer is measured
  from them, and the moments that decided it replay a hundred times slower
  on a map of every message on the wire. Nine so far: the headline, a few
  miles, the free option, the lead, last look, the fix, delivery, the hedge and the crush. The list ends with two doors to the one game: **Run the firm**,
  which opens a stage at a time as you learn it, and **Free play**, the open week with everything shown.
- **A market, not a price feed.** Fourteen fictional stocks in six sectors
  and an index over twelve of them trade on three fictional exchanges, each with its
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
- **The gap, on the page.** When your view of two exchanges crosses, the
  stock says so in money: buy here, sell there, so many cents a share and
  what is left after fees, as you see it so many milliseconds ago. Beside
  each quote you see is the market as it is now. Every gap you saw is kept,
  with what your orders on it did.
- **Every order tells its race.** When was the quote you priced from
  published, when did your order leave, when did it arrive, and who took
  the quote before you, by how many milliseconds and by name. A scorecard
  counts your races by exchange beside your latency to each, so what a
  millisecond is worth can be read off it.
- **A futures desk, later.** Once a better seat is learnt, a future on the
  index opens on a fourth venue, the Prairie Board, far inland. Its crowd
  is quicker, so it moves first and the stocks follow; what that lead is
  worth depends on your line to it. A contract is held on margin, settled
  in cash every night, and expires each Friday, so it has to be rolled.
- **A currencies desk, after that.** The dollar, the euro and the yen,
  open all week: two pairs and their cross, so going round the three can
  pay when one pair moves and the cross is slow. A book charges a fee; a
  dealer charges none and may refuse your fill a few milliseconds after it
  sees it. The firm holds euros and yen and counts in dollars, and a
  position held through five in the evening earns or pays the rollover.
- **A metals desk, last.** Gold and silver, spot and weekly futures, traded
  somewhere at almost any hour. The curve's slope is the cost of carrying
  metal, and a supply headline can flip it. A contract held to expiry is
  delivered, and metal costs storage every night. Twice a morning the
  London-like market runs the fix, a call auction at one price. A gold miner
  on the stocks desk moves with the metal.
- **An options desk, last.** Daily calls and puts on the index,
  three strikes a side, settled in cash at each day's close, priced from the
  index's own volatility with a premium over it, a little skew, and a rise
  into each public release that falls away once it lands. The Market page has
  the chain: a row a strike, a call and a put for each of two expiries, with
  bid and ask, implied volatility and delta, the time to go and what the
  straddle says the market expects the index to move by the close. Position
  has the desk's greeks (delta, the futures that would hedge it, gamma, theta
  a day, vega a point) and a what-if with two sliders, the index up or down 2%
  and the volatility up or down 5 points, which revalues the desk without
  touching the game. A short option is held on margin, and the day's report
  lists each option held through the close and what it settled for. It has
  three blocks (an option maker that quotes from the book's own volatility and
  hedges its delta in the index future, put-call parity, and a straddle bought
  into a release) and a rival, Bluestem Volatility, on the Prairie rack. Its
  customers are net buyers of options (puts above all) and a few of them are
  informed, so a maker that fills them ends short options: it earns the premium's
  decay on a quiet day and pays for the moves of a busy one, and the hedge takes
  the direction away at the future's spread. It has six lessons of its own (buy
  insurance, implied against realised, hedge the delta, gamma on a trending day,
  find parity, watch the crush), two experiments (the hedge and the crush) and a
  target: a week in which its blocks and the futures they hedge with net more than
  the Prairie rack costs. It opens at the last stage, Volatility, and in free play.
- **Strategy blocks and a script.** Cross-exchange arbitrage, market
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
  The day report names what each took off you: the resting quotes it hit, what
  they were worth a second later, and the races it won.
- **Days with a character.** Calm, trending, choppy or news-heavy, drawn
  from the seed, named in the top bar and kept in the day report. The block
  that worked yesterday is the wrong one today.
- **News, real and noise.** Headlines move a stock's fair value over
  seconds; some read like news and move nothing. The dark web will sell you
  tomorrow's headlines, some of them lies, and the regulator keeps a file.
  Market-wide releases are on a public calendar, by time only (never what
  they say), and watch mode slows down for one.
- **A risk officer and a regulator.** A daily loss limit halts you for the
  day; a leverage cap refuses an order that would carry more than you can;
  quote stuffing and order floods are noticed at the close.
- **A game that opens a stage at a time.** It starts with one block,
  momentum, on a laptop. Each lesson done opens the next idea (arbitrage and
  the race, then the day's character, then the desk, then the whole firm, then
  volatility), with a short card on what is new. A switch in the First week tab opens
  everything at once.
- **A guided first week.** Ten things to see, grouped by stage, ticked off
  by the game as each happens, with what it meant revealed after.
- **Moments marked.** A margin call, a fine, a halt, a delivery, an option
  settled at its expiry, a closed triangle, the day's first race won and the dark web opening each put one
  line under the top bar for a few seconds, with its figure, the concept it
  is, and a link to the place on the page.
- **Something at stake, and something to play for.** Every office, line and
  computer past the free ones costs a weekly rent, charged at Friday's close
  to you and to every rival, so a fast seat has to earn its keep. Each stage
  has a target (end a day up, earn the seat's rent, a week with no halt, a
  desk that pays for its rack) and there is one standing goal: beat Harbor
  Quant's week. A target is only ever met; the firm can never go bust.
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
