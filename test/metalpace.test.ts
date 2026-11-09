// A measurement, not a check: METAL_PACE=1 npx vitest run test/metalpace.test.ts runs the metals desk's tuning checks
// (plans/desk-metals.md 6f) over a few seeds, prints them and writes JSON. METAL_SEEDS, METAL_PARTS (curve, delivery,
// fixarb, fix) and METAL_OUT (a JSON file) change the seeds, what is measured and where it goes.
//
// - curve: a game week with the desk open, a minute at a time; each minute, whether a metal's near contract is in
//   backwardation (its carry, the dollar's rate and storage less the lease, below nothing).
// - delivery: the delivery experiment's window on each seed, held through expiry and rolled, then on to 17:01: the
//   storage each pays in Friday's report.
// - fixarb: fixArb (its defaults) from home on a laptop, from the Thamesford rack and from the Hudson rack, over
//   Monday's 10:00 fix to Friday's: tick by tick from a minute before each fix to two and a half minutes after,
//   a minute at a time between; the equity's move, and Aldgate's; each fix against fair.
// - fix: the fix experiment's buy on each seed, in slices over the minute before the call and rested into the fix,
//   each against the mid where its fills were told and in its average price.
import { writeFileSync } from 'node:fs';
import { CONTENT } from '../src/content';
import { EXPERIMENTS, FIX_LOTS } from '../src/content/experiments';
import { Game, MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND, Run, startOf, type Measures } from '../src/sim';
import { infrastructureFrom } from '../src/sim/upgrades';

const measure = process.env.METAL_PACE ? it : it.skip;
const SEEDS = (process.env.METAL_SEEDS ?? '1,2,3').split(',').map(Number);
const PARTS = (process.env.METAL_PARTS ?? 'curve,delivery,fixarb,fix').split(',');
const OUT = process.env.METAL_OUT ?? 'metalpace.json';
const H = MS_PER_HOUR;

/** Step in strides of at most `stride` to `until`. */
function run(g: Game, until: number, stride: number) {
  while (g.now < until) g.step(Math.min(stride, until - g.now));
}

function curveWeek(seed: number) {
  const g = new Game(CONTENT, seed);
  g.openDesk('metals');
  for (const b of g.firm.blocks) b.enabled = false;
  const out: Record<string, { minutes: number; flips: number; minCarry: number; maxLease: number }> = {};
  const was: Record<string, boolean> = {};
  const end = 4 * MS_PER_DAY + 17 * H;
  while (g.now < end) {
    g.step(MS_PER_MINUTE);
    for (const root of ['GC', 'SI']) {
      const near = g.market.live(root)[0];
      if (!near) continue;
      const spec = g.market.stock(near);
      const carry = g.market.carryOf(spec);
      const o = (out[root] ??= { minutes: 0, flips: 0, minCarry: Infinity, maxLease: -Infinity });
      const back = carry < 0;
      if (back) o.minutes++;
      if (back && !was[root]) o.flips++;
      was[root] = back;
      o.minCarry = Math.min(o.minCarry, carry);
      o.maxLease = Math.max(o.maxLease, g.market.leases.get(spec.underlying!) ?? 0);
    }
  }
  const headlines = g.deskNews.flatMap((n) => n.published.map((h) => h.text));
  return { GC: out.GC, SI: out.SI, headlines };
}

function deliveryRuns(seed: number) {
  const e = { ...EXPERIMENTS.find((x) => x.id === 'delivery')!, seed };
  const start = startOf(CONTENT, e.seed, e.startAt, e.desks, e.warmMs);
  const one = (setup: typeof e.baseline) => {
    const r = new Run(CONTENT, start, setup, e.windowMs, undefined, { ledger: true });
    while (!r.advance(50_000));
    const m = r.measures();
    // On past the window to the evening's storage, the script's orders long done.
    run(r.game, 4 * MS_PER_DAY + 17 * H + MS_PER_MINUTE, MS_PER_MINUTE);
    const friday = r.game.days[r.game.days.length - 1];
    return { pnl: m.pnl, held: m.ledger!.held, storage: friday?.storage ?? 0 };
  };
  return {
    hold: one(e.baseline),
    roll: one(e.changes.find((c) => c.id === 'roll')!.apply(structuredClone(e.baseline))),
  };
}

const SEATS = {
  home: { location: 'home', network: 'consumer', computer: 'laptop' },
  thamesford: { location: 'colo-thamesford', network: 'fibre', computer: 'rack' },
  hudson: { location: 'colo-hudson', network: 'fibre', computer: 'rack' },
} as const;
/** Monday's 10:00 fix to Friday's: nine. */
const FIXES = [10 * H, ...[1, 2, 3, 4].flatMap((d) => [d * MS_PER_DAY + 5.5 * H, d * MS_PER_DAY + 10 * H])];

