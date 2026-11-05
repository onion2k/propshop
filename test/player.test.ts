// The scripted players behind test/stagepace.test.ts: their policies are pure functions of (progress, snapshot),
// so each is tested here without running a game; one short real run checks the step and that it is repeatable.
import { CONTENT } from '../src/content';
import { MS_PER_MINUTE, TICK_MS, type Snapshot } from '../src/sim';
import { createStore } from '../src/ui/store';
import {
  applyAction,
  follower,
  formatRun,
  openMinutes,
  play,
  sitter,
  tradingDay,
  type Action,
  type Run,
} from './player';

/** The parts of a snapshot the policies read, over a started game's real one. */
function snap(over: Partial<Snapshot> = {}): Snapshot {
  const base = createStore(CONTENT, null, 1).getSnapshot();
  return { ...base, ...over };
}

const OPEN_MS = 9.5 * 60 * MS_PER_MINUTE;
const OPEN_NOW = OPEN_MS + 20 * MS_PER_MINUTE; // Monday, 09:50, open
const stock = (symbol: string, bid: number | null, ask: number | null) =>
  ({ symbol, constituents: null, bid, ask }) as Snapshot['stocks'][number];

function openSnap(over: Partial<Snapshot> = {}): Snapshot {
  const base = snap();
  return snap({
    now: OPEN_NOW,
    open: true,
    nextChange: OPEN_MS + 390 * MS_PER_MINUTE,
    stocks: [{ ...base.stocks[0], ...stock('AAA', 10_000, 10_010) }] as Snapshot['stocks'],
    ...over,
  });
}

const blocks = (on: string[], s: Snapshot) => s.blocks.map((b) => ({ ...b, enabled: on.includes(b.id) }));
const blockActions = (a: Action[]) => a.flatMap((x) => (x.kind === 'block' ? [x] : []));
const handOrder = (over: Record<string, unknown>) =>
  ({ block: 'hand', ioc: true, status: 'filled', size: 5000, sentAt: OPEN_NOW, ...over }) as Snapshot['orders'][number];

describe('time helpers', () => {
  it('counts trading days and open minutes from the start of the game', () => {
    expect(tradingDay(0)).toBe(1);
    expect(openMinutes(OPEN_MS)).toBe(0);
    expect(openMinutes(OPEN_NOW)).toBe(20);
    const friClose = (4 * 24 * 60 + 16 * 60) * MS_PER_MINUTE;
    expect(tradingDay(friClose)).toBe(5);
    expect(openMinutes(friClose)).toBe(5 * 390);
    const sat = 5 * 24 * 60 * MS_PER_MINUTE + 12 * 60 * MS_PER_MINUTE;
    expect(tradingDay(sat)).toBe(5);
    expect(openMinutes(sat)).toBe(5 * 390);
    expect(tradingDay(7 * 24 * 60 * MS_PER_MINUTE + OPEN_MS)).toBe(6);
  });
});

