// Part E: the weekly rent. Charged at Friday's close on what is in use, to every firm, rivals too; it counts in
// Friday's P&L and draws from no stream. Weeks are walked in coarse steps (a minute at a time), as the other tests
// walk a day: a game on the content's own seed takes about three seconds a week this way.

import { vi } from 'vitest';
import { CONTENT } from '../src/content';
import { Game, MS_PER_MINUTE, TICK_MS as MS_PER_TICK, isMarketOpen, rentOf, type SavedGame } from '../src/sim';
import { MS_PER_DAY, MS_PER_HOUR, calendar } from '../src/sim/clock';
import { infrastructureFrom } from '../src/sim/upgrades';
import { createStore } from '../src/ui/store';

// A week of coarse steps takes a few seconds, and the suite runs files side by side.
vi.setConfig({ testTimeout: 60_000 });

const CITY = { location: 'city', network: 'fibre', computer: 'server' };
const COLO = { location: 'colo-harbor', network: 'microwave', computer: 'rack' };

/** A game with its blocks off, so the only thing that moves the firm's cash is what the test does. */
function idle(seed = 3, infra: { location: string; network: string; computer: string } | null = CITY): Game {
  const g = new Game(CONTENT, seed);
  for (const b of g.firm.blocks) b.enabled = false;
  if (infra) g.firm.infra = infrastructureFrom(CONTENT, infra);
  return g;
}

/** Coarse steps to this time of day on this weekday (0 is Monday) of the first week. */
function to(g: Game, day: number, hour: number): void {
  const target = day * MS_PER_DAY + hour * MS_PER_HOUR;
  while (g.now < target) g.step(Math.min(MS_PER_MINUTE, target - g.now));
}

/** Through Friday's close and a minute past it. */
function pastFridayClose(g: Game): void {
  to(g, 4, 16);
  g.step(MS_PER_MINUTE);
}

function pastNextFridayClose(g: Game): void {
  to(g, 11, 16);
  g.step(MS_PER_MINUTE);
}

describe('the rent in the content', () => {
  it('is nothing for what a new game starts with, and something for every other seat, line and computer', () => {
    const free = new Set([CONTENT.start.location, CONTENT.start.network, CONTENT.start.computer]);
    for (const spec of [...CONTENT.locations, ...CONTENT.networks, ...CONTENT.computers]) {
      if (free.has(spec.id)) expect(spec.rent ?? 0, spec.id).toBe(0);
      else {
        expect(spec.rent, spec.id).toBeGreaterThan(0);
        // A draft: about two per cent of the price a week, never more than three.
        expect(spec.rent!, spec.id).toBeLessThanOrEqual(spec.price * 0.03);
      }
    }
  });

  it('adds up what is in use', () => {
    const infra = infrastructureFrom(CONTENT, COLO);
    expect(rentOf(infra)).toBe(infra.location.rent! + infra.network.rent! + infra.computer.rent!);
    expect(rentOf(infrastructureFrom(CONTENT, CONTENT.start))).toBe(0);
  });
});

