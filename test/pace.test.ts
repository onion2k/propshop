// A measurement, not a check: PACE=1 npx vitest run test/pace.test.ts prints what each setup earns a day, over a
// few seeds and an hour of each, scaled to a day. PACE_MINUTES and PACE_SEEDS change the length and the seeds.
import { CONTENT } from '../src/content';
import { Game, MS_PER_MINUTE, TICK_MS, isMarketOpen } from '../src/sim';
import { HAND_BLOCK, type Firm } from '../src/sim/firm';
import { blockById, paramsFrom, type MarketView } from '../src/sim/strategy';
import { infrastructureFrom } from '../src/sim/upgrades';

const measure = process.env.PACE ? it : it.skip;
const MINUTES = Number(process.env.PACE_MINUTES ?? 60);
const SEEDS = (process.env.PACE_SEEDS ?? '1,2,3').split(',').map(Number);
const HOME = { location: 'home', network: 'consumer', computer: 'laptop' };
const CITY = { location: 'city', network: 'fibre', computer: 'server' };
const COLO = { location: 'colo-harbor', network: 'microwave', computer: 'rack' };
// The futures desk's seats: a rack at the Prairie Board on fibre or microwave, and one at Lakeside, the nearest
// stock exchange to it (plans/desk-futures.md).
const PRAIRIE_FIBRE = { location: 'colo-prairie', network: 'fibre', computer: 'rack' };
const PRAIRIE_MW = { location: 'colo-prairie', network: 'microwave', computer: 'rack' };
const LAKESIDE_MW = { location: 'colo-lakeside', network: 'microwave', computer: 'rack' };
const DESK_BLOCK_IDS = ['basisArb', 'leadLag', 'roll'];

type Config = [
  string,
  { location: string; network: string; computer: string },
  string[],
  Record<string, Record<string, number>>?,
];
const HAND = 'hand';
const ONLY = process.env.PACE_ONLY;
const CONFIGS: Config[] = [
  ['home arb', HOME, ['arbitrage']],
  ['home mm', HOME, ['marketMaker']],
  ['colo mm half0', COLO, ['marketMaker'], { marketMaker: { halfSpread: 0 } }],
  ['home momentum', HOME, ['momentum']],
  ['home news', HOME, ['newsReaction']],
  ['home revert', HOME, ['meanReversion']],
  ['colo revert', COLO, ['meanReversion']],
  ['home sniper', HOME, ['sniper']],
  ['colo sniper', COLO, ['sniper']],
  ['colo pairs', COLO, ['pairs']],
  ['home indexArb', HOME, ['indexArb']],
  ['colo indexArb', COLO, ['indexArb']],
  ['city momentum', CITY, ['momentum']],
  ['city arb', CITY, ['arbitrage']],
  ['city arb near', CITY, ['arbitrage'], { arbitrage: { maxLatency: 10 } }],
  ['city mm', CITY, ['marketMaker']],
  ['city arb+mm', CITY, ['arbitrage', 'marketMaker']],
  ['colo arb', COLO, ['arbitrage']],
  ['colo mm', COLO, ['marketMaker']],
  // A person: momentum's decisions sent by hand, one order of 5,000 at a time (a size that must be split over exchanges), after the reaction time.
  ['home hand', HOME, [HAND]],
  ['colo hand', COLO, [HAND]],
  ['home leadLag', HOME, ['leadLag']],
  ['prairie leadLag fibre', PRAIRIE_FIBRE, ['leadLag']],
  ['prairie leadLag mw', PRAIRIE_MW, ['leadLag']],
  ['lakeside leadLag mw', LAKESIDE_MW, ['leadLag']],
  ['prairie basisArb mw', PRAIRIE_MW, ['basisArb']],
  ['lakeside basisArb mw', LAKESIDE_MW, ['basisArb']],
  ['home roll', HOME, ['roll']],
  ['home leadLag t0.5', HOME, ['leadLag'], { leadLag: { threshold: 0.5 } }],
  ['prairie leadLag fibre t0.5', PRAIRIE_FIBRE, ['leadLag'], { leadLag: { threshold: 0.5 } }],
  ['prairie leadLag mw t0.5', PRAIRIE_MW, ['leadLag'], { leadLag: { threshold: 0.5 } }],
  ['prairie leadLag mw t1', PRAIRIE_MW, ['leadLag'], { leadLag: { threshold: 1 } }],
  ['lakeside leadLag mw t0.5', LAKESIDE_MW, ['leadLag'], { leadLag: { threshold: 0.5 } }],
  ['prairie basisArb mw t0.5', PRAIRIE_MW, ['basisArb'], { basisArb: { threshold: 0.5 } }],
  ['prairie basisArb mw t1', PRAIRIE_MW, ['basisArb'], { basisArb: { threshold: 1 } }],
];

