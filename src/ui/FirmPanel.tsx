// The firm: positions, orders on their way or resting, and the fills as they come back with a line on what
// each one was.

import { formatTime, type Fill, type Snapshot } from '../sim';
import { money, price, shares } from './format';
import { Term } from './Glossary';

export function FirmPanel({ s }: { s: Snapshot }) {
  return (
    <section className="panel firm">
      <h2>
        Your firm{' '}
        <span className="muted">
          · <Term id="pnl">P&L</Term> realised {money(s.realised, true)}, unrealised{' '}
          {money(Math.round(s.unrealised), true)}, fees {money(-s.feesPaid)}
          {s.finesPaid > 0 && <span className="down">, fines {money(-s.finesPaid)}</span>}
        </span>
      </h2>
      <div className="firm-grid">
        <div>
          <h3>Positions</h3>
          {s.positions.length === 0 ? (
            <p className="muted">Flat.</p>
          ) : (
            <table>
              <tbody>
                {s.positions.map((p) => (
                  <tr key={p.symbol}>
                    <td>{p.symbol}</td>
                    <td className={`num ${p.qty > 0 ? 'up' : 'down'}`}>{shares(p.qty)}</td>
                    <td className="num muted">@ {price(Math.round(p.avgCost))}</td>
                    <td className={`num ${p.unrealised >= 0 ? 'up' : 'down'}`}>
                      {money(Math.round(p.unrealised), true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h3>
            Orders <span className="muted">({s.openOrders.length})</span>
          </h3>
          {s.openOrders.length === 0 ? (
            <p className="muted">None in flight.</p>
          ) : (
            <table>
              <tbody>
                {s.openOrders.slice(0, 8).map((o) => (
                  <tr key={o.localId}>
                    <td className={o.side === 'buy' ? 'bid' : 'ask'}>{o.side}</td>
                    <td className="num">{shares(o.size - o.filled)}</td>
                    <td>{o.symbol}</td>
                    <td className="num">{price(o.price)}</td>
                    <td className="muted">{o.exchange}</td>
                    <td className="muted">{o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div>
          <h3>
            <Term id="fill">Fills</Term>
          </h3>
          {s.fills.length === 0 ? (
            <p className="muted">Nothing yet. When the market is open and a block fires, each fill lands here.</p>
          ) : (
            <ul className="fills">
              {s.fills.slice(0, 12).map((f) => (
                <li key={f.seq}>
                  <FillLine f={f} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function FillLine({ f }: { f: Fill }) {
  const verb = f.side === 'buy' ? 'bought' : 'sold';
  return (
    <>
      <span className="muted num">{formatTime(f.at)}</span> {verb} <span className="num">{shares(f.size)}</span>{' '}
      {f.symbol} on {f.exchange} at <span className="num">{price(f.price)}</span>
      <span className="muted">
        {' '}
        · {f.block} · fee {money(f.fee)}
        {f.realised !== 0 && (
          <>
            {' '}
            · <span className={f.realised > 0 ? 'up' : 'down'}>{money(Math.round(f.realised), true)} realised</span>
          </>
        )}
      </span>
    </>
  );
}
