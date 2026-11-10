// Scripted players for test/stagepace.test.ts: each a pure policy from (progress, snapshot) to the actions due
// now, and a step that applies an action through the real store and checks the snapshot shows it. A measuring
// tool, not game code: it drives the store the page drives and reads the store's own lessons and stages.
import { LESSONS, STAGES, stageOf } from '../src/content';
import { MS_PER_MINUTE, TICK_MS, calendar, formatTime, type HandIntent, type Snapshot } from '../src/sim';
import { isWeekday, MARKET_CLOSE, MARKET_OPEN } from '../src/sim/clock';
import type { Progress, Store } from '../src/ui/store';

export type Action =
  | { kind: 'block'; id: string; enabled: boolean }
  | { kind: 'param'; id: string; key: string; value: number }
  | { kind: 'buy'; upgrade: Parameters<Store['buyUpgrade']>[0]; id: string }
  | { kind: 'hand'; intent: HandIntent }
  | { kind: 'skip' };

export type Policy = (progress: Progress, s: Snapshot) => Action[];

const SESSION_MS = MARKET_CLOSE - MARKET_OPEN;
/** The desk order sizes, as the lessons ask. */
const DESK_SIZE = 5000;
/** A desk order is sent again only after this long (sim ms) with the lesson still not done. */
const DESK_RETRY_MS = 30_000;
/** The half spread the maker lesson asks for, in cents. */
const MAKER_HALF_SPREAD = 2;

/** Weekdays from day 0 up to but not including `day`. */
function weekdaysBefore(day: number): number {
  return Math.floor(day / 7) * 5 + Math.min(day % 7, 5);
}

/** The trading day the time falls in, counting from 1; a night or a weekend belongs to the day just gone. */
export function tradingDay(now: number): number {
  const { day } = calendar(now);
  return Math.max(1, weekdaysBefore(day) + (isWeekday(day) ? 1 : 0));
}

/** Minutes of open market since the first day's open. */
export function openMinutes(now: number): number {
  const c = calendar(now);
  const today = isWeekday(c.day) ? Math.min(Math.max(c.timeOfDay - MARKET_OPEN, 0), SESSION_MS) : 0;
  return (weekdaysBefore(c.day) * SESSION_MS + today) / MS_PER_MINUTE;
}

// ---- policies ----

/** A night with more than the last minute to wait: the player skips to the open. */
function skipDue(s: Snapshot): Action[] {
  return !s.open && s.nextChange - s.now > MS_PER_MINUTE ? [{ kind: 'skip' }] : [];
}

/** Fibre, once, when `home` is done and the firm is still on the consumer line. */
function fibreDue(progress: Progress, s: Snapshot): Action[] {
  if (progress.home === undefined || s.infra.network !== 'consumer') return [];
  return [{ kind: 'buy', upgrade: 'network', id: 'fibre' }];
}

/** Put exactly this block on, others off, the offs first (the laptop runs one block). Only what differs. */
function onlyBlock(s: Snapshot, id: string, params?: Record<string, number>): Action[] {
  const offs: Action[] = s.blocks
    .filter((b) => b.enabled && b.id !== id)
    .map((b) => ({ kind: 'block', id: b.id, enabled: false }));
  const set: Action[] = Object.entries(params ?? {})
    .filter(([k, v]) => s.blocks.find((b) => b.id === id)?.params[k] !== v)
    .map(([key, value]) => ({ kind: 'param', id, key, value }));
  const on: Action[] = s.blocks.find((b) => b.id === id)?.enabled ? [] : [{ kind: 'block', id, enabled: true }];
  return [...offs, ...set, ...on];
}

/** The first symbol that has a quote on both sides, with its best bid. */
function quoted(s: Snapshot): { symbol: string; bid: number } | null {
  for (const st of s.stocks) {
    if (st.constituents === null && st.bid !== null && st.ask !== null) return { symbol: st.symbol, bid: st.bid };
  }
  return null;
}

