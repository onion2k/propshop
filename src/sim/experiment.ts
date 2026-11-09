// The experiment runner: a short window of one trading day, run from a fixed start under a setup, measured, and
// replayable at any moment in it. Without it a "same day, one change" comparison would have nothing to compare
// and the microscope nothing to rewind. A run has no input after its setup, so a pinned save plus stepping gives
// back the exact state at any tick, and two runs from one start see the same world (the sim's chance is in
// streams the firm cannot reach).

import { Game, TICK_MS, type GameEvent, type SavedGame, type Tally } from './game';
import type { BlockSetting } from './firm';
import type { OpenOrder } from './strategy';
import type { Content } from './types';

/** How the firm is set up for a run: where it sits, what it runs and what it watches. */
export interface Setup {
  location: string;
  network: string;
  computer: string;
  watched: string[];
  blocks: BlockSetting[];
}

/** The longest window a run is given, ms. */
export const MAX_WINDOW_MS = 5 * 60 * 1000;
/**
 * The most moments a run pins a save for. A save is several megabytes (the exchanges' quote logs), so a run
 * holds its start and at most this many more, and never a save every few seconds.
 */
export const MAX_PINNED = 3;
/** The most moments a run keeps; the earliest stay and the rest are counted in `momentsDropped`. */
export const MAX_MOMENTS = 200;
/** The most beaten races a run lists by name; the count in `races` goes on past it. */
export const MAX_BEATEN_LISTED = 500;
/** A replay starts this long before its moment, so the player sees what led up to it. */
export const REPLAY_LEAD_MS = 40;

/** A point in the window worth looking at again. */
export interface Moment {
  at: number;
  /** When a replay of it should begin: for a race, the order's send or the quote's publication, whichever is earlier. */
  from: number;
  kind: string;
  label: string;
  symbol?: string;
  exchange?: string;
}

/** What a source gives: `from` is `at` where it names none. */
export type MomentDraft = Omit<Moment, 'from'> & { from?: number };

/** Content's eye on a run: called once a tick with what happened in it. */
export type MomentSource = (game: Game, events: readonly GameEvent[], resolved: readonly OpenOrder[]) => MomentDraft[];

export interface RaceTally {
  won: number;
  beaten: number;
  missed: number;
}

/** A race lost to a named rival, and by how long. */
export interface BeatenRace {
  at: number;
  exchange: string;
  symbol: string;
  rival: string;
  /** How many ms before this firm's order arrived that the rival's took the quote. */
  marginMs: number;
}

export interface Measures {
  /** Net profit from the run's start, after fees, with open positions marked; cents. */
  pnl: number;
  fills: number;
  races: RaceTally;
  byExchange: Record<string, RaceTally>;
  beaten: BeatenRace[];
  /** The run's fills, realised P&L (before fees) and fees by the block that made them. At most one entry per block. */
  byBlock: Record<string, Tally>;
  /** Fees paid in the window, cents. */
  fees: number;
  /** Orders a dealer looked at and refused (last look); absent in a measure from before the dealer. */
  refused?: number;
}

/**
 * The world at the experiment's start: a new game with these desks open, at the open, stepped on to `startAt` (an
 * absolute time). A desk draws from its own stream, so opening one leaves the stocks' morning as it was.
 */
export function startOf(content: Content, seed: number, startAt: number, desks: readonly string[] = []): SavedGame {
  const g = new Game(content, seed);
  for (const d of desks) g.openDesk(d);
  g.skipToOpen();
  if (startAt < g.now) throw new Error(`startAt ${startAt} is before the open at ${g.now}`);
  while (g.now < startAt) g.step();
  return g.save();
}

export class Run {
  readonly game: Game;
  readonly setup: Setup;
  readonly startAt: number;
  readonly endAt: number;
  /** The only save a run keeps of its own; pinned saves for chosen moments are kept by `Prepare`. */
  readonly start: SavedGame;
  readonly pinned = new Map<string, SavedGame>();
  readonly moments: Moment[] = [];
  readonly maxMoments = MAX_MOMENTS;
  momentsDropped = 0;
  readonly content: Content;
  private readonly source: MomentSource | undefined;
  private events: GameEvent[] = [];
  private fills = 0;
  private fees = 0;
  private refused = 0;
  private readonly byBlock: Record<string, Tally> = {};
  private readonly races: RaceTally = { won: 0, beaten: 0, missed: 0 };
  private readonly byExchange: Record<string, RaceTally> = {};
  private readonly beaten: BeatenRace[] = [];
  private readonly baseline: number;
  private readonly names: Map<string, string>;

  constructor(content: Content, start: SavedGame, setup: Setup, windowMs: number, moments?: MomentSource) {
    if (windowMs <= 0) throw new Error('A run needs a window');
    if (windowMs > MAX_WINDOW_MS) throw new Error(`A window of ${windowMs} ms is longer than ${MAX_WINDOW_MS}`);
    this.start = start;
    this.content = content;
    this.setup = setup;
    this.source = moments;
    this.game = Game.load(content, structuredClone(start));
    this.game.configure(setup);
    this.startAt = this.game.now;
    this.endAt = this.startAt + windowMs;
    this.baseline = this.net();
    this.names = new Map(this.game.competitors.map((c) => [c.id, c.name]));
    this.game.on((e) => this.events.push(e));
  }

