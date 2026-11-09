// Part C of plans/play-and-learn.md: which one moment, of the events since last looked, goes on the line.
import { MOMENT_WORDS } from '../src/content';
import type { GameEvent } from '../src/sim';
import {
  MOMENT_GAP_MS,
  MOMENT_HOLD_MS,
  MOMENT_RANK,
  chooseMoment,
  openMemory,
  type ChooseInput,
  type MomentKind,
} from '../src/ui/momentChoice';

const T0 = 1_000_000;
const margin = (at: number): GameEvent => ({ kind: 'margin', at, symbols: ['GCZ'] });
const fine = (at: number): GameEvent => ({ kind: 'fine', at, fine: { at, cents: 250_000, reason: 'a tip' } });
const halt = (at: number): GameEvent => ({ kind: 'halt', at, reason: 'daily loss', until: at + 1 });
const delivery = (at: number, units = 2): GameEvent => ({
  kind: 'delivery',
  at,
  symbol: 'XAU',
  units,
  value: 41_200_000,
});
const round = (at: number, net = 1234): GameEvent => ({ kind: 'round', at, block: 'triangle', net });
const unlock = (at: number): GameEvent => ({ kind: 'unlock', at, what: 'darkweb' });

function input(log: GameEvent[], over: Partial<ChooseInput> = {}): ChooseInput {
  return {
    log,
    now: T0 + 10_000,
    day: 3,
    racesWon: 0,
    stage: 5,
    memory: openMemory(T0, 3, 0),
    current: null,
    wall: 0,
    ...over,
  };
}

const kindOf = (r: ReturnType<typeof chooseMoment>) => r.current?.moment.kind ?? null;