function deskAction(progress: Progress, s: Snapshot): Action[] {
  if (!s.open || stageOf(progress) < 4 || progress.used !== undefined) return [];
  const hand = s.orders.filter((o) => o.block === 'hand');
  const lastSent = Math.max(-Infinity, ...hand.map((o) => o.sentAt), ...s.pendingHand.map((p) => p.clickedAt));
  if (s.pendingHand.length > 0 || s.now - lastSent < DESK_RETRY_MS) return [];
  const q = quoted(s);
  if (!q) return [];
  if (progress.hand === undefined) {
    return [
      { kind: 'hand', intent: { symbol: q.symbol, side: 'buy', size: DESK_SIZE, exchange: 'best', type: 'market' } },
    ];
  }
  const resting = hand.some((o) => !o.ioc && (o.status === 'resting' || o.status === 'inflight'));
  if (resting) return [];
  return [
    {
      kind: 'hand',
      intent: {
        symbol: q.symbol,
        side: 'buy',
        size: DESK_SIZE,
        exchange: 'best',
        type: 'limit',
        price: q.bid - 1,
      },
    },
  ];
}

/** Does each current lesson's task as soon as it is current. Lessons that ask only to watch need no action. */
export const follower: Policy = (progress, s) => {
  const skip = skipDue(s);
  const buy = progress.seat === undefined ? fibreDue(progress, s) : [];
  let blocks: Action[] = [];
  if (progress.home === undefined) blocks = onlyBlock(s, 'momentum');
  else if (progress.seat === undefined) blocks = onlyBlock(s, 'momentum');
  else if (progress.race === undefined || progress.cost === undefined) blocks = onlyBlock(s, 'arbitrage');
  // The maker stays on once its lesson is done, so noise and the week can tick meanwhile.
  else blocks = onlyBlock(s, 'marketMaker', { halfSpread: MAKER_HALF_SPREAD });
  // Nothing at night: the blocks send nothing, and a skip is all there is to do.
  if (!s.open) return [...buy, ...skip];
  return [...buy, ...blocks, ...deskAction(progress, s)];
};

/** Keeps momentum on, buys fibre once, skips nights and touches nothing else. */
export const sitter: Policy = (progress, s) => {
  const buy = fibreDue(progress, s);
  if (!s.open) return [...buy, ...skipDue(s)];
  return [...buy, ...onlyBlock(s, 'momentum')];
};

export const POLICIES: Record<string, Policy> = { follower, sitter };

// ---- applying an action, and checking it landed ----

class ActionFailed extends Error {}

/** Do the action through the store; throw, naming what was expected, if the snapshot does not show it. */
export function applyAction(store: Store, a: Action): void {
  const before = store.getSnapshot();
  const fail = (what: string): never => {
    throw new ActionFailed(`player action ${JSON.stringify(a)} at ${formatTime(before.now)}: ${what}`);
  };
  switch (a.kind) {
    case 'block': {
      store.setBlock(a.id, { enabled: a.enabled });
      const b = store.getSnapshot().blocks.find((x) => x.id === a.id);
      if (b?.enabled !== a.enabled) fail(`block is ${String(b?.enabled)} in the snapshot`);
      const s = store.getSnapshot();
      if (a.enabled && s.capacity.blocksUsed > s.capacity.maxBlocks) fail('more blocks on than the computer runs');
      if (a.enabled && s.blocks.filter((x) => x.enabled).length > s.capacity.maxBlocks)
        fail(`more blocks on than the computer runs (${s.capacity.maxBlocks})`);
      return;
    }
    case 'param': {
      store.setBlock(a.id, { params: { [a.key]: a.value } });
      const got = store.getSnapshot().blocks.find((x) => x.id === a.id)?.params[a.key];
      if (got !== a.value) fail(`${a.key} is ${String(got)} in the snapshot`);
      return;
    }
    case 'buy': {
      store.buyUpgrade(a.upgrade, a.id);
      const got = store.getSnapshot().infra[a.upgrade];
      if (got !== a.id) fail(`${a.upgrade} is ${got} in the snapshot`);
      return;
    }
    case 'hand': {
      const result = store.hand(a.intent);
      if (!result.ok) return fail(`refused: ${result.reason}`);
      const pending = store.getSnapshot().pendingHand;
      if (pending.length <= before.pendingHand.length) fail('no pending hand order in the snapshot');
      return;
    }
    case 'skip': {
      store.skipToOpen();
      const s = store.getSnapshot();
      if (s.open || s.nextChange - s.now > MS_PER_MINUTE) fail('the clock did not reach the minute before the open');
      return;
    }
  }
}

// ---- a run ----

export interface Mark {
  /** Sim time it happened. */
  at: number;
  /** Sim ms the player had actually waited through by then (skipped nights are not). */
  waitedMs: number;
}

