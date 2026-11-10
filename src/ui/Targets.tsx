// The targets: something to play for at each stage, with the firm's progress, and the standing goal. The working
// is `src/content/targets.ts`; this only lists. A target for a stage not yet shown is not listed, and the ticked
// ones are kept by the store. The list only grows downward as stages open.

import { TARGET_WORDS, standingGoal, targetsShown, type StageId } from '../content';
import { calendar, formatTime, type Snapshot } from '../sim';
import { money } from './format';
import { Term } from './Glossary';
import { progressText } from './overview';
import type { Met } from './store';

const WEEKDAY = (now: number) => calendar(now).weekday;

export function Targets({ s, met, stage, full = false }: { s: Snapshot; met: Met; stage: StageId; full?: boolean }) {
  const shown = targetsShown(stage);
  const goal = standingGoal(s);
  return (
    <div className="targets" data-testid="targets">
      <h4>{TARGET_WORDS.heading}</h4>
      {full && <p className="muted small">{TARGET_WORDS.intro}</p>}
      <ul>
        {shown.map((t) => {
          const at = met[t.id];
          const p = t.progress(s);
          return (
            <li key={t.id} className={`target ${at !== undefined ? 'met' : ''}`} data-target={t.id}>
              <span className="target-mark" aria-hidden="true">
                {at !== undefined ? '✓' : '○'}
              </span>
              <strong>{t.title}</strong>{' '}
              <span className="muted small">
                {at !== undefined
                  ? TARGET_WORDS.met(`${WEEKDAY(at)} ${formatTime(at)}`)
                  : p.of === 0
                    ? TARGET_WORDS.noSeat
                    : progressText(p)}
              </span>
              {full && (
                <p className="small">
                  {t.explain}{' '}
                  {t.terms.map((id) => (
                    <Term key={id} id={id} />
                  ))}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {goal && (
        <p className="small target-standing" data-testid="standing-goal">
          <strong>{TARGET_WORDS.standingHeading}.</strong>{' '}
          {TARGET_WORDS.standing(goal.rival, money(goal.you, true), money(goal.them, true), goal.winning)}
        </p>
      )}
    </div>
  );
}
