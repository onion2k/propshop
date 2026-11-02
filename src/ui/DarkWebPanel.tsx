// The dark web: tips for sale, the ones bought and how they turned out, and the fines. It is here so the player
// can try insider trading and watch what it costs.

import { formatSpan, formatTime, type Snapshot } from '../sim';
import { money } from './format';
import { Term } from './Glossary';
import type { Store } from './store';

export function DarkWebPanel({ s, store }: { s: Snapshot; store: Store }) {
  if (!s.dark.unlocked) {
    return (
      <div className="dark">
        <p className="muted">
          Someone will get in touch after your first profitable week. What they sell is{' '}
          <Term id="insider">insider trading</Term>, and it is not worth it.
        </p>
      </div>
    );
  }
  return (
    <div className="dark">
      <p className="muted">
        Tomorrow&apos;s headlines, for a price. Some are real. Some are not. Every one you buy raises your heat (
        {Math.round(s.heat)} of {s.heatLine}
        before the fines start). See <Term id="insider">insider trading</Term>.
      </p>
      <h3>For sale</h3>
      {s.dark.offers.length === 0 && <p className="muted">Nothing right now.</p>}
      <ul>
        {s.dark.offers.map((t) => (
          <li key={t.id} className="tip">
            <span className={t.direction > 0 ? 'up' : 'down'}>{t.direction > 0 ? '▲' : '▼'}</span> &ldquo;{t.text}
            &rdquo;
            <span className="muted">
              {' '}
              · {t.symbols.join(', ')} · in {formatSpan(Math.max(0, t.at - s.now))}
            </span>
            <button type="button" disabled={s.cash < t.price} onClick={() => store.buyTip(t.id)}>
              buy for {money(t.price)}
            </button>
          </li>
        ))}
      </ul>
      {s.dark.bought.length > 0 && (
        <>
          <h3>Bought</h3>
          <ul>
            {s.dark.bought.map((t) => {
              const landed = s.news.find((h) => h.id === t.headlineId);
              const due = t.at <= s.now;
              return (
                <li key={t.id} className="tip">
                  &ldquo;{t.text}&rdquo; <span className="muted">· said {formatTime(t.at)}</span>
                  {due && (
                    <span className={landed ? 'up' : 'down'}>
                      {' '}
                      · {landed ? 'it happened' : t.headlineId === null ? 'it was a lie' : 'not yet'}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {s.dark.fines.length > 0 && (
        <>
          <h3>Fines</h3>
          <ul>
            {s.dark.fines.map((f) => (
              <li key={f.at} className="down">
                {money(-f.cents)} · {f.reason}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
