// The experiments: a short window of one trading morning, run once as given, then again with one change the
// player picks, after they guess what it will do. The answer is measured from the two runs, never written in:
// `answerOf` reads it off the two P&Ls and `explain` says why from the numbers. Each window's seed was chosen
// for what it holds (a headline, a run of gaps), and test/experiments.test.ts holds that it still does.

import type { Game, GameEvent, Ledger, Measures, Moment, MomentSource, OpenOrder, Setup } from '../sim';
import { MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND } from '../sim';
import { CONTENT } from './index';
import { CALL_MS, GC, STORAGE_RATE } from './metals';
import { COMPETITORS } from './upgrades';

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
  /** Desks open from the start, besides the stocks': their instruments, venues, rivals and blocks. */
  desks?: readonly string[];
  /**
   * A window later in the week: the days before are stepped a minute at a time, the firm idle, up to this long
   * before `startAt`, and tick by tick from there (`startOf`). Absent, tick by tick from the open.
   */
  warmMs?: number;
  /** The runs keep a ledger of prices, fixes and holdings (`Measures.ledger`), for an experiment about a price. */
  ledger?: boolean;
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
  const loc = CONTENT.locations.find((l) => l.id === setup.location);
  const net = CONTENT.networks.find((n) => n.id === setup.network);
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

/**
 * Seed 70: a headline about Quantal alone, real, lands forty seconds into a window that starts a minute after
 * Monday's open, the first about it in the window. Found by reading each seed's schedule (drawn when the game is
 * built) for that headline 30 to 50 seconds in. Was 854 until the miner moved the stocks' world (2026-11-09).
 */
const HEADLINE_SEED = 70;

