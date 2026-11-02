import { Random } from '../src/sim/random';

describe('Random', () => {
  it('replays the same sequence from the same seed', () => {
    const a = new Random(42);
    const b = new Random(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('gives a different sequence from a different seed', () => {
    const a = new Random(1);
    const b = new Random(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('stays in range', () => {
    const r = new Random(7);
    for (let i = 0; i < 1000; i++) {
      const n = r.int(3, 5);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
      const x = r.range(-1, 1);
      expect(x).toBeGreaterThanOrEqual(-1);
      expect(x).toBeLessThan(1);
    }
  });

  it('draws a normal with mean near zero and spread near one', () => {
    const r = new Random(99);
    let sum = 0;
    let sq = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const x = r.normal();
      sum += x;
      sq += x * x;
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.03);
    expect(Math.abs(Math.sqrt(sq / n) - 1)).toBeLessThan(0.03);
  });

  it('saves and loads its state', () => {
    const a = new Random(5);
    a.next();
    a.next();
    const b = Random.load(a.save());
    expect(b.next()).toBe(a.next());
  });
});
