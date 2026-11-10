// The options desk on the Market page: the chain of calls and puts on the index, a row a strike and a table an
// expiry, and the straddle's move. The working is in options.ts; this presents it, in room that does not change as
// the quotes do: fixed column widths, fixed-height cells and a dash where a quote is missing, inside a box that
// scrolls by itself at a phone's width.

import { useState } from 'react';
import { OPTIONS_WORDS } from '../content';
import { MS_PER_DAY, type Snapshot } from '../sim';
import { dollarPrice, expiryLabel, price } from './format';
import { Term } from './Glossary';
import { chainOf, chainWatched, straddleOf, timeToGo, watchChain, type ChainCell, type ChainRow } from './options';
import type { Store } from './store';

const dash = '—';

function Cell({
  cell,
  side,
  picked,
  onPick,
}: {
  cell: ChainCell | null;
  side: 'call' | 'put';
  picked: boolean;
  onPick: (symbol: string) => void;
}) {
  const attrs = (col: string, num = true) => ({
    className: `${side} ${col}${num ? ' num' : ''}${picked ? ' picked' : ''}`,
    'data-symbol': cell?.symbol,
    onClick: cell ? () => onPick(cell.symbol) : undefined,
  });
  return (
    <>
      <td {...attrs('bid')}>{cell && cell.bid !== null ? price(cell.bid, 2) : dash}</td>
      <td {...attrs('ask')}>{cell && cell.ask !== null ? price(cell.ask, 2) : dash}</td>
      <td {...attrs('iv')}>{cell && cell.iv !== null ? `${(cell.iv * 100).toFixed(1)}%` : dash}</td>
      <td {...attrs('delta')}>{cell && cell.delta !== null ? cell.delta.toFixed(2) : dash}</td>
    </>
  );
}

function Watch({
  cell,
  full,
  store,
  side,
}: {
  cell: ChainCell | null;
  full: boolean;
  store: Store;
  side: 'call' | 'put';
}) {
  return (
    <td className={`${side} watch`} onClick={(e) => e.stopPropagation()}>
      {cell && (
        <input
          type="checkbox"
          checked={cell.watched}
          disabled={!cell.watched && full}
          onChange={(e) => store.setWatch(cell.symbol, e.target.checked)}
          aria-label={`Watch ${cell.symbol}`}
        />
      )}
    </td>
  );
}

function Row({
  row,
  full,
  store,
  picked,
  onPick,
}: {
  row: ChainRow;
  full: boolean;
  store: Store;
  picked: string | null;
  onPick: (symbol: string) => void;
}) {
  const callPicked = row.call !== null && row.call.symbol === picked;
  const putPicked = row.put !== null && row.put.symbol === picked;
  return (
    <tr data-strike={row.strike} className={callPicked || putPicked ? 'picked' : ''}>
      <Watch cell={row.call} full={full} store={store} side="call" />
      <Cell cell={row.call} side="call" picked={callPicked} onPick={onPick} />
      <td className="strike num">{dollarPrice(row.strike)}</td>
      <Cell cell={row.put} side="put" picked={putPicked} onPick={onPick} />
      <Watch cell={row.put} full={full} store={store} side="put" />
    </tr>
  );
}