describe('the follower', () => {
  it('skips a night, and only a night with more than a minute to the open', () => {
    const night = snap({ now: 6 * 60 * MS_PER_MINUTE, open: false, nextChange: OPEN_MS });
    expect(follower({}, night)).toEqual([{ kind: 'skip' }]);
    const eve = snap({ now: OPEN_MS - 30_000, open: false, nextChange: OPEN_MS });
    expect(follower({}, eve)).toEqual([]);
  });

  it('keeps momentum on until home is done, and does nothing when it already is', () => {
    const s = openSnap();
    s.blocks = blocks([], s);
    expect(follower({}, s)).toEqual([{ kind: 'block', id: 'momentum', enabled: true }]);
    s.blocks = blocks(['momentum'], s);
    expect(follower({}, s)).toEqual([]);
  });

  it('buys fibre once home is done, and never twice', () => {
    const s = openSnap();
    s.blocks = blocks(['momentum'], s);
    expect(follower({ home: 1 }, s)).toEqual([{ kind: 'buy', upgrade: 'network', id: 'fibre' }]);
    s.infra = { ...s.infra, network: 'fibre' };
    expect(follower({ home: 1 }, s)).toEqual([]);
  });

  it('turns momentum off before arbitrage on, for race and cost, then arbitrage off before the maker on', () => {
    const s = openSnap();
    s.infra = { ...s.infra, network: 'fibre' };
    s.blocks = blocks(['momentum'], s);
    const toArb = follower({ home: 1, seat: 2 }, s);
    expect(toArb).toEqual([
      { kind: 'block', id: 'momentum', enabled: false },
      { kind: 'block', id: 'arbitrage', enabled: true },
    ]);
    s.blocks = blocks(['arbitrage'], s);
    expect(follower({ home: 1, seat: 2, gap: 3 }, s)).toEqual([]);
    expect(follower({ home: 1, seat: 2, race: 4 }, s)).toEqual([]); // cost still to do
    const toMaker = follower({ home: 1, seat: 2, gap: 3, race: 4, cost: 5 }, s);
    expect(toMaker.slice(0, 2)).toEqual([
      { kind: 'block', id: 'arbitrage', enabled: false },
      { kind: 'param', id: 'marketMaker', key: 'halfSpread', value: 2 },
    ]);
    expect(toMaker[2]).toEqual({ kind: 'block', id: 'marketMaker', enabled: true });
    expect(toMaker).toHaveLength(3);
    // Every disable comes before every enable.
    const kinds = blockActions(toMaker).map((a) => a.enabled);
    expect(kinds).toEqual([false, true]);
  });

  it('does not touch the half spread once it is two cents', () => {
    const s = openSnap();
    s.infra = { ...s.infra, network: 'fibre' };
    s.blocks = blocks(['marketMaker'], s).map((b) =>
      b.id === 'marketMaker' ? { ...b, params: { ...b.params, halfSpread: 2 } } : b,
    );
    expect(follower({ home: 1, seat: 2, race: 4, cost: 5 }, s)).toEqual([]);
  });

  const stage4 = { home: 1, seat: 2, gap: 3, race: 4, cost: 5, maker: 6, noise: 7 };
  const makerOn = (s: Snapshot) => {
    s.infra = { ...s.infra, network: 'fibre' };
    s.blocks = blocks(['marketMaker'], s).map((b) =>
      b.id === 'marketMaker' ? { ...b, params: { ...b.params, halfSpread: 2 } } : b,
    );
    return s;
  };

  it('sends a 5,000-share market buy at the desk for hand, once', () => {
    const s = makerOn(openSnap());
    const first = follower(stage4, s);
    expect(first).toEqual([
      { kind: 'hand', intent: { symbol: 'AAA', side: 'buy', size: 5000, exchange: 'best', type: 'market' } },
    ]);
    // Sent and heard back: not again straight away.
    s.orders = [handOrder({ sentAt: OPEN_NOW - 1000 })];
    expect(follower(stage4, s)).toEqual([]);
    // Waiting to leave: not again.
    s.orders = [];
    s.pendingHand = [{ clickedAt: OPEN_NOW } as Snapshot['pendingHand'][number]];
    expect(follower(stage4, s)).toEqual([]);
  });

  it('waits for stage 4, not for maker alone, and keeps the maker running meanwhile', () => {
    const s = makerOn(openSnap());
    const { noise: _noise, ...makerOnly } = stage4;
    void _noise;
    expect(follower(makerOnly, s)).toEqual([]);
    // Maker done, noise not: the block stays the maker (nothing to change), and nothing goes to the desk.
    s.blocks = blocks(['arbitrage'], s);
    const acts = follower(makerOnly, s);
    expect(acts.filter((a) => a.kind === 'hand')).toEqual([]);
    expect(blockActions(acts).map((a) => [a.id, a.enabled])).toEqual([
      ['arbitrage', false],
      ['marketMaker', true],
    ]);
  });

  it('tries the market buy again after half a minute if hand has not ticked', () => {
    const s = makerOn(openSnap());
    s.orders = [handOrder({ sentAt: OPEN_NOW - 31_000 })];
    expect(follower(stage4, s)).toHaveLength(1);
  });

  it('rests a 5,000-share bid a cent under the best for used, once, and not while closed', () => {
    const s = makerOn(openSnap());
    const due = follower({ ...stage4, hand: 7 }, s);
    expect(due).toEqual([
      {
        kind: 'hand',
        intent: { symbol: 'AAA', side: 'buy', size: 5000, exchange: 'best', type: 'limit', price: 9_999 },
      },
    ]);
    s.orders = [handOrder({ ioc: false, status: 'resting', arrivedAt: OPEN_NOW - 500, sentAt: OPEN_NOW - 1000 })];
    expect(follower({ ...stage4, hand: 7 }, s)).toEqual([]);
    const closed = makerOn(snap({ now: 16 * 60 * MS_PER_MINUTE + 1000, open: false, nextChange: 1e12 }));
    expect(follower({ ...stage4, hand: 7 }, closed).filter((a) => a.kind === 'hand')).toEqual([]);
  });

  it('does nothing once used is done', () => {
    const s = makerOn(openSnap());
    expect(follower({ ...stage4, hand: 7, used: 8 }, s)).toEqual([]);
  });

  it('does not send a hand order with no quote to price it from', () => {
    const s = makerOn(openSnap({ stocks: [stock('AAA', null, null)] as Snapshot['stocks'] }));
    expect(follower(stage4, s)).toEqual([]);
  });
});

