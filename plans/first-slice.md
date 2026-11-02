# Propshop: a high-frequency trading sim, first slice

State: landed on main at 796ed32, 2026-11-02.

## Context

A new browser game in `~/projects/propshop` (empty folder today, not yet a
git repo). The player runs a small proprietary trading firm on a simulated
stock market and builds a strategy out of blocks, upgrading their office,
network and computers to get faster. It is a learning tool first: the
author wants to understand stocks, trading and HFT by building it, and it
should teach other players the same ideas as they play.

Decisions already made:

- React UI, Vite, TypeScript, Vitest. No artshape, no guardrails kit for
  now. Tests yes, but a simpler setup than the other games.
- The market simulation is a headless module with a narrow interface, so
  it can move behind a remote API later. The UI only ever talks to it
  through that interface.
- Strategy is built from blocks with parameters now; the block interface
  is designed so a scripting block can plug in later.
- Time is continuous, simulated: trading days with the market closed in
  the evenings and at weekends. Closed hours are the natural downtime for
  tuning strategy, reading news and shopping for upgrades.
- First slice is the whole loop, thin: market, latency, strategy blocks,
  news, upgrades, dark web tips, P&L, save. Each part is minimal and
  gets deeper in later work.

## The game in one paragraph

Three fictional stocks trade on two fictional exchanges, HARBOR (east
coast) and LAKESIDE (midwest). Each exchange runs its own limit order book
per stock, fed by simulated background traders, so the two books drift
apart by a cent or two for a few hundred milliseconds at a time. The
player's firm sees market data and sends orders through a network with
latency set by where their office is and what they have bought. Strategy
blocks (cross-exchange arbitrage, market making, momentum, news reaction)
decide orders every tick from what the firm can see. Competitor bots run
the same arbitrage with their own latency, so being slow means being
beaten to the trade. A news engine fires headlines that move the stocks'
fair value; the dark web sells leaked headlines early, some fake, with a
rising chance of a regulator fine. Money made buys lower latency and more
capacity.

## Project setup

    npm create vite@latest . -- --template react-ts   (or hand-written equivalent)
    deps: react, react-dom
    dev: vite, typescript, vitest, @testing-library/react, jsdom,
         eslint + typescript-eslint, prettier

- `package.json` scripts: `dev`, `build` (tsc + vite build), `test`
  (vitest run), `lint`, `format`, `check` (format:check, typecheck, lint,
  test).
- `git init` on the default branch `main`; first commit once `npm run
check` is green.
- No chart library: price charts are a small canvas component. No state
  library: the UI subscribes to the game through `useSyncExternalStore`.
- Short `CLAUDE.md` saying what the project is, the commands, and the
  layout rule below. `README.md` says what the game is and what it
  teaches.

## Layout

    src/sim/         the market and the firm, pure TypeScript, no React, no DOM
    src/sim/index.ts the one interface the UI uses (the future API surface)
    src/ui/          React components, no game logic
    src/content/     stocks, exchanges, news templates, upgrade catalogue, glossary
    src/main.tsx     wires sim and UI together
    test/            Vitest, one file per sim module, plus one UI smoke test

Rules the code keeps:

- Nothing in `src/sim` imports React, the DOM, or `src/content`
  (content is handed in at construction).
- No `Math.random` in `src/sim`: chance comes from one seeded generator
  (`random.ts`, mulberry32) handed in, so a seed replays a game exactly.
- Time is stepped: `game.step(dtMs)` advances simulated time by a fixed
  tick. The wall clock never reaches the sim.

## The sim, module by module

- **`random.ts`**: seeded PRNG with `next()`, `range()`, `normal()`,
  `pick()`.
- **`clock.ts`**: simulated time in ms since game start, a calendar that
  knows weekday and time of day, `isMarketOpen()`, next open/close. Trading
  hours 09:30–16:00, Monday to Friday. Time of day drives background
  trader activity (busy at open and close, quiet midday).
- **`orderbook.ts`**: a price-time-priority limit order book. `add(order)`
  matches against the opposite side and rests the remainder; `cancel(id)`;
  `best()` gives bid, ask, spread, mid; `depth(n)` gives levels for the
  ladder. Returns fills with price, size, aggressor. Prices are integer
  cents, sizes integer shares, so there is no float drift.
