// The shop. Distances are one-way milliseconds through fibre; a network multiplies them and adds its own overhead.
// Prices are cents, sized so the whole path from home to colocation is about eighty trading days of what the
// blocks earn on the way (see test/pace.test.ts), a couple of hours at the top speed.
import type { CompetitorSpec, ComputerSpec, LocationSpec, NetworkSpec } from '../sim';

const K = 100_000;

export const LOCATIONS: LocationSpec[] = [
  {
    id: 'home',
    name: 'Home office',
    price: 0,
    distance: { HARBOR: 32, LAKESIDE: 24 },
    explain:
      'A desk in a spare room, a long way from either exchange. Every order travels across the country and back.',
  },
  {
    id: 'city',
    name: 'Office in Harbor City',
    price: 25 * K,
    distance: { HARBOR: 2, LAKESIDE: 7 },
    explain: 'Downtown, a few miles from the HARBOR data centre. Latency to HARBOR falls to a couple of milliseconds.',
  },
  {
    id: 'colo-harbor',
    name: 'Colocation at HARBOR',
    price: 80 * K,
    distance: { HARBOR: 0.1, LAKESIDE: 7 },
    explain:
      'A rack in the exchange building itself. Orders reach the matching engine in microseconds. ' +
      'LAKESIDE is still a long link away: that is why firms colocate at both and run a fast line between them.',
  },
  {
    id: 'colo-lakeside',
    name: 'Colocation at LAKESIDE',
    price: 80 * K,
    distance: { HARBOR: 7, LAKESIDE: 0.1 },
    explain: 'A rack inside LAKESIDE. Fastest there, a long link from HARBOR.',
  },
];

export const NETWORKS: NetworkSpec[] = [
  {
    id: 'consumer',
    name: 'Consumer broadband',
    price: 0,
    factor: 1,
    overhead: 12,
    explain: 'Shared with everyone on the street. A dozen milliseconds of overhead before a packet even leaves.',
  },
  {
    id: 'fibre',
    name: 'Leased fibre',
    price: 15 * K,
    factor: 1,
    overhead: 1,
    explain:
      'A dedicated line and your own gear at each end. Light in glass travels at two thirds of its speed in air.',
  },
  {
    id: 'microwave',
    name: 'Microwave link',
    price: 120 * K,
    factor: 0.55,
    overhead: 0.5,
    explain:
      'Towers in a straight line between the cities. Through air the signal is faster than through fibre, and the ' +
      'path is straighter. Rain degrades it; that is what the fibre is still for.',
  },
];

export const COMPUTERS: ComputerSpec[] = [
  {
    id: 'laptop',
    name: 'Laptop',
    price: 0,
    maxBlocks: 1,
    ordersPerSecond: 20,
    decisionEveryMs: 50,
    explain: 'Runs one strategy block, thinks twenty times a second, and sends twenty orders a second at most.',
  },
  {
    id: 'server',
    name: 'Server',
    price: 15 * K,
    maxBlocks: 2,
    ordersPerSecond: 100,
    decisionEveryMs: 20,
    explain: 'Two blocks at once, fifty decisions a second, a hundred orders a second.',
  },
  {
    id: 'rack',
    name: 'Rack with custom hardware',
    price: 60 * K,
    maxBlocks: 4,
    ordersPerSecond: 500,
    decisionEveryMs: 10,
    explain: 'Every block, a decision every tick, and orders as fast as the line can carry them.',
  },
];

export const COMPETITORS: CompetitorSpec[] = [
  { id: 'midtown', name: 'Midtown Capital', location: 'city', network: 'fibre', computer: 'server', minEdge: 0.5 },
  {
    id: 'lakeside-partners',
    name: 'Lakeside Partners',
    location: 'colo-lakeside',
    network: 'fibre',
    computer: 'server',
    minEdge: 0.2,
  },
  {
    id: 'harbor-quant',
    name: 'Harbor Quant',
    location: 'colo-harbor',
    network: 'microwave',
    computer: 'rack',
    minEdge: 0.1,
  },
];

export const STARTING_CASH = 200 * K;
export const START = { location: 'home', network: 'consumer', computer: 'laptop' };
