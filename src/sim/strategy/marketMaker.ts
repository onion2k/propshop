// Market making: rest a bid under the market and an ask over it on every exchange, and earn the spread each
// time someone crosses to trade with you. The danger is inventory: when the price moves, one side keeps
// filling and you pile up stock that is now worth less than you paid. Skewing the quotes leans against that.

import type { Intent, MarketView, Params, StrategyBlock } from './types';

export const marketMaker: StrategyBlock = {
  spec: {
    id: 'marketMaker',
    name: 'Market maker',
    summary: 'Quote both sides and earn the spread from traders in a hurry.',
    explain:
      'A market maker is the one willing to trade with anybody right now, for a price: they bid a little under ' +
      'the midpoint and offer a little over it, and pocket the gap each time an impatient trader crosses to ' +
      'them. It earns steadily in a calm market. When the price moves, the quotes on the wrong side keep ' +
      'filling, and the maker ends up long a falling stock or short a rising one: inventory risk. The block ' +
      'skews its quotes away from the side it is already heavy on, and stops quoting that side at the limit. ' +
      'Resting orders pay no exchange fee: the taker pays, which is the maker\u2019s other edge.',
    params: [
      {
        key: 'halfSpread',
        name: 'Half spread',
        min: 1,
        max: 10,
        step: 1,
        default: 4,
        unit: '¢',
        explain:
          'How far from the midpoint each quote sits. Wider earns more per fill and fills less often, and is safer ' +
          'when you are slow: a tight quote you cannot pull in time is a gift to whoever is faster.',
      },
      {
        key: 'size',
        name: 'Quote size',
        min: 100,
        max: 1000,
        step: 100,
        default: 100,
        unit: 'shares',
        explain: 'Shares on each quote.',
      },
      {
        key: 'maxInventory',
        name: 'Max inventory',
        min: 100,
        max: 5000,
        step: 100,
        default: 500,
        unit: 'shares',
        explain: 'The most stock to hold, long or short. Quotes skew toward flat as you approach it.',
      },
    ],
  },

  decide(view: MarketView, p: Params): Intent[] {
    const out: Intent[] = [];
    const half = p.halfSpread ?? 2;
    const size = p.size ?? 100;
    const max = p.maxInventory ?? 500;
    for (const symbol of view.symbols) {
      const position = view.positions[symbol] ?? 0;
      // Lean the quotes away from the inventory, a full half spread at the limit.
      const skew = Math.round((-position / max) * half);
      for (const exchange of view.exchanges) {
        const q = view.quotes[exchange]?.[symbol];
        if (!q || q.bid === null || q.ask === null) continue;
        const mid = (q.bid + q.ask) / 2;
        const wantBid = position < max ? Math.floor(mid - half + skew) : null;
        const wantAsk = position > -max ? Math.ceil(mid + half + skew) : null;
        const mine = view.openOrders.filter(
          (o) => o.symbol === symbol && o.exchange === exchange && o.block === this.spec.id && o.status !== 'filled',
        );
        for (const side of ['buy', 'sell'] as const) {
          const want = side === 'buy' ? wantBid : wantAsk;
          const have = mine.filter((o) => o.side === side);
          const keep = have.find((o) => want !== null && Math.abs(o.price - want) <= 1 && o.status !== 'cancelling');
          for (const o of have) {
            if (o !== keep && o.status === 'resting') out.push({ kind: 'cancel', localId: o.localId });
          }
          const busy = have.some((o) => o.status === 'inflight' || o.status === 'cancelling');
          if (want !== null && !keep && !busy && want > 0) {
            out.push({ kind: 'order', symbol, exchange, side, price: want, size, ioc: false });
          }
        }
      }
    }
    return out;
  },
};
