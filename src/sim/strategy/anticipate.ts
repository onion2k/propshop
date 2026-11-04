// Order anticipation: the market tells you what is about to happen, to anyone fast enough to read it. A trade
// far larger than the crowd's is a sweep still on its way to the other exchanges; a resting order far larger
// than the crowd's is a wall that will hold the price for whoever stands just in front of it. Neither needs a
// forecast. The block holds no state: what it holds, what it has sent and what it last filled are all in the view.

import {
  bestAcross,
  flattenTo,
  inFlight,
  ownPosition,
  type Intent,
  type MarketView,
  type OpenOrder,
  type Params,
  type SeenPrint,
  type StrategyBlock,
} from './types';

const NONE: readonly OpenOrder[] = [];
const NONE_SET: Set<number> = new Set();
const NO_BEST = { bid: null, ask: null };

/** How far behind a fill, in cents, a resting level still counts as the big order a jump was made in front of. */
const BEHIND = 3;

/** The newest qualifying print on the symbol across exchanges, with where it printed. */
function newestBig(view: MarketView, symbol: string, bigPrint: number, since: number) {
  let found: { exchange: string; trade: SeenPrint } | null = null;
  for (const exchange of view.exchanges) {
    const tape = view.tape[exchange]?.[symbol] ?? [];
    // Newest first, and no further back than the caller cares about: this runs for every stock every tick.
    for (let i = tape.length - 1; i >= 0; i--) {
      const trade = tape[i]!;
      if (trade.at < since) break;
      if (!trade.cleared || trade.size < bigPrint) continue;
      if (!found || trade.at > found.trade.at) found = { exchange, trade };
      break;
    }
  }
  return found;
}

