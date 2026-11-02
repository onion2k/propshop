// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CONTENT } from '../src/content';
import { TICK_MS } from '../src/sim';
import { App } from '../src/ui/App';
import { createStore, SAVE_KEY, type Storage } from '../src/ui/store';

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
    for (let i = 0; i < (150 * 1000) / TICK_MS; i++) store.game.step();
    store.publish();
    render(<App store={store} />);
    const items = document.querySelectorAll('.orders li');
    expect(items.length).toBeGreaterThan(0);
    const words = [...document.querySelectorAll('.race-words')].map((e) => e.textContent);
    expect(words.some((w) => /Filled|Missed|took/.test(w))).toBe(true);
    expect(words.some((w) => /old when sent/.test(w))).toBe(true);
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
