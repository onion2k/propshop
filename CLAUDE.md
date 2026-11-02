# Propshop: working on it

A browser game about high-frequency trading: the player runs a small prop
trading firm on a simulated market, builds a strategy from blocks, and buys
lower latency. It is a learning tool first, for the author and for players.
React, Vite, TypeScript, Vitest. The README says what the game is and
teaches; this file says how it is made. The house rules in
`~/.claude/CLAUDE.md` apply too. No guardrails kit yet, by choice.

## Commands

    npm run dev          the game at http://localhost:5181
    npm run check        formatting, types, lint, unit tests (~15 s)
    npm test             unit tests alone (Vitest, test/)
    npm run format       prettier, writing
    PACE=1 npx vitest run test/pace.test.ts
                         what each setup earns a day, headless, one seed: the economy's tuning harness

Node 24 (`.nvmrc`): npm 10 under Node 23 cannot resolve Vitest 5's peers.

## Layout

- `src/sim/` is the market and the firm, pure TypeScript. It imports
  nothing from React, the DOM or `src/content`; lint holds that. Content is
  handed in at construction. `src/sim/index.ts` is the one surface the UI
  uses, and is what a remote API would later stand behind.
- `src/ui/` is React components with no game logic. `src/main.tsx` wires
  the two together and runs the sim loop.
- `src/content/` is stocks, exchanges, news templates, upgrades, glossary.
- `test/` is Vitest, one file per sim module, and `ui.test.tsx` for the UI.

## Rules for the code

- Chance comes from one seeded `Random`, handed in. No `Math.random`,
  no `Date.now` in the sim: the same seed replays the same game.
- Time is stepped: `game.step()` advances one fixed tick of simulated
  time. The wall clock never reaches the sim.
- Prices are integer cents and sizes integer shares: no float drift in
  money. Fair values are floats and are rounded at the book.
- Every list the sim keeps is bounded, and the bound is named beside it.
- Each concept the player meets has a glossary entry, and the UI links
  to it where the concept is used.

## Edge cases

For anything new, check what it does:

- **closed hours:** the books are empty, nothing fills, and a block sends nothing; skipping to the open lands
  the overnight news on the way.
- **one leg only:** an arbitrage whose far leg misses leaves a position; the block scratches its own.
- **capacity:** orders past the computer's limit are dropped and counted, never queued.
- **a tip:** real or made up, and the fine that may follow days later.
- **saved:** a save from the previous tick loads to the same future; another version is refused.
- **a slow firm:** latency of twenty ticks sees the past and arrives late; a colocated one is one tick.

## What is not held

- The economy's pacing is measured by the PACE harness over three seeds and tuned by hand; nothing holds
  it. A run of `PACE=1 PACE_MINUTES=20 npx vitest run test/pace.test.ts` takes about ten minutes.
- What each setup earned on 2026-11-02 with three exchanges, dollars a day over three seeds: home
  momentum 4,700; home arbitrage 900 (PACIFIC is down the road); city arbitrage -2,900 chasing every
  exchange and 900 limited to those within 10ms; colocated arbitrage 10,700; racks at two exchanges on
  microwave (the fastest rival) 15,600; the maker -4,000 to -7,000. The shop is sized to weeks of that.
- The market maker loses at every speed. When the crowd's belief moves it pulls its own stale quotes, and
  the maker's quote is left alone at the old price for the arbitrage bots to take within a tick. That is
  real adverse selection, and the block cannot outrun the fastest bot. It is left as the lesson it is;
  a rework would give the crowd queue priority or the maker a belief of its own.
- Latency below one tick (2ms) is one tick: a colocated firm and one a millisecond away are the same.
- No end-to-end browser test: the UI test is React Testing Library in jsdom. Looked at by hand in the
  browser pane, whose frames run slowly when it is not in front.
- No fuzzer and no invariants file yet.

## Plans

The agreed plan for the first slice is `plans/first-slice.md`.
