import { DelayQueue, MAX_IN_FLIGHT, dataLatencyTo, latencyTo } from '../src/sim/latency';
import { FAST, SLOW } from './fixtures';

describe('latency', () => {
  it('adds distance times the network factor to the overhead, and never goes under a millisecond', () => {
    expect(latencyTo(SLOW, 'HARBOR')).toBe(40);
    expect(latencyTo(SLOW, 'LAKESIDE')).toBe(50);
    expect(latencyTo(FAST, 'HARBOR')).toBe(1);
    expect(latencyTo(FAST, 'LAKESIDE')).toBe(8.5);
    expect(() => latencyTo(SLOW, 'NOWHERE')).toThrow();
  });

  it('splits data from orders where a location has racks at more than one exchange', () => {
    const dual = {
      ...FAST,
      location: {
        ...FAST.location,
        id: 'dual',
        distance: { HARBOR: 0.1, LAKESIDE: 0.1 },
        dataDistance: { HARBOR: 0.1, LAKESIDE: 7 },
      },
    };
    expect(latencyTo(dual, 'LAKESIDE')).toBe(1);
    expect(dataLatencyTo(dual, 'LAKESIDE')).toBe(7.5);
    // Without a data distance, data is as far as orders.
    expect(dataLatencyTo(FAST, 'LAKESIDE')).toBe(latencyTo(FAST, 'LAKESIDE'));
  });

  it('delivers in arrival order and not before time', () => {
    const q = new DelayQueue<string>();
    q.push('late', 50);
    q.push('early', 20);
    q.push('mid', 30);
    expect(q.pop(10)).toEqual([]);
    expect(q.pop(30)).toEqual(['early', 'mid']);
    expect(q.length).toBe(1);
    expect(q.pop(100)).toEqual(['late']);
  });

  it('drops what would overflow', () => {
    const q = new DelayQueue<number>();
    for (let i = 0; i < MAX_IN_FLIGHT; i++) expect(q.push(i, i)).toBe(true);
    expect(q.push(-1, 0)).toBe(false);
    expect(q.length).toBe(MAX_IN_FLIGHT);
  });

  it('saves and loads', () => {
    const q = new DelayQueue<string>();
    q.push('a', 5);
    const copy = new DelayQueue(JSON.parse(JSON.stringify(q.save())) as ReturnType<DelayQueue<string>['save']>);
    expect(copy.pop(5)).toEqual(['a']);
  });
});
