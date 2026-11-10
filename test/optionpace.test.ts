// A tool that measures, not a gate: what the options desk's blocks and its rival make in a day, headless, by the day's
// regime (plans/desk-options.md, 7d and 7f). Skipped unless OPTION_PACE is set. Prints one JSON line a run.
//
//   OPTION_PACE=1 OPTION_SEED=1 OPTION_DAYS=0,5 OPTION_BLOCK=optionMaker npx vitest run test/optionpace.test.ts
//
// OPTION_BLOCK is the player's block on (optionMaker, parity, eventVol, or none for the rival alone), optionally with
// parameters: `optionMaker:hedge=0,edge=1`. OPTION_DAYS are the weekday indices to play, from the first Monday (0), a
// weekend skipped (5 is the next Monday); the days before each are skipped idle, so a run of one day is the cheap
// unit to put side by side in parallel. OPTION_SETUP is `prairie` (the rack, microwave: the default) or `home`.
// OPTION_RIVAL=0 leaves the rival out. OPTION_QUOTER is a JSON object laid over POX's quoter and OPTION_BLUESTEM one
// laid over Bluestem's block parameters, to try a number without editing the content.
//
// Each day also reports its regime and the straddle at the money at the open, sold at the fair price and settled at the
// close (the market's own figures, which no firm moves): the volatility premium's measure.
import { CONTENT } from '../src/content';
import { OPTIONS_DESK, POX } from '../src/content/options';
import { Game, MS_PER_DAY, MS_PER_HOUR, MS_PER_YEAR, type Content } from '../src/sim';
import { isOption } from '../src/sim/instrument';
import { delta } from '../src/sim/options';
import { infrastructureFrom } from '../src/sim/upgrades';

const on = process.env.OPTION_PACE !== undefined;
const SEED = Number(process.env.OPTION_SEED ?? 1);
const DAYS = (process.env.OPTION_DAYS ?? '0').split(',').map(Number);
const [BLOCK, BLOCK_PARAMS] = (process.env.OPTION_BLOCK ?? 'optionMaker').split(':') as [string, string | undefined];
const RIVAL = process.env.OPTION_RIVAL !== '0';
const SETUP = process.env.OPTION_SETUP ?? 'prairie';
const SETUPS: Record<string, { location: string; network: string; computer: string }> = {
  prairie: { location: 'colo-prairie', network: 'microwave', computer: 'rack' },
  home: { location: 'home', network: 'consumer', computer: 'laptop' },
};

/** The game's day number of the weekday `k` weeks from the first Monday. */
const dayOf = (k: number) => k + 2 * Math.floor(k / 5);

