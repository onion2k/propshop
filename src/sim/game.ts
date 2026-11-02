// The game: one object that owns the clock, the market, the news, the dark web, the player's firm and the
// competitors, steps them together, and answers the UI's questions. Nothing in here draws anything.

import {
  MARKET_OPEN,
  MS_PER_DAY,
  MS_PER_MINUTE,
  calendar,
  isMarketOpen,
  nextClose,
  nextOpen,
  type Calendar,
} from './clock';
import { DarkWeb, HEAT_FINE_LINE, type Fine, type SavedDarkWeb, type Tip } from './darkweb';
import { Firm, type BlockSetting, type Halt, type RiskSettings, type SavedFirm } from './firm';
import { tick } from './flow';
import type { Level } from './orderbook';
import { Market, type HistoryPoint, type SavedMarket } from './market';
import { News, type Published, type SavedNews } from './news';
import { Random } from './random';
import { driftPerMs, driftSign, regimeFor } from './regime';
import { BLOCKS, SCRIPT_ID, scriptState, type Fill, type OpenOrder, type Params } from './strategy';
import { buyUpgrade, catalogue, infrastructureFrom, type UpgradeKind, type UpgradeOffer } from './upgrades';
import type { Content, RegimeSpec } from './types';

/** One tick of simulated time, in ms. A colocated firm is within a tick of its exchange; a home office is twenty
    away; a trading day is nearly twelve million. */
export const TICK_MS = 2;
/** Speeds the player may pick: simulated ms per wall ms. */
export const SPEEDS = [0, 1, 10, 60, 300] as const;
export type Speed = (typeof SPEEDS)[number];
/** The most ticks one call to advance will run, so a tab that was hidden for an hour does not hang catching up. */
const MAX_TICKS_PER_ADVANCE = 15000;
/** When jumping over closed hours, how big a step the sim takes. */
const JUMP_STEP = MS_PER_MINUTE;

export type GameEvent =
  | { kind: 'fill'; at: number; fill: Fill }
  | { kind: 'news'; at: number; headline: Published }
  | { kind: 'fine'; at: number; fine: Fine }
  | { kind: 'open'; at: number }
  | { kind: 'close'; at: number; dayPnl: number }
  | { kind: 'unlock'; at: number; what: 'darkweb' }
  | { kind: 'tip'; at: number; tip: Tip }
  | { kind: 'upgrade'; at: number; kind2: UpgradeKind; id: string }
  | { kind: 'halt'; at: number; reason: string; until: number }
  | { kind: 'regulator'; at: number; note: string; heat: number };

export interface Tally {
  fills: number;
  realised: number;
  fees: number;
}

/** What a day was, written at its close. Money in cents. */
export interface DayReport {
  day: number;
  weekday: Calendar['weekday'];
  week: number;
  pnl: number;
  equityAtClose: number;
  byBlock: Record<string, Tally>;
  bySymbol: Record<string, Tally>;
  /** Immediate-or-cancel orders: filled in full, beaten by a named rival, or missed with nobody named. */
  races: { won: number; beaten: number; missed: number };
  fees: number;
  fines: number;
  headlines: { text: string; symbols: string[]; moved: Record<string, number>; noise: boolean }[];
  latency: Record<string, number>;
  rivals: { name: string; pnl: number }[];
  /** Why the firm was halted, if it was, and what the regulator noted. Missing in a report saved before them. */
  halts?: string[];
  regulator?: string[];
  /** The kind of day it was. Missing in a report saved before regimes. */
  regime?: string;
}

/** The older shape of a day, kept so a save from before the report still loads. */
export interface DayRecord {
  day: number;
  weekday: Calendar['weekday'];
  pnl: number;
}

export interface SavedGame {
  version: 1;
  /** The seed the game began from, which the day's regime is drawn from. */
  seed?: number;
  now: number;
  speed: Speed;
  random: number;
  market: SavedMarket;
  news: SavedNews;
  dark: SavedDarkWeb;
  firm: SavedFirm;
  firmInfra: { location: string; network: string; computer: string };
  competitors: SavedFirm[];
  owned: string[];
  dayStartEquity: number;
  weekStartEquity: number;
  days: (DayReport | DayRecord)[];
  log: GameEvent[];
  wasOpen: boolean;
  today?: Today;
}