const HEADLINE: Experiment = {
  id: 'headline',
  title: 'The headline',
  teaches: 'Momentum earns from a move that takes seconds, and pays the spread every time it trades.',
  briefing:
    'Monday morning, from a spare room: a laptop on home broadband, running momentum on four stocks. About ' +
    'forty seconds in, a headline about Quantal Systems (QNT) lands, and the price takes a few seconds to ' +
    'catch up with it. Momentum does not read the news. It waits for the price to move and follows it.',
  terms: ['momentum', 'news', 'bid-ask', 'maker-taker'],
  seed: HEADLINE_SEED,
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
  seed: HEADLINE_SEED,
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

/**
 * Seed 537: as the headline's, read from the schedule, a real headline about Quantal alone 80 to 100 seconds into
 * the window (93 seconds). Was 879 until the miner moved the stocks' world (2026-11-09).
 */
const OPTION_SEED = 537;

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
  seed: OPTION_SEED,
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

// ---- 4. The lead -------------------------------------------------------------------------------------------

/**
 * Seed 338: of seeds 1 to 1,000, read from the schedule, the one whose hot inflation print lands soonest after the
 * first 100 seconds of the open, so a window can start a minute in with the print forty seconds into it (it lands at
 * 9:31:45). Was 566, from 9:31:06, until the miner moved the stocks' world (2026-11-09).
 */
const LEAD_SEED = 338;
/** The inflation print lands about forty seconds into this window, a minute after the open. */
const LEAD_START = OPEN + 65 * MS_PER_SECOND;

const leadBase: Setup = {
  location: 'colo-prairie',
  network: 'fibre',
  computer: 'rack',
  // Monday's two listed contracts, the near and the next.
  watched: ['IDX', 'IXF0', 'IXF1'],
  blocks: [block('leadLag')],
};

function leadTracker(): Tracker {
  let headline: Moment | null = null;
  let entry: Moment | null = null;
  let closest: { m: Moment; margin: number } | null = null;
  const source: MomentSource = (_g, events, resolved) => {
    for (const e of events) {
      if (e.kind === 'news' && !headline && e.headline.sector === null && e.headline.symbols.length > 1) {
        headline = { at: e.at, from: e.at - 100, kind: 'headline', label: `The headline lands: “${e.headline.text}”` };
      }
    }
    for (const o of resolved) {
      if (o.symbol !== 'IDX') continue;
      if (headline && !entry && o.sentAt >= headline.at) {
        entry = {
          at: o.arrivedAt ?? o.sentAt,
          from: raceFrom(o),
          kind: 'entry',
          label: `The first index order after it: ${o.side} ${o.size} on ${o.exchange}, ${ms(o.sentAt - headline.at)} after the headline, ${o.filled >= o.size ? 'filled' : 'not filled'}`,
          symbol: 'IDX',
          exchange: o.exchange,
        };
      }
      const first = o.beatenBy[0];
      if (!first || o.arrivedAt === null) continue;
      const margin = o.arrivedAt - first.at;
      if (!closest || margin < closest.margin) {
        closest = {
          margin,
          m: {
            at: o.arrivedAt,
            from: raceFrom(o),
            kind: 'beaten',
            label: `${rivalName(first.owner)} beat you to the index on ${o.exchange} by ${ms(margin)}`,
            symbol: 'IDX',
            exchange: o.exchange,
          },
        };
      }
    }
    return [];
  };
  return {
    source,
    pick: () => [headline, entry, closest?.m ?? null].filter((m): m is Moment => m !== null).sort(byAt),
  };
}

const seat = (s: Setup) => `${ms(latencyMs(s, 'PRAIRIE'))} from the future; to the stocks, ${latencies(s)}`;

const LEAD: Experiment = {
  id: 'lead',
  title: 'The lead',
  teaches: 'The future moves first; the lead is worth what your line to the stocks is worth.',
  briefing:
    'Monday morning, with the futures desk open: a rack beside the Prairie Board’s crowd, running lead-lag. The ' +
    'index future is the index carried to Friday, and its crowd catches up with a move in a twentieth of a second; ' +
    'the index’s own books take a second or two. When the future jumps, lead-lag buys the index before its books ' +
    'follow. About forty seconds in, an inflation print moves the whole market. Prairie Partners, on the next rack, ' +
    `reads the same future and races you to the index. On leased fibre your seat is ${seat(leadBase)}.`,
  terms: ['lead-lag', 'future', 'basis', 'latency', 'microwave'],
  seed: LEAD_SEED,
  desks: ['futures'],
  startAt: LEAD_START,
  windowMs: 2 * MS_PER_MINUTE,
  symbol: 'IDX',
  baseline: leadBase,
  baselineLabel: 'lead-lag from a rack at the Prairie Board, on fibre',
  changes: [
    {
      id: 'microwave',
      label: 'Microwave to the stocks',
      detail:
        'The same rack, with a microwave link to the stock exchanges: the same news from the future, there sooner.',
      apply: (s) => ({ ...s, network: 'microwave' }),
    },
    {
      id: 'home',
      label: 'Run it from home',
      detail:
        'Give up the rack and run lead-lag from home, still on fibre: further from the future, and from two of the three stock exchanges.',
      apply: (s) => ({ ...s, location: 'home' }),
    },
    {
      id: 'lakeside',
      label: 'A rack at LAKESIDE, on microwave',
      detail:
        'A rack in the LAKESIDE building on microwave: near the stock exchanges, a few milliseconds from the future.',
      apply: (s) => ({ ...s, location: 'colo-lakeside', network: 'microwave' }),
    },
  ],
  tracker: leadTracker,
  explain: (a, b, change) => {
    const after = change.apply(structuredClone(leadBase));
    const out = [
      `On fibre from the rack you won ${a.races.won} races for the index and lost ${a.races.beaten}, for ${dollars(a.pnl)}. ` +
        `After “${change.label}” you won ${b.races.won} and lost ${b.races.beaten}, for ${dollars(b.pnl)}.`,
      `The seat is now ${seat(after)}. On fibre from the rack it was ${seat(leadBase)}.`,
    ];
    const med = medianMargin(b);
    if (med !== null && b.races.beaten > 0) out.push(`The firm that beat you got there a median ${ms(med)} sooner.`);
    if (change.id === 'microwave') {
      out.push(
        b.races.beaten * 3 < a.races.beaten
          ? 'Both firms knew where the index was going at the same moment. What decided the race was the trip to the stocks, and on the same microwave as Prairie Partners you stopped losing it.'
          : 'The trip to the stocks is shorter, but the races did not all turn: look at the replay for who got there first.',
      );
    }
    if (change.id === 'home') {
      const raced = (m: Measures) => m.races.won + m.races.beaten;
      out.push(
        raced(b) < raced(a)
          ? `From home it saw the future late and raced ${raced(b)} times, not ${raced(a)}: by the time it saw most jumps, the index had already followed. It lost fewer races by entering fewer, not by being faster.`
          : 'From home it saw the future late, and reached the stocks late: every race it entered, it entered behind.',
      );
    }
    if (change.id === 'lakeside') {
      out.push(
        answerOf(a, b) === 'same'
          ? 'Seeing the future later and reaching the stocks sooner came out about even. The lead is a race of two legs, the news from the future and the order to the stocks, and both count.'
          : 'Seeing the future later and reaching the stocks sooner did not come out even: the leg that is shorter decided it.',
      );
    }
    return out.join(' ');
  },
  takeaway:
    'The future is where the market moves first, so a firm that sits beside it knows a second early what the ' +
    'index will do. Knowing is not enough: every firm at the Prairie Board knows it at the same moment, and the ' +
    'money goes to the one whose order reaches the stocks first. Two minutes is too short to measure the money ' +
    'well; the races are where the lesson shows.',
};

// ---- 5. Last look ------------------------------------------------------------------------------------------

/**
 * Seed 30: with the currencies desk open, the dollar jumps nearly nine pips against the yen about forty seconds
 * into a window that starts a minute after Monday's open. Found by reading each seed's `world:fx` for the largest
 * move in a tenth of a second in the first quarter hour (docs/measured.md).
 */
const LOOK_SEED = 30;
/** A move of the euro or the dollar this many pips inside a tenth of a second is the moment worth seeing. */
const JUMP_PIPS = 2;
const PAIRS = ['EURUSD', 'USDJPY', 'EURJPY'];

const triangleOn = (venue: number) => block('triangle', { venue, lots: 100 });

const lookBase: Setup = {
  location: 'colo-eastholm',
  network: 'fibre',
  computer: 'rack',
  watched: PAIRS,
  blocks: [triangleOn(1)],
};

const onBook = (s: Setup): Setup => ({ ...s, blocks: [triangleOn(0)] });

function lookTracker(): Tracker {
  let jump: Moment | null = null;
  let entry: Moment | null = null;
  let refused: Moment | null = null;
  const seen: { at: number; eur: number; usd: number }[] = [];
  const source: MomentSource = (g, _events, resolved) => {
    const eur = g.market.fair.get('EURUSD');
    const usd = g.market.fair.get('USDJPY');
    if (!jump && eur !== undefined && usd !== undefined) {
      seen.push({ at: g.now, eur, usd });
      while (seen[0]!.at < g.now - 100) seen.shift();
      const first = seen[0]!;
      const moves = [
        ['EUR/USD', 'The euro', eur - first.eur],
        ['USD/JPY', 'The dollar', usd - first.usd],
      ] as const;
      for (const [pair, name, d] of moves) {
        if (Math.abs(d) < JUMP_PIPS) continue;
        jump = {
          at: g.now,
          from: first.at,
          kind: 'jump',
          label: `${name} jumps ${Math.abs(d).toFixed(1)} pips ${d > 0 ? 'up' : 'down'} in ${pair}, and the cross has not caught up`,
          symbol: pair.replace('/', ''),
        };
        break;
      }
    }
    for (const o of resolved) {
      if (!PAIRS.includes(o.symbol) || o.block !== 'triangle') continue;
      if (jump && !entry && o.sentAt >= jump.at) {
        entry = {
          at: o.arrivedAt ?? o.sentAt,
          from: raceFrom(o),
          kind: 'entry',
          label: `The triangle's first leg after it: ${o.side} ${o.size} ${o.symbol} on ${o.exchange}, ${o.status === 'refused' ? 'refused' : o.filled >= o.size ? 'filled' : 'not filled'}`,
          symbol: o.symbol,
          exchange: o.exchange,
        };
      }
      if (!refused && o.status === 'refused') {
        refused = {
          at: o.ackAt ?? o.arrivedAt ?? o.sentAt,
          from: raceFrom(o),
          kind: 'refused',
          label: `The dealer looks at your ${o.side} of ${o.size} ${o.symbol} for 5 ms, and refuses it`,
          symbol: o.symbol,
          exchange: o.exchange,
        };
      }
    }
    return [];
  };
  return {
    source,
    pick: () => [jump, entry, refused].filter((m): m is Moment => m !== null).sort(byAt),
  };
}

/** How many of the triangle's legs went out, every one immediate-or-cancel. */
const legs = (m: Measures) => m.races.won + m.races.beaten + m.races.missed;
const share = (n: number, of: number) => `${of > 0 ? Math.round((100 * n) / of) : 0}%`;
/** What happened to the legs the dealer looked at: refused, or found its price gone once the look was over. */
function looked(m: Measures): string {
  const refused = m.refused ?? 0;
  const gone = Math.max(0, m.races.missed - refused);
  return `the dealer refused ${refused} of them and ${gone} more found its price gone when its look was over`;
}

const LOOK: Experiment = {
  id: 'lastlook',
  title: 'Last look',
  teaches: 'A dealer charges no fee and keeps the right to say no; the fills you most want are the ones it keeps.',
  briefing:
    'Monday morning, with the currencies desk open: a rack in Eastholm beside both currency venues, running the ' +
    'triangle with the dealer. When the euro or the dollar jumps, its pair reprices at once and the cross, the euro ' +
    'in yen, is slower: for a moment going round the three pays. The triangle sells the dear side and buys the ' +
    'cheap, three legs at once. The dealer charges no fee, but it holds each order 5 ms before it fills it, and ' +
    'refuses one whose price it has moved away from in the meantime. About forty seconds in, the dollar jumps. ' +
    `From the rack both venues are ${ms(latencyMs(lookBase, 'ASHFORD'))} away.`,
  terms: ['triangular-arbitrage', 'cross-rate', 'dealer', 'last-look', 'pip'],
  seed: LOOK_SEED,
  desks: ['fx'],
  startAt: START,
  windowMs: 2 * MS_PER_MINUTE,
  symbol: 'EURJPY',
  baseline: lookBase,
  baselineLabel: 'the triangle with the dealer, from a rack in Eastholm',
  changes: [
    {
      id: 'book',
      label: 'Trade on the book',
      detail:
        'The same rack and the same triangle, all three legs sent to the book instead: a fee a leg, no look, and Kestrel Currency racing you for the same prices.',
      apply: onBook,
    },
    {
      id: 'home',
      label: 'The dealer, from home',
      detail: 'The triangle with the dealer from home, on fibre: 35 ms from Eastholm instead of a tenth of one.',
      apply: (s) => ({ ...s, location: 'home' }),
    },
    {
      id: 'book-home',
      label: 'The book, from home',
      detail: 'The triangle on the book from home, on fibre: the fees, the races, and every one of them 35 ms late.',
      apply: (s) => ({ ...onBook(s), location: 'home' }),
    },
  ],
  tracker: lookTracker,
  explain: (a, b, change) => {
    const lost = b.races.beaten > 0 ? `, and lost ${b.races.beaten} to a faster firm` : '';
    const out = [
      `With the dealer from the rack the triangle sent ${legs(a)} legs and ${a.races.won} filled in full, for ${dollars(a.pnl)}: ${looked(a)}. ` +
        `After “${change.label}” it sent ${legs(b)} and ${b.races.won} filled in full, paying ${dollars(b.fees)} in fees, for ${dollars(b.pnl)}` +
        (change.id === 'home' ? `: ${looked(b)}.` : `${lost}.`),
    ];
    if (change.id === 'book') {
      out.push(
        b.races.won > a.races.won
          ? `The book filled ${b.races.won} legs in full to the dealer’s ${a.races.won}. The dealer’s legs that missed were the ones sent in the moment its price was stale, which is the only moment a triangle pays: for 5 ms the choice was the dealer’s, and it chose. The book never looks; it charges a fee and lets the fastest have it.`
          : 'The book filled no more than the dealer: here its fees and Kestrel’s races took what the look did not.',
      );
    }
    if (change.id === 'home') {
      const missedA = (a.races.missed * 100) / Math.max(1, legs(a));
      const missedB = (b.races.missed * 100) / Math.max(1, legs(b));
      out.push(
        legs(b) < legs(a)
          ? `From home it saw the jump 35 ms late and sent ${legs(b)} legs, not ${legs(a)}: by then the dealer had repriced the cross, and there was little left to trade. ${share(b.races.missed, legs(b))} of them missed, against ${share(a.races.missed, legs(a))} from the rack${missedB < missedA ? ': the slow firm is turned down less, because it asks for less' : ''}.`
          : 'From home it sent as many legs as from the rack: look at the replay for what the dealer did with them.',
      );
    }
    if (change.id === 'book-home') {
      out.push(
        b.races.beaten > 0
          ? `From home on the book it lost ${b.races.beaten} legs to Kestrel Currency, on the next rack in Eastholm: a lost leg leaves a triangle open, traded back into line at the spread.`
          : 'From home on the book it lost no races: what it saw late, it mostly did not send.',
      );
    }
    return out.join(' ');
  },
  takeaway:
    'A triangle pays only in the moment the cross is stale, and that is the moment a dealer’s price is stale too. ' +
    'A last look is the free option a maker gives away on a book, kept by the maker: no fee to trade, and the fills ' +
    'you most want are the ones it turns down. The faster you are, the more often you catch it, and the more often ' +
    'it says no.',
};

// ---- 6. The fix ---------------------------------------------------------------------------------------------

/** The metals desk's experiments trade gold on Thamesford, from an experiment's own script (`Setup` blocks). */
const GOLD = 'XAU';
const FIX_VENUE = 'THAMESFORD';
/** How many lots of gold the fix experiment buys: about $600,000, three-quarters of what the leverage cap allows. */
export const FIX_LOTS = 25;
/** Monday's 10:00 fix, its call from 09:59:30, and the continuous minute before the call. */
const FIX_AT = 10 * MS_PER_HOUR;
const CALL_OPENS = FIX_AT - CALL_MS;
const MINUTE_FROM = CALL_OPENS - MS_PER_MINUTE;
/** The continuous buy goes in this many slices over its minute, each an IOC a little through the ask. */
const SLICES = 12;
/** Gold's points (ten cents an ounce) a continuous slice reaches past the ask; and a sweep, and a fix order past the indicative. */
const SLICE_REACH = 2;
const SWEEP_REACH = 30;
const FIX_REACH = 60;

/**
 * Seed 2013: with the metals desk open, a central-bank headline lifts gold about $11 an ounce over two minutes from
 * 09:59:31, the first second of the call, so the fix is set while gold rises and the continuous minute is over before
 * it. Found by reading each seed's metals news, drawn on `world:metals` a day ahead as the desk opens, for a headline
 * on gold from two minutes before the 10:00 fix to thirty seconds after it (seeds 1 to 3,000; docs/measured.md).
 */
const FIX_SEED = 2013;

/**
 * A script for the experiment's firm. It names the symbols it trades, gold and its futures, as a script may: a block's
 * `symbols` are the stocks' for a stocks block and the script (5d), but what it sends is not held to them.
 */
const script = (source: string) => ({ id: 'script', enabled: true, params: {}, source });

/** Buy `FIX_LOTS` in slices over the minute before the call: each slice an IOC through the ask, the next once it is done. */
const CONTINUOUS = `// The minute before the call: buy in ${SLICES} slices, each an IOC a little through the ask.
const lots = ${FIX_LOTS}, from = ${MINUTE_FROM}, to = ${CALL_OPENS}, slices = ${SLICES};
if (now >= from && now < to && orders().length === 0) {
  const due = Math.min(lots, Math.ceil((lots * (Math.floor((now - from) / ((to - from) / slices)) + 1)) / slices));
  const q = quote('${FIX_VENUE}', '${GOLD}');
  const want = due - mine('${GOLD}');
  if (want > 0 && q && q.ask !== null) buy('${GOLD}', '${FIX_VENUE}', q.ask + ${SLICE_REACH}, want);
}
`;

/** Rest the whole buy into the call, far through the indicative, and take back what the fix leaves. */
const INTO_FIX = `// In the call: rest the whole buy, priced far through the indicative, and pull what is left after the fix.
const lots = ${FIX_LOTS}, fixAt = ${FIX_AT};
const q = quote('${FIX_VENUE}', '${GOLD}');
const mineNow = orders();
if (q && q.indicative && mineNow.length === 0 && mine('${GOLD}') < lots) {
  const ref = q.indicative.price ?? q.bid;
  if (ref) buy('${GOLD}', '${FIX_VENUE}', ref + ${FIX_REACH}, lots - mine('${GOLD}'), { ioc: false });
}
if (now > fixAt && !(q && q.indicative)) for (const o of mineNow) if (o.status === 'resting') cancel(o.localId);
`;

/** All of it at once, as the minute starts: one IOC far through the ask. */
const SWEEP = `// As the minute starts: the whole buy in one IOC, far through the ask.
const lots = ${FIX_LOTS}, from = ${MINUTE_FROM}, to = ${CALL_OPENS};
const q = quote('${FIX_VENUE}', '${GOLD}');
if (now >= from && now < to && orders().length === 0 && mine('${GOLD}') === 0 && q && q.ask !== null)
  buy('${GOLD}', '${FIX_VENUE}', q.ask + ${SWEEP_REACH}, lots);
`;

const fixBase: Setup = {
  location: 'home',
  network: 'consumer',
  computer: 'laptop',
  watched: [GOLD],
  blocks: [script(CONTINUOUS)],
};

/** The headline on a symbol of a desk published this tick, if any. */
function deskHeadline(g: Game, symbol: string) {
  for (const n of g.deskNews) for (const h of n.tickPublished) if (h.symbols.includes(symbol)) return h;
  return null;
}

function fixTracker(): Tracker {
  let move: Moment | null = null;
  let first: Moment | null = null;
  let fix: Moment | null = null;
  const source: MomentSource = (g, _events, resolved) => {
    const h = deskHeadline(g, GOLD);
    if (h && !move) {
      move = { at: h.at, from: h.at - 100, kind: 'move', label: `The headline lands: “${h.text}”`, symbol: GOLD };
    }
    for (const o of resolved) {
      if (first || o.symbol !== GOLD || o.filled === 0) continue;
      first = {
        at: o.arrivedAt ?? o.sentAt,
        from: raceFrom(o),
        kind: 'entry',
        label: `The first fill: ${o.filled} lots on ${o.exchange}${o.ioc ? '' : ', rested into the fix'}`,
        symbol: GOLD,
        exchange: o.exchange,
      };
    }
    const done = g.market.venue(FIX_VENUE).fixes.find((f) => f.at === FIX_AT && f.symbol === GOLD);
    if (done && !fix) {
      fix = {
        at: done.at,
        from: done.at - 500,
        kind: 'fix',
        label:
          done.price === null
            ? 'The 10:00 fix: nothing crossed'
            : `The 10:00 fix: ${done.volume} lots at ${ounce(done.price)} an ounce`,
        symbol: GOLD,
        exchange: FIX_VENUE,
      };
    }
    return [];
  };
  return { source, pick: () => [move, first, fix].filter((m): m is Moment => m !== null).sort(byAt) };
}

/** Gold's points (ten cents an ounce) as dollars an ounce. */
const ounce = (points: number) =>
  `$${(points / 10).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** A gap in gold's points as cents or dollars an ounce, signed by what follows. */
const perOunce = (points: number) => {
  const a = Math.abs(points) / 10;
  return a < 1 ? `${Math.round(a * 100)}¢` : `$${a.toFixed(2)}`;
};

/** What a run's buying of gold came to: its lots, average, against the mid where each fill was told, and the fix. */
function bought(l: Ledger | undefined) {
  const t = l?.traded[GOLD];
  const fix = l?.fixes.find((f) => f.symbol === GOLD && f.at === FIX_AT)?.price ?? null;
  if (!t || t.bought === 0) return null;
  const avg = t.buyValue / t.bought;
  return {
    lots: t.bought,
    avg,
    overMid: (t.buyValue - t.buyMid) / t.bought,
    overFix: fix === null ? null : avg - fix,
    fix,
  };
}

function boughtText(b: ReturnType<typeof bought>): string {
  if (!b) return 'bought nothing';
  const mid = `${perOunce(b.overMid)} ${b.overMid >= 0 ? 'over' : 'under'} the mid where each fill was told`;
  const fix = b.overFix === null ? '' : `, ${perOunce(b.overFix)} ${b.overFix >= 0 ? 'over' : 'under'} the 10:00 fix`;
  return `bought ${b.lots} lots at ${ounce(b.avg)} an ounce on average: ${mid}${fix}`;
}

const FIX: Experiment = {
  id: 'fix',
  title: 'The fix',
  teaches: 'A large order rested into the fix pays no spread, and gets the price of one moment, wherever it has gone.',
  briefing:
    `Monday morning, with the metals desk open, from a spare room. You must buy ${FIX_LOTS} lots of gold, about ` +
    `$${Math.round((FIX_LOTS * 24_000) / 1000)},000 of it. As given, a script buys it in the minute before Thamesford’s ` +
    'call, a slice every five seconds, each an IOC a little through the ask. At 09:59:30 the call opens: thirty ' +
    'seconds when nothing trades, an IOC is refused, and everything rested crosses at 10:00 at one price, the fix. ' +
    'Clients send their own orders for the fix in its last moments. About a second into the call, a headline about ' +
    `gold lands. From home Thamesford is ${ms(latencyMs(fixBase, FIX_VENUE))} away.`,
  terms: ['fix', 'call-auction', 'uncrossing-price', 'fix-flow', 'spot', 'slippage'],
  seed: FIX_SEED,
  desks: ['metals'],
  warmMs: 2 * MS_PER_MINUTE,
  ledger: true,
  startAt: MINUTE_FROM - 30 * MS_PER_SECOND,
  windowMs: 3 * MS_PER_MINUTE,
  symbol: GOLD,
  baseline: fixBase,
  baselineLabel: 'the minute before the call, in slices, from home',
  changes: [
    {
      id: 'fix',
      label: 'Rest it into the fix',
      detail: 'Wait for the call and rest the whole buy in it, priced far through the indicative, to fill at the fix.',
      apply: (s) => ({ ...s, blocks: [script(INTO_FIX)] }),
    },
    {
      id: 'sweep',
      label: 'All at once',
      detail: 'The whole buy in one IOC as the minute starts, far through the ask: it takes the book as it stands.',
      apply: (s) => ({ ...s, blocks: [script(SWEEP)] }),
    },
    {
      id: 'rack',
      label: 'Slices from a rack',
      detail: 'The same slices from a rack in Thamesford, a millisecond from the book instead of seventy.',
      apply: (s) => ({ ...s, location: 'colo-thamesford', network: 'fibre', computer: 'rack' }),
    },
  ],
  tracker: fixTracker,
  explain: (a, b, change) => {
    const ba = bought(a.ledger);
    const bb = bought(b.ledger);
    const fix = ba?.fix ?? bb?.fix ?? null;
    const out = [
      `As given you ${boughtText(ba)}, for ${dollars(a.pnl)} by the end of the window. ` +
        `With “${change.label}” you ${boughtText(bb)}, for ${dollars(b.pnl)}.`,
    ];
    if (change.id === 'fix' && ba && bb) {
      out.push(
        bb.overMid < ba.overMid
          ? `Against the mid the fix cost ${perOunce(ba.overMid - bb.overMid)} an ounce less than the slices: nobody at a fix pays a spread, and the whole order met the whole call at once.`
          : 'Against the mid the fix cost no less than the slices: your own lots, and any clients buying in the call, pushed its one price up, where each slice took the ask and the book filled in again behind it.',
      );
      out.push(
        fix !== null && bb.avg > ba.avg
          ? `But it was a price of 10:00, and by 10:00 gold had risen with the headline: the fix was ${perOunce(bb.avg - ba.avg)} an ounce dearer than the minute before the call. Waiting for the fix is a bet on where the price will be.`
          : `And the fix was ${perOunce(ba.avg - bb.avg)} an ounce cheaper in all.`,
      );
    }
    if (change.id === 'sweep' && ba && bb) {
      out.push(
        bb.overMid > ba.overMid
          ? `One order for all of it took the book level by level, ${perOunce(bb.overMid)} an ounce over the mid against ${perOunce(ba.overMid)} for the slices: the crowd had only so many lots at each price.`
          : 'One order for all of it found the book deep enough this time: look at the replay for the levels it took.',
      );
    }
    if (change.id === 'rack') {
      out.push(
        answerOf(a, b) === 'same'
          ? 'From the rack the slices cost about the same: nobody was racing you for them, so speed bought nothing. A large order is a question of where and when, not how fast.'
          : 'From the rack the slices landed sooner after each look at the ask, and paid a different price for it.',
      );
    }
    return out.join(' ');
  },
  takeaway:
    'A fix gathers the whole market at one moment and fills everyone at one price, so a large order there pays no ' +
    'spread, though your own size is in that price, as in any trade. The price is the moment’s, though: whatever the market did ' +
    'before 10:00 is in it, and so are the clients who sent their orders for the fix on one side. Real funds buy at ' +
    'the fix to get the benchmark price, not the best one.',
};

// ---- 7. Delivery -------------------------------------------------------------------------------------------

/** How many lots of the week's gold future the delivery experiment holds: about $1.4 million of gold, on $200,000. */
export const DELIVERY_LOTS = 60;
/** The week's gold future and the next, as Friday's afternoon has them; it expires at 13:30. */
const WEEK = `${GC.root}0`;
const NEXT = `${GC.root}1`;
const EXPIRY = GC.expiresAt;
/** The minute before the expiry, when the roll or the close goes. */
const ROLL_AT = EXPIRY - MS_PER_MINUTE;
const DELIVERY_VENUE = 'HUDSON';
/** Points a delivery order reaches past the touch. */
const DELIVERY_REACH = 10;

/**
 * Seed 1: any seed holds the week's expiry. Friday 13:30, two minutes and a half into a four-minute window that starts
 * at 13:27:30, after the days before are stepped a minute at a time.
 */
const DELIVERY_SEED = 1;

/** Buy the lots of the week's future as the window opens; at the minute before expiry, `then`. */
const deliveryScript = (
  lots: number,
  then: 'hold' | 'roll' | 'close',
) => `// Buy ${lots} of the week's contract, then ${then}.
const lots = ${lots}, rollAt = ${ROLL_AT}, week = '${WEEK}', next = '${NEXT}', venue = '${DELIVERY_VENUE}';
const then = '${then}';
const busy = orders().length > 0;
const w = quote(venue, week), n = quote(venue, next);
const after = now >= rollAt && then !== 'hold';
if (!busy && !after && mine(week) < lots && w && w.ask !== null) buy(week, venue, w.ask + ${DELIVERY_REACH}, lots - mine(week));
if (!busy && after && mine(week) > 0 && w && w.bid !== null) sell(week, venue, w.bid - ${DELIVERY_REACH}, mine(week));
if (!busy && after && then === 'roll' && mine(next) < lots && n && n.ask !== null) buy(next, venue, n.ask + ${DELIVERY_REACH}, lots - mine(next));
`;

const deliveryBase: Setup = {
  location: 'colo-hudson',
  network: 'fibre',
  computer: 'rack',
  watched: [GOLD, WEEK, NEXT],
  blocks: [script(deliveryScript(DELIVERY_LOTS, 'hold'))],
};

const homeFibre = (s: Setup): Setup => ({ ...s, location: 'home', network: 'fibre', computer: 'server' });

function deliveryTracker(): Tracker {
  let entry: Moment | null = null;
  let roll: Moment | null = null;
  let expiry: Moment | null = null;
  const source: MomentSource = (g, _events, resolved) => {
    for (const o of resolved) {
      if (o.filled === 0) continue;
      if (!entry && o.symbol === WEEK && o.side === 'buy') {
        entry = {
          at: o.arrivedAt ?? o.sentAt,
          from: raceFrom(o),
          kind: 'entry',
          label: `You buy ${o.filled} of the week’s gold future, ${WEEK}`,
          symbol: WEEK,
          exchange: o.exchange,
        };
      }
      if (!roll && o.sentAt >= ROLL_AT && o.symbol === WEEK && o.side === 'sell') {
        roll = {
          at: o.arrivedAt ?? o.sentAt,
          from: raceFrom(o),
          kind: 'roll',
          label: `A minute before expiry: sell ${o.filled} of ${WEEK}`,
          symbol: WEEK,
          exchange: o.exchange,
        };
      }
    }
    if (!expiry && g.now >= EXPIRY) {
      const held = g.firm.positions.get(GOLD)?.qty ?? 0;
      expiry = {
        at: EXPIRY,
        from: EXPIRY - 1000,
        kind: 'expiry',
        label:
          held === 0
            ? `13:30, ${WEEK} expires: nothing of it was held, so nothing is delivered`
            : `13:30, ${WEEK} expires and is delivered: you hold ${held} lots of gold, paid for in cash`,
        symbol: GOLD,
      };
    }
    return [];
  };
  return { source, pick: () => [entry, roll, expiry].filter((m): m is Moment => m !== null).sort(byAt) };
}

/** What the gold held at the end will cost in storage a night, and on a Friday, from its value at the end. */
function storageText(m: Measures): string {
  const held = m.ledger?.held[GOLD];
  const cash = m.ledger ? `, and the firm's cash is ${dollars(m.ledger.cash.end)}` : '';
  if (!held || held.qty <= 0) return `no gold is held, so no storage is due${cash}`;
  const night = (held.value * STORAGE_RATE) / 365;
  return (
    `the ${held.qty} lots of gold delivered, ${dollars(held.value)} of it, will pay ${dollars(night)} of storage a ` +
    `night at 17:00, ${dollars(3 * night)} tonight for the weekend${cash}`
  );
}

