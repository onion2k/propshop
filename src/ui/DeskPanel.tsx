// The desk: a person at the keyboard. A chart of the chosen stock, a ticket, and the hand orders with what each
// cost against the price on the screen when it was clicked. The order waits the firm's reaction time before it
// leaves; the wait is shown counting down on the sim clock. All the arithmetic is the sim's: this only presents.

import { useState } from 'react';
import { BEST, formatTime, type OrderStory, type Snapshot } from '../sim';
import { CONTENT } from '../content';
import { Chart } from './Chart';
import { money, ms, pointsFrom, price, priceStep, shares } from './format';
import { Term } from './Glossary';
import { Race } from './Race';
import type { Store } from './store';

/** How many hand orders the list shows. */
const SHOWN = 5;
const DEFAULT_SIZE = 5000;

/** The slippage line's words for one order: the touch at the click, at the arrival, the fill, and the difference. */
export function slippageLine(o: OrderStory, decimals = 2): string {
  if (o.status === 'rejected' || o.status === 'refused') return 'no fill, so no slippage.';
  const click = o.clickTouch ?? null;
  const parts = [
    `touch at your click ${price(click, decimals)}`,
    `at arrival ${price(o.arrivalTouch ?? null, decimals)}`,
    o.avgFill === null ? 'no fill yet' : `filled at ${price(Math.round(o.avgFill), decimals)}`,
  ];
  const slip = o.slippage;
  let verdict = '';
  if (slip !== null) {
    const c = Math.abs(slip).toFixed(1);
    verdict = slip > 0.05 ? `: ${c}¢ a share against you` : slip < -0.05 ? `: ${c}¢ a share in your favour` : ': none';
  }
  return `${parts.join(', ')}${verdict}`;
}

