// The news engine: a schedule of headlines, some about one company, some about a sector, some about everything,
// each with a direction and a size that moves fair value once it lands. Headlines are drawn a day ahead, so the
// dark web has something to leak. Some read like news and move nothing: that is deliberate, and a lesson.

import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, isMarketOpen, isWeekday, nextOpen } from './clock';
import { STOCKS_DESK, deskOf } from './instrument';
import type { Market } from './market';
import type { Random } from './random';
import type { DeskNewsSpec, Headline, NewsTemplate, RegimeSpec, StockSpec } from './types';

/** How far ahead the schedule is kept full, and how many published headlines are remembered. */
export const LOOKAHEAD = MS_PER_DAY;
export const FEED_LENGTH = 100;
/** Headlines a trading day, on average, across the whole market. */
const PER_DAY = 14;

/** A headline on the schedule, with what the market will do about it: what a tip buyer is really paying for. */
export interface Scheduled extends Headline {
  /** Cents the fair value will move, per symbol, once published. */
  moves: Record<string, number>;
  priceInMs: number;
  /** A story that sounds like news and moves nothing. */
  noise: boolean;
}

export interface Published extends Scheduled {
  /** Mid per symbol when it landed, so the feed can show what followed. */
  midsAt: Record<string, number | null>;
}

export interface SavedNews {
  nextId: number;
  scheduled: Scheduled[];
  published: Published[];
  scheduledThrough: number;
}

export class News {
  private templates: readonly NewsTemplate[];
  private stocks: readonly StockSpec[];
  /** How many headlines a day gets and how big, by day; every day plain unless the game says. */
  regimeFor: (day: number) => Pick<RegimeSpec, 'newsRate' | 'newsSize'> = () => ({ newsRate: 1, newsSize: 1 });
  private nextId = 1;
  scheduled: Scheduled[] = [];
  published: Published[] = [];
  private scheduledThrough = 0;
  /** Headlines published this tick, for the game to tell the UI about. */
  tickPublished: Published[] = [];

  constructor(templates: readonly NewsTemplate[], stocks: readonly StockSpec[]) {
    this.templates = templates;
    // The news is the stocks desk's: another desk's instruments are not picked, nor moved by a market-wide story.
    this.stocks = stocks.filter((s) => deskOf(s) === STOCKS_DESK);
  }

  /** The headlines a strategy may see: the published feed, without what the market did about each. */
  feed(): Headline[] {
    return this.published.map(({ id, at, text, symbols, sector, direction }) => ({
      id,
      at,
      text,
      symbols,
      sector,
      direction,
    }));
  }

  /** Fill the schedule a day ahead, then publish what is due. */
  step(now: number, market: Market, random: Random): void {
    this.tickPublished = [];
    while (this.scheduledThrough < now + LOOKAHEAD) this.scheduleDay(this.scheduledThrough, random, market);
    while (this.scheduled.length > 0 && (this.scheduled[0]?.at ?? Infinity) <= now) {
      const h = this.scheduled.shift();
      if (h) this.publish(h, market);
    }
  }

  private scheduleDay(dayStart: number, random: Random, market: Market): void {
    const day = Math.floor(dayStart / MS_PER_DAY);
    this.scheduledThrough = (day + 1) * MS_PER_DAY;
    if (!isWeekday(day)) return;
    const regime = this.regimeFor(day);
    const count = Math.max(0, Math.round(PER_DAY * regime.newsRate + random.normal() * 3));
    for (let i = 0; i < count; i++) {
      // Most news lands in the session; some lands overnight and is waiting at the open.
      const inSession = random.chance(0.8);
      const at = inSession
        ? dayStart + 9.5 * MS_PER_HOUR + random.range(0, 6.5 * MS_PER_HOUR)
        : dayStart + random.range(6 * MS_PER_HOUR, 9.5 * MS_PER_HOUR);
      this.scheduled.push(this.draw(Math.floor(at), random, market, regime.newsSize));
    }
    this.scheduled.sort((a, b) => a.at - b.at);
  }

