// The signals: what the firm's own reports say is worth looking at, in the house voice, each with the number
// it was seen at, why it matters, and what would test it. Pure, from the day reports and the snapshot. The words
// are drafts for the author to edit. A signal never names a block or feature the stage hides.

import { BLOCKS, type CompetitorSpec, type DayReport, type Snapshot } from '../sim';
import type { Feature } from './stages';
import { COMPETITORS } from './upgrades';

export interface Signal {
  /** Stable per kind and subject, e.g. `beaten:harbor-quant` or `bleeds:momentum`. */
  id: string;
  kind: 'beaten' | 'fees' | 'bleeds' | 'weather' | 'capacity' | 'concentrated' | 'rival' | 'slot';
  title: string;
  /** What was seen, with the number. */
  seen: string;
  /** Why it matters: the lesson. */
  why: string;
  /** What would test it, in words; null for a lesson with no test. */
  test: string | null;
  /** Variant ids or `about` ids for `variants({ prefer })`. Empty where nothing the game can run would test it. */
  prefer: string[];
  /** A glossary id the page links. */
  term?: string;
  /** For ordering: roughly how many times over its threshold, or a share, on one scale. */
  strength: number;
}

/** The most signals the page shows. */
export const MAX_SIGNALS = 6;

// Every threshold fires at its value (>=), and not under it. Unless said, they read the last day kept.

/** A rival won this share of the day's races or more... */
export const BEATEN_SHARE = 0.4;
/** ...of at least this many races. */
export const BEATEN_MIN_RACES = 10;
/** Fees are this share of gross (realised, before fees) or more, on the last day. */
export const FEES_SHARE = 0.5;
/** A block's net is below nought on each of its last this-many days that it ran. */
export const BLEED_DAYS = 3;
/** A block's average by kind of day must rest on at least this many days of each of two kinds that differ in sign. */
export const WEATHER_MIN_DAYS = 2;
/** Orders dropped for capacity on the last day. */
export const CAPACITY_MIN_DROPPED = 1;
/** One symbol is this share of the absolute net across the days kept... */
export const CONCENTRATED_SHARE = 0.7;
/** ...from at least this many fills. */
export const CONCENTRATED_MIN_FILLS = 30;
/** A rival on the same block earned this much (cents) or more on the last day, and more than the firm's block. */
export const RIVAL_MIN_PNL = 10_000;
/** ...and is at least this many ms nearer the exchanges than the firm. */
export const RIVAL_GAP_MS = 1;

/**
 * For each block, the parameter that, stepped up, makes it trade less: a higher edge or threshold, a wider quote,
 * a bigger print to wait for. The news block has none (its size and window change how much, not how often), so
 * the fees signal tests nothing for it and says so.
 */
export const FEWER_TRADES: Readonly<Record<string, string>> = {
  arbitrage: 'minEdge',
  sniper: 'threshold',
  indexArb: 'threshold',
  marketMaker: 'halfSpread',
  anticipate: 'bigPrint',
  momentum: 'threshold',
  meanReversion: 'threshold',
  pairs: 'threshold',
};

export interface SignalOptions {
  /** Whether the stage shows a feature. */
  shown: (feature: Feature) => boolean;
  /** The rivals' specs; the game's own where absent. */
  content?: { competitors: readonly CompetitorSpec[] };
}

const usd = (cents: number): string =>
  `${cents < 0 ? '-' : ''}$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`;
const pct = (x: number): string => `${Math.round(100 * x)}%`;
const net = (t: { realised: number; fees: number }): number => t.realised - t.fees;
const blockName = (id: string): string => BLOCKS.find((b) => b.spec.id === id)?.spec.name ?? id;
const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Block ids that are not blocks the player chose: the hand's trades. */
const isBlock = (id: string): boolean => BLOCKS.some((b) => b.spec.id === id) || id === 'script';

/** The next rung of a kind of upgrade, as `variants` picks it: cheapest not owned, not in use, above the current. */
function nextRung(s: Snapshot, kind: 'location' | 'network' | 'computer'): string | null {
  const current = s.shop.find((o) => o.kind === kind && o.inUse)?.spec.price ?? 0;
  const next = s.shop
    .filter((o) => o.kind === kind && !o.owned && !o.inUse && o.spec.price > current)
    .sort((a, b) => a.spec.price - b.spec.price || a.spec.id.localeCompare(b.spec.id))[0];
  return next ? `upgrade:${kind}:${next.spec.id}` : null;
}

