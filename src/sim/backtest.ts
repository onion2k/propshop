// The night's tests: the firm's setup and variations of it, each run over the same windows of the day just
// traded, from saves pinned by the live game. Pure: the variants come from the setup and the shop, the pins from
// the game's schedule, and a run draws from no stream the firm can reach, so the same pin under the same setup
// always measures the same. Written as a generator so a worker and a main-thread fallback can both chunk it.

import { MARKET_CLOSE, MARKET_OPEN, MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, isMarketOpen, nextOpen } from './clock';
import { TICK_MS, type Game, type SavedGame } from './game';
import { Run, MAX_WINDOW_MS, type Measures, type Setup } from './experiment';
import type { BlockSetting } from './firm';
import { blockById, clampParam, paramChangeLabel, paramsFrom, SCRIPT_ID } from './strategy';
import type { Content } from './types';
import type { UpgradeKind, UpgradeOffer } from './upgrades';

/** One setup to test, and what it is. */
export interface Variant {
  id: string;
  kind: 'baseline' | 'param' | 'toggle' | 'swap' | 'upgrade' | 'player';
  label: string;
  setup: Setup;
  /** Cents, for an upgrade not owned. */
  price?: number;
  /** The block or upgrade id it concerns. */
  about?: string;
}

/** A save of the live game, pinned at a moment of the day, to run windows from. */
export interface Pin {
  label: 'open' | 'headline' | 'afternoon';
  at: number;
  save: SavedGame;
}

/** The most pins a day keeps: each is a save of several megabytes, held in memory for the current day only. */
export const MAX_DAY_PINS = 3;
/** How long each test window runs, ms of simulated time. */
export const BACKTEST_WINDOW_MS = 5 * 60 * 1000;
/** The most variants proposed besides the baseline (the player's own is beyond it). */
export const MAX_VARIANTS = 6;

const AFTERNOON = 14.5 * MS_PER_HOUR;

/**
 * Where the live game should pin a save for the trading day it is in (or, outside the session, the next): the
 * open, one minute before the day's largest scheduled headline, and half past two. Pure, from the game's state.
 * The headline pin is left out when there is none that moves anything, or its window would overlap another or
 * run past the close.
 */
export function pinTimes(game: Game): { label: Pin['label']; at: number }[] {
  const dayStart = Math.floor((isMarketOpen(game.now) ? game.now : nextOpen(game.now)) / MS_PER_DAY) * MS_PER_DAY;
  const open = dayStart + MARKET_OPEN;
  const close = dayStart + MARKET_CLOSE;
  const afternoon = dayStart + AFTERNOON;
  const out: { label: Pin['label']; at: number }[] = [{ label: 'open', at: open }];

  let best: { at: number; size: number } | null = null;
  for (const h of [...game.news.published, ...game.news.scheduled]) {
    if (h.at < open || h.at >= close) continue;
    let size = 0;
    for (const [symbol, move] of Object.entries(h.moves)) {
      const price = game.market.fair.get(symbol) ?? game.market.stock(symbol).startPrice;
      size = Math.max(size, Math.abs(move) / price);
    }
    if (size > 0 && (!best || size > best.size)) best = { at: h.at, size };
  }
  if (best) {
    const at = Math.floor((best.at - MS_PER_MINUTE) / TICK_MS) * TICK_MS;
    const clear = (start: number) => at + BACKTEST_WINDOW_MS <= start || at >= start + BACKTEST_WINDOW_MS;
    if (clear(open) && clear(afternoon) && at + BACKTEST_WINDOW_MS <= close) out.push({ label: 'headline', at });
  }
  out.push({ label: 'afternoon', at: afternoon });
  return out.sort((a, b) => a.at - b.at);
}

export interface VariantOptions {
  /** Variant ids or `about` ids (a block or an upgrade) to put first, as signals will ask. */
  prefer?: readonly string[];
  /** The player's own, appended beyond the cap if it fits. */
  player?: Variant;
}

