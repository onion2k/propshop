// A tool that measures, not a gate: what the options desk's blocks and its rival make in a day, headless, from the
// Prairie rack (plans/desk-options.md, 7d). Skipped unless OPTION_PACE is set. Prints one JSON line a run.
//
//   OPTION_PACE=1 OPTION_SEED=1 OPTION_DAYS=1 OPTION_BLOCK=optionMaker npx vitest run test/optionpace.test.ts
//
// OPTION_BLOCK is the player's block on (optionMaker, parity, eventVol, or none for the rival alone); OPTION_DAYS the
// weekdays to play (the first is a Monday).
import { CONTENT } from '../src/content';
import { OPTIONS_DESK, POX } from '../src/content/options';
import { Game, MS_PER_DAY, MS_PER_HOUR, MS_PER_YEAR, type Content } from '../src/sim';
import { isOption } from '../src/sim/instrument';
import { delta } from '../src/sim/options';
import { infrastructureFrom } from '../src/sim/upgrades';

const on = process.env.OPTION_PACE !== undefined;
const SEED = Number(process.env.OPTION_SEED ?? 1);
const DAYS = Number(process.env.OPTION_DAYS ?? 1);
const BLOCK = process.env.OPTION_BLOCK ?? 'optionMaker';
const RIVAL = process.env.OPTION_RIVAL !== '0';

describe.skipIf(!on)('the options desk, a day from the Prairie rack', () => {
  it('plays', () => {
    const content: Content = RIVAL ? CONTENT : { ...CONTENT, competitors: [] };
    const g = new Game(content, SEED);
    g.openDesk(OPTIONS_DESK);
    g.firm.infra = infrastructureFrom(CONTENT, { location: 'colo-prairie', network: 'microwave', computer: 'rack' });
    for (const b of g.firm.blocks) b.enabled = b.id === BLOCK;
    g.skipToOpen();
    // The rack follows twenty symbols and there are fourteen stocks: the player chooses the index, its future and the
    // options (listed afresh each day).
    const watch = () =>
      g.firm.setWatch(['IDX', ...g.market.live('IXF'), ...g.market.stocks.filter(isOption).map((s) => s.symbol)]);
    watch();
    const rival = g.competitors.find((c) => c.id === 'bot:bluestem');
    const started = Date.now();
    const days: unknown[] = [];
    for (let day = 0; day < DAYS; day++) {
      const closeAt = Math.floor(g.now / MS_PER_DAY) * MS_PER_DAY + 16 * MS_PER_HOUR;
      const player0 = g.firm.equity(g.market, g.now);
      const rival0 = rival?.equity(g.market, g.now) ?? 0;
      let largestNet = 0;
      let largestHeld = 0;
      let sampledFills = 0;
      // The books: how often an option near the money (within a strike step of the index) had a bid and an ask, and
      // how often any option's book was crossed.
      let nearSamples = 0;
      let nearTwoSided = 0;
      let crossed = 0;
      const venue = g.market.venue(POX.id);
      // Fills as they come, tagged an option or not while the option is still listed (it is gone after the close).
      const mine: { symbol: string; size: number; option: boolean }[] = [];
      const theirs: { symbol: string; size: number; option: boolean }[] = [];
      while (g.now < closeAt + 2) {
        g.step(2);
        for (const f of g.firm.tickFills)
          mine.push({ symbol: f.symbol, size: f.size, option: g.market.optionSpecs.has(f.symbol) });
        if (rival)
          for (const f of rival.tickFills)
            theirs.push({ symbol: f.symbol, size: f.size, option: g.market.optionSpecs.has(f.symbol) });
        if (g.now % 5000 !== 0 || !rival) continue;
        let net = 0;
        const spot = g.market.fair.get('IDX')!;
        for (const s of g.market.stocks) {
          const q = rival.positions.get(s.symbol)?.qty ?? 0;
          if (q === 0) continue;
          if (isOption(s)) {
            const t = Math.max(1e-9, (s.expiry! - g.now) / MS_PER_YEAR);
            net += q * delta(s.right!, spot, s.strike!, t, g.market.optionVol(s, g.now), 0.035);
            largestHeld = Math.max(largestHeld, Math.abs(q));
          } else if (s.symbol.startsWith('IXF')) net += q;
        }
        largestNet = Math.max(largestNet, Math.abs(net));
        sampledFills++;
        for (const s of g.market.stocks) {
          if (!isOption(s)) continue;
          const q = venue.quote(s.symbol);
          if (q.bid !== null && q.ask !== null && q.bid >= q.ask) crossed++;
          if (Math.abs(s.strike! - spot) <= 100) {
            nearSamples++;
            if (q.bid !== null && q.ask !== null) nearTwoSided++;
          }
        }
      }
      const optionFills = (f: { option: boolean }) => f.option;
      days.push({
        day: Math.floor(g.now / MS_PER_DAY),
        seed: SEED,
        block: BLOCK,
        player: {
          pnl: Math.round(g.firm.equity(g.market, g.now) - player0) / 100,
          fills: mine.length,
          contracts: mine.reduce((n, f) => n + f.size, 0),
          options: mine.filter(optionFills).reduce((n, f) => n + f.size, 0),
        },
        bluestem: rival
          ? {
              pnl: Math.round(rival.equity(g.market, g.now) - rival0) / 100,
              fills: theirs.length,
              optionContracts: theirs.filter(optionFills).reduce((n, f) => n + f.size, 0),
              futureContracts: theirs.filter((f) => !optionFills(f)).reduce((n, f) => n + f.size, 0),
              largestNetDelta: Math.round(largestNet * 10) / 10,
              largestOptionPosition: largestHeld,
              marginCalled: [...rival.orders.values()].some((o) => o.block === 'risk'),
              samples: sampledFills,
              crossedBooks: crossed,
              nearMoneyTwoSided: nearSamples > 0 ? Math.round((1000 * nearTwoSided) / nearSamples) / 1000 : null,
            }
          : null,
        seconds: Math.round((Date.now() - started) / 1000),
      });
      // On to the next weekday's open.
      g.skipToOpen();
      watch();
    }
    process.stdout.write(`OPTION_PACE ${JSON.stringify({ venue: POX.id, days })}\n`);
  }, 3_600_000);
});
