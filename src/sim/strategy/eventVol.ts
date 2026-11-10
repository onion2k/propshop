// Event volatility: an at-the-money straddle (a call and a put on one strike) pays whatever way the index goes, so
// it is worth most when a big move is coming, and the options' prices already rise into a release that is known.
// Buy today's straddle some minutes before the day's first release. Sell it just before the release, having taken the
// rise in its price, or hold it through the release and take whatever the index does and the volatility's fall after.

import { MARKET_OPEN, MS_PER_MINUTE, MS_PER_SECOND } from '../clock';
import { dayStart, soonestExpiry } from './optionsView';
import {
  flattenTo,
  inFlight,
  ownPosition,
  type Intent,
  type MarketView,
  type Params,
  type StrategyBlock,
} from './types';

export const eventVol: StrategyBlock = {
  spec: {
    id: 'eventVol',
    name: 'Event volatility',
    summary: 'Buy the at-the-money straddle before the day’s first release; sell it before, or hold through.',
    explain:
      'The calendar publishes the times of the day’s market-wide releases, not what they say. A release moves the ' +
      'index by an amount nobody knows and in a direction nobody knows, and the options’ prices carry that: ' +
      'an expiry with a release still to come costs more than one without, and the price of the straddle (a ' +
      'call and a put on the strike nearest the index) climbs as the release nears. The block buys today’s ' +
      'straddle some minutes before the day’s first release inside the session. Sold seconds before it, ' +
      'the straddle has earned the rise in its price. Held through, it pays out as the index moves, and the ' +
      'volatility falls away once the release has landed (the crush), so it wins only if the move is bigger than ' +
      'what the price had in it. A straddle loses time value every minute it is held.',
    params: [
      {
        key: 'buyBefore',
        name: 'Buy before the release',
        min: 1,
        max: 120,
        step: 1,
        default: 10,
        unit: 'min',
        explain: 'How long before the day’s first release inside the session the straddle is bought.',
      },
      {
        key: 'sellBefore',
        name: 'Sell before the release',
        min: 0,
        max: 300,
        step: 5,
        default: 20,
        unit: 's',
        explain: 'How long before the release the straddle is sold, if it is not held through.',
      },
      {
        key: 'through',
        name: 'Hold through',
        min: 0,
        max: 1,
        step: 1,
        default: 0,
        unit: '',
        explain: 'Hold the straddle through the release instead of selling before it.',
        choices: ['sell before', 'hold through'],
      },
      {
        key: 'sellAfter',
        name: 'Sell after the release',
        min: 0,
        max: 1800,
        step: 10,
        default: 60,
        unit: 's',
        explain: 'When held through, how long after the release the straddle is sold.',
      },
      {
        key: 'contracts',
        name: 'Contracts',
        min: 1,
        max: 100,
        step: 1,
        default: 5,
        unit: 'contracts',
        explain: 'Calls and puts to buy.',
      },
    ],
  },

  decide(view: MarketView, p: Params): Intent[] {
    const options = view.options;
    if (!options) return [];
    const id = this.spec.id;
    const contracts = p.contracts ?? 5;
    const expiry = soonestExpiry(options, view.now);
    if (expiry === null) return [];
    // Today's options, by strike: the legs of a straddle.
    const strikes = new Map<number, { call?: string; put?: string }>();
    for (const [symbol, c] of Object.entries(options.chain)) {
      if (c.expiry !== expiry || !view.symbols.includes(symbol)) continue;
      const s = strikes.get(c.strike) ?? {};
      if (c.right === 'call') s.call = symbol;
      else s.put = symbol;
      strikes.set(c.strike, s);
    }
    const held = [...strikes.entries()].filter(([, s]) =>
      [s.call, s.put].some((x) => x !== undefined && ownPosition(view, id, x) !== 0),
    );
    // The day's first release inside the session: those before the open are over before the options trade.
    const open = dayStart(expiry) + MARKET_OPEN;
    const release = options.releases.filter((r) => r >= open && r < expiry).sort((a, b) => a - b)[0];
    const sellAt =
      release === undefined
        ? -Infinity
        : (p.through ?? 0) >= 1
          ? release + (p.sellAfter ?? 60) * MS_PER_SECOND
          : release - (p.sellBefore ?? 20) * MS_PER_SECOND;
    const out: Intent[] = [];
    const trade = (symbol: string | undefined, want: number) => {
      if (symbol === undefined || inFlight(view, symbol, id)) return;
      const i = flattenTo(view, symbol, ownPosition(view, id, symbol), want);
      if (i) out.push(i);
    };
    if (held.length > 0) {
      // Out of every leg once the moment has come (or there is no release to wait for); else the held strike is
      // completed while the window still stands.
      for (const [, s] of held) {
        if (view.now >= sellAt) {
          trade(s.call, 0);
          trade(s.put, 0);
        }
      }
      if (view.now < sellAt && release !== undefined && inWindow(view, release, p)) {
        for (const [, s] of held) {
          trade(s.call, contracts);
          trade(s.put, contracts);
        }
      }
      return out;
    }
    if (release === undefined || !inWindow(view, release, p)) return out;
    // Nearest the index, among the strikes with both legs listed.
    const spot = Object.values(options.chain).find((c) => c.expiry === expiry)?.spot ?? null;
    if (spot === null) return out;
    let best: { strike: number; call: string; put: string } | null = null;
    for (const [strike, s] of strikes)
      if (s.call && s.put && (best === null || Math.abs(strike - spot) < Math.abs(best.strike - spot)))
        best = { strike, call: s.call, put: s.put };
    if (!best) return out;
    trade(best.call, contracts);
    trade(best.put, contracts);
    return out;
  },
};

/** Whether the buying window is open: from `buyBefore` minutes ahead of the release to `sellBefore` seconds ahead of it. */
function inWindow(view: MarketView, release: number, p: Params): boolean {
  const from = release - (p.buyBefore ?? 10) * MS_PER_MINUTE;
  const to = release - (p.sellBefore ?? 20) * MS_PER_SECOND;
  return view.now >= from && view.now < to;
}
