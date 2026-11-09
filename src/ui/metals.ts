// The metals desk as the Market page reads it: a metal's curve, the fix at the venue that holds one, and the
// gold-silver ratio. Pure working over the snapshot; the components only present it.

import { MS_PER_DAY, type Fix, type Snapshot } from '../sim';

type Stock = Snapshot['stocks'][number];

export interface CurvePoint {
  symbol: string;
  /** Null for spot: now. */
  expiry: number | null;
  /** In the metal's points. */
  price: number;
  /** Whether the price is the touch's middle the firm sees, or only the fair value (no market open for it). */
  quoted: boolean;
}

export type CurveShape = 'contango' | 'backwardation' | 'mixed' | 'flat';

export interface Curve {
  metal: Stock;
  points: CurvePoint[];
  shape: CurveShape;
  /** The front contract's carry now, a year: the dollar's rate and storage less the lease. */
  carry: number | null;
}

/** The metal a symbol is, or is a future on: XAU for XAU and for each GC contract. */
export function metalOf(s: Snapshot, symbol: string): Stock | undefined {
  const st = s.stocks.find((x) => x.symbol === symbol);
  if (!st) return undefined;
  if (st.metal) return st;
  const under = st.contract ? s.stocks.find((x) => x.symbol === st.contract!.underlying) : undefined;
  return under?.metal ? under : undefined;
}

function pointOf(st: Stock, expiry: number | null): CurvePoint {
  const quoted = st.bid !== null && st.ask !== null;
  return { symbol: st.symbol, expiry, price: quoted ? (st.bid! + st.ask!) / 2 : st.fair, quoted };
}

/** The shape of a run of prices in date order: rising throughout, falling throughout, flat, or neither. */
export function shapeOf(prices: number[]): CurveShape {
  let up = 0;
  let down = 0;
  for (let i = 1; i < prices.length; i++) {
    const d = prices[i]! - prices[i - 1]!;
    if (d > 0) up++;
    else if (d < 0) down++;
  }
  if (up === 0 && down === 0) return 'flat';
  if (down === 0) return 'contango';
  if (up === 0) return 'backwardation';
  return 'mixed';
}

/** A metal's curve: spot now and each live future on it by expiry, and its shape. Undefined for any other symbol. */
export function curveOf(s: Snapshot, symbol: string): Curve | undefined {
  const metal = metalOf(s, symbol);
  if (!metal) return undefined;
  const futures = s.stocks
    .filter((x) => x.contract?.underlying === metal.symbol)
    .sort((a, b) => a.contract!.expiry - b.contract!.expiry);
  const points = [pointOf(metal, null), ...futures.map((f) => pointOf(f, f.contract!.expiry))];
  return {
    metal,
    points,
    shape: shapeOf(points.map((p) => p.price)),
    carry: futures[0]?.contract?.carry ?? null,
  };
}

/** The venue's fixes for a symbol on the day of `now`, oldest first. */
export function fixesToday(fixes: readonly Fix[], symbol: string, now: number): Fix[] {
  const day = Math.floor(now / MS_PER_DAY);
  return fixes.filter((f) => f.symbol === symbol && Math.floor(f.at / MS_PER_DAY) === day);
}

export type FixState =
  | { kind: 'call'; venue: string; secondsLeft: number; indicative: { price: number | null; volume: number } | null }
  | { kind: 'after'; venue: string; fixes: Fix[]; next: number | null };

/**
 * The fix for a symbol listed on a venue that holds one: in the call, the seconds to the uncrossing and the
 * indicative as the firm sees it (through its data latency; null before the first has reached it); otherwise the
 * day's fixes from the venue's log and the time of the next today, if one is still to come.
 */
export function fixStateOf(s: Snapshot, symbol: string): FixState | undefined {
  const st = s.stocks.find((x) => x.symbol === symbol);
  if (!st) return undefined;
  for (const ex of st.exchanges) {
    const venue = s.exchanges.find((e) => e.id === ex.id);
    if (!venue?.auctions) continue;
    if (venue.call !== null && venue.call !== undefined) {
      const seen = ex.seen?.indicative;
      return {
        kind: 'call',
        venue: venue.id,
        secondsLeft: Math.max(0, Math.ceil((venue.call - s.now) / 1000)),
        indicative: seen && seen.fixAt === venue.call ? { price: seen.price, volume: seen.volume } : null,
      };
    }
    const day = Math.floor(s.now / MS_PER_DAY) * MS_PER_DAY;
    const next = venue.auctions.map((at) => day + at).find((at) => at > s.now) ?? null;
    return { kind: 'after', venue: venue.id, fixes: fixesToday(venue.fixes ?? [], symbol, s.now), next };
  }
  return undefined;
}

/** Ounces of silver an ounce of gold buys, at the touch's middle (or fair value) of each; null without both. */
export function goldSilverRatio(s: Snapshot): number | null {
  const at = (symbol: string) => {
    const st = s.stocks.find((x) => x.symbol === symbol);
    if (!st) return null;
    const p = pointOf(st, null).price;
    return p * 10 ** -st.decimals;
  };
  const gold = at('XAU');
  const silver = at('XAG');
  return gold !== null && silver !== null && silver > 0 ? gold / silver : null;
}
