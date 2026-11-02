// The stocks. Three, in three sectors, so sector news moves one and not the others.
import type { StockSpec } from '../sim';

export const STOCKS: StockSpec[] = [
  {
    symbol: 'ABC',
    name: 'Abacus Computing',
    sector: 'technology',
    startPrice: 4100,
    hourlyVol: 14,
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
  {
    symbol: 'MNO',
    name: 'Meridian Oil',
    sector: 'energy',
    startPrice: 6850,
    hourlyVol: 20,
    jumpsPerSecond: 0.35,
    jumpSize: 3.5,
  },
];
