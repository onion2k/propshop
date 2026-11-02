import { CONTENT } from '../src/content';
import { Firm } from '../src/sim/firm';
import { Game, MS_PER_MINUTE, TICK_MS } from '../src/sim';
import { infrastructureFrom } from '../src/sim/upgrades';

// A measurement, not a check: PACE=1 npx vitest run test/pace.test.ts prints what each setup earns a day.
const measure = process.env.PACE ? it : it.skip;
measure('paces', { timeout: 300_000 }, () => {
  const configs: [string, { location: string; network: string; computer: string }, string[]][] = [
    ['home arb', { location: 'home', network: 'consumer', computer: 'laptop' }, ['arbitrage']],
    ['home mm', { location: 'home', network: 'consumer', computer: 'laptop' }, ['marketMaker']],
    ['home momentum', { location: 'home', network: 'consumer', computer: 'laptop' }, ['momentum']],
    [
      'city fibre server arb+mm',
      { location: 'city', network: 'fibre', computer: 'server' },
      ['arbitrage', 'marketMaker'],
    ],
    ['colo micro rack arb', { location: 'colo-harbor', network: 'microwave', computer: 'rack' }, ['arbitrage']],
  ];
  const lines: string[] = [];
  for (const [name, infra, blocks] of configs) {
    const g = new Game(CONTENT, 123);
    g.firm.infra = infrastructureFrom(CONTENT, infra);
    for (const b of g.firm.blocks) b.enabled = blocks.includes(b.id);
    g.skipToOpen();
    for (let i = 0; i < (20 * MS_PER_MINUTE) / TICK_MS; i++) g.step();
    const f: Firm = g.firm;
    const pnl = f.realised - f.feesPaid + f.unrealised(g.market, g.now);
    const perDay = (x: number) => Math.round((x * 19.5) / 100);
    lines.push(
      `${name.padEnd(28)} fills ${String(f.stats.fillsReceived).padStart(5)} sent ${String(f.stats.ordersSent).padStart(5)} dropped ${String(f.stats.ordersDropped).padStart(4)}  realised/day $${perDay(f.realised)} fees/day $${perDay(f.feesPaid)} unreal $${Math.round(f.unrealised(g.market, g.now) / 100)}  pnl/day $${perDay(pnl)}`,
    );
    if (name === 'home arb') {
      for (const c of g.competitors) {
        const p = c.realised - c.feesPaid + c.unrealised(g.market, g.now);
        lines.push(
          `  bot ${c.name.padEnd(20)} fills ${String(c.stats.fillsReceived).padStart(5)} pnl/day $${perDay(p)}`,
        );
      }
    }
  }
  process.stderr.write(lines.join('\n') + '\n');
});
