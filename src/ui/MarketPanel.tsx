// The market: a watchlist of every symbol, with what the firm can see of each and a tick to watch it, and the
// selected symbol's exchange rows, ladder and chart beneath. What is watched is what the blocks see, and the
// computer says how many that may be.

import { useState } from 'react';
import { TICK_MS, type Level, type Snapshot } from '../sim';
import { Chart, exchangeColour } from './Chart';
import { expiryLabel, money, moneyShort, pointsInCents, price, priceDelta, shares } from './format';
import { GapLine, GapList } from './Gaps';
import { Term } from './Glossary';
import { CurveView, FixLine } from './MetalsDesk';
import { goldSilverRatio } from './metals';
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
              <td className="muted col-sector">
                {st.contract
                  ? `future on ${st.contract.underlying}, ${expiryLabel(st.contract.expiry)}`
                  : st.pair
                    ? pairLabel(st.pair, st.name)
                    : st.metal
                      ? `spot, ${st.metal.ounces} oz a lot`
                      : st.constituents
                        ? `index of ${st.constituents.length}`
                        : st.sector}
              </td>
              <td className="num bid">{price(st.bid, st.decimals)}</td>
              <td className="num ask">{price(st.ask, st.decimals)}</td>
              <td className={`num ${st.dayChange === null ? 'muted' : st.dayChange >= 0 ? 'up' : 'down'}`}>
                {st.dayChange === null ? '—' : priceDelta(st.dayChange, st.decimals)}
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
              {selected.contract ? (
                <>
                  <Term id="future">future</Term> on {selected.contract.underlying}, {selected.contract.multiplier} to a
                  contract, <Term id="expiry">expires</Term> {expiryLabel(selected.contract.expiry)}
                </>
              ) : selected.pair ? (
                <>
                  {selected.pair.cross ? (
                    <>
                      <Term id="cross-rate">cross rate</Term> of{' '}
                      {selected.pair.cross.map((l) => `${l.base}/${l.quote}`).join(' and ')}
                    </>
                  ) : (
                    <Term id="currency-pair">currency pair</Term>
                  )}
                  {' · '}a <Term id="lot">lot</Term> is {selected.pair.lot.toLocaleString('en-US')} {selected.pair.base}
                  , the <Term id="base-quote">base</Term>, priced in {selected.pair.quote} <Term id="pip">pips</Term>
                </>
              ) : selected.metal ? (
                <>
                  <Term id="spot">spot</Term>, a <Term id="lot">lot</Term> is {selected.metal.ounces} oz, priced in
                  dollars an ounce
                  <GoldSilver s={s} />
                </>
              ) : selected.constituents ? (
                `index of ${selected.constituents.join(', ')}`
              ) : selected.sector === 'mining' ? (
                <>
                  mining: a <Term id="miner">miner</Term>, which gold reads
                </>
              ) : (
                selected.sector
              )}
            </span>
            <span className="muted right">
              <Term id="fair-value">fair</Term>{' '}
              <span className="num">{price(Math.round(selected.fair), selected.decimals)}</span>
            </span>
          </div>
          {selected.contract && (
            <p className="contract-line small muted">
              {selected.contract.delivery ? (
                <>
                  <Term id="basis">basis</Term>{' '}
                  <span className="num">
                    {money(
                      pointsInCents(
                        selected.contract.basis,
                        s.stocks.find((x) => x.symbol === selected.contract!.underlying)?.decimals,
                      ),
                      true,
                    )}
                  </span>{' '}
                  an ounce over spot (<Term id="carry">carry</Term> {(selected.contract.carry * 100).toFixed(1)}% a year
                  to expiry) · <Term id="delivery">delivered</Term> as {selected.contract.underlying} if held at expiry
                </>
              ) : (
                <>
                  <Term id="basis">basis</Term> <span className="num">{selected.contract.basis.toFixed(1)}¢</span> over
                  the index (<Term id="carry">carry</Term> {(selected.contract.carry * 100).toFixed(1)}% a year to
                  expiry)
                </>
              )}
              {selected.contract.margin && (
                <>
                  {' · '}
                  <Term id="margin">margin</Term>{' '}
                  <span className="num">{moneyShort(selected.contract.margin.initial)}</span> a contract to open,{' '}
                  <span className="num">{moneyShort(selected.contract.margin.maintenance)}</span> to keep
                </>
              )}
            </p>
          )}
          <CurveView s={s} symbol={selected.symbol} />
          <FixLine s={s} symbol={selected.symbol} />
          {/* Prices of four figures before the point (gold) are two characters wider than a stock's: their table is
              set tighter, so it still fits its panel at a desk's width. */}
          <table
            className={`quotes ${selected.fair / 10 ** selected.decimals >= 1000 ? 'wide-prices' : ''}`}
            data-tut="quotes"
          >
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
                const places = selected.decimals;
                return (
                  <tr
                    key={ex.id}
                    onMouseEnter={() => setLadder(key)}
                    onMouseLeave={() => setLadder(null)}
                    className={ladder === key ? 'hover' : ''}
                  >
                    <td>
                      <span className="dot" style={{ background: exchangeColour(ex.id) }} />{' '}
                      {/* A dealer's name links to what a dealer is, taking no more room than the name. */}
                      {s.exchanges.find((x) => x.id === ex.id)?.dealer ? <Term id="dealer">{ex.id}</Term> : ex.id}
                    </td>
                    <td className={`num bid ${bestBid ? 'best' : ''}`}>{price(q?.bid ?? null, places)}</td>
                    <td className={`num ask ${bestAsk ? 'best' : ''}`}>{price(q?.ask ?? null, places)}</td>
                    <td className="num col-spread">
                      {spread === null
                        ? '—'
                        : selected.pair
                          ? `${spread} pip${spread === 1 ? '' : 's'}`
                          : `${pointsInCents(spread, places)}¢`}
                    </td>
                    <td className="num muted col-now">
                      {live
                        ? 'live'
                        : nowBid === null && nowAsk === null
                          ? '—'
                          : `${price(nowBid, places)} / ${price(nowAsk, places)}`}
                    </td>
                    <td className="num">{price(ex.last, places)}</td>
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
                <Ladder
                  key={ex.id}
                  exchange={ex.id}
                  bids={ex.depth.bids}
                  asks={ex.depth.asks}
                  decimals={selected.decimals}
                />
              ),
          )}
          <Chart
            history={selected.history}
            exchanges={selected.exchanges.map((e) => e.id)}
            decimals={selected.decimals}
          />
        </div>
      )}
    </section>
  );
}

function Ladder({
  exchange,
  bids,
  asks,
  decimals,
}: {
  exchange: string;
  bids: Level[];
  asks: Level[];
  decimals: number;
}) {
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
              <td className="num bid">{bids[i] ? price(bids[i].price, decimals) : ''}</td>
              <td className="num ask">{asks[i] ? price(asks[i].price, decimals) : ''}</td>
              <td className="num muted">{asks[i] ? shares(asks[i].size) : ''}</td>
              <td className="num">{mine(asks[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** What a pair is, in the watchlist's words: "euro in dollars", or "cross of EUR/USD and USD/JPY". */
function pairLabel(pair: NonNullable<Snapshot['stocks'][number]['pair']>, name: string): string {
  if (pair.cross) return `cross of ${pair.cross.map((l) => `${l.base}/${l.quote}`).join(' and ')}`;
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** The gold-silver ratio beside a metal's name, while both metals are listed. */
function GoldSilver({ s }: { s: Snapshot }) {
  const r = goldSilverRatio(s);
  if (r === null) return null;
  return (
    <>
      {' · '}
      <Term id="gold-silver-ratio">gold-silver ratio</Term> <span className="num">{r.toFixed(1)}</span>
    </>
  );
}