const nearest = (latency: Record<string, number>): number => {
  const v = Object.values(latency);
  return v.length ? Math.min(...v) : Infinity;
};

/** The days a block ran, oldest first, with its net on each. */
function ran(days: readonly DayReport[], block: string): { day: DayReport; net: number }[] {
  const out: { day: DayReport; net: number }[] = [];
  for (const d of days) {
    const t = d.byBlock[block];
    if (t && t.fills > 0) out.push({ day: d, net: net(t) });
  }
  return out;
}

/**
 * What the reports and the snapshot say is worth a look, strongest first, at most `MAX_SIGNALS`. `days` is
 * oldest first, as the game keeps them. A fresh game gives at most the free slot.
 */
export function signals(days: readonly DayReport[], s: Snapshot, opts: SignalOptions): Signal[] {
  const out: Signal[] = [];
  const last = days[days.length - 1];
  const rivals = opts.content?.competitors ?? COMPETITORS;
  const enabled = new Set(s.blocks.filter((b) => b.enabled).map((b) => b.id));
  const blockShown = (id: string) => opts.shown(`block:${id}` as Feature);
  const races = opts.shown('races');
  const rungs = (...kinds: ('location' | 'network' | 'computer')[]) =>
    kinds.map((k) => nextRung(s, k)).filter((x): x is string => x !== null);

  if (last && races && last.beatenBy) {
    const total = last.races.won + last.races.beaten + last.races.missed;
    const top = Object.entries(last.beatenBy).sort((a, b) => b[1].count - a[1].count)[0];
    if (top && total >= BEATEN_MIN_RACES && top[1].count / total >= BEATEN_SHARE) {
      const [name, t] = top;
      const share = t.count / total;
      const spec = rivals.find((r) => r.name === name);
      out.push({
        id: `beaten:${spec?.id ?? slug(name)}`,
        kind: 'beaten',
        title: 'Beaten to the trade',
        seen: `${name} beat you in ${pct(share)} of races yesterday, by ${Math.round(t.medianMs)} ms at the median.`,
        why:
          'In a race for a price the order that arrives first fills and the other finds it gone. A few ms is the ' +
          'whole gap, and it is bought with distance and the line: a nearer office or a faster link.',
        test: 'Try the next office and the next link, and see how many of the same races are won.',
        prefer: rungs('location', 'network'),
        term: 'latency',
        strength: share / BEATEN_SHARE,
      });
    }
  }

  if (last) {
    const blocks = Object.entries(last.byBlock).filter(([id]) => isBlock(id) && blockShown(id));
    const gross = blocks.reduce((n, [, t]) => n + t.realised, 0);
    const fees = blocks.reduce((n, [, t]) => n + t.fees, 0);
    if (gross > 0 && fees >= FEES_SHARE * gross) {
      const worst = [...blocks].sort((a, b) => b[1].fees - a[1].fees)[0]![0];
      const param = enabled.has(worst) ? paramOf(worst, FEWER_TRADES[worst]) : null;
      const up = param ? `param:${worst}:${param.key}:up` : null;
      out.push({
        id: 'fees:day',
        kind: 'fees',
        title: 'Fees eat the edge',
        seen: `Fees were ${pct(fees / gross)} of what the trades made yesterday: ${usd(fees)} of ${usd(gross)}.`,
        why:
          'Every share costs a fee at the exchange, win or lose. A strategy that trades for a sliver pays the ' +
          'fee on every sliver, and the profit left after it is what counts. Fewer, better trades can earn more.',
        test: param
          ? `Raise ${blockName(worst)}'s ${param.name.toLowerCase()} so it trades less, and compare the P&L after fees.`
          : `There is no change the game can test that makes ${blockName(worst)} trade less: compare its fees with what it makes over the next days.`,
        prefer: up ? [up] : [],
        term: 'maker-taker',
        strength: fees / gross / FEES_SHARE,
      });
    }
  }

  for (const block of enabled) {
    if (!isBlock(block) || !blockShown(block)) continue;
    const r = ran(days, block);
    const recent = r.slice(-BLEED_DAYS);
    if (recent.length >= BLEED_DAYS && recent.every((x) => x.net < 0)) {
      const sum = recent.reduce((n, x) => n + x.net, 0);
      out.push({
        id: `bleeds:${block}`,
        kind: 'bleeds',
        title: 'A block bleeds',
        seen: `${blockName(block)} lost money on each of its last ${BLEED_DAYS} days: ${usd(sum)} in all, after fees.`,
        why:
          'A block can be right in theory and wrong for this market, this speed or this seat. Three bad days is ' +
          'not proof, but it is a reason to ask what the firm earns without it.',
        test: `Switch ${blockName(block)} off and compare the same windows.`,
        prefer: enabled.size > 1 ? [`off:${block}`] : [],
        term: 'pnl',
        strength: 1 + Math.abs(sum) / 100_000,
      });
    }
  }

  const regimeOf = (d: DayReport) => d.regime;
  for (const block of new Set(days.flatMap((d) => Object.keys(d.byBlock)))) {
    if (!isBlock(block) || !blockShown(block)) continue;
    const by = new Map<string, number[]>();
    for (const x of ran(days, block)) {
      const k = regimeOf(x.day);
      if (k) by.set(k, [...(by.get(k) ?? []), x.net]);
    }
    const avgs = [...by.entries()]
      .filter(([, v]) => v.length >= WEATHER_MIN_DAYS)
      .map(([k, v]) => ({ k, avg: v.reduce((n, x) => n + x, 0) / v.length }));
    const best = avgs.filter((a) => a.avg > 0).sort((a, b) => b.avg - a.avg)[0];
    const worst = avgs.filter((a) => a.avg < 0).sort((a, b) => a.avg - b.avg)[0];
    if (best && worst) {
      out.push({
        id: `weather:${block}`,
        kind: 'weather',
        title: 'Lives by the weather',
        seen: `${blockName(block)} averaged ${usd(best.avg)} on ${best.k} days and ${usd(worst.avg)} on ${worst.k} days.`,
        why:
          'Some strategies suit one kind of day and not another. A good average can hide a block that earns in ' +
          'one weather and pays it back in the next. Knowing which days it likes is the edge; there is nothing ' +
          'to switch, only to watch.',
        test: null,
        prefer: [],
        term: 'regimes',
        strength: (best.avg - worst.avg) / Math.max(1, Math.abs(best.avg) + Math.abs(worst.avg)) + 0.5,
      });
    }
  }

  if (last && last.dropped !== undefined && last.dropped >= CAPACITY_MIN_DROPPED) {
    out.push({
      id: 'capacity:orders',
      kind: 'capacity',
      title: 'Out of capacity',
      seen: `${last.dropped} orders were dropped yesterday because the computer could not send them.`,
      why:
        'A computer sends so many orders a second and no more; the rest are thrown away, and they are often the ' +
        'ones that mattered. Faster hardware is part of the race as much as a faster line.',
      test: 'Try the next computer and see what the dropped orders were worth.',
      prefer: rungs('computer'),
      term: 'capacity',
      strength: 1 + Math.min(1, last.dropped / 100),
    });
  }

  const sym = new Map<string, { net: number; fills: number }>();
  for (const d of days)
    for (const [k, t] of Object.entries(d.bySymbol)) {
      const x = sym.get(k) ?? { net: 0, fills: 0 };
      x.net += net(t);
      x.fills += t.fills;
      sym.set(k, x);
    }
  const fillsAll = [...sym.values()].reduce((n, x) => n + x.fills, 0);
  const absAll = [...sym.values()].reduce((n, x) => n + Math.abs(x.net), 0);
  const topSym = [...sym.entries()].sort((a, b) => Math.abs(b[1].net) - Math.abs(a[1].net))[0];
  if (
    topSym &&
    fillsAll >= CONCENTRATED_MIN_FILLS &&
    absAll > 0 &&
    Math.abs(topSym[1].net) >= CONCENTRATED_SHARE * absAll
  ) {
    const share = Math.abs(topSym[1].net) / absAll;
    out.push({
      id: `concentrated:${topSym[0]}`,
      kind: 'concentrated',
      title: 'One stock carries it',
      seen: `${topSym[0]} made ${pct(share)} of the firm's result ${days.length === 1 ? 'yesterday' : `over the last ${days.length} days`} (${usd(topSym[1].net)}).`,
      why:
        'When one name does nearly all the work, a good run may be luck, or a story about that one company, and ' +
        'not an edge in the method. The same block on other stocks would show which.',
      test: 'Watch another stock for a few days and see whether the result holds.',
      prefer: [],
      term: 'concentration',
      strength: share / CONCENTRATED_SHARE,
    });
  }

  if (last && races) {
    for (const spec of rivals) {
      const ids = spec.blocks ? spec.blocks.map((b) => b.id) : ['arbitrage'];
      const mine = ids.find((id) => enabled.has(id) && blockShown(id));
      const theirs = last.rivals.find((r) => r.name === spec.name);
      const them = s.competitors.find((c) => c.id === `bot:${spec.id}` || c.id === spec.id || c.name === spec.name);
      if (!mine || !theirs || !them) continue;
      const myNet = last.byBlock[mine] ? net(last.byBlock[mine]) : 0;
      const gap = nearest(s.latency) - nearest(them.latency);
      if (theirs.pnl >= RIVAL_MIN_PNL && theirs.pnl > myNet && gap >= RIVAL_GAP_MS) {
        out.push({
          id: `rival:${spec.id}`,
          kind: 'rival',
          title: 'A rival does it better',
          seen:
            `${spec.name} runs ${blockName(mine)} too and earned ${usd(theirs.pnl)} yesterday to your ${usd(myNet)}. ` +
            `Its orders reach the exchange ${Math.round(gap)} ms sooner than yours.`,
          why:
            'The same idea earns more from a nearer seat. A rival that does what you do and wins is showing what ' +
            'the gap in latency is worth, and what the next rung of the shop might add.',
          test: 'Try the next office and the next link, and see how much of its lead closes.',
          prefer: rungs('location', 'network'),
          term: 'latency',
          strength: Math.min(2, theirs.pnl / Math.max(RIVAL_MIN_PNL, Math.abs(myNet), 1)) * 0.5 + 0.5,
        });
      }
    }
  }

  if (s.capacity.blocksUsed < s.capacity.maxBlocks) {
    const free = s.blocks.find((b) => !b.enabled && b.id !== 'script' && blockShown(b.id));
    if (free) {
      out.push({
        id: 'slot:free',
        kind: 'slot',
        title: 'A free slot',
        seen: `The computer runs ${s.capacity.blocksUsed} of the ${s.capacity.maxBlocks} blocks it can.`,
        why:
          'A block that is off earns nothing. Another idea on the spare room of the machine costs no more to ' +
          'run, and a second kind of trade often earns on the days the first does not.',
        test: `Add ${blockName(free.id)} and compare the same windows.`,
        prefer: [free.id],
        term: 'capacity',
        strength: 0.3,
      });
    }
  }

  return out.sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id)).slice(0, MAX_SIGNALS);
}

