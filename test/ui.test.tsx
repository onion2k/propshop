// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CONTENT } from '../src/content';
import { TICK_MS, type OrderStory, type Snapshot } from '../src/sim';
import { MarketPanel } from '../src/ui/MarketPanel';
import { FirmPanel } from '../src/ui/FirmPanel';
import { App } from '../src/ui/App';
import { Cover } from '../src/ui/Cover';
import { Root } from '../src/ui/Root';
import { createStore, PROGRESS_KEY, SAVE_KEY, STAGES_KEY, type Storage } from '../src/ui/store';

/** The page switcher under the top bar. */
function goTo(page: 'Market' | 'Desk' | 'Strategy' | 'Reports') {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${page}`) }));
}

function memory(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('App', () => {
  it('renders the clock and advances it when the store is pumped', () => {
    const store = createStore(CONTENT, null, 1);
    render(<App store={store} />);
    expect(screen.getByText('06:00:00')).toBeInTheDocument();
    expect(screen.getByText('CLOSED')).toBeInTheDocument();
    act(() => {
      store.pump(0);
      store.pump(1000);
    });
    expect(screen.getByText('06:00:01')).toBeInTheDocument();
  });

  it('changes a block parameter in the game from its slider, and toggles a block', () => {
    const store = createStore(CONTENT, null, 2);
    store.setReveal(true);
    store.setBlock('momentum', { enabled: false });
    store.setBlock('arbitrage', { enabled: true });
    render(<App store={store} />);
    goTo('Strategy');
    const slider = screen.getByLabelText('Cross-exchange arbitrage Size');
    fireEvent.change(slider, { target: { value: '500' } });
    expect(store.game.firm.blocks.find((b) => b.id === 'arbitrage')?.params.size).toBe(500);
    fireEvent.click(screen.getByLabelText('Enable Cross-exchange arbitrage'));
    expect(store.game.firm.blocks.find((b) => b.id === 'arbitrage')?.enabled).toBe(false);
    // The laptop runs one block: with arbitrage off, another can go on.
    fireEvent.click(screen.getByLabelText('Enable Market maker'));
    expect(store.game.firm.enabledBlocks().map((b) => b.id)).toEqual(['marketMaker']);
  });

  it('sets the speed and skips to the open', () => {
    const store = createStore(CONTENT, null, 3);
    render(<App store={store} />);
    fireEvent.click(screen.getByText('skip to open'));
    expect(screen.getByText('09:29:00')).toBeInTheDocument();
    fireEvent.click(screen.getByText('⏸'));
    expect(store.game.speed).toBe(0);
  });

  it('runs within its budget on a slow device, drops the rest, and says the speed it reaches', () => {
    // A clock that passes two wall ms each time it is read: four reads use the budget, a hundred ticks in.
    let wall = 0;
    const store = createStore(CONTENT, null, 5, () => (wall += 2));
    render(<App store={store} />);
    act(() => {
      store.skipToOpen();
      store.setSpeed(60);
      store.pump(0);
    });
    const before = store.game.now;
    act(() => {
      for (let t = 16; t <= 16 * 40; t += 16) store.pump(t);
    });
    // Asked for 480 ticks a frame, about 100 ran: well under the 960 sim ms a frame at 60x.
    expect(store.game.now - before).toBeLessThan(40 * 960);
    expect(store.getRunning()).toBeGreaterThan(5);
    expect(store.getRunning()).toBeLessThan(30);
    act(() => store.publish());
    expect(screen.getByText(/running \d+×/)).toBeInTheDocument();
  });

  it('runs every tick asked when it has no clock, and the bar says nothing', () => {
    const store = createStore(CONTENT, null, 6);
    render(<App store={store} />);
    act(() => {
      store.skipToOpen();
      store.setSpeed(60);
      for (let t = 0; t <= 16 * 40; t += 16) store.pump(t);
    });
    expect(store.getRunning()).toBeCloseTo(60, 0);
    expect(screen.queryByText(/running \d+×/)).toBeNull();
  });

  it('opens the glossary at a term when one is clicked', () => {
    const store = createStore(CONTENT, null, 4);
    render(<App store={store} />);
    fireEvent.click(screen.getAllByText('fair')[0]!);
    expect(screen.getByRole('tab', { name: 'Learn' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /^Reports/ })).toHaveAttribute('aria-current', 'page');
    expect(document.getElementById('learn-fair-value')).toHaveAttribute('open');
  });

  it('saves to storage and comes back from it', () => {
    const storage = memory();
    const store = createStore(CONTENT, storage, 5);
    store.skipToOpen();
    for (let i = 0; i < 1000; i++) store.game.step(TICK_MS);
    store.save();
    expect(storage.data.has(SAVE_KEY)).toBe(true);
    const again = createStore(CONTENT, storage, 99);
    expect(again.game.now).toBe(store.game.now);
    expect(again.game.fingerprint()).toBe(store.game.fingerprint());
    again.reset(7);
    expect(storage.data.has(SAVE_KEY)).toBe(false);
    expect(again.game.now).not.toBe(store.game.now);
  });

  it('tells each order its race once the market has traded', () => {
    const store = createStore(CONTENT, null, 7);
    store.setReveal(true);
    store.setBlock('momentum', { enabled: false });
    store.setBlock('arbitrage', { enabled: true });
    store.skipToOpen();
    for (let i = 0; i < (6 * 60 * 1000) / TICK_MS; i++) store.game.step();
    store.publish();
    render(<App store={store} />);
    const items = document.querySelectorAll('.orders li');
    expect(items.length).toBeGreaterThan(0);
    const words = [...document.querySelectorAll('.race-words')].map((e) => e.textContent);
    expect(words.some((w) => /Filled|Missed|took/.test(w))).toBe(true);
    expect(words.some((w) => /old when sent/.test(w))).toBe(true);
  });

  it('disables the desk ticket while the market is closed, and says why', () => {
    const store = createStore(CONTENT, null, 9);
    store.setReveal(true);
    render(<App store={store} />);
    goTo('Desk');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('market closed');
  });

  it('sends a hand order from the desk, counts down its wait, and reads its slippage and the day total', () => {
    const store = createStore(CONTENT, null, 9);
    store.setReveal(true);
    store.skipToOpen();
    while (!store.game.snapshot().open) store.game.step(TICK_MS);
    for (let i = 0; i < (10 * 1000) / TICK_MS; i++) store.game.step(TICK_MS);
    store.publish();
    render(<App store={store} />);
    goTo('Desk');
    expect(screen.getByLabelText('Size')).toHaveValue(5000);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByLabelText('Orders waiting to be sent')).toHaveTextContent(/sending in 250ms/);
    act(() => {
      for (let i = 0; i < 100 / TICK_MS; i++) store.game.step(TICK_MS);
      store.publish();
    });
    expect(screen.getByLabelText('Orders waiting to be sent')).toHaveTextContent(/sending in 150ms/);
    // Past the reaction time and the trip to the exchange and back.
    act(() => {
      for (let i = 0; i < 2000 / TICK_MS; i++) store.game.step(TICK_MS);
      store.publish();
    });
    expect(screen.queryByLabelText('Orders waiting to be sent')).toBeNull();
    const line = document.querySelector('.slippage');
    expect(line).not.toBeNull();
    expect(line!.textContent).toMatch(
      /^Slippage: touch at your click \d+\.\d\d, at arrival \d+\.\d\d, filled at \d+\.\d\d/,
    );
    expect(screen.getByTestId('hand-total')).toHaveTextContent(
      /Hand trading today: [-+]?\$[\d,]+\.\d\d against the quote at the click/,
    );
    expect(screen.getAllByRole('button', { name: 'Slippage' }).length).toBeGreaterThan(0);
  });

  it('opens on the first week, ticks a lesson when it happens, and keeps the progress', () => {
    const storage = memory();
    const store = createStore(CONTENT, storage, 8);
    store.setReveal(true);
    render(<App store={store} />);
    expect(screen.getByRole('button', { name: /^First week: Find what earns from home/ })).toBeInTheDocument();
    goTo('Reports');
    expect(screen.getByRole('tab', { name: /First week/ })).toHaveAttribute('aria-selected', 'true');
    expect(document.querySelectorAll('.lesson.done')).toHaveLength(0);
    expect(document.querySelector('.lesson.current strong')?.textContent).toBe('Find what earns from home');
    act(() => {
      store.skipToOpen();
      for (let i = 0; i < (6 * 60 * 1000) / TICK_MS; i++) {
        store.game.step();
        if (i % 500 === 0) store.publish();
      }
      store.publish();
    });
    const done = document.querySelectorAll('.lesson.done');
    expect(done.length).toBeGreaterThanOrEqual(1);
    expect(document.querySelector('.lesson.done .lesson-text')).not.toBeNull();
    expect(storage.data.has(PROGRESS_KEY)).toBe(true);
    const again = createStore(CONTENT, storage, 9);
    expect(Object.keys(again.getProgress()).length).toBe(done.length);
    again.reset(1);
    expect(again.getProgress()).toEqual({});
    expect(storage.data.has(PROGRESS_KEY)).toBe(false);
  }, 60_000);

  it('applies a script and shows what it prints, or its error', () => {
    const store = createStore(CONTENT, null, 10);
    store.setReveal(true);
    store.setBlock('momentum', { enabled: false });
    store.setBlock('arbitrage', { enabled: false });
    store.setBlock('script', { enabled: true });
    render(<App store={store} />);
    goTo('Strategy');
    const source = screen.getByLabelText('Script source');
    fireEvent.change(source, { target: { value: 'log("hello from", symbols.length, "stocks")' } });
    fireEvent.click(screen.getByText('Apply'));
    expect(store.game.firm.blocks.find((b) => b.id === 'script')?.source).toBe(
      'log("hello from", symbols.length, "stocks")',
    );
    act(() => {
      store.skipToOpen();
      for (let i = 0; i < (90 * 1000) / TICK_MS; i++) store.game.step();
      store.publish();
    });
    expect(document.querySelector('.script-log')?.textContent).toMatch(/hello from 4 stocks/);
    fireEvent.change(source, { target: { value: 'nope(' } });
    fireEvent.click(screen.getByText('Apply'));
    act(() => {
      for (let i = 0; i < (2 * 1000) / TICK_MS; i++) store.game.step();
      store.publish();
    });
    expect(document.querySelector('.script-bar .down')?.textContent).toMatch(/Unexpected|missing/i);
  }, 30_000);

  it('shows the day report after a close, and marks the tab new', () => {
    const store = createStore(CONTENT, null, 11);
    store.setReveal(true);
    render(<App store={store} />);
    goTo('Reports');
    fireEvent.click(screen.getByRole('tab', { name: 'Days' }));
    expect(screen.getByText(/No day has closed yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'News' }));
    act(() => {
      store.skipToOpen();
      for (let i = 0; i < (3 * 60 * 1000) / TICK_MS; i++) store.game.step();
      while (store.game.snapshot().open) store.game.step(60_000);
      store.publish();
    });
    expect(screen.getByRole('tab', { name: /Days.*new/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Days/ }));
    expect(screen.queryByText('new')).toBeNull();
    expect(document.querySelector('.day')).not.toBeNull();
    expect(document.querySelector('.day summary strong')?.textContent).toMatch(/Mon, week 1/);
    expect(screen.getByText('By block')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Rivals' })).toBeInTheDocument();
  }, 60_000);

  it('sets the risk limits, and shows the halt when the day goes past them', () => {
    const store = createStore(CONTENT, null, 12);
    render(<App store={store} />);
    goTo('Strategy');
    fireEvent.change(screen.getByLabelText('Daily loss limit'), { target: { value: '50000' } });
    fireEvent.change(screen.getByLabelText('Leverage'), { target: { value: '2' } });
    expect(store.game.firm.risk).toEqual({ dailyLossLimit: 50_000, maxLeverage: 2 });
    act(() => {
      store.game.setRisk({ dailyLossLimit: 500 });
      // Pay the spread every decision: a strategy that can only lose.
      store.game.setBlock('arbitrage', { enabled: false });
      store.game.setBlock('script', {
        enabled: true,
        source:
          'const b = best("ABC"); if (b.bid && b.ask) { buy("ABC", b.ask.exchange, b.ask.price, 100); sell("ABC", b.bid.exchange, b.bid.price, 100); }',
      });
      store.skipToOpen();
      for (let i = 0; i < (20 * 60 * 1000) / TICK_MS && !store.game.firm.halt; i++) store.game.step();
      store.publish();
    });
    expect(store.game.firm.halt).not.toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(/HALTED.*loss limit/);
  }, 60_000);

  it('shows data latency apart from order latency for racks at more than one exchange', () => {
    const store = createStore(CONTENT, null, 13);
    render(<App store={store} />);
    goTo('Strategy');
    const dual = screen.getByText('Racks at HARBOR and LAKESIDE').parentElement?.textContent ?? '';
    // Over the consumer line the firm starts on: twelve of overhead, and seven more of link for the data.
    expect(dual).toMatch(/LAKESIDE orders 12.1ms, data 19ms/);
    expect(dual).toMatch(/HARBOR 12.1ms/);
  });

  it('names the kind of day from the open', () => {
    const store = createStore(CONTENT, null, 14);
    render(<App store={store} />);
    expect(document.querySelector('.regime')).toBeNull();
    act(() => {
      store.skipToOpen();
      for (let i = 0; i < (2 * 60 * 1000) / TICK_MS; i++) store.game.step();
      store.publish();
    });
    const name = document.querySelector('.regime')?.textContent ?? '';
    expect(['Calm day', 'Trending day', 'Choppy day', 'News-heavy day']).toContain(name);
  });

  it('lists every symbol on the watchlist, watches as many as the computer allows, and shows the picked one', () => {
    const store = createStore(CONTENT, null, 16);
    render(<App store={store} />);
    expect(document.querySelectorAll('.watchlist tbody tr')).toHaveLength(13);
    expect(document.querySelector('.market h2')?.textContent).toMatch(/watching 4 of 4/);
    // Four watched, so an unwatched box is disabled until one is freed.
    const idx = screen.getByLabelText('Watch IDX');
    expect(idx).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Watch ABC'));
    expect(store.game.firm.watching(CONTENT.stocks.map((x) => x.symbol))).toEqual(['QNT', 'LMN', 'VRT']);
    fireEvent.click(screen.getByLabelText('Watch IDX'));
    expect(store.game.firm.watching(CONTENT.stocks.map((x) => x.symbol))).toEqual(['QNT', 'LMN', 'VRT', 'IDX']);
    // Picking a row shows its exchanges beneath.
    fireEvent.click(screen.getByText('Meridian Oil'));
    expect(document.querySelector('.stock')?.getAttribute('data-symbol')).toBe('MNO');
    expect(document.querySelectorAll('.quotes tbody tr')).toHaveLength(3);
  });

  it('shows your own shares in the ladder', () => {
    const store = createStore(CONTENT, null, 15);
    store.setBlock('arbitrage', { enabled: false });
    store.setBlock('marketMaker', { enabled: true });
    render(<App store={store} />);
    act(() => {
      store.skipToOpen();
      for (let i = 0; i < (3 * 60 * 1000) / TICK_MS; i++) store.game.step();
      store.publish();
    });
    const s = store.getSnapshot();
    const withMine = s.stocks.flatMap((st) =>
      st.exchanges
        .filter((e) => e.depth.bids.some((l) => l.mine > 0) || e.depth.asks.some((l) => l.mine > 0))
        .map((e) => [st.symbol, e.id] as const),
    );
    expect(withMine.length).toBeGreaterThan(0);
    const [symbol, exchange] = withMine[0]!;
    fireEvent.click(screen.getByText(CONTENT.stocks.find((x) => x.symbol === symbol)!.name));
    const row = [...document.querySelectorAll('.quotes tr')].find((r) => r.textContent.includes(exchange));
    fireEvent.mouseOver(row!);
    expect(document.querySelector('.ladder .mine')).not.toBeNull();
    expect(document.querySelectorAll('.ladder tbody .mine').length).toBeGreaterThan(0);
  }, 60_000);

  it('offers the tutorial on a fresh game, walks its first steps and drives the page, and can be skipped', () => {
    const store = createStore(CONTENT, null, 17);
    render(<App store={store} />);
    expect(screen.getByRole('dialog', { name: 'Welcome' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Take the tutorial'));
    expect(screen.getByRole('dialog', { name: /Tutorial step 1 of/ })).toBeInTheDocument();
    expect(store.game.speed).toBe(0);
    expect(document.querySelector('[data-tut="pages"]')).toHaveClass('tut-target');
    fireEvent.click(screen.getByText('Next'));
    expect(document.querySelector('[data-tut="watchlist"]')).toHaveClass('tut-target');
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    // The clock step waits for the open at speed.
    expect(screen.getByRole('dialog', { name: /step 4 of/ })).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeDisabled();
    act(() => {
      store.skipToOpen();
      store.setSpeed(10);
      for (let i = 0; i < (90 * 1000) / TICK_MS; i++) store.game.step();
      store.publish();
    });
    expect(screen.getByText('Next')).toBeEnabled();
    // Back to the welcome state is not offered; Skip ends it and the Reports page offers it again.
    fireEvent.click(screen.getByText('Skip'));
    expect(screen.queryByRole('dialog')).toBeNull();
    goTo('Reports');
    expect(screen.getByText('Take the tutorial again')).toBeInTheDocument();
  }, 60_000);

  it('sets an exchange rule from the lab and restarts the scoreboard', () => {
    const store = createStore(CONTENT, null, 18);
    store.setReveal(true);
    store.setTutorial({ state: 'done' });
    render(<App store={store} />);
    goTo('Reports');
    fireEvent.click(screen.getByRole('tab', { name: 'Lab' }));
    expect(screen.getByText(/Since the rules changed/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Batch auction on HARBOR: 50 ms'));
    expect(store.game.market.exchange('HARBOR').rules.batchMs).toBe(50);
    expect(store.game.market.exchange('LAKESIDE').rules.batchMs).toBe(0);
    expect(screen.getByLabelText('Batch auction on HARBOR: 50 ms')).toHaveClass('on');
    fireEvent.click(screen.getByLabelText('Post-only on PACIFIC: off'));
    expect(store.game.market.exchange('PACIFIC').rules.postOnly).toBe(false);
    expect(store.getSnapshot().lab.scores.map((r) => r.name)).toContain('You');
  });

  it('opens the microscope, pauses, and steps by the tick', () => {
    const store = createStore(CONTENT, null, 19);
    store.setReveal(true);
    store.setTutorial({ state: 'done' });
    store.skipToOpen();
    store.setSpeed(10);
    render(<App store={store} />);
    fireEvent.click(screen.getByLabelText('Open the microscope'));
    expect(store.game.speed).toBe(0);
    expect(screen.getByRole('img', { name: /messages in flight/ })).toBeInTheDocument();
    const t = store.game.now;
    fireEvent.click(screen.getByLabelText('Step 10 milliseconds'));
    expect(store.game.now).toBe(t + 10);
    fireEvent.click(screen.getByText('Close the microscope'));
    expect(screen.queryByRole('img', { name: /messages in flight/ })).toBeNull();
  });

  it('shows the shop and refuses what cannot be afforded', () => {
    const store = createStore(CONTENT, null, 6);
    store.game.firm.cash = 1000;
    store.game.version++;
    store.publish();
    render(<App store={store} />);
    goTo('Strategy');
    expect(screen.getByText('Colocation at HARBOR')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: /\$120\.0k/ });
    expect(buttons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });
});

describe('MarketPanel: the gap', () => {
  /** A real snapshot with the first stock's quotes, fees and latencies set by hand, so the words are exact. */
  function fixture(
    over: {
      aSeen?: { bid: number | null; ask: number | null };
      bSeen?: { bid: number | null; ask: number | null };
      latency?: number;
      watched?: boolean;
      gaps?: Snapshot['gaps'];
      orders?: OrderStory[];
    } = {},
  ) {
    const store = createStore(CONTENT, null, 7);
    store.skipToOpen();
    for (let i = 0; i < 200; i++) store.game.step();
    store.publish();
    const base = store.getSnapshot();
    const st = base.stocks[0]!;
    const [a, b] = [st.exchanges[0]!.id, st.exchanges[1]!.id];
    const quote = (q: { bid: number | null; ask: number | null }) => ({ ...q, bidSize: 100, askSize: 100 });
    const book = (bid: number, ask: number) => ({
      bids: [{ price: bid, size: 100, mine: 0, orders: 1 }],
      asks: [{ price: ask, size: 100, mine: 0, orders: 1 }],
    });
    const aSeen = over.aSeen ?? { bid: 4130, ask: 4132 };
    const bSeen = over.bSeen ?? { bid: 4133, ask: 4136 };
    const s: Snapshot = {
      ...base,
      exchanges: base.exchanges.map((e) =>
        e.id === a ? { ...e, feePerShare: 0.3 } : e.id === b ? { ...e, feePerShare: 0.25 } : e,
      ),
      rules: Object.fromEntries(Object.entries(base.rules).map(([k, r]) => [k, { ...r, taxPerShare: 0 }])),
      dataLatency: { ...base.dataLatency, [a]: over.latency ?? 15, [b]: 44 },
      gaps: over.gaps ?? [],
      orders: over.orders ?? [],
      names: { ...base.names, rival: 'Harbor Quant' },
      stocks: base.stocks.map((x, i) =>
        i !== 0
          ? x
          : {
              ...x,
              watched: over.watched ?? true,
              exchanges: x.exchanges.map((e) =>
                e.id === a
                  ? { ...e, seen: quote(aSeen), depth: book(4131, 4133) }
                  : e.id === b
                    ? { ...e, seen: quote(bSeen), depth: book(4134, 4137) }
                    : { ...e, seen: null, depth: { bids: [], asks: [] } },
              ),
            },
      ),
    };
    return { s, store, sym: st.symbol, a, b };
  }
  const show = (f: ReturnType<typeof fixture>) =>
    render(<MarketPanel s={f.s} store={f.store} picked={f.sym} onPick={() => {}} />);
  const story = (f: ReturnType<typeof fixture>, over: Partial<OrderStory>): OrderStory => ({
    localId: 1,
    exchange: f.a,
    exchangeOrderId: 1,
    symbol: f.sym,
    side: 'buy',
    price: 4132,
    size: 100,
    filled: 0,
    ioc: true,
    status: 'cancelled',
    block: 'arbitrage',
    sentAt: 1000,
    seenAt: 900,
    arrivedAt: 1030,
    ackAt: 1060,
    beatenBy: [],
    fee: 0,
    realised: 0,
    avgFill: null,
    slippage: null,
    ...over,
  });

  it('names both exchanges, the cents and the edge after both taker fees', () => {
    const f = fixture();
    show(f);
    const line = document.querySelector('.gap-line')!;
    expect(line.textContent).toBe(
      `Gap: buy on ${f.a} at 41.32, sell on ${f.b} at 41.33 · 1¢ a share, 0.45¢ after both taker fees · as you see it: ${f.a} 15ms ago, ${f.b} 44ms ago.`,
    );
  });

  it('shows no gap line when the view is not crossed, and still marks the best bid and ask', () => {
    const f = fixture({ bSeen: { bid: 4129, ask: 4136 } });
    show(f);
    expect(document.querySelector('.gap-line')).toBeNull();
    const best = [...document.querySelectorAll('.quotes td.best')].map((e) => e.textContent);
    expect(best).toEqual(['41.30', '41.32']);
  });

  it('marks every one of a tie', () => {
    const f = fixture({ aSeen: { bid: 4130, ask: 4136 }, bSeen: { bid: 4130, ask: 4136 } });
    show(f);
    expect(document.querySelectorAll('.quotes td.best')).toHaveLength(4);
  });

  it('says the fees are bigger than the gap when the edge is negative', () => {
    const f = fixture({ aSeen: { bid: 4130, ask: 4133 }, bSeen: { bid: 4134, ask: 4136 } });
    f.s.exchanges.find((e) => e.id === f.a)!.feePerShare = 1.2;
    show(f);
    const line = document.querySelector('.gap-line')!.textContent;
    expect(line).toContain('1¢ a share, −0.45¢ after both taker fees: the fees are bigger than the gap');
  });

  it('shows the true touch now, or live where the data is a tick old or less', () => {
    const f = fixture({ latency: 15 });
    show(f);
    const now = [...document.querySelectorAll('.quotes td.col-now')].map((e) => e.textContent);
    expect(now[0]).toBe('41.31 / 41.33');
    expect(now[1]).toBe('41.34 / 41.37');
  });

  it('says live in place of the touch when the data latency is one tick', () => {
    const f = fixture({ latency: TICK_MS });
    show(f);
    expect(document.querySelectorAll('.quotes td.col-now')[0]!.textContent).toBe('live');
    expect(document.querySelectorAll('.quotes td.col-now')[1]!.textContent).toBe('41.34 / 41.37');
  });

  it('says so, and shows no gap list rows, for a stock that is not watched', () => {
    const f = fixture({ watched: false });
    show(f);
    expect(document.querySelector('.gap-line')!.textContent).toBe(
      `Not watched: your blocks cannot see ${f.sym}, so its gaps are not yours.`,
    );
    expect(document.querySelectorAll('.gap-row')).toHaveLength(0);
  });

  it('lists a gap with its edge, a one-look duration and what the orders on it did', () => {
    const f = fixture();
    f.s.gaps = [
      { symbol: f.sym, buyOn: f.a, sellOn: f.b, ask: 4132, bid: 4133, edge: 0.45, firstSeen: 1000, lastSeen: 1000 },
      { symbol: f.sym, buyOn: f.b, sellOn: f.a, ask: 4100, bid: 4102, edge: -0.2, firstSeen: 500, lastSeen: 560 },
    ];
    f.s.orders = [
      story(f, { localId: 1, sentAt: 1000, filled: 100, status: 'filled' }),
      story(f, { localId: 2, sentAt: 1000, beatenBy: [{ owner: 'rival', at: 1010, price: 4132, size: 100 }] }),
      story(f, { localId: 3, sentAt: 90000 }),
    ];
    show(f);
    const rows = [...document.querySelectorAll('.gap-row')];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain('one look');
    expect(rows[0]!.textContent).toContain('+0.45¢');
    expect(rows[0]!.textContent).toContain(`buy ${f.a} 41.32 / sell ${f.b} 41.33`);
    expect(rows[0]!.textContent).toContain('2 sent: 1 filled, 1 beaten by Harbor Quant');
    expect(rows[1]!.textContent).toContain('−0.20¢');
    expect(rows[1]!.textContent).toContain('60ms');
    expect(rows[1]!.textContent).toContain('you sent nothing');
  });

  it('says no gaps seen when the list is empty on a watched stock', () => {
    const f = fixture();
    show(f);
    expect(screen.getByText('No gaps seen yet.')).toBeInTheDocument();
    expect(screen.getByText('Gaps you saw')).toBeInTheDocument();
  });

  it('lists gaps on every symbol, and clicking a row picks its stock', () => {
    const f = fixture();
    const other = f.s.stocks[1]!.symbol;
    f.s.gaps = [
      { symbol: other, buyOn: f.a, sellOn: f.b, ask: 2000, bid: 2002, edge: 1, firstSeen: 2000, lastSeen: 2000 },
      { symbol: f.sym, buyOn: f.a, sellOn: f.b, ask: 4132, bid: 4133, edge: 0.45, firstSeen: 1000, lastSeen: 1000 },
    ];
    const picked: string[] = [];
    render(<MarketPanel s={f.s} store={f.store} picked={f.sym} onPick={(x) => picked.push(x)} />);
    const rows = [...document.querySelectorAll('.gap-row')];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain(other);
    expect(rows[1]!.textContent).toContain(f.sym);
    expect(rows[1]!.classList.contains('picked')).toBe(true);
    fireEvent.click(rows[0]!);
    expect(picked).toEqual([other]);
  });

  it('closed hours: empty books give no marks, no gap line, and a dash for now', () => {
    const f = fixture({ aSeen: { bid: null, ask: null }, bSeen: { bid: null, ask: null }, latency: 15 });
    for (const e of f.s.stocks[0]!.exchanges) e.depth = { bids: [], asks: [] };
    show(f);
    expect(document.querySelector('.gap-line')).toBeNull();
    expect(document.querySelectorAll('.quotes td.best')).toHaveLength(0);
    expect(document.querySelectorAll('.quotes td.col-now')[0]!.textContent).toBe('—');
  });
});

describe('FirmPanel: races by exchange, net, legend and span', () => {
  function firm(over: Partial<Snapshot> = {}) {
    const store = createStore(CONTENT, null, 7);
    store.publish();
    const base = store.getSnapshot();
    const [a, b] = [base.exchanges[0]!.id, base.exchanges[1]!.id];
    const s: Snapshot = { ...base, orders: [], latency: { ...base.latency, [a]: 2, [b]: 30 }, ...over };
    return { s, a, b };
  }
  let n = 0;
  const order = (exchange: string, over: Partial<OrderStory> = {}): OrderStory => ({
    localId: ++n,
    exchange,
    exchangeOrderId: n,
    symbol: 'AAA',
    side: 'buy',
    price: 4132,
    size: 100,
    filled: 0,
    ioc: true,
    status: 'cancelled',
    block: 'arbitrage',
    sentAt: 1000,
    seenAt: 900,
    arrivedAt: 1030,
    ackAt: 1060,
    beatenBy: [],
    fee: 0,
    realised: 0,
    avgFill: null,
    slippage: null,
    ...over,
  });
  const beat = [{ owner: 'rival', at: 1010, price: 4132, size: 100 }];

  it('counts the finished immediate-or-cancel races on each exchange', () => {
    const { s, a, b } = firm();
    s.orders = [
      order(a, { filled: 100, status: 'filled' }),
      order(a, { filled: 100, status: 'filled' }),
      order(a, { beatenBy: beat }),
      order(b, { beatenBy: beat }),
      order(b),
      order(a, { status: 'inflight', ackAt: null }),
      order(a, { status: 'resting', ioc: false }),
    ];
    render(<FirmPanel s={s} />);
    const card = document.querySelector('.scorecard')!;
    expect(card.textContent).toContain('your last 5');
    const rows = [...card.querySelectorAll('tbody tr')];
    const cells = (id: string) =>
      [...rows.find((r) => r.textContent.includes(id))!.querySelectorAll('td')].map((c) => c.textContent.trim());
    expect(cells(a)).toEqual([a, '2ms', '2', '1', '0', '67%']);
    expect(cells(b)).toEqual([b, '30ms', '0', '1', '1', '0%']);
    expect(rows.some((r) => r.textContent.includes('—'))).toBe(s.exchanges.length > 2);
  });

  it('hides the scorecard when no race is counted', () => {
    const { s, a } = firm();
    s.orders = [order(a, { status: 'inflight', ackAt: null })];
    render(<FirmPanel s={s} />);
    expect(document.querySelector('.scorecard')).toBeNull();
  });

  it('shows net after fees and fines in the heading', () => {
    const { s } = firm({ realised: 1000, unrealised: 250.4, feesPaid: 300, finesPaid: 100 });
    render(<FirmPanel s={s} />);
    expect(document.querySelector('.firm h2')!.textContent).toContain('net +$8.50');
  });

  it('draws the legend once when there are orders, and not with none', () => {
    const { s, a } = firm();
    const { unmount } = render(<FirmPanel s={s} />);
    expect(document.querySelector('.race-legend')).toBeNull();
    unmount();
    s.orders = [order(a), order(a)];
    render(<FirmPanel s={s} />);
    const legends = document.querySelectorAll('.race-legend');
    expect(legends).toHaveLength(1);
    for (const w of ['saw the quote', 'sent', 'a rival took it', 'arrived', 'heard back'])
      expect(legends[0]!.textContent).toContain(w);
  });

  it('shows the newest five orders, and holds them still while the pointer is over the list', () => {
    const { s, a } = firm();
    s.orders = Array.from({ length: 7 }, () => order(a));
    const first = s.orders.map((o) => o.localId);
    const { rerender } = render(<FirmPanel s={s} />);
    const ids = () => [...document.querySelectorAll('.orders li')].map((li) => Number(li.getAttribute('data-id')));
    expect(ids()).toEqual(first.slice(0, 5));
    fireEvent.mouseEnter(document.querySelector('.orders')!);
    const later = { ...s, orders: [order(a), order(a), ...s.orders] };
    rerender(<FirmPanel s={later} />);
    expect(ids()).toEqual(first.slice(0, 5));
    expect(document.querySelector('.firm')!.textContent).toContain('held while you look');
    fireEvent.mouseLeave(document.querySelector('.orders')!);
    expect(ids()).toEqual(later.orders.slice(0, 5).map((o) => o.localId));
    expect(document.querySelector('.firm')!.textContent).not.toContain('held while you look');
  });

  it('writes the span at the end of each bar, and so far while unheard', () => {
    const { s, a } = firm();
    s.now = 1200;
    s.orders = [order(a), order(a, { ackAt: null, status: 'inflight' })];
    render(<FirmPanel s={s} />);
    const spans = [...document.querySelectorAll('.race-span')].map((e) => e.textContent);
    expect(spans).toEqual(['160ms', '300ms so far']);
  });
});

describe('Store: hold', () => {
  it('advances nothing while held, however much wall time passes, and resumes on release', () => {
    const store = createStore(CONTENT, null, 21);
    const t0 = store.game.now;
    store.hold(true);
    for (let t = 0; t <= 60_000; t += 500) store.pump(t);
    expect(store.game.now).toBe(t0);
    store.hold(false);
    store.pump(60_100);
    expect(store.game.now).toBeGreaterThan(t0);
  });

  it('does not catch up the held gap in one go on release', () => {
    const store = createStore(CONTENT, null, 22);
    const t0 = store.game.now;
    store.hold(true);
    for (let t = 0; t <= 600_000; t += 1000) store.pump(t);
    store.hold(false);
    store.pump(600_100);
    const first = store.game.now - t0;
    expect(first).toBeLessThanOrEqual(1000 * store.game.speed);
  });

  it('leaves a saved game unchanged until released', () => {
    const storage = memory();
    const first = createStore(CONTENT, storage, 23);
    first.skipToOpen();
    for (let i = 0; i < 200; i++) first.game.step(TICK_MS);
    first.save();
    const again = createStore(CONTENT, storage, 99);
    again.hold(true);
    const now = again.game.now;
    const print = again.game.fingerprint();
    for (let t = 0; t <= 30_000; t += 250) again.pump(t);
    expect(again.game.now).toBe(now);
    expect(again.game.fingerprint()).toBe(print);
    again.hold(false);
    again.pump(30_100);
    expect(again.game.now).toBeGreaterThan(now);
  });
});

describe('Cover', () => {
  it('is a dialog named Propshop with the title, tagline, a decorative picture and Start focused', () => {
    render(<Cover onStart={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Propshop' });
    expect(screen.getByRole('heading', { name: 'Propshop' })).toBeInTheDocument();
    expect(
      screen.getByText('Trading by machine, in large numbers, on tiny edges, as fast as physics allows.'),
    ).toBeInTheDocument();
    const img = dialog.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('alt', '');
    expect(screen.getByRole('button', { name: 'Start' })).toHaveFocus();
  });

  it('starts on a click anywhere, on the button, and on Enter or Space, once each', () => {
    const onStart = vi.fn();
    render(<Cover onStart={onStart} />);
    const dialog = screen.getByRole('dialog', { name: 'Propshop' });
    fireEvent.click(dialog);
    expect(onStart).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(onStart).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(dialog, { key: 'Enter' });
    expect(onStart).toHaveBeenCalledTimes(3);
    fireEvent.keyDown(dialog, { key: ' ' });
    expect(onStart).toHaveBeenCalledTimes(4);
  });
});

describe('Root', () => {
  it('shows the cover with the store held, then the app and a running sim after Start', () => {
    const store = createStore(CONTENT, null, 24);
    render(<Root store={store} />);
    expect(screen.getByRole('dialog', { name: 'Propshop' })).toBeInTheDocument();
    expect(screen.queryByText('06:00:00')).toBeNull();
    const t0 = store.game.now;
    store.pump(0);
    store.pump(500);
    expect(store.game.now).toBe(t0);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.queryByRole('dialog', { name: 'Propshop' })).toBeNull();
    expect(screen.getByText('06:00:00')).toBeInTheDocument();
    act(() => store.pump(600));
    expect(store.game.now).toBeGreaterThan(t0);
  });
});

/** The names of the blocks listed on the Strategy page. */
function listedBlocks(): string[] {
  return screen.queryAllByLabelText(/^Enable /).map((e) => e.getAttribute('aria-label')!.replace('Enable ', ''));
}

/** Money and a purchase, so stage 2 opens through the lesson the way a player's would. */
function buySeat(store: ReturnType<typeof createStore>) {
  store.game.firm.cash = 1_000_000_00;
  store.buyUpgrade('network', 'fibre');
}

describe('stages', () => {
  it('criterion 1: a fresh game shows Market, Strategy and Reports, momentum only and on, and none of the later things', () => {
    const store = createStore(CONTENT, null, 31);
    store.setTutorial({ state: 'done' });
    act(() => {
      store.skipToOpen();
      for (let i = 0; i < (3 * 60 * 1000) / TICK_MS; i++) store.game.step();
      store.publish();
    });
    render(<App store={store} />);
    const pages = [...document.querySelectorAll('nav.pages > button:not(.link)')].map((b) => b.textContent);
    expect(pages.map((p) => p.replace(/\d+$/, ''))).toEqual(['Market', 'Strategy', 'Reports']);
    // Things a later stage shows: the gap counter, the scorecard, the race under an order, the microscope.
    expect(screen.queryByText(/gaps seen/)).toBeNull();
    expect(document.querySelector('.gap-line, .gap-list')).toBeNull();
    expect(document.querySelector('.scorecard')).toBeNull();
    expect(document.querySelector('.race-words')).toBeNull();
    expect(screen.queryByLabelText('Open the microscope')).toBeNull();
    expect(document.querySelectorAll('.orders li').length).toBeGreaterThan(0);
    goTo('Strategy');
    expect(listedBlocks()).toEqual(['Momentum']);
    expect(screen.getByLabelText('Enable Momentum')).toBeChecked();
    goTo('Reports');
    expect(screen.getAllByRole('tab').map((t) => t.textContent.replace(/\d+$/, '').replace(/new$/, ''))).toEqual([
      'First week',
      'Days',
      'Learn',
    ]);
  }, 30_000);

  it('criterion 3: buying a seat opens stage 2 with an intro card at the gap view, and the arbitrage block, gap counter, races and Rivals', () => {
    const store = createStore(CONTENT, null, 32);
    store.setTutorial({ state: 'done' });
    render(<App store={store} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => buySeat(store));
    const card = screen.getByRole('dialog', { name: /Stage step 1 of 3/ });
    expect(card).toHaveTextContent('A better seat: the gap');
    expect(screen.getAllByText(/gaps seen/).length).toBeGreaterThan(0);
    expect(document.querySelector('[data-tut="gaps"]')).not.toBeNull();
    goTo('Strategy');
    expect(listedBlocks().sort()).toEqual(['Cross-exchange arbitrage', 'Momentum', 'Stale-quote sniper']);
    goTo('Reports');
    expect(screen.getByRole('tab', { name: 'Rivals' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'News' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Desk/ })).toBeNull();
    // Through the cards: the stage is marked seen and the card goes.
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store.getIntro()).toBeNull();
  });

  it('criterion 3, later stages: stage 3 adds the day-character blocks and News, stage 4 the Desk and microscope', () => {
    const at = (lessons: string[]) => {
      const storage = memory();
      storage.setItem(STAGES_KEY, '{"seen":5}');
      storage.setItem(PROGRESS_KEY, JSON.stringify(Object.fromEntries(lessons.map((l) => [l, 1]))));
      const store = createStore(CONTENT, storage, 33);
      store.setTutorial({ state: 'done' });
      return store;
    };
    const three = at(['seat', 'race']);
    expect(three.getStage()).toBe(3);
    render(<App store={three} />);
    expect(screen.queryByRole('button', { name: /^Desk/ })).toBeNull();
    expect(screen.queryByLabelText('Open the microscope')).toBeNull();
    goTo('Strategy');
    expect(listedBlocks().sort()).toEqual([
      'Cross-exchange arbitrage',
      'Market maker',
      'Mean reversion',
      'Momentum',
      'News reaction',
      'Stale-quote sniper',
    ]);
    goTo('Reports');
    expect(screen.getByRole('tab', { name: 'News' })).toBeInTheDocument();
    // The dark web is the sim's to unlock: at stage 3 its tab waits for the message.
    expect(screen.queryByRole('tab', { name: 'Dark web' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Lab' })).toBeNull();
    cleanup();
    const four = at(['seat', 'race', 'maker']);
    expect(four.getStage()).toBe(4);
    render(<App store={four} />);
    expect(screen.getByRole('button', { name: /^Desk/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Open the microscope')).toBeInTheDocument();
    goTo('Strategy');
    expect(listedBlocks()).not.toContain('Pairs');
  });

  it('criterion 4: a block that is on is shown although its stage is not open', () => {
    const store = createStore(CONTENT, null, 34);
    store.setTutorial({ state: 'done' });
    store.setBlock('marketMaker', { enabled: true });
    render(<App store={store} />);
    goTo('Strategy');
    expect(listedBlocks().sort()).toEqual(['Market maker', 'Momentum']);
    expect(screen.getByLabelText('Enable Market maker')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Enable Market maker'));
    expect(listedBlocks()).toEqual(['Momentum']);
  });

  it('criterion 5: show everything opens every stage, persists across a reload and across Start again', () => {
    const storage = memory();
    const store = createStore(CONTENT, storage, 35);
    store.setTutorial({ state: 'done' });
    render(<App store={store} />);
    expect(screen.queryByRole('button', { name: /^Desk/ })).toBeNull();
    goTo('Reports');
    fireEvent.click(screen.getByLabelText(/Show everything/));
    expect(screen.getByRole('button', { name: /^Desk/ })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(7);
    expect(screen.queryByRole('dialog')).toBeNull();
    goTo('Strategy');
    expect(listedBlocks()).toHaveLength(10);
    // A reload.
    cleanup();
    const again = createStore(CONTENT, storage, 36);
    again.setTutorial({ state: 'done' });
    render(<App store={again} />);
    expect(screen.getByRole('button', { name: /^Desk/ })).toBeInTheDocument();
    // Start again.
    act(() => again.reset(37));
    expect(screen.getByRole('button', { name: /^Desk/ })).toBeInTheDocument();
    goTo('Reports');
    expect(screen.getByLabelText(/Show everything/)).toBeChecked();
    fireEvent.click(screen.getByLabelText(/Show everything/));
    expect(screen.queryByRole('button', { name: /^Desk/ })).toBeNull();
  });

  it('criterion 6: a save from before the stages opens every stage, with no intro cards', () => {
    const storage = memory();
    const old = createStore(CONTENT, storage, 38);
    old.save();
    storage.data.delete(STAGES_KEY);
    const store = createStore(CONTENT, storage, 39);
    store.setTutorial({ state: 'done' });
    render(<App store={store} />);
    expect(screen.getByRole('button', { name: /^Desk/ })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    goTo('Strategy');
    expect(listedBlocks()).toHaveLength(10);
  });

  it('criterion 8: the first week lists lessons by stage, and names the stages not open yet', () => {
    const store = createStore(CONTENT, null, 40);
    store.setTutorial({ state: 'done' });
    render(<App store={store} />);
    goTo('Reports');
    const headings = [...document.querySelectorAll('.first-week h3')].map((h) => h.textContent);
    expect(headings[0]).toMatch(/^Stage 1: Spare room/);
    expect(headings).toHaveLength(5);
    expect(headings[1]).toMatch(/Stage 2: A better seat · opens as you go/);
    const titles = [...document.querySelectorAll('.lesson-head strong')].map((e) => e.textContent);
    expect(titles).toEqual(['Find what earns from home', 'Buy a better seat']);
  });
});