describe('the rent at Friday’s close', () => {
  it('is charged once, at the close, as Friday’s cost: the report carries it and the P&L counts it', () => {
    const g = idle();
    const due = rentOf(g.firm.infra);
    expect(due).toBeGreaterThan(0);
    const cash = g.firm.cash;
    to(g, 3, 17); // Thursday evening: four closes, no rent yet
    expect(g.days).toHaveLength(4);
    expect(g.days.every((d) => d.rent === undefined)).toBe(true);
    expect(g.firm.cash).toBe(cash);
    pastFridayClose(g);
    const fri = g.days[4]!;
    expect(fri.weekday).toBe('Fri');
    expect(fri.rent).toBe(due);
    // Nothing traded, so the day is the rent alone: P&L and equity at the close.
    expect(fri.pnl).toBe(-due);
    expect(fri.equityAtClose).toBe(cash - due);
    expect(g.firm.cash).toBe(cash - due);
    expect(g.firm.rentPaid).toBe(due);
    expect(g.snapshot().rentPaid).toBe(due);
  });

  it('is charged to every firm, the rivals too, by what each has in use', () => {
    const g = idle();
    const before = g.competitors.map((c) => c.cash);
    pastFridayClose(g);
    g.competitors.forEach((c, i) => {
      const due = rentOf(c.infra);
      expect(due, c.name).toBeGreaterThan(0);
      expect(c.rentPaid, c.name).toBe(due);
      // A rival trades too, so its cash moved by more than the rent; the rent is in its own total.
      expect(Number.isFinite(c.cash - before[i]!)).toBe(true);
    });
    const hq = g.competitors.find((c) => c.name === 'Harbor Quant')!;
    expect(rentOf(hq.infra)).toBe(
      CONTENT.locations.find((l) => l.id === 'colo-harbor-lakeside')!.rent! +
        CONTENT.networks.find((n) => n.id === 'microwave')!.rent! +
        CONTENT.computers.find((c) => c.id === 'rack')!.rent!,
    );
  });

  it('is nothing for a firm on the starting setup, and the report then has no rent', () => {
    const g = idle(3, null);
    const cash = g.firm.cash;
    pastFridayClose(g);
    expect(g.days[4]!.rent).toBeUndefined();
    expect(g.firm.cash).toBe(cash);
    expect(g.firm.rentPaid).toBe(0);
  });

  it('charges a rack bought on Thursday the full week, and what is in use at the close, not what was owned', () => {
    const g = idle(3, null);
    to(g, 3, 12);
    g.buyUpgrade('location', 'colo-harbor');
    const due = rentOf(g.firm.infra);
    expect(due).toBe(CONTENT.locations.find((l) => l.id === 'colo-harbor')!.rent);
    to(g, 4, 12);
    // Switched back to the free home on Friday morning: owned, but not in use at the close, so no rent.
    g.buyUpgrade('location', 'home');
    pastFridayClose(g);
    expect(g.days[4]!.rent).toBeUndefined();
    const h = idle(3, null);
    to(h, 3, 12);
    h.buyUpgrade('location', 'colo-harbor');
    pastFridayClose(h);
    expect(h.days[4]!.rent).toBe(due);
  });

  it('is charged once when a game is skipped over the weekend, and again the next Friday', () => {
    const g = idle();
    const due = rentOf(g.firm.infra);
    to(g, 4, 15);
    g.step(30 * MS_PER_MINUTE); // 15:30; the close is still ahead
    expect(isMarketOpen(g.now)).toBe(true);
    expect(g.firm.rentPaid).toBe(0);
    pastFridayClose(g);
    expect(g.firm.rentPaid).toBe(due);
    g.skipToOpen(); // across Saturday and Sunday
    expect(g.firm.rentPaid).toBe(due);
    expect(calendar(g.now).weekday).toBe('Mon');
    expect(g.days.filter((d) => d.rent !== undefined)).toHaveLength(1);
    pastNextFridayClose(g);
    expect(g.firm.rentPaid).toBe(2 * due);
    expect(g.days.filter((d) => d.rent !== undefined)).toHaveLength(2);
  });

  it('is not charged by a desk that is not open: its rack is not offered and its rival is not in the game', () => {
    const g = idle(3, null);
    const racks = g.snapshot().shop.filter((o) => o.kind === 'location');
    expect(racks.find((o) => o.spec.id === 'colo-prairie')).toBeUndefined();
    expect(g.competitors.find((c) => c.name === 'Prairie Partners')).toBeUndefined();
    pastFridayClose(g);
    expect(g.firm.rentPaid).toBe(0);
    // Once it opens, the rack is offered, with its rent, and is charged when it is in use.
    const h = idle(3, null);
    h.openDesk('futures');
    const offer = h.snapshot().shop.find((o) => o.spec.id === 'colo-prairie')!;
    expect(offer.spec.rent).toBeGreaterThan(0);
    h.buyUpgrade('location', 'colo-prairie');
    pastFridayClose(h);
    expect(h.firm.rentPaid).toBe(offer.spec.rent);
  });

  it('says in the snapshot what is due on Friday and what has been paid', () => {
    const g = idle();
    const s = g.snapshot();
    expect(s.rentDue).toBe(rentOf(g.firm.infra));
    expect(s.rentPaid).toBe(0);
    const free = idle(3, null).snapshot();
    expect(free.rentDue).toBe(0);
  });

  it('changes nothing when equity is below zero: the firm is charged, trades on, and the game goes on', () => {
    const g = idle();
    g.firm.cash = -50_000_000;
    expect(g.firm.equity(g.market, g.now)).toBeLessThan(0);
    const due = rentOf(g.firm.infra);
    pastFridayClose(g);
    expect(g.firm.cash).toBe(-50_000_000 - due);
    expect(g.days[4]!.rent).toBe(due);
    // No end, no halt for it, and the next week opens as any other.
    expect(g.firm.halt).toBeNull();
    g.skipToOpen();
    expect(calendar(g.now).weekday).toBe('Mon');
    expect(g.snapshot().rentDue).toBe(due);
  });
});