function fixArbRun(seed: number, seat: keyof typeof SEATS) {
  const g = new Game(CONTENT, seed);
  g.openDesk('metals');
  g.firm.infra = infrastructureFrom(CONTENT, SEATS[seat]);
  for (const b of g.firm.blocks) b.enabled = b.id === 'fixArb';
  for (const [id, p] of Object.entries(OVER)) g.setBlock(id, { params: p });
  const aldgate = g.competitors.find((c) => c.name === 'Aldgate Metals')!;
  for (const [id, p] of Object.entries(OVER)) aldgate.setBlock(id, { params: p });
  run(g, FIXES[0]! - MS_PER_MINUTE, MS_PER_MINUTE);
  const eq0 = g.firm.equity(g.market, g.now);
  const al0 = aldgate.equity(g.market, g.now);
  const fixes: { at: number; symbol: string; bps: number; volume: number; flow: number }[] = [];
  const perFix: number[] = [];
  for (const at of FIXES) {
    // A laptop watches four: the two metals and their front futures, re-listed as the week goes.
    g.firm.setWatch(['XAU', 'XAG', ...g.market.live('GC').slice(0, 1), ...g.market.live('SI').slice(0, 1)]);
    run(g, at - MS_PER_MINUTE, MS_PER_MINUTE);
    const before = g.firm.equity(g.market, g.now);
    let fair: Record<string, number> = {};
    const flow: Record<string, number> = {};
    while (g.now < at + 150 * MS_PER_SECOND) {
      if (g.now < at) {
        fair = { XAU: g.market.fair.get('XAU')!, XAG: g.market.fair.get('XAG')! };
        for (const sym of ['XAU', 'XAG']) {
          const f = g.market.venue('THAMESFORD').stocks.get(sym)?.flow;
          if (f) flow[sym] = f.side === 'buy' ? f.size : -f.size;
        }
      }
      g.step();
    }
    perFix.push(Math.round((g.firm.equity(g.market, g.now) - before) / 100));
    for (const f of g.market.venue('THAMESFORD').fixes.filter((x) => x.at === at))
      fixes.push({
        at,
        symbol: f.symbol,
        bps: f.price === null ? NaN : Math.round((10_000 * (f.price - fair[f.symbol]!)) / fair[f.symbol]!),
        volume: f.volume,
        flow: flow[f.symbol] ?? 0,
      });
  }
  return {
    pnl: Math.round((g.firm.equity(g.market, g.now) - eq0) / 100),
    fills: g.firm.stats.fillsReceived,
    aldgate: Math.round((aldgate.equity(g.market, g.now) - al0) / 100),
    aldgateFills: aldgate.stats.fillsReceived,
    perFix,
    fixes,
  };
}

function fixRuns(seed: number) {
  const e = { ...EXPERIMENTS.find((x) => x.id === 'fix')!, seed };
  const start = startOf(CONTENT, e.seed, e.startAt, e.desks, e.warmMs);
  const one = (setup: typeof e.baseline) => {
    const r = new Run(CONTENT, start, setup, e.windowMs, undefined, { ledger: true });
    while (!r.advance(50_000));
    return r.measures();
  };
  const of = (m: Measures) => {
    const t = m.ledger!.traded.XAU!;
    const fix = m.ledger!.fixes.find((f) => f.symbol === 'XAU')?.price ?? null;
    return {
      lots: t.bought,
      avg: t.buyValue / t.bought,
      overMid: (t.buyValue - t.buyMid) / t.bought,
      fix,
      startMid: m.ledger!.startMid.XAU,
    };
  };
  return {
    slices: of(one(e.baseline)),
    fix: of(one(e.changes.find((c) => c.id === 'fix')!.apply(structuredClone(e.baseline)))),
  };
}

// METAL_OVER='{"fixArb":{"threshold":2}}' sets fixArb's parameters, the player's and Aldgate's, for tuning.
const OVER = JSON.parse(process.env.METAL_OVER ?? '{}') as Record<string, Record<string, number>>;

measure('metals', { timeout: 7_200_000 }, () => {
  const out: Record<string, unknown>[] = [];
  const say = (s: string) => process.stderr.write(s + '\n');
  for (const seed of SEEDS) {
    const row: Record<string, unknown> = { seed };
    if (PARTS.includes('curve')) {
      const c = curveWeek(seed);
      row.curve = c;
      say(
        `seed ${seed} curve: GC ${c.GC?.flips} flips, ${c.GC?.minutes} min backwardated (min carry ${c.GC?.minCarry.toFixed(4)}); ` +
          `SI ${c.SI?.flips} flips, ${c.SI?.minutes} min (min carry ${c.SI?.minCarry.toFixed(4)}); ${c.headlines.length} headlines`,
      );
    }
    if (PARTS.includes('delivery')) {
      const d = deliveryRuns(seed);
      row.delivery = d;
      say(`seed ${seed} delivery: held storage ${d.hold.storage / 100} $, rolled ${d.roll.storage / 100} $`);
    }
    if (PARTS.includes('fixarb')) {
      const f: Record<string, unknown> = {};
      for (const seat of Object.keys(SEATS) as (keyof typeof SEATS)[]) {
        const r = fixArbRun(seed, seat);
        f[seat] = r;
        say(
          `seed ${seed} fixArb ${seat}: $${r.pnl} on ${r.fills} fills [${r.perFix.join(' ')}]; Aldgate $${r.aldgate} on ${r.aldgateFills}; fixes vs fair bps (flow) ` +
            r.fixes.map((x) => `${x.symbol} ${x.bps} (${x.flow})`).join(', '),
        );
      }
      row.fixArb = f;
    }
    if (PARTS.includes('fix')) {
      const f = fixRuns(seed);
      row.fix = f;
      const p = (x: number) => (x / 10).toFixed(2);
      say(
        `seed ${seed} fix (${FIX_LOTS} lots): slices avg $${p(f.slices.avg)} over mid ${p(f.slices.overMid)}; ` +
          `fix avg $${p(f.fix.avg)} over mid ${p(f.fix.overMid)} (fix $${p(f.fix.fix ?? NaN)}, start mid $${p(f.fix.startMid ?? NaN)})`,
      );
    }
    out.push(row);
    writeFileSync(OUT, JSON.stringify(out, null, 1));
  }
});
