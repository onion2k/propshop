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
import { Firm, type BlockSetting, type SavedFirm } from './firm';
import { tick } from './flow';
import type { Level } from './orderbook';
import { Market, type HistoryPoint, type SavedMarket } from './market';
import { News, type Published, type SavedNews } from './news';
import { Random } from './random';
import { BLOCKS, SCRIPT_ID, scriptState, type Fill, type OpenOrder, type Params } from './strategy';
import { buyUpgrade, catalogue, infrastructureFrom, type UpgradeKind, type UpgradeOffer } from './upgrades';
import type { Content } from './types';

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
  | { kind: 'upgrade'; at: number; kind2: UpgradeKind; id: string };

export interface DayRecord {
  day: number;
  weekday: Calendar['weekday'];
  /** Cents. */
  pnl: number;
}

export interface SavedGame {
  version: 1;
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
  days: DayRecord[];
  log: GameEvent[];
  wasOpen: boolean;
}

/** What the UI reads, rebuilt on demand. Plain data, so it can cross a wire one day. */
export interface Snapshot {
  now: number;
  calendar: Calendar;
  open: boolean;
  nextChange: number;
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
    decisionEveryMs: number;
  };
  /** How many times the firm has seen a gap between the exchanges it could have raced for. */
  gapsSeen: number;
  infra: { location: string; network: string; computer: string };
  latency: Record<string, number>;
  stocks: {
    symbol: string;
    name: string;
    sector: string;
    fair: number;
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
  days: DayRecord[];
  log: GameEvent[];
}

const LOG_LENGTH = 200;
const ORDER_STORIES = 30;

export interface OrderStory extends OpenOrder {
  /** Fee paid and P&L realised by this order's fills, cents. */
  fee: number;
  realised: number;
}

export class Game {
  readonly content: Content;
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
  days: DayRecord[] = [];
  log: GameEvent[] = [];
  private wasOpen: boolean;
  private listeners: ((e: GameEvent) => void)[] = [];
  /** Bumped on every change the UI might care about. */
  version = 0;

  constructor(content: Content, seed: number) {
    this.content = content;
    // The game begins at six on Monday morning: the market opens in a few hours, so the player has time to look.
    this.now = 6 * 60 * MS_PER_MINUTE;
    this.random = new Random(seed);
    this.market = new Market(content.stocks, content.exchanges);
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
          { id: 'arbitrage', enabled: true, params: { minEdge: c.minEdge, size: 300, maxPosition: 3000 } },
        ]),
    );
    this.dayStartEquity = content.startingCash;
    this.weekStartEquity = content.startingCash;
    this.wasOpen = false;
    this.news.step(this.now, this.market, this.random);
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
    for (const f of this.firm.tickFills) this.emit({ kind: 'fill', at: this.now, fill: f });
    for (const h of this.news.tickPublished) this.emit({ kind: 'news', at: this.now, headline: h });
    for (const f of this.dark.tickFines) this.emit({ kind: 'fine', at: this.now, fine: f });
    const open = isMarketOpen(this.now);
    if (open && !this.wasOpen) this.onOpen();
    if (!open && this.wasOpen) this.onClose();
    this.wasOpen = open;
    this.version++;
  }

  private onOpen(): void {
    this.dayStartEquity = this.firm.equity(this.market, this.now);
    if (calendar(this.now).weekday === 'Mon') this.weekStartEquity = this.dayStartEquity;
    this.emit({ kind: 'open', at: this.now });
  }

  private onClose(): void {
    const equity = this.firm.equity(this.market, this.now);
    const c = calendar(this.now);
    const pnl = equity - this.dayStartEquity;
    this.days.push({ day: c.day, weekday: c.weekday, pnl });
    if (this.days.length > 60) this.days.splice(0, this.days.length - 60);
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
    for (const e of this.market.exchanges) latency[e.id] = firm.latency(e.id);
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
    return {
      now,
      calendar: calendar(now),
      open,
      nextChange: open ? nextClose(now) : nextOpen(now),
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
        decisionEveryMs: firm.infra.computer.decisionEveryMs,
      },
      gapsSeen: firm.stats.gapsSeen,
      infra: { location: firm.infra.location.id, network: firm.infra.network.id, computer: firm.infra.computer.id },
      latency,
      stocks: this.market.stocks.map((s) => ({
        symbol: s.symbol,
        name: s.name,
        sector: s.sector,
        fair: this.market.fair.get(s.symbol) ?? s.startPrice,
        exchanges: this.market.exchanges.map((e) => ({
          id: e.id,
          seen: e.quoteAsOf(s.symbol, now - firm.latency(e.id)),
          last: e.book(s.symbol).lastPrice,
          depth: e.book(s.symbol).depth(5),
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
    };
  }

  static load(content: Content, s: SavedGame): Game {
    const version: number = s.version;
    if (version !== 1) throw new Error(`Cannot load a save of version ${String(version)}`);
    const g = new Game(content, 0);
    g.now = s.now;
    g.speed = s.speed;
    g.random = Random.load(s.random);
    g.market.load(s.market);
    g.news.load(s.news);
    g.dark.load(s.dark);
    const firm = Firm.load(s.firm, infrastructureFrom(content, s.firmInfra));
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
    g.days = s.days.map((d) => ({ ...d }));
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