export function DeskPanel({ s, store }: { s: Snapshot; store: Store }) {
  const watched = s.stocks.filter((st) => st.watched);
  const choices = watched.length > 0 ? watched : s.stocks;
  const [symbol, setSymbol] = useState<string | null>(null);
  const stock = s.stocks.find((st) => st.symbol === symbol) ?? choices[0];
  const [exchange, setExchange] = useState<string>(BEST);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [size, setSize] = useState(String(DEFAULT_SIZE));
  const [type, setType] = useState<'market' | 'limit'>('market');
  const [limit, setLimit] = useState('');
  const [postOnly, setPostOnly] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const halted = s.halt !== null && s.now < s.halt.until;
  const blocked = !s.open ? 'market closed' : halted ? `halted: ${s.halt!.reason}` : null;
  const handOrders = s.orders.filter((o) => o.block === 'hand').slice(0, SHOWN);
  const pending = s.pendingHand;
  const cost = s.handSlippage;

  const send = () => {
    if (!stock) return;
    const points = pointsFrom(limit, stock.decimals);
    const result = store.hand({
      symbol: stock.symbol,
      side,
      size: Number(size),
      exchange,
      type,
      ...(type === 'limit' ? { price: points, ...(postOnly ? { postOnly: true } : {}) } : {}),
    });
    setRefusal(result.ok ? null : result.reason);
  };

  return (
    <section className="panel desk">
      <h2>
        Desk{' '}
        <span className="muted">
          · you, at the keyboard: a click takes {ms(CONTENT.desk.reactionMs)} to become an order
        </span>
      </h2>
      {stock && (
        <>
          <div className="stock-head">
            <strong>{stock.symbol}</strong> <span className="muted">{stock.name}</span>
            <span className="muted right">
              <span className="num bid">{price(stock.bid, stock.decimals)}</span> /{' '}
              <span className="num ask">{price(stock.ask, stock.decimals)}</span>
            </span>
          </div>
          <Chart history={stock.history} exchanges={stock.exchanges.map((e) => e.id)} decimals={stock.decimals} />
        </>
      )}
      <form
        className="ticket"
        data-tut="desk-ticket"
        onSubmit={(e) => {
          e.preventDefault();
          if (!blocked) send();
        }}
      >
        <label>
          <span className="small muted">Stock</span>
          <select value={stock?.symbol ?? ''} onChange={(e) => setSymbol(e.target.value)} aria-label="Stock">
            {choices.map((st) => (
              <option key={st.symbol} value={st.symbol}>
                {st.symbol}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="small muted">Exchange</span>
          <select value={exchange} onChange={(e) => setExchange(e.target.value)} aria-label="Exchange">
            <option value={BEST}>Best</option>
            {s.exchanges.map((x) => (
              <option key={x.id} value={x.id}>
                {x.id}
              </option>
            ))}
          </select>
        </label>
        <div className="seg" role="group" aria-label="Side">
          {(['buy', 'sell'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={side === v ? 'on' : ''}
              aria-pressed={side === v}
              onClick={() => setSide(v)}
            >
              {v === 'buy' ? 'Buy' : 'Sell'}
            </button>
          ))}
        </div>
        <label>
          <span className="small muted">Size</span>
          <input
            type="number"
            min={1}
            step={1}
            value={size}
            onChange={(e) => setSize(e.target.value)}
            aria-label="Size"
          />
        </label>
        <div className="seg" role="group" aria-label="Order type">
          {(['market', 'limit'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={type === v ? 'on' : ''}
              aria-pressed={type === v}
              onClick={() => setType(v)}
            >
              {v === 'market' ? 'Market' : 'Limit'}
            </button>
          ))}
        </div>
        {type === 'limit' && (
          <>
            <label>
              <span className="small muted">Price</span>
              <input
                type="number"
                min={priceStep(stock?.decimals)}
                step={priceStep(stock?.decimals)}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                aria-label="Limit price"
              />
            </label>
            <label className="check small">
              <input type="checkbox" checked={postOnly} onChange={(e) => setPostOnly(e.target.checked)} /> post only
            </label>
          </>
        )}
        <button type="submit" className="on send" disabled={blocked !== null}>
          Send
        </button>
        <p className="ticket-note small" role="status">
          {blocked && <span className="down">{blocked}</span>}
          {!blocked && refusal && <span className="down">Refused: {refusal}.</span>}
        </p>
      </form>
      {pending.length > 0 && (
        <ul className="pending small" aria-label="Orders waiting to be sent">
          {pending.map((p) => (
            <li key={p.clickedAt + ':' + p.children[0]?.exchange}>
              {p.children[0]?.side} {p.children[0]?.symbol} · sending in{' '}
              <span className="num">{ms(Math.max(0, p.dueAt - s.now))}</span>
            </li>
          ))}
        </ul>
      )}
      <h3>
        Your hand orders{' '}
        <span className="muted">
          · <Term id="latency">latency</Term>, then the <Term id="order-anticipation">rivals who read you</Term>
        </span>
      </h3>
      <p className="hand-total" data-testid="hand-total">
        Hand trading today: <span className={cost > 0 ? 'down' : 'up'}>{money(-cost, true)}</span> against the quote at
        the click
      </p>
      {handOrders.length === 0 ? (
        <p className="muted">
          Nothing sent yet. A big market order shows its price at the click, at arrival and as filled; the gap is{' '}
          <Term id="slippage">slippage</Term>, and a quote that vanishes as you reach for it is{' '}
          <Term id="quote-fade">quote fade</Term>.
        </p>
      ) : (
        <ul className="orders">
          {handOrders.map((o) => {
            const places = s.stocks.find((x) => x.symbol === o.symbol)?.decimals;
            return (
              <li key={o.localId} data-id={o.localId}>
                <div className="order-line">
                  <span className="muted num">{formatTime(o.sentAt)}</span>{' '}
                  <span className={o.side === 'buy' ? 'bid' : 'ask'}>{o.side}</span>{' '}
                  <span className="num">{shares(o.size)}</span> {o.symbol} on {o.exchange} at{' '}
                  <span className="num">{price(o.price, places)}</span>
                  <span className="muted">{o.ioc ? ' · market' : ' · limit'}</span>
                  {o.status === 'refused' && (
                    <span className="down">
                      {' '}
                      · <Term id="last-look">refused</Term>
                    </span>
                  )}
                </div>
                <Race o={o} names={s.names} now={s.now} decimals={places} />
                <div className="slippage small">
                  <Term id="slippage">Slippage</Term>: {slippageLine(o, places)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="muted small">
        A rival taking shares ahead of you, or a quote that is gone, is <Term id="quote-fade">quote fade</Term> and{' '}
        <Term id="order-anticipation">order anticipation</Term> at work. Real retail orders are often sold to a
        wholesaler (<Term id="payment-for-order-flow">payment for order flow</Term>); here they go to the exchanges.
      </p>
    </section>
  );
}
