// Put-call parity: a call less a put on one strike is worth the underlying less the strike brought back to today, and
// the index future, brought back by its own carry, stands for the underlying. When the books disagree by more than the
// fees, trade the three legs at once: a conversion (sell the call, buy the put, buy the future) when the options are
// dear, a reversal (the opposite) when they are cheap. The legs net out at expiry, so the gap is held to it. Three
// legs are three races: a leg that misses leaves a position, and the block puts the rest back at once.

import { MS_PER_MINUTE, MS_PER_YEAR } from '../clock';
import { futuresOn } from './optionsView';
import {
  bestAcross,
  carryFactor,
  flattenTo,
  ownPosition,
  type Intent,
  type MarketView,
  type Params,
  type StrategyBlock,
} from './types';

/** No set is opened in an option's last minutes: its books thin out and the gap is only the close's jitter. */
const LAST_MINUTES = 5 * MS_PER_MINUTE;

/** One strike of one expiry: its call and its put, and what the block holds in them. */
interface Strike {
  expiry: number;
  strike: number;
  underlying: string;
  call: string | null;
  put: string | null;
}

export const parity: StrategyBlock = {
  spec: {
    id: 'parity',
    name: 'Put-call parity',
    summary:
      'Trade a call, a put and the future together when the call less the put is off the future less the strike.',
    explain:
      'Buy a call and sell a put at one strike and you hold the index, for the strike, at expiry: the same as ' +
      'owning the future. So the call less the put should be the index less the strike brought back to today, ' +
      'and the index is the future less its carry. When the options’ books are dearer than that, by more than ' +
      'the fees and a threshold, sell the call, buy the put and buy the future (a conversion); when cheaper, ' +
      'the reverse (a reversal). Whatever the index does at expiry the three legs cancel, so the gap, less the ' +
      'cost of crossing three books, is the profit; it is held to the expiry, where the options settle in cash ' +
      'and the future is closed. It is rare, because the maker’s books are priced from one model, and small: it shows ' +
      'in the first moments of a session, while the books settle at different instants. ' +
      'Three legs are three races: if one misses, what filled is put back at once, which costs the spread.',
    params: [
      {
        key: 'threshold',
        name: 'Minimum edge',
        min: 0.1,
        max: 10,
        step: 0.1,
        default: 1,
        unit: '¢/index unit',
        explain: 'How far the call less the put must be from the future less the strike, per index unit, after fees.',
      },
      {
        key: 'contracts',
        name: 'Contracts',
        min: 1,
        max: 20,
        step: 1,
        default: 1,
        unit: 'contracts',
        explain: 'Sets a trade: that many calls, puts and futures.',
      },
      {
        key: 'maxContracts',
        name: 'Most held',
        min: 1,
        max: 50,
        step: 1,
        default: 5,
        unit: 'contracts',
        explain: 'The most sets to hold at once; no more are opened beyond it.',
      },
    ],
  },

  decide(view: MarketView, p: Params): Intent[] {
    const options = view.options;
    if (!options) return [];
    const id = this.spec.id;
    // Orders still in flight settle first: what is held is not yet what it will be.
    if (view.openOrders.some((o) => o.block === id && (o.status === 'inflight' || o.status === 'cancelling')))
      return [];
    const strikes = new Map<string, Strike>();
    for (const [symbol, c] of Object.entries(options.chain)) {
      if (!view.symbols.includes(symbol)) continue;
      const key = `${c.expiry}|${c.strike}`;
      const s = strikes.get(key) ?? {
        expiry: c.expiry,
        strike: c.strike,
        underlying: c.underlying,
        call: null,
        put: null,
      };
      if (c.right === 'call') s.call = symbol;
      else s.put = symbol;
      strikes.set(key, s);
    }
    const underlying = Object.values(options.chain)[0]?.underlying;
    if (underlying === undefined) return [];
    const futures = futuresOn(view, underlying);
    const heldFutures = futures.filter(([s]) => ownPosition(view, id, s) !== 0);
    const f = futures.reduce((n, [s]) => n + ownPosition(view, id, s), 0);

    // What is held, set by set: a conversion is a short call with a long put, a reversal the opposite.
    const held = [...strikes.values()].map((s) => {
      const c = s.call ? ownPosition(view, id, s.call) : 0;
      const q = s.put ? ownPosition(view, id, s.put) : 0;
      const sets = c < 0 && q > 0 ? Math.min(-c, q) : c > 0 && q < 0 ? -Math.min(c, -q) : 0;
      return { s, c, q, sets };
    });
    // The future must match: too much long future cuts reversals back, too much short future cuts conversions.
    let d = f - held.reduce((n, h) => n + h.sets, 0);
    for (const h of held) {
      if (d > 0 && h.sets < 0) {
        const cut = Math.min(-h.sets, d);
        h.sets += cut;
        d -= cut;
      } else if (d < 0 && h.sets > 0) {
        const cut = Math.min(h.sets, -d);
        h.sets -= cut;
        d += cut;
      }
    }
    const out: Intent[] = [];
    for (const h of held) {
      if (h.s.call && h.c !== -h.sets) {
        const i = flattenTo(view, h.s.call, h.c, -h.sets);
        if (i) out.push(i);
      }
      if (h.s.put && h.q !== h.sets) {
        const i = flattenTo(view, h.s.put, h.q, h.sets);
        if (i) out.push(i);
      }
    }
    // A leg that missed leaves its future (or, with none, the extra of one) on its own: it goes back.
    const wantFuture = held.reduce((n, h) => n + h.sets, 0);
    if (f !== wantFuture) {
      const [symbol] = heldFutures[0] ?? futures[0] ?? [null];
      if (symbol) {
        const i = flattenTo(
          view,
          symbol,
          ownPosition(view, id, symbol),
          ownPosition(view, id, symbol) - (f - wantFuture),
        );
        if (i) out.push(i);
      }
    }
    if (out.length > 0) return out;

    // Everything held is whole. Open another set if a strike's books are far enough from the future.
    const total = held.reduce((n, h) => n + Math.abs(h.sets), 0);
    const room = Math.min(p.contracts ?? 1, (p.maxContracts ?? 5) - total);
    if (room < 1) return out;
    const direction = held.reduce((n, h) => n + h.sets, 0);
    const threshold = p.threshold ?? 1;
    let best: { gap: number; legs: Intent[] } | null = null;
    for (const s of strikes.values()) {
      if (!s.call || !s.put || s.expiry - view.now < LAST_MINUTES) continue;
      const fut = futuresOn(view, s.underlying, s.expiry)[0];
      if (!fut) continue;
      const [futSymbol, contract] = fut;
      const call = bestAcross(view, s.call);
      const put = bestAcross(view, s.put);
      const future = bestAcross(view, futSymbol);
      if (!call.bid || !call.ask || !put.bid || !put.ask || !future.bid || !future.ask) continue;
      const k = carryFactor(contract, view.now);
      const strikeNow = s.strike * Math.exp((-options.rate * (s.expiry - view.now)) / MS_PER_YEAR);
      // Fees in index points: a contract's fee is in cents, a contract stands for its multiplier of units.
      const optionMultiplier = options.chain[s.call]!.multiplier;
      const fees =
        ((view.fees[call.bid.exchange] ?? 0) + (view.fees[put.ask.exchange] ?? 0)) / optionMultiplier +
        (view.fees[future.ask.exchange] ?? 0) / contract.multiplier;
      const sizeOf = (...sizes: number[]) => Math.min(room, ...sizes);
      const conversion = call.bid.price - put.ask.price - (future.ask.price / k - strikeNow) - fees;
      const reversal = future.bid.price / k - strikeNow - (call.ask.price - put.bid.price) - fees;
      if (conversion >= threshold && direction >= 0 && (best === null || conversion > best.gap)) {
        const n = sizeOf(call.bid.size, put.ask.size, future.ask.size);
        best = {
          gap: conversion,
          legs: [
            order(s.call, call.bid.exchange, 'sell', call.bid.price, n),
            order(s.put, put.ask.exchange, 'buy', put.ask.price, n),
            order(futSymbol, future.ask.exchange, 'buy', future.ask.price, n),
          ],
        };
      } else if (reversal >= threshold && direction <= 0 && (best === null || reversal > best.gap)) {
        const n = sizeOf(call.ask.size, put.bid.size, future.bid.size);
        best = {
          gap: reversal,
          legs: [
            order(s.call, call.ask.exchange, 'buy', call.ask.price, n),
            order(s.put, put.bid.exchange, 'sell', put.bid.price, n),
            order(futSymbol, future.bid.exchange, 'sell', future.bid.price, n),
          ],
        };
      }
    }
    return best ? best.legs : out;
  },
};

function order(symbol: string, exchange: string, side: 'buy' | 'sell', price: number, size: number): Intent {
  return { kind: 'order', symbol, exchange, side, price, size, ioc: true };
}