describe.skipIf(!on)('the options desk, a day from the Prairie rack', () => {
  it('plays', () => {
    if (process.env.OPTION_QUOTER) Object.assign(POX.quoter!, JSON.parse(process.env.OPTION_QUOTER));
    let content: Content = RIVAL ? CONTENT : { ...CONTENT, competitors: [] };
    if (process.env.OPTION_BLUESTEM) {
      const over = JSON.parse(process.env.OPTION_BLUESTEM) as Record<string, number>;
      content = {
        ...content,
        competitors: content.competitors.map((c) =>
          c.id === 'bluestem'
            ? {
                ...c,
                blocks: (c.blocks ?? []).map((b) =>
                  b.id === 'optionMaker' ? { ...b, params: { ...b.params, ...over } } : b,
                ),
              }
            : c,
        ),
      };
    }
    const g = new Game(content, SEED);
    g.openDesk(OPTIONS_DESK);
    g.firm.infra = infrastructureFrom(CONTENT, SETUPS[SETUP]!);
    // The rack follows twenty symbols and there are fourteen stocks: the player chooses the index, its future and the
    // options (listed afresh each day). A laptop follows four.
    const watch = () =>
      g.firm.setWatch(['IDX', ...g.market.live('IXF'), ...g.market.stocks.filter(isOption).map((s) => s.symbol)]);
    const enable = (on: boolean) => {
      for (const b of g.firm.blocks) b.enabled = on && b.id === BLOCK;
      if (on && BLOCK_PARAMS) {
        // One setBlock with every parameter: a call replaces the block's parameters whole.
        const params: Record<string, number> = {};
        for (const kv of BLOCK_PARAMS.split(',')) {
          const [k, v] = kv.split('=');
          params[k!] = Number(v);
        }
        g.setBlock(BLOCK, { params });
      }
    };
    enable(false);
    g.skipToOpen();
    watch();
    const rival = g.competitors.find((c) => c.id === 'bot:bluestem');
    const started = Date.now();
    let weekday = 0;
    /** On to the next weekday's open: through the rest of this day a minute at a time (a skip at the open goes nowhere). */
    const nextOpen = () => {
      const closed = Math.floor(g.now / MS_PER_DAY) * MS_PER_DAY + 16.1 * MS_PER_HOUR;
      while (g.now < closed) g.step(60_000);
      g.skipToOpen();
      watch();
    };
    const days: unknown[] = [];
    for (const target of [...DAYS].sort((a, b) => a - b)) {
      while (weekday < target) {
        nextOpen();
        weekday++;
      }
      watch();
      enable(true);
      const day = Math.floor(g.now / MS_PER_DAY);
      if (day !== dayOf(target)) throw new Error(`weekday ${target} is day ${dayOf(target)}, the game is on ${day}`);
      const closeAt = day * MS_PER_DAY + 16 * MS_PER_HOUR;
      const net = (f: typeof g.firm) => f.realised - f.feesPaid + f.unrealised(g.market, g.now);
      const player0 = net(g.firm);
      const fees0 = g.firm.feesPaid;
      const realised0 = g.firm.realised;
      const rival0 = rival ? net(rival) : 0;
      let largestNet = 0;
      let largestHeld = 0;
      let worst = 0;
      let worstRival = 0;
      let samples = 0;
      let nearSamples = 0;
      let nearTwoSided = 0;
      let crossed = 0;
      let edge = 0;
      let straddle: { price: number; strike: number } | null = null;
      const venue = g.market.venue(POX.id);
      const mine: { size: number; option: boolean }[] = [];
      const theirs: { size: number; option: boolean }[] = [];
      let spotAtClose = 0;
      while (g.now < closeAt + 2) {
        g.step(2);
        for (const f of g.firm.tickFills) {
          const option = g.market.optionSpecs.has(f.symbol);
          mine.push({ size: f.size, option });
          // What the fill gave away or took against the option's fair value then, cents a contract of 100.
          if (option) {
            const fair = g.market.fair.get(f.symbol) ?? f.price;
            edge += (f.side === 'buy' ? fair - f.price : f.price - fair) * f.size;
          }
        }
        if (rival)
          for (const f of rival.tickFills) theirs.push({ size: f.size, option: g.market.optionSpecs.has(f.symbol) });
        if (g.now < closeAt) spotAtClose = g.market.fair.get('IDX')!;
        // The straddle at the money, a minute into the session, at the fair prices of today's options.
        if (!straddle && g.now >= day * MS_PER_DAY + 9.5 * MS_PER_HOUR + 60_000) {
          const spot = g.market.fair.get('IDX')!;
          const today = g.market.stocks.filter((s) => isOption(s) && s.expiry === closeAt);
          const strikes = [...new Set(today.map((s) => s.strike!))];
          const k = strikes.reduce((a, b) => (Math.abs(b - spot) < Math.abs(a - spot) ? b : a));
          const legs = today.filter((s) => s.strike === k);
          straddle = { price: legs.reduce((n, s) => n + (g.market.fair.get(s.symbol) ?? 0), 0), strike: k };
        }
        if (g.now % 5000 !== 0) continue;
        worst = Math.min(worst, net(g.firm) - player0);
        if (!rival) continue;
        worstRival = Math.min(worstRival, net(rival) - rival0);
        let delta0 = 0;
        const spot = g.market.fair.get('IDX')!;
        for (const s of g.market.stocks) {
          const q = rival.positions.get(s.symbol)?.qty ?? 0;
          if (q === 0) continue;
          if (isOption(s)) {
            const t = Math.max(1e-9, (s.expiry! - g.now) / MS_PER_YEAR);
            delta0 += q * delta(s.right!, spot, s.strike!, t, g.market.optionVol(s, g.now), 0.035);
            largestHeld = Math.max(largestHeld, Math.abs(q));
          } else if (s.symbol.startsWith('IXF')) delta0 += q;
        }
        largestNet = Math.max(largestNet, Math.abs(delta0));
        samples++;
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
      const intrinsic = straddle ? Math.abs(spotAtClose - straddle.strike) : null;
      days.push({
        day,
        weekday: target,
        regime: g.regimeFor(day).id,
        seed: SEED,
        block: BLOCK_PARAMS ? `${BLOCK}:${BLOCK_PARAMS}` : BLOCK,
        setup: SETUP,
        player: {
          pnl: Math.round(net(g.firm) - player0) / 100,
          worst: Math.round(worst) / 100,
          fees: Math.round(g.firm.feesPaid - fees0) / 100,
          realised: Math.round(g.firm.realised - realised0) / 100,
          fills: mine.length,
          contracts: mine.reduce((n, f) => n + f.size, 0),
          options: mine.filter(optionFills).reduce((n, f) => n + f.size, 0),
          edge: Math.round(edge) / 100,
        },
        bluestem: rival
          ? {
              pnl: Math.round(net(rival) - rival0) / 100,
              worst: Math.round(worstRival) / 100,
              fills: theirs.length,
              optionContracts: theirs.filter(optionFills).reduce((n, f) => n + f.size, 0),
              futureContracts: theirs.filter((f) => !optionFills(f)).reduce((n, f) => n + f.size, 0),
              largestNetDelta: Math.round(largestNet * 10) / 10,
              largestOptionPosition: largestHeld,
              marginCalled: [...rival.orders.values()].some((o) => o.block === 'risk'),
              samples,
              crossedBooks: crossed,
              nearMoneyTwoSided: nearSamples > 0 ? Math.round((1000 * nearTwoSided) / nearSamples) / 1000 : null,
            }
          : null,
        // The straddle's seller, cents a contract of 100: the price taken in less the intrinsic paid out.
        straddle:
          straddle && intrinsic !== null
            ? { strike: straddle.strike, price: Math.round(straddle.price), intrinsic: Math.round(intrinsic) }
            : null,
        seconds: Math.round((Date.now() - started) / 1000),
      });
      enable(false);
      weekday++;
      nextOpen();
    }
    process.stdout.write(`OPTION_PACE ${JSON.stringify({ venue: POX.id, days })}\n`);
  }, 3_600_000);
});
