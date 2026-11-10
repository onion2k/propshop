// The guided first week: the lessons by stage, ticked by the game as each happens, the lesson revealed once
// it has. The first open one is the current one. A stage that is not open yet is shown by its name alone, and
// the switch opens every stage at once.

import {
  DESK_LESSONS,
  DESK_NAMES,
  LESSONS,
  LAST_STAGE,
  STAGES,
  lessonDesk,
  lessonStage,
  shows,
  type Lesson,
  type StageId,
} from '../content';
import { useContext, useSyncExternalStore } from 'react';
import { formatTime } from '../sim';
import { GoContext } from './Go';
import { Term } from './Glossary';
import { Targets } from './Targets';
import type { Progress, Store } from './store';

/** Lessons not yet done, in the stages that are open (all of them by default). */
export function lessonsLeft(progress: Progress, stage: StageId = LAST_STAGE): number {
  return LESSONS.filter((l) => progress[l.id] === undefined && (lessonStage(l.id) ?? 1) <= stage).length;
}

export function FirstWeekPanel({
  progress,
  store,
  stage = LAST_STAGE,
  reveal = false,
}: {
  progress: Progress;
  store: Store;
  stage?: StageId;
  reveal?: boolean;
}) {
  const current = LESSONS.find((l) => progress[l.id] === undefined && (lessonStage(l.id) ?? 1) <= stage);
  const left = lessonsLeft(progress, stage);
  const tutorial = store.getTutorial();
  const met = useSyncExternalStore(store.subscribe, store.getTargets, store.getTargets);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const number = new Map(LESSONS.map((l, i) => [l.id, i + 1]));
  return (
    <div className="first-week">
      {tutorial.state !== 'at' && (
        <p>
          <button type="button" onClick={() => store.setTutorial({ state: 'at', step: 0 })}>
            {tutorial.state === 'done' ? 'Take the tutorial again' : 'Take the tutorial'}
          </button>
        </p>
      )}
      <p>
        <label>
          <input type="checkbox" checked={reveal} onChange={(e) => store.setReveal(e.target.checked)} /> Show everything
        </label>{' '}
        <span className="muted small">
          The game opens a stage at a time, as lessons are done. This opens them all now, and keeps them open.
        </span>
      </p>
      <p className="muted">
        {left === 0 && stage === LAST_STAGE
          ? `All ${LESSONS.length} done. The rest of the game is yours; the Learn tab has the ideas in full.`
          : `${LESSONS.filter((l) => lessonDesk(l.id) === undefined).length} things to see in your first week, a stage at a time. The game ticks each off when it has happened, and says what it meant.`}
      </p>
      {STAGES.map((st) => {
        const open = st.id <= stage;
        return (
          <section key={st.id} className={`stage ${open ? 'open' : 'locked'}`} aria-label={`Stage ${st.id}`}>
            <h3>
              Stage {st.id}: {st.name}
              {!open && <span className="muted small"> · opens as you go</span>}
            </h3>
            {open && st.lessons.length === 0 && <p className="muted small">No lessons: the whole game is open.</p>}
            {open && st.lessons.length > 0 && (
              <ol>
                {st.lessons.map((id) => (
                  <LessonItem
                    key={id}
                    l={LESSONS.find((x) => x.id === id)!}
                    progress={progress}
                    current={current}
                    number={number}
                  />
                ))}
              </ol>
            )}
          </section>
        );
      })}
      {Object.entries(DESK_LESSONS)
        .filter(([desk]) => shows(`desk:${desk}`, stage))
        .map(([desk, ids]) => (
          <section key={desk} className="stage open" aria-label={`The ${deskName(desk)} desk`}>
            <h3>
              The {deskName(desk)} desk <span className="muted small">· open alongside, and opens no stage</span>
            </h3>
            <ol>
              {ids.map((id) => (
                <LessonItem
                  key={id}
                  l={LESSONS.find((x) => x.id === id)!}
                  progress={progress}
                  current={current}
                  number={number}
                />
              ))}
            </ol>
          </section>
        ))}
      {/* Appended below the lessons, and growing downward as stages open. */}
      <Targets s={snapshot} met={met} stage={stage} full />
    </div>
  );
}

/** "futures", "currencies": what the page calls a desk, as a word in a sentence. */
function deskName(desk: string): string {
  return (DESK_NAMES[desk] ?? desk).toLowerCase();
}

function LessonItem({
  l,
  progress,
  current,
  number,
}: {
  l: Lesson;
  progress: Progress;
  current: Lesson | undefined;
  number: Map<string, number>;
}) {
  const doneAt = progress[l.id];
  const { go, can } = useContext(GoContext);
  const state = doneAt !== undefined ? 'done' : l === current ? 'current' : 'later';
  return (
    <li className={`lesson ${state}`}>
      <div className="lesson-head">
        <span className="lesson-mark" aria-hidden="true">
          {state === 'done' ? '✓' : number.get(l.id)}
        </span>
        <strong>{l.title}</strong>
        {doneAt !== undefined && <span className="muted small"> · done {formatTime(doneAt)}</span>}
      </div>
      {state !== 'later' && (
        <div className="lesson-body">
          <p>{l.task}</p>
          {state === 'current' && l.go && can(l.go) && (
            <p>
              <button type="button" className="on" onClick={() => go(l.go!)}>
                Take me there
              </button>
            </p>
          )}
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
}
