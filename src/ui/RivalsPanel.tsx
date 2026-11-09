// The competitors: who else is running the same arbitrage, how fast they are, and how they are doing. The point
// is to see what the player is racing.

import type { Snapshot } from '../sim';
import { moneyShort, ms } from './format';
import { Term } from './Glossary';
import { rivalRows } from './overview';

export function RivalsPanel({ s }: { s: Snapshot }) {
  const rows = [
    {
      id: 'you',
      name: 'You',
      latency: s.latency,
      fills: s.fills.length,
      pnl: s.realised + s.unrealised - s.feesPaid,
      you: true,
    },
    ...s.competitors.map((c) => ({ ...c, you: false })),
  ].sort((a, b) => b.pnl - a.pnl);
  return (
    <div className="rivals">
      <p className="muted">
        Everyone here runs the same <Term id="arbitrage">arbitrage</Term>. The difference is{' '}
        <Term id="latency">latency</Term>.
      </p>
      <table>
        <thead>
          <tr>
            <th>Firm</th>
            {Object.keys(s.latency).map((e) => (
              <th key={e} className="num">
                {e}
              </th>
            ))}
            <th className="num">P&L</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.you ? 'you' : ''}>
              <td>{r.name}</td>
              {Object.keys(s.latency).map((e) => (
                <td key={e} className="num">
                  {ms(r.latency[e] ?? 0)}
                </td>
              ))}
              <td className={`num ${r.pnl >= 0 ? 'up' : 'down'}`}>{moneyShort(Math.round(r.pnl), true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Who they are</h3>
      <table className="rival-cards">
        <thead>
          <tr>
            <th>Rival</th>
            <th>Runs</th>
            <th>Sits at</th>
            <th className="num">Took today</th>
            <th className="num">Took this week</th>
          </tr>
        </thead>
        <tbody>
          {rivalRows(s).map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{r.runs.join(', ')}</td>
              <td>{r.location}</td>
              <td className="num">{taken(r.today)}</td>
              <td className="num">{taken(r.week)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        <Term id="picked-off">Quotes taken off you</Term> are your resting quotes a named rival hit, with how far the
        price ran against them a second later.
      </p>
    </div>
  );
}

function taken(t: { count: number; cents: number }): string {
  if (t.count === 0) return 'none';
  return `${t.count} ${t.count === 1 ? 'quote' : 'quotes'}, ${moneyShort(Math.round(t.cents), true)}`;
}
