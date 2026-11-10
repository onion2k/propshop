// The root: the cover first, with the store held still beneath it, then the list of experiments, which is how a
// player meets the game, then either an experiment or Free play (the open week, with every stage shown). The
// free-play sim runs only in Free play; the cover, the list and an experiment hold it still.
import { useEffect, useState } from 'react';
import { EXPERIMENTS, type Experiment } from '../content/experiments';
import { DESK_NAMES } from '../content/stages';
import { App } from './App';
import { Cover } from './Cover';
import { ExperimentPage } from './ExperimentPage';
import type { Storage, Store } from './store';

/** Which experiments are done, and whether the first guess was right: `{ done: ids, called: { id: right } }`. */
export const EXPERIMENTS_KEY = 'propshop.experiments.v1';

type Where = { at: 'cover' } | { at: 'list' } | { at: 'free' } | { at: 'experiment'; id: string };

interface Kept {
  done: string[];
  /** Only for the experiments finished since the guess was kept; an older one has none. */
  called: { [id: string]: boolean };
}

function loadRecord(storage: Storage | null): Kept {
  try {
    const raw = storage?.getItem(EXPERIMENTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const o = typeof parsed === 'object' && parsed !== null ? (parsed as { done?: unknown; called?: unknown }) : {};
    const done = Array.isArray(o.done) ? o.done.filter((d): d is string => typeof d === 'string') : [];
    const called: { [id: string]: boolean } = {};
    if (typeof o.called === 'object' && o.called !== null && !Array.isArray(o.called)) {
      for (const [id, v] of Object.entries(o.called)) if (typeof v === 'boolean') called[id] = v;
    }
    return { done, called };
  } catch {
    return { done: [], called: {} };
  }
}

/**
 * The desk an experiment belongs to: the last of the desks it opens besides the stocks' (the newest, which the earlier
 * ones are open for: the options desk needs the futures desk), or the stocks.
 */
function deskOf(e: Experiment): string {
  return e.desks?.at(-1) ?? 'stocks';
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
  const [record, setRecord] = useState<Kept>(() => loadRecord(storage));
  const { done, called } = record;
  const free = where.at === 'free';
  useEffect(() => {
    store.hold(!free);
  }, [store, free]);
  // Held at once, before the first effect runs, so no frame slips through.
  if (!free) store.hold(true);

  // The first finish of an experiment is the one kept: a second go knows the answer.
  const markDone = (id: string, right: boolean) => {
    if (done.includes(id)) return;
    const next = { done: [...done, id], called: { ...called, [id]: right } };
    setRecord(next);
    try {
      storage?.setItem(EXPERIMENTS_KEY, JSON.stringify(next));
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
  const openRun = () => {
    store.setReveal(false);
    setWhere({ at: 'free' });
  };
  const openFree = () => {
    store.setReveal(true);
    setWhere({ at: 'free' });
  };
  const guessed = Object.values(called);
  const rightCount = guessed.filter(Boolean).length;
  const statusOf = (id: string) =>
    !done.includes(id)
      ? 'Not done'
      : id in called
        ? called[id]
          ? 'Done: you called it'
          : 'Done: you guessed wrong'
        : 'Done';
  const desks = Object.keys(DESK_NAMES).filter((d) => experiments.some((e) => deskOf(e) === d));
  return (
    <main className="experiments-list">
      <h1>Experiments</h1>
      <p className="muted">
        Run a short window of a trading morning, change one thing, guess what it does, and run the same window again.
      </p>
      {guessed.length > 0 && (
        <p className="exp-score">
          You called {rightCount} of the {guessed.length} you guessed.
        </p>
      )}
      {desks.map((d) => (
        <div key={d} role="group" aria-labelledby={`exp-desk-${d}`} className="exp-group">
          <h2 id={`exp-desk-${d}`}>{DESK_NAMES[d]}</h2>
          <ul>
            {experiments
              .filter((e) => deskOf(e) === d)
              .map((e) => (
                <li key={e.id}>
                  <button type="button" className="exp-card" onClick={() => setWhere({ at: 'experiment', id: e.id })}>
                    <strong>{e.title}</strong>
                    <span className="muted">{e.teaches}</span>
                    <span
                      className={`exp-done ${done.includes(e.id) ? 'on' : ''} ${called[e.id] === false ? 'missed' : ''}`}
                    >
                      {statusOf(e.id)}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ))}
      <div className="exp-doors">
        <div>
          <button type="button" className="on" onClick={openRun}>
            Run the firm
          </button>
          <p className="muted small">
            Start in a spare room with one block. The game opens a stage at a time, as you learn it.
          </p>
        </div>
        <div>
          <button type="button" onClick={openFree}>
            Free play
          </button>
          <p className="muted small">The same firm, with everything shown.</p>
        </div>
      </div>
    </main>
  );
}