describe('choosing a moment', () => {
  it('chooses nothing when nothing is new', () => {
    expect(kindOf(chooseMoment(input([])))).toBeNull();
    expect(kindOf(chooseMoment(input([{ kind: 'open', at: T0 + 1 }])))).toBeNull();
  });

  it('words each kind with its figure and links it to a glossary entry and a place', () => {
    const cases: [GameEvent, MomentKind, string][] = [
      [margin(T0 + 1), 'margin', 'GCZ'],
      [fine(T0 + 1), 'fine', '$2,500.00'],
      [halt(T0 + 1), 'halt', 'daily loss'],
      [delivery(T0 + 1), 'delivery', '2 lots of XAU'],
      [round(T0 + 1), 'round', '$12.34 ahead'],
      [unlock(T0 + 1), 'unlock', 'dark web'],
    ];
    for (const [e, kind, text] of cases) {
      const m = chooseMoment(input([e])).current!.moment;
      expect(m.kind).toBe(kind);
      expect(m.text).toContain(text);
      expect(m.term.length).toBeGreaterThan(0);
      expect(m.place.page.length).toBeGreaterThan(0);
    }
    const lost = chooseMoment(input([round(T0 + 1, -500)])).current!.moment;
    expect(lost.text).toContain('$5.00 behind');
    const short = chooseMoment(input([delivery(T0 + 1, -3)])).current!.moment;
    expect(short.text).toContain('short 3 lots of XAU');
  });

  it('ranks a margin call over a fine over a halt over a delivery over a round over a race over an unlock', () => {
    const all = [unlock(T0 + 9), round(T0 + 8), delivery(T0 + 7), halt(T0 + 6), fine(T0 + 5), margin(T0 + 1)];
    const order: MomentKind[] = [];
    let log = all;
    for (let i = 0; i < 6; i++) {
      const r = chooseMoment(input(log, { racesWon: 0 }));
      order.push(kindOf(r)!);
      log = log.filter((e) => e.kind !== r.current!.moment.kind);
    }
    expect(order).toEqual(['margin', 'fine', 'halt', 'delivery', 'round', 'unlock']);
    expect(MOMENT_RANK).toEqual(['margin', 'fine', 'halt', 'delivery', 'round', 'race', 'unlock']);
    expect(kindOf(chooseMoment(input([unlock(T0 + 1)], { racesWon: 1 })))).toBe('race');
  });

  it('takes the latest of the highest rank when many arrive in one frame (300×)', () => {
    const log = [round(T0 + 1, 1), round(T0 + 2, 2), round(T0 + 3, 3), margin(T0 + 4), margin(T0 + 9), unlock(T0 + 10)];
    const m = chooseMoment(input(log)).current!.moment;
    expect(m.kind).toBe('margin');
    expect(m.at).toBe(T0 + 9);
    const rounds = chooseMoment(input(log.filter((e) => e.kind === 'round'))).current!.moment;
    expect(rounds.text).toContain('$0.03');
  });

  it('spends what it looked at: the same events are not new the next frame', () => {
    const log = [margin(T0 + 1)];
    const first = chooseMoment(input(log));
    expect(kindOf(first)).toBe('margin');
    const again = chooseMoment(input(log, { memory: first.memory, current: null, now: T0 + 20_000 }));
    expect(kindOf(again)).toBeNull();
  });

  it('marks at most one of a kind a simulated minute', () => {
    const first = chooseMoment(input([round(T0 + 1)]));
    const soon = chooseMoment(
      input([round(T0 + 1), round(T0 + 30_000)], { memory: first.memory, now: T0 + 40_000, wall: 100_000 }),
    );
    expect(kindOf(soon)).toBeNull();
    const later = chooseMoment(
      input([round(T0 + 1), round(T0 + 1 + MOMENT_GAP_MS)], {
        memory: first.memory,
        now: T0 + 2 * MOMENT_GAP_MS,
        wall: 100_000,
      }),
    );
    expect(kindOf(later)).toBe('round');
    // Another kind in the same minute is its own.
    const other = chooseMoment(
      input([round(T0 + 1), margin(T0 + 30_000)], { memory: first.memory, now: T0 + 40_000, wall: 100_000 }),
    );
    expect(kindOf(other)).toBe('margin');
  });

  it('holds a moment for its wall seconds, and a lesser one that comes in the hold is let go', () => {
    const first = chooseMoment(input([round(T0 + 1)], { wall: 1000 }));
    expect(first.current!.wallAt).toBe(1000);
    const during = chooseMoment(
      input([round(T0 + 1), unlock(T0 + 20_000)], {
        memory: first.memory,
        current: first.current,
        now: T0 + 30_000,
        wall: 1000 + MOMENT_HOLD_MS - 1,
      }),
    );
    expect(during.current).toBe(first.current);
    // It was spent: it is not shown after the hold either.
    const after = chooseMoment(
      input([], { memory: during.memory, current: during.current, now: T0 + 40_000, wall: 1000 + MOMENT_HOLD_MS }),
    );
    expect(after.current).toBeNull();
  });

  it('lets a higher rank take the line in the hold', () => {
    const first = chooseMoment(input([round(T0 + 1)], { wall: 1000 }));
    const next = chooseMoment(
      input([round(T0 + 1), margin(T0 + 20_000)], {
        memory: first.memory,
        current: first.current,
        now: T0 + 30_000,
        wall: 2000,
      }),
    );
    expect(kindOf(next)).toBe('margin');
    expect(next.current!.wallAt).toBe(2000);
  });

  it('does not mark a moment of a feature the stage does not show, and spends it', () => {
    // The triangle opens at stage 4, the metals desk (delivery) at 5, the dark web at 3, races at 2.
    const log = [round(T0 + 1), delivery(T0 + 2), fine(T0 + 3), unlock(T0 + 4), margin(T0 + 5)];
    expect(kindOf(chooseMoment(input(log, { stage: 1, racesWon: 1 })))).toBe(null);
    expect(kindOf(chooseMoment(input(log, { stage: 2, racesWon: 1 })))).toBe('race');
    expect(kindOf(chooseMoment(input(log.slice(0, 2), { stage: 4 })))).toBe('round');
    expect(kindOf(chooseMoment(input(log.slice(0, 2), { stage: 3 })))).toBeNull();
    expect(kindOf(chooseMoment(input(log.slice(0, 1), { stage: 5 })))).toBe('round');
    const hidden = chooseMoment(input([halt(T0 + 1)], { stage: 1 }));
    expect(kindOf(hidden)).toBe('halt');
    // A hidden moment is spent: the stage rising later does not bring it back.
    const spent = chooseMoment(input(log, { stage: 1 }));
    expect(kindOf(chooseMoment(input(log, { stage: 5, memory: spent.memory, now: T0 + 20_000 })))).toBeNull();
  });

  it('marks the first race won of a day once, and not one already won when the page opened', () => {
    const first = chooseMoment(input([], { racesWon: 1 }));
    expect(kindOf(first)).toBe('race');
    const more = chooseMoment(input([], { racesWon: 5, memory: first.memory, now: T0 + 90_000, wall: 50_000 }));
    expect(kindOf(more)).toBeNull();
    const nextDay = chooseMoment(
      input([], { racesWon: 1, day: 4, memory: first.memory, now: T0 + 90_000, wall: 50_000 }),
    );
    expect(kindOf(nextDay)).toBe('race');
    // A page opened after a race was won today shows nothing for it.
    const reload = openMemory(T0, 3, 2);
    expect(kindOf(chooseMoment(input([], { racesWon: 2, memory: reload })))).toBeNull();
  });

  it('shows nothing that happened before the page opened (a reload)', () => {
    const log = [margin(T0 - 5), fine(T0), round(T0 - 1000)];
    expect(kindOf(chooseMoment(input(log)))).toBeNull();
    expect(kindOf(chooseMoment(input([...log, halt(T0 + 1)])))).toBe('halt');
  });

  it('has words for every kind', () => {
    expect(MOMENT_WORDS.link).toBe('Show me');
    for (const k of MOMENT_RANK) expect(k.length).toBeGreaterThan(0);
  });
});
