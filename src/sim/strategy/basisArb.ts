// Basis arbitrage: a future on the index is worth the index carried to its expiry, and for a moment it trades away
// from it. Sell the rich one and buy the cheap one, a contract against its multiplier of index shares, and wait for
// the basis to come back. The future's crowd is quick and the index's books are slow, so the gap opens on every
// move and the fast firm that sees both closes it.

import {
  bestAcross,
  carryFactor,
  contractsByExpiry,
  flattenTo,
  inFlight,
  ownPosition,
  type Intent,
  type MarketView,
  type Params,
  type StrategyBlock,
} from './types';

/** Positions are not opened in a contract's last hour: its basis is nearly nought and the expiry is close. */
const LAST_HOUR = 60 * 60 * 1000;

export const basisArb: StrategyBlock = {
  spec: {
    id: 'basisArb',
    name: 'Basis arbitrage',
    summary: 'Sell the future and buy the index when the future is rich against it; the reverse when cheap.',
    explain:
      'A future on the index is worth the index carried to its expiry: the index, plus what holding the index ' +
      'that long would cost in interest less what it pays. That difference is the basis, and it is not nought. ' +
      'When the future’s bid, brought back to today, is over the index’s ask by more than a threshold and ' +
      'the fees, sell the future and buy a hundred index shares a contract; the reverse when it is cheap. Two ' +
      'venues, two legs: the future at the Prairie Board and the index at an exchange, so it pays to be near both, ' +
      'and a leg that misses is a position. Unwinds both legs when the basis is back.',
    params: [
      {
        key: 'threshold',
        name: 'Minimum edge',
        min: 0.5,
        max: 20,
        step: 0.5,
        default: 3,
        unit: '¢/index share',
        explain: 'How far the future, carried back, must be from the index, per index share, after fees.',
      },
      {
        key: 'contracts',
        name: 'Contracts',
        min: 1,
        max: 20,
        step: 1,
        default: 1,
        unit: 'contracts',
        explain: 'Contracts a trade, each against its multiplier of index shares.',
      },
    ],
  },

  decide(view: MarketView, p: Params): Intent[] {
    const out: Intent[] = [];
    const threshold = p.threshold ?? 3;
    const contracts = p.contracts ?? 1;
    const id = this.spec.id;
    const held = Object.keys(view.contracts ?? {}).filter((s) => ownPosition(view, id, s) !== 0);
    const [near] = contractsByExpiry(view, LAST_HOUR);
    for (const [symbol, c] of near
      ? [near, ...held.filter((s) => s !== near[0]).map((s) => [s, view.contracts![s]!] as const)]
      : held.map((s) => [s, view.contracts![s]!] as const)) {
      const index = c.underlying;
      if (inFlight(view, symbol, id) || inFlight(view, index, id)) continue;
      const fut = bestAcross(view, symbol);
      const idx = bestAcross(view, index);
      if (!fut.bid || !fut.ask || !idx.bid || !idx.ask) continue;
      const k = carryFactor(c, view.now);
      const fees = (view.fees[idx.ask.exchange] ?? 0) + (view.fees[fut.bid.exchange] ?? 0) / c.multiplier;
      const position = ownPosition(view, id, symbol);
      if (position === 0 && symbol === near?.[0]) {
        const rich = fut.bid.price / k - idx.ask.price - fees;
        const cheap = idx.bid.price - fut.ask.price / k - fees;
        const shares = contracts * c.multiplier;
        if (rich >= threshold) {
          out.push({
            kind: 'order',
            symbol,
            exchange: fut.bid.exchange,
            side: 'sell',
            price: fut.bid.price,
            size: contracts,
            ioc: true,
          });
          out.push({
            kind: 'order',
            symbol: index,
            exchange: idx.ask.exchange,
            side: 'buy',
            price: idx.ask.price,
            size: shares,
            ioc: true,
          });
        } else if (cheap >= threshold) {
          out.push({
            kind: 'order',
            symbol,
            exchange: fut.ask.exchange,
            side: 'buy',
            price: fut.ask.price,
            size: contracts,
            ioc: true,
          });
          out.push({
            kind: 'order',
            symbol: index,
            exchange: idx.bid.exchange,
            side: 'sell',
            price: idx.bid.price,
            size: shares,
            ioc: true,
          });
        }
        continue;
      }
      // Held: out of both legs when the basis is back, or the contract is in its last hour.
      const deviation = (fut.bid.price + fut.ask.price) / 2 / k - (idx.bid.price + idx.ask.price) / 2;
      const back = position < 0 ? deviation <= threshold / 4 : deviation >= -threshold / 4;
      if (back || symbol !== near?.[0]) {
        const f = flattenTo(view, symbol, position, 0);
        if (f) out.push(f);
        const i = flattenTo(view, index, ownPosition(view, id, index), 0);
        if (i) out.push(i);
      }
    }
    // A leg left on its own (the other missed) is scratched.
    if (held.length === 0) {
      for (const index of new Set(Object.values(view.contracts ?? {}).map((c) => c.underlying))) {
        const left = ownPosition(view, id, index);
        if (left !== 0 && !inFlight(view, index, id)) {
          const i = flattenTo(view, index, left, 0);
          if (i) out.push(i);
        }
      }
    }
    return out;
  },
};
