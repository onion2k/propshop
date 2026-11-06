import { CONTENT } from '../src/content';
import {
  Game,
  MAX_PINNED,
  MAX_WINDOW_MS,
  Prepare,
  type Moment,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  Run,
  replayAt,
  startOf,
  replayTime,
  type Setup,
} from '../src/sim';
import { MARKET_OPEN } from '../src/sim/clock';

const SEED = 7;
const START_AT = MARKET_OPEN + MS_PER_MINUTE;
const WINDOW = 12 * MS_PER_SECOND;

const HOME: Setup = {
  location: 'home',
  network: 'consumer',
  computer: 'laptop',
  watched: [],
  blocks: [{ id: 'arbitrage', enabled: true, params: {} }],
};
const COLO: Setup = { ...HOME, location: 'colo-harbor', network: 'microwave', computer: 'rack' };

const start = startOf(CONTENT, SEED, START_AT);

function finish(run: Run): Run {
  while (!run.advance(2000)) {
    /* budgeted in chunks, as a UI would */
  }
  return run;
}

describe('experiment runner', () => {
  it('starts at the given time, open, as a save', () => {
    expect(start.now).toBe(START_AT);
  });

  it('gives identical measures and fingerprint from the same start and setup', () => {
    const a = finish(new Run(CONTENT, start, COLO, WINDOW));
    const b = finish(new Run(CONTENT, start, COLO, WINDOW));
    expect(a.measures()).toEqual(b.measures());
    expect(a.game.fingerprint()).toBe(b.game.fingerprint());
    expect(a.game.now).toBe(START_AT + WINDOW);
  });

  it('counts a colocated arbitrage firm as racing', () => {
    const r = finish(new Run(CONTENT, start, COLO, WINDOW));
    const m = r.measures();
    expect(m.races.won + m.races.beaten + m.races.missed).toBeGreaterThan(0);
  });

  const moment = (at: number, from = at): Moment => ({ at, from, kind: 'x', label: 'x' });

  function prepare(run: Run, chosen: Moment[]): void {
    const p = new Prepare(run, chosen);
    while (!p.advance(2000)) {
      /* chunked */
    }
  }

  it('replays a prepared moment to the same state as the full run at that tick', () => {
    const run = finish(new Run(CONTENT, start, COLO, WINDOW));
    const m = moment(START_AT + 7 * MS_PER_SECOND + 500, START_AT + 7 * MS_PER_SECOND + 100);
    prepare(run, [m]);
    expect(run.pinned.size).toBe(1);
    const replay = replayAt(run, m);
    const target = replayTime(run, m);
    expect(replay.now).toBe(target);
    expect(target).toBe(m.from - 40);
    const full = new Run(CONTENT, start, COLO, WINDOW);
    while (full.game.now < target) full.advance(1);
    expect(replay.fingerprint()).toBe(full.game.fingerprint());
  });

  it('replays an unprepared moment from the start save, to the same state', () => {
    const run = finish(new Run(CONTENT, start, COLO, WINDOW));
    const m = moment(START_AT + 3 * MS_PER_SECOND);
    const a = replayAt(run, m).fingerprint();
    prepare(run, [m]);
    expect(replayAt(run, m).fingerprint()).toBe(a);
  });

  it('starts a replay at the start of the run for a moment near it', () => {
    const run = new Run(CONTENT, start, COLO, WINDOW);
    expect(replayTime(run, moment(START_AT + 10, START_AT + 10))).toBe(START_AT);
  });

  it('pins at most MAX_PINNED moments', () => {
    const run = finish(new Run(CONTENT, start, COLO, WINDOW));
    const ms = Array.from({ length: MAX_PINNED + 1 }, (_, i) => moment(START_AT + (i + 2) * MS_PER_SECOND));
    expect(() => new Prepare(run, ms)).toThrow(/at most/);
    prepare(run, ms.slice(0, MAX_PINNED));
    expect(run.pinned.size).toBe(MAX_PINNED);
  });

  it('holds no saves beyond its start, however long it runs', () => {
    const run = finish(new Run(CONTENT, start, COLO, 30 * MS_PER_SECOND));
    expect('checkpoints' in run).toBe(false);
    expect(run.start).toBe(start);
    expect(run.pinned.size).toBe(0);
  });

  it('leaves the start save untouched by runs and replays', () => {
    const before = JSON.stringify(start);
    const run = finish(new Run(CONTENT, start, COLO, WINDOW));
    replayAt(run, moment(START_AT + 7 * MS_PER_SECOND));
    expect(JSON.stringify(start)).toBe(before);
  });

  it('refuses a window past the longest', () => {
    expect(() => new Run(CONTENT, start, COLO, MAX_WINDOW_MS + 1)).toThrow();
  });

  it('gives a moment its own time to begin from unless the source names one', () => {
    const run = new Run(CONTENT, start, COLO, 3 * MS_PER_SECOND, (g, events) =>
      events.length > 0 ? [{ at: g.now, kind: 'x', label: 'x' }] : [],
    );
    finish(run);
    for (const m of run.moments) expect(m.from).toBe(m.at);
  });

  it('runs a two-minute window headless', () => {
    const t = performance.now();
    const run = finish(new Run(CONTENT, start, COLO, 2 * MS_PER_MINUTE));
    const ms = performance.now() - t;
    const t2 = performance.now();
    const m = moment(START_AT + 100 * MS_PER_SECOND);
    const m2 = moment(START_AT + 60 * MS_PER_SECOND);
    const m3 = moment(START_AT + 30 * MS_PER_SECOND);
    prepare(run, [m, m2, m3]);
    const prep = performance.now() - t2;
    const size = [run.start, ...run.pinned.values()].map((x) => JSON.stringify(x).length);
    process.stdout.write(
      `two-minute window: ${Math.round(ms)} ms; prepare ${Math.round(prep)} ms; save bytes ${size.join(',')}\n`,
    );
    expect(ms).toBeLessThan(10_000);
  }, 30_000);

  it('bounds the moments it keeps', () => {
    const run = new Run(CONTENT, start, COLO, 3 * MS_PER_SECOND, (g, events, resolved) =>
      [...events, ...resolved].map(() => ({ at: g.now, kind: 'x', label: 'x' })),
    );
    finish(run);
    expect(run.moments.length).toBeLessThanOrEqual(run.maxMoments);
  });

  it('shows the same fair values whether the firm races from home or colocated', () => {
    const path = (setup: Setup) => {
      const run = new Run(CONTENT, start, setup, WINDOW);
      const out: number[] = [];
      while (!run.advance(1)) for (const v of run.game.market.fair.values()) out.push(v);
      return out;
    };
    const a = path(HOME);
    const b = path(COLO);
    expect(a.length).toBe(b.length);
    let first = -1;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        first = i;
        break;
      }
    }
    expect(first).toBe(-1);
  });
});