export const anticipate: StrategyBlock = {
  spec: {
    id: 'anticipate',
    name: 'Order anticipation',
    summary: 'Trade ahead of a large order the tape or the book has given away.',
    explain:
      'Two ways to profit from someone else’s size. Chase the print: a trade much bigger than the crowd ' +
      'ever sends is usually a sweep, one order split across the exchanges and still arriving. Buy on the ' +
      'other exchanges before it gets there and offer the shares back a cent dearer; the slow order fills its ' +
      'first slice at the price it saw and the rest against you. Jump the big order: a resting order much ' +
      'bigger than the crowd’s sits at the touch like a wall, and a quote a cent in front of it fills only ' +
      'when the price is coming through; if the price goes your way you keep the shares, and if it goes against ' +
      'you, you sell into the wall for a cent’s loss. Neither is illegal and neither is kind: the large ' +
      'order paid for being visible. Speed decides who gets there first, and a person at a keyboard never does.',
    params: [
      {
        key: 'bigPrint',
        name: 'Smallest sweep child',
        min: 500,
        max: 10_000,
        step: 100,
        default: 1500,
        unit: 'shares',
        explain:
          'The signature of a routed sweep is a child that takes a whole level: each is sized to the top of its ' +
          'exchange, so it clears it exactly, which the crowd\u2019s takes almost never do. This size floor only ' +
          'keeps out the crowd\u2019s small clears. Act on the first child\u2019s print, not the biggest: the big ' +
          'one lands last, on the slowest exchange, when the race is already over. Measured here, the chase loses: the first child\u2019s print comes from ' +
          'the nearest exchange, whose data takes 15 ms to reach even a firm with racks everywhere, while a slow ' +
          'trader\u2019s children are spread over only about 20 ms, and the books are thick enough that most ' +
          'orders fit on one exchange. The arbitrage firms earn from a sweep, because they race the gap it ' +
          'opens and not the print.',
      },
      {
        key: 'fresh',
        name: 'Chase prints younger than',
        min: 10,
        max: 1000,
        step: 10,
        default: 100,
        unit: 'ms',
        explain:
          'A print older than this is no longer news: the rest of the sweep has landed or the quotes have moved. ' +
          'Each print is chased once; this stops it being chased again while it is still on the tape.',
      },
      {
        key: 'quiet',
        name: 'Flatten after quiet for',
        min: 0.5,
        max: 30,
        step: 0.5,
        default: 2,
        unit: 's',
        explain:
          'Shares bought ahead of a sweep are sold once no big print has come for this long, since whatever ' +
          'was pushing the price has finished.',
      },
      {
        key: 'maxPosition',
        name: 'Max position',
        min: 500,
        max: 20_000,
        step: 500,
        default: 5000,
        unit: 'shares',
        explain: 'Stop chasing when the block already holds this much, long or short, in a stock.',
      },
      {
        key: 'bigOrder',
        name: 'Big resting order',
        min: 500,
        max: 10_000,
        step: 100,
        default: 1500,
        unit: 'shares',
        explain:
          'A resting level this large or larger, at the touch or a tick inside it, is a wall worth standing ' +
          'in front of.',
      },
      {
        key: 'jumpSize',
        name: 'Jump size',
        min: 100,
        max: 2000,
        step: 100,
        default: 300,
        unit: 'shares',
        explain: 'Shares to quote a cent in front of the big order.',
      },
      {
        key: 'exitMove',
        name: 'Cut the loss at',
        min: 1,
        max: 10,
        step: 1,
        default: 2,
        unit: '¢',
        explain:
          'When the midpoint has moved this far against the last fill, sell into the big order behind. It is ' +
          'a cent behind the fill, so the loss is about a cent a share.',
      },
      {
        key: 'chasePatience',
        name: 'Wait for the offer back',
        min: 50,
        max: 5000,
        step: 50,
        default: 300,
        unit: 'ms',
        explain:
          'The offer back is left this long for the slow order to arrive and lift it, about a person\u2019s ' +
          'click from home. After that it is cancelled and the shares are sold at the touch.',
      },
      {
        key: 'patience',
        name: 'Give up a quote after',
        min: 1,
        max: 60,
        step: 1,
        default: 5,
        unit: 's',
        explain: 'A resting quote this old is pulled: the wall it was for has probably gone.',
      },
    ],
  },

  decide(view: MarketView, p: Params): Intent[] {
    const out: Intent[] = [];
    const id = this.spec.id;
    const bigPrint = p.bigPrint ?? 1500;
    const fresh = p.fresh ?? 100;
    const quiet = (p.quiet ?? 2) * 1000;
    const maxPosition = p.maxPosition ?? 5000;
    const bigOrder = p.bigOrder ?? 1500;
    const jumpSize = p.jumpSize ?? 300;
    const exitMove = p.exitMove ?? 2;
    const patience = (p.patience ?? 5) * 1000;
    const chasePatience = p.chasePatience ?? 300;
    const idle = view.openOrders.length === 0;
    for (const symbol of view.symbols) {
      // This runs for every stock every tick on the fastest computer: skip the allocations when idle.
      const mine = idle ? NONE : view.openOrders.filter((o) => o.block === id && o.symbol === symbol);
      const pulled = mine.length > 0 ? new Set<number>() : NONE_SET;
      // Quotes that have waited too long come off, whatever they were for.
      for (const o of mine) {
        if (o.status === 'resting' && view.now - o.sentAt > patience) {
          pulled.add(o.localId);
          out.push({ kind: 'cancel', localId: o.localId });
        }
      }
      const position = ownPosition(view, id, symbol);
      const { bid, ask } = position !== 0 ? bestAcross(view, symbol) : NO_BEST;
      const mid = bid && ask ? (bid.price + ask.price) / 2 : null;
      // A held position cares about the last big print back to the quiet span; a flat block, only a fresh one.
      const print = newestBig(view, symbol, bigPrint, view.now - (position !== 0 ? quiet : fresh));

      if (position !== 0) {
        const last = [...view.recentFills].reverse().find((f) => f.block === id && f.symbol === symbol);
        const against = last && mid !== null ? (position > 0 ? last.price - mid : mid - last.price) : 0;
        // A wall still stands behind the fill: this was a jump, and it stays while the price goes its way.
        // Without one it was a chase, and ends when the tape goes quiet. Either ends at the stop.
        const wall =
          last !== undefined &&
          view.exchanges.some((exchange) => {
            const levels = view.depth[exchange]?.[symbol]?.[position > 0 ? 'bids' : 'asks'] ?? [];
            return levels.some(
              (l) =>
                l.largest >= bigOrder &&
                (position > 0
                  ? l.price < last.price && l.price >= last.price - BEHIND
                  : l.price > last.price && l.price <= last.price + BEHIND),
            );
          });
        // A chase has no wall behind it: it lives while its offer back is young, and ends when that offer is
        // gone or has waited too long, or the tape has gone quiet.
        const young = mine.some(
          (o) =>
            o.status !== 'filled' &&
            o.status !== 'cancelled' &&
            o.status !== 'rejected' &&
            o.side === (position > 0 ? 'sell' : 'buy') &&
            view.now - o.sentAt <= chasePatience,
        );
        const stale = !wall && (!young || print === null || view.now - print.trade.at >= quiet);
        if ((against >= exitMove || stale) && !inFlight(view, symbol, id)) {
          // Pull the offers that were to bring the shares back, or they would sell what is no longer held.
          for (const o of mine) {
            if (o.status === 'resting' && !pulled.has(o.localId) && o.side === (position > 0 ? 'sell' : 'buy')) {
              out.push({ kind: 'cancel', localId: o.localId });
            }
          }
          const exit = flattenTo(view, symbol, position, 0);
          if (exit) out.push(exit);
        }
        continue;
      }

      // Chase the print: once, on the exchanges it has not reached.
      if (print && view.now - print.trade.at <= fresh && Math.abs(position) < maxPosition) {
        const answered =
          mine.some((o) => o.sentAt >= print.trade.at) ||
          view.recentFills.some((f) => f.block === id && f.symbol === symbol && f.at >= print.trade.at);
        if (!answered) {
          const buy = print.trade.aggressor === 'buy';
          // Only where the quote is still the old price (nothing to race for otherwise), only the visible top
          // level, and only where the level behind it is thinner than the print: the slow order's remainder
          // will then reach the offer back, rather than the crowd's resting orders behind the touch.
          const targets = view.exchanges
            .filter((e) => e !== print.exchange)
            .flatMap((exchange) => {
              const q = view.quotes[exchange]?.[symbol];
              if (!q) return [];
              const price = buy ? q.ask : q.bid;
              const next = buy ? q.ask2 : q.bid2;
              const nextSize = buy ? q.ask2Size : q.bid2Size;
              if (price === null || next === null) return [];
              const stale = buy ? price <= print.trade.price : price >= print.trade.price;
              if (!stale || nextSize >= print.trade.size) return [];
              return [{ exchange, price, next, size: buy ? q.askSize : q.bidSize }];
            })
            .sort((a, b) => (buy ? a.price - b.price : b.price - a.price));
          let left = print.trade.size;
          const before = out.length;
          for (const t of targets) {
            const size = Math.min(left, t.size);
            if (size <= 0) break;
            left -= size;
            out.push({
              kind: 'order',
              symbol,
              exchange: t.exchange,
              side: print.trade.aggressor,
              price: t.price,
              size,
              ioc: true,
            });
            // The offer back at the next level's price, post-only, for the slow order's remainder.
            out.push({
              kind: 'order',
              symbol,
              exchange: t.exchange,
              side: buy ? 'sell' : 'buy',
              price: t.next,
              size,
              ioc: false,
              postOnly: true,
            });
          }
          if (out.length > before) continue;
        }
      }

      // Jump the big order: one quote at a time, none while something of this block's is in the air or resting.
      if (mine.some((o) => o.status !== 'filled' && o.status !== 'cancelled' && o.status !== 'rejected')) continue;
      let best: { exchange: string; side: 'buy' | 'sell'; price: number; size: number } | null = null;
      for (const exchange of view.exchanges) {
        const q = view.quotes[exchange]?.[symbol];
        const d = view.depth[exchange]?.[symbol];
        if (!q || !d || q.bid === null || q.ask === null) continue;
        for (const l of d.bids) {
          const inside = l.price >= q.bid - 1 && l.price + 1 < q.ask;
          if (inside && l.largest >= bigOrder && (!best || l.largest > best.size)) {
            best = { exchange, side: 'buy', price: l.price + 1, size: l.largest };
          }
        }
        for (const l of d.asks) {
          const inside = l.price <= q.ask + 1 && l.price - 1 > q.bid;
          if (inside && l.largest >= bigOrder && (!best || l.largest > best.size)) {
            best = { exchange, side: 'sell', price: l.price - 1, size: l.largest };
          }
        }
      }
      if (best) {
        out.push({
          kind: 'order',
          symbol,
          exchange: best.exchange,
          side: best.side,
          price: best.price,
          size: jumpSize,
          ioc: false,
          postOnly: true,
        });
      }
    }
    return out;
  },
};
