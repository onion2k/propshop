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
    distance: { HARBOR: 32, LAKESIDE: 24, PACIFIC: 3 },
    explain:
      'A desk in a spare room on the west coast. PACIFIC is down the road; HARBOR and LAKESIDE are across the ' +
      'country, and every order to them travels there and back.',
  },
  {
    id: 'city',
    name: 'Office in Harbor City',
    price: 25 * K,
    distance: { HARBOR: 2, LAKESIDE: 7, PACIFIC: 30 },
    explain: 'Downtown, a few miles from the HARBOR data centre. Latency to HARBOR falls to a couple of milliseconds.',
  },
  {
    id: 'colo-harbor',
    name: 'Colocation at HARBOR',
    price: 80 * K,
    distance: { HARBOR: 0.1, LAKESIDE: 7, PACIFIC: 30 },
    explain:
      'A rack in the exchange building itself. Orders reach the matching engine in microseconds. ' +
      'LAKESIDE is still a long link away: that is why firms colocate at both and run a fast line between them.',
  },
  {
    id: 'colo-lakeside',
    name: 'Colocation at LAKESIDE',
    price: 80 * K,
    distance: { HARBOR: 7, LAKESIDE: 0.1, PACIFIC: 20 },
    explain: 'A rack inside LAKESIDE. Fastest there, a long link from HARBOR and a longer one from PACIFIC.',
  },
  {
    id: 'colo-pacific',
    name: 'Colocation at PACIFIC',
    price: 80 * K,
    distance: { HARBOR: 30, LAKESIDE: 20, PACIFIC: 0.1 },
    explain: 'A rack inside PACIFIC, the slowest crowd in the game: a fast firm here is first to every gap it has.',
  },
  {
    id: 'colo-harbor-lakeside',
    name: 'Racks at HARBOR and LAKESIDE',
    price: 250 * K,
    distance: { HARBOR: 0.1, LAKESIDE: 0.1, PACIFIC: 30 },
    dataDistance: { HARBOR: 0.1, LAKESIDE: 7, PACIFIC: 30 },
    explain:
      'A rack in each building and a line between them. An order leaves from the rack next to the exchange it ' +
      'is for, so both legs land at once. What still takes time is the other exchange\u2019s quote crossing ' +
      'the link to wherever the decision is made: half the round trip of one rack, and the line is what you ' +
      'pay for next.',
  },
  {
    id: 'colo-all',
    name: 'Racks at all three',
    price: 600 * K,
    distance: { HARBOR: 0.1, LAKESIDE: 0.1, PACIFIC: 0.1 },
    dataDistance: { HARBOR: 0.1, LAKESIDE: 7, PACIFIC: 30 },
    explain:
      'A rack in every building. Every order lands at once; every far quote still takes as long as light ' +
      'takes to bring it. From here the only thing left to buy is a faster line.',
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
  {
    id: 'laser',
    name: 'Laser link',
    price: 400 * K,
    factor: 0.5,
    overhead: 0.3,
    explain:
      'Free-space optics: a beam between rooftops, straighter than towers and faster than air through a ' +
      'waveguide. The last few hundred microseconds between your racks, and fog takes it down, so the ' +
      'microwave and the fibre stay as the fallbacks. From here there is nothing left to buy but a better idea.',
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
    maxSymbols: 4,
    explain:
      'Runs one strategy block, thinks twenty times a second, sends twenty orders a second at most, and can ' +
      'follow four symbols. Pick them on the market page.',
  },
  {
    id: 'server',
    name: 'Server',
    price: 15 * K,
    maxBlocks: 2,
    ordersPerSecond: 100,
    decisionEveryMs: 20,
    maxSymbols: 8,
    explain: 'Two blocks at once, fifty decisions a second, a hundred orders a second, eight symbols followed.',
  },
  {
    id: 'rack',
    name: 'Rack with custom hardware',
    price: 60 * K,
    maxBlocks: 4,
    ordersPerSecond: 500,
    decisionEveryMs: 10,
    maxSymbols: 20,
    explain: 'Every block, every symbol, a decision every tick, and orders as fast as the line can carry them.',
  },
];

export const COMPETITORS: CompetitorSpec[] = [
  {
    id: 'midtown',
    name: 'Midtown Capital',
    location: 'city',
    network: 'fibre',
    computer: 'server',
    minEdge: 0.5,
    maxLatency: 10,
  },
  {
    id: 'lakeside-partners',
    name: 'Lakeside Partners',
    location: 'colo-lakeside',
    network: 'fibre',
    computer: 'server',
    minEdge: 0.4,
  },
  {
    id: 'bayview',
    name: 'Bayview Systems',
    location: 'colo-pacific',
    network: 'fibre',
    computer: 'server',
    minEdge: 0.3,
  },
  {
    id: 'harbor-quant',
    name: 'Harbor Quant',
    location: 'colo-harbor-lakeside',
    network: 'microwave',
    computer: 'rack',
    minEdge: 0.1,
  },
];

export const STARTING_CASH = 200 * K;
export const START = { location: 'home', network: 'consumer', computer: 'laptop' };
