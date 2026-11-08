// The page's layout: the top bar on every page, then one of the pages. Overview is the firm read over time and
// the page the game opens on; Market is the market and your firm's live book; Strategy is the blocks, the script,
// the risk limits and the shop; Reports is the first week, the days, the news, the dark web, the rivals and the
// glossary. All state lives in the store; this file arranges it.

import { useCallback, useState, useSyncExternalStore } from 'react';
import { LESSONS, lessonStage, shows, type Feature, type TutorialPage } from '../content';
import { DarkWebPanel } from './DarkWebPanel';
import { DaysPanel } from './DaysPanel';
import { DeskPanel } from './DeskPanel';
import { FirmPanel } from './FirmPanel';
import { FirstWeekPanel, lessonsLeft } from './FirstWeekPanel';
import { LabPanel } from './LabPanel';
import { LearnContext, LearnPanel } from './Glossary';
import { MarketPanel } from './MarketPanel';
import { OverviewPanel } from './OverviewPanel';
import { Microscope } from './Microscope';
import { NewsPanel } from './NewsPanel';
import { RiskPanel } from './RiskPanel';
import { RivalsPanel } from './RivalsPanel';
import { ShopPanel } from './ShopPanel';
import type { Store } from './store';
import { StrategyPanel } from './StrategyPanel';
import { TopBar } from './TopBar';
import { StageIntro, TutorialCard, Welcome } from './Tutorial';

type Page = 'overview' | 'market' | 'desk' | 'strategy' | 'reports';
const PAGES: { id: Page; label: string; feature?: Feature }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'market', label: 'Market' },
  { id: 'desk', label: 'Desk', feature: 'page:desk' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'reports', label: 'Reports' },
];

type Tab = 'week' | 'days' | 'news' | 'dark' | 'rivals' | 'lab' | 'learn';
const TABS: { id: Tab; label: string; feature?: Feature }[] = [
  { id: 'week', label: 'First week' },
  { id: 'days', label: 'Days' },
  { id: 'news', label: 'News', feature: 'tab:news' },
  { id: 'dark', label: 'Dark web', feature: 'tab:dark' },
  { id: 'rivals', label: 'Rivals', feature: 'tab:rivals' },
  { id: 'lab', label: 'Lab', feature: 'tab:lab' },
  { id: 'learn', label: 'Learn' },
];

export function App({ store }: { store: Store }) {
  const s = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const progress = useSyncExternalStore(store.subscribe, store.getProgress, store.getProgress);
  const tutorial = useSyncExternalStore(store.subscribe, store.getTutorial, store.getTutorial);
  const stage = useSyncExternalStore(store.subscribe, store.getStage, store.getStage);
  const reveal = useSyncExternalStore(store.subscribe, store.getReveal, store.getReveal);
  const intro = useSyncExternalStore(store.subscribe, store.getIntro, store.getIntro);
  const [wantPage, setPage] = useState<Page>('overview');
  // A page that is not open (the switch turned off while on it) falls back to the overview.
  const pages = PAGES.filter((p) => !p.feature || shows(p.feature, stage));
  const page: Page = pages.some((p) => p.id === wantPage) ? wantPage : 'overview';
  const goPage = useCallback((p: TutorialPage) => setPage(p), []);
  const [micro, setMicro] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const openMicro = () => {
    store.setSpeed(0);
    setMicro(true);
    setPage('market');
  };
  const [wantTab, setTab] = useState<Tab>('week');
  // The dark web is the sim's to unlock; until then its tab waits, unless everything is shown.
  const tabs = TABS.filter(
    (t) => (!t.feature || shows(t.feature, stage)) && (t.id !== 'dark' || s.dark.unlocked || reveal),
  );
  const tab: Tab = tabs.some((t) => t.id === wantTab) ? wantTab : 'week';
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
  const left = lessonsLeft(progress, stage);
  const current = LESSONS.find((l) => progress[l.id] === undefined && (lessonStage(l.id) ?? 1) <= stage);
  const newDays = s.days.length > daysSeen;
  const tips = s.dark.unlocked ? s.dark.offers.length : 0;
  const reportsBadge = left + (newDays ? 1 : 0) + tips;
  // A fresh game with nothing done yet is offered the tutorial.
  const fresh = tutorial.state === 'fresh' && lessonsLeft(progress) === LESSONS.length && s.fills.length === 0;
  return (
    <LearnContext.Provider value={learn}>
      <TopBar s={s} store={store} micro={micro} onMicro={openMicro} microscope={shows('microscope', stage)} />
      {fresh && <Welcome store={store} />}
      {tutorial.state === 'at' && <TutorialCard s={s} store={store} tutorial={tutorial} page={page} setPage={goPage} />}
      {intro !== null && tutorial.state !== 'at' && !fresh && (
        <StageIntro s={s} store={store} stage={intro} page={page} setPage={goPage} />
      )}
      <nav className="pages" aria-label="Pages" data-tut="pages">
        {pages.map((p) => (
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
      {page === 'overview' && <OverviewPanel s={s} store={store} />}
      {page === 'market' && (
        <main className="layout">
          <div className="column">
            {micro && shows('microscope', stage) && (
              <Microscope
                s={s}
                onStep={store.stepTicks}
                symbol={picked ?? s.stocks.find((st) => st.watched)?.symbol ?? s.stocks[0]?.symbol ?? ''}
                onClose={() => setMicro(false)}
              />
            )}
            <MarketPanel s={s} store={store} picked={picked} onPick={setPicked} gaps={shows('gaps', stage)} />
          </div>
          <div className="column">
            <FirmPanel s={s} races={shows('races', stage)} />
          </div>
        </main>
      )}
      {page === 'desk' && (
        <main className="layout single">
          <DeskPanel s={s} store={store} />
        </main>
      )}
      {page === 'strategy' && (
        <main className="layout">
          <div className="column">
            <StrategyPanel s={s} store={store} stage={stage} />
          </div>
          <div className="column">
            <RiskPanel s={s} store={store} />
            <section className="panel" data-tut="shop">
              <h2>Shop</h2>
              <ShopPanel s={s} store={store} />
            </section>
          </div>
        </main>
      )}
      {page === 'reports' && (
        <main className="layout single">
          <section className="panel tabs" data-tut="tabs">
            <nav role="tablist">
              {tabs.map((t) => (
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
              {tab === 'week' && <FirstWeekPanel progress={progress} store={store} stage={stage} reveal={reveal} />}
              {tab === 'days' && <DaysPanel s={s} />}
              {tab === 'news' && <NewsPanel s={s} />}
              {tab === 'dark' && <DarkWebPanel s={s} store={store} />}
              {tab === 'rivals' && <RivalsPanel s={s} />}
              {tab === 'lab' && <LabPanel s={s} store={store} />}
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
