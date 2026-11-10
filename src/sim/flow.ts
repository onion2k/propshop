// One tick of the whole market with its firms in it: the crowd moves, each firm acts on what has reached it,
// every trade is routed to whoever made it, and the quotes are logged for the slow to catch up on later.

import { isMarketOpen } from './clock';
import type { Firm } from './firm';
import type { Market } from './market';
import type { Streams } from './random';
import type { Headline } from './types';

export function tick(
  now: number,
  dt: number,
  market: Market,
  firms: readonly Firm[],
  streams: Streams,
  news: readonly Headline[],
) {
  const { closed, closedVenues } = market.step(now, dt, streams.world, streams.crowd, streams.desks);
  // The firms decide in the stocks' hours, and while an open desk's venue with hours of its own is open.
  const open = isMarketOpen(now) || market.exchanges.some((e) => e.session !== null && e.isOpen(now));
  const { bumps, taxes, fees } = venueTables(market);
  for (const f of firms) {
    f.feeTable = fees;
    f.bumps = bumps;
    f.taxes = taxes;
    f.scales = market.scales;
    f.margins = market.margins;
    f.options = market.optionSpecs;
    f.fairs = market.fair;
    f.fx = market.fx;
    f.rates = market.rates;
    f.batchedAt = now;
    f.step(now, market, news, open);
  }
  for (const e of market.exchanges) {
    for (const { symbol, trade } of e.tickTrades) for (const f of firms) f.onTrade(e, symbol, trade, now);
    e.logQuotes(now);
  }
  if (closed) for (const f of firms) f.onClose(closed);
  return { closed: closed !== null, closedVenues };
}

/** What the firms are told of the venues each tick: speed bumps, taxes and fees. */
interface VenueTables {
  bumps: Record<string, number>;
  taxes: Record<string, number>;
  fees: Record<string, number>;
  /** The values they were made from, by venue, to tell whether any has changed. */
  ids: string[];
  bump: number[];
  tax: number[];
  fee: number[];
}

const venueCache = new WeakMap<Market, VenueTables>();

/**
 * The same three tables for every firm, and the same objects tick after tick while no venue's id or rule changes, so
 * a firm can tell by the object that its latencies have not moved. Rebuilt, new objects, when one has.
 */
function venueTables(market: Market): VenueTables {
  const venues = market.exchanges;
  const kept = venueCache.get(market);
  if (
    kept &&
    kept.ids.length === venues.length &&
    venues.every(
      (e, i) =>
        kept.ids[i] === e.id &&
        kept.bump[i] === e.rules.speedBumpMs &&
        kept.tax[i] === e.rules.taxPerShare &&
        kept.fee[i] === e.spec.feePerShare,
    )
  )
    return kept;
  const made: VenueTables = {
    bumps: {},
    taxes: {},
    fees: {},
    ids: venues.map((e) => e.id),
    bump: venues.map((e) => e.rules.speedBumpMs),
    tax: venues.map((e) => e.rules.taxPerShare),
    fee: venues.map((e) => e.spec.feePerShare),
  };
  for (const e of venues) {
    made.bumps[e.id] = e.rules.speedBumpMs;
    made.taxes[e.id] = e.rules.taxPerShare;
    made.fees[e.id] = e.spec.feePerShare;
  }
  venueCache.set(market, made);
  return made;
}