/** True where the computer can run the blocks and watch the symbols: the checks `Game.configure` makes. */
function fits(setup: Setup, offers: readonly UpgradeOffer[]): boolean {
  const computer = offers.find((o) => o.kind === 'computer' && o.spec.id === setup.computer)?.spec;
  if (!computer || !('maxBlocks' in computer)) return false;
  if (new Set(setup.watched).size > computer.maxSymbols) return false;
  return setup.blocks.filter((b) => b.enabled).length <= computer.maxBlocks;
}

const nameOf = (id: string): string => blockById(id).spec.name;

/**
 * The baseline (the setup itself) and then what is worth trying, in a stable order, a kind at a time in turn so the cap leaves room for each: a step up and down on each
 * enabled block's first parameter, each enabled block off, one swap for a block that is shown, and the next rung
 * of each kind of upgrade. Anything the computer could not hold is dropped.
 */
export function variants(
  setup: Setup,
  offers: readonly UpgradeOffer[],
  shown: readonly string[],
  opts: VariantOptions = {},
): Variant[] {
  const out: Variant[] = [{ id: 'baseline', kind: 'baseline', label: 'The setup as it is', setup }];
  const enabled = setup.blocks.filter((b) => b.enabled);
  const withBlock = (b: BlockSetting, change: Partial<BlockSetting>): Setup => ({
    ...setup,
    blocks: setup.blocks.map((x) => (x.id === b.id ? { ...x, ...change } : x)),
  });
  const cand: Variant[] = [];

  // Each block's first parameter a step either way, and its size: from home the first parameter moves a window
  // by tens of dollars, inside the noise, while size scales what the block makes or loses, so a night shows a
  // difference and the risk of it. The order (first up, size up, first down, size down) decides what the cap keeps.
  for (const b of enabled) {
    if (b.id === SCRIPT_ID) continue;
    const spec = blockById(b.id).spec;
    const first = spec.params[0];
    if (!first) continue;
    const size = spec.params.find((p) => p.key === 'size' && p !== first);
    const params = paramsFrom(spec, b.params);
    const steps = (['up', 'down'] as const).flatMap((dir) =>
      [first, size].filter((p) => p !== undefined).map((p) => ({ p, dir })),
    );
    for (const { p, dir } of steps) {
      const now = params[p.key]!;
      const to = clampParam(p, dir === 'up' ? now + p.step : now - p.step);
      if (to === now) continue;
      cand.push({
        id: `param:${b.id}:${p.key}:${dir}`,
        kind: 'param',
        label: paramChangeLabel(spec.name, p, to, dir),
        setup: withBlock(b, { params: { ...params, [p.key]: to } }),
        about: b.id,
      });
    }
  }

  // A step on a block's other parameter, made only when asked for (a signal names the one that tests it).
  for (const id of opts.prefer ?? []) {
    const m = /^param:([^:]+):([^:]+):(up|down)$/.exec(id);
    if (!m || cand.some((v) => v.id === id)) continue;
    const [, blockId, key, dir] = m;
    const b = enabled.find((x) => x.id === blockId);
    if (!b || b.id === SCRIPT_ID || !knownBlock(b.id)) continue;
    const spec = blockById(b.id).spec;
    const p = spec.params.find((x) => x.key === key);
    if (!p) continue;
    const params = paramsFrom(spec, b.params);
    const now = params[p.key]!;
    const to = clampParam(p, dir === 'up' ? now + p.step : now - p.step);
    if (to === now) continue;
    cand.push({
      id,
      kind: 'param',
      label: paramChangeLabel(spec.name, p, to, dir as 'up' | 'down'),
      setup: withBlock(b, { params: { ...params, [p.key]: to } }),
      about: b.id,
    });
  }

  if (enabled.length > 1) {
    for (const b of enabled) {
      cand.push({
        id: `off:${b.id}`,
        kind: 'toggle',
        label: `${nameOf(b.id)} switched off`,
        setup: withBlock(b, { enabled: false }),
        about: b.id,
      });
    }
  }

  const first = enabled.find((b) => b.id !== SCRIPT_ID);
  const instead = shown.find((id) => id !== SCRIPT_ID && !enabled.some((b) => b.id === id) && knownBlock(id));
  if (first && instead) {
    // Copies throughout: the setup's blocks may be the live firm's, and a variant must not switch one on.
    const blocks: BlockSetting[] = setup.blocks.map((x) =>
      x.id === first.id ? { ...x, enabled: false } : x.id === instead ? { ...x, enabled: true } : x,
    );
    const had = blocks.some((x) => x.id === instead);
    if (!had) blocks.push({ id: instead, enabled: true, params: paramsFrom(blockById(instead).spec) });
    cand.push({
      id: `swap:${first.id}:${instead}`,
      kind: 'swap',
      label: `${nameOf(instead)} in place of ${nameOf(first.id)}`,
      setup: { ...setup, blocks },
      about: instead,
    });
  }

  for (const kind of ['location', 'network', 'computer'] as UpgradeKind[]) {
    const current = offers.find((o) => o.kind === kind && o.spec.id === setup[kind])?.spec.price ?? 0;
    const next = offers
      .filter((o) => o.kind === kind && !o.owned && !o.inUse && o.spec.price > current)
      .sort((a, b) => a.spec.price - b.spec.price || a.spec.id.localeCompare(b.spec.id))[0];
    if (!next) continue;
    cand.push({
      id: `upgrade:${kind}:${next.spec.id}`,
      kind: 'upgrade',
      label: `${next.spec.name}`,
      setup: { ...setup, [kind]: next.spec.id },
      price: next.spec.price,
      about: next.spec.id,
    });
  }

  const wanted = new Set(opts.prefer ?? []);
  const valid = cand.filter((v) => fits(v.setup, offers));
  const preferred = valid.filter((v) => wanted.has(v.id) || (v.about !== undefined && wanted.has(v.about)));
  // The rest go a kind at a time in turn, so a cap reached by parameter steps still leaves room for a swap or an upgrade.
  const lanes = (['param', 'toggle', 'swap', 'upgrade'] as const).map((k) =>
    valid.filter((v) => v.kind === k && !preferred.includes(v)),
  );
  const rest: Variant[] = [];
  for (let i = 0; lanes.some((l) => i < l.length); i++) for (const l of lanes) if (l[i]) rest.push(l[i]!);
  const chosen = [...preferred, ...rest].slice(0, MAX_VARIANTS);
  out.push(...chosen);
  if (opts.player && fits(opts.player.setup, offers)) out.push({ ...opts.player, kind: 'player' });
  return out;
}

