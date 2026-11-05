// The market: a watchlist of every symbol, with what the firm can see of each and a tick to watch it, and the
// selected symbol's exchange rows, ladder and chart beneath. What is watched is what the blocks see, and the
// computer says how many that may be.

import { useState } from 'react';
import { TICK_MS, type Level, type Snapshot } from '../sim';
import { Chart, exchangeColour } from './Chart';
import { price, shares } from './format';
import { GapLine, GapList } from './Gaps';
import { Term } from './Glossary';
import type { Store } from './store';

export function MarketPanel({
  s,
  store,
  picked,
  onPick,
  gaps = true,
}: {
  s: Snapshot;
  store: Store;
  picked: string | null;
  onPick: (symbol: string) => void;
  /** Whether the gap counter, line and list are shown (from stage 2). */
  gaps?: boolean;
}) {
  const [ladder, setLadder] = useState<string | null>(null);
  const selected = s.stocks.find((st) => st.symbol === picked) ?? s.stocks.find((st) => st.watched) ?? s.stocks[0];
  const seenBids = selected?.exchanges.flatMap((ex) => (ex.seen && ex.seen.bid !== null ? [ex.seen.bid] : [])) ?? [];
  const seenAsks = selected?.exchanges.flatMap((ex) => (ex.seen && ex.seen.ask !== null ? [ex.seen.ask] : [])) ?? [];
  const topBid = seenBids.length ? Math.max(...seenBids) : null;
  const topAsk = seenAsks.length ? Math.min(...seenAsks) : null;
  const full = s.watching.count >= s.watching.max;
  return (
    <section className="panel market">
      <h2>
        Market{' '}
        <span className="muted">
          · <Term id="watchlist">watching</Term> {s.watching.count} of {s.watching.max} · what you can see is{' '}
          {Object.entries(s.dataLatency)
            .map(([e, l]) => `${e} ${l}ms`)
            .join(', ')}{' '}
          late
          {gaps && (
            <>
              {' · '}
              <span className="num slot-short">{s.gapsSeen}</span> gaps seen
            </>
          )}
        </span>
      </h2>
      <table className="watchlist" data-tut="watchlist">
        <thead>
          <tr>
            <th>Watch</th>
            <th>Symbol</th>
            <th className="col-sector">Sector</th>
            <th className="num">
              <Term id="bid-ask">Bid</Term>
            </th>
            <th className="num">Ask</th>
            <th className="num">Day</th>
          </tr>
        </thead>
        <tbody>
          {s.stocks.map((st) => (
            <tr
              key={st.symbol}
              className={`${st.symbol === selected?.symbol ? 'picked' : ''} ${st.watched ? '' : 'unwatched'}`}
              onClick={() => onPick(st.symbol)}
            >
              <td onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={st.watched}
                  disabled={!st.watched && full}
                  onChange={(e) => store.setWatch(st.symbol, e.target.checked)}
                  aria-label={`Watch ${st.symbol}`}
                />
              </td>
              <td>
                <strong>{st.symbol}</strong> <span className="muted small col-name">{st.name}</span>
              </td>
              <td className="muted col-sector">{st.constituents ? `index of ${st.constituents.length}` : st.sector}</td>
              <td className="num bid">{price(st.bid)}</td>
              <td className="num ask">{price(st.ask)}</td>
              <td className={`num ${st.dayChange === null ? 'muted' : st.dayChange >= 0 ? 'up' : 'down'}`}>
                {st.dayChange === null ? '—' : `${st.dayChange >= 0 ? '+' : ''}${(st.dayChange / 100).toFixed(2)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected && (
        <div className="stock" data-symbol={selected.symbol}>
          <div className="stock-head">
            <strong>{selected.symbol}</strong>{' '}
            <span className="muted">
              {selected.name} ·{' '}
              {selected.constituents ? `index of ${selected.constituents.join(', ')}` : selected.sector}
            </span>
            <span className="muted right">
              <Term id="fair-value">fair</Term> <span className="num">{price(Math.round(selected.fair))}</span>
            </span>
          </div>
          <table className="quotes" data-tut="quotes">
            <thead>
              <tr>
                <th>Exchange</th>
                <th className="num">Bid</th>
                <th className="num">Ask</th>
                <th className="num col-spread">Spread</th>
                <th className="num col-now">
                  <Term id="latency">now</Term>
                </th>
                <th className="num">Last</th>
                <th className="num col-size">Size</th>
              </tr>
            </thead>
            <tbody>
              {selected.exchanges.map((ex) => {
                const key = `${selected.symbol}:${ex.id}`;
                const q = ex.seen;
                const bestBid = q?.bid === topBid && topBid !== null;
                const bestAsk = q?.ask === topAsk && topAsk !== null;
                const live = (s.dataLatency[ex.id] ?? 0) <= TICK_MS;
                const nowBid = ex.depth.bids[0]?.price ?? null;
                const nowAsk = ex.depth.asks[0]?.price ?? null;
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
                    <td className={`num bid ${bestBid ? 'best' : ''}`}>{price(q?.bid ?? null)}</td>
                    <td className={`num ask ${bestAsk ? 'best' : ''}`}>{price(q?.ask ?? null)}</td>
                    <td className="num col-spread">{spread === null ? '—' : `${spread}¢`}</td>
                    <td className="num muted col-now">
                      {live ? 'live' : nowBid === null && nowAsk === null ? '—' : `${price(nowBid)} / ${price(nowAsk)}`}
                    </td>
                    <td className="num">{price(ex.last)}</td>
                    <td className="num muted col-size">{q ? `${shares(q.bidSize)} × ${shares(q.askSize)}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {gaps && (
            <div data-tut="gaps">
              <GapLine s={s} stock={selected} />
              <GapList s={s} stock={selected} onPick={onPick} />
            </div>
          )}
          {selected.exchanges.map(
            (ex) =>
              ladder === `${selected.symbol}:${ex.id}` && (
                <Ladder key={ex.id} exchange={ex.id} bids={ex.depth.bids} asks={ex.depth.asks} />
              ),
          )}
          <Chart history={selected.history} exchanges={selected.exchanges.map((e) => e.id)} />
        </div>
      )}
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
