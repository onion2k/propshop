// The experiments: a short window of one trading morning, run once as given, then again with one change the
// player picks, after they guess what it will do. The answer is measured from the two runs, never written in:
// `answerOf` reads it off the two P&Ls and `explain` says why from the numbers. Each window's seed was chosen
// for what it holds (a headline, a run of gaps), and test/experiments.test.ts holds that it still does.

import type { Game, GameEvent, Measures, Moment, MomentSource, OpenOrder, Setup } from '../sim';
import { MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND } from '../sim';
import { COMPETITORS, LOCATIONS, NETWORKS } from './upgrades';

const OPEN = 9 * MS_PER_HOUR + 30 * MS_PER_MINUTE;
/** Every window starts a minute after Monday's open: the books have filled and the warm-up stays short. */
const START = OPEN + MS_PER_MINUTE;

export type Answer = 'better' | 'same' | 'worse';

export const ANSWERS: { id: Answer; label: string }[] = [
  { id: 'better', label: 'Better: earns more, or loses less' },
  { id: 'same', label: 'About the same' },
  { id: 'worse', label: 'Worse: earns less, or loses more' },
];

/** Within this much of the first run is "about the same": a hundred dollars, or a tenth of the first run's P&L. */
export const SAME_CENTS = 10_000;
export const SAME_SHARE = 0.1;

/** What the change did, read off the two runs. */
export function answerOf(a: Measures, b: Measures): Answer {
  const band = Math.max(SAME_CENTS, Math.abs(a.pnl) * SAME_SHARE);
  if (b.pnl - a.pnl > band) return 'better';
  if (a.pnl - b.pnl > band) return 'worse';
  return 'same';
}

export interface Change {
  id: string;
  label: string;
  /** What it changes, in a sentence, for the picker. */
  detail: string;
  apply: (s: Setup) => Setup;
}

/** Watches a run tick by tick and, once it is over, names the moments worth replaying. */
export interface Tracker {
  source: MomentSource;
  /** At most three, earliest first. */
  pick: () => Moment[];
}

export interface Experiment {
  id: string;
  title: string;
  /** The idea it is about, in a line, for the list. */
  teaches: string;
  /** What is on the page before the first run. */
  briefing: string;
  /** Glossary ids the briefing links. */
  terms: string[];
  seed: number;
  startAt: number;
  windowMs: number;
  /** The stock the live view charts. */
  symbol: string;
  baseline: Setup;
  /** The first run, in a few words: "momentum from home". */
  baselineLabel: string;
  changes: Change[];
  tracker: () => Tracker;
  /** Why the second run came out as it did, from the numbers. */
  explain: (a: Measures, b: Measures, change: Change) => string;
  /** Shown with the result whatever it was: what to take from the experiment. */
  takeaway: string;
}

// ---- helpers ------------------------------------------------------------------------------------------------

const block = (id: string, params: Record<string, number> = {}) => ({ id, enabled: true, params });

export function dollars(cents: number): string {
  const d = Math.round(cents / 100);
  return `${d < 0 ? '−' : ''}$${Math.abs(d).toLocaleString('en-US')}`;
}

/** One-way milliseconds from a setup to an exchange, as the sim works it out (src/sim/latency.ts). */
export function latencyMs(setup: Setup, exchange: string): number {
  const loc = LOCATIONS.find((l) => l.id === setup.location);
  const net = NETWORKS.find((n) => n.id === setup.network);
  const d = loc?.distance[exchange];
  if (!loc || !net || d === undefined) return NaN;
  return Math.max(1, d * net.factor + net.overhead);
}

function rivalName(owner: string): string {
  const id = owner.replace(/^bot:/, '');
  return COMPETITORS.find((c) => c.id === id)?.name ?? 'another firm';
}

/** When a replay of a race should begin: whichever came first, the quote it priced from or the order leaving. */
function raceFrom(o: OpenOrder): number {
  return Math.min(o.sentAt, o.seenAt ?? o.sentAt);
}

function byAt(a: Moment, b: Moment) {
  return a.at - b.at;
}

const ms = (n: number) => `${Math.round(n)} ms`;

// ---- 1. The headline ----------------------------------------------------------------------------------------

