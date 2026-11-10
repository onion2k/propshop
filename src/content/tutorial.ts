// The tutorial is stage 1's walk-through; the later stages each have an intro card or two, shown the same way
// when the stage opens. One thing at a time, pointed at, with the game driven to where the step needs it and a check
// that the thing has happened before the next step. The words are the player's first contact with every idea,
// so each step says one thing, and the glossary and the first week carry the rest.

import type { Snapshot } from '../sim';
import { STAGES, type StageId } from './stages';

export type TutorialPage = 'overview' | 'market' | 'desk' | 'strategy' | 'reports';

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

/** Stage 1's walk-through: only what is on the screen of a new game. Momentum is the block that is on. */
export const TUTORIAL: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'You run a trading firm',
    text:
      'A small one, from a spare room on the west coast, with a laptop and two hundred thousand dollars. You ' +
      'will build a strategy out of blocks, watch it trade among faster firms, and spend what it makes on ' +
      'speed. The game is paused while we look around. Four pages: Overview, Market, Strategy, Reports.',
    page: 'market',
    target: 'pages',
    enter: { speed: 0 },
  },
  {
    id: 'watchlist',
    title: 'The watchlist',
    text:
      'Thirteen stocks and an index. Your laptop can follow four at a time, and the ticked ones are what your ' +
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
      'They mostly agree about the price. Your orders land on one of them, and the rows show where.',
    page: 'market',
    target: 'quotes',
  },
  {
    id: 'clock',
    title: 'Time',
    text:
      'The market opens at 09:30 and closes at 16:00, five days a week. Simulated time runs as fast as you ' +
      'like: these buttons set it, and “watch” runs fast and slows for the moments worth seeing. Skip to the open now, then set 10× and watch the prices start to move.',
    page: 'market',
    target: 'speed',
    waitFor: { check: (s) => s.open && s.speed >= 10, waiting: 'Waiting for the open at 10× or faster.' },
  },
  {
    id: 'blocks',
    title: 'The strategy page',
    text:
      'Your strategy is a set of blocks. Each one is a way of trading, with a paragraph on what it earns and ' +
      'what hurts it. A laptop runs one at a time. Momentum is on: it buys what is rising and sells what is ' +
      'falling, and it earns from a spare room.',
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
      'office in Harbor City turns forty-four milliseconds into two. Buy nothing yet; see what momentum earns first.',
    page: 'strategy',
    target: 'shop',
  },
  {
    id: 'risk',
    title: 'Risk limits',
    text:
      'Two sliders that save you from yourself: a loss on the day that halts the firm until the next open, ' +
      'and a cap on how much you may hold. A strategy that goes wrong meets these before it meets your cash.',
    page: 'strategy',
    target: 'risk',
  },
  {
    id: 'reports',
    title: 'Reports',
    text:
      'The first week is a short list of things to see, ticked off by the game as each happens. Days writes ' +
      'up each close by block and by stock, and Learn is the glossary behind every underlined word. More ' +
      'tabs arrive as you go.',
    page: 'reports',
    target: 'tabs',
  },
  {
    id: 'overview',
    title: 'The overview',
    text:
      'The first page you meet is the overview: the firm read over days instead of milliseconds. It shows ' +
      'your position, the day so far, the trends, and what to try next. After each close the game tests ' +
      'changes to your setup overnight, and the comparisons say which helped. Come back to it at the end of every day.',
    page: 'overview',
    target: 'overview',
  },
  {
    id: 'go',
    title: 'Over to you',
    text:
      'Set the speed and let a day run to its close. The first week picks up where this leaves off. When you ' +
      'have the money, buy a better seat, and the next part of the game opens.',
    page: 'market',
    target: 'speed',
    enter: { speed: 10 },
  },
];

/** The cards shown as a stage opens, by id; the stage table says which belong to which. */
const INTRO: TutorialStep[] = [
  {
    id: 'stage2-gap',
    title: 'A better seat: the gap',
    text:
      'Watch the bid and ask across the three rows of the picked stock. When one exchange’s ask drops below ' +
      'another’s bid, the stock is cheaper to buy there than it can be sold for here. The line under the rows ' +
      'shows it, and the counter in the heading ticks every time your firm sees one.',
    page: 'market',
    target: 'gaps',
    enter: { speed: 0 },
  },
  {
    id: 'stage2-race',
    title: 'Arbitrage and the race',
    text:
      'The arbitrage block is on the Strategy page now. When it sees a gap it sends two orders: buy where it ' +
      'is cheap, sell where it is dear. The laptop runs one block, so switch momentum off first. Each order ' +
      'in your firm panel now has a race under it.',
    page: 'market',
    target: 'firm',
  },
  {
    id: 'stage2-read',
    title: 'Read the race',
    text:
      'Under each order is its story: how old the quote was when you sent it, how long the order took to ' +
      'arrive, and who took the quote first. A rival’s name and a number of milliseconds means you were ' +
      'beaten. Nothing about your strategy was wrong. You were slow. The Rivals tab shows who beat you.',
    page: 'market',
    target: 'firm',
  },
  {
    id: 'stage3-character',
    title: 'The day’s character',
    text:
      'Three more blocks are on the Strategy page: the market maker, mean reversion and news reaction. Each ' +
      'does well on one kind of day and badly on another. The News tab has the headlines they react to, and ' +
      'some of those headlines are noise.',
    page: 'strategy',
    target: 'strategy',
    enter: { speed: 0 },
  },
  {
    id: 'stage4-desk',
    title: 'The desk',
    text:
      'Your blocks are not the only way to trade. The desk is a ticket: pick a stock, buy or sell, and send. ' +
      'The order waits a quarter of a second, a person’s reaction time, then goes out like any other and gets ' +
      'a race of its own. Try a big one and see how much the market has moved by the time it arrives. The ' +
      'microscope in the top bar steps time a tick at a time.',
    page: 'desk',
    target: 'desk-ticket',
    enter: { speed: 0 },
  },
  {
    id: 'stage5-whole',
    title: 'The whole firm',
    text:
      'Everything is open: pairs, index arbitrage, your own script on the Strategy page, and the Lab tab, ' +
      'where you change an exchange’s rules and see who loses. The rest is yours to try.',
    page: 'strategy',
    target: 'strategy',
    enter: { speed: 0 },
  },
  {
    id: 'stage6-vol',
    title: 'Volatility',
    text:
      'The options desk is open. The Market page has a chain of calls and puts on the index that expire at the ' +
      'close, with the price of each, the volatility it implies and its delta. The straddle line says how far the ' +
      'market expects the index to move by then. Tick the options to watch them, or watch the whole chain in one ' +
      'click: your blocks see only what is watched. Position has the desk’s greeks and a what-if.',
    page: 'market',
    target: 'options',
    enter: { speed: 0 },
  },
];

/** The intro cards of a stage, in order. */
export function introSteps(stage: StageId): TutorialStep[] {
  const ids = STAGES.find((s) => s.id === stage)?.intro ?? [];
  return ids.map((id) => INTRO.find((t) => t.id === id)!);
}

export function tutorialStep(index: number): TutorialStep | undefined {
  return TUTORIAL[index];
}
