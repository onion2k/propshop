// The blocks the game ships, by id. A scripted block would register here too.
import { arbitrage } from './arbitrage';
import { indexArb } from './indexArb';
import { marketMaker } from './marketMaker';
import { meanReversion } from './meanReversion';
import { momentum } from './momentum';
import { newsReaction } from './newsReaction';
import { pairs } from './pairs';
import { sniper } from './sniper';
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
  scriptBlock(EXAMPLE_SOURCE),
];

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
export { EXAMPLE_SOURCE, SCRIPT_ID, STEP_BUDGET, instrument, scriptBlock, scriptState } from './script';
export type { ScriptState } from './script';
