// The stocks: thirteen across five sectors, and an index over twelve of them. A beta says how much of the market's
// move a stock takes; the sector's own move it takes whole. The index has no wander of its own. Each sector named
// here has a factor of its own (FACTORS), drawn from `world`.
import type { StockSpec } from '../sim';

export const STOCKS: StockSpec[] = [
  // Technology: high beta, jumpy.
  {
    symbol: 'ABC',
    name: 'Abacus Computing',
    sector: 'technology',
    beta: 1.3,
    startPrice: 4100,
    hourlyVol: 14,
    jumpsPerSecond: 0.12,
    jumpSize: 1.5,
  },
  {
    symbol: 'QNT',
    name: 'Quantal Systems',
    sector: 'technology',
    beta: 1.5,
    startPrice: 12250,
    hourlyVol: 40,
    jumpsPerSecond: 0.14,
    jumpSize: 4,
  },
  {
    symbol: 'LMN',
    name: 'Lumen Networks',
    sector: 'technology',
    beta: 1.2,
    startPrice: 3320,
    hourlyVol: 11,
    jumpsPerSecond: 0.1,
    jumpSize: 1.2,
  },
  {
    symbol: 'VRT',
    name: 'Vertex Semi',
    sector: 'technology',
    beta: 1.4,
    startPrice: 8870,
    hourlyVol: 30,
    jumpsPerSecond: 0.12,
    jumpSize: 3,
  },
  // Utilities: low beta, calm.
  {
    symbol: 'XYZ',
    name: 'Xylem Water',
    sector: 'utilities',
    beta: 0.5,
    startPrice: 2500,
    hourlyVol: 5,
    jumpsPerSecond: 0.08,
    jumpSize: 1,
  },
  {
    symbol: 'GRD',
    name: 'Gridline Power',
    sector: 'utilities',
    beta: 0.6,
    startPrice: 5410,
    hourlyVol: 9,
    jumpsPerSecond: 0.06,
    jumpSize: 1.5,
  },
  // Energy: moves with oil, jumpy.
  {
    symbol: 'MNO',
    name: 'Meridian Oil',
    sector: 'energy',
    beta: 0.9,
    startPrice: 6850,
    hourlyVol: 20,
    jumpsPerSecond: 0.14,
    jumpSize: 2,
  },
  {
    symbol: 'BRL',
    name: 'Barrel Midstream',
    sector: 'energy',
    beta: 0.8,
    startPrice: 2940,
    hourlyVol: 9,
    jumpsPerSecond: 0.1,
    jumpSize: 1,
  },
  {
    symbol: 'SOL',
    name: 'Solstice Renewables',
    sector: 'energy',
    beta: 1.1,
    startPrice: 1780,
    hourlyVol: 8,
    jumpsPerSecond: 0.12,
    jumpSize: 1,
  },
  // Finance: beta one, steady.
  {
    symbol: 'HBK',
    name: 'Harbor Bank',
    sector: 'finance',
    beta: 1.0,
    startPrice: 4530,
    hourlyVol: 12,
    jumpsPerSecond: 0.1,
    jumpSize: 1.5,
  },
  {
    symbol: 'LKS',
    name: 'Lakeside Capital',
    sector: 'finance',
    beta: 1.1,
    startPrice: 7120,
    hourlyVol: 18,
    jumpsPerSecond: 0.1,
    jumpSize: 2,
  },
  {
    symbol: 'PFI',
    name: 'Pacific Insurance',
    sector: 'finance',
    beta: 0.9,
    startPrice: 3890,
    hourlyVol: 10,
    jumpsPerSecond: 0.08,
    jumpSize: 1.2,
  },
  // Mining: one gold miner, which moves with the market a little and with its sector's factor whole. Not in the
  // index. The metals desk's gold reads the Mining factor (plans/desk-metals.md), so the miner and the metal move
  // together. Added on 2026-11-09, which moved what `world` draws for every seed.
  {
    symbol: 'RDG',
    name: 'Ridgeline Mining',
    sector: 'mining',
    beta: 0.7,
    startPrice: 4500,
    hourlyVol: 16,
    jumpsPerSecond: 0.12,
    jumpSize: 1.5,
  },
  // The index: the average price of the twelve before the miner.
  {
    symbol: 'IDX',
    name: 'Coast 12 Index',
    sector: 'index',
    constituents: ['ABC', 'QNT', 'LMN', 'VRT', 'XYZ', 'GRD', 'MNO', 'BRL', 'SOL', 'HBK', 'LKS', 'PFI'],
    startPrice: 0,
    hourlyVol: 0,
    jumpsPerSecond: 0,
    jumpSize: 0,
  },
];

/**
 * One standard deviation an hour, basis points: the market moves a little together, each sector more. The sectors
 * are the stocks' own, read from the list above (technology, utilities, energy, finance and mining), each a factor
 * at `sectorHourlyBps`. A stock's own wander comes back to its anchor with a half-life of about ten minutes: a
 * liquidity shock, not a repricing.
 */
export const FACTORS = { marketHourlyBps: 20, sectorHourlyBps: 35, ownReversionPerHour: 4 };
