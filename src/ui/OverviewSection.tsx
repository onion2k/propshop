// A section of the Overview: its heading, one line on how to read it, and a fuller note folded behind.

import type { ReactNode } from 'react';

/** A section: its heading, one line on how to read it, and a fuller note folded behind. */
export function Section({
  id,
  title,
  how,
  note,
  children,
  tut,
}: {
  id: string;
  title: string;
  how: ReactNode;
  note: ReactNode;
  children: ReactNode;
  tut?: string;
}) {
  return (
    <section className="panel ov-section" id={id} data-tut={tut}>
      <h2>{title}</h2>
      <p className="ov-how muted">{how}</p>
      <details className="ov-note">
        <summary className="small">More on this</summary>
        <div className="small">{note}</div>
      </details>
      {children}
    </section>
  );
}
