// The news feed, newest first, with the stocks each headline touched and, once the market has had time, what
// it did about it. A desk's own headlines (the metals' supply news) sit among the stocks', labelled with the desk.

import { DESK_NAMES } from '../content';
import { formatTime, type Published, type Snapshot } from '../sim';
import { money, pointsInCents } from './format';
import { Term } from './Glossary';
import { Releases } from './Releases';

export function NewsPanel({ s }: { s: Snapshot }) {
  const items: { h: Published; desk: string | null }[] = [
    ...s.news.map((h) => ({ h, desk: null })),
    ...s.deskNews.map((h) => ({ h, desk: h.desk })),
  ].sort((a, b) => b.h.at - a.h.at);
  /** A move in a symbol's points: cents for a stock, as before; money for anything priced in other points. */
  const move = (symbol: string, m: number) => {
    const decimals = s.stocks.find((x) => x.symbol === symbol)?.decimals ?? 2;
    return decimals === 2 ? `${m > 0 ? '+' : ''}${m}¢` : money(pointsInCents(m, decimals), true);
  };
  return (
    <div className="news">
      <p className="muted">
        Headlines as they land. A headline reads up or down; whether the market agrees is another matter. See{' '}
        <Term id="news">news and pricing in</Term>.
      </p>
      <Releases s={s} />
      {items.length === 0 && <p className="muted">Nothing yet today.</p>}
      <ul>
        {items.map(({ h, desk }) => {
          const moved = Object.values(h.moves).some((m) => m !== 0);
          const settled = s.now - h.at > h.priceInMs;
          return (
            <li key={`${desk ?? 'stocks'}:${h.id}`} className="headline">
              <span className="muted num">{h.at > s.now - 86_400_000 ? formatTime(h.at) : 'earlier'}</span>{' '}
              <span className={h.direction > 0 ? 'up' : h.direction < 0 ? 'down' : ''}>
                {h.direction > 0 ? '▲' : h.direction < 0 ? '▼' : '•'}
              </span>{' '}
              {h.text}
              <span className="muted">
                {' '}
                · {h.symbols.join(', ')}
                {desk !== null && ` · ${DESK_NAMES[desk] ?? desk} desk`}
              </span>
              {settled && (
                <span className="muted small">
                  {' '}
                  ·{' '}
                  {moved
                    ? `moved ${Object.entries(h.moves)
                        .map(([sym, m]) => `${sym} ${move(sym, m)}`)
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
