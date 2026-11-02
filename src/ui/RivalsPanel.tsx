// The competitors: who else is running the same arbitrage, how fast they are, and how they are doing. The point
// is to see what the player is racing.

import type { Snapshot } from '../sim';
import { moneyShort, ms } from './format';
import { Term } from './Glossary';

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
    </div>
  );
}