describe('the rent draws from no stream and replays', () => {
  it('gives two games on one seed the same events, rent and equity across a Friday close', () => {
    const a = idle(11, COLO);
    const b = idle(11, COLO);
    pastFridayClose(a);
    pastFridayClose(b);
    expect(a.firm.rentPaid).toBe(rentOf(a.firm.infra));
    expect(JSON.stringify(a.log)).toBe(JSON.stringify(b.log));
    expect(a.firm.equity(a.market, a.now)).toBe(b.firm.equity(b.market, b.now));
    expect(a.days[4]!.rent).toBe(b.days[4]!.rent);
    expect(JSON.stringify(a.save())).toBe(JSON.stringify(b.save()));
  });

  it('does not move what a stream draws: the rent-free game and the renting game see the same market', () => {
    const free = new Game({ ...CONTENT, locations: CONTENT.locations.map(({ rent: _r, ...l }) => l) }, 11);
    const rent = new Game(CONTENT, 11);
    for (const g of [free, rent]) for (const b of g.firm.blocks) b.enabled = false;
    pastFridayClose(free);
    pastFridayClose(rent);
    expect(rent.save().streams).toEqual(free.save().streams);
    expect([...rent.market.fair]).toEqual([...free.market.fair]);
  });

  it('loads a save from the tick before Friday’s close to the same future, the rent charged once', () => {
    const a = idle(5, COLO);
    // Coarse steps to 15:58:30, then ordinary ticks to the tick before the close (a save is only exact between ticks
    // that were whole, as the other save tests keep them).
    to(a, 4, 15);
    a.step(58 * MS_PER_MINUTE + 30_000);
    while (a.now < 4 * MS_PER_DAY + 16 * MS_PER_HOUR - MS_PER_TICK) a.step();
    expect(isMarketOpen(a.now)).toBe(true);
    const save = JSON.parse(JSON.stringify(a.save())) as SavedGame;
    const b = Game.load(CONTENT, save);
    expect(b.firm.rentPaid).toBe(0);
    a.step();
    b.step();
    expect(isMarketOpen(a.now)).toBe(false);
    expect(a.firm.rentPaid).toBe(rentOf(a.firm.infra));
    expect(b.firm.rentPaid).toBe(a.firm.rentPaid);
    // The whole of what the rent touches: the firms' books and the days. (The crowd's books are left out: a game
    // loaded the tick before a close does not empty them at it, which is so on a Monday as on a Friday.)
    const same = (x: unknown): unknown => JSON.parse(JSON.stringify(x));
    expect(same(b.save().firm)).toEqual(same(a.save().firm));
    expect(same(b.save().competitors)).toEqual(same(a.save().competitors));
    expect(same(b.days)).toEqual(same(a.days));
    expect(b.days[4]!.rent).toBe(rentOf(a.firm.infra));
    expect(a.days).toHaveLength(5);
    // And a save taken after the close and loaded does not charge it again.
    const c = Game.load(CONTENT, JSON.parse(JSON.stringify(a.save())) as SavedGame);
    c.step();
    expect(c.firm.rentPaid).toBe(a.firm.rentPaid);
  });

  it('loads a save with no rent fields (from before this part) and charges from its next Friday', () => {
    const a = idle(5, CITY);
    to(a, 2, 12);
    const save = JSON.parse(JSON.stringify(a.save())) as SavedGame;
    expect(save.firm.rentPaid).toBeUndefined();
    for (const c of save.competitors) expect(c.rentPaid).toBeUndefined();
    const b = Game.load(CONTENT, save);
    expect(b.firm.rentPaid).toBe(0);
    pastFridayClose(b);
    expect(b.firm.rentPaid).toBe(rentOf(b.firm.infra));
  });

  it('saves a firm that has paid nothing as it did before, to the byte', () => {
    const g = idle(3, null);
    expect(JSON.stringify(g.save())).not.toContain('rentPaid');
  });
});

