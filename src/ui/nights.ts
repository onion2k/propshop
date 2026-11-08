// The night's tests, as the store keeps them: what is stored, the player's own change, and the two runners that
// carry a job (a Web Worker, or the main thread in closed hours). No React and no state of its own; the store
// owns the pins, the queue and the results.

import {
  BLOCKS,
  blockById,
  clampParam,
  paramsFrom,
  type Game,
  type Measures,
  type Pin,
  type Setup,
  type UpgradeKind,
  type UpgradeOffer,
  type Variant,
} from '../sim';
import { jobEvents, type JobEvent, type NightJob } from '../nightjob';
import type { Content } from '../sim';

/** The browser's key for the nights: `{ nights, player }`. */
export const TESTS_KEY = 'propshop.tests.v1';
/** The most nights kept; the oldest go first. */
export const MAX_NIGHTS = 20;

/** The player's own change to test tonight, small enough to keep: a block on or off, one parameter, one upgrade. */
export type Change =
  | { kind: 'toggle'; block: string }
  | { kind: 'param'; block: string; key: string; value: number }
  | { kind: 'upgrade'; upgradeKind: UpgradeKind; id: string };

/** A variant without its setup. `signals` are the ids of the signals that asked for it. */
export interface VariantSummary {
  id: string;
  kind: Variant['kind'];
  label: string;
  price?: number;
  about?: string;
  signals: string[];
}

/** What a run measured, less the list of beaten races (the counts stay). */
export type StoredMeasures = Omit<Measures, 'beaten'>;

export interface RunRecord {
  variantId: string;
  pin: Pin['label'];
  /** The simulated time the window began, ms. */
  at: number;
  measures: StoredMeasures;
}

export type NightStatus = 'running' | 'done' | 'partial' | 'none';

/** One night's tests, of the day that closed. */
export interface Night {
  /** The day's number (`DayReport.day`). */
  day: number;
  /** Simulated time of the close, ms. */
  closedAt: number;
  status: NightStatus;
  windowMs: number;
  variants: VariantSummary[];
  /** The windows that were pinned. */
  pins: { label: Pin['label']; at: number }[];
  runs: RunRecord[];
  /** Windows the day should have had and did not, and why. */
  missing: { pin: Pin['label']; reason: string }[];
  /** True where the setup at a pin was not the setup at the close: the baseline is the one at the close. */
  setupChanged: boolean;
  /** True where a newer close replaced this night before it started. */
  skipped: boolean;
  /** Why the night is partial or ran nothing, in words; null for a night that ran whole. */
  reason: string | null;
  /** What became of the player's own test, if there was one; null where there was none. */
  playerNote: string | null;
}

export interface Tests {
  /** Oldest first, at most `MAX_NIGHTS`. */
  nights: readonly Night[];
  /** The running job's progress, in runs. */
  progress: { day: number; done: number; of: number } | null;
  /** The change queued for tonight. */
  player: Change | null;
}

const UPGRADE_KINDS: readonly string[] = ['location', 'network', 'computer'];

/** The firm as it is now, as a setup: a copy, so a later change to the firm does not reach it. */
export function setupOf(game: Game): Setup {
  const i = game.firm.infra;
  return {
    location: i.location.id,
    network: i.network.id,
    computer: i.computer.id,
    watched: game.firm.watching(game.market.stocks.map((s) => s.symbol)),
    blocks: game.firm.blocks.map((b) => ({
      id: b.id,
      enabled: b.enabled,
      params: { ...b.params },
      ...(b.source !== undefined ? { source: b.source } : {}),
    })),
  };
}

/** A string that is the same for the same setup, however its keys were made. */
export function setupKey(s: Setup): string {
  const sorted = (o: Record<string, number>) => Object.entries(o).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([
    s.location,
    s.network,
    s.computer,
    [...s.watched].sort(),
    [...s.blocks]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((b) => [b.id, b.enabled, sorted(b.params as Record<string, number>), b.source ?? null]),
  ]);
}

