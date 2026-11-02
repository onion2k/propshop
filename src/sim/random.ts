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

  save(): number {
    return this.state;
  }

  static load(state: number): Random {
    const r = new Random(0);
    r.state = state >>> 0;
    return r;
  }
}