const headlineBase: Setup = {
  location: 'home',
  network: 'consumer',
  computer: 'laptop',
  watched: ['QNT', 'ABC', 'XYZ', 'HBK'],
  blocks: [block('momentum')],
};

function headlineTracker(symbol: string): Tracker {
  let headline: Moment | null = null;
  let entry: Moment | null = null;
  let best: { m: Moment; realised: number } | null = null;
  const source: MomentSource = (_g: Game, events: readonly GameEvent[], resolved: readonly OpenOrder[]) => {
    for (const e of events) {
      if (e.kind === 'news' && !headline && e.headline.symbols.includes(symbol)) {
        headline = {
          at: e.at,
          from: e.at - 100,
          kind: 'headline',
          label: `The headline lands: “${e.headline.text}”`,
          symbol,
        };
      }
      if (e.kind === 'fill' && headline && e.fill.symbol === symbol && e.fill.realised !== 0) {
        const r = e.fill.realised - e.fill.fee;
        if (!best || Math.abs(r) > Math.abs(best.realised)) {
          best = {
            realised: r,
            m: {
              at: e.at,
              from: e.at - 60,
              kind: 'exit',
              label: `A position closes for ${dollars(r)}`,
              symbol,
              exchange: e.fill.exchange,
            },
          };
        }
      }
    }
    if (headline && !entry) {
      const o = resolved.find((x) => x.symbol === symbol && x.filled > 0 && x.sentAt >= headline!.at);
      if (o) {
        entry = {
          at: o.ackAt ?? o.arrivedAt ?? o.sentAt,
          from: raceFrom(o),
          kind: 'entry',
          label: `The first order after it: ${o.side} ${o.filled} on ${o.exchange}, ${ms(o.sentAt - headline.at)} after the headline`,
          symbol,
          exchange: o.exchange,
        };
      }
    }
    return [];
  };
  return {
    source,
    pick: () => [headline, entry, best?.m ?? null].filter((m): m is Moment => m !== null).sort(byAt),
  };
}

const perFill = (m: Measures) => (m.fills > 0 ? dollars(m.pnl / m.fills) : '—');

const HEADLINE: Experiment = {
  id: 'headline',
  title: 'The headline',
  teaches: 'Momentum earns from a move that takes seconds, and pays the spread every time it trades.',
  briefing:
    'Monday morning, from a spare room: a laptop on home broadband, running momentum on four stocks. About ' +
    'forty seconds in, a headline about Quantal Systems (QNT) lands, and the price takes a few seconds to ' +
    'catch up with it. Momentum does not read the news. It waits for the price to move and follows it.',
  terms: ['momentum', 'news', 'bid-ask', 'maker-taker'],
  seed: 854,
  startAt: START,
  windowMs: 2 * MS_PER_MINUTE,
  symbol: 'QNT',
  baseline: headlineBase,
  baselineLabel: 'momentum from home',
  changes: [
    {
      id: 'size',
      label: 'Double the size',
      detail: 'Momentum trades 400 shares a call instead of 200. Same calls, twice the shares.',
      apply: (s) => ({ ...s, blocks: [block('momentum', { size: 400 })] }),
    },
    {
      id: 'threshold',
      label: 'Halve the threshold',
      detail: 'Momentum follows a move of 1.5 cents instead of 3. It will trade on smaller moves, and more often.',
      apply: (s) => ({ ...s, blocks: [block('momentum', { threshold: 1.5 })] }),
    },
    {
      id: 'news',
      label: 'Read the headline instead',
      detail: 'Swap momentum for news reaction, which trades on the headline itself the moment it arrives.',
      apply: (s) => ({ ...s, blocks: [block('newsReaction')] }),
    },
  ],
  tracker: () => headlineTracker('QNT'),
  explain: (a, b, change) => {
    const out = [
      `As given, momentum made ${dollars(a.pnl)} on ${a.fills} fills, ${perFill(a)} a fill. ` +
        `With “${change.label}” it made ${dollars(b.pnl)} on ${b.fills}, ${perFill(b)} a fill.`,
    ];
    if (change.id === 'size') {
      out.push(
        b.pnl > a.pnl * 1.6
          ? 'Twice the shares on the same calls is about twice the money. On a morning the calls are wrong it is twice the loss: size multiplies whatever the strategy is.'
          : 'Twice the shares did not make twice the money: bigger orders reach deeper into the book, and each share past the best price costs more.',
      );
    }
    if (change.id === 'threshold') {
      out.push(
        b.fills > a.fills && b.pnl <= a.pnl * 1.1
          ? `It traded ${b.fills - a.fills} more times for no more money. Each extra trade crossed the spread and paid a fee, and the small moves it followed went nowhere.`
          : 'Trading on smaller moves changed what it caught: look at the fills in the replay to see which moves it followed.',
      );
    }
    if (change.id === 'news') {
      out.push(
        b.fills < a.fills
          ? `It traded ${b.fills} times, not ${a.fills}. It read the headline and bought before the price had moved, where momentum had to wait for the move to show itself and bought part of the way up.`
          : 'Reading the headline put it in at the start of the move, not part of the way up.',
      );
    }
    return out.join(' ');
  },
  takeaway:
    'Momentum does not need to be fast: the move it rides takes seconds, which a spare room can still catch. ' +
    'What it pays is the spread, on the way in and the way out. A news reader gets in at the start of the move, ' +
    'but real news readers lose to firms that read faster still, and some headlines move nothing.',
};