/** The change as a variant of the setup, or null where it means nothing there (a block or an upgrade that is gone). */
export function changeToVariant(change: Change, setup: Setup, offers: readonly UpgradeOffer[]): Variant | null {
  if (change.kind === 'upgrade') {
    const offer = offers.find((o) => o.kind === change.upgradeKind && o.spec.id === change.id);
    if (!offer || offer.inUse) return null;
    return {
      id: `player:upgrade:${change.upgradeKind}:${change.id}`,
      kind: 'player',
      label: offer.spec.name,
      setup: { ...setup, [change.upgradeKind]: change.id },
      ...(offer.owned ? {} : { price: offer.spec.price }),
      about: change.id,
    };
  }
  const spec = knownSpec(change.block);
  if (!spec) return null;
  const current = setup.blocks.find((b) => b.id === change.block);
  const withBlock = (next: { enabled?: boolean; params?: Record<string, number> }) => ({
    ...setup,
    blocks: current
      ? setup.blocks.map((b) => (b.id === change.block ? { ...b, ...next } : b))
      : [...setup.blocks, { id: change.block, enabled: false, params: paramsFrom(spec), ...next }],
  });
  if (change.kind === 'toggle') {
    const on = !(current?.enabled ?? false);
    return {
      id: `player:toggle:${change.block}`,
      kind: 'player',
      label: `${spec.name} switched ${on ? 'on' : 'off'}`,
      setup: withBlock({ enabled: on }),
      about: change.block,
    };
  }
  const p = spec.params.find((x) => x.key === change.key);
  if (!p) return null;
  const value = clampParam(p, change.value);
  return {
    id: `player:param:${change.block}:${change.key}`,
    kind: 'player',
    label: `${spec.name}: ${p.name} to ${value}${p.unit ? ` ${p.unit}` : ''}`,
    setup: withBlock({ params: { ...paramsFrom(spec, current?.params), [change.key]: value } }),
    about: change.block,
  };
}

function knownSpec(id: string) {
  return BLOCKS.some((b) => b.spec.id === id) ? blockById(id).spec : null;
}

/** A change read from the browser, or null where it is not one or no longer makes sense for this shop. */
export function parseChange(raw: unknown, offers: readonly UpgradeOffer[]): Change | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const c = raw as Record<string, unknown>;
  if (c.kind === 'upgrade') {
    if (typeof c.id !== 'string' || typeof c.upgradeKind !== 'string' || !UPGRADE_KINDS.includes(c.upgradeKind))
      return null;
    const offer = offers.find((o) => o.kind === c.upgradeKind && o.spec.id === c.id);
    if (!offer || offer.inUse) return null;
    return { kind: 'upgrade', upgradeKind: c.upgradeKind as UpgradeKind, id: c.id };
  }
  if (typeof c.block !== 'string') return null;
  const spec = knownSpec(c.block);
  if (!spec) return null;
  if (c.kind === 'toggle') return { kind: 'toggle', block: c.block };
  if (c.kind === 'param') {
    if (typeof c.key !== 'string' || typeof c.value !== 'number' || !Number.isFinite(c.value)) return null;
    if (!spec.params.some((p) => p.key === c.key)) return null;
    return { kind: 'param', block: c.block, key: c.key, value: c.value };
  }
  return null;
}

const STATUSES: readonly string[] = ['running', 'done', 'partial', 'none'];

function isNight(n: unknown): n is Night {
  if (typeof n !== 'object' || n === null) return false;
  const x = n as Record<string, unknown>;
  return (
    typeof x.day === 'number' &&
    typeof x.status === 'string' &&
    STATUSES.includes(x.status) &&
    Array.isArray(x.variants) &&
    Array.isArray(x.pins) &&
    Array.isArray(x.runs) &&
    Array.isArray(x.missing)
  );
}