describe('Game.configure', () => {
  it('sets infrastructure and blocks without a purchase or a change of cash', () => {
    const g = new Game(CONTENT, 3);
    const cash = g.firm.cash;
    g.configure({ ...COLO, watched: ['ABC'] });
    expect(g.firm.infra.location.id).toBe('colo-harbor');
    expect(g.firm.infra.computer.id).toBe('rack');
    expect(g.firm.cash).toBe(cash);
    expect(g.firm.enabledBlocks().map((b) => b.id)).toEqual(['arbitrage']);
    expect(g.firm.watch).toEqual(['ABC']);
  });

  it('refuses a watchlist past the computer limit', () => {
    const g = new Game(CONTENT, 3);
    const symbols = CONTENT.stocks.map((s) => s.symbol).slice(0, 6);
    expect(CONTENT.computers.find((c) => c.id === 'laptop')!.maxSymbols).toBeLessThan(symbols.length);
    expect(() => g.configure({ ...HOME, watched: symbols })).toThrow(/watch/);
  });

  it('refuses more enabled blocks than the computer runs', () => {
    const g = new Game(CONTENT, 3);
    const blocks = [
      { id: 'arbitrage', enabled: true, params: {} },
      { id: 'momentum', enabled: true, params: {} },
    ];
    expect(() => g.configure({ ...HOME, blocks })).toThrow(/block/);
  });
});
