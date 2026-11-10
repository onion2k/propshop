// A measurement, not a check: PACE=1 npx vitest run test/pace.test.ts prints what each setup earns a day, over a
// few seeds and an hour of each, scaled to a day. PACE_MINUTES and PACE_SEEDS change the length and the seeds.
import { CONTENT } from '../src/content';
import { Game, MS_PER_MINUTE, TICK_MS, isMarketOpen } from '../src/sim';
import { isOption } from '../src/sim/instrument';
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
// The currencies desk's: from home (35 ms of fibre to Eastholm), and a rack in Eastholm beside both venues
// (plans/desk-fx.md). A block of the desk opens it and watches the three pairs first.
const EASTHOLM = { location: 'colo-eastholm', network: 'fibre', computer: 'rack' };
const HOME_FIBRE = { location: 'home', network: 'fibre', computer: 'server' };
const FX_BLOCK_IDS = ['triangle', 'carry'];
const FX_PAIRS = ['EURUSD', 'USDJPY', 'EURJPY'];
// The metals desk's: from home, and the racks at Thamesford (the spot and its fixes) and at Hudson (the futures), on
// fibre (plans/desk-metals.md). A block of the desk opens it and watches gold, the miner and gold's two nearest
// futures first, so a laptop's four are those.
const THAMESFORD_RACK = { location: 'colo-thamesford', network: 'fibre', computer: 'rack' };
const HUDSON_RACK = { location: 'colo-hudson', network: 'fibre', computer: 'rack' };
const METAL_BLOCK_IDS = ['curve', 'fixArb', 'crossPairs'];
// The options desk's: from home, and from the rack at the Prairie Board that serves it, on microwave
// (plans/desk-options.md 7f). A block of the desk opens it (and the futures desk) and watches the index, its futures
// and the options first. The hour from the open holds the first of the day's trades only: a day's maker is read
// from whole days by regime, `OPTION_PACE=1 npx vitest run test/optionpace.test.ts` (see docs/measured.md).
const OPTION_BLOCK_IDS = ['optionMaker', 'parity', 'eventVol'];

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
  ['fx home triangle book', HOME, ['triangle']],
  ['fx home fibre triangle book', HOME_FIBRE, ['triangle']],
  ['fx eastholm triangle book', EASTHOLM, ['triangle']],
  ['fx home triangle dealer', HOME, ['triangle'], { triangle: { venue: 1 } }],
  ['fx home fibre triangle dealer', HOME_FIBRE, ['triangle'], { triangle: { venue: 1 } }],
  ['fx eastholm triangle dealer', EASTHOLM, ['triangle'], { triangle: { venue: 1 } }],
  ['fx home carry', HOME, ['carry']],
  ['metals home curve', HOME, ['curve']],
  ['metals thamesford curve', THAMESFORD_RACK, ['curve']],
  ['metals hudson curve', HUDSON_RACK, ['curve']],
  ['metals home fixArb', HOME, ['fixArb']],
  ['metals thamesford fixArb', THAMESFORD_RACK, ['fixArb']],
  ['metals hudson fixArb', HUDSON_RACK, ['fixArb']],
  ['options home maker', HOME, ['optionMaker']],
  ['options prairie maker', PRAIRIE_MW, ['optionMaker']],
  ['options prairie maker unhedged', PRAIRIE_MW, ['optionMaker'], { optionMaker: { hedge: 0 } }],
  ['options home parity', HOME, ['parity']],
  ['options prairie parity', PRAIRIE_MW, ['parity']],
  ['options home eventVol', HOME, ['eventVol']],
  ['options prairie eventVol', PRAIRIE_MW, ['eventVol']],
  ['metals home crossPairs', HOME, ['crossPairs']],
  ['metals thamesford crossPairs', THAMESFORD_RACK, ['crossPairs']],
  ['metals hudson crossPairs', HUDSON_RACK, ['crossPairs']],
];
// PACE_FX='{"triangle":{"threshold":2}}' sets the currencies' blocks' parameters over every fx row, for tuning.
const FX_OVER = JSON.parse(process.env.PACE_FX ?? '{}') as Record<string, Record<string, number>>;
// PACE_METALS='{"fixArb":{"threshold":2}}' sets the metals blocks' parameters over every metals row, the same way.
const METALS_OVER = JSON.parse(process.env.PACE_METALS ?? '{}') as Record<string, Record<string, number>>;

function pnl(f: Firm, g: Game): number {
  return f.realised - f.feesPaid + f.unrealised(g.market, g.now);
}

