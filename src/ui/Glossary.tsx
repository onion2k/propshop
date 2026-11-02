// A term the player can learn about: underlined where it appears, a short tip on hover, and a click opens its
// entry in the Learn tab. The Learn tab lists every entry.

import { createContext, useContext, type ReactNode } from 'react';
import { GLOSSARY, glossary } from '../content';

export const LearnContext = createContext<{ open: (id: string) => void; selected: string | null }>({
  open: () => undefined,
  selected: null,
});

export function Term({ id, children }: { id: string; children?: ReactNode }) {
  const { open } = useContext(LearnContext);
  const entry = glossary(id);
  if (!entry) return <>{children}</>;
  return (
    <button type="button" className="term" title={entry.short} onClick={() => open(id)}>
      {children ?? entry.term}
    </button>
  );
}

export function LearnPanel() {
  const { selected, open } = useContext(LearnContext);
  return (
    <div className="learn">
      <p className="muted">
        Everything the game uses, explained. Click any underlined term anywhere in the game to come here.
      </p>
      {GLOSSARY.map((g) => (
        <details
          key={g.id}
          id={`learn-${g.id}`}
          open={selected === g.id}
          onToggle={(e) => e.currentTarget.open && open(g.id)}
        >
          <summary>
            <strong>{g.term}</strong> <span className="muted">{g.short}</span>
          </summary>
          <p>{g.long}</p>
        </details>
      ))}
    </div>
  );
}
