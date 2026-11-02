// The scripting block: a JavaScript function body the player writes, run on each decision with the same view
// the built-in blocks get and a few helpers. Compiled once per distinct source. A loop budget keeps a runaway
// script from hanging the tab, and chance is shadowed so a script cannot break the seed. It is not a security
// sandbox: the script runs in the player's own tab, on their own save, and that is its own business.

import { bestAcross, ownPosition, type Intent, type MarketView, type Params, type StrategyBlock } from './types';

export const SCRIPT_ID = 'script';
/** Loop iterations one decision may spend before the script is stopped. */
export const STEP_BUDGET = 20_000;
const LOG_LENGTH = 50;

export interface ScriptState {
  error: string | null;
  log: string[];
}

export const EXAMPLE_SOURCE = `// Your strategy, run on every decision. See the reference below the editor.
// This one is cross-exchange arbitrage: buy where it is cheaper, sell where it is dearer.
const minEdge = 0.3; // cents a share, after both fees
const size = 200;

for (const symbol of symbols) {
  // One shot in flight at a time: an order on its way is a decision already made.
  if (orders().some((o) => o.symbol === symbol)) continue;
  if (mine(symbol) !== 0) {
    // A leg was left over from a race lost: get flat at the best price we can see.
    const b = best(symbol);
    if (mine(symbol) > 0 && b.bid) sell(symbol, b.bid.exchange, b.bid.price, mine(symbol));
    if (mine(symbol) < 0 && b.ask) buy(symbol, b.ask.exchange, b.ask.price, -mine(symbol));
    continue;
  }
  const b = best(symbol);
  if (!b.bid || !b.ask || b.bid.exchange === b.ask.exchange) continue;
  const edge = b.bid.price - b.ask.price - fees[b.bid.exchange] - fees[b.ask.exchange];
  if (edge < minEdge) continue;
  const n = Math.min(size, b.bid.size, b.ask.size);
  buy(symbol, b.ask.exchange, b.ask.price, n);
  sell(symbol, b.bid.exchange, b.bid.price, n);
  log('gap of', edge.toFixed(2), 'cents on', symbol);
}
`;

type Compiled = { run: (view: MarketView, out: Intent[], state: ScriptState, budget: { left: number }) => void };

const compiled = new Map<string, Compiled | { error: string }>();
const states = new Map<string, ScriptState>();

/** What the script printed and whether it threw, by source. */
export function scriptState(source: string): ScriptState {
  let s = states.get(source);
  if (!s) {
    s = { error: null, log: [] };
    states.set(source, s);
  }
  return s;
}

/** Every loop body gets a line that spends the budget, so `while (true) {}` ends with an error, not a hang. */
export function instrument(source: string): string {
  const spend = "if (--__budget.left < 0) throw new Error('Step budget spent: a loop ran too long.');";
  return source
    .replace(/\b(for|while)\s*\(([^{}]*?)\)\s*\{/g, (m) => `${m}${spend}`)
    .replace(/\bdo\s*\{/g, (m) => `${m}${spend}`);
}

function compile(source: string): Compiled | { error: string } {
  const cached = compiled.get(source);
  if (cached) return cached;
  let result: Compiled | { error: string };
  try {
    // Names a script must not reach are shadowed as parameters; Math is a copy whose random throws. The
    // Function constructor is the point here: the player's own code, in their own tab, is what runs.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function(
      'view',
      '__out',
      '__state',
      '__budget',
      '__best',
      '__mine',
      'window',
      'document',
      'globalThis',
      'self',
      'fetch',
      'localStorage',
      'XMLHttpRequest',
      'Math',
      `"use strict";
const now = view.now, symbols = view.symbols, exchanges = view.exchanges, fees = view.fees, news = view.news;
const quote = (exchange, symbol) => view.quotes[exchange]?.[symbol] ?? null;
const best = (symbol) => __best(view, symbol);
const position = (symbol) => view.positions[symbol] ?? 0;
const mine = (symbol) => __mine(view, symbol);
const orders = () => view.openOrders.filter((o) => o.block === '${SCRIPT_ID}');
const mids = (symbol) => view.mids[symbol] ?? [];
const buy = (symbol, exchange, price, size, ioc = true) => __out.push({ kind: 'order', symbol, exchange, side: 'buy', price: Math.round(price), size: Math.floor(size), ioc });
const sell = (symbol, exchange, price, size, ioc = true) => __out.push({ kind: 'order', symbol, exchange, side: 'sell', price: Math.round(price), size: Math.floor(size), ioc });
const cancel = (localId) => __out.push({ kind: 'cancel', localId });
const log = (...parts) => { __state.log.push(parts.map((p) => (typeof p === 'object' ? JSON.stringify(p) : String(p))).join(' ')); if (__state.log.length > ${LOG_LENGTH}) __state.log.splice(0, __state.log.length - ${LOG_LENGTH}); };
${instrument(source)}
`,
    ) as (...args: unknown[]) => void;
    const safeMath = Object.freeze({
      ...Object.getOwnPropertyNames(Math).reduce<Record<string, unknown>>((m, k) => {
        m[k] = (Math as unknown as Record<string, unknown>)[k];
        return m;
      }, {}),
      random: () => {
        throw new Error('Math.random is not allowed: a strategy must give the same answer to the same market.');
      },
    });
    result = {
      run: (view, out, state, budget) => {
        fn(
          view,
          out,
          state,
          budget,
          best,
          mine,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          safeMath,
        );
      },
    };
  } catch (e) {
    result = { error: e instanceof Error ? e.message : String(e) };
  }
  compiled.set(source, result);
  return result;
}

// The helpers are handed in by name: the compiled function has no closure over this module.
const best = (view: MarketView, symbol: string) => bestAcross(view, symbol);
const mine = (view: MarketView, symbol: string) => ownPosition(view, SCRIPT_ID, symbol);

export function scriptBlock(source: string): StrategyBlock {
  return {
    spec: {
      id: SCRIPT_ID,
      name: 'Your script',
      summary: 'A strategy you write, in JavaScript, run on every decision.',
      explain:
        'The same view the built-in blocks get, and a few helpers to send orders. It runs once per decision, ' +
        'as often as your computer allows, and counts as one block. A loop that runs too long is stopped; ' +
        'an error is shown and that decision sends nothing. It cannot use chance: the same market must get ' +
        'the same answer, so a game can be replayed from its seed.',
      params: [],
    },
    decide(view: MarketView, _params: Params): Intent[] {
      const state = scriptState(source);
      const c = compile(source);
      if ('error' in c) {
        state.error = c.error;
        return [];
      }
      const out: Intent[] = [];
      try {
        c.run(view, out, state, { left: STEP_BUDGET });
        state.error = null;
      } catch (e) {
        state.error = e instanceof Error ? e.message : String(e);
        return [];
      }
      return out.filter(valid);
    },
  };
}

function valid(i: Intent): boolean {
  if (i.kind === 'cancel') return Number.isInteger(i.localId);
  return (
    typeof i.symbol === 'string' &&
    typeof i.exchange === 'string' &&
    Number.isInteger(i.price) &&
    i.price > 0 &&
    Number.isInteger(i.size) &&
    i.size > 0
  );
}
