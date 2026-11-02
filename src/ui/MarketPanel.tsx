// The market: per stock, what the firm can see of each exchange's book, the last trade, and a chart with both
// exchanges on it so the gap that arbitrage lives on is visible to the eye.

import { useState } from 'react';
import type { Level, Snapshot } from '../sim';
import { Chart, exchangeColour } from './Chart';
import { price, shares } from './format';
import { Term } from './Glossary';

export function MarketPanel({ s }: { s: Snapshot }) {
  const [ladder, setLadder] = useState<string | null>(null);
  return (
    <section className="panel market">
      <h2>
        Market{' '}
        <span className="muted">
          · what you can see,{' '}
          {Object.entries(s.latency)
            .map(([e, l]) => `${e} ${l}ms`)
            .join(', ')}{' '}
          late
        </span>
      </h2>
      {s.stocks.map((st) => (
        <div key={st.symbol} className="stock">
          <div className="stock-head">
            <strong>{st.symbol}</strong>{' '}
            <span className="muted">
              {st.name} · {st.sector}
            </span>
            <span className="muted right">
              <Term id="fair-value">fair</Term> <span className="num">{price(Math.round(st.fair))}</span>
            </span>
          </div>
          <table className="quotes">
            <thead>
              <tr>
                <th>Exchange</th>
                <th className="num">
                  <Term id="bid-ask">Bid</Term>
                </th>
                <th className="num">Ask</th>
                <th className="num">Spread</th>
                <th className="num">Last</th>
                <th className="num">Size</th>
              </tr>
            </thead>
            <tbody>
              {st.exchanges.map((ex) => {
                const key = `${st.symbol}:${ex.id}`;
                const q = ex.seen;
                const spread = q && q.bid !== null && q.ask !== null ? q.ask - q.bid : null;
                return (
                  <tr
                    key={ex.id}
                    onMouseEnter={() => setLadder(key)}
                    onMouseLeave={() => setLadder(null)}
                    className={ladder === key ? 'hover' : ''}
                  >
                    <td>
                      <span className="dot" style={{ background: exchangeColour(ex.id) }} /> {ex.id}
                    </td>
                    <td className="num bid">{price(q?.bid ?? null)}</td>
                    <td className="num ask">{price(q?.ask ?? null)}</td>
                    <td className="num">{spread === null ? '—' : `${spread}¢`}</td>
                    <td className="num">{price(ex.last)}</td>
                    <td className="num muted">{q ? `${shares(q.bidSize)} × ${shares(q.askSize)}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {st.exchanges.map(
            (ex) =>
              ladder === `${st.symbol}:${ex.id}` && (
                <Ladder key={ex.id} exchange={ex.id} bids={ex.depth.bids} asks={ex.depth.asks} />
              ),
          )}
          <Chart history={st.history} exchanges={st.exchanges.map((e) => e.id)} />
        </div>
      ))}
    </section>
  );
}

function Ladder({ exchange, bids, asks }: { exchange: string; bids: Level[]; asks: Level[] }) {
  const rows = Math.max(bids.length, asks.length);
  const mine = (l: Level | undefined) => (l && l.mine > 0 ? <span className="mine">{shares(l.mine)}</span> : '');
  return (
    <div className="ladder">
      <div className="muted">
        <Term id="order-book">Order book</Term> at {exchange}, as it stands now · <span className="mine">yours</span>{' '}
        beside the crowd&apos;s
      </div>
      <table>
        <thead>
          <tr>
            <th className="num">you</th>
            <th className="num">size</th>
            <th className="num">bid</th>
            <th className="num">ask</th>
            <th className="num">size</th>
            <th className="num">you</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i}>
              <td className="num">{mine(bids[i])}</td>
              <td className="num muted">{bids[i] ? shares(bids[i].size) : ''}</td>
              <td className="num bid">{bids[i] ? price(bids[i].price) : ''}</td>
              <td className="num ask">{asks[i] ? price(asks[i].price) : ''}</td>
              <td className="num muted">{asks[i] ? shares(asks[i].size) : ''}</td>
              <td className="num">{mine(asks[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
