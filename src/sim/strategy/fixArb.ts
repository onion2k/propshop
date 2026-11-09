// The fix: twice a day Thamesford stops matching gold and silver for half a minute, gathers every order, and trades
// them all at one price. While the call runs it publishes where it would uncross now, the indicative. Hudson's futures
// trade on, and the front one, unwound by its carry, says where the metal is worth. When the indicative is cheap
// against it, rest a buy into the fix (an IOC is refused in the call); when rich, a sell. What the fix fills is hedged
// at once in the future, the other way, and both legs come out together once the metal's own book is back by the
// future, or after a wait at the latest.

import {
  bestAcross,
  carryFactor,
  contractsByExpiry,
  flattenTo,
  inFlight,
  ownPosition,
  type Indicative,
  type Intent,
  type MarketView,
  type Params,
  type StrategyBlock,
} from './types';

/** The venue whose fix the block trades. */
const FIX_VENUE = 'THAMESFORD';
/** The front contract is the first with more than this to its expiry: a hedge is not opened into the last hour. */
const LAST_HOUR = 60 * 60 * 1000;

/** The call on the fix venue for a metal, as the firm sees it, or null outside one. */
function callOn(view: MarketView, metal: string): Indicative | null {
  return view.quotes[FIX_VENUE]?.[metal]?.indicative ?? null;
}

/** Whether any venue that quotes a metal is in its call now: no IOC may go there. */
function inAnyCall(view: MarketView, metal: string): boolean {
  for (const e of view.exchanges) if (view.quotes[e]?.[metal]?.indicative) return true;
  return false;
}

/** When the block last filled in the metal, of the fills still in the log; -Infinity where none is. */
function lastFill(view: MarketView, block: string, metal: string): number {
  for (let i = view.recentFills.length - 1; i >= 0; i--) {
    const f = view.recentFills[i]!;
    if (f.block === block && f.symbol === metal) return f.at;
  }
  return -Infinity;
}

