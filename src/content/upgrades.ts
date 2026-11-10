// The shop. Distances are one-way milliseconds through fibre; a network multiplies them and adds its own overhead.
// Prices are cents, sized so the whole path from home to colocation is about eighty trading days of what the
// blocks earn on the way (see test/pace.test.ts), a couple of hours at the top speed. Each seat, line and computer
// past the free ones also costs a weekly rent, charged at Friday's close: about two per cent of its price for the
// first rungs and about a point less for the dearest, so that a seat's week (median seed, PACE harness) covers its rent
// with room: drafts, held by nothing (docs/measured.md has what each seat earns a week against them).
import type { CompetitorSpec, ComputerSpec, LocationSpec, NetworkSpec } from '../sim';

const K = 100_000;
/** A dollar, in cents: the rents below are written in dollars a week. */
const DOLLAR = 100;

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
    price: 8 * K,
    rent: 160 * DOLLAR,
    distance: { HARBOR: 2, LAKESIDE: 7, PACIFIC: 30 },
    explain: 'Downtown, a few miles from the HARBOR data centre. Latency to HARBOR falls to a couple of milliseconds.',
  },
  {
    id: 'colo-harbor',
    name: 'Colocation at HARBOR',
    price: 80 * K,
    rent: 1600 * DOLLAR,
    distance: { HARBOR: 0.1, LAKESIDE: 7, PACIFIC: 30 },
    explain:
      'A rack in the exchange building itself. Orders reach the matching engine in microseconds. ' +
      'LAKESIDE is still a long link away: that is why firms colocate at both and run a fast line between them.',
  },
  {
    id: 'colo-lakeside',
    name: 'Colocation at LAKESIDE',
    price: 80 * K,
    rent: 1600 * DOLLAR,
    distance: { HARBOR: 7, LAKESIDE: 0.1, PACIFIC: 20 },
    explain: 'A rack inside LAKESIDE. Fastest there, a long link from HARBOR and a longer one from PACIFIC.',
  },
  {
    id: 'colo-pacific',
    name: 'Colocation at PACIFIC',
    price: 80 * K,
    rent: 1600 * DOLLAR,
    distance: { HARBOR: 30, LAKESIDE: 20, PACIFIC: 0.1 },
    explain: 'A rack inside PACIFIC, the slowest crowd in the game: a fast firm here is first to every gap it has.',
  },
  {
    id: 'colo-harbor-lakeside',
    name: 'Racks at HARBOR and LAKESIDE',
    price: 250 * K,
    rent: 3000 * DOLLAR,
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
    rent: 8000 * DOLLAR,
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
    price: 5 * K,
    rent: 100 * DOLLAR,
    factor: 1,
    overhead: 1,
    explain:
      'A dedicated line and your own gear at each end. Light in glass travels at two thirds of its speed in air.',
  },
  {
    id: 'microwave',
    name: 'Microwave link',
    price: 120 * K,
    rent: 2400 * DOLLAR,
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
    rent: 5000 * DOLLAR,
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
    price: 5 * K,
    rent: 100 * DOLLAR,
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
    rent: 1200 * DOLLAR,
    maxBlocks: 4,
    ordersPerSecond: 500,
    decisionEveryMs: 10,
    maxSymbols: 20,
    explain: 'Every block, every symbol, a decision every tick, and orders as fast as the line can carry them.',
  },
  {
    id: 'fpga',
    name: 'FPGA',
    price: 400 * K,
    rent: 5000 * DOLLAR,
    maxBlocks: 4,
    ordersPerSecond: 1000,
    decisionEveryMs: 2,
    maxSymbols: 20,
    explain:
      'The strategy is burned into a chip, with no operating system and no software in the path: a decision ' +
      'every tick, a thousand orders a second, and the same four blocks and twenty symbols as the rack. This ' +
      'is what the fastest firms run. The rack thinks in microseconds of software; this thinks in the time a ' +
      'signal takes to cross the chip.',
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
  {
    // Racks at all three exchanges on the fastest line and the rack: the player who sends a large order
    // meets this firm in the book. It does not arbitrage, so minEdge is unused.
    id: 'shadow',
    name: 'Shadow Trading',
    location: 'colo-all',
    network: 'laser',
    computer: 'rack',
    minEdge: 0,
    // The chase is measured a loser in this market (see the block's explanation), so the rival runs the jump
    // alone: a sweep child of ten thousand shares never comes.
    blocks: [{ id: 'anticipate', params: { bigPrint: 10_000 } }],
  },
  {
    // The futures desk's rival, there once the desk opens: a rack at the Prairie Board and microwave to the stock
    // exchanges, trading the index on what the future already says. The firm the player races for the lead.
    id: 'prairie-partners',
    name: 'Prairie Partners',
    location: 'colo-prairie',
    network: 'microwave',
    computer: 'rack',
    minEdge: 0,
    desk: 'futures',
    blocks: [{ id: 'leadLag', params: { threshold: 0.5, shares: 3000 } }],
  },
  {
    // The currencies desk's rival, there once the desk opens: a rack in Eastholm, closing triangles on the book.
    // It watches the currencies alone. The firm the player races for the cross.
    id: 'kestrel',
    name: 'Kestrel Currency',
    location: 'colo-eastholm',
    network: 'fibre',
    computer: 'rack',
    minEdge: 0,
    desk: 'fx',
    watches: ['fx'],
    blocks: [{ id: 'triangle', params: { threshold: 1, lots: 20, venue: 0 } }],
  },
  {
    // The metals desk's rival, there once the desk opens: a rack at Thamesford, resting into the fix when its
    // indicative is off the future's. It watches the metals alone. The firm the player meets in the call. A draft name.
    id: 'aldgate',
    name: 'Aldgate Metals',
    location: 'colo-thamesford',
    network: 'fibre',
    computer: 'rack',
    minEdge: 0,
    desk: 'metals',
    watches: ['metals'],
    blocks: [{ id: 'fixArb', params: { threshold: 4, lots: 4 } }],
  },
  {
    // The options desk's rival, there once the desk opens: a rack at the Prairie Board, which is where the options
    // trade, quoting every option from the book's own volatility and hedging its delta in the index future. It sees
    // the futures and the options and not the stocks (it prices the index from the future). It quotes where the
    // venue's quoter does, half a point inside its two and a half (the player's default is a point inside), and looks twice a second: a
    // quicker or tighter rival made the every-desk-open step rate fall under its floor (docs/measured.md). It hedges
    // inside a band as wide as the player's. The firm the player meets in the options' books. A draft name.
    id: 'bluestem',
    name: 'Bluestem Volatility',
    location: 'colo-prairie',
    network: 'microwave',
    computer: 'rack',
    minEdge: 0,
    desk: 'options',
    watches: ['futures', 'options'],
    blocks: [{ id: 'optionMaker', params: { hedge: 1, every: 500, edge: 2 } }],
  },
];

export const STARTING_CASH = 200 * K;
export const START = {
  location: 'home',
  network: 'consumer',
  computer: 'laptop',
  /** The blocks that are on in a new game: momentum, the one that earns from a spare room. */
  blocks: ['momentum'],
};