/** A block's parameter by key, from the registry; null where either is unknown. */
function paramOf(block: string, key: string | undefined): { key: string; name: string } | null {
  if (!key) return null;
  return BLOCKS.find((b) => b.spec.id === block)?.spec.params.find((p) => p.key === key) ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// The words the Overview, the block cards and the day reports read their working in. The thresholds are in
// overview.ts (a record's sign); the words are drafts for the author to edit, and each concept is linked.

/** What a block's record over the days kept says, by kind: the sentence and the glossary entry to read more. */
export const BLOCK_VERDICT_WORDS: Readonly<
  Record<'none' | 'earns' | 'fees' | 'loses', { text: string; term: string | null }>
> = {
  none: {
    text: 'Has not traded in the days kept, so there is nothing to read yet. A block that stays quiet usually has a rule that never fires.',
    term: null,
  },
  earns: {
    text: 'Earns after fees: its trades make more than they cost. Look at how many days that rests on before trusting it.',
    term: 'attribution',
  },
  fees: {
    text: 'The signal earns but the fees take it: the trades make money before fees and lose it after. Trade less often, or for more each time.',
    term: 'maker-taker',
  },
  loses: {
    text: 'The signal itself loses, before any fee: the spread and adverse selection cost more than the idea earns.',
    term: 'adverse-selection',
  },
};

/** The sentences of "why did I lose money today": a loss names what took it, a gain what made it. */
export const DAY_CAUSE_WORDS = {
  fees: (amount: string) => `Fees took ${amount}: the exchanges' charge on every fill, win or lose.`,
  fines: (amount: string) => `Fines took ${amount}: the regulator's charge for how the orders were sent.`,
  rollover: (amount: string, gain: boolean) =>
    gain
      ? `Rollover earned ${amount}: the interest on the currencies held at 17:00.`
      : `Rollover cost ${amount}: the interest paid on the currencies held at 17:00.`,
  storage: (amount: string, gain: boolean) =>
    gain
      ? `Storage and the lease earned ${amount} on the metal held at 17:00.`
      : `Storage and the lease cost ${amount} on the metal held at 17:00.`,
  block: (name: string, amount: string, gain: boolean) =>
    gain ? `${name} earned ${amount}, the most of any block.` : `${name} lost ${amount}, the worst of any block.`,
  symbol: (symbol: string, amount: string, gain: boolean) =>
    gain ? `${symbol} earned ${amount}, the most of any stock.` : `${symbol} lost ${amount}, the worst of any stock.`,
  rival: (name: string, amount: string) =>
    `${name} took quotes off you worth ${amount}: the price ran against them a second after.`,
  quiet: 'Nothing traded and nothing was charged: a quiet day.',
} as const;

/** The day report's sentence about one rival: what it took off the firm's resting quotes and the races it won. */
export const RIVAL_DAY_WORDS = {
  /** `worth` is the mark-out in cents already worded (a dollar figure), or null where the price did not run against the firm. */
  taken: (name: string, count: number, worth: string | null) =>
    `${name} took ${count} ${count === 1 ? 'quote' : 'quotes'} off you` +
    (worth ? `, worth ${worth}` : ', though the price did not run against you after'),
  beaten: (count: number, medianMs: string) =>
    `beat you to ${count} ${count === 1 ? 'order' : 'orders'} by a median ${medianMs}`,
  /** What the quote's worth is read against, for the line under the sentences. */
  note: 'A quote’s worth is how far the mid moved against it in the second after it was taken.',
} as const;

/** The glossary entry the rivals' sentences link to. */
export const RIVAL_TERM = 'picked-off';

/** The glossary entry the day's cause links to. */
export const DAY_CAUSE_TERM = 'day-cause';

/** What the Overview says is still to come, and when: until the first close, and until a signal is raised. */
export const OVERVIEW_COMING_WORDS = {
  first:
    'After the first close, Trends and Comparisons appear below, with the days charted and last night’s tests. Signals follow once the reports show something worth a look.',
  signals: 'Signals appear below once the reports show something worth a look, after a few closes.',
} as const;

/**
 * The line under the top bar when something happens that the player should see once: a margin call, a fine, a halt,
 * a delivery, a closed round, the day's first race won, an unlock. One sentence a kind with its figure; the figures
 * arrive already worded (money as dollars), the way the other tables here take them. Drafts, for the author to edit.
 */
export const MOMENT_WORDS = {
  margin: (symbols: string) =>
    `Margin call: the firm fell below the maintenance margin and was flattened in ${symbols}. It trades on.`,
  fine: (cents: string, reason: string) => `The regulator fined you ${cents}: ${reason}.`,
  halt: (reason: string) => `Halted: ${reason}. Resting orders are pulled and nothing trades until the halt ends.`,
  /** `units` is the count of the underlying's lots, `long` whether the firm was long the contract. */
  delivery: (units: number, symbol: string, value: string, long: boolean) =>
    long
      ? `Delivered: ${units} ${units === 1 ? 'lot' : 'lots'} of ${symbol}, ${value}, now held as spot and paying storage.`
      : `Delivered against you: short ${units} ${units === 1 ? 'lot' : 'lots'} of ${symbol}, ${value}, now a short in spot and paying the lease.`,
  round: (net: string, gain: boolean) =>
    `Triangle closed: three legs filled, ${net} ${gain ? 'ahead' : 'behind'} after fees.`,
  race: 'First race won today: your order arrived first and filled.',
  unlock: 'The dark web is open. Tips are for sale there, and the regulator is watching who buys.',
  /** The link's text, where the place can be gone to. */
  link: 'Show me',
  /** The slot's label for a reader of the page. */
  label: 'Something just happened',
} as const;
