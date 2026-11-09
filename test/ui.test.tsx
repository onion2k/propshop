// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CONTENT, DESK_NAMES, LESSONS, glossary, type Lesson } from '../src/content';
import { TICK_MS, type DayReport, type OrderStory, type Snapshot } from '../src/sim';
import { MarketPanel } from '../src/ui/MarketPanel';
import { FirmPanel } from '../src/ui/FirmPanel';
import { DeskPanel } from '../src/ui/DeskPanel';
import { NewsPanel } from '../src/ui/NewsPanel';
import { App } from '../src/ui/App';
import { FirstWeekPanel } from '../src/ui/FirstWeekPanel';
import { GoContext } from '../src/ui/Go';
import { Cover } from '../src/ui/Cover';
import { Root } from '../src/ui/Root';
import { ExperimentPage } from '../src/ui/ExperimentPage';
import { EXPERIMENTS, type Experiment } from '../src/content/experiments';
import { EXPERIMENTS_KEY } from '../src/ui/Root';
import { MARKET_OPEN } from '../src/sim/clock';
import { createStore, PROGRESS_KEY, SAVE_KEY, STAGES_KEY, type Storage } from '../src/ui/store';
import { TESTS_KEY, type Night } from '../src/ui/nights';
import { dollarPrice, money, pointsFrom, price, priceStep } from '../src/ui/format';

