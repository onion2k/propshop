// A measurement, not a check: PACE=1 npx vitest run test/pace.test.ts prints what each setup earns a day, over a
// few seeds and an hour of each, scaled to a day. PACE_MINUTES and PACE_SEEDS change the length and the seeds.
import { CONTENT } from '../src/content';
import { Game, MS_PER_MINUTE, TICK_MS } from '../src/sim';
import type { Firm } from '../src/sim/firm';
import { infrastructureFrom } from '../src/sim/upgrades';

const measure = process.env.PACE ? it : it.skip;
const MINUTES = Number(process.env.PACE_MINUTES ?? 60);
const SEEDS = (process.env.PACE_SEEDS ?? '1,2,3').split(',').map(Number);
const HOME = { location: 'home', network: 'consumer', computer: 'laptop' };
const CITY = { location: 'city', network: 'fibre', computer: 'server' };
const COLO = { location: 'colo-harbor', network: 'microwave', computer: 'rack' };

const CONFIGS: [string, { location: string; network: string; computer: string }, string[]][] = [
  ['home arb', HOME, ['arbitrage']],
  ['home mm', HOME, ['marketMaker']],
  ['home momentum', HOME, ['momentum']],
  ['home news', HOME, ['newsReaction']],
  ['city arb', CITY, ['arbitrage']],
  ['city mm', CITY, ['marketMaker']],
  ['city arb+mm', CITY, ['arbitrage', 'marketMaker']],
  ['colo arb', COLO, ['arbitrage']],
  ['colo mm', COLO, ['marketMaker']],
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
    for (const [name, infra, blocks] of CONFIGS) {
      const g = new Game(CONTENT, seed);
      g.firm.infra = infrastructureFrom(CONTENT, infra);
      for (const b of g.firm.blocks) b.enabled = blocks.includes(b.id);
      g.skipToOpen();
      for (let i = 0; i < (MINUTES * MS_PER_MINUTE) / TICK_MS; i++) g.step();
      add(name, pnl(g.firm, g), g.firm.stats.fillsReceived);
      if (name === 'home arb') for (const c of g.competitors) add(`bot ${c.name}`, pnl(c, g), c.stats.fillsReceived);
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
