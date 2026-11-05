// The tutorial card and the welcome. The card shows one step: its title, its text, Back, Next and Skip. It
// drives the game on entering a step, switches the page, and lights the step's element. Next waits for the
// step's check where there is one. State lives in the store, so a reload picks up at the same step. A stage's
// intro cards go through the same card, with their place kept here and the stage marked seen when they end.

import { useEffect, useState } from 'react';
import { introSteps, TUTORIAL, type StageId, type TutorialPage, type TutorialStep } from '../content';
import type { Snapshot } from '../sim';
import type { Store, Tutorial as TutorialState } from './store';

export function Welcome({ store }: { store: Store }) {
  return (
    <div className="tutorial welcome" role="dialog" aria-label="Welcome">
      <strong>New here?</strong>
      <p>A short walk through the game, one thing at a time. About five minutes. Everything stays where it is.</p>
      <div className="tutorial-bar">
        <button type="button" className="on" onClick={() => store.setTutorial({ state: 'at', step: 0 })}>
          Take the tutorial
        </button>
        <button type="button" onClick={() => store.setTutorial({ state: 'done' })}>
          Just play
        </button>
      </div>
    </div>
  );
}

/** One card of a run of steps: the page, the game and the spotlight on entering, then Back, Next, Skip. */
function StepCard({
  s,
  store,
  steps,
  index,
  label,
  page,
  setPage,
  go,
  finish,
}: {
  s: Snapshot;
  store: Store;
  steps: TutorialStep[];
  index: number;
  label: string;
  page: TutorialPage;
  setPage: (p: TutorialPage) => void;
  go: (i: number) => void;
  finish: () => void;
}) {
  const step = steps[index]!;
  const last = index === steps.length - 1;

  // On entering a step: the page, the game, and the spotlight.
  useEffect(() => {
    setPage(step.page);
    const e = step.enter;
    if (e) {
      if (e.speed !== undefined) store.setSpeed(e.speed);
      if (e.skipToOpen) store.skipToOpen();
      for (const id of e.disable ?? []) store.setBlock(id, { enabled: false });
      for (const id of e.enable ?? []) store.setBlock(id, { enabled: true });
    }
  }, [step, store, setPage]);

  useEffect(() => {
    const target = step.target ? document.querySelector(`[data-tut="${step.target}"]`) : null;
    target?.classList.add('tut-target');
    // A test's DOM has no scrolling; a browser's does.
    const scroll = (target as { scrollIntoView?: (o: ScrollIntoViewOptions) => void } | null)?.scrollIntoView;
    if (typeof scroll === 'function') scroll.call(target, { block: 'nearest' });
    return () => target?.classList.remove('tut-target');
    // The page is a dependency because its elements exist only once it has rendered.
  }, [step, page, s.now]);

  const ready = !step.waitFor || step.waitFor.check(s);
  return (
    <div className="tutorial" role="dialog" aria-label={`${label} step ${index + 1} of ${steps.length}`}>
      <div className="tutorial-head">
        <span className="muted small">
          {index + 1} of {steps.length}
        </span>
        <strong>{step.title}</strong>
      </div>
      <p>{step.text}</p>
      {step.waitFor && !ready && <p className="muted small waiting">{step.waitFor.waiting}</p>}
      <div className="tutorial-bar">
        <button type="button" disabled={index === 0} onClick={() => go(index - 1)}>
          Back
        </button>
        {last ? (
          <button type="button" className="on" onClick={finish}>
            Done
          </button>
        ) : (
          <button type="button" className="on" disabled={!ready} onClick={() => go(index + 1)}>
            Next
          </button>
        )}
        <button type="button" className="link" onClick={finish}>
          Skip
        </button>
      </div>
    </div>
  );
}

export function TutorialCard({
  s,
  store,
  tutorial,
  page,
  setPage,
}: {
  s: Snapshot;
  store: Store;
  tutorial: Extract<TutorialState, { state: 'at' }>;
  page: TutorialPage;
  setPage: (p: TutorialPage) => void;
}) {
  const index = Math.min(tutorial.step, TUTORIAL.length - 1);
  return (
    <StepCard
      s={s}
      store={store}
      steps={TUTORIAL}
      index={index}
      label="Tutorial"
      page={page}
      setPage={setPage}
      go={(i) => store.setTutorial({ state: 'at', step: i })}
      finish={() => store.setTutorial({ state: 'done' })}
    />
  );
}

/** The cards shown when a stage opens: its place in them is kept here, and the stage is marked seen at the end. */
export function StageIntro({
  s,
  store,
  stage,
  page,
  setPage,
}: {
  s: Snapshot;
  store: Store;
  stage: StageId;
  page: TutorialPage;
  setPage: (p: TutorialPage) => void;
}) {
  const steps = introSteps(stage);
  const [index, setIndex] = useState(0);
  if (steps.length === 0) return null;
  return (
    <StepCard
      key={stage}
      s={s}
      store={store}
      steps={steps}
      index={Math.min(index, steps.length - 1)}
      label="Stage"
      page={page}
      setPage={setPage}
      go={setIndex}
      finish={() => {
        setIndex(0);
        store.dismissIntro();
      }}
    />
  );
}
