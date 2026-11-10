// The day's market-wide releases, as one line of fixed room: "Releases today: 10:42, 14:05". Times only; what a
// release says and which way it moves the market are not told (see the economic calendar in the glossary).

import { CALENDAR_WORDS } from '../content';
import type { Snapshot } from '../sim';
import { Term } from './Glossary';
import { releaseTimes } from './overview';

export function Releases({ s }: { s: Snapshot }) {
  return (
    <p className="releases small muted" data-testid="releases-today" title={CALENDAR_WORDS.note}>
      <Term id={CALENDAR_WORDS.term}>{CALENDAR_WORDS.heading}</Term>
      {': '}
      <span className="num">{releaseTimes(s.releases)}</span>
    </p>
  );
}
