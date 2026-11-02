// The guided first week: the lessons in order, ticked by the game as each happens, the lesson revealed once
// it has. The first open one is the current one. Nothing is locked; it is a path, not a gate.

import { LESSONS } from '../content';
import { formatTime } from '../sim';
import { Term } from './Glossary';
import type { Progress, Store } from './store';

export function lessonsLeft(progress: Progress): number {
  return LESSONS.filter((l) => progress[l.id] === undefined).length;
}

export function FirstWeekPanel({ progress, store }: { progress: Progress; store: Store }) {
  const current = LESSONS.find((l) => progress[l.id] === undefined);
  const left = lessonsLeft(progress);
  const tutorial = store.getTutorial();
  return (
    <div className="first-week">
      {tutorial.state !== 'at' && (
        <p>
          <button type="button" onClick={() => store.setTutorial({ state: 'at', step: 0 })}>
            {tutorial.state === 'done' ? 'Take the tutorial again' : 'Take the tutorial'}
          </button>
        </p>
      )}
      <p className="muted">
        {left === 0
          ? 'All eight done. The rest of the game is yours; the Learn tab has the ideas in full.'
          : 'Eight things to see in your first week. The game ticks each off when it has happened, and says what it meant.'}
      </p>
      <ol>
        {LESSONS.map((l, i) => {
          const doneAt = progress[l.id];
          const state = doneAt !== undefined ? 'done' : l === current ? 'current' : 'later';
          return (
            <li key={l.id} className={`lesson ${state}`}>
              <div className="lesson-head">
                <span className="lesson-mark" aria-hidden="true">
                  {state === 'done' ? '✓' : i + 1}
                </span>
                <strong>{l.title}</strong>
                {doneAt !== undefined && <span className="muted small"> · done {formatTime(doneAt)}</span>}
              </div>
              {state !== 'later' && (
                <div className="lesson-body">
                  <p>{l.task}</p>
                  <p className="muted small">Watch for: {l.watch}</p>
                  {state === 'done' && <p className="lesson-text">{l.lesson}</p>}
                  <p className="small muted">
                    Read:{' '}
                    {l.terms.map((t, j) => (
                      <span key={t}>
                        {j > 0 && ', '}
                        <Term id={t} />
                      </span>
                    ))}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
