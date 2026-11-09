// The days: each close's report, newest first and the latest open. The chart of daily P&L is on the Overview.
// The report says what the day was in numbers the top bar cannot: by block, by stock, by race.

import { DESK_NAMES, REGIMES } from '../content';
import type { DayReport, Snapshot, Tally } from '../sim';
import { money, moneyShort, ms } from './format';
import { Term } from './Glossary';
import { blockName, dayCause, dayVerdict } from './overview';

function net(t: Tally): number {
  return t.realised - t.fees;
}

export function DaysPanel({ s }: { s: Snapshot }) {
  const days = [...s.days].reverse();
  if (days.length === 0) {
    return (
      <div className="days">
        <p className="muted">
          No day has closed yet. At 16:00 the game writes up what happened: by block, by stock, by race.
        </p>
      </div>
    );
  }
  return (
    <div className="days">
      {days.map((d, i) => (
        <details key={d.day} className="day" open={i === 0}>
          <summary>
            <strong>
              {d.weekday}, week {d.week}
            </strong>{' '}
            <span className={`num ${d.pnl >= 0 ? 'up' : 'down'}`}>{money(d.pnl, true)}</span>
            <span className="muted small">
              {' '}
              · {d.regime ? `${REGIMES.find((r) => r.id === d.regime)?.name.toLowerCase() ?? d.regime} · ` : ''}
              {dayVerdict(d)}
            </span>
          </summary>
          <Report d={d} />
        </details>
      ))}
    </div>
  );
}

function Report({ d }: { d: DayReport }) {
  const races = d.races.won + d.races.beaten + d.races.missed;
  const desks = deskRows(d);
  const cause = dayCause(d);
  return (
    <div className="report">
      <p className="day-cause">
        <strong>{d.pnl >= 0 ? 'What made the day: ' : 'What lost the day: '}</strong>
        {cause.text}
        {cause.term && (
          <>
            {' '}
            <Term id={cause.term}>Read more</Term>
          </>
        )}
      </p>
      <div className="report-grid">
        <div>
          <h3>By block</h3>
          <TallyTable rows={Object.entries(d.byBlock).map(([k, t]) => [blockName(k), t])} />
        </div>
        {desks.length > 0 && (
          <div>
            <h3>By desk</h3>
            <TallyTable rows={desks} night className="by-desk" />
          </div>
        )}
        <div>
          <h3>By stock</h3>
          <TallyTable rows={Object.entries(d.bySymbol).map(([k, t]) => [k, t])} />
        </div>
      </div>
      {d.rollover !== undefined && (
        <p className="rollover">
          <Term id="rollover">Rollover</Term> at 17:00, after the close:{' '}
          <span className={`num ${d.rollover >= 0 ? 'up' : 'down'}`}>{money(d.rollover, true)}</span>
          <span className="muted"> in dollars, on the currencies held then, into equity before the next open</span>
        </p>
      )}
      {d.storage !== undefined && (
        <p className="storage">
          <Term id="storage">Storage</Term> and the <Term id="lease-rate">lease</Term> at 17:00, after the close:{' '}
          <span className={`num ${d.storage >= 0 ? 'up' : 'down'}`}>{money(d.storage, true)}</span>
          <span className="muted">
            {' '}
            on the metal held then, storage on metal held long and the lease on metal held short, into equity before the
            next open
          </span>
        </p>
      )}
      <h3>
        Races{' '}
        <span className="muted">
          · <Term id="latency">latency</Term>{' '}
          {Object.entries(d.latency)
            .map(([e, l]) => `${e} ${ms(l)}`)
            .join(', ')}
        </span>
      </h3>
      {races === 0 ? (
        <p className="muted">No immediate-or-cancel orders.</p>
      ) : (
        <p>
          <span className="up">{d.races.won} won</span>, <span className="down">{d.races.beaten} beaten</span> by a
          named rival, <span className="muted">{d.races.missed} missed</span> with nobody named:{' '}
          {Math.round((100 * d.races.won) / races)}% won.
        </p>
      )}
      <p className="muted small">
        Fees {money(-d.fees)}
        {d.fines > 0 && <span className="down">, fines {money(-d.fines)}</span>} · equity at the close{' '}
        {moneyShort(d.equityAtClose)}
      </p>
      {((d.halts?.length ?? 0) > 0 || (d.regulator?.length ?? 0) > 0) && (
        <>
          <h3>Risk and the regulator</h3>
          <ul className="small">
            {(d.halts ?? []).map((h, i) => (
              <li key={`h${i}`} className="down">
                Halted: {h}.
              </li>
            ))}
            {(d.regulator ?? []).map((n, i) => (
              <li key={`r${i}`} className="down">
                {n}
              </li>
            ))}
          </ul>
        </>
      )}
      <h3>Rivals</h3>
      <table>
        <tbody>
          {[{ name: 'You', pnl: d.pnl, you: true }, ...d.rivals.map((r) => ({ ...r, you: false }))]
            .sort((a, b) => b.pnl - a.pnl)
            .map((r) => (
              <tr key={r.name} className={r.you ? 'you' : ''}>
                <td>{r.name}</td>
                <td className={`num ${r.pnl >= 0 ? 'up' : 'down'}`}>{money(r.pnl, true)}</td>
              </tr>
            ))}
        </tbody>
      </table>
      <h3>
        <Term id="news">News</Term> <span className="muted">· {d.headlines.length}</span>
      </h3>
      <ul className="small">
        {d.headlines.map((h, i) => (
          <li key={i}>
            {h.text} <span className="muted">· {h.symbols.join(', ')} · </span>
            {h.noise ? (
              <span className="muted">noise</span>
            ) : (
              Object.entries(h.moved).map(([sym, m]) => (
                <span key={sym} className={m > 0 ? 'up' : 'down'}>
                  {sym} {m > 0 ? '+' : ''}
                  {m}¢{' '}
                </span>
              ))
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The day by desk: each desk's fills, and what the night charged it at 17:00 (the currencies' rollover, the metals'
 * storage and lease), so a desk that only held overnight still has its row.
 */
function deskRows(d: DayReport): Row[] {
  const night: Record<string, number> = {};
  if (d.rollover !== undefined) night.fx = d.rollover;
  if (d.storage !== undefined) night.metals = d.storage;
  const ids = [...Object.keys(d.byDesk ?? {}), ...Object.keys(night).filter((k) => !d.byDesk?.[k])];
  return ids.map((k) => [DESK_NAMES[k] ?? k, d.byDesk?.[k] ?? { fills: 0, realised: 0, fees: 0 }, night[k]]);
}

type Row = [string, Tally, number?];

/** `night` adds a column for what 17:00 charged or paid, counted in Net. */
function TallyTable({ rows, night = false, className }: { rows: Row[]; night?: boolean; className?: string }) {
  if (rows.length === 0) return <p className="muted small">Nothing.</p>;
  return (
    <table className={className}>
      <thead>
        <tr>
          <th></th>
          <th className="num">Fills</th>
          <th className="num">Realised</th>
          <th className="num">Fees</th>
          {night && <th className="num">17:00</th>}
          <th className="num">Net</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, t, overnight]) => {
          const total = net(t) + (overnight ?? 0);
          return (
            <tr key={name}>
              <td>{name}</td>
              <td className="num">{t.fills}</td>
              <td className="num">{money(Math.round(t.realised), true)}</td>
              <td className="num muted">{money(-t.fees)}</td>
              {night && <td className="num muted">{overnight === undefined ? '—' : money(overnight, true)}</td>}
              <td className={`num ${total >= 0 ? 'up' : 'down'}`}>{money(Math.round(total), true)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
