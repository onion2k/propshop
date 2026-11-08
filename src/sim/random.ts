// The one source of chance in the sim. Everything that draws a number draws it from here, so a seed replays
// a whole game, and the state is a single integer so a save can carry it.

export class Random {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** A number in [0, 1), mulberry32. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** A number in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** An integer in [min, max], both ends in. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with the given probability. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** A standard normal, by Box-Muller. */
  normal(): number {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.next() * items.length)];
    if (item === undefined) throw new Error('pick from an empty list');
    return item;
  }

  /**
   * A stream of its own, derived from a seed and a name: the same pair gives the same stream, and a different
   * name gives one that shares nothing with it. Mulberry32 seeded from an FNV-1a hash of the two.
   */
  static derive(seed: number, salt: string): Random {
    let h = 2166136261 ^ (seed >>> 0);
    h = Math.imul(h, 16777619);
    for (let i = 0; i < salt.length; i++) {
      h ^= salt.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    // One round of mixing so seeds that differ by one do not start close.
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
    return new Random(h >>> 0);
  }

  save(): number {
    return this.state;
  }

  static load(state: number): Random {
    const r = new Random(0);
    r.state = state >>> 0;
    return r;
  }
}

/**
 * The named streams a game draws from, so that what one part of the world does never shifts another's chances:
 * `world` is fair value and news, which nothing the player does reaches; each exchange's crowd has its own,
 * which still reacts to the books; `dark` is the dark web.
 */
export interface Streams {
  /** The stocks' world: fair values, factors and news. */
  world: Random;
  crowd: Record<string, Random>;
  dark: Random;
  /** Each other desk's world, `world:<desk>`, so opening a desk draws nothing from the stocks'. */
  desks: Record<string, Random>;
}

export interface SavedStreams {
  world: number;
  crowd: Record<string, number>;
  dark: number;
  /** Absent in a save from before desks, and where there are none. */
  desks?: Record<string, number>;
}

export function deriveStreams(seed: number, exchangeIds: readonly string[], deskIds: readonly string[] = []): Streams {
  const crowd: Record<string, Random> = {};
  for (const id of exchangeIds) crowd[id] = Random.derive(seed, `crowd:${id}`);
  const desks: Record<string, Random> = {};
  for (const id of deskIds) desks[id] = Random.derive(seed, `world:${id}`);
  return { world: Random.derive(seed, 'world'), crowd, dark: Random.derive(seed, 'dark'), desks };
}

export function saveStreams(s: Streams): SavedStreams {
  const crowd: Record<string, number> = {};
  for (const [id, r] of Object.entries(s.crowd)) crowd[id] = r.save();
  const desks: Record<string, number> = {};
  for (const [id, r] of Object.entries(s.desks)) desks[id] = r.save();
  // A game with no desk but the stocks saves as it did before desks, to the byte.
  return { world: s.world.save(), crowd, dark: s.dark.save(), ...(Object.keys(desks).length > 0 ? { desks } : {}) };
}

export function loadStreams(s: SavedStreams): Streams {
  const crowd: Record<string, Random> = {};
  for (const [id, n] of Object.entries(s.crowd)) crowd[id] = Random.load(n);
  const desks: Record<string, Random> = {};
  for (const [id, n] of Object.entries(s.desks ?? {})) desks[id] = Random.load(n);
  return { world: Random.load(s.world), crowd, dark: Random.load(s.dark), desks };
}
