// The guided first week: a lesson is something to do, something to watch for, a check the game runs on its
// own snapshot, and what it meant once it has happened. The order is the path a new player walks.

import type { Snapshot } from '../sim';

export interface Lesson {
  id: string;
  title: string;
  /** What to do, in a sentence or two. */
  task: string;
  /** What to look at while doing it. */
  watch: string;
  /** Glossary ids worth reading alongside. */
  terms: string[];
  done: (s: Snapshot) => boolean;
  /** Shown once done: what just happened, and why it matters. */
  lesson: string;
}

function fillsFor(s: Snapshot, block: string) {
  return s.fills.filter((f) => f.block === block);
}

function netOf(fills: { realised: number; fee: number }[]) {
  return fills.reduce((n, f) => n + f.realised - f.fee, 0);
}

export const LESSONS: Lesson[] = [
  {
    id: 'gap',
    title: 'See two exchanges disagree',
    task: 'Skip to the open and set the speed to 10×. Watch the bid and ask on the HARBOR and LAKESIDE rows of any stock.',
    watch: 'A moment when one exchange’s ask is below the other’s bid. It lasts a fraction of a second.',
    terms: ['bid-ask', 'fair-value'],
    done: (s) => s.gapsSeen > 0,
    lesson:
      'That was a gap: the same stock cheaper to buy on one exchange than it could be sold for on the other. ' +
      'Each exchange’s crowd learns about a move at its own pace, so for a few hundred milliseconds they ' +
      'disagree. Buying on one and selling on the other in that moment is arbitrage, and it is what every firm ' +
      'in this market is racing for.',
  },
  {
    id: 'race',
    title: 'Lose a race',
    task: 'Leave the arbitrage block on and let a few minutes of trading pass. Read the Orders list in your firm panel.',
    watch: 'An order marked Missed, with a rival’s name and how many milliseconds before you they arrived.',
    terms: ['latency', 'arbitrage'],
    done: (s) => s.orders.some((o) => o.beatenBy.length > 0),
    lesson:
      'You saw the gap, sent the order, and the quote was gone before it arrived, taken by a firm sitting closer ' +
      'to the exchange. From a home office your view of the market is tens of milliseconds old and your order ' +
      'takes as long again to arrive. Nothing about your strategy was wrong. You were slow.',
  },
  {
    id: 'cost',
    title: 'Count what being slow costs',
    task: 'Keep arbitrage running until it has made twenty fills. Look at the realised figure in the firm panel’s heading.',
    watch: 'Fills marked as scratching a leftover leg, each with a small loss, and the fees under each.',
    terms: ['fill', 'maker-taker'],
    done: (s) => {
      const fills = fillsFor(s, 'arbitrage');
      return fills.length >= 20 && netOf(fills) < 0;
    },
    lesson:
      'When one leg fills and the other misses, you are left holding stock you did not want, and the block ' +
      'gets flat again at the best price it can see: paying the spread, plus a fee on every fill. Arbitrage ' +
      'from here loses a little, steadily. The fast firms earn the cents you are paying.',
  },
  {
    id: 'home',
    title: 'Find what earns from home',
    task: 'Turn arbitrage off and momentum on. The laptop runs one block at a time. Give it a few minutes.',
    watch: 'Momentum fills that close out with a realised gain, especially after a headline lands.',
    terms: ['momentum', 'news'],
    done: (s) => {
      const fills = fillsFor(s, 'momentum');
      return fills.length >= 10 && netOf(fills) > 0;
    },
    lesson:
      'Momentum does not need to be first: it rides a move that takes seconds to play out, which a slow firm ' +
      'can still catch. It pays the spread on every entry and exit, so it bleeds in a market that only wobbles, ' +
      'but it is the honest way to earn from a spare room. That is what pays for a better seat.',
  },
  {
    id: 'maker',
    title: 'Get picked off as a market maker',
    task: 'Turn momentum off and the market maker on, with its half spread at two cents. Let it fill ten times.',
    watch: 'Fills that arrive just as the price moves through your quote, and the name on the race under them.',
    terms: ['market-maker', 'adverse-selection', 'inventory'],
    done: (s) => fillsFor(s, 'marketMaker').length >= 10,
    lesson:
      'A resting quote is an offer to everyone, and the ones who take it are the ones who know the price has ' +
      'moved. The crowd pulls its own stale quotes; yours sits there until a faster firm takes it. That is ' +
      'adverse selection, and it is why real market makers are the fastest firms of all. Widen the spread or ' +
      'step away on news, and it loses less; it does not win from here.',
  },
  {
    id: 'noise',
    title: 'Tell news from noise',
    task: 'Open the News tab and wait for a few headlines to settle.',
    watch: 'Headlines marked with what they moved, and ones that moved nothing.',
    terms: ['news'],
    done: (s) => {
      const settled = s.news.filter((h) => s.now - h.at > h.priceInMs);
      return settled.some((h) => h.noise) && settled.some((h) => !h.noise);
    },
    lesson:
      'A headline that reads like news is not always news. An executive seen at an airport moves nothing; an ' +
      'earnings miss moves a lot, over about twenty seconds while the market prices it in. The news reaction ' +
      'block cannot tell them apart. You can, with practice: that is an edge a machine does not have yet.',
  },
  {
    id: 'seat',
    title: 'Buy a better seat',
    task: 'Open the Shop. Compare the latency to each exchange before and after each office and network. Buy one.',
    watch: 'Your latency in the market panel’s heading, and how many of your races you now win.',
    terms: ['colocation', 'microwave', 'capacity'],
    done: (s) => s.infra.location !== 'home' || s.infra.network !== 'consumer' || s.infra.computer !== 'laptop',
    lesson:
      'Every millisecond you cut is a race you now win that you used to lose. The firms that built microwave ' +
      'towers between Chicago and New Jersey did it for three milliseconds. The shop is the whole game in ' +
      'miniature: earn slowly, buy speed, earn faster.',
  },
  {
    id: 'week',
    title: 'Reach the second week',
    task: 'Play through to Friday’s close and over the weekend. Use skip to open for the evenings.',
    watch: 'The day P&L at each close, and whether a message arrives on the Dark web tab.',
    terms: ['insider', 'pnl'],
    done: (s) => s.calendar.week >= 2,
    lesson:
      'A week of trading days, each with its open, its lunch lull and its close. If you were up on the week, ' +
      'someone on the dark web has noticed. Read the glossary’s entry on insider trading before you take ' +
      'them up on it: the tips are sometimes real, the fines always are.',
  },
];

export function lesson(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}
