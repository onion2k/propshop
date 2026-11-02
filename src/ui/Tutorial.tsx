// The tutorial card and the welcome. The card shows one step: its title, its text, Back, Next and Skip. It
// drives the game on entering a step, switches the page, and lights the step's element. Next waits for the
// step's check where there is one. State lives in the store, so a reload picks up at the same step.

import { useEffect } from 'react';
import { TUTORIAL, type TutorialPage } from '../content';
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

export function TutorialCard({
  s,
  store,
  tutorial,
  setPage,
}: {
  s: Snapshot;
  store: Store;
  tutorial: Extract<TutorialState, { state: 'at' }>;
  setPage: (p: TutorialPage) => void;
}) {
  const index = Math.min(tutorial.step, TUTORIAL.length - 1);
  const step = TUTORIAL[index]!;
  const last = index === TUTORIAL.length - 1;

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
  }, [step, s.now]);

  const ready = !step.waitFor || step.waitFor.check(s);
  const go = (i: number) => store.setTutorial({ state: 'at', step: i });
  return (
    <div className="tutorial" role="dialog" aria-label={`Tutorial step ${index + 1} of ${TUTORIAL.length}`}>
      <div className="tutorial-head">
        <span className="muted small">
          {index + 1} of {TUTORIAL.length}
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
          <button type="button" className="on" onClick={() => store.setTutorial({ state: 'done' })}>
            Done
          </button>
        ) : (
          <button type="button" className="on" disabled={!ready} onClick={() => go(index + 1)}>
            Next
          </button>
        )}
        <button type="button" className="link" onClick={() => store.setTutorial({ state: 'done' })}>
          Skip
        </button>
      </div>
    </div>
  );
}
