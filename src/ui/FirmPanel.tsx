// The firm: positions, and each recent order with the story of its race.

import { formatTime, type Snapshot } from '../sim';
import { money, price, shares } from './format';
import { Term } from './Glossary';
import { Race } from './Race';

export function FirmPanel({ s }: { s: Snapshot }) {
  return (
    <section className="panel firm" data-tut="firm">
      <h2>
        Your firm{' '}
        <span className="muted">
          · <Term id="pnl">P&L</Term> realised {money(s.realised, true)}, unrealised{' '}
          {money(Math.round(s.unrealised), true)}, fees {money(-s.feesPaid)}
          {s.finesPaid > 0 && <span className="down">, fines {money(-s.finesPaid)}</span>}
        </span>
      </h2>
      <h3>Positions</h3>
      {s.positions.length === 0 ? (
        <p className="muted">Flat.</p>
      ) : (
        <table className="positions">
          <tbody>
            {s.positions.map((p) => (
              <tr key={p.symbol}>
                <td>{p.symbol}</td>
                <td className={`num ${p.qty > 0 ? 'up' : 'down'}`}>{shares(p.qty)}</td>
                <td className="num muted">@ {price(Math.round(p.avgCost))}</td>
                <td className={`num ${p.unrealised >= 0 ? 'up' : 'down'}`}>{money(Math.round(p.unrealised), true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3>
        Orders{' '}
        <span className="muted">
          · each one's race, newest first · <Term id="latency">latency</Term>
        </span>
      </h3>
      {s.orders.length === 0 ? (
        <p className="muted">
          Nothing yet. When the market is open and a block fires, each order lands here with what happened to it.
        </p>
      ) : (
        <ul className="orders">
          {s.orders.slice(0, 12).map((o) => (
            <li key={o.localId}>
              <div className="order-line">
                <span className="muted num">{formatTime(o.sentAt)}</span>{' '}
                <span className={o.side === 'buy' ? 'bid' : 'ask'}>{o.side}</span>{' '}
                <span className="num">{shares(o.size)}</span> {o.symbol} on {o.exchange} at{' '}
                <span className="num">{price(o.price)}</span>
                <span className="muted">
                  {' '}
                  · {o.block}
                  {o.ioc ? '' : ' · limit'}
                </span>
              </div>
              <Race o={o} names={s.names} now={s.now} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
