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
  the two together and runs the sim loop; `src/ui/Root.tsx` shows the cover
  first, with the sim held, and `App` once the player starts.
- `art/` is source pictures; what the page serves is the WebP beside
  `src/main.tsx`.
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
- What each setup earned on 2026-11-02 on the twelve-stock universe, dollars a day over three seeds: home
  momentum 2,200; home arbitrage about nought; colocated arbitrage 6,900; the fastest rival 11,000; the
  colocated maker 3,300 at two cents and 38,000 joining the touch on every book; pairs 600 colocated; mean
  reversion -4,000 to -10,000; index arbitrage fires a few hundred times an hour from a rack and loses about
  a thousand on scratched legs.
- From home the laptop runs one block and only momentum earns, so the first rung of the shop (city office,
  leased fibre, server) is priced at 18,000 together: about a week of momentum, so the first latency lesson
  comes early. Colocation and the links keep their weight. Measured on 2026-11-04 from the city, dollars a
  day over three seeds: momentum 2,600; the maker 1,900; arbitrage -400, and 200 held to gaps within ten
  milliseconds; arbitrage with the maker 1,300. The city teaches that a few miles is not colocation.
- The market maker is near break-even and lives by the day's regime: about -900 dollars a day over three
  seeds at home and colocated, with a calm day positive and a trending day not. It reads the book without
  its own orders in it (`touchExcluding`); what it still cannot beat is the fastest bot taking a quote in
  the tick before its cancel lands.
- Latency below one tick (2ms) is one tick: a colocated firm and one a millisecond away are the same.
- Hand trading is a measured loser, as the desk is meant to show. One seed, twenty minutes, dollars a day: a
  person at the desk sending momentum's calls as 2,000-share market orders from home loses about 23,000, and
  65,000 to 134,000 at 5,000 shares; Harbor Quant earns 8,000 to 11,000 more a day while a 2,000-share hand is
  sweeping, because the sweep opens gaps that the arbitrage firms race for. The crowd's visible top is mostly
  2,000 shares or more, so a 2,000-share order fits one exchange and only 5,000 sweeps.
- Chasing a sweep's print (`anticipate`) loses here, however it is cut: -27,000 to -165,000 a day across five
  designs, and the rival Shadow Trading runs the jump alone, near nought. The first child's print comes from
  PACIFIC, whose data takes 15 ms to reach even racks at every exchange; a slow trader's children spread over
  about 20 ms; and with a cleared-level trigger and a one-tick FPGA the chaser was still second in 32 of 43
  races. The jump on a large single resting order (`largest` in the depth) is about break-even.
- The lab's batch auction batches the firms' orders and not the crowd's, so a waiting order meets a market
  that has moved; every firm loses under it, the fastest most. A real batch auction would hold the crowd too.
- The crowd acts on each book once in five ticks, staggered. Every book is swept on its turn: a sweep keyed
  to the exchange's clock once left four books in five never swept, and everything fed on them.
- The sim gets at most 8 ms of each frame (`BUDGET_MS` in the store); what does not fit is dropped, not owed,
  and the top bar says the speed reached when it falls short. Measured headless with the CPU throttled four
  times, about a mid-range phone: 1× and 10× hold 60 frames a second; 60× and 300× hold about 49, with the sim
  reaching 20×. Before the budget they ran at one frame a second with 800 ms stalls. A worker would lift the
  ceiling; the sim's one surface is the seam for it.
- No end-to-end browser test: the UI test is React Testing Library in jsdom. Looked at by hand in the
  browser pane, whose frames run slowly when it is not in front.
- No fuzzer and no invariants file yet.

## Plans

The agreed plan for the first slice is `plans/first-slice.md`.
