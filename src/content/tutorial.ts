// The tutorial: one thing at a time, pointed at, with the game driven to where the step needs it and a check
// that the thing has happened before the next step. The words are the player's first contact with every idea,
// so each step says one thing, and the glossary and the first week carry the rest.

import type { Snapshot } from '../sim';

export type TutorialPage = 'market' | 'strategy' | 'reports';

export interface TutorialStep {
  id: string;
  title: string;
  text: string;
  page: TutorialPage;
  /** The `data-tut` name of the element to point at, if any. */
  target?: string;
  /** What to do to the game on entering the step. */
  enter?: { speed?: 0 | 1 | 10 | 60 | 300; skipToOpen?: boolean; enable?: string[]; disable?: string[] };
  /** Next waits for this, with the line to show while it waits. */
  waitFor?: { check: (s: Snapshot) => boolean; waiting: string };
}

export const TUTORIAL: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'You run a trading firm',
    text:
      'A small one, from a spare room on the west coast, with a laptop and two hundred thousand dollars. You ' +
      'will build a strategy out of blocks, watch it trade against faster rivals, and spend what it makes on ' +
      'speed. The game is paused while we look around. Three pages: Market, Strategy, Reports.',
    page: 'market',
    target: 'pages',
    enter: { speed: 0 },
  },
  {
    id: 'watchlist',
    title: 'The watchlist',
    text:
      'Twelve stocks and an index. Your laptop can follow four at a time, and the ticked ones are what your ' +
      'strategy sees. Each row shows the best price anyone will pay and the best anyone will take, as you ' +
      'can see them. Tap a row to pick it.',
    page: 'market',
    target: 'watchlist',
  },
  {
    id: 'exchanges',
    title: 'One stock, three exchanges',
    text:
      'The picked stock trades on HARBOR, LAKESIDE and PACIFIC, each with its own crowd and its own book. ' +
      'They mostly agree about the price. Mostly. When they do not, for a few hundred milliseconds, that gap ' +
      'is what this whole game is about.',
    page: 'market',
    target: 'quotes',
  },
  {
    id: 'clock',
    title: 'Time',
    text:
      'The market opens at 09:30 and closes at 16:00, five days a week. Simulated time runs as fast as you ' +
      'like: these buttons set it. Skip to the open now, then set 10× and watch the prices start to move.',
    page: 'market',
    target: 'speed',
    waitFor: { check: (s) => s.open && s.speed >= 10, waiting: 'Waiting for the open at 10× or faster.' },
  },
  {
    id: 'gap',
    title: 'See a gap',
    text:
      'Watch the bid and ask across the three rows of the picked stock. When one exchange’s ask drops below ' +
      'another’s bid, the stock is cheaper to buy there than it can be sold for here. The counter in the ' +
      'heading ticks every time your firm sees one.',
    page: 'market',
    target: 'quotes',
    waitFor: { check: (s) => s.gapsSeen > 0, waiting: 'Waiting for your firm to see a gap.' },
  },
  {
    id: 'race',
    title: 'Your first race',
    text:
      'The arbitrage block is already on. When it sees a gap it sends two orders: buy where it is cheap, sell ' +
      'where it is dear. From a spare room those orders take tens of milliseconds to arrive. Watch your firm ' +
      'panel for the first one.',
    page: 'market',
    target: 'firm',
    enter: { enable: ['arbitrage'] },
    waitFor: { check: (s) => s.orders.some((o) => o.ackAt !== null), waiting: 'Waiting for an order to come back.' },
  },
  {
    id: 'read-race',
    title: 'Read the race',
    text:
      'Under each order is its story: how old the quote was when you sent it, how long the order took to ' +
      'arrive, and who took the quote first. Most of yours will say a rival’s name and a number of ' +
      'milliseconds. Nothing about your strategy is wrong. You are slow.',
    page: 'market',
    target: 'firm',
    enter: { speed: 0 },
  },
  {
    id: 'blocks',
    title: 'The strategy page',
    text:
      'Your strategy is a set of blocks. Each one is a way of trading, with a paragraph on what it earns and ' +
      'what hurts it. A laptop runs one at a time. Arbitrage is the one that is on; momentum is the one that ' +
      'earns from a spare room.',
    page: 'strategy',
    target: 'strategy',
  },
  {
    id: 'params',
    title: 'Parameters',
    text:
      'Every block has a few sliders, and every slider has a line saying what it does. Open a block and ' +
      'read one. Nothing here needs a formula: the explainers are the lesson.',
    page: 'strategy',
    target: 'strategy',
  },
  {
    id: 'shop',
    title: 'The shop',
    text:
      'Offices, networks and computers. Each shows your latency to every exchange before and after. An ' +
      'office in Harbor City turns forty-four milliseconds into two. Do not buy yet; see what you earn first.',
    page: 'strategy',
    target: 'shop',
  },
  {
    id: 'risk',
    title: 'Risk limits',
    text:
      'Two sliders that save you from yourself: a loss on the day that halts the firm until the next open, ' +
      'and a cap on how much you may hold. A script that goes wrong meets these before it meets your cash.',
    page: 'strategy',
    target: 'risk',
  },
  {
    id: 'reports',
    title: 'Reports',
    text:
      'The first week is eight things to see, ticked off by the game as each happens. Days writes up each ' +
      'close by block, by stock and by race. News is the feed, the dark web arrives when you have been ' +
      'profitable, and Learn is the glossary behind every underlined word.',
    page: 'reports',
    target: 'tabs',
  },
  {
    id: 'go',
    title: 'Over to you',
    text:
      'Set the speed, try momentum from home, and let a day run to its close. The first week picks up where ' +
      'this leaves off. When you can afford the city office, buy it, and watch how many races you win.',
    page: 'market',
    target: 'speed',
    enter: { speed: 10 },
  },
];

export function tutorialStep(index: number): TutorialStep | undefined {
  return TUTORIAL[index];
}