/** The day's tallies, from the open. */
interface Today {
  byBlock: Record<string, Tally>;
  bySymbol: Record<string, Tally>;
  races: { won: number; beaten: number; missed: number };
  fees: number;
  fines: number;
  rivalsAtOpen: Record<string, number>;
  openedAt: number;
  halts: string[];
  regulator: string[];
  statsAtOpen: { ordersSent: number; cancelsSent: number; ordersDropped: number };
}

function freshToday(): Today {
  return {
    byBlock: {},
    bySymbol: {},
    races: { won: 0, beaten: 0, missed: 0 },
    fees: 0,
    fines: 0,
    rivalsAtOpen: {},
    openedAt: 0,
    halts: [],
    regulator: [],
    statsAtOpen: { ordersSent: 0, cancelsSent: 0, ordersDropped: 0 },
  };
}

function tally(into: Record<string, Tally>, key: string, f: { realised: number; fee: number }): void {
  const t = into[key] ?? { fills: 0, realised: 0, fees: 0 };
  t.fills++;
  t.realised += f.realised;
  t.fees += f.fee;
  into[key] = t;
}

/** What the UI reads, rebuilt on demand. Plain data, so it can cross a wire one day. */
export interface Snapshot {
  now: number;
  calendar: Calendar;
  open: boolean;
  nextChange: number;
  /** The kind of day it is, once the market has opened on it. */
  regime: RegimeSpec | null;
  speed: Speed;
  cash: number;
  equity: number;
  dayPnl: number;
  realised: number;
  unrealised: number;
  feesPaid: number;
  finesPaid: number;
  heat: number;
  heatLine: number;
  risk: RiskSettings;
  halt: Halt | null;
  positions: { symbol: string; qty: number; avgCost: number; mark: number | null; unrealised: number }[];
  openOrders: OpenOrder[];
  /** Recent orders, open and finished, newest first, each with what its fills made. */
  orders: OrderStory[];
  /** Who the rivals are, by owner id, so a race can name who won it. */
  names: Record<string, string>;
  fills: Fill[];
  blocks: BlockSetting[];
  /** The script block's last error and what it has printed. */
  script: { error: string | null; log: string[] };
  capacity: {
    blocksUsed: number;
    maxBlocks: number;
    ordersPerSecond: number;
    ordersSent: number;
    ordersDropped: number;
    ordersRejected: number;
    decisionEveryMs: number;
  };
  /** How many times the firm has seen a gap between the exchanges it could have raced for. */
  gapsSeen: number;
  /** How many symbols the computer can watch, and how many the firm does. */
  watching: { count: number; max: number };
  infra: { location: string; network: string; computer: string };
  /** Order latency and data latency per exchange; the same unless the firm has racks at more than one. */
  latency: Record<string, number>;
  dataLatency: Record<string, number>;
  stocks: {
    symbol: string;
    name: string;
    sector: string;
    /** An index over these, or null for a stock. */
    constituents: string[] | null;
    watched: boolean;
    fair: number;
    /** The best bid and ask the firm can see across exchanges, and the change on the day in cents. */
    bid: number | null;
    ask: number | null;
    dayChange: number | null;
    exchanges: {
      id: string;
      seen: { bid: number | null; ask: number | null; bidSize: number; askSize: number } | null;
      last: number | null;
      depth: { bids: Level[]; asks: Level[] };
    }[];
    history: HistoryPoint[];
  }[];
  exchanges: { id: string; name: string; city: string; feePerShare: number }[];
  news: Published[];
  dark: { unlocked: boolean; offers: Tip[]; bought: Tip[]; fines: Fine[] };
  competitors: { id: string; name: string; latency: Record<string, number>; fills: number; pnl: number }[];
  shop: UpgradeOffer[];
  days: DayReport[];
  log: GameEvent[];
}

