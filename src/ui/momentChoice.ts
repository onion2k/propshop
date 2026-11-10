// Moments marked: from the events since last looked, the stage and what was last shown, the one thing worth a line
// under the top bar. Pure; the wall clock is handed in (the sim never sees it), and nothing here draws from a stream.

import { MOMENT_WORDS, shows, type Feature, type Place, type StageId } from '../content';
import type { GameEvent } from '../sim';
import { money } from './format';

export type MomentKind = 'margin' | 'fine' | 'halt' | 'delivery' | 'expiry' | 'round' | 'race' | 'unlock';

/**
 * Highest first. A margin call is the firm being sold out of what it holds, so it outranks all; a fine and a halt
 * are the two other things that cost the player money or stop the trading; a delivery changes what the firm holds
 * without its asking, as does an option settled in cash at its expiry; a closed round, the day's first race won and an unlock are good news, in that order of how
 * much there is to learn from them. A draft, held by nothing.
 */
export const MOMENT_RANK: readonly MomentKind[] = [
  'margin',
  'fine',
  'halt',
  'delivery',
  'expiry',
  'round',
  'race',
  'unlock',
];

/** How long a moment stays on the line, in wall milliseconds. */
export const MOMENT_HOLD_MS = 6000;

/** At most one moment of a kind in this much simulated time. */
export const MOMENT_GAP_MS = 60_000;

export interface Moment {
  kind: MomentKind;
  /** The simulated time it happened. */
  at: number;
  text: string;
  /** The glossary entry its concept is. */
  term: string;
  /** Where "Show me" goes. */
  place: Place;
}

/** What a kind links to, and the feature that must be shown at the stage for it to be marked at all. */
const WHERE: Record<MomentKind, { place: Place; term: string; feature: Feature | null }> = {
  margin: { place: { page: 'market', target: 'firm' }, term: 'margin-call', feature: 'desk:futures' },
  fine: { place: { page: 'reports', tab: 'dark' }, term: 'insider', feature: 'tab:dark' },
  halt: { place: { page: 'strategy', target: 'risk' }, term: 'risk-limits', feature: null },
  delivery: { place: { page: 'market', target: 'firm' }, term: 'delivery', feature: 'desk:metals' },
  expiry: { place: { page: 'market', target: 'options' }, term: 'cash-settlement', feature: 'desk:options' },
  round: { place: { page: 'strategy', target: 'strategy' }, term: 'triangular-arbitrage', feature: 'block:triangle' },
  race: { place: { page: 'market', target: 'firm' }, term: 'latency', feature: 'races' },
  unlock: { place: { page: 'reports', tab: 'dark' }, term: 'insider', feature: 'tab:dark' },
};

/** What the chooser remembers between frames. */
export interface MomentMemory {
  /** The simulated time up to which events have been looked at; later ones are new. */
  seen: number;
  /** When each kind was last marked, simulated. */
  last: Partial<Record<MomentKind, number>>;
  /** The calendar day a race was last marked (or was already won when the page opened) on. */
  raceDay: number | null;
}

/** A moment on the line, and the wall time it went up at. */
export interface Shown {
  moment: Moment;
  wallAt: number;
}

/** The memory for a page that has just opened: everything up to now is old, and a race already won today is not new. */
export function openMemory(now: number, day: number, racesWon: number): MomentMemory {
  return { seen: now, last: {}, raceDay: racesWon > 0 ? day : null };
}

function momentOf(e: GameEvent): Moment | null {
  switch (e.kind) {
    case 'margin':
      return make('margin', e.at, MOMENT_WORDS.margin(e.symbols.join(', ')));
    case 'fine':
      return make('fine', e.at, MOMENT_WORDS.fine(money(e.fine.cents), e.fine.reason));
    case 'halt':
      return make('halt', e.at, MOMENT_WORDS.halt(e.reason));
    case 'delivery':
      return make('delivery', e.at, MOMENT_WORDS.delivery(Math.abs(e.units), e.symbol, money(e.value), e.units >= 0));
    case 'expiry':
      return make(
        'expiry',
        e.at,
        MOMENT_WORDS.expiry(
          e.symbol,
          Math.abs(e.qty),
          e.qty > 0,
          money(Math.abs(e.cash)),
          money(Math.abs(e.made)),
          e.made >= 0,
        ),
      );
    case 'round':
      return make('round', e.at, MOMENT_WORDS.round(money(Math.abs(e.net)), e.net >= 0));
    case 'unlock':
      return make('unlock', e.at, MOMENT_WORDS.unlock);
    case 'fill':
    case 'news':
    case 'open':
    case 'close':
    case 'tip':
    case 'upgrade':
    case 'rules':
    case 'regulator':
      return null;
  }
}

function make(kind: MomentKind, at: number, text: string): Moment {
  const w = WHERE[kind];
  return { kind, at, text, term: w.term, place: w.place };
}

export interface ChooseInput {
  log: readonly GameEvent[];
  /** Simulated now. */
  now: number;
  /** The calendar day, and the races the firm has won today. */
  day: number;
  racesWon: number;
  stage: StageId;
  memory: MomentMemory;
  current: Shown | null;
  /** Wall milliseconds, from the page's clock. */
  wall: number;
}

/**
 * The next line and memory. Of the events since last looked, those of a feature not shown at the stage are passed
 * over, as is a kind marked less than `MOMENT_GAP_MS` ago; of the rest the highest rank wins and, in its rank, the
 * latest (at 300× a frame holds many). It takes the line if the line is free, its hold over, or it outranks what is
 * on it; otherwise it is let go, not queued, since a moment late is no moment. Everything looked at is spent.
 */
export function chooseMoment(input: ChooseInput): { current: Shown | null; memory: MomentMemory } {
  const { memory, stage, now } = input;
  let current = input.current;
  if (current && input.wall - current.wallAt >= MOMENT_HOLD_MS) current = null;
  const candidates: Moment[] = [];
  for (const e of input.log) {
    if (e.at <= memory.seen) continue;
    const m = momentOf(e);
    if (m) candidates.push(m);
  }
  const raceNew = input.racesWon > 0 && memory.raceDay !== input.day;
  if (raceNew) candidates.push(make('race', now, MOMENT_WORDS.race));
  let best: Moment | null = null;
  for (const m of candidates) {
    const feature = WHERE[m.kind].feature;
    if (feature !== null && !shows(feature, stage)) continue;
    const last = memory.last[m.kind];
    if (last !== undefined && m.at - last < MOMENT_GAP_MS) continue;
    if (
      best === null ||
      MOMENT_RANK.indexOf(m.kind) < MOMENT_RANK.indexOf(best.kind) ||
      (m.kind === best.kind && m.at >= best.at)
    )
      best = m;
  }
  const next: MomentMemory = {
    seen: Math.max(memory.seen, now),
    last: { ...memory.last },
    raceDay: raceNew ? input.day : memory.raceDay,
  };
  if (best && (current === null || MOMENT_RANK.indexOf(best.kind) < MOMENT_RANK.indexOf(current.moment.kind))) {
    next.last[best.kind] = best.at;
    current = { moment: best, wallAt: input.wall };
  }
  return { current, memory: next };
}
