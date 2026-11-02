// The page's layout: the top bar, the market and the firm on the left, the strategy and the tabbed panels on
// the right. All state lives in the store; this file only arranges it.

import { useState, useSyncExternalStore } from 'react';
import { DarkWebPanel } from './DarkWebPanel';
import { FirmPanel } from './FirmPanel';
import { LearnContext, LearnPanel } from './Glossary';
import { MarketPanel } from './MarketPanel';
import { NewsPanel } from './NewsPanel';
import { RivalsPanel } from './RivalsPanel';
import { ShopPanel } from './ShopPanel';
import type { Store } from './store';
import { StrategyPanel } from './StrategyPanel';
import { TopBar } from './TopBar';

type Tab = 'news' | 'dark' | 'shop' | 'rivals' | 'learn';
const TABS: { id: Tab; label: string }[] = [
  { id: 'news', label: 'News' },
  { id: 'dark', label: 'Dark web' },
  { id: 'shop', label: 'Shop' },
  { id: 'rivals', label: 'Rivals' },
  { id: 'learn', label: 'Learn' },
];

export function App({ store }: { store: Store }) {
  const s = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [tab, setTab] = useState<Tab>('news');
  const [term, setTerm] = useState<string | null>(null);
  const learn = {
    selected: term,
    open: (id: string) => {
      setTerm(id);
      setTab('learn');
    },
  };
  return (
    <LearnContext.Provider value={learn}>
      <TopBar s={s} store={store} />
      <main className="layout">
        <div className="column">
          <MarketPanel s={s} />
          <FirmPanel s={s} />
        </div>
        <div className="column">
          <StrategyPanel s={s} store={store} />
          <section className="panel tabs">
            <nav role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={tab === t.id ? 'on' : ''}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                  {t.id === 'dark' && s.dark.unlocked && s.dark.offers.length > 0 && (
                    <span className="badge">{s.dark.offers.length}</span>
                  )}
                </button>
              ))}
            </nav>
            <div className="tab-body" role="tabpanel">
              {tab === 'news' && <NewsPanel s={s} />}
              {tab === 'dark' && <DarkWebPanel s={s} store={store} />}
              {tab === 'shop' && <ShopPanel s={s} store={store} />}
              {tab === 'rivals' && <RivalsPanel s={s} />}
              {tab === 'learn' && <LearnPanel />}
            </div>
          </section>
        </div>
      </main>
      <footer className="muted small">
        Saved in this browser every few seconds.{' '}
        <button
          type="button"
          className="link"
          onClick={() => window.confirm('Start a new game? This one is lost.') && store.reset(Date.now() >>> 0)}
        >
          Start again
        </button>
      </footer>
    </LearnContext.Provider>
  );
}