const LOG_LENGTH = 200;
const DAYS_KEPT = 60;
/** The loss limit is checked this often, in ms of simulated time. */
const LOSS_CHECK_EVERY = 500;
/** What the regulator calls a pattern: so many orders a day with so large a share cancelled, or so many dropped. */
export const STUFFING_ORDERS = 1000;
export const STUFFING_CANCEL_SHARE = 0.9;
export const FLOOD_DROPPED = 500;
export const HEAT_FOR_STUFFING = 10;
export const HEAT_FOR_FLOOD = 5;
const ORDER_STORIES = 30;

export interface OrderStory extends OpenOrder {
  /** Fee paid and P&L realised by this order's fills, cents. */
  fee: number;
  realised: number;
}

export class Game {
  readonly content: Content;
  seed: number;
  now: number;
  speed: Speed = 1;
  random: Random;
  readonly market: Market;
  readonly news: News;
  readonly dark: DarkWeb;
  readonly firm: Firm;
  readonly competitors: Firm[];
  readonly owned: Set<string>;
  private dayStartEquity: number;
  private weekStartEquity: number;
  days: DayReport[] = [];
  private today: Today = freshToday();
  log: GameEvent[] = [];
  private wasOpen: boolean;
  private listeners: ((e: GameEvent) => void)[] = [];
  /** Bumped on every change the UI might care about. */
  version = 0;

  constructor(content: Content, seed: number) {
    this.content = content;
    this.seed = seed >>> 0;
    // The game begins at six on Monday morning: the market opens in a few hours, so the player has time to look.
    this.now = 6 * 60 * MS_PER_MINUTE;
    this.random = new Random(seed);
    this.market = new Market(content.stocks, content.exchanges, content.factors);
    this.news = new News(content.news, content.stocks);
    this.dark = new DarkWeb();
    this.owned = new Set([content.start.location, content.start.network, content.start.computer]);
    this.firm = new Firm(
      'firm',
      content.firmName,
      content.startingCash,
      infrastructureFrom(content, content.start),
      Firm.defaultBlocks(['arbitrage']),
    );
    this.competitors = content.competitors.map(
      (c) =>
        new Firm(`bot:${c.id}`, c.name, content.startingCash * 10, infrastructureFrom(content, c), [
          {
            id: 'arbitrage',
            enabled: true,
            params: { minEdge: c.minEdge, size: 300, maxPosition: 3000, maxLatency: c.maxLatency ?? 100 },
          },
        ]),
    );
    this.dayStartEquity = content.startingCash;
    this.weekStartEquity = content.startingCash;
    this.wasOpen = false;
    this.news.regimeFor = (day) => this.regimeFor(day);
    this.news.step(this.now, this.market, this.random);
  }

  /** Which kind of day a day is: from the seed and the day, the same every time it is asked. */
  regimeFor(day: number): RegimeSpec {
    return regimeFor(this.content.regimes, this.seed, day);
  }