/** The page switcher under the top bar. */
function goTo(page: 'Overview' | 'Market' | 'Desk' | 'Strategy' | 'Reports') {
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

describe('the Strategy page', () => {
  it("links every block's name to a glossary entry, the desks' blocks included", () => {
    const store = createStore(CONTENT, null, 2);
    store.setReveal(true);
    store.game.openDesk('futures');
    store.game.openDesk('fx');
    store.publish();
    render(<App store={store} />);
    goTo('Strategy');
    const linked = [...document.querySelectorAll('.strategy summary strong button.term')].map((b) => b.textContent);
    for (const name of ['Lead-lag', 'Triangular arbitrage', 'Carry', 'Basis arbitrage', 'Roll'])
      expect(linked).toContain(name);
  });
});

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
    goTo('Market');
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
    void store.save();
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
    goTo('Market');
    const items = document.querySelectorAll('.orders li');
    expect(items.length).toBeGreaterThan(0);
    const words = [...document.querySelectorAll('.race-words')].map((e) => e.textContent);
    expect(words.some((w) => /Filled|Missed|took/.test(w))).toBe(true);
    expect(words.some((w) => /old when sent/.test(w))).toBe(true);
  }, 20_000);

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
    // Before and after, for the venues the firm trades: the data crosses the link seven ms later than the orders.
    expect(dual).toMatch(/LAKESIDE 36ms → 12.1ms, data 19ms/);
    expect(dual).toMatch(/HARBOR 44ms → 12.1ms/);
  });

  it('names the kind of day from the open', () => {
    const store = createStore(CONTENT, null, 14);
    render(<App store={store} />);
    // Before the first open the slot is held, empty, so the bar does not reflow when the day is named.
    expect(document.querySelector('.regime')!.textContent.trim()).toBe('');
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
    goTo('Market');
    expect(document.querySelectorAll('.watchlist tbody tr')).toHaveLength(14);
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
    goTo('Market');
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

  it('writes a gap in a currency pair in pips, the fees turned into pips', () => {
    const f = fixture();
    f.s.exchanges.find((e) => e.id === f.a)!.feePerShare = 0.25;
    // A pip of a lot is ten cents: two quarter-cent fees are a twentieth of a pip.
    f.s.stocks[0] = {
      ...f.s.stocks[0]!,
      decimals: 4,
      pair: { base: 'EUR', quote: 'USD', lot: 1000, cross: null, pointValue: 10 },
    };
    f.s.gaps = [
      { symbol: f.sym, buyOn: f.a, sellOn: f.b, ask: 4132, bid: 4133, edge: 0.95, firstSeen: 1000, lastSeen: 1000 },
    ];
    show(f);
    expect(document.querySelector('.gap-line')!.textContent).toContain(
      `buy on ${f.a} at 0.4132, sell on ${f.b} at 0.4133 · 1 pip, 0.95 pips after both taker fees`,
    );
    expect(document.querySelector('.gap-row')!.textContent).toContain('+0.95 pips');
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

  it('shows the scorecard with dashes before any race is counted, so the panel does not jump at the first', () => {
    const { s, a } = firm();
    s.orders = [order(a, { status: 'inflight', ackAt: null })];
    render(<FirmPanel s={s} />);
    const card = document.querySelector('.scorecard')!;
    expect(card.textContent).toContain('none yet');
    const rates = [...card.querySelectorAll('tbody tr')].map((r) => r.lastElementChild!.textContent);
    expect(rates).toEqual(s.exchanges.map(() => '—'));
  });

  it('shows net after fees and fines in the heading', () => {
    const { s } = firm({ realised: 1000, unrealised: 250.4, feesPaid: 300, finesPaid: 100 });
    render(<FirmPanel s={s} />);
    expect(document.querySelector('.firm-pnl')!.textContent).toContain('Net+$8.50');
    expect(document.querySelector('.firm-pnl')!.textContent).toContain('Fines-$1.00');
  });

  it('draws the legend once, with orders or without, so the first order does not move the panel', () => {
    const { s, a } = firm();
    const { unmount } = render(<FirmPanel s={s} />);
    expect(document.querySelectorAll('.race-legend')).toHaveLength(1);
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
    void first.save();
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
      screen.getByText(
        "Run a small trading firm on stocks, then futures, currencies and metals, where the fast firm eats the slow one's lunch.",
      ),
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

/** A miles-like experiment cut small: a 1.2-second window from just after the open, one moment, and a change that changes nothing. */
function tiny(): Experiment {
  const base = EXPERIMENTS.find((e) => e.id === 'miles')!;
  const startAt = MARKET_OPEN + 400;
  return {
    ...base,
    id: 'tiny',
    title: 'A tiny one',
    startAt,
    windowMs: 1200,
    changes: [
      { id: 'nothing', label: 'Change nothing', detail: 'Leaves the setup as it was.', apply: (x) => x },
      {
        id: 'city',
        label: 'Move to the city',
        detail: 'An office in the city.',
        apply: (x) => ({ ...x, location: 'city' }),
      },
    ],
    tracker: () => ({
      source: () => [],
      pick: () => [{ at: startAt + 500, from: startAt + 500, kind: 'test', label: 'A test moment', symbol: 'QNT' }],
    }),
    explain: (a, b, c) => `Explained ${c.label}: ${a.fills} then ${b.fills}.`,
  };
}

const SLOW = { timeout: 30_000 };

async function toPick() {
  fireEvent.click(screen.getByRole('button', { name: 'Run as given' }));
  await screen.findByRole('group', { name: 'Pick one change' }, SLOW);
}

async function toResult(change: string, guess: RegExp) {
  await toPick();
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(change) }));
  fireEvent.click(screen.getByRole('button', { name: guess }));
  fireEvent.click(screen.getByRole('button', { name: 'Run again with this change' }));
  await screen.findByRole('status', { name: 'Your guess' }, SLOW);
}

describe('Root', () => {
  it('shows the cover with the store held, then the experiments, then free play with the sim running', () => {
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
    // The list holds the sim still, too.
    act(() => store.pump(600));
    expect(store.game.now).toBe(t0);
    fireEvent.click(screen.getByRole('button', { name: 'Free play' }));
    expect(screen.getByText('06:00:00')).toBeInTheDocument();
    act(() => store.pump(1200));
    expect(store.game.now).toBeGreaterThan(t0);
  });

  it('lists the seven experiments and Free play', () => {
    const store = createStore(CONTENT, null, 25);
    render(<Root store={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('heading', { name: 'Experiments' })).toBeInTheDocument();
    for (const e of EXPERIMENTS) {
      expect(screen.getByRole('button', { name: new RegExp(e.title) })).toBeInTheDocument();
      expect(screen.getByText(e.teaches)).toBeInTheDocument();
    }
    expect(EXPERIMENTS).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Free play' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run the firm' })).toBeInTheDocument();
  });

  it('groups the seven under four desk headings, in the order the desks open', () => {
    const store = createStore(CONTENT, null, 25);
    render(<Root store={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    const heads = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(heads).toEqual(['Stocks', 'Futures', 'Currencies', 'Metals']);
    const group = (name: string) => within(screen.getByRole('group', { name }));
    expect(group('Stocks').getAllByRole('listitem')).toHaveLength(3);
    expect(group('Futures').getAllByRole('listitem')).toHaveLength(1);
    expect(group('Currencies').getAllByRole('listitem')).toHaveLength(1);
    expect(group('Metals').getAllByRole('listitem')).toHaveLength(2);
  });

  it('Run the firm opens the app staged, with the show-everything switch off and no Desk page', () => {
    const store = createStore(CONTENT, memory(), 28);
    store.setReveal(true);
    render(<Root store={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByText(/Start in a spare room with one block/)).toBeInTheDocument();
    expect(screen.getByText('The same firm, with everything shown.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Run the firm' }));
    expect(store.getReveal()).toBe(false);
    expect(screen.getByRole('button', { name: 'Experiments' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Desk/ })).toBeNull();
  });

  it('Free play opens the app with every stage open, and a way back to the list', () => {
    const store = createStore(CONTENT, memory(), 26);
    render(<Root store={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(screen.getByRole('button', { name: 'Free play' }));
    expect(store.getReveal()).toBe(true);
    expect(screen.getByRole('button', { name: /^Desk/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Experiments' }));
    expect(screen.getByRole('heading', { name: 'Experiments' })).toBeInTheDocument();
    const t0 = store.game.now;
    act(() => {
      store.pump(0);
      store.pump(500);
    });
    expect(store.game.now).toBe(t0);
  });

  it('marks a finished experiment done, and keeps it in the storage', async () => {
    const storage = memory();
    const store = createStore(CONTENT, storage, 27);
    render(<Root store={store} storage={storage} experiments={[tiny()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(screen.getByRole('button', { name: /A tiny one/ }));
    await toResult('Change nothing', /About the same/);
    expect(JSON.parse(storage.data.get(EXPERIMENTS_KEY)!)).toEqual({ done: ['tiny'], called: { tiny: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Back to experiments' }));
    expect(
      within(screen.getByRole('button', { name: /A tiny one/ })).getByText('Done: you called it'),
    ).toBeInTheDocument();
    expect(screen.getByText('You called 1 of the 1 you guessed.')).toBeInTheDocument();
    // A re-run with a wrong guess leaves the record.
    fireEvent.click(screen.getByRole('button', { name: /A tiny one/ }));
    await toResult('Change nothing', /^Better/);
    expect(JSON.parse(storage.data.get(EXPERIMENTS_KEY)!)).toEqual({ done: ['tiny'], called: { tiny: true } });
  }, 90_000);

  it('records a wrong first guess, and says so on the card and in the score', async () => {
    const storage = memory();
    const store = createStore(CONTENT, storage, 29);
    render(<Root store={store} storage={storage} experiments={[tiny()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByText('Not done')).toBeInTheDocument();
    expect(screen.queryByText(/You called/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /A tiny one/ }));
    await toResult('Change nothing', /^Better/);
    expect(JSON.parse(storage.data.get(EXPERIMENTS_KEY)!)).toEqual({ done: ['tiny'], called: { tiny: false } });
    fireEvent.click(screen.getByRole('button', { name: 'Back to experiments' }));
    expect(screen.getByText('Done: you guessed wrong')).toBeInTheDocument();
    expect(screen.getByText('You called 0 of the 1 you guessed.')).toBeInTheDocument();
  }, 60_000);

  it('reads an old { done } value as Done, with no score, and ignores a called that is not booleans', () => {
    const storage = memory();
    storage.setItem(EXPERIMENTS_KEY, JSON.stringify({ done: ['tiny'] }));
    const store = createStore(CONTENT, storage, 30);
    const { unmount } = render(<Root store={store} storage={storage} experiments={[tiny()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(within(screen.getByRole('button', { name: /A tiny one/ })).getByText('Done')).toBeInTheDocument();
    expect(screen.queryByText(/You called/)).toBeNull();
    unmount();
    storage.setItem(EXPERIMENTS_KEY, JSON.stringify({ done: ['tiny'], called: { tiny: 'yes' } }));
    render(<Root store={store} storage={storage} experiments={[tiny()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(within(screen.getByRole('button', { name: /A tiny one/ })).getByText('Done')).toBeInTheDocument();
    expect(screen.queryByText(/You called/)).toBeNull();
  });

  it('shows the top bar as a trading sim, not an HFT sim', () => {
    const store = createStore(CONTENT, null, 33);
    store.setTutorial({ state: 'done' });
    render(<App store={store} />);
    expect(screen.getByText('a trading sim')).toBeInTheDocument();
    expect(screen.queryByText('HFT')).toBeNull();
  });
});

describe('ExperimentPage', () => {
  it('walks from the briefing through two runs to a result, marks a right guess, and shows the numbers', async () => {
    const e = tiny();
    render(<ExperimentPage experiment={e} onBack={() => undefined} onDone={() => undefined} />);
    expect(screen.getByText(/Four rival firms/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Latency' })).toBeInTheDocument();
    await toPick();
    // The first run's numbers stay for the picker to look at.
    expect(screen.getByRole('progressbar', { name: 'Window progress' })).toHaveAttribute('aria-valuenow', '100');
    const again = screen.getByRole('button', { name: 'Run again with this change' });
    expect(again).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /Change nothing/ }));
    expect(again).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /About the same/ }));
    expect(again).toBeEnabled();
    fireEvent.click(again);
    const verdict = await screen.findByRole('status', { name: 'Your guess' }, SLOW);
    // The same setup in the same world: the same P&L, so "about the same" is right.
    expect(verdict).toHaveTextContent(/right/i);
    expect(screen.getByText(/Explained Change nothing/)).toBeInTheDocument();
    expect(screen.getByText(e.takeaway)).toBeInTheDocument();
    const table = screen.getByRole('group', { name: 'The two runs' });
    for (const row of ['P&L', 'Fills', 'Races won', 'Races beaten', 'Races missed']) {
      expect(within(table).getAllByText(row)).toHaveLength(2);
    }
  }, 60_000);

  it('marks a wrong guess wrong', async () => {
    render(<ExperimentPage experiment={tiny()} onBack={() => undefined} onDone={() => undefined} />);
    await toResult('Change nothing', /^Better/);
    expect(screen.getByRole('status', { name: 'Your guess' })).toHaveTextContent(/wrong/i);
  }, 60_000);

  it('Try another change reruns only the second run and asks for the guess again', async () => {
    render(<ExperimentPage experiment={tiny()} onBack={() => undefined} onDone={() => undefined} />);
    await toResult('Change nothing', /About the same/);
    fireEvent.click(screen.getByRole('button', { name: 'Try another change' }));
    const again = screen.getByRole('button', { name: 'Run again with this change' });
    expect(again).toBeDisabled();
    expect(screen.getByRole('button', { name: /About the same/ })).toHaveAttribute('aria-pressed', 'false');
  }, 60_000);

  it('opens a moment in the replay, and Play slowed and the step advance it, up to the window end', async () => {
    render(<ExperimentPage experiment={tiny()} onBack={() => undefined} onDone={() => undefined} />);
    await toResult('Change nothing', /About the same/);
    const moment = await screen.findAllByRole('button', { name: /A test moment/ }, SLOW);
    await waitFor(() => expect(moment[0]).toBeEnabled(), SLOW);
    fireEvent.click(moment[0]!);
    const caption = screen.getByText('A test moment', { selector: '.replay-caption' });
    expect(caption).toBeInTheDocument();
    const clock = () => screen.getByTestId('replay-time').textContent;
    const t0 = clock();
    fireEvent.click(screen.getByRole('button', { name: 'Step one tick' }));
    const t1 = clock();
    expect(t1).not.toBe(t0);
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Play slowed' }));
      act(() => void vi.advanceTimersByTime(1000));
      expect(clock()).not.toBe(t1);
      fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
      const t2 = clock();
      act(() => void vi.advanceTimersByTime(1000));
      expect(clock()).toBe(t2);
    } finally {
      vi.useRealTimers();
    }
    // Close goes back to the result.
    fireEvent.click(screen.getByRole('button', { name: 'Close the microscope' }));
    expect(screen.getByRole('status', { name: 'Your guess' })).toBeInTheDocument();
  }, 60_000);
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
  it('criterion 1: a fresh game shows Overview, Market, Strategy and Reports, momentum only and on, and none of the later things', () => {
    const store = createStore(CONTENT, null, 31);
    store.setTutorial({ state: 'done' });
    act(() => {
      store.skipToOpen();
      for (let i = 0; i < (3 * 60 * 1000) / TICK_MS; i++) store.game.step();
      store.publish();
    });
    render(<App store={store} />);
    const pages = [...document.querySelectorAll('nav.pages > button:not(.link)')].map((b) => b.textContent);
    expect(pages.map((p) => p.replace(/\d+$/, ''))).toEqual(['Overview', 'Market', 'Strategy', 'Reports']);
    goTo('Market');
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
    // Stage 2 needs home as well as the seat.
    const storage = memory();
    storage.setItem(PROGRESS_KEY, JSON.stringify({ home: 1 }));
    const store = createStore(CONTENT, storage, 32);
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
    // `seen` is the stage under test: a higher one would hold the stage up, a lower one would show its card.
    const at = (lessons: string[], seen: number) => {
      const storage = memory();
      storage.setItem(STAGES_KEY, JSON.stringify({ seen }));
      storage.setItem(PROGRESS_KEY, JSON.stringify(Object.fromEntries(lessons.map((l) => [l, 1]))));
      const store = createStore(CONTENT, storage, 33);
      store.setTutorial({ state: 'done' });
      return store;
    };
    const stage1 = ['home', 'seat'];
    const stage2 = [...stage1, 'gap', 'race', 'cost'];
    const three = at(stage2, 3);
    expect(three.getStage()).toBe(3);
    render(<App store={three} />);
    expect(screen.queryByRole('button', { name: /^Desk/ })).toBeNull();
    expect(screen.queryByLabelText('Open the microscope')).toBeNull();
    goTo('Strategy');
    // Stage 3 opens the futures desk too, and its blocks with it.
    expect(listedBlocks().sort()).toEqual([
      'Basis arbitrage',
      'Cross-exchange arbitrage',
      'Lead-lag',
      'Market maker',
      'Mean reversion',
      'Momentum',
      'News reaction',
      'Roll',
      'Stale-quote sniper',
    ]);
    goTo('Reports');
    expect(screen.getByRole('tab', { name: 'News' })).toBeInTheDocument();
    // The dark web is the sim's to unlock: at stage 3 its tab waits for the message.
    expect(screen.queryByRole('tab', { name: 'Dark web' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Lab' })).toBeNull();
    cleanup();
    const four = at([...stage2, 'maker', 'noise'], 4);
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
    // The ten stock blocks and, everything shown, the futures desk's three, the currencies desk's two and the metals
    // desk's three.
    expect(listedBlocks()).toHaveLength(18);
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
    void old.save();
    storage.data.delete(STAGES_KEY);
    const store = createStore(CONTENT, storage, 39);
    store.setTutorial({ state: 'done' });
    render(<App store={store} />);
    expect(screen.getByRole('button', { name: /^Desk/ })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    goTo('Strategy');
    expect(listedBlocks()).toHaveLength(18);
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

describe('the First week, with the desks open', () => {
  it("gives the currencies desk's four lessons a section of their own at stage 4, beside the futures desk's", () => {
    const storage = memory();
    storage.setItem(STAGES_KEY, JSON.stringify({ seen: 4 }));
    const done = ['home', 'seat', 'gap', 'race', 'cost', 'maker', 'noise'];
    storage.setItem(PROGRESS_KEY, JSON.stringify(Object.fromEntries(done.map((l) => [l, 1]))));
    const store = createStore(CONTENT, storage, 34);
    store.setTutorial({ state: 'done' });
    render(<App store={store} />);
    goTo('Reports');
    const section = screen.getByRole('region', { name: 'The currencies desk' });
    const titles = [...section.querySelectorAll('.lesson-head strong')].map((e) => e.textContent);
    expect(titles).toEqual(['Count in pips', 'Close a triangle', 'Be refused', 'Earn the rollover']);
    expect(screen.getByRole('region', { name: 'The futures desk' })).toBeInTheDocument();
  });
});

describe('Overview', () => {
  const FIVE = 5 * 60_000;
  const PINS = ['open', 'headline', 'afternoon'] as const;
  const measure = (pnl: number) => ({
    pnl,
    fills: 4,
    races: { won: 2, beaten: 1, missed: 0 },
    byExchange: {},
    byBlock: {},
    fees: 120,
  });
  /** A hand-made night: the baseline and variants, each with a P&L per window. */
  function night(day: number, results: Record<string, number[]>, extra: Partial<Night> = {}): Night {
    const ids = Object.keys(results);
    return {
      day,
      closedAt: 0,
      status: 'done',
      windowMs: FIVE,
      variants: ids.map((id) => ({
        id,
        kind: id === 'baseline' ? 'baseline' : id.startsWith('upgrade') ? 'upgrade' : 'toggle',
        label: id === 'baseline' ? 'baseline' : id,
        ...(id.startsWith('upgrade') ? { price: 1_000_000 } : {}),
        signals: [],
      })),
      pins: PINS.map((p, i) => ({ label: p, at: i })),
      runs: ids.flatMap((id) =>
        PINS.map((p, i) => ({ variantId: id, pin: p, at: i, measures: measure(results[id]![i]!) })),
      ),
      missing: [],
      setupChanged: false,
      skipped: false,
      reason: null,
      playerNote: null,
      ...extra,
    };
  }
  const seeded = (nights: Night[]) => {
    const storage = memory();
    storage.setItem(TESTS_KEY, JSON.stringify({ nights, player: null }));
    return storage;
  };
  const BIG = 50_000;

  it('opens a fresh game on the Overview: Position and Today with their reading lines and notes, and the rest to come', () => {
    const store = createStore(CONTENT, null, 41);
    store.setTutorial({ state: 'done' });
    render(<App store={store} />);
    expect(screen.getByRole('button', { name: /^Overview/ })).toHaveAttribute('aria-current', 'page');
    for (const h of ['Position', 'Today so far'])
      expect(screen.getByRole('heading', { name: h, level: 2 })).toBeInTheDocument();
    for (const h of ['Trends', 'Signals', 'Comparisons'])
      expect(screen.queryByRole('heading', { name: h, level: 2 })).toBeNull();
    expect(document.querySelectorAll('.ov-section')).toHaveLength(2);
    expect(document.querySelectorAll('.ov-section .ov-how')).toHaveLength(2);
    expect(document.querySelectorAll('.ov-section details.ov-note')).toHaveLength(2);
    expect(screen.getByText(/No day has closed yet. After the first close/)).toBeInTheDocument();
    expect(screen.getByText(/The market is closed. From the open, a point a minute/)).toBeInTheDocument();
    // The notes link the glossary, and a click opens the entry.
    expect(document.querySelectorAll('.ov-section .term').length).toBeGreaterThan(1);
    expect(screen.getByText('Setup:').parentElement?.textContent).toMatch(/Momentum/);
    // Stage 1 hides the races and the rivals.
    expect(screen.queryByText('Races won')).toBeNull();
    expect(screen.queryByText('Strategies you did not run')).toBeNull();
  });

  it("after the first close every section but Signals is there, each with its empty sub-parts' sentences", () => {
    const store = createStore(CONTENT, null, 41);
    store.setTutorial({ state: 'done' });
    store.game.days.push({
      day: 1,
      weekday: 'Mon',
      week: 1,
      pnl: 0,
      equityAtClose: 0,
      byBlock: {},
      bySymbol: {},
      races: { won: 0, beaten: 0, missed: 0 },
      fees: 0,
      fines: 0,
      headlines: [],
      latency: {},
      rivals: [],
    });
    store.game.version++;
    store.publish();
    render(<App store={store} />);
    for (const h of ['Position', 'Today so far', 'Trends', 'Comparisons'])
      expect(screen.getByRole('heading', { name: h, level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Signals', level: 2 })).toBeNull();
    expect(document.querySelectorAll('.ov-section details.ov-note')).toHaveLength(4);
    expect(screen.getByText(/Appears once a block has traded/)).toBeInTheDocument();
    expect(screen.getByText(/Tests of Tue, week 1: nothing ran/)).toBeInTheDocument();
    expect(screen.getByText('The last night ran nothing. See why above.')).toBeInTheDocument();
    expect(screen.getByText(/Once a change has been tested on more than one night/)).toBeInTheDocument();
    expect(screen.getByText('Nothing queued.')).toBeInTheDocument();
  });

  it('shows the races and the rivals once the stage shows them', () => {
    // Sections beyond Position and Today wait for a close: a stored night is one.
    const store = createStore(CONTENT, seeded([night(1, { baseline: [0, 0, 0] })]), 42);
    store.setTutorial({ state: 'done' });
    store.setReveal(true);
    render(<App store={store} />);
    expect(screen.getByText('Races won')).toBeInTheDocument();
    expect(screen.getByText('Strategies you did not run')).toBeInTheDocument();
  });

  it('shows a stored night: baseline and variants, a verdict per window, N of M windows, and mixed', () => {
    const storage = seeded([
      night(7, {
        baseline: [0, 0, 0],
        'toggle:a': [BIG, BIG, BIG],
        'toggle:b': [BIG, -BIG, 0],
        'upgrade:location:city': [BIG, BIG, BIG],
      }),
    ]);
    const store = createStore(CONTENT, storage, 43);
    store.setTutorial({ state: 'done' });
    render(<App store={store} />);
    const table = document.querySelector('.ov-compare') as HTMLElement;
    expect(table).not.toBeNull();
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(5);
    expect(within(rows[1]!).getByText('The firm as it closed')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('better in 3 of 3 windows')).toBeInTheDocument();
    expect(within(rows[2]!).getAllByText('better').length).toBeGreaterThanOrEqual(3);
    expect(
      within(rows[3]!).getByText(/^mixed: better in 1 of 3 windows, worse in 1, about the same in 1$/),
    ).toBeInTheDocument();
    expect(within(rows[3]!).getByText('worse')).toBeInTheDocument();
    // An upgrade with a price says how long it takes to pay, as an extrapolation.
    expect(screen.getByText(/pays back in/)).toBeInTheDocument();
    expect(screen.getByText(/An extrapolation/)).toBeInTheDocument();
    // The caveats the plan asks for.
    const caveats = within(document.querySelector('.ov-caveats') as HTMLElement);
    expect(caveats.getByText(/crowd answers each setup/)).toBeInTheDocument();
    expect(caveats.getByText(/dark web are left out/)).toBeInTheDocument();
    expect(screen.getByText(/Tests of Mon, week 2: done/)).toBeInTheDocument();
  });

  it('says in a sentence when nothing tested moved beyond the noise, and not when something did', () => {
    const quiet = seeded([
      night(7, { baseline: [500, 500, 500], 'toggle:a': [450, 470, 440], 'toggle:b': [520, 480, 500] }),
    ]);
    const store = createStore(CONTENT, quiet, 43);
    store.setTutorial({ state: 'done' });
    const { unmount } = render(<App store={store} />);
    expect(screen.getByText(/Nothing tested moved the result beyond the noise/)).toBeInTheDocument();
    expect(screen.getByText('about the same in 3 of 3 windows, though lower in every one')).toBeInTheDocument();
    unmount();
    const loud = seeded([night(7, { baseline: [0, 0, 0], 'toggle:a': [BIG, BIG, BIG] })]);
    const again = createStore(CONTENT, loud, 43);
    again.setTutorial({ state: 'done' });
    render(<App store={again} />);
    expect(screen.queryByText(/Nothing tested moved the result beyond the noise/)).toBeNull();
  });

  it('says why a night ran nothing, or only in part, and keeps a record over nights', () => {
    const storage = seeded([
      night(7, { baseline: [0, 0, 0], 'toggle:a': [BIG, BIG, BIG] }),
      night(8, { baseline: [0, 0, 0], 'toggle:a': [-BIG, -BIG, -BIG] }),
      night(9, { baseline: [0, 0, 0], 'toggle:a': [BIG, BIG, BIG] }, { playerNote: 'Your test: toggle:a' }),
      night(
        10,
        { baseline: [0, 0, 0], 'toggle:a': [0, 0, 0] },
        {
          runs: [],
          status: 'none',
          reason: 'No open was seen on this page for the day, so there is nothing to run.',
          setupChanged: true,
          missing: [{ pin: 'open', reason: 'A reload loses the pins.' }],
        },
      ),
    ]);
    const store = createStore(CONTENT, storage, 44);
    store.setTutorial({ state: 'done' });
    render(<App store={store} />);
    expect(screen.getByText(/nothing to run/)).toBeInTheDocument();
    expect(screen.getByText(/Open window: A reload loses the pins/)).toBeInTheDocument();
    expect(screen.getByText(/baseline is the firm as it was at the close/)).toBeInTheDocument();
    expect(screen.getByText(/The table below is from Wed, week 2/)).toBeInTheDocument();
    expect(screen.getByText(/toggle:a: better on 2 of 3 nights/)).toBeInTheDocument();
  });

  it("queues the player's own change from the form, and clears it", () => {
    const store = createStore(CONTENT, seeded([night(1, { baseline: [0, 0, 0] })]), 45);
    store.setTutorial({ state: 'done' });
    render(<App store={store} />);
    const queue = screen.getByRole('button', { name: 'Test tonight' });
    fireEvent.click(queue);
    expect(store.getTests().player).toEqual({ kind: 'toggle', block: 'momentum' });
    expect(screen.getByText(/Queued for tonight/).textContent).toMatch(/Momentum switched off/);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(store.getTests().player).toBeNull();
    // A parameter of a running block, from its own range.
    fireEvent.change(screen.getByLabelText('Change'), { target: { value: 'param' } });
    const slider = document.querySelector('.ov-fields input[type="range"]') as HTMLInputElement;
    expect(slider.min).not.toBe('');
    fireEvent.change(slider, { target: { value: slider.max } });
    fireEvent.click(screen.getByRole('button', { name: 'Test tonight' }));
    const p = store.getTests().player;
    expect(p).toMatchObject({ kind: 'param', block: 'momentum', value: Number(slider.max) });
    // An upgrade from the shop.
    fireEvent.change(screen.getByLabelText('Change'), { target: { value: 'upgrade' } });
    fireEvent.click(screen.getByRole('button', { name: 'Test tonight' }));
    expect(store.getTests().player?.kind).toBe('upgrade');
  });

  it('after a close shows yesterday, the day in the trends, and the Days tab still keeps the reports', () => {
    const store = createStore(CONTENT, null, 46, undefined, undefined, { windowMs: 3000 });
    store.setTutorial({ state: 'done' });
    render(<App store={store} />);
    act(() => {
      store.skipToOpen();
      for (let i = 0; i < (3 * 60 * 1000) / TICK_MS; i++) store.game.step();
      while (store.game.snapshot().open) store.game.step(60_000);
      store.publish();
    });
    expect(screen.getByText(/Yesterday \(Mon, week 1\)/)).toBeInTheDocument();
    expect(screen.queryByText(/No day has closed yet/)).toBeNull();
    expect(screen.getByText(/1 day; latest/)).toBeInTheDocument();
    // A closed session's minutes are kept on the page until the next open.
    expect(screen.getByText(/Showing the session that closed/)).toBeInTheDocument();
    goTo('Reports');
    fireEvent.click(screen.getByRole('tab', { name: /Days/ }));
    expect(document.querySelector('.day')).not.toBeNull();
    expect(document.querySelector('.pnl-chart')).toBeNull();
    expect(screen.getByText('By block')).toBeInTheDocument();
  }, 60_000);
});

describe('the futures desk on the page', () => {
  it('shows the index future beside the stocks once everything is shown, with its expiry, basis and margin', () => {
    const store = createStore(CONTENT, null, 50);
    store.setTutorial({ state: 'done' });
    act(() => store.setReveal(true));
    render(<App store={store} />);
    goTo('Market');
    const rows = screen.getAllByText(/^future on IDX, Fri wk \d+ 16:00$/);
    expect(rows).toHaveLength(2);
    const near = store.game.market.live('IXF')[0]!;
    fireEvent.click(screen.getByText(near));
    const line = document.querySelector('.contract-line')!;
    expect(line.textContent).toMatch(/basis \d+\.\d¢ over the index \(carry 3\.5% a year to expiry\)/);
    expect(line.textContent).toMatch(/margin \$[\d.,]+k? a contract to open, \$[\d.,]+k? to keep/);
    expect(store.game.competitors.map((c) => c.name)).toContain('Prairie Partners');
  });

  it('keeps the desk closed, its rows and its rival out, before its stage', () => {
    const store = createStore(CONTENT, null, 51);
    store.setTutorial({ state: 'done' });
    render(<App store={store} />);
    goTo('Market');
    expect(screen.queryByText(/^future on IDX/)).toBeNull();
    expect(store.game.competitors.map((c) => c.name)).not.toContain('Prairie Partners');
  });
});

describe('the currencies desk on the page', () => {
  /** Everything shown, so the desk is open, a few seconds into the morning so the pairs have prices. */
  function freePlay(seed: number) {
    const store = createStore(CONTENT, null, seed);
    store.setTutorial({ state: 'done' });
    act(() => store.setReveal(true));
    act(() => {
      store.skipToOpen();
      for (let i = 0; i < 70_000 / TICK_MS; i++) store.game.step();
      store.publish();
    });
    return store;
  }
  const row = (symbol: string) =>
    [...document.querySelectorAll('.watchlist tbody tr')].find(
      (r) => r.querySelector('strong')?.textContent === symbol,
    )!;

  it('lists each pair with what it is and its price to its own places, and the picked pair throughout', () => {
    const store = freePlay(70);
    render(<App store={store} />);
    goTo('Market');
    const eurusd = row('EURUSD');
    expect(eurusd.querySelector('.col-sector')!.textContent).toBe('euro in dollars');
    expect(eurusd.querySelector('.bid')!.textContent).toMatch(/^1\.0\d{3}$/);
    expect(eurusd.querySelector('.ask')!.textContent).toMatch(/^1\.0\d{3}$/);
    expect(eurusd.lastElementChild!.textContent).toMatch(/^(—|[+-]\d\.\d{4})$/);
    expect(row('USDJPY').querySelector('.bid')!.textContent).toMatch(/^1\d\d\.\d\d$/);
    expect(row('EURJPY').querySelector('.col-sector')!.textContent).toBe('cross of EUR/USD and USD/JPY');
    fireEvent.click(eurusd);
    const head = document.querySelector('.stock-head')!;
    expect(head.textContent).toMatch(/fair 1\.0\d{3}/);
    expect(head.textContent).toMatch(/currency pair/);
    const quotes = [...document.querySelectorAll('.quotes tbody tr')];
    expect(quotes.length).toBe(2);
    for (const q of quotes) expect(q.querySelector('.bid')!.textContent).toMatch(/^(—|1\.0\d{3})$/);
    expect(document.querySelector('.quotes tbody .col-spread')!.textContent).toMatch(/^(—|\d+ pips?)$/);
  }, 60_000);

  it("shows the firm's balances by currency, each with its dollar value, in the Overview and the firm panel", () => {
    const store = freePlay(71);
    act(() => {
      store.game.firm.balances.set('EUR', 123_456);
      store.game.firm.balances.set('JPY', -50_000);
      store.game.step();
      store.publish();
    });
    const s = store.getSnapshot();
    const dollars = (c: string) => s.balances.find((b) => b.currency === c)!.dollars;
    render(<App store={store} />);
    const ov = document.querySelector('.ov-balances')!;
    expect(ov.textContent).toContain('EUR 1,234.56');
    expect(ov.textContent).toContain(`(${money(dollars('EUR'))})`);
    expect(ov.textContent).toContain('JPY -50,000');
    expect(ov.textContent).toContain(`(${money(dollars('JPY'))})`);
    goTo('Market');
    const firm = document.querySelector('.firm .balances')!;
    expect(firm.textContent).toContain('EUR 1,234.56');
    expect(firm.textContent).toContain(money(dollars('JPY')));
  }, 60_000);

  it('reads a refused order as refused in the orders list and its race', () => {
    const store = createStore(CONTENT, null, 72);
    store.publish();
    const base = store.getSnapshot();
    const s: Snapshot = {
      ...base,
      orders: [
        {
          localId: 1,
          exchange: 'ASHFORD',
          exchangeOrderId: 1,
          symbol: 'EURUSD',
          side: 'buy',
          price: 10853,
          size: 2,
          filled: 0,
          ioc: true,
          status: 'refused',
          reason: 'refused by the dealer after 5 ms',
          block: 'triangle',
          sentAt: 1000,
          seenAt: 900,
          arrivedAt: 1035,
          ackAt: 1075,
          beatenBy: [],
          fee: 0,
          realised: 0,
          avgFill: null,
          slippage: null,
        },
      ],
    };
    render(<FirmPanel s={s} />);
    const li = document.querySelector('.orders li')!;
    expect(li.querySelector('.order-line')!.textContent).toMatch(/· refused/);
    expect(li.querySelector('.race-words')!.textContent).toContain('Refused by the dealer after 5 ms.');
  });

  it("offers the triangle's venue as a choice, and sets it", () => {
    const store = freePlay(73);
    render(<App store={store} />);
    goTo('Strategy');
    const venue = screen.getByLabelText<HTMLSelectElement>('Triangular arbitrage Venue');
    expect(venue.tagName).toBe('SELECT');
    expect([...venue.options].map((o) => o.textContent)).toEqual(['the book', 'the dealer']);
    fireEvent.change(venue, { target: { value: '1' } });
    expect(store.game.firm.blocks.find((b) => b.id === 'triangle')!.params.venue).toBe(1);
    // A numeric parameter stays a slider.
    expect(screen.getByLabelText<HTMLInputElement>('Triangular arbitrage Minimum gap').type).toBe('range');
  }, 60_000);

  it('opens the desk at stage 4, its pairs and its two blocks, and not at stage 3', () => {
    const at = (lessons: string[], seen: number) => {
      const storage = memory();
      storage.setItem(STAGES_KEY, JSON.stringify({ seen }));
      storage.setItem(PROGRESS_KEY, JSON.stringify(Object.fromEntries(lessons.map((l) => [l, 1]))));
      const store = createStore(CONTENT, storage, 74);
      store.setTutorial({ state: 'done' });
      return store;
    };
    const stage2 = ['home', 'seat', 'gap', 'race', 'cost'];
    render(<App store={at(stage2, 3)} />);
    goTo('Market');
    expect(screen.queryByText('EURUSD')).toBeNull();
    goTo('Strategy');
    expect(listedBlocks()).not.toContain('Triangular arbitrage');
    cleanup();
    const four = at([...stage2, 'maker', 'noise'], 4);
    render(<App store={four} />);
    goTo('Market');
    expect(screen.getByText('EURUSD')).toBeInTheDocument();
    goTo('Strategy');
    expect(listedBlocks()).toEqual(expect.arrayContaining(['Triangular arbitrage', 'Carry']));
    expect(four.game.competitors.map((c) => c.name)).toContain('Kestrel Currency');
  }, 60_000);

  it('writes the rollover and the currencies desk into the day report', () => {
    const store = createStore(CONTENT, null, 75);
    store.setTutorial({ state: 'done' });
    act(() => {
      store.game.days.push({
        day: 0,
        week: 1,
        weekday: 'Mon',
        pnl: 1000,
        equityAtClose: 1000,
        byBlock: {},
        bySymbol: {},
        races: { won: 0, beaten: 0, missed: 0 },
        fees: 0,
        fines: 0,
        headlines: [],
        latency: {},
        rivals: [],
        byDesk: { stocks: { fills: 1, realised: 0, fees: 1 }, fx: { fills: 3, realised: 0, fees: 1 } },
        rollover: 49,
      });
      store.game.step();
      store.publish();
    });
    render(<App store={store} />);
    goTo('Reports');
    fireEvent.click(screen.getByRole('tab', { name: /^Days/ }));
    const report = document.querySelector('.report')!;
    expect(report.textContent).toContain('Currencies');
    expect(report.querySelector('.rollover')!.textContent).toMatch(/Rollover.*\+\$0\.49/);
  });
});

describe('the currencies desk in the glossary', () => {
  it('has an entry, short and long, for each concept the desk shows', () => {
    for (const id of [
      'currency-pair',
      'base-quote',
      'pip',
      'lot',
      'cross-rate',
      'triangular-arbitrage',
      'dealer',
      'last-look',
      'rollover',
      'home-currency',
    ]) {
      const g = glossary(id);
      expect(g, id).toBeDefined();
      expect(g!.short.length).toBeGreaterThan(10);
      expect(g!.long.length).toBeGreaterThan(100);
    }
    expect(glossary('carry')!.long).toMatch(/currency/);
  });
});

describe('the metals desk on the page', () => {
  const H = 3_600_000;
  const IN_CALL = 9 * H + 59 * 60_000 + 40_000;
  const AFTER_FIX = 10 * H + 5_000;
  const stores = new Map<number, ReturnType<typeof createStore>>();
  /** Free play (every desk open), stepped from the start to `at` on Monday: a second at a time, the last minute a tick at a time. */
  function metalsAt(at: number) {
    const cached = stores.get(at);
    if (cached) return cached;
    const store = createStore(CONTENT, null, 60);
    store.setTutorial({ state: 'done' });
    act(() => store.setReveal(true));
    act(() => {
      while (store.game.now < at - 60_000) store.game.step(1000);
      while (store.game.now < at) store.game.step();
      store.publish();
    });
    stores.set(at, store);
    return store;
  }
  const row = (symbol: string) =>
    [...document.querySelectorAll('.watchlist tbody tr')].find(
      (r) => r.querySelector('strong')?.textContent === symbol,
    )!;
  const terms = (el: Element) => [...el.querySelectorAll('button.term')].map((b) => b.textContent);

  it('writes gold in its ten-cent points to the cent, as money in words, and the limit box steps a point', () => {
    expect(price(24001, 1)).toBe('2400.10');
    expect(dollarPrice(24001, 1)).toBe('$2,400.10');
    expect(price(4512, 2)).toBe('45.12');
    expect(priceStep(1)).toBe(0.1);
    expect(pointsFrom('2400.10', 1)).toBe(24001);
    const store = metalsAt(IN_CALL);
    render(<App store={store} />);
    goTo('Market');
    expect(row('XAU').querySelector('.bid')!.textContent).toMatch(/^2\d{3}\.\d0$/);
    expect(row('XAG').querySelector('.bid')!.textContent).toMatch(/^\d\d\.\d\d$/);
    cleanup();
    const s = store.getSnapshot();
    const only: Snapshot = { ...s, stocks: s.stocks.map((st) => ({ ...st, watched: st.symbol === 'XAU' })) };
    render(<DeskPanel s={only} store={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Limit' }));
    expect(screen.getByLabelText<HTMLInputElement>('Limit price').step).toBe('0.1');
  }, 60_000);

  it('draws the curve for a metal and its futures, spot and three expiries, and names contango in words', () => {
    const store = metalsAt(IN_CALL);
    render(<App store={store} />);
    goTo('Market');
    fireEvent.click(row('XAU'));
    const curve = document.querySelector('.curve')!;
    expect(curve).not.toBeNull();
    expect(curve.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(curve.textContent).toMatch(/Contango/);
    expect(terms(curve)).toEqual(expect.arrayContaining(['futures curve', 'spot', 'Contango', 'lease', 'storage']));
    const near = store.game.market.live('GC')[0]!;
    fireEvent.click(row(near));
    expect(document.querySelector('.curve')!.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(document.querySelector('.contract-line')!.textContent).toMatch(/delivered as XAU/);
    expect(terms(document.querySelector('.contract-line')!)).toContain('delivered');
  }, 60_000);

  it('names backwardation when the later dates are cheaper, and keeps the same room', () => {
    const store = metalsAt(IN_CALL);
    const s = store.getSnapshot();
    const spot = s.stocks.find((x) => x.symbol === 'XAU')!;
    const mid = Math.round(((spot.bid ?? spot.fair) + (spot.ask ?? spot.fair)) / 2);
    const futures = s.stocks
      .filter((x) => x.contract?.underlying === 'XAU')
      .sort((a, b) => a.contract!.expiry - b.contract!.expiry);
    const flipped: Snapshot = {
      ...s,
      stocks: s.stocks.map((x) => {
        const i = futures.findIndex((f) => f.symbol === x.symbol);
        if (i < 0) return x;
        const p = mid - 40 * (i + 1);
        return { ...x, bid: p - 1, ask: p + 1 };
      }),
    };
    render(<MarketPanel s={flipped} store={store} picked="XAU" onPick={() => undefined} />);
    const curve = document.querySelector('.curve')!;
    expect(curve.textContent).toMatch(/Backwardation/);
    expect(curve.textContent).not.toMatch(/Contango/);
    expect(curve.querySelectorAll('tbody tr')).toHaveLength(4);
  }, 60_000);

  it("says the fix is running, the seconds left and the indicative as the firm sees it, during Thamesford's call", () => {
    const store = metalsAt(IN_CALL);
    render(<App store={store} />);
    goTo('Market');
    fireEvent.click(row('XAU'));
    const line = document.querySelector('.fix-line')!;
    expect(line.textContent).toMatch(/^In the fix: 20 s, indicative (\$2,\d{3}\.\d0|not crossed yet)/);
    expect(terms(line)).toEqual(expect.arrayContaining(['In the fix', 'indicative']));
    const seen = store
      .getSnapshot()
      .stocks.find((x) => x.symbol === 'XAU')!
      .exchanges.find((e) => e.id === 'THAMESFORD')!.seen!.indicative;
    expect(seen).toBeDefined();
    if (seen!.price !== null) expect(line.textContent).toContain(money(seen!.price * 10));
  }, 60_000);

  it("lists the day's fixes from the venue's log after the call, with no fix said so", () => {
    const store = metalsAt(AFTER_FIX);
    render(<App store={store} />);
    goTo('Market');
    fireEvent.click(row('XAU'));
    const line = document.querySelector('.fix-line')!;
    const fix = store.game.market.exchanges.find((e) => e.id === 'THAMESFORD')!.fixes.find((f) => f.symbol === 'XAU')!;
    expect(fix).toBeDefined();
    expect(line.textContent).toMatch(/^Fixes today: 10:00 /);
    expect(line.textContent).toContain(fix.price === null ? 'no fix' : money(fix.price * 10));
    cleanup();
    const s = store.getSnapshot();
    const none: Snapshot = {
      ...s,
      exchanges: s.exchanges.map((e) =>
        e.id === 'THAMESFORD' ? { ...e, fixes: [{ at: fix.at, symbol: 'XAU', price: null, volume: 0 }] } : e,
      ),
    };
    render(<MarketPanel s={none} store={store} picked="XAU" onPick={() => undefined} />);
    expect(document.querySelector('.fix-line')!.textContent).toMatch(/^Fixes today: 10:00 no fix/);
  }, 60_000);

  it("puts the metals desk's supply headlines in the snapshot and the News tab, labelled as the desk's", () => {
    const store = createStore(CONTENT, null, 60);
    store.setTutorial({ state: 'done' });
    act(() => store.setReveal(true));
    const published = () => store.game.deskNews.flatMap((n) => n.published);
    act(() => {
      while (published().length === 0 && store.game.now < 3 * 24 * H) store.game.step(1000);
      store.publish();
    });
    const s = store.getSnapshot();
    expect(published().length).toBeGreaterThan(0);
    expect(s.deskNews.map((h) => h.text)).toEqual(published().map((h) => h.text));
    expect(s.deskNews.every((h) => h.desk === 'metals')).toBe(true);
    render(<NewsPanel s={s} />);
    const real = [...document.querySelectorAll('.headline')].find((l) => l.textContent.includes(s.deskNews[0]!.text))!;
    expect(real.textContent).toContain('Metals desk');
    cleanup();
    const base: Snapshot = {
      ...s,
      deskNews: [
        {
          id: 1,
          at: s.now - 120_000,
          text: 'Fire at a gold refinery: deliveries held for 3 days',
          symbols: ['XAU'],
          sector: 'precious',
          direction: 1,
          moves: { XAU: 12 },
          priceInMs: 45_000,
          noise: false,
          midsAt: { XAU: 24000 },
          desk: 'metals',
        },
      ],
    };
    render(<NewsPanel s={base} />);
    const li = [...document.querySelectorAll('.headline')].find((l) => l.textContent.includes('refinery'))!;
    expect(li.textContent).toContain('Metals desk');
    expect(li.textContent).toContain('XAU +$1.20');
  }, 60_000);

  it('writes storage and the lease into the day report, and the metals desk as a row of By desk', () => {
    const store = createStore(CONTENT, null, 76);
    store.setTutorial({ state: 'done' });
    act(() => {
      store.game.days.push({
        day: 0,
        week: 1,
        weekday: 'Mon',
        pnl: 1000,
        equityAtClose: 1000,
        byBlock: {},
        bySymbol: {},
        races: { won: 0, beaten: 0, missed: 0 },
        fees: 0,
        fines: 0,
        headlines: [],
        latency: {},
        rivals: [],
        byDesk: { stocks: { fills: 1, realised: 0, fees: 1 }, metals: { fills: 2, realised: 500, fees: 3 } },
        storage: -1234,
      });
      store.game.step();
      store.publish();
    });
    render(<App store={store} />);
    goTo('Reports');
    fireEvent.click(screen.getByRole('tab', { name: /^Days/ }));
    const report = document.querySelector('.report')!;
    expect(report.querySelector('.storage')!.textContent).toMatch(/Storage and the lease at 17:00.*-\$12\.34/);
    expect(terms(report.querySelector('.storage')!)).toEqual(expect.arrayContaining(['Storage', 'lease']));
    const metals = [...report.querySelectorAll('.by-desk tbody tr')].find(
      (r) => r.firstElementChild!.textContent === 'Metals',
    )!;
    expect(metals).toBeDefined();
    expect(metals.textContent).toContain('-$12.34');
    // Net is what the fills made less the fees and the night's storage: $5.00 − $0.03 − $12.34.
    expect(metals.lastElementChild!.textContent).toBe('-$7.37');
  });

  it('shows a metal held as ounces, and what it costs a night: storage long, the lease short', () => {
    const store = metalsAt(IN_CALL);
    const s = store.getSnapshot();
    const held: Snapshot = {
      ...s,
      positions: [
        { symbol: 'XAU', qty: 2, avgCost: 24001, mark: 24003, unrealised: 400, decimals: 1 },
        { symbol: 'XAG', qty: -1, avgCost: 3000, mark: 2999, unrealised: 500, decimals: 2 },
      ],
    };
    render(<FirmPanel s={held} />);
    const rows = [...document.querySelectorAll('.positions tr')];
    expect(rows[0]!.textContent).toMatch(/XAU.*20 oz.*storage/);
    expect(rows[0]!.textContent).toContain('@ 2400.10');
    expect(rows[1]!.textContent).toMatch(/XAG.*500 oz short.*lease/);
    expect(terms(rows[0]!)).toContain('storage');
    expect(terms(rows[1]!)).toContain('lease');
  }, 60_000);

  it('names the desk Metals, opens it at the last stage with its blocks, and links each block to the glossary', () => {
    expect(DESK_NAMES.metals).toBe('Metals');
    const store = metalsAt(IN_CALL);
    render(<App store={store} />);
    goTo('Strategy');
    expect(listedBlocks()).toEqual(expect.arrayContaining(['Calendar spread', 'Fix arbitrage', 'Pairs across desks']));
    const linked = [...document.querySelectorAll('.strategy summary strong button.term')].map((b) => b.textContent);
    for (const name of ['Calendar spread', 'Fix arbitrage', 'Pairs across desks']) expect(linked).toContain(name);
  }, 60_000);

  it('links the miner and the gold-silver ratio where they are shown', () => {
    const store = metalsAt(IN_CALL);
    render(<App store={store} />);
    goTo('Market');
    fireEvent.click(row('RDG'));
    expect(terms(document.querySelector('.stock-head')!)).toContain('miner');
    fireEvent.click(row('XAG'));
    const head = document.querySelector('.stock-head')!;
    expect(head.textContent).toMatch(/gold-silver ratio \d+\.\d/);
    expect(terms(head)).toContain('gold-silver ratio');
  }, 60_000);
});

describe('the metals desk in the glossary', () => {
  it('has an entry, short and long, for each concept the desk shows', () => {
    for (const id of [
      'spot',
      'futures-curve',
      'contango',
      'backwardation',
      'lease-rate',
      'storage',
      'delivery',
      'fix',
      'call-auction',
      'uncrossing-price',
      'gold-silver-ratio',
      'miner',
    ]) {
      const g = glossary(id);
      expect(g, id).toBeDefined();
      expect(g!.short.length).toBeGreaterThan(10);
      expect(g!.long.length).toBeGreaterThan(100);
    }
    expect(glossary('delivery')!.long).toMatch(/storage/);
  });
});

describe('Part A: learning, on the page', () => {
  const report = (n: number, extra: Partial<DayReport> = {}): DayReport => ({
    day: n,
    weekday: 'Mon',
    week: 1,
    pnl: 0,
    equityAtClose: 0,
    byBlock: {},
    bySymbol: {},
    races: { won: 0, beaten: 0, missed: 0 },
    fees: 0,
    fines: 0,
    headlines: [],
    latency: {},
    rivals: [],
    ...extra,
  });
  /** A closed day written straight into the game, so the page reads a report without a day being played. */
  function withDay(store: ReturnType<typeof createStore>, d: DayReport) {
    act(() => {
      store.game.days.push(d);
      store.game.version++;
      store.publish();
    });
  }
  const sections = () => [...document.querySelectorAll('.ov-section h2')].map((h) => h.textContent);
  const freeStore = (seed: number) => {
    const store = createStore(CONTENT, null, seed);
    store.setTutorial({ state: 'done' });
    act(() => store.setReveal(true));
    return store;
  };

  it('1: the Overview opens on Position and Today, with a line on what comes, and grows at the first close', () => {
    const store = createStore(CONTENT, null, 141);
    store.setTutorial({ state: 'done' });
    render(<App store={store} />);
    expect(sections()).toEqual(['Position', 'Today so far']);
    expect(document.querySelector('.ov-coming')!.textContent).toMatch(/first close/);
    withDay(store, report(1, { pnl: 500 }));
    expect(sections()).toEqual(['Position', 'Today so far', 'Trends', 'Comparisons']);
    expect(document.querySelector('.ov-coming')!.textContent).toMatch(/Signals/);
    expect(document.querySelector('.ov-coming')!.textContent).not.toMatch(/first close/);
  });

  it('1: Free play opens the same way', () => {
    const store = freeStore(142);
    render(<App store={store} />);
    expect(sections()).toEqual(['Position', 'Today so far']);
  });

  it('2: the current lesson has a Take me there button that goes to its page and outlines its target', () => {
    const storage = memory();
    storage.setItem(PROGRESS_KEY, JSON.stringify({ home: 1 }));
    const store = createStore(CONTENT, storage, 143);
    store.setTutorial({ state: 'done' });
    render(<App store={store} />);
    goTo('Reports');
    const buttons = screen.getAllByRole('button', { name: 'Take me there' });
    // Only the current lesson has one.
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);
    expect(screen.getByRole('button', { name: /^Strategy/ })).toHaveAttribute('aria-current', 'page');
    expect(document.querySelector('[data-tut="shop"]')!.classList.contains('tut-target')).toBe(true);
  });

  it('2: a lesson of a tab opens that tab', () => {
    const storage = memory();
    storage.setItem(STAGES_KEY, JSON.stringify({ seen: 3 }));
    const done = ['home', 'seat', 'gap', 'race', 'cost', 'maker'];
    storage.setItem(PROGRESS_KEY, JSON.stringify(Object.fromEntries(done.map((l) => [l, 1]))));
    const store = createStore(CONTENT, storage, 144);
    store.setTutorial({ state: 'done' });
    render(<App store={store} />);
    goTo('Strategy');
    fireEvent.click(screen.getByRole('button', { name: /^First week/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Take me there' }));
    expect(screen.getByRole('tab', { name: /^News/ })).toHaveAttribute('aria-selected', 'true');
    expect(document.querySelector('[data-tut="tabs"]')!.classList.contains('tut-target')).toBe(true);
  });

  it('2: no button where the lesson goes to a page that is not shown, and the go it is given where it is', () => {
    const progress = { home: 1 };
    const go = vi.fn();
    const store = createStore(CONTENT, null, 145);
    const lesson: Lesson = LESSONS.find((l) => l.id === 'seat')!;
    const { unmount } = render(
      <GoContext.Provider value={{ go, can: () => false }}>
        <FirstWeekPanel progress={progress} store={store} />
      </GoContext.Provider>,
    );
    expect(screen.queryByRole('button', { name: 'Take me there' })).toBeNull();
    unmount();
    render(
      <GoContext.Provider value={{ go, can: () => true }}>
        <FirstWeekPanel progress={progress} store={store} />
      </GoContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Take me there' }));
    expect(go).toHaveBeenCalledWith(lesson.go);
  });

  it('2: every lesson goes to a target that is on its page, with everything shown', () => {
    const store = freeStore(146);
    act(() => {
      store.skipToOpen();
      store.publish();
    });
    render(<App store={store} />);
    const names = new Map([
      ['overview', 'Overview'],
      ['market', 'Market'],
      ['desk', 'Desk'],
      ['strategy', 'Strategy'],
      ['reports', 'Reports'],
    ] as const);
    for (const l of LESSONS) {
      const nav = document.querySelector('nav.pages')!;
      fireEvent.click(
        within(nav as HTMLElement).getByRole('button', { name: new RegExp(`^${names.get(l.go!.page)}`) }),
      );
      if (l.go!.tab) fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${tabLabel(l.go!.tab)}`) }));
      if (l.go!.target) expect(document.querySelector(`[data-tut="${l.go!.target}"]`), l.id).not.toBeNull();
    }
  }, 60_000);

  it("3: a block's card says no record yet before the first close, then days, net, fees and why", () => {
    const store = createStore(CONTENT, null, 147);
    store.setTutorial({ state: 'done' });
    render(<App store={store} />);
    goTo('Strategy');
    const rec = () => document.querySelector('.block.running .block-record')!.textContent;
    expect(rec()).toMatch(/No record yet/);
    withDay(store, report(1, { byBlock: { momentum: { fills: 6, realised: 100, fees: 400 } } }));
    expect(rec()).toMatch(/1 day traded/);
    expect(rec()).toContain('-$3.00');
    expect(rec()).toContain('$4.00');
    expect(rec()).toMatch(/fees take/i);
  });

  it('3: a block that has not traded says so after a close', () => {
    const store = createStore(CONTENT, null, 148);
    store.setTutorial({ state: 'done' });
    render(<App store={store} />);
    goTo('Strategy');
    withDay(store, report(1));
    expect(document.querySelector('.block.running .block-record')!.textContent).toMatch(/not traded/);
  });

  it('4: each day opens on why it lost or earned, and the Overview joins it to yesterday', () => {
    const store = createStore(CONTENT, null, 149);
    store.setTutorial({ state: 'done' });
    withDay(store, report(1, { pnl: -900, fees: 700 }));
    render(<App store={store} />);
    expect(screen.getByText(/Yesterday \(Mon, week 1\)/).parentElement!.textContent).toMatch(/Fees took \$7\.00/);
    goTo('Reports');
    fireEvent.click(screen.getByRole('tab', { name: /Days/ }));
    expect(document.querySelector('.report .day-cause')!.textContent).toMatch(/Fees took \$7\.00/);
    expect(document.querySelector('.report')!.firstElementChild!.classList.contains('day-cause')).toBe(true);
  });

  it('5: with one desk the watchlist is one table body, with several one a desk under a heading', () => {
    const one = createStore(CONTENT, null, 150);
    one.setTutorial({ state: 'done' });
    const { unmount } = render(<App store={one} />);
    goTo('Market');
    expect(document.querySelectorAll('.watchlist tbody')).toHaveLength(1);
    expect(document.querySelector('.watchlist .desk-row')).toBeNull();
    unmount();
    const store = freeStore(151);
    render(<App store={store} />);
    goTo('Market');
    const bodies = [...document.querySelectorAll('.watchlist tbody')];
    expect(bodies).toHaveLength(4);
    expect(bodies.map((b) => b.querySelector('.desk-row')?.textContent)).toEqual([
      DESK_NAMES.stocks,
      DESK_NAMES.futures,
      DESK_NAMES.fx,
      DESK_NAMES.metals,
    ]);
    // The pair sits under Currencies.
    expect(bodies[2]!.textContent).toContain('EURUSD');
    expect(bodies[0]!.textContent).not.toContain('EURUSD');
  });

  it("5: the races table lists the stocks' venues, and another desk's once it has had an order today", () => {
    const store = freeStore(152);
    act(() => {
      store.skipToOpen();
      store.publish();
    });
    render(<App store={store} />);
    goTo('Market');
    const venues = () =>
      [...document.querySelectorAll('.scorecard tbody tr')].map((r) => r.firstElementChild!.textContent.trim());
    expect(venues()).toEqual(
      store
        .getSnapshot()
        .exchanges.filter((e) => e.desk === 'stocks')
        .map((e) => e.id),
    );
    expect(venues()).not.toContain('PRAIRIE');
  });

  it('6: a currency shows once it is non-zero, in the Overview and the firm panel, and not before', () => {
    const store = freeStore(153);
    render(<App store={store} />);
    expect(document.querySelector('.ov-balances')).toBeNull();
    goTo('Market');
    expect(document.querySelector('.firm .balances')).toBeNull();
    act(() => {
      store.game.firm.balances.set('EUR', 100_000);
      store.game.version++;
      store.publish();
    });
    expect(document.querySelector('.firm .balances')!.textContent).toContain('EUR');
    expect(document.querySelector('.firm .balances')!.textContent).not.toContain('JPY');
    goTo('Overview');
    expect(document.querySelector('.ov-balances')!.textContent).toContain('EUR');
  });

  it('6: a day report with fills on the currencies desk shows every currency', () => {
    const store = freeStore(154);
    withDay(store, report(1, { byDesk: { fx: { fills: 3, realised: 0, fees: 0 } } }));
    render(<App store={store} />);
    const text = document.querySelector('.ov-balances')!.textContent;
    expect(text).toContain('EUR');
    expect(text).toContain('JPY');
  });

  it('7: the shop writes before and after for the venues traded, and folds the rest into a details', () => {
    const store = createStore(CONTENT, null, 155);
    store.setTutorial({ state: 'done' });
    const { unmount } = render(<App store={store} />);
    goTo('Strategy');
    const li = screen.getByText('Colocation at HARBOR').closest('li')!;
    expect(li.querySelector('.offer-traded')!.textContent).toMatch(/HARBOR \S+ → \S+/);
    unmount();
    const free = freeStore(156);
    render(<App store={free} />);
    goTo('Strategy');
    const offer = screen.getByText('Colocation at HARBOR').closest('li')!;
    expect(offer.querySelector('.offer-traded')!.textContent).not.toContain('PRAIRIE');
    expect(offer.querySelector('details.offer-rest')!.textContent).toContain('PRAIRIE');
  });
});

describe('Part B: rivals as characters, on the page', () => {
  const report = (n: number, extra: Partial<DayReport> = {}): DayReport => ({
    day: n,
    weekday: 'Mon',
    week: 1,
    pnl: -3000,
    equityAtClose: 0,
    byBlock: {},
    bySymbol: {},
    races: { won: 0, beaten: 0, missed: 0 },
    fees: 100,
    fines: 0,
    headlines: [],
    latency: {},
    rivals: [],
    ...extra,
  });
  const storeWith = (seed: number, d: DayReport) => {
    const store = createStore(CONTENT, null, seed);
    store.setTutorial({ state: 'done' });
    store.setReveal(true);
    act(() => {
      store.game.days.push(d);
      store.game.version++;
      store.publish();
    });
    return store;
  };

  it('writes a sentence a rival in the day report, linked to its glossary entry, and the cause names a rival', () => {
    const store = storeWith(
      151,
      report(1, {
        takenBy: { 'Harbor Quant': { count: 14, cents: 31_000 } },
        beatenBy: { 'Harbor Quant': { count: 22, medianMs: 0.4 } },
        pnl: -40_000,
      }),
    );
    render(<App store={store} />);
    goTo('Reports');
    fireEvent.click(screen.getByRole('tab', { name: /^Days/ }));
    expect(
      screen.getByText(
        /Harbor Quant took 14 quotes off you, worth \$310.00, and beat you to 22 orders by a median 400µs\./,
      ),
    ).toBeInTheDocument();
    expect(document.querySelector('.day-cause')!.textContent).toMatch(
      /Harbor Quant took quotes off you worth \$310.00/,
    );
  });

  it('shows each rival on the Rivals tab with what it runs, where it sits and what it took', () => {
    const store = storeWith(152, report(1, { takenBy: { 'Harbor Quant': { count: 3, cents: 700 } } }));
    render(<App store={store} />);
    goTo('Reports');
    fireEvent.click(screen.getByRole('tab', { name: 'Rivals' }));
    const table = document.querySelector('.rival-cards') as HTMLElement;
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(1 + store.game.competitors.length);
    const harbor = within(table).getByText('Harbor Quant').closest('tr')!;
    expect(harbor).toHaveTextContent('Cross-exchange arbitrage');
    expect(harbor).toHaveTextContent('3 quotes');
    expect(within(table).queryByText('the crowd')).toBeNull();
  });
});

function tabLabel(tab: string): string {
  return {
    week: 'First week',
    days: 'Days',
    news: 'News',
    dark: 'Dark web',
    rivals: 'Rivals',
    lab: 'Lab',
    learn: 'Learn',
  }[tab]!;
}

describe('Part C: moments marked, on the page', () => {
  const told = (store: ReturnType<typeof createStore>, e: GameEventLike) => {
    act(() => {
      (store.game as unknown as { emit(e: GameEventLike): void }).emit(e);
      store.game.version++;
      store.publish();
    });
  };
  type GameEventLike = { kind: string; at: number } & Record<string, unknown>;
  const everything = (seed = 3) => {
    const store = createStore(CONTENT, null, seed);
    store.setTutorial({ state: 'done' });
    store.setReveal(true);
    return store;
  };
  const line = () => screen.getByRole('group', { name: 'Something just happened' });

  it('shows an event as one line with its figure, a glossary term and a link that takes you there', () => {
    const store = everything();
    render(<App store={store} />);
    expect(line().textContent).toBe('');
    told(store, { kind: 'halt', at: store.game.now + 1, reason: 'down $5,000 on the day', until: store.game.now + 9 });
    expect(line()).toHaveTextContent('Halted: down $5,000 on the day');
    expect(within(line()).getByRole('button', { name: 'Risk limits' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Risk limits' })).toBeNull();
    fireEvent.click(within(line()).getByRole('button', { name: 'Show me' }));
    // The halt's place is the Strategy page, with the risk panel outlined.
    expect(document.querySelector('[data-tut="risk"]')).not.toBeNull();
    expect(document.querySelector('[data-tut="risk"]')).toHaveClass('tut-target');
  });

  it('keeps its slot through a moment and without one, and is polite to a reader', () => {
    const store = everything();
    render(<App store={store} />);
    const slot = line();
    expect(slot).toHaveAttribute('aria-live', 'polite');
    expect(slot.className).toContain('moments');
    told(store, { kind: 'margin', at: store.game.now + 1, symbols: ['GCZ'] });
    expect(line()).toBe(slot);
  });

  it('does not mark a delivery at a stage that hides the metals desk, nor replay what came before the page', () => {
    const store = createStore(CONTENT, null, 3);
    store.setTutorial({ state: 'done' });
    const before = store.game.now;
    told(store, { kind: 'halt', at: before, reason: 'old', until: before + 1 });
    render(<App store={store} />);
    expect(line().textContent).toBe('');
    told(store, { kind: 'delivery', at: store.game.now + 1, symbol: 'XAU', units: 2, value: 100_00 });
    expect(line().textContent).toBe('');
    told(store, { kind: 'halt', at: store.game.now + 2, reason: 'new', until: store.game.now + 9 });
    expect(line()).toHaveTextContent('Halted: new');
  });

  it('puts the line away after its hold, in wall time', () => {
    vi.useFakeTimers();
    try {
      const store = everything();
      render(<App store={store} />);
      told(store, { kind: 'unlock', at: store.game.now + 1, what: 'darkweb' });
      expect(line()).toHaveTextContent('The dark web is open');
      act(() => {
        vi.advanceTimersByTime(7000);
      });
      expect(line().textContent).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Part D: watch mode, on the page', () => {
  const setup = () => {
    const store = createStore(CONTENT, null, 3);
    store.setTutorial({ state: 'done' });
    store.setReveal(true);
    return store;
  };

  it('has a watch button that is pressed while watching, and the others are not', () => {
    const store = setup();
    render(<App store={store} />);
    const button = screen.getByRole('button', { name: 'watch' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(store.getWatching()).toBe(true);
    expect(screen.getByRole('button', { name: 'watch' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '300×' })).not.toHaveClass('on');
    fireEvent.click(screen.getByRole('button', { name: '10×' }));
    expect(store.getWatching()).toBe(false);
    expect(screen.getByRole('button', { name: 'watch' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('says what is next and how far off, keeps its slot, and says what is watched when slow', () => {
    const store = setup();
    render(<App store={store} />);
    const slot = screen.getByTestId('watching');
    expect(slot.textContent.trim()).toBe('');
    act(() => store.setWatching(true));
    expect(screen.getByTestId('watching')).toBe(slot);
    expect(slot).toHaveTextContent(/^The open in /);
    // Two seconds before the open: the lead.
    act(() => {
      while (store.game.now < MARKET_OPEN - 2000)
        store.game.step(Math.min(60_000, MARKET_OPEN - 2000 - store.game.now));
      store.publish();
    });
    expect(slot).toHaveTextContent('Watching: the open');
    // A headline's tail, later in the day.
    act(() => {
      store.game.step(60_000 * 20);
      (store.game as unknown as { emit(e: object): void }).emit({
        kind: 'news',
        at: store.game.now,
        headline: { id: 'x', at: store.game.now, text: 'x' },
      });
      store.game.version++;
      store.publish();
    });
    expect(slot).toHaveTextContent('Watching: a headline');
  });
});