- **`exchange.ts`**: an id, a name, a location, a fee per share, one book
  per symbol, and a population of background traders. Each tick the
  background traders post, cancel and cross orders around the stock's
  fair value as that exchange currently believes it; each exchange learns
  the fair value with its own small lag and noise, which is what makes the
  two books disagree and gives arbitrage something to eat.
- **`market.ts`**: the stocks and their fair values. Fair value is a slow
  random walk with mean reversion plus jumps from news. Holds the
  exchanges and steps them.
- **`latency.ts`**: the firm's location, network tier and each exchange's
  location give a one-way latency in ms to each exchange. Market data the
  firm sees is the exchange state as of `now - latency`; orders the firm
  sends arrive at `now + latency`. A small delay queue does both. Competitor
  bots are latency values with an arbitrage rule, nothing more.
- **`strategy/`**: `StrategyBlock` interface: `id`, `name`, `params`
  (typed, with min/max/step and a one-line explainer per param), `enabled`,
  `decide(view): OrderIntent[]`. `view` is what the firm can see: delayed
  quotes per exchange, positions, cash, open orders, recent fills, recent
  news. Four blocks: `arbitrage` (buy where cheaper, sell where dearer,
  when spread beats fees plus a threshold), `marketMaker` (quote both
  sides around mid at a chosen width, inventory-aware), `momentum` (follow
  short moves), `newsReaction` (trade in the headline's direction for a
  short window). The scripting block later implements the same interface.
- **`firm.ts`**: cash, positions, open orders, fills, trade log, realised
  and unrealised P&L, infrastructure owned, regulator heat. Runs the
  enabled blocks each tick within the compute tier's limits (how many
  blocks, how many orders per second), pushes intents through the latency
  queue, books fills that come back.
- **`news.ts`**: a schedule of scheduled events (earnings, each stock,
  known dates) and random events (sector, company, macro) drawn from
  templates with a direction, a magnitude and a time for the market to
  price it in. Publishes a headline; the fair value then moves over the
  pricing-in window. Some headlines are noise with no effect, so reacting
  to everything loses.
- **`darkweb.ts`**: offers tips, each a future headline, for a price, with
  a hidden chance of being fake. Buying raises regulator heat; heat above
  a line risks a fine or a trading halt for a day. Unlocked after the first
  profitable week.
- **`upgrades.ts`**: catalogue of locations (home office far away, city
  office, colocation at HARBOR, colocation at LAKESIDE), networks
  (consumer, leased fibre, microwave), computers (laptop, server, rack).
  Each has a price and an effect on latency or capacity, and an explainer.
- **`save.ts`**: serialise the whole game to JSON and back, versioned.
  `localStorage` in the page, handed in as a store so tests use memory.
- **`game.ts`**: owns everything above. `step(dtMs)`, `setSpeed()`,
  `pause()`, `buy(upgradeId)`, `setBlock(id, params)`, `buyTip(id)`,
  `snapshot()` for the UI, `on(event, handler)` for fills, headlines,
  fines, market open/close, `save()`/`load()`.
- **`index.ts`**: exports `createGame(content, seed, store)` and the
  types. This is the surface a remote API would later stand behind: the
  UI never reaches past it.

## Content, first slice

- Stocks: three, fictional, in different sectors so sector news matters.
- Exchanges: HARBOR and LAKESIDE, fees differ slightly.
- News templates: about ten per category, with placeholders for company
  and figures.
- Upgrades: four locations, three networks, three computers.
- Glossary (`src/content/glossary.ts`): limit order, bid, ask, spread, mid,
  order book, fill, latency, arbitrage, market maker, inventory risk,
  momentum, fair value, colocation, insider trading, P&L. Every param,
  upgrade and panel title links to its entry.

## The UI

One screen, panels, no routing. Dark theme, monospace figures.

- **Top bar**: simulated date and time, OPEN / CLOSED with countdown to
  the next change, speed buttons (pause, 1x, 10x, 60x, skip to open),
  cash, day P&L, regulator heat.
- **Market**: per stock, a row per exchange with best bid, ask, spread,
  last; a depth ladder on hover; a canvas price chart of the last few
  minutes with both exchanges overlaid so the gap is visible.
- **Strategy**: the blocks, each with an enable switch, sliders, and an
  explainer. Capacity meter showing blocks and orders per second against
  the computer's limit.
- **Firm**: positions, open orders with their in-flight state, fills log,
  P&L breakdown (gross, fees, fines).
