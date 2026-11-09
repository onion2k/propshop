// Carry: each night at 17:00 a currency position is paid the interest of the currency it holds and charged the
// interest of the one it owes. Hold the pair whose two rates are furthest apart, the right way round, and be paid
// for waiting; the risk is that the price moves against you by more than the nights pay, so it gets out at a stop.

import {
  bestAcross,
  flattenTo,
  inFlight,
  ownPosition,
  rolloverYield,
  type Fill,
  type Intent,
  type MarketView,
  type Params,
  type StrategyBlock,
} from './types';

const HOUR = 60 * 60 * 1000;

/** The pair and side whose rollover pays most a year, after the venue's spread; null where none pays. */
function best(view: MarketView): { symbol: string; sign: 1 | -1 } | null {
  let out: { symbol: string; sign: 1 | -1; pays: number } | null = null;
  for (const symbol of Object.keys(view.pairs ?? {})) {
    if (!view.symbols.includes(symbol)) continue;
    for (const [side, sign] of [
      ['buy', 1],
      ['sell', -1],
    ] as const) {
      const pays = rolloverYield(view, symbol, side);
      if (pays !== null && pays > 0 && (out === null || pays > out.pays)) out = { symbol, sign, pays };
    }
  }
  return out;
}

/** When the block last filled in the pair, of the fills still in the log; -Infinity where none is. */
function lastFill(fills: readonly Fill[], block: string, symbol: string): number {
  for (let i = fills.length - 1; i >= 0; i--) {
    const f = fills[i]!;
    if (f.block === block && f.symbol === symbol) return f.at;
  }
  return -Infinity;
}

export const carry: StrategyBlock = {
  spec: {
    id: 'carry',
    name: 'Carry',
    summary: 'Hold the pair whose rollover pays most, through 17:00, out at a stop.',
    explain:
      'Every weekday at 17:00 a currency position is rolled to the next day: it is paid a day’s interest on the ' +
      'currency it holds and charged a day’s interest on the one it owes, less a little the venue keeps. ' +
      'Wednesday pays three days, for the weekend. Where one rate is well above the other, holding the pair the ' +
      'right way round is paid for every night it is held. The block holds a set size of whichever pair pays most, ' +
      'long or short as the rates say, and waits. A night’s pay is a few pips; a bad hour is many, so it gets out ' +
      'when the price has gone against what it paid by its stop, and waits a while before going back in.',
    params: [
      {
        key: 'lots',
        name: 'Size',
        min: 1,
        max: 100,
        step: 1,
        default: 10,
        unit: 'lots',
        explain: 'Lots to hold, each a thousand of the pair’s first currency.',
      },
      {
        key: 'stop',
        name: 'Stop',
        min: 5,
        max: 200,
        step: 5,
        default: 50,
        unit: 'pips',
        explain: 'How far the price may go against what the block paid before it gets out.',
      },
      {
        key: 'wait',
        name: 'Wait after a stop',
        min: 0,
        max: 24,
        step: 1,
        default: 1,
        unit: 'hours',
        explain: 'How long to stay out after the stop, before holding the pair again.',
      },
    ],
  },

  decide(view: MarketView, p: Params): Intent[] {
    const lots = p.lots ?? 10;
    const stop = p.stop ?? 50;
    const wait = (p.wait ?? 1) * HOUR;
    const id = this.spec.id;
    const target = best(view);
    const out: Intent[] = [];
    for (const symbol of Object.keys(view.pairs ?? {})) {
      if (!view.symbols.includes(symbol) || inFlight(view, symbol, id)) continue;
      const position = ownPosition(view, id, symbol);
      const want = target?.symbol === symbol ? target.sign * lots : 0;
      if (position !== 0 && Math.sign(position) === Math.sign(want)) {
        // Held the right way: out at the stop, else held, through the rollover and on.
        // What it paid, kept by the firm a block at a time: the fill log is too short to find it in.
        const paid = view.blockCosts?.[id]?.[symbol] ?? null;
        const { bid, ask } = bestAcross(view, symbol);
        const against =
          paid === null ? null : position > 0 ? (bid ? paid - bid.price : null) : ask ? ask.price - paid : null;
        if (against !== null && against >= stop) {
          const intent = flattenTo(view, symbol, position, 0);
          if (intent) out.push(intent);
          continue;
        }
        if (Math.abs(position) >= Math.abs(want)) continue;
      }
      if (position === 0 && want !== 0) {
        // Out after a stop: wait before going back in.
        if (lastFill(view.recentFills, id, symbol) > view.now - wait) continue;
      }
      const intent = flattenTo(view, symbol, position, want);
      if (intent) out.push(intent);
    }
    return out;
  },
};
