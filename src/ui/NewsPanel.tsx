// The news feed, newest first, with the stocks each headline touched and, once the market has had time, what
// it did about it.

import { formatTime, type Snapshot } from '../sim';
import { Term } from './Glossary';

export function NewsPanel({ s }: { s: Snapshot }) {
  return (
    <div className="news">
      <p className="muted">
        Headlines as they land. A headline reads up or down; whether the market agrees is another matter. See{' '}
        <Term id="news">news and pricing in</Term>.
      </p>
      {s.news.length === 0 && <p className="muted">Nothing yet today.</p>}
      <ul>
        {s.news.map((h) => {
          const moved = Object.values(h.moves).some((m) => m !== 0);
          const settled = s.now - h.at > h.priceInMs;
          return (
            <li key={h.id} className="headline">
              <span className="muted num">{h.at > s.now - 86_400_000 ? formatTime(h.at) : 'earlier'}</span>{' '}
              <span className={h.direction > 0 ? 'up' : h.direction < 0 ? 'down' : ''}>
                {h.direction > 0 ? '▲' : h.direction < 0 ? '▼' : '•'}
              </span>{' '}
              {h.text}
              <span className="muted"> · {h.symbols.join(', ')}</span>
              {settled && (
                <span className="muted small">
                  {' '}
                  ·{' '}
                  {moved
                    ? `moved ${Object.entries(h.moves)
                        .map(([sym, m]) => `${sym} ${m > 0 ? '+' : ''}${m}¢`)
                        .join(', ')}`
                    : 'moved nothing: noise'}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
