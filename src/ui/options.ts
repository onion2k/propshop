// The options desk as the Market page reads it: the chain (rows by strike, a call and a put for each expiry, bid and
// ask, implied volatility and delta), the straddle's move, and the watch list the chain's shortcut writes. Pure working
// over the snapshot; the components only present it. The implied volatility is inverted here from the middle of the
// book the firm sees (`impliedFrom`), and the delta is the model's at it: nothing is asked of the sim.

import { MS_PER_HOUR, MS_PER_MINUTE, MS_PER_YEAR, impliedFrom, optionDelta, tradingVol, type Snapshot } from '../sim';

type Stock = Snapshot['stocks'][number];

export interface ChainCell {
  symbol: string;
  /** In the option's points (cents of the index), as the firm sees the book; null where a side is empty. */
  bid: number | null;
  ask: number | null;
  /** The model's fair value, kept for the straddle where a book has no middle. */
  fair: number;
  /** Annual on the trading clock (comparable with the realised figure), from the middle of the book; null where the book has no middle or no volatility fits it. */
  iv: number | null;
  /** The model's delta at that volatility; null where there is no volatility. */
  delta: number | null;
  watched: boolean;
}

export interface ChainRow {
  strike: number;
  call: ChainCell | null;
  put: ChainCell | null;
}

export interface ChainExpiry {
  expiry: number;
  /** Ms from now. */
  left: number;
  /** By strike, lowest first. */
  rows: ChainRow[];
}

export interface Chain {
  underlying: string;
  /** The underlying's fair value now, in points. */
  spot: number;
  /** Soonest expiry first. */
  expiries: ChainExpiry[];
  /** Implied volatility at the money for the soonest expiry, from the books; null where there is none. */
  atmIv: number | null;
}

function cellOf(
  st: Stock,
  spot: number,
  strike: number,
  expiry: number,
  now: number,
  rate: number,
  closedWeight: number,
): ChainCell {
  const quoted = st.bid !== null && st.ask !== null;
  const t = Math.max(0, expiry - now) / MS_PER_YEAR;
  const right = st.option!.right;
  const iv = quoted ? impliedFrom(right, (st.bid! + st.ask!) / 2, spot, strike, t, rate) : null;
  return {
    symbol: st.symbol,
    bid: st.bid,
    ask: st.ask,
    fair: st.fair,
    // Quoted on the trading clock, as the realised figure is; the delta is the model's, on the calendar's.
    iv: iv === null ? null : tradingVol(iv, now, expiry, closedWeight),
    delta: iv === null ? null : optionDelta(right, spot, strike, t, iv, rate),
    watched: st.watched,
  };
}

/** The chain from the snapshot, or undefined while the options desk is closed. */
export function chainOf(s: Snapshot): Chain | undefined {
  const o = s.options;
  if (!o) return undefined;
  const byExpiry = new Map<number, Map<number, ChainRow>>();
  for (const st of s.stocks) {
    const opt = st.option;
    if (!opt) continue;
    const rows = byExpiry.get(opt.expiry) ?? new Map<number, ChainRow>();
    const row = rows.get(opt.strike) ?? { strike: opt.strike, call: null, put: null };
    const cell = cellOf(st, o.spot, opt.strike, opt.expiry, s.now, o.rate, o.closedWeight);
    if (opt.right === 'call') row.call = cell;
    else row.put = cell;
    rows.set(opt.strike, row);
    byExpiry.set(opt.expiry, rows);
  }
  const expiries = [...byExpiry.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([expiry, rows]) => ({
      expiry,
      left: expiry - s.now,
      rows: [...rows.values()].sort((a, b) => a.strike - b.strike),
    }));
  const chain: Chain = { underlying: o.underlying, spot: o.spot, expiries, atmIv: null };
  chain.atmIv = atmIvOf(chain);
  return chain;
}

