// The root: the cover first, with the store held still beneath it, then the list of experiments, which is how a
// player meets the game, then either an experiment or Free play (the open week, with every stage shown). The
// free-play sim runs only in Free play; the cover, the list and an experiment hold it still.
import { useEffect, useState } from 'react';
import { EXPERIMENTS, type Experiment } from '../content/experiments';
import { App } from './App';
import { Cover } from './Cover';
import { ExperimentPage } from './ExperimentPage';
import type { Storage, Store } from './store';

/** Which experiments are done: `{ done: ids }`. */
export const EXPERIMENTS_KEY = 'propshop.experiments.v1';

type Where = { at: 'cover' } | { at: 'list' } | { at: 'free' } | { at: 'experiment'; id: string };

function loadDone(storage: Storage | null): string[] {
  try {
    const raw = storage?.getItem(EXPERIMENTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const done = typeof parsed === 'object' && parsed !== null ? (parsed as { done?: unknown }).done : undefined;
    return Array.isArray(done) ? done.filter((d): d is string => typeof d === 'string') : [];
  } catch {
    return [];
  }
}

export function Root({
  store,
  storage = null,
  experiments = EXPERIMENTS,
}: {
  store: Store;
  /** Where the done experiments are kept; the browser's, from the page. */
  storage?: Storage | null;
  experiments?: readonly Experiment[];
}) {
  const [where, setWhere] = useState<Where>({ at: 'cover' });
  const [done, setDone] = useState<string[]>(() => loadDone(storage));
  const free = where.at === 'free';
  useEffect(() => {
    store.hold(!free);
  }, [store, free]);
  // Held at once, before the first effect runs, so no frame slips through.
  if (!free) store.hold(true);

  const markDone = (id: string) => {
    if (done.includes(id)) return;
    const next = [...done, id];
    setDone(next);
    try {
      storage?.setItem(EXPERIMENTS_KEY, JSON.stringify({ done: next }));
    } catch {
      // Storage can be full or forbidden; the mark still shows on screen.
    }
  };

  if (where.at === 'cover') return <Cover onStart={() => setWhere({ at: 'list' })} />;
  if (where.at === 'free') {
    return (
      <>
        <nav className="back-bar">
          <button type="button" className="link" onClick={() => setWhere({ at: 'list' })}>
            Experiments
          </button>
        </nav>
        <App store={store} />
      </>
    );
  }
  if (where.at === 'experiment') {
    const i = experiments.findIndex((e) => e.id === where.id);
    const experiment = experiments[i];
    if (experiment) {
      const next = experiments[i + 1];
      return (
        <ExperimentPage
          key={experiment.id}
          experiment={experiment}
          onBack={() => setWhere({ at: 'list' })}
          onDone={markDone}
          onNext={next ? () => setWhere({ at: 'experiment', id: next.id }) : undefined}
        />
      );
    }
  }
  const openFree = () => {
    store.setReveal(true);
    setWhere({ at: 'free' });
  };
  return (
    <main className="experiments-list">
      <h1>Experiments</h1>
      <p className="muted">
        Run a short window of a trading morning, change one thing, guess what it does, and run the same window again.
      </p>
      <ul>
        {experiments.map((e) => (
          <li key={e.id}>
            <button type="button" className="exp-card" onClick={() => setWhere({ at: 'experiment', id: e.id })}>
              <strong>{e.title}</strong>
              <span className="muted">{e.teaches}</span>
              <span className={`exp-done ${done.includes(e.id) ? 'on' : ''}`}>
                {done.includes(e.id) ? 'Done' : 'Not done'}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p>
        <button type="button" onClick={openFree}>
          Free play
        </button>{' '}
        <span className="muted small">The open week, with everything shown.</span>
      </p>
    </main>
  );
}
