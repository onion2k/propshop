// Part B of plans/play-and-learn.md: who took the firm's resting quotes, and what the quote was worth a second on.

import { CONTENT } from '../src/content';
import { Game, MARKOUT_MS, MS_PER_MINUTE, TICK_MS, isMarketOpen, type SavedGame } from '../src/sim';
import { MAX_MARKOUTS } from '../src/sim/game';

const RIVAL_NAMES = CONTENT.competitors.map((c) => c.name);

function quoter(seed: number): Game {
  const g = new Game(CONTENT, seed);
  g.setBlock('momentum', { enabled: false });
  g.setBlock('arbitrage', { enabled: false });
  g.setBlock('marketMaker', { enabled: true, params: { halfSpread: 3 } });
  g.skipToOpen();
  return g;
}

/** Ten minutes at the tick, where the quotes are taken, then coarse steps to the close. */
function toClose(g: Game): void {
  while (!isMarketOpen(g.now)) g.step(TICK_MS);
  for (let i = 0; i < (10 * MS_PER_MINUTE) / TICK_MS; i++) g.step();
  while (isMarketOpen(g.now)) g.step(MS_PER_MINUTE);
}

describe('who took the firm’s resting quotes', () => {
  it(
    'records the other side of each fill, and marks it resting where the firm was the maker',
    { timeout: 120_000 },
    () => {
      const g = quoter(10);
      const seen: { against?: string; resting?: true }[] = [];
      g.on((e) => {
        if (e.kind === 'fill') seen.push(e.fill);
      });
      for (let i = 0; i < (10 * MS_PER_MINUTE) / TICK_MS; i++) g.step();
      expect(seen.length).toBeGreaterThan(0);
      for (const f of seen) expect(typeof f.against).toBe('string');
      const resting = seen.filter((f) => f.resting);
      expect(resting.length).toBeGreaterThan(0);
      const known = new Set(['bg', ...g.competitors.map((c) => c.id)]);
      for (const f of seen) expect(known.has(f.against!), String(f.against)).toBe(true);
    },
  );

  it(
    'tallies the quotes each named rival took on the day report, and never names the crowd',
    { timeout: 120_000 },
    () => {
      const g = quoter(10);
      const rest: string[] = [];
      g.on((e) => {
        if (e.kind === 'fill' && e.fill.resting && g.competitors.some((c) => c.id === e.fill.against))
          rest.push(e.fill.against!);
      });
      toClose(g);
      const r = g.days[0]!;
      expect(r.takenBy).toBeDefined();
      expect(Object.keys(r.takenBy!).length).toBeGreaterThan(0);
      for (const [name, t] of Object.entries(r.takenBy!)) {
        expect(RIVAL_NAMES).toContain(name);
        expect(t.count).toBeGreaterThan(0);
        expect(Number.isInteger(t.cents)).toBe(true);
      }
      const total = Object.values(r.takenBy!).reduce((n, t) => n + t.count, 0);
      expect(total).toBe(rest.length);
      expect(Object.keys(r.takenBy!)).not.toContain('the crowd');
      expect(Object.keys(r.takenBy!)).not.toContain('bg');
    },
  );

  it('writes the same reports for the same seed and the same day', { timeout: 120_000 }, () => {
    const a = quoter(11);
    const b = quoter(11);
    toClose(a);
    toClose(b);
    expect(a.days[0]!.takenBy).toBeDefined();
    expect(JSON.stringify(b.days[0])).toBe(JSON.stringify(a.days[0]));
    expect(b.fingerprint()).toBe(a.fingerprint());
  });

  it('saves with marks pending and loads to the same future', { timeout: 120_000 }, () => {
    const a = quoter(10);
    // Step to a tick with a mark-out waiting.
    let waiting = false;
    for (let i = 0; i < (10 * MS_PER_MINUTE) / TICK_MS && !waiting; i++) {
      a.step();
      waiting = a.markoutsPending() > 0;
    }
    expect(waiting).toBe(true);
    const b = Game.load(CONTENT, JSON.parse(JSON.stringify(a.save())) as SavedGame);
    toClose(a);
    toClose(b);
    expect(JSON.stringify(b.days[0])).toBe(JSON.stringify(a.days[0]));
    expect(JSON.stringify(b.save())).toBe(JSON.stringify(a.save()));
  });

  it('loads a save from before it, with no marks, and writes a report with nothing taken', { timeout: 120_000 }, () => {
    const a = quoter(10);
    for (let i = 0; i < (2 * MS_PER_MINUTE) / TICK_MS; i++) a.step();
    const saved = JSON.parse(JSON.stringify(a.save())) as SavedGame;
    delete (saved.today as { markouts?: unknown } | undefined)?.markouts;
    delete (saved.today as { takenBy?: unknown } | undefined)?.takenBy;
    const b = Game.load(CONTENT, saved);
    toClose(b);
    expect(b.days.length).toBe(1);
    expect(b.days[0]!.takenBy ?? {}).toBeDefined();
  });

  it('marks out a quote the mark-out window after the fill, and keeps the list bounded', { timeout: 120_000 }, () => {
    expect(MARKOUT_MS).toBe(1000);
    expect(MAX_MARKOUTS).toBeGreaterThan(0);
    const g = quoter(10);
    let most = 0;
    for (let i = 0; i < (10 * MS_PER_MINUTE) / TICK_MS; i++) {
      g.step();
      const n = g.markoutsPending();
      most = Math.max(most, n);
      expect(n).toBeLessThanOrEqual(MAX_MARKOUTS);
    }
    expect(most).toBeGreaterThan(0);
  });
});
