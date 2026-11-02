// The blocks the game ships, by id. A scripted block would register here too.
import { arbitrage } from './arbitrage';
import { marketMaker } from './marketMaker';
import { momentum } from './momentum';
import { newsReaction } from './newsReaction';
import type { StrategyBlock } from './types';

export const BLOCKS: readonly StrategyBlock[] = [arbitrage, marketMaker, momentum, newsReaction];

export function blockById(id: string): StrategyBlock {
  const b = BLOCKS.find((x) => x.spec.id === id);
  if (!b) throw new Error(`No strategy block ${id}`);
  return b;
}

export * from './types';