export interface Run {
  player: string;
  seed: number;
  ended: 'stage5' | 'days' | 'time';
  daysCap: number | null;
  endAt: number;
  waitedMs: number;
  lessons: Record<string, Mark>;
  stages: Record<number, Mark>;
  /** Every action taken, as "sim time kind detail", for comparing two runs. */
  actions: string[];
}

export interface PlayOptions {
  player: string;
  seed: number;
  /** Stop at the start of the trading day after this many. */
  days?: number;
  /** Stop after the player has waited this long. */
  maxWaitedMs?: number;
  /**
   * Play at the top speed as the page does (plans/rough-speed.md): the store pumped 100 ms of wall time at a time at
   * 300×, the quiet fast-forwarded with the blocks asleep, the policy looking once a pump (30 s of the game).
   */
  topSpeed?: boolean;
}

/** Sim ms between publishes: 250, about what the page does at 10×. */
export const PUBLISH_TICKS = 125;

export function play(store: Store, policy: Policy, opts: PlayOptions): Run {
  const run: Run = {
    player: opts.player,
    seed: opts.seed,
    ended: 'time',
    daysCap: opts.days ?? null,
    endAt: 0,
    waitedMs: 0,
    lessons: {},
    stages: {},
    actions: [],
  };
  let stageSeen = 0;
  const observe = () => {
    const progress = store.getProgress();
    const s = store.getSnapshot();
    for (const l of LESSONS) {
      const at = progress[l.id];
      if (at !== undefined && !run.lessons[l.id]) run.lessons[l.id] = { at, waitedMs: run.waitedMs };
    }
    const stage = store.getStage();
    for (let st = stageSeen + 1; st <= stage; st++) run.stages[st] = { at: s.now, waitedMs: run.waitedMs };
    stageSeen = Math.max(stageSeen, stage);
  };
  const act = () => {
    for (const a of policy(store.getProgress(), store.getSnapshot())) {
      applyAction(store, a);
      run.actions.push(`${store.getSnapshot().now} ${JSON.stringify(a)}`);
    }
  };
  store.publish();
  observe();
  act();
  let wall = 0;
  if (opts.topSpeed) {
    store.setSpeed(300);
    store.pump(wall);
  }
  for (;;) {
    if (opts.topSpeed) {
      const before = store.game.now;
      wall += 100;
      store.pump(wall);
      // A night skipped by the player is not waited through; the rest of the pump is.
      run.waitedMs += store.game.now - before;
    } else {
      for (let i = 0; i < PUBLISH_TICKS; i++) store.game.step();
      run.waitedMs += PUBLISH_TICKS * TICK_MS;
    }
    store.publish();
    observe();
    const now = store.getSnapshot().now;
    if (store.getStage() >= STAGES.length) run.ended = 'stage5';
    else if (opts.days !== undefined && tradingDay(now) > opts.days) run.ended = 'days';
    else if (opts.maxWaitedMs !== undefined && run.waitedMs >= opts.maxWaitedMs) run.ended = 'time';
    else {
      act();
      continue;
    }
    run.endAt = now;
    return run;
  }
}

// ---- the report ----

const SPEEDS = [10, 60] as const;

function when(m: Mark): string {
  const c = calendar(m.at);
  const real = SPEEDS.map((v) => `${(m.waitedMs / v / MS_PER_MINUTE).toFixed(1)} min at ${v}x`).join(', ');
  return `day ${tradingDay(m.at)} ${c.weekday} ${formatTime(m.at)}  trading ${openMinutes(m.at).toFixed(1)} min  real ${real}`;
}

export function formatRun(run: Run): string {
  const played = Math.max(1, Math.ceil(openMinutes(run.endAt) / (SESSION_MS / MS_PER_MINUTE)));
  const end =
    run.ended === 'stage5'
      ? 'stopped: stage 5 open'
      : run.ended === 'days'
        ? `stopped: ${run.daysCap} days`
        : 'stopped: time';
  const miss = `not by day ${played}`;
  const lines = [`${run.player} seed ${run.seed}  (${end}; ${run.actions.length} actions)`];
  for (const l of LESSONS) {
    const m = run.lessons[l.id];
    lines.push(`  ${l.id.padEnd(12)} ${m ? when(m) : miss}`);
  }
  for (const st of STAGES) {
    if (st.id === 1) continue;
    const m = run.stages[st.id];
    lines.push(`  ${`stage ${st.id} opens`.padEnd(12)} ${m ? when(m) : miss}`);
  }
  return lines.join('\n');
}
