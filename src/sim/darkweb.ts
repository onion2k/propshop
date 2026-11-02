// The dark web: somebody is selling tomorrow's headlines. Some are real leaks and some are made up, the price
// does not tell you which, and every purchase is a line in a file the regulator will one day read. This is
// insider trading, and the game lets the player try it so they can see how it ends.

import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE } from './clock';
import type { Firm } from './firm';
import type { News, Scheduled } from './news';
import type { Random } from './random';

/** Heat added per tip, how much of it fades each day, and the line above which fines start. */
export const HEAT_PER_TIP = 20;
export const HEAT_DECAY_PER_DAY = 0.85;
export const HEAT_FINE_LINE = 50;
/** Daily chance of a fine at the line, climbing with heat above it; and the fine as a share of equity. */
const FINE_CHANCE_AT_LINE = 0.1;
const FINE_SHARE = 0.15;
/** Tips for sale at once, how long each is for sale, and the share that are made up. */
const OFFERS = 3;
const OFFER_LIFE = 2 * MS_PER_HOUR;
const FAKE_SHARE = 0.3;
/** A tip is never about something less than this far away: the seller needs a head start too. */
const MIN_LEAD = 10 * MS_PER_MINUTE;

export interface Tip {
  id: number;
  /** When the thing will happen, the seller says. */
  at: number;
  text: string;
  symbols: string[];
  direction: -1 | 0 | 1;
  /** Cents. */
  price: number;
  /** When the offer is pulled. */
  expires: number;
  /** The scheduled headline this leaks, or null when the seller is lying. Hidden from the player. */
  headlineId: number | null;
}

export interface Fine {
  at: number;
  cents: number;
  reason: string;
}

export interface SavedDarkWeb {
  nextId: number;
  offers: Tip[];
  bought: Tip[];
  fines: Fine[];
  unlocked: boolean;
  lastDay: number;
}

export class DarkWeb {
  private nextId = 1;
  offers: Tip[] = [];
  /** Tips bought, so the UI can show how each turned out. Bounded. */
  bought: Tip[] = [];
  fines: Fine[] = [];
  unlocked = false;
  private lastDay = -1;
  tickFines: Fine[] = [];

  /** Once a day: heat cools, the regulator rolls the dice, and the shop restocks. */
  step(now: number, firm: Firm, news: News, random: Random): void {
    this.tickFines = [];
    const day = Math.floor(now / MS_PER_DAY);
    if (day !== this.lastDay) {
      if (this.lastDay >= 0) this.newDay(now, firm, random);
      this.lastDay = day;
    }
    if (!this.unlocked) return;
    this.offers = this.offers.filter((t) => t.expires > now);
    while (this.offers.length < OFFERS) {
      const tip = this.makeOffer(now, news, random);
      if (!tip) break;
      this.offers.push(tip);
    }
  }

  private newDay(now: number, firm: Firm, random: Random): void {
    firm.heat *= HEAT_DECAY_PER_DAY;
    if (firm.heat < 0.5) firm.heat = 0;
    if (firm.heat >= HEAT_FINE_LINE) {
      const chance = Math.min(0.9, FINE_CHANCE_AT_LINE * (firm.heat / HEAT_FINE_LINE));
      if (random.chance(chance)) {
        const cents = Math.max(100_000, Math.round(Math.max(0, firm.cash) * FINE_SHARE));
        firm.fine(cents);
        const fine: Fine = { at: now, cents, reason: 'Fined for trading on material non-public information.' };
        this.fines.push(fine);
        this.tickFines.push(fine);
        if (this.fines.length > 50) this.fines.splice(0, this.fines.length - 50);
        firm.heat *= 0.5;
      }
    }
  }

  private makeOffer(now: number, news: News, random: Random): Tip | null {
    const pool = news
      .upcoming(now, MIN_LEAD)
      .filter((h) => !this.offers.some((o) => o.headlineId === h.id) && !h.noise);
    const fake = random.chance(FAKE_SHARE) || pool.length === 0;
    const expires = now + OFFER_LIFE;
    if (fake) {
      const source = pool.length > 0 ? random.pick(pool) : null;
      return this.fakeTip(now, source, expires, random, news);
    }
    const h = random.pick(pool);
    return {
      id: this.nextId++,
      at: h.at,
      text: h.text,
      symbols: h.symbols,
      direction: h.direction,
      price: this.priceFor(h),
      expires,
      headlineId: h.id,
    };
  }

  /** A made-up story about a real stock, timed like a real one, saying the opposite of nothing in particular. */
  private fakeTip(now: number, source: Scheduled | null, expires: number, random: Random, news: News): Tip | null {
    const symbols = source ? source.symbols : (news.published[0]?.symbols ?? []);
    if (symbols.length === 0) return null;
    const direction = random.chance(0.5) ? 1 : -1;
    return {
      id: this.nextId++,
      at: now + random.range(MIN_LEAD, 6 * MS_PER_HOUR),
      text:
        direction > 0
          ? `Big announcement coming for ${symbols[0]}. Trust me.`
          : `${symbols[0]} is about to get hit. Get out.`,
      symbols,
      direction,
      price: 50_000 + random.int(0, 10) * 10_000,
      expires,
      headlineId: null,
    };
  }

  private priceFor(h: Scheduled): number {
    const move = Object.values(h.moves).reduce((m, c) => Math.max(m, Math.abs(c)), 0);
    return 50_000 + move * 2_000;
  }

  /** Buy a tip: cash out, heat up, and the tip goes on the record for the feed. */
  buy(id: number, firm: Firm): Tip {
    const i = this.offers.findIndex((t) => t.id === id);
    const tip = this.offers[i];
    if (i < 0 || !tip) throw new Error(`No tip ${id} for sale`);
    if (firm.cash < tip.price) throw new Error('Not enough cash for that tip');
    this.offers.splice(i, 1);
    firm.cash -= tip.price;
    firm.heat += HEAT_PER_TIP;
    this.bought.push(tip);
    if (this.bought.length > 50) this.bought.splice(0, this.bought.length - 50);
    return tip;
  }

  save(): SavedDarkWeb {
    return {
      nextId: this.nextId,
      offers: this.offers,
      bought: this.bought,
      fines: this.fines,
      unlocked: this.unlocked,
      lastDay: this.lastDay,
    };
  }

  load(s: SavedDarkWeb): void {
    this.nextId = s.nextId;
    this.offers = s.offers.map((t) => ({ ...t }));
    this.bought = s.bought.map((t) => ({ ...t }));
    this.fines = s.fines.map((f) => ({ ...f }));
    this.unlocked = s.unlocked;
    this.lastDay = s.lastDay;
  }
}