// ---- 2. A few miles -----------------------------------------------------------------------------------------

const milesBase: Setup = {
  location: 'home',
  network: 'consumer',
  computer: 'laptop',
  watched: ['ABC', 'QNT', 'HBK', 'MNO'],
  blocks: [block('arbitrage')],
};

function milesTracker(): Tracker {
  let closest: { m: Moment; margin: number } | null = null;
  let widest: { m: Moment; margin: number } | null = null;
  let won: Moment | null = null;
  const source: MomentSource = (_g, _e, resolved) => {
    for (const o of resolved) {
      if (!o.ioc || o.ackAt === null) continue;
      if (o.filled >= o.size && !won) {
        won = {
          at: o.arrivedAt ?? o.ackAt,
          from: raceFrom(o),
          kind: 'won',
          label: `A race won: ${o.side} ${o.size} ${o.symbol} on ${o.exchange}`,
          symbol: o.symbol,
          exchange: o.exchange,
        };
      }
      const first = o.beatenBy[0];
      if (!first || o.arrivedAt === null) continue;
      const margin = o.arrivedAt - first.at;
      const m: Moment = {
        at: o.arrivedAt,
        from: raceFrom(o),
        kind: 'beaten',
        label: `${rivalName(first.owner)} beat you to ${o.symbol} on ${o.exchange} by ${ms(margin)}`,
        symbol: o.symbol,
        exchange: o.exchange,
      };
      if (!closest || margin < closest.margin) closest = { m, margin };
      if (!widest || margin > widest.margin) widest = { m, margin };
    }
    return [];
  };
  return {
    source,
    pick: () => {
      const out = [closest?.m, widest && widest.m !== closest?.m ? widest.m : null, won];
      return out.filter((m): m is Moment => !!m).sort(byAt);
    },
  };
}

const EXCHANGE_IDS = ['HARBOR', 'LAKESIDE', 'PACIFIC'];

function latencies(s: Setup): string {
  return EXCHANGE_IDS.map((e) => `${e} ${ms(latencyMs(s, e))}`).join(', ');
}

function mostLost(m: Measures): [string, number] | null {
  const rows = Object.entries(m.byExchange).sort((x, y) => y[1].beaten - x[1].beaten);
  const top = rows[0];
  return top && top[1].beaten > 0 ? [top[0], top[1].beaten] : null;
}

function medianMargin(m: Measures): number | null {
  const xs = m.beaten.map((b) => b.marginMs).sort((x, y) => x - y);
  return xs.length ? xs[Math.floor(xs.length / 2)]! : null;
}