/** The stored nights and change. A night that was running when the page went away is partial now: its job is gone. */
export function loadTests(
  storage: { getItem(key: string): string | null } | null,
  offers: readonly UpgradeOffer[],
): { nights: Night[]; player: Change | null } {
  try {
    const raw = storage?.getItem(TESTS_KEY);
    if (!raw) return { nights: [], player: null };
    const parsed = JSON.parse(raw) as { nights?: unknown; player?: unknown };
    const list = Array.isArray(parsed.nights) ? parsed.nights.filter(isNight) : [];
    const nights = list.slice(-MAX_NIGHTS).map((n): Night => {
      if (n.status !== 'running') return n;
      const had = n.runs.length > 0;
      return {
        ...n,
        status: had ? 'partial' : 'none',
        reason: n.reason ?? 'The page was closed or reloaded before the tests finished.',
      };
    });
    return { nights, player: parseChange(parsed.player, offers) };
  } catch {
    return { nights: [], player: null };
  }
}

export function saveTests(
  storage: { setItem(key: string, value: string): void } | null,
  nights: readonly Night[],
  player: Change | null,
): void {
  try {
    storage?.setItem(TESTS_KEY, JSON.stringify({ nights, player }));
  } catch {
    // Storage can be full or forbidden; the results stay on screen until the page goes.
  }
}

/** The measures as kept: without the list of beaten races. */
export function storedMeasures(m: Measures): StoredMeasures {
  const { beaten: _beaten, ...rest } = m;
  return rest;
}

/** Carries one job at a time. */
export interface NightRunner {
  /** Begin a job; its events go to `onEvent`, ending with `end` or `error`. A new job replaces a running one. */
  start(job: NightJob, onEvent: (e: JobEvent) => void): void;
  /** Stop the running job and send nothing more from it. */
  cancel(): void;
  /** The main-thread runner only: a slice of work, called every pump. A worker needs none. */
  pump?(ctx: { open: boolean; clock?: () => number; deadline?: number }): void;
}

/** How many ticks of a window the fallback runs between looks at the clock (about 5 ms on a desktop). */
export const INLINE_TICKS_PER_YIELD = 250;
/** Without a clock, how many such slices each pump runs. */
export const INLINE_STEPS_PER_PUMP = 8;

/**
 * The same job on the main thread: advanced from `pump`, only while the market is closed and only before the
 * frame's deadline, so what the sim and the page need comes first. With no clock (tests) a fixed few slices.
 */
export class InlineRunner implements NightRunner {
  private gen: Generator<JobEvent, void, undefined> | null = null;
  private onEvent: ((e: JobEvent) => void) | null = null;

  constructor(
    private readonly content: Content,
    private readonly ticksPerYield = INLINE_TICKS_PER_YIELD,
    private readonly stepsPerPump = INLINE_STEPS_PER_PUMP,
  ) {}

  get busy(): boolean {
    return this.gen !== null;
  }

  start(job: NightJob, onEvent: (e: JobEvent) => void): void {
    this.gen = jobEvents(this.content, job, this.ticksPerYield);
    this.onEvent = onEvent;
  }

  cancel(): void {
    this.gen = null;
    this.onEvent = null;
  }

  pump({ open, clock, deadline }: { open: boolean; clock?: () => number; deadline?: number }): void {
    if (open) return;
    let steps = 0;
    while (this.gen && this.onEvent) {
      const emit = this.onEvent;
      const next = this.gen.next();
      if (next.done) {
        this.cancel();
        return;
      }
      // A job that is over is released before its last event is told, so the store may start the next from it.
      if (next.value.kind === 'end' || next.value.kind === 'error') this.cancel();
      emit(next.value);
      steps++;
      if (clock && deadline !== undefined ? clock() >= deadline : steps >= this.stepsPerPump) return;
    }
  }
}

/** The job in a module Web Worker. `create` is called when the runner is made, so a refusal is found at once. */
export class WorkerRunner implements NightRunner {
  private worker: Worker | null;

  constructor(private readonly create: () => Worker) {
    this.worker = create();
  }

  start(job: NightJob, onEvent: (e: JobEvent) => void): void {
    try {
      this.worker ??= this.create();
    } catch (e) {
      onEvent({ kind: 'error', message: e instanceof Error ? e.message : 'The worker could not start.' });
      return;
    }
    const w = this.worker;
    w.onmessage = (m: MessageEvent<JobEvent>) => onEvent(m.data);
    w.onerror = (e) => onEvent({ kind: 'error', message: e.message || 'The worker failed.' });
    w.postMessage(job);
  }

  cancel(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
