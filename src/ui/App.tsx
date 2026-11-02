// The page's layout: the top bar on every page, then one of three pages. Market is the market and your firm's
// live book; Strategy is the blocks, the script, the risk limits and the shop; Reports is the first week, the
// days, the news, the dark web, the rivals and the glossary. All state lives in the store; this file arranges it.

import { useState, useSyncExternalStore } from 'react';
import { LESSONS } from '../content';
import { DarkWebPanel } from './DarkWebPanel';
import { DaysPanel } from './DaysPanel';
import { FirmPanel } from './FirmPanel';
import { FirstWeekPanel, lessonsLeft } from './FirstWeekPanel';
import { LearnContext, LearnPanel } from './Glossary';
import { MarketPanel } from './MarketPanel';
import { NewsPanel } from './NewsPanel';
import { RiskPanel } from './RiskPanel';
import { RivalsPanel } from './RivalsPanel';
import { ShopPanel } from './ShopPanel';
import type { Store } from './store';
import { StrategyPanel } from './StrategyPanel';
import { TopBar } from './TopBar';

type Page = 'market' | 'strategy' | 'reports';
const PAGES: { id: Page; label: string }[] = [
  { id: 'market', label: 'Market' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'reports', label: 'Reports' },
];

type Tab = 'week' | 'days' | 'news' | 'dark' | 'rivals' | 'learn';
const TABS: { id: Tab; label: string }[] = [
  { id: 'week', label: 'First week' },
  { id: 'days', label: 'Days' },
  { id: 'news', label: 'News' },
  { id: 'dark', label: 'Dark web' },
  { id: 'rivals', label: 'Rivals' },
  { id: 'learn', label: 'Learn' },
];

export function App({ store }: { store: Store }) {
  const s = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const progress = useSyncExternalStore(store.subscribe, store.getProgress, store.getProgress);
  const [page, setPage] = useState<Page>('market');
  const [tab, setTab] = useState<Tab>('week');
  const [term, setTerm] = useState<string | null>(null);
  // "new" on the Days tab from a close until it is opened.
  const [daysSeen, setDaysSeen] = useState(s.days.length);
  const openTab = (t: Tab) => {
    setPage('reports');
    setTab(t);
    if (t === 'days') setDaysSeen(s.days.length);
  };
  const learn = {
    selected: term,
    open: (id: string) => {
      setTerm(id);
      openTab('learn');
    },
  };
  const left = lessonsLeft(progress);
  const current = LESSONS.find((l) => progress[l.id] === undefined);
  const newDays = s.days.length > daysSeen;
  const tips = s.dark.unlocked ? s.dark.offers.length : 0;
  const reportsBadge = left + (newDays ? 1 : 0) + tips;
  return (
    <LearnContext.Provider value={learn}>
      <TopBar s={s} store={store} />
      <nav className="pages" aria-label="Pages">
        {PAGES.map((p) => (
          <button
            key={p.id}
            type="button"
            className={page === p.id ? 'on' : ''}
            aria-current={page === p.id ? 'page' : undefined}
            onClick={() => setPage(p.id)}
          >
            {p.label}
            {p.id === 'reports' && reportsBadge > 0 && (
              <span className={`badge ${newDays || tips ? '' : 'quiet'}`}>{reportsBadge}</span>
            )}
          </button>
        ))}
        {current && page !== 'reports' && (
          <button type="button" className="link hint" onClick={() => openTab('week')}>
            First week: {current.title}
          </button>
        )}
      </nav>
      {page === 'market' && (
        <main className="layout">
          <div className="column">
            <MarketPanel s={s} />
          </div>
          <div className="column">
            <FirmPanel s={s} />
          </div>
        </main>
      )}
      {page === 'strategy' && (
        <main className="layout">
          <div className="column">
            <StrategyPanel s={s} store={store} />
          </div>
          <div className="column">
            <RiskPanel s={s} store={store} />
            <section className="panel">
              <h2>Shop</h2>
              <ShopPanel s={s} store={store} />
            </section>
          </div>
        </main>
      )}
      {page === 'reports' && (
        <main className="layout single">
          <section className="panel tabs">
            <nav role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={tab === t.id ? 'on' : ''}
                  onClick={() => openTab(t.id)}
                >
                  {t.label}
                  {t.id === 'dark' && tips > 0 && <span className="badge">{tips}</span>}
                  {t.id === 'days' && newDays && <span className="badge">new</span>}
                  {t.id === 'week' && left > 0 && <span className="badge quiet">{left}</span>}
                </button>
              ))}
            </nav>
            <div className="tab-body" role="tabpanel">
              {tab === 'week' && <FirstWeekPanel progress={progress} />}
              {tab === 'days' && <DaysPanel s={s} />}
              {tab === 'news' && <NewsPanel s={s} />}
              {tab === 'dark' && <DarkWebPanel s={s} store={store} />}
              {tab === 'rivals' && <RivalsPanel s={s} />}
              {tab === 'learn' && <LearnPanel />}
            </div>
          </section>
        </main>
      )}
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