function knownBlock(id: string): boolean {
  try {
    blockById(id);
    return true;
  } catch {
    return false;
  }
}

/** What a night's tests tell a caller as they go. */
export type NightEvent =
  | { kind: 'progress'; run: number; of: number; done: boolean }
  | { kind: 'result'; variantId: string; pin: Pin['label']; measures: Measures };

/**
 * Every pin under every variant: a run of `windowMs` from a copy of the pin's save, cut short where it would
 * pass the close. Yields a progress note about every `ticksPerYield` ticks and a result as each run finishes.
 * It holds nothing but its arguments, so it may be driven in a worker or a frame at a time.
 */
export function* testNight(
  content: Content,
  pins: readonly Pin[],
  tests: readonly Variant[],
  ticksPerYield = 5000,
  windowMs = BACKTEST_WINDOW_MS,
): Generator<NightEvent, void, undefined> {
  const of = pins.length * tests.length;
  let n = 0;
  for (const pin of pins) {
    const window = Math.min(windowMs, MAX_WINDOW_MS, dayCloseAfter(pin.save.now) - pin.save.now);
    for (const v of tests) {
      if (window <= 0) {
        n++;
        continue;
      }
      // `Run` loads a structuredClone of the save, so the pin is never stepped.
      const run = new Run(content, pin.save, v.setup, window);
      while (!run.advance(ticksPerYield)) yield { kind: 'progress', run: n, of, done: false };
      n++;
      yield { kind: 'result', variantId: v.id, pin: pin.label, measures: run.measures() };
      yield { kind: 'progress', run: n, of, done: n === of };
    }
  }
}

function dayCloseAfter(now: number): number {
  return Math.floor(now / MS_PER_DAY) * MS_PER_DAY + MARKET_CLOSE;
}