  private draw(at: number, random: Random, market: Market, size: number): Scheduled {
    const t = random.pick(this.templates);
    const stock = random.pick(this.stocks);
    const sector = stock.sector;
    const symbols =
      t.scope === 'company'
        ? [stock.symbol]
        : t.scope === 'sector'
          ? this.stocks.filter((s) => s.sector === sector).map((s) => s.symbol)
          : this.stocks.map((s) => s.symbol);
    const pct = Math.max(1, Math.round(Math.abs(random.normal()) * 6 + 2));
    const text = t.text
      .replace('{company}', stock.name)
      .replace('{sector}', sector)
      .replace('{pct}', String(pct))
      .replace('{n}', String(random.int(2, 9)));
    const moves: Record<string, number> = {};
    const noise = t.magnitudeBps === 0;
    for (const symbol of symbols) {
      const price = market.fair.get(symbol) ?? market.stock(symbol).startPrice;
      const bps = t.magnitudeBps * size * (0.6 + 0.8 * random.next());
      moves[symbol] = noise ? 0 : Math.round(((t.direction * bps) / 10_000) * price);
    }
    return {
      id: this.nextId++,
      at,
      text,
      symbols,
      sector: t.scope === 'company' || t.scope === 'sector' ? sector : null,
      direction: t.direction,
      moves,
      priceInMs: t.priceInMs,
      noise,
    };
  }

  private publish(h: Scheduled, market: Market): void {
    const midsAt: Record<string, number | null> = {};
    for (const symbol of h.symbols) {
      midsAt[symbol] = market.venuesOf(symbol)[0]?.book(symbol).mid() ?? null;
      const move = h.moves[symbol] ?? 0;
      // Overnight news is priced in by the time the market opens, which is as fast as the game can show it.
      const window = isMarketOpen(h.at) ? h.priceInMs : Math.max(1, nextOpen(h.at) - h.at - MS_PER_MINUTE);
      market.shock(symbol, move, window);
    }
    const p: Published = { ...h, midsAt };
    this.published.push(p);
    this.tickPublished.push(p);
    if (this.published.length > FEED_LENGTH) this.published.splice(0, this.published.length - FEED_LENGTH);
  }

  /** What is coming, for the dark web to sell: only what is more than a moment away. */
  upcoming(now: number, atLeastMs: number): Scheduled[] {
    return this.scheduled.filter((h) => h.at - now >= atLeastMs);
  }

  save(): SavedNews {
    return {
      nextId: this.nextId,
      scheduled: this.scheduled,
      published: this.published,
      scheduledThrough: this.scheduledThrough,
    };
  }

  load(s: SavedNews): void {
    this.nextId = s.nextId;
    this.scheduled = s.scheduled.map((h) => ({ ...h }));
    this.published = s.published.map((h) => ({ ...h }));
    this.scheduledThrough = s.scheduledThrough;
  }
}

/** The most headlines a desk's news schedules in a day, and how many published it remembers. */
export const MAX_DESK_NEWS_PER_DAY = 12;
export const DESK_FEED_LENGTH = 50;
/** Tries to find a moment in a day when one of the desk's venues is open; a day with none gets no headline. */
const DESK_NEWS_TRIES = 24;

export interface SavedDeskNews {
  nextId: number;
  scheduled: Scheduled[];
  published: Published[];
  scheduledThrough: number;
  /** Each headline's move in its symbol's lease, by headline id, while it is scheduled. */
  leases: Record<number, number>;
}

/**
 * A desk's own news: headlines about its instruments, drawn on its own stream a day ahead, timed in the hours its
 * venues keep, each moving one instrument's fair value and its lease. It runs only while its desk is open, so a
 * game with the desk shut draws nothing for it; its schedule starts from the moment the desk is first stepped.
 */
export class DeskNews {
  readonly desk: string;
  private readonly spec: DeskNewsSpec;
  private nextId = 1;
  /** Bounded by `MAX_DESK_NEWS_PER_DAY` a day, a day ahead. */
  scheduled: Scheduled[] = [];
  /** Bounded by `DESK_FEED_LENGTH`. */
  published: Published[] = [];
  /** Each scheduled headline's lease move, by id: one entry a scheduled headline. */
  private leases = new Map<number, number>();
  private scheduledThrough = -1;
  tickPublished: Published[] = [];

