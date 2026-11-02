// The exchanges. HARBOR is the big one on the east coast; LAKESIDE is inland, cheaper and a little slower to
// catch on; PACIFIC is on the far coast, cheapest of all and slowest to catch on, thirty milliseconds of
// fibre from HARBOR.
import type { ExchangeSpec } from '../sim';

export const EXCHANGES: ExchangeSpec[] = [
  { id: 'HARBOR', name: 'Harbor Exchange', city: 'Harbor City', feePerShare: 0.3, lag: 250, noise: 0.5 },
  { id: 'LAKESIDE', name: 'Lakeside Exchange', city: 'Lakeside', feePerShare: 0.22, lag: 450, noise: 0.5 },
  { id: 'PACIFIC', name: 'Pacific Exchange', city: 'Bayview', feePerShare: 0.18, lag: 600, noise: 0.5 },
];
