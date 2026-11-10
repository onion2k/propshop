// A measurement, not a check: ROUGH_PACE=1 npx vitest run test/roughpace.test.ts plays each block's setup for an hour
// from the open twice per seed, once exact (2 ms a step) and once as the top speed steps it (src/sim/stride.ts), and
// writes what each earned, scaled to a day, with the share of the hour that ran rough, to ROUGH_OUT (JSON). It holds
// nothing; plans/rough-speed.md says what to do if a block's rough day is far from its exact day.
// ROUGH_MINUTES (60), ROUGH_SEEDS (1,2,3) and ROUGH_ONLY (names, comma separated) change the run. ROUGH_FIXED=10 steps
// the second run a fixed 10 ms (landing on the end) instead of by the chooser: a sweep of the step, to see where a block
// breaks.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONTENT } from '../src/content';
import { Game, MS_PER_MINUTE, StrideTracker, TICK_MS, isMarketOpen, strideAt } from '../src/sim';
import { MARKET_CLOSE, MARKET_OPEN } from '../src/sim/clock';
import { isOption } from '../src/sim/instrument';
import type { Firm } from '../src/sim/firm';
import { infrastructureFrom } from '../src/sim/upgrades';

const measure = process.env.ROUGH_PACE ? it : it.skip;
const MINUTES = Number(process.env.ROUGH_MINUTES ?? 60);
const SEEDS = (process.env.ROUGH_SEEDS ?? '1,2,3').split(',').map(Number);
const ONLY = process.env.ROUGH_ONLY;
const FIXED = process.env.ROUGH_FIXED ? Number(process.env.ROUGH_FIXED) : null;
const OUT = process.env.ROUGH_OUT ?? join(tmpdir(), 'roughpace.json');

const HOME = { location: 'home', network: 'consumer', computer: 'laptop' };
const CITY = { location: 'city', network: 'fibre', computer: 'server' };
const COLO = { location: 'colo-harbor', network: 'microwave', computer: 'rack' };
const PRAIRIE_MW = { location: 'colo-prairie', network: 'microwave', computer: 'rack' };
const EASTHOLM = { location: 'colo-eastholm', network: 'fibre', computer: 'rack' };
const THAMESFORD = { location: 'colo-thamesford', network: 'fibre', computer: 'rack' };

type Infra = { location: string; network: string; computer: string };
// The names are the PACE harness's, for the rows that are the same setups.
const CONFIGS: [string, Infra, string[], string?][] = [
  ['home momentum', HOME, ['momentum']],
  ['home arb', HOME, ['arbitrage']],
  ['city arb', CITY, ['arbitrage']],
  ['colo arb', COLO, ['arbitrage']],
  ['city mm', CITY, ['marketMaker']],
  ['colo mm', COLO, ['marketMaker']],
  ['colo sniper', COLO, ['sniper']],
  ['colo indexArb', COLO, ['indexArb']],
  ['prairie leadLag mw', PRAIRIE_MW, ['leadLag'], 'futures'],
  ['prairie basisArb mw', PRAIRIE_MW, ['basisArb'], 'futures'],
  ['fx eastholm triangle book', EASTHOLM, ['triangle'], 'fx'],
  ['metals thamesford fixArb', THAMESFORD, ['fixArb'], 'metals'],
  ['options prairie maker', PRAIRIE_MW, ['optionMaker'], 'options'],
];

const pnl = (f: Firm, g: Game) => f.realised - f.feesPaid + f.unrealised(g.market, g.now);

function setup(seed: number, infra: Infra, blocks: string[], desk: string | undefined): Game {
  const g = new Game(CONTENT, seed);
  if (desk) g.openDesk(desk);
  g.firm.infra = infrastructureFrom(CONTENT, infra);
  for (const b of g.firm.blocks) b.enabled = blocks.includes(b.id);
  g.firm.setWatch([
    ...(desk === 'fx' ? ['EURUSD', 'USDJPY', 'EURJPY'] : []),
    ...(desk === 'metals' ? ['XAU', 'RDG', ...g.market.live('GC').slice(0, 2), 'XAG', ...g.market.live('SI')] : []),
    'IDX',
    ...(desk === 'futures' || desk === 'options' ? g.market.live('IXF') : []),
    ...(desk === 'options' ? g.market.stocks.filter(isOption).map((x) => x.symbol) : []),
    ...CONTENT.stocks.filter((s) => !s.constituents).map((s) => s.symbol),
  ]);
  g.skipToOpen();
  return g;
}