describe('the sitter', () => {
  it('keeps momentum on, buys fibre after home, skips nights and never touches the desk', () => {
    const s = openSnap();
    s.blocks = blocks([], s);
    expect(sitter({}, s)).toEqual([{ kind: 'block', id: 'momentum', enabled: true }]);
    s.blocks = blocks(['momentum'], s);
    expect(sitter({}, s)).toEqual([]);
    expect(sitter({ home: 1 }, s)).toEqual([{ kind: 'buy', upgrade: 'network', id: 'fibre' }]);
    s.infra = { ...s.infra, network: 'fibre' };
    // Every lesson but the ones it would need, done or not: it holds still.
    expect(sitter({ home: 1, seat: 2, race: 3, cost: 4, maker: 5 }, s)).toEqual([]);
    const night = snap({ now: 17 * 60 * MS_PER_MINUTE, open: false, nextChange: 1e12 });
    night.blocks = blocks(['momentum'], night);
    expect(sitter({}, night)).toEqual([{ kind: 'skip' }]);
  });

  it('puts momentum back if something else is on', () => {
    const s = openSnap();
    s.blocks = blocks(['arbitrage'], s);
    expect(sitter({}, s)).toEqual([
      { kind: 'block', id: 'arbitrage', enabled: false },
      { kind: 'block', id: 'momentum', enabled: true },
    ]);
  });
});

describe('applying an action', () => {
  it('fails loudly when the snapshot does not show it', () => {
    const store = createStore(CONTENT, null, 1);
    expect(() => applyAction(store, { kind: 'block', id: 'nonesuch', enabled: true })).toThrow();
    // A fibre purchase at a price the firm cannot pay does not change the infrastructure.
    store.game.firm.cash = 0;
    expect(() => applyAction(store, { kind: 'buy', upgrade: 'network', id: 'fibre' })).toThrow(/network|fibre/);
  });

  it('shows each action in the snapshot', () => {
    const store = createStore(CONTENT, null, 1);
    applyAction(store, { kind: 'skip' });
    expect(store.getSnapshot().nextChange - store.getSnapshot().now).toBe(MS_PER_MINUTE);
    applyAction(store, { kind: 'block', id: 'momentum', enabled: false });
    applyAction(store, { kind: 'block', id: 'marketMaker', enabled: true });
    applyAction(store, { kind: 'param', id: 'marketMaker', key: 'halfSpread', value: 2 });
    applyAction(store, { kind: 'buy', upgrade: 'network', id: 'fibre' });
    expect(store.getSnapshot().infra.network).toBe('fibre');
    expect(store.getSnapshot().blocks.find((b) => b.id === 'marketMaker')?.enabled).toBe(true);
  });
});

describe('a run', () => {
  const three = 3 * MS_PER_MINUTE;

  it('is the same twice on one seed: same lessons, same actions, same game', () => {
    const go = () => {
      const store = createStore(CONTENT, null, 1);
      const run = play(store, follower, { player: 'follower', seed: 1, maxWaitedMs: three });
      const s = store.getSnapshot();
      return { run, now: s.now, cash: s.cash, fills: s.fills.length, orders: s.orders.length };
    };
    const a = go();
    const b = go();
    expect(a.run.waitedMs).toBeGreaterThanOrEqual(three);
    expect(a.run.waitedMs).toBeLessThan(three + 250 + TICK_MS);
    expect(a.run.actions.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
  });
});

describe('the report', () => {
  const run: Run = {
    player: 'follower',
    seed: 7,
    ended: 'days',
    daysCap: 2,
    endAt: OPEN_MS + 2 * 24 * 60 * MS_PER_MINUTE,
    waitedMs: 20 * MS_PER_MINUTE,
    lessons: { home: { at: OPEN_NOW, waitedMs: 20 * MS_PER_MINUTE } },
    stages: { 2: { at: OPEN_NOW + 5 * MS_PER_MINUTE, waitedMs: 25 * MS_PER_MINUTE } },
    actions: [],
  };

  it('gives day, weekday, clock, trading minutes and real minutes at 10x and 60x, and "not by day N"', () => {
    const text = formatRun(run);
    expect(text).toMatch(/follower seed 7/);
    expect(text).toMatch(/home\s+day 1 Mon 09:50:00\s+trading 20\.0 min\s+real 2\.0 min at 10x, 0\.3 min at 60x/);
    expect(text).toMatch(/stage 2 opens\s+day 1 Mon 09:55:00/);
    expect(text).toMatch(/seat\s+not by day 2/);
    expect(text).toMatch(/stage 5 opens\s+not by day 2/);
    expect(text.split('\n').length).toBeGreaterThanOrEqual(1 + 10 + 4);
  });
});
