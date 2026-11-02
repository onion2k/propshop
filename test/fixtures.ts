// Small content for the sim tests: enough to trade on, small enough to reason about by hand.
import type { ExchangeSpec, StockSpec } from '../src/sim/types';

export const STOCKS: StockSpec[] = [
  {
    symbol: 'ABC',
    name: 'Abacus Computing',
    sector: 'tech',
    startPrice: 4100,
    hourlyVol: 12,
    jumpsPerSecond: 0.3,
    jumpSize: 2.5,
  },
  {
    symbol: 'XYZ',
    name: 'Xylem Water',
    sector: 'utilities',
    startPrice: 2500,
    hourlyVol: 5,
    jumpsPerSecond: 0.2,
    jumpSize: 1.5,
  },
];

export const EXCHANGES: ExchangeSpec[] = [
  { id: 'HARBOR', name: 'Harbor Exchange', city: 'Harbor City', feePerShare: 0.3, lag: 400, noise: 0.8 },
  { id: 'LAKESIDE', name: 'Lakeside Exchange', city: 'Lakeside', feePerShare: 0.25, lag: 600, noise: 0.8 },
];

export const TICK = 2;

import type { Infrastructure } from '../src/sim/types';

/** A slow firm far from both exchanges, and a fast one sitting next to HARBOR. */
export const SLOW: Infrastructure = {
  location: {
    id: 'home',
    name: 'Home office',
    price: 0,
    distance: { HARBOR: 30, LAKESIDE: 40 },
    explain: 'Far from everything.',
  },
  network: { id: 'consumer', name: 'Consumer broadband', price: 0, factor: 1, overhead: 10, explain: 'Slow.' },
  computer: {
    id: 'laptop',
    name: 'Laptop',
    price: 0,
    maxBlocks: 1,
    ordersPerSecond: 20,
    decisionEveryMs: 50,
    explain: 'One block at a time.',
  },
};

export const FAST: Infrastructure = {
  location: {
    id: 'colo-harbor',
    name: 'Colocation at HARBOR',
    price: 0,
    distance: { HARBOR: 0.2, LAKESIDE: 8 },
    explain: 'In the building.',
  },
  network: { id: 'fibre', name: 'Leased fibre', price: 0, factor: 1, overhead: 0.5, explain: 'Fast.' },
  computer: {
    id: 'rack',
    name: 'Rack',
    price: 0,
    maxBlocks: 4,
    ordersPerSecond: 200,
    decisionEveryMs: 10,
    explain: 'Plenty.',
  },
};

import type { NewsTemplate } from '../src/sim/types';

export const TEMPLATES: NewsTemplate[] = [
  {
    scope: 'company',
    text: '{company} beats on earnings, raises outlook',
    direction: 1,
    magnitudeBps: 150,
    priceInMs: 20_000,
  },
  { scope: 'company', text: '{company} recalls product line', direction: -1, magnitudeBps: 120, priceInMs: 15_000 },
  {
    scope: 'sector',
    text: 'Regulator opens inquiry into {sector}',
    direction: -1,
    magnitudeBps: 60,
    priceInMs: 30_000,
  },
  { scope: 'market', text: 'Central bank holds rates, as expected', direction: 0, magnitudeBps: 0, priceInMs: 10_000 },
  { scope: 'company', text: '{company} CEO seen at airport', direction: 1, magnitudeBps: 0, priceInMs: 10_000 },
];