const DELIVERY: Experiment = {
  id: 'delivery',
  title: 'Delivery',
  teaches: 'A future held to expiry becomes the metal itself: its whole price in cash, and storage every night.',
  briefing:
    `Friday afternoon, with the metals desk open: a rack at Hudson, beside the gold futures. A script buys ` +
    `${DELIVERY_LOTS} of the week’s gold future, ${WEEK}, as the window opens, about ` +
    `${dollars(DELIVERY_LOTS * 2_400_000)} of gold for a margin of about ${dollars(DELIVERY_LOTS * 192_000)}. ` +
    `It expires at 13:30, two and a half minutes in, and is delivered: whoever holds it then is paid the gold and ` +
    'pays for it. As given, the script holds it through. Both spot venues are shut on a Friday afternoon, and gold ' +
    'held long pays storage at 17:00, three nights on a Friday.',
  terms: ['delivery', 'storage', 'future', 'margin', 'spot', 'futures-curve'],
  seed: DELIVERY_SEED,
  desks: ['metals'],
  warmMs: 2 * MS_PER_MINUTE,
  ledger: true,
  startAt: EXPIRY - 150 * MS_PER_SECOND,
  windowMs: 4 * MS_PER_MINUTE,
  symbol: WEEK,
  baseline: deliveryBase,
  baselineLabel: 'the week’s gold future held through expiry, from a rack at Hudson',
  changes: [
    {
      id: 'roll',
      label: 'Roll it',
      detail: `A minute before expiry, sell the week’s contract and buy as many of the next week’s, ${NEXT}.`,
      apply: (s) => ({ ...s, watched: [GOLD, WEEK, NEXT], blocks: [script(deliveryScript(DELIVERY_LOTS, 'roll'))] }),
    },
    {
      id: 'close',
      label: 'Close it',
      detail: 'A minute before expiry, sell the week’s contract and hold nothing.',
      apply: (s) => ({ ...s, blocks: [script(deliveryScript(DELIVERY_LOTS, 'close'))] }),
    },
    {
      id: 'home',
      label: 'Hold it from home',
      detail: `The same contracts held through, from home on fibre: ${ms(latencyMs(homeFibre(deliveryBase), DELIVERY_VENUE))} from Hudson instead of ${ms(latencyMs(deliveryBase, DELIVERY_VENUE))}.`,
      apply: homeFibre,
    },
  ],
  tracker: deliveryTracker,
  explain: (a, b, change) => {
    const out = [
      `Held through, ${storageText(a)}; the window's P&L was ${dollars(a.pnl)}, on ${a.fills} fills. ` +
        `After “${change.label}”, ${storageText(b)}; the window's P&L was ${dollars(b.pnl)}, on ${b.fills} fills.`,
    ];
    if (change.id === 'roll') {
      const next = b.ledger?.held[NEXT];
      out.push(
        `Rolled, the firm holds ${next?.qty ?? 0} of ${NEXT} instead: the same gold a week later, still on margin, and ` +
          `it paid ${dollars(b.fees - a.fees)} more in fees and two more spreads for it. Its price carries a week of ` +
          'storage already, so nothing is charged at 17:00.',
      );
    }
    if (change.id === 'close') {
      out.push(
        'Closed, the firm is out: one more spread and fee, and nothing to store, nothing to sell over a weekend when ' +
          'no spot venue is open.',
      );
    }
    if (change.id === 'home') {
      out.push(
        answerOf(a, b) === 'same'
          ? 'From home it came to about the same: the same gold, the same cash gone and the same storage. Delivery is no race; nobody is faster out of it by sitting nearer.'
          : 'From home the contracts were bought a little later, at other prices, and the gold moved meanwhile: the delivery and its storage were the same.',
      );
    }
    return out.join(' ');
  },
  takeaway:
    'A future is cheap to hold because it ends: until expiry it asks only margin. Held through a delivered expiry, ' +
    'it becomes the metal, paid for in full from cash, and the metal costs storage every night until it is sold. ' +
    'A trader who wants the exposure rolls to the next contract before expiry, and pays two spreads for it.',
};

export const EXPERIMENTS: readonly Experiment[] = [HEADLINE, MILES, OPTION, LEAD, LOOK, FIX, DELIVERY];

export function experiment(id: string): Experiment | undefined {
  return EXPERIMENTS.find((e) => e.id === id);
}