  get finished(): boolean {
    return this.game.now >= this.endAt;
  }

  /** Run up to this many ticks, so a UI can spend a budget per frame; true once the window is done. */
  advance(maxTicks: number): boolean {
    const g = this.game;
    for (let i = 0; i < maxTicks && g.now < this.endAt; i++) {
      this.events = [];
      g.step();
      for (const e of this.events) if (e.kind === 'fill') this.fill(e.fill);
      for (const o of g.firm.tickResolved) this.race(o);
      if (this.source) {
        for (const m of this.source(g, this.events, g.firm.tickResolved)) {
          if (this.moments.length < MAX_MOMENTS) this.moments.push({ ...m, from: m.from ?? m.at });
          else this.momentsDropped++;
        }
      }
    }
    return this.finished;
  }

  private fill(f: { block: string; realised: number; fee: number }): void {
    this.fills++;
    this.fees += f.fee;
    const t = (this.byBlock[f.block] ??= { fills: 0, realised: 0, fees: 0 });
    t.fills++;
    t.realised += f.realised;
    t.fees += f.fee;
  }

  /** What the run has measured so far. */
  measures(): Measures {
    return {
      pnl: this.net() - this.baseline,
      fills: this.fills,
      races: { ...this.races },
      byExchange: Object.fromEntries(Object.entries(this.byExchange).map(([k, v]) => [k, { ...v }])),
      beaten: this.beaten.map((b) => ({ ...b })),
      byBlock: Object.fromEntries(Object.entries(this.byBlock).map(([k, v]) => [k, { ...v }])),
      fees: this.fees,
      refused: this.refused,
    };
  }

  private net(): number {
    const f = this.game.firm;
    return f.realised - f.feesPaid + f.unrealised(this.game.market, this.game.now);
  }

  /** Only immediate-or-cancel orders race: filled in full is won, beaten by a named rival, or missed with nobody named. */
  private race(o: OpenOrder): void {
    if (o.status === 'refused') this.refused++;
    if (!o.ioc) return;
    const ex = (this.byExchange[o.exchange] ??= { won: 0, beaten: 0, missed: 0 });
    if (o.filled >= o.size) {
      this.races.won++;
      ex.won++;
    } else if (o.beatenBy.length > 0) {
      this.races.beaten++;
      ex.beaten++;
      if (this.beaten.length < MAX_BEATEN_LISTED) {
        const rival = o.beatenBy[0]!;
        this.beaten.push({
          at: rival.at,
          exchange: o.exchange,
          symbol: o.symbol,
          rival: this.names.get(rival.owner) ?? rival.owner,
          marginMs: Math.max(0, (o.arrivedAt ?? rival.at) - rival.at),
        });
      }
    } else {
      this.races.missed++;
      ex.missed++;
    }
  }
}

const key = (m: Moment) => `${m.kind}:${m.at}:${m.from}`;

// `Game.load` and `Game.save` share lists with the game rather than copy them, so every load here is of a clone:
// stepping a loaded game must not change the save it came from, which another run or replay will load again.

/** The tick a replay of a moment stands at: its start less the lead, on the run's own ticks, and never before the run. */
export function replayTime(run: Run, m: Moment): number {
  const t = Math.min(run.endAt, Math.max(run.startAt, m.from - REPLAY_LEAD_MS));
  return run.startAt + Math.floor((t - run.startAt) / TICK_MS) * TICK_MS;
}

/**
 * A second pass over a run, from its start save with its setup, that pins a save just before each chosen
 * moment. Chunked like the run, so the page can do it while the player reads the result.
 */
export class Prepare {
  private readonly game: Game;
  private readonly targets: { time: number; moment: Moment }[];

  constructor(
    private readonly run: Run,
    chosen: Moment[],
  ) {
    if (chosen.length > MAX_PINNED) throw new Error(`A run pins at most ${MAX_PINNED} moments, not ${chosen.length}`);
    this.game = Game.load(run.content, structuredClone(run.start));
    this.game.configure(run.setup);
    this.targets = chosen.map((moment) => ({ time: replayTime(run, moment), moment })).sort((a, b) => a.time - b.time);
    this.pin();
  }

  get finished(): boolean {
    return this.targets.length === 0;
  }

  /** Run up to this many ticks; true once every chosen moment is pinned. */
  advance(maxTicks: number): boolean {
    for (let i = 0; i < maxTicks && this.targets.length > 0; i++) {
      this.game.step();
      this.pin();
    }
    return this.finished;
  }

  private pin(): void {
    while (this.targets[0] && this.targets[0].time <= this.game.now) {
      const t = this.targets.shift()!;
      this.run.pinned.set(key(t.moment), structuredClone(this.game.save()));
    }
  }
}

/** A live game just before a moment, for the microscope to step: nothing in a run changes after its setup, so this is exact. */
export function replayAt(run: Run, moment: Moment): Game {
  const target = replayTime(run, moment);
  const pinned = run.pinned.get(key(moment));
  // The start save is the world before the firm was set up; a pinned one has the setup in it already.
  const g = Game.load(run.content, structuredClone(pinned ?? run.start));
  if (!pinned) g.configure(run.setup);
  while (g.now < target) g.step();
  return g;
}