function pnl(f: Firm, g: Game): number {
  return f.realised - f.feesPaid + f.unrealised(g.market, g.now);
}

measure('paces', { timeout: 3_600_000 }, () => {
  const perDay = (x: number) => Math.round((x * (390 / MINUTES)) / 100);
  const rows: Record<string, number[]> = {};
  const fills: Record<string, number[]> = {};
  const add = (name: string, value: number, n: number) => {
    (rows[name] ??= []).push(perDay(value));
    (fills[name] ??= []).push(n);
  };
  for (const seed of SEEDS) {
    for (const [name, infra, blocks, params] of CONFIGS) {
      if (ONLY && !ONLY.split(',').some((o) => name.includes(o))) continue;
      const g = new Game(CONTENT, seed);
      // A futures block opens the desk, and watches the index and its contracts first, so a laptop sees them too.
      const desk = blocks.some((b) => DESK_BLOCK_IDS.includes(b));
      if (desk) g.openDesk('futures');
      g.firm.infra = infrastructureFrom(CONTENT, infra);
      for (const b of g.firm.blocks) b.enabled = blocks.includes(b.id);
      for (const [id, p] of Object.entries(params ?? {})) g.setBlock(id, { params: p });
      // Watch everything the computer allows, the index first so index arbitrage has its basket on a rack.
      g.firm.setWatch([
        'IDX',
        ...(desk ? g.market.live('IXF') : []),
        ...CONTENT.stocks.filter((s) => !s.constituents).map((s) => s.symbol),
      ]);
      g.skipToOpen();
      const person = blocks.includes(HAND);
      const momentum = blockById('momentum');
      // The block's own size range stops at 2,000; the person's order is larger than any one top of book.
      const HAND_SIZE = 5000;
      const mp = { ...paramsFrom(momentum.spec), size: HAND_SIZE };
      for (let i = 0; i < (MINUTES * MS_PER_MINUTE) / TICK_MS; i++) {
        g.step();
        // The person looks every 50 ms (the laptop's own decision rate) and clicks only with nothing of theirs
        // waiting or in the air; momentum reads the position the hand orders have built.
        if (person && i % 25 === 0 && isMarketOpen(g.now)) {
          const f = g.firm as unknown as {
            view(n: number, m: Game['market'], news: []): MarketView;
          };
          if (g.firm.pendingHand.length > 0) continue;
          if (
            [...g.firm.orders.values()].some(
              (o) => o.block === HAND_BLOCK && (o.status === 'inflight' || o.status === 'cancelling'),
            )
          )
            continue;
          const v = f.view(g.now, g.market, []);
          const mine = { ...v, blockPositions: { momentum: v.blockPositions[HAND_BLOCK] ?? {} } };
          for (const intent of momentum.decide(mine, mp)) {
            if (intent.kind !== 'order') continue;
            // The block caps an order at the quote it sees; a person sends the whole size, an entry in full and an
            // exit for what is held.
            const held = Math.abs(v.blockPositions[HAND_BLOCK]?.[intent.symbol] ?? 0);
            const size = held === 0 ? HAND_SIZE : held;
            g.hand({ symbol: intent.symbol, side: intent.side, size, exchange: 'best', type: 'market' });
            break;
          }
        }
      }
      add(name, pnl(g.firm, g), g.firm.stats.fillsReceived);
      if (name === 'prairie leadLag mw')
        for (const c of g.competitors.filter((x) => x.name === 'Prairie Partners'))
          add(`bot ${c.name} (desk open)`, pnl(c, g), c.stats.fillsReceived);
      if (name === 'home arb' || name === 'home hand')
        for (const c of g.competitors) add(`bot ${c.name}${person ? ' (hand)' : ''}`, pnl(c, g), c.stats.fillsReceived);
    }
  }
  const lines = Object.entries(rows).map(([name, values]) => {
    const mean = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    const f = fills[name] ?? [];
    const meanFills = Math.round(f.reduce((a, b) => a + b, 0) / f.length);
    return `${name.padEnd(24)} $/day ${String(mean).padStart(8)}  seeds [${values.map((v) => String(v).padStart(7)).join(', ')}]  fills/h ${Math.round(meanFills / (MINUTES / 60))}`;
  });
  process.stderr.write(lines.join('\n') + '\n');
});
