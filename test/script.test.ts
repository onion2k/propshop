import {
  EXAMPLE_SOURCE,
  SCRIPT_ID,
  STEP_BUDGET,
  blockFor,
  blockById,
  instrument,
  scriptBlock,
  scriptState,
} from '../src/sim/strategy';
import type { MarketView, SeenQuote } from '../src/sim/strategy';

function quote(bid: number, ask: number, size = 500): SeenQuote {
  return { bid, ask, bidSize: size, askSize: size, at: 0 };
}

function view(over: Partial<MarketView> = {}): MarketView {
  return {
    now: 10_000,
    symbols: ['ABC'],
    exchanges: ['HARBOR', 'LAKESIDE'],
    quotes: { HARBOR: { ABC: quote(4100, 4101) }, LAKESIDE: { ABC: quote(4102, 4103, 100) } },
    fees: { HARBOR: 0.3, LAKESIDE: 0.25 },
    latency: { HARBOR: 1, LAKESIDE: 8 },
    mids: { ABC: [4100, 4101] },
    positions: {},
    blockPositions: {},
    cash: 1_000_000,
    openOrders: [],
    recentFills: [],
    news: [],
    ...over,
  };
}

describe('script block', () => {
  it('runs the example as arbitrage, and logs', () => {
    const b = scriptBlock(EXAMPLE_SOURCE);
    expect(b.decide(view(), {})).toEqual([
      { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'buy', price: 4101, size: 100, ioc: true },
      { kind: 'order', symbol: 'ABC', exchange: 'LAKESIDE', side: 'sell', price: 4102, size: 100, ioc: true },
    ]);
    expect(scriptState(EXAMPLE_SOURCE).error).toBeNull();
    expect(scriptState(EXAMPLE_SOURCE).log[0]).toMatch(/gap of 0.45 cents on ABC/);
  });

  it('gets flat from its own leftover and leaves other blocks alone', () => {
    const b = scriptBlock(EXAMPLE_SOURCE);
    const v = view({ positions: { ABC: -100 }, blockPositions: { script: { ABC: -100 } } });
    expect(b.decide(v, {})).toEqual([
      { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'buy', price: 4101, size: 100, ioc: true },
    ]);
    const other = view({ positions: { ABC: -100 }, blockPositions: { momentum: { ABC: -100 } } });
    expect(b.decide(other, {})).toHaveLength(2);
  });

  it('keeps a syntax error and sends nothing', () => {
    const src = 'buy(ABC';
    expect(scriptBlock(src).decide(view(), {})).toEqual([]);
    expect(scriptState(src).error).toMatch(/Unexpected|missing/i);
  });

  it('keeps a runtime error and sends nothing that decision', () => {
    const src = 'buy("ABC", "HARBOR", 4101, 100); nothing.here;';
    expect(scriptBlock(src).decide(view(), {})).toEqual([]);
    expect(scriptState(src).error).toMatch(/nothing/);
  });

  it('stops a runaway loop', () => {
    const src = 'let n = 0; while (true) { n++; }';
    expect(instrument(src)).toContain('__budget.left');
    const t = performance.now();
    expect(scriptBlock(src).decide(view(), {})).toEqual([]);
    expect(performance.now() - t).toBeLessThan(1000);
    expect(scriptState(src).error).toMatch(/budget/);
    const fine = `let n = 0; for (let i = 0; i < ${STEP_BUDGET - 10}; i++) { n++; } log(n);`;
    scriptBlock(fine).decide(view(), {});
    expect(scriptState(fine).error).toBeNull();
  });

  it('refuses chance and hides the page', () => {
    const chance = 'buy("ABC", "HARBOR", Math.round(4101 * Math.random()), 100);';
    expect(scriptBlock(chance).decide(view(), {})).toEqual([]);
    expect(scriptState(chance).error).toMatch(/random/);
    const page = 'log(typeof window, typeof document, typeof fetch, typeof localStorage, Math.floor(4.5));';
    scriptBlock(page).decide(view(), {});
    expect(scriptState(page).log[0]).toBe('undefined undefined undefined undefined 4');
  });

  it('drops malformed orders and keeps the rest', () => {
    const src = 'buy("ABC", "HARBOR", 41.014 * 100, 100.7); sell("ABC", "HARBOR", 0, 100); cancel(3); cancel("x");';
    expect(scriptBlock(src).decide(view(), {})).toEqual([
      { kind: 'order', symbol: 'ABC', exchange: 'HARBOR', side: 'buy', price: 4101, size: 100, ioc: true },
      { kind: 'cancel', localId: 3 },
    ]);
  });

  it('is in the registry and found by its setting', () => {
    expect(blockById(SCRIPT_ID).spec.name).toBe('Your script');
    const b = blockFor({ id: SCRIPT_ID, source: 'log("hi")' });
    b.decide(view(), {});
    expect(scriptState('log("hi")').log).toEqual(['hi']);
    expect(blockFor({ id: 'momentum' }).spec.id).toBe('momentum');
  });
});
