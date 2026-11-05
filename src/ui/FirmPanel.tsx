// The firm: positions, and each recent order with the story of its race.

import { useState } from 'react';
import { formatTime, type OrderStory, type Snapshot } from '../sim';
import { exchangeColour } from './Chart';
import { money, ms, price, shares } from './format';
import { Term } from './Glossary';
import { Race } from './Race';

const LEGEND = [
  ['saw', 'saw the quote'],
  ['sent', 'sent'],
  ['beaten', 'a rival took it'],
  ['arrived', 'arrived'],
  ['heard', 'heard back'],
] as const;

/** How many orders the list shows. A fast block sends several a second; the scorecard holds the rest. */
const SHOWN = 5;

/** The finished immediate-or-cancel races: the ones with a winner, a loser or a miss. */
function counted(orders: OrderStory[]): OrderStory[] {
  return orders.filter(
    (o) => o.ioc && o.ackAt !== null && o.status !== 'inflight' && o.status !== 'resting' && o.status !== 'cancelling',
  );
}

function Scorecard({ s }: { s: Snapshot }) {
  const races = counted(s.orders);
  if (races.length === 0) return null;
  return (
    <div className="scorecard">
      <h3>
        Races by exchange <span className="muted">· your last {races.length}</span>
      </h3>
      <table>
        <thead>
          <tr>
            <th>Exchange</th>
            <th className="num">
              <Term id="latency">latency</Term>
            </th>
            <th className="num">won</th>
            <th className="num">beaten</th>
            <th className="num">missed</th>
            <th className="num">win rate</th>
          </tr>
        </thead>
        <tbody>
          {s.exchanges.map((e) => {
            const mine = races.filter((o) => o.exchange === e.id);
            const won = mine.filter((o) => o.filled >= o.size).length;
            const beaten = mine.filter((o) => o.filled < o.size && o.beatenBy.length > 0).length;
            return (
              <tr key={e.id}>
                <td>
                  <span className="dot" style={{ background: exchangeColour(e.id) }} /> {e.id}
                </td>
                <td className="num">{ms(s.latency[e.id] ?? 0)}</td>
                <td className="num">{won}</td>
                <td className="num">{beaten}</td>
                <td className="num">{mine.length - won - beaten}</td>
                <td className="num">{mine.length === 0 ? '—' : `${Math.round((won / mine.length) * 100)}%`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small">
        The nearer the exchange, the more you win: every millisecond is a race you lose to someone nearer.
      </p>
    </div>
  );
}

/** `races` is whether the race under each order and the scorecard are shown (from stage 2). */
export function FirmPanel({ s, races = true }: { s: Snapshot; races?: boolean }) {
  // The list is held still while the pointer is over it, so a race can be read before the next replaces it.
  const [held, setHeld] = useState<{ orders: OrderStory[]; now: number } | null>(null);
  const shown = held ?? { orders: s.orders.slice(0, SHOWN), now: s.now };
  const net = Math.round(s.realised + Math.round(s.unrealised) - s.feesPaid - s.finesPaid);
  return (
    <section className="panel firm" data-tut="firm">
      <h2>
        Your firm{' '}
        <span className="muted">
          · <Term id="pnl">P&L</Term> realised {money(s.realised, true)}, unrealised{' '}
          {money(Math.round(s.unrealised), true)}, fees {money(-s.feesPaid)}
          {s.finesPaid > 0 && <span className="down">, fines {money(-s.finesPaid)}</span>}
          {' · '}
          <span className={net >= 0 ? 'up' : 'down'}>net {money(net, true)}</span>
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
      {races && <Scorecard s={s} />}
      <h3>
        Orders{' '}
        <span className="muted">
          · your newest {SHOWN}, each one's race · <Term id="latency">latency</Term>
          {held && ' · held while you look'}
        </span>
      </h3>
      {s.orders.length === 0 ? (
        <p className="muted">
          Nothing yet. When the market is open and a block fires, each order lands here with what happened to it.
        </p>
      ) : (
        <>
          {races && (
            <p className="race-legend small muted">
              {LEGEND.map(([cls, label]) => (
                <span key={cls}>
                  <i className={`swatch ${cls}`} /> {label}
                </span>
              ))}
            </p>
          )}
          <ul className="orders" onMouseEnter={() => setHeld(shown)} onMouseLeave={() => setHeld(null)}>
            {shown.orders.map((o) => (
              <li key={o.localId} data-id={o.localId}>
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
                {races && <Race o={o} names={s.names} now={shown.now} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