measure('rough against exact', { timeout: 6 * 3_600_000 }, () => {
  const perDay = (x: number) => Math.round((x * (390 / MINUTES)) / 100);
  const rows: Record<string, { seed: number; exact: number; rough: number; fills: [number, number]; share: number }[]> =
    {};
  for (const seed of SEEDS) {
    for (const [name, infra, blocks, desk] of CONFIGS) {
      if (ONLY && !ONLY.split(',').some((o) => name.includes(o))) continue;
      const started = Date.now();
      const a = setup(seed, infra, blocks, desk);
      const until = a.now + MINUTES * MS_PER_MINUTE;
      const equity0 = a.firm.equity(a.market, a.now);
      const own = (g: Game) =>
        desk === 'fx' || desk === 'metals' ? g.firm.equity(g.market, g.now) - equity0 : pnl(g.firm, g);
      a.stepTicks((MINUTES * MS_PER_MINUTE) / TICK_MS);
      const b = setup(seed, infra, blocks, desk);
      const tracker = new StrideTracker(b);
      let roughMs = 0;
      while (b.now < until) {
        const dt = Math.min(FIXED ?? strideAt(tracker.view(b)), until - b.now);
        if (dt > TICK_MS) roughMs += dt;
        b.step(dt);
      }
      (rows[name] ??= []).push({
        seed,
        exact: perDay(own(a)),
        rough: perDay(own(b)),
        fills: [a.firm.stats.fillsReceived, b.firm.stats.fillsReceived],
        share: roughMs / (MINUTES * MS_PER_MINUTE),
      });
      process.stderr.write(`${name} seed ${seed}: ${((Date.now() - started) / 1000).toFixed(0)} s\n`);
    }
  }
  const lines = Object.entries(rows).map(([name, rs]) => {
    const fmt = (xs: number[]) => xs.map((x) => String(x).padStart(7)).join(', ');
    return (
      `${name.padEnd(28)} exact $/day [${fmt(rs.map((r) => r.exact))}]  rough [${fmt(rs.map((r) => r.rough))}]  ` +
      `fills/h exact [${rs.map((r) => r.fills[0]).join(', ')}] rough [${rs.map((r) => r.fills[1]).join(', ')}]  ` +
      `rough share ${Math.round((100 * rs.reduce((n, r) => n + r.share, 0)) / rs.length)}%`
    );
  });
  process.stderr.write(lines.join('\n') + '\n');
  writeFileSync(OUT, JSON.stringify({ minutes: MINUTES, seeds: SEEDS, rows }, null, 2));
});

// ROUGH_SHARE=1 npx vitest run test/roughpace.test.ts: the share of the session (09:30 to 16:00) that is exact, in
// windows, when the top speed steps it by the chooser with the news as drawn, on each seed, stocks only and then with
// every desk open. Nothing trades in the rest: the blocks sleep.
const share = process.env.ROUGH_SHARE ? it : it.skip;
share('the exact share of a session', { timeout: 3_600_000 }, () => {
  const lines: string[] = [];
  for (const seed of SEEDS) {
    for (const all of [false, true]) {
      const g = new Game(CONTENT, seed);
      if (all) for (const d of g.market.desks) g.openDesk(d);
      g.skipToOpen();
      const tracker = new StrideTracker(g);
      const close = g.now + 60_000 + (MARKET_CLOSE - MARKET_OPEN);
      let exact = 0;
      let total = 0;
      while (g.now < close) {
        const dt = Math.min(strideAt(tracker.view(g)), close - g.now);
        if (isMarketOpen(g.now + dt)) {
          total += dt;
          if (dt === TICK_MS) exact += dt;
        }
        g.step(dt);
      }
      lines.push(
        `seed ${seed} ${all ? 'every desk' : 'stocks only'}: exact ${((100 * exact) / total).toFixed(1)}% of the session (${(exact / 1000).toFixed(0)} s of ${(total / 1000).toFixed(0)} s)`,
      );
    }
  }
  process.stderr.write(lines.join('\n') + '\n');
});
