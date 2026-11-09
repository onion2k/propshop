// The line under the top bar for a moment: a margin call, a fine, a halt, a delivery, a closed round, the day's first
// race won, an unlock. The slot holds its height whether or not a moment is on it, so nothing moves when one comes
// or goes. The hold is in wall seconds and is the page's: the sim never sees the wall clock. The choosing is pure
// (`momentChoice.ts`); this reads the snapshot each frame, keeps what the chooser remembers, and shows its answer.

import { useContext, useEffect, useRef, useState } from 'react';
import { MOMENT_WORDS, type StageId } from '../content';
import type { Snapshot } from '../sim';
import { GoContext } from './Go';
import { Term } from './Glossary';
import { MOMENT_HOLD_MS, chooseMoment, openMemory, type MomentMemory, type Shown } from './momentChoice';

export function Moments({ s, stage }: { s: Snapshot; stage: StageId }) {
  const { go, can } = useContext(GoContext);
  // What the chooser remembers lives for the page's life: a reload starts it afresh at the save's time, so nothing
  // that happened before replays.
  const memory = useRef<MomentMemory>(openMemory(s.now, s.calendar.day, s.open ? s.racesWon : 0));
  const [shown, setShown] = useState<Shown | null>(null);
  useEffect(() => {
    // A new game starts the clock again: forget what was seen.
    if (s.now < memory.current.seen) memory.current = openMemory(s.now, s.calendar.day, s.open ? s.racesWon : 0);
    const next = chooseMoment({
      log: s.log,
      now: s.now,
      day: s.calendar.day,
      // Races are the open's: the tally of the day just closed stays until the next open, and is not new.
      racesWon: s.open ? s.racesWon : 0,
      stage,
      memory: memory.current,
      current: shown,
      wall: Date.now(),
    });
    memory.current = next.memory;
    if (next.current !== shown) setShown(next.current);
  }, [s, stage, shown]);
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), Math.max(0, shown.wallAt + MOMENT_HOLD_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [shown]);
  const m = shown?.moment ?? null;
  return (
    <div className="moments" role="group" aria-live="polite" aria-label={MOMENT_WORDS.label}>
      {m && (
        <p key={`${m.kind}:${m.at}`} className="moment">
          <span className="moment-text">{m.text}</span> <Term id={m.term} />
          {can(m.place) && (
            <>
              {' · '}
              <button type="button" className="link" onClick={() => go(m.place)}>
                {MOMENT_WORDS.link}
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