const MILES: Experiment = {
  id: 'miles',
  title: 'A few miles',
  teaches: 'A millisecond is worth money, but only on the way to where the gaps are.',
  briefing:
    'The same Monday morning, the same headline. Now the laptop runs arbitrage: when one exchange’s ask is below ' +
    'another’s bid, it buys on one and sells on the other. Four rival firms run the same strategy from better ' +
    'seats. Every gap is a race, and the firm whose order lands first wins it. From home your orders take ' +
    `${latencies(milesBase)} to arrive.`,
  terms: ['arbitrage', 'latency', 'colocation', 'fill'],
  seed: 854,
  startAt: START,
  windowMs: 2 * MS_PER_MINUTE,
  symbol: 'QNT',
  baseline: milesBase,
  baselineLabel: 'arbitrage from home',
  changes: [
    {
      id: 'city',
      label: 'Move to the city',
      detail: 'An office in Harbor City, a few miles from the HARBOR exchange. Still on home broadband.',
      apply: (s) => ({ ...s, location: 'city' }),
    },
    {
      id: 'fibre',
      label: 'Lease fibre',
      detail: 'Stay home, but swap broadband for a leased line: a dozen milliseconds of overhead becomes one.',
      apply: (s) => ({ ...s, network: 'fibre' }),
    },
    {
      id: 'rack',
      label: 'A rack at PACIFIC',
      detail: 'A server in the PACIFIC exchange building, on leased fibre to the other two.',
      apply: (s) => ({ ...s, location: 'colo-pacific', network: 'fibre', computer: 'server' }),
    },
  ],
  tracker: milesTracker,
  explain: (a, b, change) => {
    const after = change.apply(structuredClone(milesBase));
    const out = [
      `From home you won ${a.races.won} races and lost ${a.races.beaten} to faster firms, for ${dollars(a.pnl)}. ` +
        `After “${change.label}” you won ${b.races.won} and lost ${b.races.beaten}, for ${dollars(b.pnl)}.`,
      `Your orders now take ${latencies(after)}, against ${latencies(milesBase)} from home.`,
    ];
    const lost = mostLost(b);
    if (lost) {
      const [ex, n] = lost;
      const share = Math.round((100 * n) / Math.max(1, b.races.beaten));
      out.push(
        `${share}% of the races you lost were at ${ex}, ${ms(latencyMs(after, ex))} away` +
          (ex === 'PACIFIC'
            ? ': PACIFIC’s crowd is the slowest to catch up, so it is where most of the gaps open.'
            : '.'),
      );
    }
    const med = medianMargin(b);
    if (med !== null) out.push(`The firms that beat you got there a median ${ms(med)} sooner.`);
    return out.join(' ');
  },
  takeaway:
    'Nothing about the strategy changed between the two runs: only where the orders came from. Being nearer ' +
    'one exchange can leave you further from another, and the gaps are not spread evenly. A one-legged ' +
    'race is worse than none: when one side fills and the other is beaten, the block has to sell back what ' +
    'it bought at a loss.',
};

// ---- 3. The free option -------------------------------------------------------------------------------------

const optionBase: Setup = {
  location: 'colo-harbor-lakeside',
  network: 'fibre',
  computer: 'rack',
  watched: ['QNT'],
  blocks: [block('marketMaker', { halfSpread: 2, newsPause: 0 })],
};

/** How long after a maker fill the tracker looks at the fair value to see whether the fill was a bad one. */
const ADVERSE_AFTER_MS = MS_PER_SECOND;
/** The most fills the tracker waits on at once. */
const MAX_PENDING_FILLS = 500;

function optionTracker(symbol: string): Tracker {
  let headline: Moment | null = null;
  let worst: { m: Moment; cost: number } | null = null;
  const pending: { at: number; side: string; price: number; size: number; exchange: string }[] = [];
  const source: MomentSource = (g, events) => {
    for (const e of events) {
      if (e.kind === 'news' && !headline && e.headline.symbols.includes(symbol)) {
        headline = {
          at: e.at,
          from: e.at - 100,
          kind: 'headline',
          label: `The headline lands: “${e.headline.text}”`,
          symbol,
        };
      }
      if (e.kind === 'fill' && e.fill.symbol === symbol && e.fill.block === 'marketMaker') {
        if (pending.length < MAX_PENDING_FILLS) pending.push({ ...e.fill });
      }
    }
    const fair = g.market.fair.get(symbol);
    while (pending.length > 0 && fair !== undefined && pending[0]!.at + ADVERSE_AFTER_MS <= g.now) {
      const f = pending.shift()!;
      const cost = (f.side === 'buy' ? f.price - fair : fair - f.price) * f.size;
      if (!worst || cost > worst.cost) {
        worst = {
          cost,
          m: {
            at: f.at,
            from: f.at - 80,
            kind: 'picked-off',
            label: `Your quote is taken: ${f.side === 'buy' ? 'you buy' : 'you sell'} ${f.size} at ${(f.price / 100).toFixed(2)}, and a second later it has ${cost > 0 ? `cost you ${dollars(cost)}` : `made you ${dollars(-cost)}`}`,
            symbol,
            exchange: f.exchange,
          },
        };
      }
    }
    return [];
  };
  return {
    source,
    pick: () => [headline, worst?.m ?? null].filter((m): m is Moment => m !== null).sort(byAt),
  };
}