- **News**: the feed, newest first, with the stocks each headline touched
  and the move that followed. **Dark web** tab appears when unlocked.
- **Shop**: upgrades, grouped, with current latency to each exchange shown
  before and after.
- **Learn**: the glossary, and a short "what just happened" line under
  each fill (e.g. "bought 100 on LAKESIDE at 41.02, sold on HARBOR at
  41.05: 3¢ gross, 0.4¢ fees").

The UI reads `game.snapshot()` at about 10 Hz through
`useSyncExternalStore`, whatever the sim speed. The sim runs in
`requestAnimationFrame`, stepping as many fixed ticks as the speed asks
for, capped per frame so a tab that was hidden catches up without a hang.

## Tests

Vitest, in `test/`. The sim is tested headless with a fixed seed.

- `orderbook.test.ts`: price-time priority, partial fills, cancel, best
  and depth, integer prices.
- `exchange.test.ts`: background traders keep a two-sided book; books on
  two exchanges diverge and reconverge.
- `latency.test.ts`: an order sent at t arrives at t + latency; a faster
  competitor wins a shared opportunity; a colocation upgrade flips who
  wins.
- `strategy.test.ts`: each block, on a hand-built view, emits the orders
  it should and nothing when there is no edge after fees.
- `news.test.ts`: a headline moves fair value by its magnitude over its
  window; a noise headline moves nothing; dark web fake tips mislead.
- `firm.test.ts`: cash and positions reconcile with fills; P&L matches a
  hand calculation; fees and fines booked.
- `clock.test.ts`: open and close times, weekends, skip to open.
- `determinism.test.ts`: two games on one seed stepped a simulated day
  give identical snapshots; a different seed differs.
- `save.test.ts`: save, load, step both, equal.
- `ui.test.tsx`: the app renders, the clock advances when stepped, a
  slider changes a block's param in the game.

Done for the slice: `npm run check` green, the game playable in a browser
from `npm run dev` through one simulated week with the arbitrage block on,
and a first commit on `main`.

## Parts, in build order

- [x] 1. Project skeleton: Vite, React, TS, Vitest, ESLint, Prettier,
      `check` script, CLAUDE.md, README, git init.
- [x] 2. `random`, `clock`, `orderbook` with tests.
- [x] 3. `exchange`, `market`, background traders with tests; two books
      shown to diverge.
- [x] 4. `latency`, `firm`, order flow end to end with tests.
- [x] 5. `strategy/` blocks and the `arbitrage` block winning against a
      slower competitor, with tests.
- [x] 6. `news`, `darkweb`, regulator heat, with tests.
- [x] 7. `upgrades`, `save`, `game.ts`, `index.ts`, determinism test.
- [x] 8. UI: top bar, market, strategy, firm panels; the sim loop.
- [x] 9. UI: news, dark web, shop, learn; glossary links.
- [x] 10. Play a simulated week in the browser, fix what shows, first
      commit.

## What the build found

- Order ids are per book, so a fill must be matched by exchange, symbol and id: matched by id alone, a
  XYZ fill was booked at an MNO price and the P&L swung by hundreds of thousands.
- A crowd that leaves stale quotes resting is a money printer for whoever is fast. The crowd now pulls
  quotes on the wrong side of its belief within a few sweeps; that window is the arbitrage.
- Every firm, however fast, misses its far leg often. The arbitrage block scratches its leftover at the
  best price it can see, which is the price of being slow, and each block knows its own position.
- Exchanges charge takers, not makers; the market maker's edge is partly that.
- A 10ms tick made a city office and colocation the same; the tick is 2ms.
- The economy is roughly paced by hand (`PACE=1 npx vitest run test/pace.test.ts`) and wants a proper
  pass of its own: the market maker still loses when slow, and the shop is sized to weeks of play.

## Out of scope for this slice

Scripting block, remote API, more than two exchanges or three stocks,
sound, mobile layout polish, options or short selling, multiple save
slots, achievements.

## Verification

- `npm run check` green (format, types, lint, all Vitest).
- `npm run dev`, open the game, speed to 60x, enable arbitrage, run a
  simulated week: fills appear, P&L moves, news fires and moves a chart,
  market closes Friday 16:00 and opens Monday 09:30, a bought upgrade
  lowers the latency shown and raises the arbitrage win rate.
- Reload the page: the game resumes where it was.
