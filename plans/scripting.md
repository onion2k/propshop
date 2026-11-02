# The scripting block

State: building, part 1 of 2.

## Context

The block interface was built so a scripted strategy could stand where a built-in one does. This adds it:
the player writes a short JavaScript function body that runs on each decision with the same view the
built-in blocks get and a handful of helpers, and the game treats it as one more block. It is the feature
that makes the game a toy for people who already know some trading, and a way for the learner to write
down what they have understood.

## What is built

- **`src/sim/strategy/script.ts`.** `scriptBlock(source)` compiles a function body with `new Function`,
  once per distinct source, into a `StrategyBlock`. The body sees `view`, `now`, `symbols`, `exchanges`,
  `fees`, `news`, and helpers: `buy(symbol, exchange, price, size, ioc)`, `sell(...)`, `cancel(localId)`,
  `best(symbol)` (best bid and ask across exchanges, with where), `quote(exchange, symbol)`,
  `position(symbol)`, `mine(symbol)` (this block's own), `orders()`, `mids(symbol)`, `log(...)`. Every loop
  body gets a step budget, so a runaway loop throws instead of hanging the tab. `window`, `document`,
  `globalThis`, `fetch`, `localStorage` and `Math.random` are shadowed: the first for tidiness, the last
  because chance in a strategy would break the seed. A thrown error is caught, kept as the block's error,
  and the decision returns nothing. The block keeps a bounded log of what the script printed.
- **The firm runs it.** `BlockSetting` gains `source`, saved with the rest. `blockFor(setting)` returns the
  script block for the `script` id and the registry's block otherwise. The default blocks include `script`,
  off, with an example that does cross-exchange arbitrage in a dozen commented lines.
- **The snapshot** carries the script's error and log tail.
- **The strategy panel** shows the script block as an editor: a monospace textarea, an Apply button, the
  error if any, the log tail, and a short reference of the helpers. Applying sets the source on the block.

This is not a security sandbox: the script runs in the player's own tab, with their own save. What it
cannot do is hang the tab, reach the page, or break the seed.

## Parts

- [x] 1. The script block, `blockFor`, the example, and tests: intents, error, budget, shadowing, save.
- [x] 2. The panel's editor, with a UI test that applies a source and sees the block run it.

## Verification

`npm run check` green. In the browser, the example script enabled from home behaves as the arbitrage
block does; a script with a syntax error shows the error and trades nothing; a `while (true) {}` script
shows a budget error and the game goes on.
