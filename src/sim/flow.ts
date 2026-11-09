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
  const bumps: Record<string, number> = {};
  const taxes: Record<string, number> = {};
  for (const e of market.exchanges) {
    bumps[e.id] = e.rules.speedBumpMs;
    taxes[e.id] = e.rules.taxPerShare;
  }
  for (const f of firms) {
    f.feeTable = fees(market);
    f.bumps = bumps;
    f.taxes = taxes;
    f.scales = market.scales;
    f.margins = market.margins;
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

function fees(market: Market): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of market.exchanges) out[e.id] = e.spec.feePerShare;
  return out;
}
