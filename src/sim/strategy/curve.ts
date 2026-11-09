// The curve: a metal's futures for different weeks are each the metal carried to their expiry, so the gap between two
// of them is the carry for the weeks between. The carry is the dollar's rate and storage less the metal's lease, and
// the lease moves, so what the gap should be moves with it. When the books' gap is wider or narrower than the carry
// now implies, sell the dear expiry and buy the cheap one: a calendar spread, nearly flat in the metal itself, that
// earns when the gap comes back.

import {
  bestAcross,
  carryFactor,
  contractsByExpiry,
  flattenTo,
  inFlight,
  ownPosition,
  type ContractView,
  type Intent,
  type MarketView,
  type Params,
  type StrategyBlock,
} from './types';

const HOUR = 60 * 60 * 1000;

/** How far the far contract's price over the near's is from what the carry implies, a share; > 0, the far is dear. */
function deviation(near: ContractView, far: ContractView, now: number, farPrice: number, nearPrice: number): number {
  return farPrice / nearPrice / (carryFactor(far, now) / carryFactor(near, now)) - 1;
}

export const curve: StrategyBlock = {
  spec: {
    id: 'curve',
    name: 'Calendar spread',
    summary: 'Trade two expiries of a metal against each other when their gap is not what the carry implies.',
    explain:
      'Each week’s future on a metal is the metal carried to its expiry: the metal, plus what holding it that long ' +
      'costs in interest and storage, less what lending it out would earn (the lease). So the gap between two weeks’ ' +
      'contracts should be the carry for the weeks between them, and the curve slopes up (contango) while the carry ' +
      'is positive. The lease moves, and jumps on supply news; a squeeze can take it past the carry and tip the curve ' +
      'down (backwardation). When the books’ gap between the two nearest expiries differs from what the carry now ' +
      'implies by more than a threshold, sell the dear one and buy the cheap one, a contract each: nearly flat in the ' +
      'metal, it earns when the gap comes back. Out when it has, at a stop if the curve keeps moving against it, and ' +
      'always before the near contract’s expiry, which would deliver the metal. A leg that misses is closed at once.',
    params: [
      {
        key: 'threshold',
        name: 'Minimum gap',
        min: 0.5,
        max: 50,
        step: 0.5,
        default: 3,
        unit: 'bps',
        explain: 'How far the two contracts’ gap must be from what the carry implies, in basis points, at the touch.',
      },
      {
        key: 'stop',
        name: 'Stop',
        min: 1,
        max: 100,
        step: 1,
        default: 10,
        unit: 'bps',
        explain: 'How much further past the threshold the gap may go against the spread before the block gets out.',
      },
      {
        key: 'contracts',
        name: 'Contracts',
        min: 1,
        max: 20,
        step: 1,
        default: 1,
        unit: 'contracts',
        explain: 'Contracts a leg.',
      },
      {
        key: 'exitBefore',
        name: 'Out before expiry',
        min: 1,
        max: 72,
        step: 1,
        default: 24,
        unit: 'hours',
        explain: 'How long before the near contract expires to be out of it, and not to open a spread with it.',
      },
    ],
  },

  decide(view: MarketView, p: Params): Intent[] {
    const threshold = (p.threshold ?? 3) / 10_000;
    const stop = (p.stop ?? 10) / 10_000;
    const contracts = p.contracts ?? 1;
    const window = (p.exitBefore ?? 24) * HOUR;
    const id = this.spec.id;
    const all = view.contracts ?? {};
    const out: Intent[] = [];
    // A series at a time: the contracts on one underlying.
    const underlyings = new Set(Object.values(all).map((c) => c.underlying));
    for (const metal of underlyings) {
      const series = Object.keys(all).filter((s) => all[s]!.underlying === metal);
      if (series.some((s) => inFlight(view, s, id))) continue;
      const held = series.filter((s) => ownPosition(view, id, s) !== 0).sort((x, y) => all[x]!.expiry - all[y]!.expiry);
      const flattenAll = () => {
        for (const s of held) {
          const intent = flattenTo(view, s, ownPosition(view, id, s), 0);
          if (intent) out.push(intent);
        }
      };
      if (held.length > 0) {
        const [n, f] = held;
        const posN = ownPosition(view, id, n!);
        const posF = f !== undefined ? ownPosition(view, id, f) : 0;
        // Anything but one spread, two legs equal and opposite, is a leg left alone: out of it.
        if (held.length !== 2 || posN !== -posF) {
          flattenAll();
          continue;
        }
        const near = all[n!]!;
        const far = all[f!]!;
        if (near.expiry - view.now <= window) {
          flattenAll();
          continue;
        }
        const qn = bestAcross(view, n!);
        const qf = bestAcross(view, f!);
        if (!qn.bid || !qn.ask || !qf.bid || !qf.ask) continue;
        const dev = deviation(
          near,
          far,
          view.now,
          (qf.bid.price + qf.ask.price) / 2,
          (qn.bid.price + qn.ask.price) / 2,
        );
        // Short the far leg: it was dear. Back once within a quarter of the threshold; stopped past threshold + stop.
        const against = posF < 0 ? dev : -dev;
        if (against <= threshold / 4 || against >= threshold + stop) flattenAll();
        continue;
      }
      // Flat: the two nearest expiries outside the window, on watched contracts.
      const [near, far] = contractsByExpiry(view, window).filter(([, c]) => c.underlying === metal);
      if (!near || !far) continue;
      const qn = bestAcross(view, near[0]);
      const qf = bestAcross(view, far[0]);
      if (!qn.bid || !qn.ask || !qf.bid || !qf.ask) continue;
      const dear = deviation(near[1], far[1], view.now, qf.bid.price, qn.ask.price);
      const cheap = -deviation(near[1], far[1], view.now, qf.ask.price, qn.bid.price);
      const leg = (symbol: string, side: 'buy' | 'sell', q: typeof qn): Intent => {
        const touch = side === 'buy' ? q.ask! : q.bid!;
        return {
          kind: 'order',
          symbol,
          exchange: touch.exchange,
          side,
          price: touch.price,
          size: contracts,
          ioc: true,
        };
      };
      if (dear > threshold) out.push(leg(near[0], 'buy', qn), leg(far[0], 'sell', qf));
      else if (cheap > threshold) out.push(leg(near[0], 'sell', qn), leg(far[0], 'buy', qf));
    }
    return out;
  },
};