  constructor(spec: DeskNewsSpec) {
    this.desk = spec.desk;
    this.spec = spec;
  }

  /** Whether it has ever run: a desk's news that never ran is not saved. */
  get started(): boolean {
    return this.scheduledThrough >= 0;
  }

  step(now: number, market: Market, random: Random): void {
    this.tickPublished = [];
    if (this.scheduledThrough < 0) this.scheduledThrough = now;
    while (this.scheduledThrough < now + LOOKAHEAD) this.scheduleDay(this.scheduledThrough, random, market);
    while (this.scheduled.length > 0 && (this.scheduled[0]?.at ?? Infinity) <= now) {
      const h = this.scheduled.shift();
      if (h) this.publish(h, market);
    }
  }

  /** The rest of the day from `from`: a few headlines, each at a moment one of the desk's venues is open. */
  private scheduleDay(from: number, random: Random, market: Market): void {
    const day = Math.floor(from / MS_PER_DAY);
    const end = (day + 1) * MS_PER_DAY;
    this.scheduledThrough = end;
    const venues = market.venues.filter((e) => e.desk === this.desk);
    const count = Math.min(MAX_DESK_NEWS_PER_DAY, Math.max(0, Math.round(this.spec.perDay + random.normal())));
    for (let i = 0; i < count; i++) {
      let at = -1;
      for (let k = 0; k < DESK_NEWS_TRIES && at < 0; k++) {
        const t = Math.floor(random.range(from, end));
        if (venues.some((e) => e.isOpen(t))) at = t;
      }
      if (at < 0) continue;
      this.scheduled.push(this.draw(at, random, market));
    }
    this.scheduled.sort((a, b) => a.at - b.at);
  }

  private draw(at: number, random: Random, market: Market): Scheduled {
    const t = random.pick(this.spec.templates);
    const symbol = random.pick(t.symbols);
    const spec = market.stock(symbol);
    const size = 0.6 + 0.8 * random.next();
    const text = t.text.replace('{metal}', spec.name.toLowerCase()).replace('{n}', String(random.int(2, 9)));
    const price = market.fair.get(symbol) ?? spec.startPrice;
    const id = this.nextId++;
    this.leases.set(id, t.lease * size);
    return {
      id,
      at,
      text,
      symbols: [symbol],
      sector: spec.sector,
      direction: t.direction,
      moves: { [symbol]: Math.round(((t.direction * t.magnitudeBps * size) / 10_000) * price) },
      priceInMs: t.priceInMs,
      noise: false,
    };
  }

  private publish(h: Scheduled, market: Market): void {
    const midsAt: Record<string, number | null> = {};
    for (const symbol of h.symbols) {
      midsAt[symbol] = market.venuesOf(symbol)[0]?.book(symbol).mid() ?? null;
      market.shock(symbol, h.moves[symbol] ?? 0, h.priceInMs);
      market.shiftLease(symbol, this.leases.get(h.id) ?? 0);
    }
    this.leases.delete(h.id);
    const p: Published = { ...h, midsAt };
    this.published.push(p);
    this.tickPublished.push(p);
    if (this.published.length > DESK_FEED_LENGTH) this.published.splice(0, this.published.length - DESK_FEED_LENGTH);
  }

  save(): SavedDeskNews {
    return {
      nextId: this.nextId,
      scheduled: this.scheduled.map((h) => ({ ...h })),
      published: this.published.map((h) => ({ ...h })),
      scheduledThrough: this.scheduledThrough,
      leases: Object.fromEntries(this.leases),
    };
  }

  load(s: SavedDeskNews): void {
    this.nextId = s.nextId;
    this.scheduled = s.scheduled.map((h) => ({ ...h }));
    this.published = s.published.map((h) => ({ ...h }));
    this.scheduledThrough = s.scheduledThrough;
    this.leases = new Map(Object.entries(s.leases).map(([k, v]) => [Number(k), v]));
  }
}
