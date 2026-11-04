// Market making: rest a bid under the market and an ask over it on every exchange, and earn the spread each
// time someone crosses to trade with you. The danger is inventory: when the price moves, one side keeps
// filling and you pile up stock that is now worth less than you paid. Skewing the quotes leans against that.

import {
  flattenTo,
  inFlight,
  ownPosition,
  touchExcluding,
  type Intent,
  type MarketView,
  type Params,
  type StrategyBlock,
} from './types';

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
      'skews its quotes away from the side it is already heavy on, and at the limit pays the spread to cut it. ' +
      'Its quotes are post-only: one that would cross is refused, so it never pays the taker fee by accident. ' +
      'Resting orders pay no exchange fee: the taker pays, which is the maker\u2019s other edge. Its enemy is ' +
      'adverse selection: a quote left behind when the price moves is taken by whoever is fastest, and in ' +
      'this market somebody is always faster than you. It also fades: after a large trade on one exchange it ' +
      'pulls the quote on the side that trade hit, on the others, for a moment (order anticipation).',
    params: [
      {
        key: 'halfSpread',
        name: 'Half spread',
        min: 0,
        max: 10,
        step: 1,
        default: 4,
        unit: '¢',
        explain:
          'How far behind the touch each quote sits. At zero it joins the best bid and ask and earns the spread ' +
          'from the traders who cross it; further back it fills only when the price has come to it, which is ' +
          'usually because the price is on its way somewhere else.',
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
        key: 'tolerance',
        name: 'Requote when off by',
        min: 1,
        max: 6,
        step: 1,
        default: 4,
        unit: '¢',
        explain:
          'A resting quote is left alone until the midpoint has moved this far from it. Lower keeps the quotes ' +
          'tighter to the market and sends many more orders, which a small computer cannot keep up with.',
      },
      {
        key: 'newsPause',
        name: 'Step away on news for',
        min: 0,
        max: 120,
        step: 5,
        default: 30,
        unit: 's',
        explain:
          'After a headline names a stock, pull its quotes and stay out this long. While the news is being priced ' +
          'in, a resting quote is a gift to whoever read the headline faster.',
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
      {
        key: 'bigPrint',
        name: 'Fade a print of',
        min: 500,
        max: 10_000,
        step: 100,
        default: 1500,
        unit: 'shares',
        explain:
          'A trade this large on another exchange is a sweep that will reach this one next. The quote on the ' +
          'side it hits is pulled before it arrives, and put back a moment later.',
      },
      {
        key: 'fadeFor',
        name: 'Stay out after a print for',
        min: 0,
        max: 1000,
        step: 10,
        default: 100,
        unit: 'ms',
        explain: 'How long the quote stays off after the print is seen. At zero the maker never fades.',
      },
    ],
  },

  decide(view: MarketView, p: Params): Intent[] {
    const out: Intent[] = [];
    const half = p.halfSpread ?? 2;
    const size = p.size ?? 100;
    const max = p.maxInventory ?? 500;
    const tolerance = p.tolerance ?? 2;
    const pause = (p.newsPause ?? 30) * 1000;
    const bigPrint = p.bigPrint ?? 1500;
    const fadeFor = p.fadeFor ?? 100;
    for (const symbol of view.symbols) {
      const position = ownPosition(view, this.spec.id, symbol);
      // Lean the quotes away from the inventory, a full half spread (at least a cent) at the limit.
      const skew = Math.round((-position / max) * Math.max(1, half));
      // At the limit, stop leaning and get out: pay the spread to cut the inventory to half, which is what
      // bounds the loss when the price keeps going.
      if (Math.abs(position) >= max && !inFlight(view, symbol, this.spec.id)) {
        const cut = flattenTo(view, symbol, position, Math.trunc(position / 2));
        if (cut) out.push(cut);
      }
      const onNews = pause > 0 && view.news.some((h) => h.symbols.includes(symbol) && view.now - h.at < pause);
      // Quote off every exchange at once, with this block's own orders taken out of each book: the one that has
      // moved is the one that knows, and a maker's own stale quote must never anchor its idea of the price.
      const mids: number[] = [];
      for (const exchange of view.exchanges) {
        const t = touchExcluding(view, exchange, symbol, this.spec.id);
        if (t && t.bid !== null && t.ask !== null) mids.push((t.bid + t.ask) / 2);
      }
      if (mids.length === 0) continue;
      const mid = mids.reduce((a, b) => a + b, 0) / mids.length;
      for (const exchange of view.exchanges) {
        const q = view.quotes[exchange]?.[symbol];
        if (!q || q.bid === null || q.ask === null) continue;
        // A big sell on another exchange is about to hit the bids here; a big buy, the offers. Read the tape
        // only when fading is on: it is built on first look.
        let fadeBid = false;
        let fadeAsk = false;
        if (fadeFor > 0) {
          for (const other of view.exchanges) {
            if (other === exchange) continue;
            for (const t of view.tape[other]?.[symbol] ?? []) {
              // The print reached the firm after the data latency; the fade runs from when it was seen.
              if (t.size < bigPrint || view.now - t.at - (view.latency[other] ?? 0) > fadeFor) continue;
              if (t.aggressor === 'sell') fadeBid = true;
              else fadeAsk = true;
            }
          }
        }
        const wantBid = position < max && !onNews && !fadeBid ? Math.floor(mid - half + skew) : null;
        const wantAsk = position > -max && !onNews && !fadeAsk ? Math.ceil(mid + half + skew) : null;
        const mine = view.openOrders.filter(
          (o) => o.symbol === symbol && o.exchange === exchange && o.block === this.spec.id && o.status !== 'filled',
        );
        for (const side of ['buy', 'sell'] as const) {
          const want = side === 'buy' ? wantBid : wantAsk;
          const have = mine.filter((o) => o.side === side);
          const keep = have.find(
            (o) => want !== null && Math.abs(o.price - want) <= tolerance && o.status !== 'cancelling',
          );
          for (const o of have) {
            if (o !== keep && o.status === 'resting') out.push({ kind: 'cancel', localId: o.localId });
          }
          const busy = have.some((o) => o.status === 'inflight' || o.status === 'cancelling');
          if (want !== null && !keep && !busy && want > 0) {
            // Post-only: a quote into a market that has moved through it is refused, never filled as a taker.
            out.push({ kind: 'order', symbol, exchange, side, price: want, size, ioc: false, postOnly: true });
          }
        }
      }
    }
    return out;
  },
};