measure('paces', { timeout: 3_600_000 }, () => {
  const perDay = (x: number) => Math.round((x * (390 / MINUTES)) / 100);
  const rows: Record<string, number[]> = {};
  const fills: Record<string, number[]> = {};
  /** Each currencies row's orders refused by the dealer, and sent, a seed at a time. */
  const refusals: Record<string, [number, number][]> = {};
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
      const fx = blocks.some((b) => FX_BLOCK_IDS.includes(b));
      if (fx) g.openDesk('fx');
      const metals = blocks.some((b) => METAL_BLOCK_IDS.includes(b));
      if (metals) g.openDesk('metals');
      const options = blocks.some((b) => OPTION_BLOCK_IDS.includes(b));
      if (options) g.openDesk('options');
      g.firm.infra = infrastructureFrom(CONTENT, infra);
      for (const b of g.firm.blocks) b.enabled = blocks.includes(b.id);
      for (const [id, p] of Object.entries(params ?? {})) g.setBlock(id, { params: p });
      if (fx) for (const [id, p] of Object.entries(FX_OVER)) g.setBlock(id, { params: p });
      if (metals) for (const [id, p] of Object.entries(METALS_OVER)) g.setBlock(id, { params: p });
      // Watch everything the computer allows, the index first so index arbitrage has its basket on a rack.
      g.firm.setWatch([
        ...(fx ? FX_PAIRS : []),
        ...(metals ? ['XAU', 'RDG', ...g.market.live('GC').slice(0, 2), 'XAG', ...g.market.live('SI')] : []),
        'IDX',
        ...(desk || options ? g.market.live('IXF') : []),
        ...(options ? g.market.stocks.filter(isOption).map((x) => x.symbol) : []),
        ...CONTENT.stocks.filter((s) => !s.constituents).map((s) => s.symbol),
      ]);
      g.skipToOpen();
      // The currencies trade all night, so their hour is measured from here, not from nothing.
      const startEquity = fx || metals ? g.firm.equity(g.market, g.now) : 0;
      const kestrel = g.competitors.find((x) => x.name === 'Kestrel Currency');
      const kestrelStart = kestrel ? kestrel.equity(g.market, g.now) : 0;
      const aldgate = g.competitors.find((x) => x.name === 'Aldgate Metals');
      const aldgateStart = aldgate ? aldgate.equity(g.market, g.now) : 0;
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
      // A currency firm's P&L is its equity's move: its balances, in dollars at the rates now, are the position.
      // The metals' too: delivered metal and storage are cash and holdings, not realised P&L.
      add(
        name,
        fx || metals ? g.firm.equity(g.market, g.now) - startEquity : pnl(g.firm, g),
        g.firm.stats.fillsReceived,
      );
      if (metals && aldgate && name.includes('fixArb'))
        add(
          `bot Aldgate (${name.slice(7)})`,
          aldgate.equity(g.market, g.now) - aldgateStart,
          aldgate.stats.fillsReceived,
        );
      if (fx) {
        const sent = [...g.firm.orders.values()].filter((o) => FX_PAIRS.includes(o.symbol) && o.status !== 'rejected');
        const refused = sent.filter((o) => o.status === 'refused').length;
        (refusals[name] ??= []).push([refused, sent.length]);
        if (name.includes('triangle book') || name.includes('triangle dealer'))
          for (const c of g.competitors.filter((x) => x.name === 'Kestrel Currency'))
            add(`bot Kestrel (${name.slice(3)})`, c.equity(g.market, g.now) - kestrelStart, c.stats.fillsReceived);
      }
      if (options && name.includes('prairie'))
        for (const c of g.competitors.filter((x) => x.name === 'Bluestem Volatility'))
          add(`bot Bluestem (${name.slice(8)})`, pnl(c, g), c.stats.fillsReceived);
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
    const r = refusals[name];
    const refused = r
      ? `  refused ${r.map(([a, b]) => `${a}/${b}`).join(', ')} (${Math.round(
          (100 * r.reduce((n, [a]) => n + a, 0)) /
            Math.max(
              1,
              r.reduce((n, [, b]) => n + b, 0),
            ),
        )}%)`
      : '';
    return `${name.padEnd(24)} $/day ${String(mean).padStart(8)}  seeds [${values.map((v) => String(v).padStart(7)).join(', ')}]  fills/h ${Math.round(meanFills / (MINUTES / 60))}${refused}`;
  });
  process.stderr.write(lines.join('\n') + '\n');
});