/** The chain, its straddle line, its volatility line, the watch line and a legend that links what the page uses. */
export function OptionsDesk({
  s,
  store,
  picked,
  onPick,
}: {
  s: Snapshot;
  store: Store;
  picked: string | null;
  onPick: (symbol: string) => void;
}) {
  const [letGo, setLetGo] = useState<string[] | null>(null);
  const chain = chainOf(s);
  if (!chain) return null;
  const straddle = straddleOf(chain);
  const full = s.watching.count >= s.watching.max;
  const w = chainWatched(s);
  const o = s.options!;
  const today = Math.floor(s.now / MS_PER_DAY);
  const premium = o.atm > 0 && chain.atmIv !== null ? (chain.atmIv - o.realised) * 100 : null;
  return (
    <section className="options-chain" aria-label={OPTIONS_WORDS.heading} data-tut="options">
      <h3>
        Index <Term id="option">options</Term>{' '}
        <span className="muted">· {OPTIONS_WORDS.note(dollarPrice(Math.round(chain.spot)))}</span>
      </h3>
      <p className="straddle-line small">
        {straddle ? (
          <>
            {OPTIONS_WORDS.straddleMove(
              dollarPrice(Math.round(straddle.move)),
              Math.floor(straddle.expiry / MS_PER_DAY) === today
                ? OPTIONS_WORDS.closeToday
                : OPTIONS_WORDS.closeTomorrow,
            )}
            <Term id="premium">premium</Term>
            {OPTIONS_WORDS.straddleRest(dollarPrice(straddle.strike))}
          </>
        ) : (
          <span className="muted">&nbsp;</span>
        )}
      </p>
      <p className="vol-line small">
        {chain.atmIv !== null && premium !== null ? (
          <>
            At the money, <Term id="implied-volatility">implied volatility</Term> {(chain.atmIv * 100).toFixed(1)}%
            against <Term id="realised-volatility">realised</Term> {(o.realised * 100).toFixed(1)}%:{' '}
            <Term id="volatility-premium">a premium of {premium.toFixed(1)} points</Term>{' '}
            <span className="muted">(both on the trading clock)</span>.
          </>
        ) : (
          <span className="muted">{OPTIONS_WORDS.volNone}</span>
        )}
      </p>
      {chain.expiries.map((e, i) => (
        <div key={e.expiry} className="chain-expiry" data-expiry={e.expiry}>
          <h4 className="chain-head">
            <strong>
              {Math.floor(e.expiry / MS_PER_DAY) === today && i === 0
                ? OPTIONS_WORDS.expiryToday
                : OPTIONS_WORDS.expiryNext(expiryLabel(e.expiry))}
            </strong>{' '}
            <span className="muted">
              {Math.floor(e.expiry / MS_PER_DAY) === today && i === 0 ? '16:00 · ' : ''}
              <span className="chain-left">{OPTIONS_WORDS.toGo(timeToGo(e.left))}</span>
            </span>
          </h4>
          <div className="chain-scroll">
            <table className="chain-table">
              <colgroup>
                <col className="c-watch" />
                <col className="c-q" />
                <col className="c-q" />
                <col className="c-iv" />
                <col className="c-d" />
                <col className="c-strike" />
                <col className="c-q" />
                <col className="c-q" />
                <col className="c-iv" />
                <col className="c-d" />
                <col className="c-watch" />
              </colgroup>
              <thead>
                <tr>
                  <th colSpan={5} scope="colgroup" className="call-head">
                    <Term id="call">Calls</Term>
                  </th>
                  <th scope="col" className="strike-head">
                    <Term id="strike">Strike</Term>
                  </th>
                  <th colSpan={5} scope="colgroup" className="put-head">
                    <Term id="put">Puts</Term>
                  </th>
                </tr>
                <tr>
                  <th aria-label="Watch" />
                  <th className="num">Bid</th>
                  <th className="num">Ask</th>
                  <th className="num">
                    <Term id="implied-volatility">IV</Term>
                  </th>
                  <th className="num">
                    <Term id="delta">Δ</Term>
                  </th>
                  <th />
                  <th className="num">Bid</th>
                  <th className="num">Ask</th>
                  <th className="num">
                    <Term id="implied-volatility">IV</Term>
                  </th>
                  <th className="num">
                    <Term id="delta">Δ</Term>
                  </th>
                  <th aria-label="Watch" />
                </tr>
              </thead>
              <tbody>
                {e.rows.map((r) => (
                  <Row key={r.strike} row={r} full={full} store={store} picked={picked} onPick={onPick} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="chain-watching small">
        <span className="muted">{OPTIONS_WORDS.seen(w.watched, w.of, s.watching.count, s.watching.max)}</span>{' '}
        {w.watched < w.of && (
          <button
            type="button"
            className="link"
            title={OPTIONS_WORDS.watchChainTitle}
            onClick={() => {
              const { watch, dropped } = watchChain(s);
              store.setWatchList(watch);
              setLetGo(dropped);
            }}
          >
            {OPTIONS_WORDS.watchChain}
          </button>
        )}
      </p>
      <p className="chain-watch-note small muted">{letGo ? OPTIONS_WORDS.watched(letGo) : ' '}</p>
      <p className="chain-legend small muted">
        A call is <Term id="in-the-money">in the money</Term> with the index above its strike, a put with it below; the
        other way about it is <Term id="out-of-the-money">out of the money</Term>. A price is its{' '}
        <Term id="intrinsic-value">intrinsic value</Term> plus its <Term id="time-value">time value</Term>, and at 16:00
        only the first is left, paid in <Term id="cash-settlement">cash</Term>. Lower strikes carry a higher{' '}
        <Term id="implied-volatility">IV</Term>: the <Term id="skew">skew</Term>. Across a strike a call less a put is
        the future less the strike (<Term id="put-call-parity">put-call parity</Term>), and a{' '}
        <Term id="conversion">conversion</Term> trades the gap. A release ahead holds the IV up and takes it away when
        it lands: <Term id="the-crush">the crush</Term>.
      </p>
    </section>
  );
}