const OPTION: Experiment = {
  id: 'option',
  title: 'The free option',
  teaches: 'A resting quote is an offer to everyone, and the ones who take it know something you do not.',
  briefing:
    'A different Monday. Now you are fast: racks in the HARBOR and LAKESIDE buildings, quoting Quantal Systems ' +
    '(QNT) as a market maker, two cents either side of the price, for three minutes. You earn the spread from anyone ' +
    'who wants to trade. About a minute and a half in, a headline about Quantal lands, and the maker keeps ' +
    'quoting through it.',
  terms: ['market-maker', 'adverse-selection', 'inventory', 'news'],
  seed: 879,
  startAt: START,
  windowMs: 3 * MS_PER_MINUTE,
  symbol: 'QNT',
  baseline: optionBase,
  baselineLabel: 'a colocated market maker',
  changes: [
    {
      id: 'wide',
      label: 'Widen to five cents',
      detail: 'Quote five cents either side instead of two: more on each trade, from fewer takers.',
      apply: (s) => ({ ...s, blocks: [block('marketMaker', { halfSpread: 5, newsPause: 0 })] }),
    },
    {
      id: 'aside',
      label: 'Stand aside for news',
      detail: 'Pull the quotes for thirty seconds whenever a headline lands on the stock.',
      apply: (s) => ({ ...s, blocks: [block('marketMaker', { halfSpread: 2, newsPause: 30 })] }),
    },
    {
      id: 'city',
      label: 'Quote from the city',
      detail: 'Give up the racks for an office a few miles from HARBOR. Slower to move a quote.',
      apply: (s) => ({ ...s, location: 'city' }),
    },
  ],
  tracker: () => optionTracker('QNT'),
  explain: (a, b, change) => {
    const out = [
      `As given, the maker filled ${a.fills} times for ${dollars(a.pnl)}. ` +
        `With “${change.label}” it filled ${b.fills} times for ${dollars(b.pnl)}.`,
    ];
    if (change.id === 'wide') {
      out.push(
        b.fills * 3 < a.fills && b.pnl < 0
          ? 'Almost nobody wanted a quote five cents away, and it still lost: the few who took it were the ones who knew the price had moved past it.'
          : 'A wider quote is taken less often, and only by someone who thinks it is worth more than five cents.',
      );
    }
    if (change.id === 'aside') {
      out.push(
        b.pnl > a.pnl
          ? 'Most of the loss came in the seconds after the headline, when anyone who had read it could take your stale quote. Not being there was worth more than any spread earned.'
          : 'Stepping away did not help this time: look at the replay to see when the bad fills came.',
      );
    }
    if (change.id === 'city') {
      out.push(
        answerOf(a, b) === 'same'
          ? 'A few milliseconds slower and it lost about the same. The loss was not about speed: it was about quoting through news it was not reading.'
          : 'Slower to pull a quote, more of them were taken just before the price moved.',
      );
    }
    return out.join(' ');
  },
  takeaway:
    'A quote sitting on the book is an option you have given away for free: anyone can take it, and they do when ' +
    'it is wrong. That is adverse selection. Real market makers survive it by being the fastest firm to move ' +
    'their quotes, and by not being there when they cannot know the price.',
};

export const EXPERIMENTS: readonly Experiment[] = [HEADLINE, MILES, OPTION];

export function experiment(id: string): Experiment | undefined {
  return EXPERIMENTS.find((e) => e.id === id);
}