export const fixArb: StrategyBlock = {
  spec: {
    id: 'fixArb',
    name: 'Fix arbitrage',
    summary: 'Rest into Thamesford’s fix when its indicative price is off the future’s, and hedge what it fills.',
    explain:
      'Twice a day, at 05:30 and 10:00, Thamesford stops matching for half a minute and trades every order at one ' +
      'price, the fix. During that call it publishes where it would uncross now: the indicative. Hudson’s gold and ' +
      'silver futures trade on through it, and the front contract, brought back by its carry, says what the metal is ' +
      'worth now. When the indicative is cheaper than that by more than a threshold, rest a buy into the fix, priced ' +
      'no higher than the threshold allows; when dearer, a sell. Only a resting order can join the call: an IOC is ' +
      'refused there. Whatever the fix fills is hedged straight away in the front future, the other way, and no more ' +
      'than it filled. Both legs come out together once the metal’s own book is back by the future, or after a wait ' +
      'at the latest. A firm near Thamesford sees the indicative move first and answers it last.',
    params: [
      {
        key: 'threshold',
        name: 'Minimum edge',
        min: 0,
        max: 50,
        step: 0.5,
        default: 4,
        unit: 'bps',
        explain: 'How far the indicative must be from the spot the future implies, in basis points, after the fees.',
      },
      {
        key: 'lots',
        name: 'Size',
        min: 1,
        max: 50,
        step: 1,
        default: 2,
        unit: 'lots',
        explain: 'Lots to rest into the fix, of each metal; the hedge is as many contracts as it fills.',
      },
      {
        key: 'unwindAfter',
        name: 'Out after',
        min: 5,
        max: 3600,
        step: 5,
        default: 120,
        unit: 's',
        explain: 'How long after the fix to wait for the book to come back by the future before taking both legs out.',
      },
    ],
  },

  decide(view: MarketView, p: Params): Intent[] {
    const threshold = (p.threshold ?? 4) / 10_000;
    const lots = p.lots ?? 2;
    const unwindAfter = (p.unwindAfter ?? 120) * 1000;
    const id = this.spec.id;
    const out: Intent[] = [];
    const contracts = view.contracts ?? {};
    // Most decisions have nothing to do: flat, nothing resting and no call. Said so before any working.
    const own = view.blockPositions[id];
    const idle =
      (!own || Object.values(own).every((q) => q === 0)) &&
      !view.openOrders.some((o) => o.block === id) &&
      !Object.values(view.quotes[FIX_VENUE] ?? {}).some((q) => q.indicative);
    if (idle) return [];
    const metals = new Set(Object.values(contracts).map((c) => c.underlying));
    for (const metal of metals) {
      if (!view.symbols.includes(metal)) continue;
      const series = Object.keys(contracts).filter((s) => contracts[s]!.underlying === metal);
      if (inFlight(view, metal, id) || series.some((s) => inFlight(view, s, id))) continue;
      const front = contractsByExpiry(view, LAST_HOUR).find(([, c]) => c.underlying === metal);
      const spotScale = view.scales?.[metal] ?? 1;
      const held = ownPosition(view, id, metal);
      const call = callOn(view, metal);
      const mine = view.openOrders.filter(
        (o) => o.block === id && o.symbol === metal && o.exchange === FIX_VENUE && o.status === 'resting',
      );

      // The spot the front future implies, unwound by its carry.
      let implied: number | null = null;
      let fq: ReturnType<typeof bestAcross> | null = null;
      if (front) {
        fq = bestAcross(view, front[0]);
        if (fq.bid && fq.ask) implied = (fq.bid.price + fq.ask.price) / 2 / carryFactor(front[1], view.now);
      }

      // In the call: rest into it, or pull an order whose edge the future has moved away.
      if (call) {
        if (implied !== null) {
          // The fees, in points of the metal: the hedge in and out on the future, the metal out on its book.
          const futFee = front ? (view.fees[fq!.bid!.exchange] ?? 0) / (view.scales?.[front[0]] ?? 1) : 0;
          const fees = 2 * futFee + (view.fees[FIX_VENUE] ?? 0) / spotScale;
          const buyAt = Math.floor(implied * (1 - threshold) - fees);
          const sellAt = Math.ceil(implied * (1 + threshold) + fees);
          if (mine.length > 0) {
            // Pulled once its price no longer keeps the edge, or once the indicative has left its side: a sell rested
            // while the fix was rich is no use when clients' selling has made it cheap, and holds the buy back.
            const cheap = call.price !== null && call.price <= buyAt;
            const rich = call.price !== null && call.price >= sellAt;
            for (const o of mine)
              if (
                (o.side === 'buy' && (o.price > buyAt || !cheap)) ||
                (o.side === 'sell' && (o.price < sellAt || !rich))
              )
                out.push({ kind: 'cancel', localId: o.localId });
          } else if (held === 0 && call.price !== null && call.fixAt - view.now > (view.latency[FIX_VENUE] ?? 0)) {
            if (call.price <= buyAt) out.push(rest(metal, 'buy', buyAt, lots));
            else if (call.price >= sellAt) out.push(rest(metal, 'sell', sellAt, lots));
          }
        }
      } else {
        // The fix is done: what is left of the order does not stay to trade continuously.
        for (const o of mine) out.push({ kind: 'cancel', localId: o.localId });
      }

      // Out of both once the metal's book is back by the future, or the wait is over; never by an IOC into a call.
      let wantSpot = held;
      if (held !== 0 && !inAnyCall(view, metal)) {
        const { bid, ask } = bestAcross(view, metal);
        const mid = bid && ask ? (bid.price + ask.price) / 2 : null;
        const back = mid !== null && implied !== null && Math.abs(mid / implied - 1) <= threshold / 4;
        const waited = view.now - lastFill(view, id, metal) >= unwindAfter;
        if (mid !== null && (back || waited)) {
          const intent = flattenTo(view, metal, held, 0);
          if (intent) {
            out.push(intent);
            wantSpot = 0;
          }
        }
      }

      // The hedge: the front future, the other way, as much as the metal held (or about to be), in value.
      for (const s of series) {
        const want = front && s === front[0] ? -Math.round((wantSpot * spotScale) / (view.scales?.[s] ?? 1)) : 0;
        const intent = flattenTo(view, s, ownPosition(view, id, s), want);
        if (intent) out.push(intent);
      }
    }
    return out;
  },
};

function rest(symbol: string, side: 'buy' | 'sell', price: number, size: number): Intent {
  return { kind: 'order', symbol, exchange: FIX_VENUE, side, price, size, ioc: false };
}