  on(listener: (e: GameEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(e: GameEvent): void {
    this.log.push(e);
    if (this.log.length > LOG_LENGTH) this.log.splice(0, this.log.length - LOG_LENGTH);
    for (const l of this.listeners) l(e);
  }

  private firms(): Firm[] {
    return [this.firm, ...this.competitors];
  }

  /** One tick. */
  step(dt = TICK_MS): void {
    this.now += dt;
    this.news.step(this.now, this.market, this.random);
    tick(this.now, dt, this.market, this.firms(), this.random, this.news.feed());
    this.dark.step(this.now, this.firm, this.news, this.random);
    for (const f of this.firm.tickFills) {
      this.emit({ kind: 'fill', at: this.now, fill: f });
      tally(this.today.byBlock, f.block, f);
      tally(this.today.bySymbol, f.symbol, f);
      this.today.fees += f.fee;
    }
    for (const o of this.firm.tickResolved) {
      if (!o.ioc) continue;
      if (o.filled >= o.size) this.today.races.won++;
      else if (o.beatenBy.length > 0) this.today.races.beaten++;
      else this.today.races.missed++;
    }
    for (const h of this.news.tickPublished) this.emit({ kind: 'news', at: this.now, headline: h });
    for (const f of this.dark.tickFines) {
      this.emit({ kind: 'fine', at: this.now, fine: f });
      this.today.fines += f.cents;
    }
    const open = isMarketOpen(this.now);
    if (open && !this.wasOpen) this.onOpen();
    if (open && !this.firm.halt && this.now % LOSS_CHECK_EVERY === 0) this.checkLoss();
    if (!open && this.wasOpen) this.onClose();
    this.wasOpen = open;
    this.version++;
  }

  /** Down more than the limit: halted until the next open, flat, and told so. */
  private checkLoss(): void {
    const pnl = this.firm.equity(this.market, this.now) - this.dayStartEquity;
    if (pnl >= -this.firm.risk.dailyLossLimit) return;
    const until = nextOpen(this.now);
    const reason = `down ${Math.round(-pnl / 100)} dollars on the day, past the loss limit`;
    this.firm.haltUntil(until, reason, this.now, this.market, this.news.feed());
    this.today.halts.push(reason);
    this.emit({ kind: 'halt', at: this.now, reason, until });
  }

  setRisk(change: Partial<RiskSettings>): void {
    this.firm.risk = {
      dailyLossLimit: Math.max(0, Math.round(change.dailyLossLimit ?? this.firm.risk.dailyLossLimit)),
      maxLeverage: Math.min(20, Math.max(1, change.maxLeverage ?? this.firm.risk.maxLeverage)),
    };
    this.version++;
  }

  private onOpen(): void {
    const day = calendar(this.now).day;
    const regime = this.regimeFor(day);
    const drifts = new Map<string, number>();
    this.market.stocks.forEach((s, i) => {
      drifts.set(
        s.symbol,
        driftPerMs(regime, this.market.fair.get(s.symbol) ?? s.startPrice, driftSign(this.seed, day, i)),
      );
    });
    this.market.setRegime(regime, drifts);
    this.dayStartEquity = this.firm.equity(this.market, this.now);
    if (calendar(this.now).weekday === 'Mon') this.weekStartEquity = this.dayStartEquity;
    this.today = freshToday();
    this.today.openedAt = this.now;
    this.today.statsAtOpen = {
      ordersSent: this.firm.stats.ordersSent,
      cancelsSent: this.firm.stats.cancelsSent,
      ordersDropped: this.firm.stats.ordersDropped,
    };
    for (const c of this.competitors) this.today.rivalsAtOpen[c.id] = c.equity(this.market, this.now);
    this.emit({ kind: 'open', at: this.now });
  }

  /** The regulator reads the day's order flow at the close. A pattern is a note and heat; the fines follow. */
  private regulate(): void {
    const sent = this.firm.stats.ordersSent - this.today.statsAtOpen.ordersSent;
    const cancels = this.firm.stats.cancelsSent - this.today.statsAtOpen.cancelsSent;
    const dropped = this.firm.stats.ordersDropped - this.today.statsAtOpen.ordersDropped;
    if (sent >= STUFFING_ORDERS && cancels / sent >= STUFFING_CANCEL_SHARE) {
      const note = `Quote stuffing: ${sent} orders sent, ${Math.round((100 * cancels) / sent)}% of them cancelled. Heat +${HEAT_FOR_STUFFING}.`;
      this.firm.heat += HEAT_FOR_STUFFING;
      this.today.regulator.push(note);
      this.emit({ kind: 'regulator', at: this.now, note, heat: HEAT_FOR_STUFFING });
    }
    if (dropped >= FLOOD_DROPPED) {
      const note = `Order flood: ${dropped} orders dropped for capacity, past what the exchanges tolerate. Heat +${HEAT_FOR_FLOOD}.`;
      this.firm.heat += HEAT_FOR_FLOOD;
      this.today.regulator.push(note);
      this.emit({ kind: 'regulator', at: this.now, note, heat: HEAT_FOR_FLOOD });
    }
  }

  private onClose(): void {
    this.regulate();
    const equity = this.firm.equity(this.market, this.now);
    const c = calendar(this.now);
    const pnl = equity - this.dayStartEquity;
    const latency: Record<string, number> = {};
    for (const e of this.market.exchanges) latency[e.id] = this.firm.latency(e.id);
    this.days.push({
      day: c.day,
      weekday: c.weekday,
      week: c.week,
      pnl,
      equityAtClose: equity,
      byBlock: this.today.byBlock,
      bySymbol: this.today.bySymbol,
      races: this.today.races,
      fees: this.today.fees,
      fines: this.today.fines,
      headlines: this.news.published
        .filter((h) => h.at >= this.today.openedAt - MS_PER_DAY / 2 && h.at <= this.now)
        .map((h) => ({ text: h.text, symbols: h.symbols, moved: h.moves, noise: h.noise })),
      latency,
      rivals: this.competitors.map((r) => ({
        name: r.name,
        pnl: r.equity(this.market, this.now) - (this.today.rivalsAtOpen[r.id] ?? r.equity(this.market, this.now)),
      })),
      halts: this.today.halts,
      regulator: this.today.regulator,
      regime: this.market.regime.id,
    });
    if (this.days.length > DAYS_KEPT) this.days.splice(0, this.days.length - DAYS_KEPT);
    this.emit({ kind: 'close', at: this.now, dayPnl: pnl });
    if (c.weekday === 'Fri' && !this.dark.unlocked && equity > this.weekStartEquity) {
      this.dark.unlocked = true;
      this.emit({ kind: 'unlock', at: this.now, what: 'darkweb' });
    }
  }

  /** Run as much simulated time as the speed says this many wall milliseconds are worth. */
  advance(wallMs: number): void {
    if (this.speed === 0) return;
    const ticks = Math.min(MAX_TICKS_PER_ADVANCE, Math.floor((wallMs * this.speed) / TICK_MS));
    for (let i = 0; i < ticks; i++) this.step();
  }

  /** Jump to a minute before the next open, in coarse steps, so overnight news lands and prices in on the way. */
  skipToOpen(): void {
    if (isMarketOpen(this.now)) return;
    const target = nextOpen(this.now) - MS_PER_MINUTE;
    while (this.now < target) this.step(Math.min(JUMP_STEP, target - this.now));
    this.version++;
  }

  setSpeed(speed: Speed): void {
    this.speed = speed;
    this.version++;
  }

  setBlock(id: string, change: { enabled?: boolean; params?: Partial<Params>; source?: string }): void {
    this.firm.setBlock(id, change);
    this.version++;
  }

  /** Watch a symbol or stop; the computer's limit is applied when the blocks look, not here. */
  setWatch(symbol: string, on: boolean): void {
    const current = this.firm.watching(this.market.stocks.map((s) => s.symbol));
    const next = on ? [...current, symbol] : current.filter((w) => w !== symbol);
    this.firm.setWatch(next);
    this.version++;
  }

  buyUpgrade(kind: UpgradeKind, id: string): void {
    buyUpgrade(this.content, this.firm, this.owned, kind, id);
    this.emit({ kind: 'upgrade', at: this.now, kind2: kind, id });
    this.version++;
  }

  buyTip(id: number): Tip {
    const tip = this.dark.buy(id, this.firm);
    this.emit({ kind: 'tip', at: this.now, tip });
    this.version++;
    return tip;
  }

  snapshot(): Snapshot {
    const now = this.now;
    const open = isMarketOpen(now);
    const firm = this.firm;
    const latency: Record<string, number> = {};
    const dataLatency: Record<string, number> = {};
    for (const e of this.market.exchanges) {
      latency[e.id] = firm.latency(e.id);
      dataLatency[e.id] = firm.dataLatency(e.id);
    }
    const positions: Snapshot['positions'] = [];
    for (const [symbol, pos] of firm.positions) {
      if (pos.qty === 0) continue;
      const mark = this.market.exchanges[0]?.book(symbol).mid() ?? null;
      positions.push({
        symbol,
        qty: pos.qty,
        avgCost: pos.avgCost,
        mark,
        unrealised: mark === null ? 0 : (mark - pos.avgCost) * pos.qty,
      });
    }
    const unrealised = firm.unrealised(this.market, now);
    const equity = firm.equity(this.market, now);
    const watching = firm.watching(this.market.stocks.map((s) => s.symbol));
    return {
      now,
      calendar: calendar(now),
      open,
      nextChange: open ? nextClose(now) : nextOpen(now),
      regime: open || this.days.some((d) => d.day === calendar(now).day) ? this.market.regime : null,
      speed: this.speed,
      cash: firm.cash,
      equity,
      dayPnl: open ? equity - this.dayStartEquity : (this.days[this.days.length - 1]?.pnl ?? 0),
      realised: firm.realised,
      unrealised,
      feesPaid: firm.feesPaid,
      finesPaid: firm.finesPaid,
      heat: firm.heat,
      heatLine: HEAT_FINE_LINE,
      risk: { ...firm.risk },
      halt: firm.halt ? { ...firm.halt } : null,
      positions,
      openOrders: [...firm.orders.values()].filter(
        (o) => o.status === 'inflight' || o.status === 'resting' || o.status === 'cancelling',
      ),
      orders: this.stories(),
      names: Object.fromEntries([
        ['bg', 'the crowd'],
        ...this.competitors.map((c): [string, string] => [c.id, c.name]),
      ]),
      fills: firm.fills.slice(-50).reverse(),
      blocks: firm.blocks,
      script: { ...scriptState(firm.blocks.find((b) => b.id === SCRIPT_ID)?.source ?? '') },
      capacity: {
        blocksUsed: firm.enabledBlocks().length,
        maxBlocks: firm.infra.computer.maxBlocks,
        ordersPerSecond: firm.infra.computer.ordersPerSecond,
        ordersSent: firm.stats.ordersSent,
        ordersDropped: firm.stats.ordersDropped,
        ordersRejected: firm.stats.ordersRejected,
        decisionEveryMs: firm.infra.computer.decisionEveryMs,
      },
      gapsSeen: firm.stats.gapsSeen,
      infra: { location: firm.infra.location.id, network: firm.infra.network.id, computer: firm.infra.computer.id },
      latency,
      dataLatency,
      watching: { count: watching.length, max: firm.infra.computer.maxSymbols },
      stocks: this.market.stocks.map((s) => ({
        symbol: s.symbol,
        name: s.name,
        sector: s.sector,
        constituents: s.constituents ? [...s.constituents] : null,
        watched: watching.includes(s.symbol),
        fair: this.market.fair.get(s.symbol) ?? s.startPrice,
        ...this.touchAcross(s.symbol, now),
        dayChange: this.dayChange(s.symbol),
        exchanges: this.market.exchanges.map((e) => ({
          id: e.id,
          seen: e.quoteAsOf(s.symbol, now - firm.dataLatency(e.id)),
          last: e.book(s.symbol).lastPrice,
          depth: e.book(s.symbol).depth(5, firm.id),
        })),
        history: this.market.history.get(s.symbol) ?? [],
      })),
      exchanges: this.market.exchanges.map((e) => ({
        id: e.id,
        name: e.spec.name,
        city: e.spec.city,
        feePerShare: e.spec.feePerShare,
      })),
      news: [...this.news.published].reverse(),
      dark: {
        unlocked: this.dark.unlocked,
        offers: this.dark.offers,
        bought: [...this.dark.bought].reverse(),
        fines: this.dark.fines,
      },
      competitors: this.competitors.map((c) => {
        const l: Record<string, number> = {};
        for (const e of this.market.exchanges) l[e.id] = c.latency(e.id);
        return {
          id: c.id,
          name: c.name,
          latency: l,
          fills: c.stats.fillsReceived,
          pnl: c.realised - c.feesPaid + c.unrealised(this.market, now),
        };
      }),
      shop: catalogue(this.content, firm, this.owned),
      days: this.days,
      log: this.log,
    };
  }

  /** The best bid and ask the firm can see across exchanges. */
  private touchAcross(symbol: string, now: number): { bid: number | null; ask: number | null } {
    let bid: number | null = null;
    let ask: number | null = null;
    for (const e of this.market.exchanges) {
      const q = e.quoteAsOf(symbol, now - this.firm.dataLatency(e.id));
      if (!q) continue;
      if (q.bid !== null && (bid === null || q.bid > bid)) bid = q.bid;
      if (q.ask !== null && (ask === null || q.ask < ask)) ask = q.ask;
    }
    return { bid, ask };
  }

  /** The move since the first sample of the day, cents, from the history. */
  private dayChange(symbol: string): number | null {
    const h = this.market.history.get(symbol);
    if (!h || h.length === 0) return null;
    const day = calendar(this.now).day;
    const first = h.find((p) => Math.floor(p.at / MS_PER_DAY) === day);
    const last = h[h.length - 1];
    if (!first || !last) return null;
    const mid = (p: HistoryPoint) => {
      const ms = Object.values(p.mids).filter((m): m is number => m !== null);
      return ms.length > 0 ? ms.reduce((a, b) => a + b, 0) / ms.length : p.fair;
    };
    return mid(last) - mid(first);
  }

  private stories(): OrderStory[] {
    const orders = [...this.firm.orders.values()].slice(-ORDER_STORIES).reverse();
    const byOrder = new Map<number, { fee: number; realised: number }>();
    for (const f of this.firm.fills) {
      const t = byOrder.get(f.localId) ?? { fee: 0, realised: 0 };
      t.fee += f.fee;
      t.realised += f.realised;
      byOrder.set(f.localId, t);
    }
    return orders.map((o) => ({ ...o, ...(byOrder.get(o.localId) ?? { fee: 0, realised: 0 }) }));
  }

  save(): SavedGame {
    return {
      version: 1,
      seed: this.seed,
      now: this.now,
      speed: this.speed,
      random: this.random.save(),
      market: this.market.save(),
      news: this.news.save(),
      dark: this.dark.save(),
      firm: this.firm.save(),
      firmInfra: {
        location: this.firm.infra.location.id,
        network: this.firm.infra.network.id,
        computer: this.firm.infra.computer.id,
      },
      competitors: this.competitors.map((c) => c.save()),
      owned: [...this.owned],
      dayStartEquity: this.dayStartEquity,
      weekStartEquity: this.weekStartEquity,
      days: this.days,
      log: this.log,
      wasOpen: this.wasOpen,
      today: this.today,
    };
  }

  static load(content: Content, s: SavedGame): Game {
    const version: number = s.version;
    if (version !== 1) throw new Error(`Cannot load a save of version ${String(version)}`);
    const g = new Game(content, s.seed ?? 0);
    g.now = s.now;
    g.speed = s.speed;
    g.random = Random.load(s.random);
    g.market.load(s.market);
    g.news.load(s.news);
    g.dark.load(s.dark);
    const firm = Firm.load(s.firm, infrastructureFrom(content, s.firmInfra));
    // A save from before a block existed has no setting for it: the default stands in, off. The rivals keep
    // their own single block as saved.
    firm.blocks = Firm.defaultBlocks().map((d) => firm.blocks.find((b) => b.id === d.id) ?? d);
    Object.assign(g, { firm });
    const competitors = s.competitors.map((c) => {
      const spec = content.competitors.find((x) => `bot:${x.id}` === c.id);
      if (!spec) throw new Error(`Unknown competitor ${c.id}`);
      return Firm.load(c, infrastructureFrom(content, spec));
    });
    Object.assign(g, { competitors });
    g.owned.clear();
    for (const id of s.owned) g.owned.add(id);
    g.dayStartEquity = s.dayStartEquity;
    g.weekStartEquity = s.weekStartEquity;
    g.days = s.days.map((d) => ('byBlock' in d ? { ...d } : upgraded(d)));
    g.today = s.today ? { ...freshToday(), ...s.today } : freshToday();
    g.log = s.log.map((e) => ({ ...e }));
    g.wasOpen = s.wasOpen;
    return g;
  }

  /** A hash of the state that matters, for the determinism check. */
  fingerprint(): string {
    const s = this.save();
    const text = JSON.stringify({
      now: s.now,
      random: s.random,
      market: s.market,
      firm: s.firm,
      competitors: s.competitors,
      news: s.news,
    });
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }
}

export { BLOCKS, MARKET_OPEN, MS_PER_DAY };

/** A day saved before the report existed: the number it had, and nothing else to say. */
function upgraded(d: DayRecord): DayReport {
  return {
    day: d.day,
    weekday: d.weekday,
    week: Math.floor(d.day / 7) + 1,
    pnl: d.pnl,
    equityAtClose: 0,
    byBlock: {},
    bySymbol: {},
    races: { won: 0, beaten: 0, missed: 0 },
    fees: 0,
    fines: 0,
    headlines: [],
    latency: {},
    rivals: [],
    halts: [],
    regulator: [],
  };
}
