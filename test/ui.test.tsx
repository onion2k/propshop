// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CONTENT } from '../src/content';
import { TICK_MS } from '../src/sim';
import { App } from '../src/ui/App';
import { createStore, PROGRESS_KEY, SAVE_KEY, type Storage } from '../src/ui/store';

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
    render(<App store={store} />);
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

  it('opens the glossary at a term when one is clicked', () => {
    const store = createStore(CONTENT, null, 4);
    render(<App store={store} />);
    fireEvent.click(screen.getAllByText('fair')[0]!);
    expect(screen.getByRole('tab', { name: 'Learn' })).toHaveAttribute('aria-selected', 'true');
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

  it('opens on the first week, ticks a lesson when it happens, and keeps the progress', () => {
    const storage = memory();
    const store = createStore(CONTENT, storage, 8);
    render(<App store={store} />);
    expect(screen.getByRole('tab', { name: /First week/ })).toHaveAttribute('aria-selected', 'true');
    expect(document.querySelectorAll('.lesson.done')).toHaveLength(0);
    expect(document.querySelector('.lesson.current strong')?.textContent).toBe('See two exchanges disagree');
    act(() => {
      store.skipToOpen();
      for (let i = 0; i < (6 * 60 * 1000) / TICK_MS; i++) {
        store.game.step();
        if (i % 500 === 0) store.publish();
      }
      store.publish();
    });
    const done = document.querySelectorAll('.lesson.done');
    expect(done.length).toBeGreaterThanOrEqual(2);
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
    store.setBlock('arbitrage', { enabled: false });
    store.setBlock('script', { enabled: true });
    render(<App store={store} />);
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
    expect(document.querySelector('.script-log')?.textContent).toMatch(/hello from 3 stocks/);
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
    render(<App store={store} />);
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
    fireEvent.click(screen.getByRole('tab', { name: 'Shop' }));
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

  it('shows the shop and refuses what cannot be afforded', () => {
    const store = createStore(CONTENT, null, 6);
    store.game.firm.cash = 1000;
    store.game.version++;
    store.publish();
    render(<App store={store} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Shop' }));
    expect(screen.getByText('Colocation at HARBOR')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: /\$120\.0k/ });
    expect(buttons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });
});
