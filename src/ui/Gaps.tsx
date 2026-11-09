// The gap, in words: the line under the quotes table where the firm's view is crossed, and the list of the
// gaps it has seen. All of it is read off the snapshot; nothing here decides anything.

import { formatTime, type OrderStory, type Snapshot } from '../sim';
import { ms, price } from './format';
import { Term } from './Glossary';

type Stock = Snapshot['stocks'][number];

/** Cents a share, or pips for a currency pair, with the sign as a minus, not a hyphen. */
function cents(edge: number, pips = false): string {
  return `${edge < 0 ? '−' : ''}${Math.abs(edge).toFixed(2)}${pips ? ' pips' : '¢'}`;
}

/** What a taker pays a share on an exchange: its fee and any tax the rules put on. */
function takerCost(s: Snapshot, id: string): number {
  return (s.exchanges.find((e) => e.id === id)?.feePerShare ?? 0) + (s.rules[id]?.taxPerShare ?? 0);
}

/** The cheapest ask and the dearest bid in the firm's view, on two different exchanges, where they cross. */
function crossed(stock: Stock) {
  let ask: { on: string; p: number } | null = null;
  let bid: { on: string; p: number } | null = null;
  for (const ex of stock.exchanges) {
    const q = ex.seen;
    if (q && q.ask !== null && (!ask || q.ask < ask.p)) ask = { on: ex.id, p: q.ask };
    if (q && q.bid !== null && (!bid || q.bid > bid.p)) bid = { on: ex.id, p: q.bid };
  }
  if (!ask || !bid || ask.on === bid.on || ask.p >= bid.p) return null;
  return { ask, bid };
}

export function GapLine({ s, stock }: { s: Snapshot; stock: Stock }) {
  if (!stock.watched)
    return (
      <p className="gap-line muted">
        Not <Term id="watchlist">watched</Term>: your blocks cannot see {stock.symbol}, so its gaps are not yours.
      </p>
    );
  const c = crossed(stock);
  if (!c) return null;
  const gross = c.bid.p - c.ask.p;
  // A pair's gap is in pips, and its fees (dollar cents a lot) are turned into pips at what a pip of a lot is worth.
  const pips = stock.pair !== undefined;
  const perPoint = stock.pair?.pointValue ?? 1;
  const edge = gross - (takerCost(s, c.ask.on) + takerCost(s, c.bid.on)) / perPoint;
  return (
    <p className="gap-line">
      <Term id="arbitrage">Gap</Term>: buy on {c.ask.on} at {price(c.ask.p, stock.decimals)}, sell on {c.bid.on} at{' '}
      {price(c.bid.p, stock.decimals)} ·{' '}
      {pips ? (
        <>
          {gross} {gross === 1 ? 'pip' : 'pips'},
        </>
      ) : (
        <>{gross}¢ a share,</>
      )}{' '}
      <span className={edge > 0 ? 'up' : 'down'}>
        {cents(edge, pips)} after both <Term id="maker-taker">taker fees</Term>
      </span>
      {edge <= 0 && ': the fees are bigger than the gap'} · as you see it: {c.ask.on} {s.dataLatency[c.ask.on] ?? 0}ms
      ago, {c.bid.on} {s.dataLatency[c.bid.on] ?? 0}ms ago.
    </p>
  );
}

/** "2 sent: 1 filled, 1 beaten by Harbor Quant" for the orders sent while a gap lasted. */
export function orderSummary(orders: OrderStory[], names: Record<string, string>): string {
  const sent = orders.filter((o) => o.status !== 'rejected');
  if (sent.length === 0) return '';
  const counts = new Map<string, number>();
  const add = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const o of sent) {
    const last = o.beatenBy[o.beatenBy.length - 1];
    if (o.filled >= o.size) add('filled');
    else if (last) add(`beaten by ${names[last.owner] ?? last.owner}`);
    else if (o.status === 'inflight') add('on its way');
    else if (o.status === 'resting' || o.status === 'cancelling') add('resting');
    else add('missed');
  }
  return `${sent.length} sent: ${[...counts].map(([k, n]) => `${n} ${k}`).join(', ')}`;
}

export function GapList({ s, stock, onPick }: { s: Snapshot; stock: Stock; onPick: (symbol: string) => void }) {
  const gaps = s.gaps.slice(0, 6);
  return (
    <div className="gaps">
      <h3>Gaps you saw</h3>
      <p className="muted small">
        A gap is one exchange&apos;s ask under another&apos;s bid, in your view. By the time an order reaches them, most
        are gone.
      </p>
      {/* Six rows of a fixed height are kept, so the list does not push the page about as gaps come and go. */}
      <div className="gap-rows">
        {gaps.length === 0 && <p className="muted">No gaps seen yet.</p>}
        {gaps.map((g) => {
          const mine = s.orders.filter(
            (o) =>
              o.symbol === g.symbol && o.sentAt >= g.firstSeen && o.sentAt <= g.lastSeen + s.capacity.decisionEveryMs,
          );
          const summary = orderSummary(mine, s.names);
          const listed = s.stocks.find((x) => x.symbol === g.symbol);
          const places = listed?.decimals;
          return (
            <div
              className={`gap-row ${g.symbol === stock.symbol ? 'picked' : ''}`}
              key={`${g.symbol}:${g.firstSeen}`}
              onClick={() => onPick(g.symbol)}
            >
              <span className="num muted">
                {formatTime(g.firstSeen)}.{String(g.firstSeen % 1000).padStart(3, '0')}
              </span>
              <strong>{g.symbol}</strong>
              <span title={`buy ${g.buyOn} ${price(g.ask, places)} / sell ${g.sellOn} ${price(g.bid, places)}`}>
                buy {g.buyOn} {price(g.ask, places)} / sell {g.sellOn} {price(g.bid, places)}
              </span>
              <span className={`num ${g.edge > 0 ? 'up' : 'down'}`}>
                {g.edge > 0 ? '+' : ''}
                {cents(g.edge, listed?.pair !== undefined)}
              </span>
              <span className="muted">{g.lastSeen === g.firstSeen ? 'one look' : ms(g.lastSeen - g.firstSeen)}</span>
              <span className="muted" title={summary || undefined}>
                {summary || 'you sent nothing'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