/** The row nearest the underlying, the first of two equally near. */
function nearestRow(e: ChainExpiry, spot: number): ChainRow | undefined {
  return e.rows.reduce<ChainRow | undefined>(
    (best, r) => (best === undefined || Math.abs(r.strike - spot) < Math.abs(best.strike - spot) ? r : best),
    undefined,
  );
}

/** The soonest expiry that has not passed. */
function soonest(chain: Chain): ChainExpiry | undefined {
  return chain.expiries.find((e) => e.left > 0);
}

/** The at-the-money implied volatility of the soonest expiry: the call's and put's at the nearest strike, averaged. */
function atmIvOf(chain: Chain): number | null {
  const e = soonest(chain);
  const row = e && nearestRow(e, chain.spot);
  if (!row) return null;
  const ivs = [row.call?.iv, row.put?.iv].filter((x): x is number => x !== null && x !== undefined);
  return ivs.length === 0 ? null : ivs.reduce((n, x) => n + x, 0) / ivs.length;
}

export interface Straddle {
  expiry: number;
  strike: number;
  /** The call's price plus the put's, the points of the index. */
  price: number;
  /** The move the market expects by the expiry, in the index's points: the straddle's price. */
  move: number;
}

/** The middle of a book, else the model's fair value. */
function middle(c: ChainCell): number {
  return c.bid !== null && c.ask !== null ? (c.bid + c.ask) / 2 : c.fair;
}

/** The straddle at the strike nearest the index on the soonest expiry: what the market expects the index to move by then. */
export function straddleOf(chain: Chain): Straddle | null {
  const e = soonest(chain);
  const row = e && nearestRow(e, chain.spot);
  if (!e || !row || !row.call || !row.put) return null;
  const price = middle(row.call) + middle(row.put);
  return { expiry: e.expiry, strike: row.strike, price, move: price };
}

/** Time to go in the largest two units: "5h 30m", "42m 10s", "58s"; "expired" once there is none. */
export function timeToGo(left: number): string {
  if (left <= 0) return 'expired';
  const h = Math.floor(left / MS_PER_HOUR);
  const m = Math.floor((left % MS_PER_HOUR) / MS_PER_MINUTE);
  const sec = Math.floor((left % MS_PER_MINUTE) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/** How many of the chain's options the firm watches, and how many there are. */
export function chainWatched(s: Snapshot): { watched: number; of: number } {
  const options = s.stocks.filter((x) => x.option);
  return { watched: options.filter((x) => x.watched).length, of: options.length };
}

/**
 * The watch list that has the whole chain in view: the underlying, its futures (the options block hedges in them), then
 * every option, soonest expiry first and nearest the index first within one, then what was watched before in the order
 * it was listed, cut to the computer's limit. `dropped` is what was watched and has been let go to make room.
 */
export function watchChain(s: Snapshot): { watch: string[]; dropped: string[] } {
  const watched = s.stocks.filter((x) => x.watched).map((x) => x.symbol);
  const o = s.options;
  if (!o) return { watch: watched, dropped: [] };
  const spot = o.spot;
  const futures = s.stocks
    .filter((x) => x.contract?.underlying === o.underlying)
    .sort((a, b) => a.contract!.expiry - b.contract!.expiry)
    .map((x) => x.symbol);
  const options = s.stocks
    .filter((x) => x.option)
    .sort(
      (a, b) =>
        a.option!.expiry - b.option!.expiry ||
        Math.abs(a.option!.strike - spot) - Math.abs(b.option!.strike - spot) ||
        (a.option!.right === b.option!.right ? 0 : a.option!.right === 'call' ? -1 : 1) ||
        a.option!.strike - b.option!.strike,
    )
    .map((x) => x.symbol);
  const first = [...(s.stocks.some((x) => x.symbol === o.underlying) ? [o.underlying] : []), ...futures, ...options];
  const chosen = new Set(first);
  const watch = [...first, ...watched.filter((w) => !chosen.has(w))].slice(0, s.watching.max);
  const kept = new Set(watch);
  return { watch, dropped: watched.filter((w) => !kept.has(w)) };
}
