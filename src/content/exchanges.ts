// The exchanges. HARBOR is the big one on the coast; LAKESIDE is inland, cheaper and a little slower to catch on.
import type { ExchangeSpec } from '../sim';

export const EXCHANGES: ExchangeSpec[] = [
  { id: 'HARBOR', name: 'Harbor Exchange', city: 'Harbor City', feePerShare: 0.3, lag: 250, noise: 0.5 },
  { id: 'LAKESIDE', name: 'Lakeside Exchange', city: 'Lakeside', feePerShare: 0.22, lag: 450, noise: 0.5 },
];
