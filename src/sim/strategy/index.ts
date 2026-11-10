// The blocks the game ships, by id. A scripted block would register here too.
import { anticipate } from './anticipate';
import { arbitrage } from './arbitrage';
import { basisArb } from './basisArb';
import { carry } from './carry';
import { crossPairs } from './crossPairs';
import { curve } from './curve';
import { fixArb } from './fixArb';
import { indexArb } from './indexArb';
import { leadLag } from './leadLag';
import { marketMaker } from './marketMaker';
import { meanReversion } from './meanReversion';
import { momentum } from './momentum';
import { optionMaker } from './optionMaker';
import { parity } from './parity';
import { eventVol } from './eventVol';
import { newsReaction } from './newsReaction';
import { pairs } from './pairs';
import { roll } from './roll';
import { sniper } from './sniper';
import { triangle } from './triangle';
import { EXAMPLE_SOURCE, SCRIPT_ID, scriptBlock } from './script';
import type { StrategyBlock } from './types';

export const BLOCKS: readonly StrategyBlock[] = [
  arbitrage,
  marketMaker,
  momentum,
  meanReversion,
  sniper,
  pairs,
  indexArb,
  newsReaction,
  anticipate,
  scriptBlock(EXAMPLE_SOURCE),
  // The futures desk's: a firm has them once the desk is open (`DESK_BLOCKS`).
  basisArb,
  leadLag,
  roll,
  // The currencies desk's, the same way.
  triangle,
  carry,
  // The metals desk's, the same way.
  curve,
  fixArb,
  crossPairs,
  // The options desk's, the same way.
  optionMaker,
  parity,
  eventVol,
];

/** The blocks of each desk but the stocks, which a firm is given, off, when the desk opens. */
export const DESK_BLOCKS: Readonly<Record<string, readonly string[]>> = {
  futures: ['basisArb', 'leadLag', 'roll'],
  fx: ['triangle', 'carry'],
  metals: ['curve', 'fixArb', 'crossPairs'],
  options: ['optionMaker', 'parity', 'eventVol'],
};

/**
 * The desks whose symbols a desk's blocks may trade besides the stocks' and its own: the options desk's blocks hedge in
 * the futures desk's index future and price an option from it. No other desk sees another's.
 */
export const DESK_SEES: Readonly<Record<string, readonly string[]>> = {
  options: ['futures'],
};

/**
 * The desks a desk needs open beside it: the options desk's blocks hedge in the futures desk's index future, so
 * opening one opens the other, and a save with the one and not the other loads with both.
 */
export const DESK_REQUIRES: Readonly<Record<string, readonly string[]>> = {
  options: ['futures'],
};

export function blockById(id: string): StrategyBlock {
  const b = BLOCKS.find((x) => x.spec.id === id);
  if (!b) throw new Error(`No strategy block ${id}`);
  return b;
}

/** The block a setting names: the player's script for the script id, with its own source, else the registry's. */
export function blockFor(setting: { id: string; source?: string }): StrategyBlock {
  if (setting.id === SCRIPT_ID) return scriptBlock(setting.source ?? EXAMPLE_SOURCE);
  return blockById(setting.id);
}

export * from './types';
export { ImpliedCache, LazyOptions, buildOptions } from './optionsView';
export { EXAMPLE_SOURCE, SCRIPT_ID, STEP_BUDGET, instrument, scriptBlock, scriptState } from './script';
export type { ScriptState } from './script';
