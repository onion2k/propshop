// The kinds of day. Each scales the market's own behaviour; the weights say how often each comes.
import type { RegimeSpec } from '../sim';

export const REGIMES: RegimeSpec[] = [
  {
    id: 'calm',
    name: 'Calm day',
    weight: 3,
    explain:
      'Prices drift, little jumps, few headlines. Gaps between the exchanges are rare and small, so arbitrage ' +
      'earns little; a market maker with a tight spread earns the bounce and is rarely run over.',
    vol: 0.6,
    jumpRate: 0.5,
    jumpSize: 0.8,
    newsRate: 0.6,
    newsSize: 0.8,
    driftBps: 0,
  },
  {
    id: 'trending',
    name: 'Trending day',
    weight: 2,
    explain:
      'Each stock sets off in a direction at the open and keeps going, as if a large order were being worked ' +
      'all session. Momentum rides it; a market maker leans the wrong way all day and should widen or stop.',
    vol: 0.8,
    jumpRate: 0.8,
    jumpSize: 1,
    newsRate: 0.8,
    newsSize: 1,
    driftBps: 120,
  },
  {
    id: 'choppy',
    name: 'Choppy day',
    weight: 2,
    explain:
      'Jumpy and directionless. The exchanges disagree often, so arbitrage has the most to race for; momentum ' +
      'buys every lurch and sells every reversal and bleeds the spread doing it.',
    vol: 1.4,
    jumpRate: 2.2,
    jumpSize: 1.3,
    newsRate: 0.8,
    newsSize: 1,
    driftBps: 0,
  },
  {
    id: 'news',
    name: 'News-heavy day',
    weight: 2,
    explain:
      'Headlines all session, and bigger ones. The news reaction block has its day; a market maker should ' +
      'step away on every headline, because each one is a move it will be run over by.',
    vol: 1,
    jumpRate: 1,
    jumpSize: 1,
    newsRate: 2.5,
    newsSize: 1.4,
    driftBps: 0,
  },
];