describe('the night’s tests and the experiments pay no rent', () => {
  it('leaves a night’s result on a Friday afternoon pin the same with the rents stripped from the content', async () => {
    const { testNight } = await import('../src/sim');
    const noRent = {
      ...CONTENT,
      locations: CONTENT.locations.map(({ rent: _a, ...x }) => x),
      networks: CONTENT.networks.map(({ rent: _b, ...x }) => x),
      computers: CONTENT.computers.map(({ rent: _c, ...x }) => x),
    };
    const g = new Game(CONTENT, 7);
    to(g, 4, 15);
    g.step(58 * MS_PER_MINUTE); // 15:58, inside the last two minutes of Friday
    const pin = { label: 'afternoon' as const, at: g.now, save: g.save() };
    const setup = {
      location: 'colo-harbor',
      network: 'microwave',
      computer: 'rack',
      watched: [],
      blocks: [{ id: 'momentum', enabled: true, params: {} }],
    };
    const variant = { id: 'baseline', kind: 'baseline' as const, label: 'As it is', setup };
    const measures = (c: typeof CONTENT) => {
      const out: unknown[] = [];
      for (const e of testNight(c, [pin], [variant])) if (e.kind === 'result') out.push(e.measures);
      return out;
    };
    const withRent = measures(CONTENT);
    expect(withRent).toHaveLength(1);
    expect(withRent).toEqual(measures(noRent));
  });
});

describe('the rent and the store', () => {
  it('charges nothing while the store is held: the cover, the list and an experiment step no time', () => {
    const store = createStore(CONTENT, null, 3);
    store.setReveal(true);
    buyCity(store);
    store.hold(true);
    const now = store.game.now;
    store.pump(0);
    store.pump(1_000_000);
    expect(store.game.now).toBe(now);
    expect(store.game.firm.rentPaid).toBe(0);
  });

  it('is the same in free play as in the staged game: the reveal switch changes what is shown, not the sim', () => {
    const run = (reveal: boolean) => {
      const store = createStore(CONTENT, null, 3);
      store.setReveal(reveal);
      for (const b of store.game.firm.blocks) b.enabled = false;
      buyCity(store);
      pastFridayClose(store.game);
      store.publish();
      return [store.game.firm.rentPaid, store.getSnapshot().days[4]!.rent, store.game.firm.cash];
    };
    expect(run(true)).toEqual(run(false));
    expect(run(true)[0]).toBeGreaterThan(0);
  });
});

function buyCity(store: ReturnType<typeof createStore>): void {
  store.buyUpgrade('location', 'city');
  store.buyUpgrade('network', 'fibre');
}
