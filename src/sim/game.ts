// The game: one object that owns the clock, the market, the news, the dark web, the player's firm and the
// competitors, steps them together, and answers the UI's questions. Nothing in here draws anything.

import {
  MARKET_OPEN,
  MS_PER_DAY,
  MS_PER_MINUTE,
  calendar,
  isMarketOpen,
  isWeekday,
  nextClose,
  nextOpen,
  type Calendar,
} from './clock';
import { DarkWeb, HEAT_FINE_LINE, type Fine, type SavedDarkWeb, type Tip } from './darkweb';
import {
  DELIVERY_BLOCK,
  Firm,
  type BlockSetting,
  type GapEpisode,
  HAND_BLOCK,
  type HandResult,
  type PendingHand,
  type Halt,
  type RiskSettings,
  type SavedFirm,
  type Wire,
} from './firm';
import { tick } from './flow';
import {
  HOME,
  STOCKS_DESK,
  currencyOf,
  decimalsOf,
  deskOf,
  isCarried,
  listedOn,
  rolloverDays,
  storageDays,
  inHome,
  toHome,
  valueOf,
} from './instrument';
import type { Fix } from './exchange';
import type { Level } from './orderbook';
import type { Indicative } from './strategy/types';
import { Market, type HistoryPoint, type SavedMarket } from './market';
import { DeskNews, News, type Published, type SavedDeskNews, type SavedNews } from './news';
import { Random, deriveStreams, loadStreams, saveStreams, type SavedStreams, type Streams } from './random';
import { driftPerMs, driftSign, regimeFor } from './regime';
import {
  BLOCKS,
  DESK_BLOCKS,
  SCRIPT_ID,
  blockById,
  paramsFrom,
  scriptState,
  type Fill,
  type HandIntent,
  type OpenOrder,
  type Params,
} from './strategy';
import type { Setup } from './experiment';
import { buyUpgrade, catalogue, infrastructureFrom, rentOf, type UpgradeKind, type UpgradeOffer } from './upgrades';
import { DEFAULT_RULES, type Content, type ExchangeRules, type InstrumentSpec, type RegimeSpec } from './types';

/** One tick of simulated time, in ms. A colocated firm is within a tick of its exchange; a home office is twenty
    away; a trading day is nearly twelve million. */
export const TICK_MS = 2;
/** Speeds the player may pick: simulated ms per wall ms. */
export const SPEEDS = [0, 1, 10, 60, 300] as const;
export type Speed = (typeof SPEEDS)[number];
/** The most ticks one call to advance will run, so a tab that was hidden for an hour does not hang catching up. */
export const MAX_TICKS_PER_ADVANCE = 15000;
/** When jumping over closed hours, how big a step the sim takes. */
const JUMP_STEP = MS_PER_MINUTE;

/** A public time the game is heading for: the stocks' open or close, a fix, or a contract's expiry. */
export interface NextMoment {
  /** Simulated ms; always after now. */
  at: number;
  kind: 'open' | 'close' | 'fix' | 'expiry';
  /** What to call it, plainly: "The close", "The Thamesford fix", "GCZ6 expiry". */
  label: string;
}

/** How many days ahead `nextMoment` looks for a fix: a weekend and a day over. */
const FIX_LOOK_DAYS = 4;

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
  | { kind: 'rules'; at: number; exchange: string; rules: ExchangeRules }
  | { kind: 'regulator'; at: number; note: string; heat: number }
  | { kind: 'margin'; at: number; symbols: string[] }
  /**
   * A contract the firm held to expiry was delivered as its underlying: `symbol` is the underlying, `units` its lots
   * (negative where the firm was short), `value` the cents it was worth at the final price.
   */
  | { kind: 'delivery'; at: number; symbol: string; units: number; value: number }
  /** An arbitrage block's round closed (the triangle's three legs filled): what it netted at home, cents, fees out. */
  | { kind: 'round'; at: number; block: string; net: number };

/** A point of the day so far: the firm's equity and each block's net (realised less fees), cents. */
export interface IntradayPoint {
  at: number;
  equity: number;
  byBlock: Record<string, number>;
}

/** The most points the day keeps: one a simulated minute of a 390-minute session, with room over. */
export const MAX_INTRADAY = 400;

/** The most margins the day keeps for each rival that beat the firm (the count stays exact); the median reads these. */
export const MAX_MARGINS_KEPT = 400;

/** How long after a resting quote was taken by a rival the mid is read, to say what the quote was worth. */
export const MARKOUT_MS = 1000;

/** The most quotes waiting on their mark-out at once; past it the count stays exact and the figure is left out. */
export const MAX_MARKOUTS = 200;

/** A resting fill taken by a named rival, waiting for its mark-out. */
interface Markout {
  rival: string;
  exchange: string;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  due: number;
}

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
  /** Races lost to each named rival: how many, and the median ms its order was ahead. Missing in a report saved before it. */
  beatenBy?: Record<string, { count: number; medianMs: number }>;
  /**
   * Resting quotes each named rival took, and what they were worth: cents the price moved against the firm in the
   * `MARKOUT_MS` after (negative where it moved for it). Missing in a report saved before it.
   */
  takenBy?: Record<string, { count: number; cents: number }>;
  /** Orders dropped for capacity that day. Missing in a report saved before it. */
  dropped?: number;
  /** By desk, where a desk other than the stocks traded that day; absent otherwise. */
  byDesk?: Record<string, Tally>;
  /**
   * The currencies' rollover at 17:00 that day, after the stocks' close, in dollar cents at the rates then: written
   * into the report when it runs, and counted in its `pnl` and `equityAtClose`. Absent where the firm held no
   * currency position at 17:00.
   */
  rollover?: number;
  /**
   * Storage on metal held long and the lease on metal held short, at 17:00 that day, in cents (negative is paid):
   * written in and counted in `pnl` and `equityAtClose` as the rollover is. Absent where no metal was held then.
   */
  storage?: number;
  /**
   * The week's rent, charged at this Friday's close on what was in use, in cents paid (positive): counted in `pnl`
   * and `equityAtClose`. Present on a Friday where the setup in use had a rent; absent otherwise and before rent.
   */
  rent?: number;
}

/** The older shape of a day, kept so a save from before the report still loads. */
export interface DayRecord {
  day: number;
  weekday: Calendar['weekday'];
  pnl: number;
}

/** The first shape of a save, with one random state; it loads, and its streams are derived from that state. */
export interface SavedGameV1 extends Omit<SavedGame, 'version' | 'streams'> {
  version: 1;
  random: number;
}

export interface SavedGame {
  version: 3;
  /** The seed the game began from, which the day's regime is drawn from. */
  seed?: number;
  now: number;
  speed: Speed;
  streams: SavedStreams;
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
  /** The day so far, a point a minute. Missing in a save from before it: it loads empty. */
  intraday?: IntradayPoint[];
  /** When the rules last changed, and each firm's equity then, for the lab's scoreboard. */
  rulesChangedAt?: number;
  equityAtRulesChange?: Record<string, number>;
  /** The desks open besides the stocks; absent in a save from before desks, and where none is. */
  desks?: string[];
  /** Each desk's own news, by desk, once it has run; absent before, and in every save from before it. */
  deskNews?: Record<string, SavedDeskNews>;
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
  /** By the rival's name; the rivals are the content's, so the keys are bounded by it. Margins by `MAX_MARGINS_KEPT`. */
  beatenBy?: Record<string, { count: number; marginsMs: number[] }>;
  /** Quotes taken by each named rival today (the rivals are the content's, so the keys are bounded by it). */
  takenBy?: Record<string, { count: number; cents: number }>;
  /** Taken quotes waiting for their mark-out, oldest first; bounded by `MAX_MARKOUTS`. Absent in a save from before it. */
  markouts?: Markout[];
  /** Fills of desks other than the stocks, by desk; absent until one trades. */
  byDesk?: Record<string, Tally>;
}

function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
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
  /** Rent paid in all, cents, and what Friday's close will charge on the setup in use now (the full week). */
  rentPaid: number;
  rentDue: number;
  heat: number;
  heatLine: number;
  risk: RiskSettings;
  halt: Halt | null;
  /** Each position held: its mark and average cost in its points, written to `decimals` places; unrealised in dollars. */
  positions: {
    symbol: string;
    qty: number;
    avgCost: number;
    mark: number | null;
    unrealised: number;
    decimals: number;
    /** Of it, what a contract held into expiry delivered: absent where none was. */
    delivered?: number;
  }[];
  /**
   * Each currency besides the dollar the firm may hold, while a pair that prices it is live: the amount in its minor
   * units (`minor` in one) and its value in dollar cents now. Empty while the currencies desk is closed.
   */
  balances: { currency: string; name: string; amount: number; minor: number; dollars: number }[];
  openOrders: OpenOrder[];
  /** Recent orders, open and finished, newest first, each with what its fills made. */
  orders: OrderStory[];
  /** Hand orders between the click and the send, oldest first, as the firm keeps them. */
  pendingHand: PendingHand[];
  /** The day so far from the open, a point a simulated minute (at most `MAX_INTRADAY`), oldest first. */
  intraday: IntradayPoint[];
  /** Today's hand trading against the touch at each click, cents: positive is what it cost the player. */
  handSlippage: number;
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
  /** The gaps the firm saw, newest first, the last twenty. A display of the past: not saved. */
  gaps: GapEpisode[];
  /** How many symbols the computer can watch, and how many the firm does. */
  watching: { count: number; max: number };
  infra: { location: string; network: string; computer: string };
  /** Order latency and data latency per exchange; the same unless the firm has racks at more than one. */
  latency: Record<string, number>;
  dataLatency: Record<string, number>;
  stocks: {
    symbol: string;
    name: string;
    /** The desk it trades on: `stocks` or another desk's id. */
    desk: string;
    sector: string;
    /** An index over these, or null for a stock. */
    constituents: string[] | null;
    watched: boolean;
    fair: number;
    /** The best bid and ask the firm can see across exchanges, and the change on the day in cents. */
    bid: number | null;
    ask: number | null;
    dayChange: number | null;
    /** The places its prices are written to: a price of `p` points reads `p / 10^decimals`. */
    decimals: number;
    /** A currency pair: the currency a unit buys, the one it is priced in, and a cross's two legs. */
    pair?: {
      base: string;
      quote: string;
      lot: number;
      cross: { base: string; quote: string }[] | null;
      /** Dollar cents a pip of one lot is worth at the rate now, so a fee in cents can be read in pips. */
      pointValue: number;
    };
    /** A metal: the ounces in a lot, and its lease rate now, a year. */
    metal?: { ounces: number; lease: number };
    exchanges: {
      id: string;
      /** The quote as the firm sees it, through its data latency; in a fix's call, the indicative it has seen. */
      seen: {
        bid: number | null;
        ask: number | null;
        bidSize: number;
        askSize: number;
        indicative?: Indicative;
      } | null;
      last: number | null;
      depth: { bids: Level[]; asks: Level[] };
    }[];
    history: HistoryPoint[];
    /** A contract priced from its underlying: what it is on, when it expires, its basis and what it asks. */
    contract?: {
      underlying: string;
      expiry: number;
      multiplier: number;
      carry: number;
      /** Fair value less the underlying's, in the underlying's cents: the carry to expiry. */
      basis: number;
      /** Cents a contract asks to open and to keep, at fair value. */
      margin: { initial: number; maintenance: number } | null;
      /** Whether one held at expiry is delivered as its underlying, not settled in cash. */
      delivery: boolean;
    };
  }[];
  /** The margin the firm's margined positions ask, cents, at their marks; absent while it holds none. */
  margin?: { initial: number; maintenance: number };
  /**
   * The venues, each with its fee; `dealer` where it takes a last look at an order before it fills it. A venue with
   * fixes has `fixes`: the times of day they are at, the moment the fix whose call is running uncrosses (`call`, null
   * outside a call) and its log, oldest first.
   */
  exchanges: {
    id: string;
    name: string;
    /** The desk it belongs to: `stocks` or another desk's id. */
    desk: string;
    city: string;
    feePerShare: number;
    dealer: boolean;
    auctions?: number[];
    call?: number | null;
    fixes?: Fix[];
  }[];
  news: Published[];
  /** Each open desk's own headlines (the metals' supply news), newest first, each with its desk. */
  deskNews: (Published & { desk: string })[];
  dark: { unlocked: boolean; offers: Tip[]; bought: Tip[]; fines: Fine[] };
  competitors: {
    id: string;
    name: string;
    latency: Record<string, number>;
    fills: number;
    pnl: number;
    /** Its equity's move since today's open while the market is open, else nought: the week's figure adds the closed days. */
    todayPnl: number;
    /** Where it sits (its location's name) and the ids of the blocks it runs. */
    location: string;
    runs: string[];
  }[];
  /** Today's quotes taken off the firm by each named rival, so far (the figure fills in a second after each). */
  takenToday: Record<string, { count: number; cents: number }>;
  /** The immediate-or-cancel races the firm has won today, so far: the moment of the first is marked. */
  racesWon: number;
  /** For the microscope: every firm's messages on the wire, and each exchange's belief per symbol. */
  wire: Wire[];
  beliefs: Record<string, Record<string, number>>;
  /** The rules each exchange runs, and each firm's P&L since the rules last changed. */
  rules: Record<string, ExchangeRules>;
  lab: { since: number; scores: { id: string; name: string; pnl: number }[] };
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
  /** The average price its fills got, cents, or null with none. */
  avgFill: number | null;
  /**
   * A hand order: cents a share its fills cost against the touch at the click (positive is worse for the
   * player, negative is better), or null with no fill or no touch to go on.
   */
  slippage: number | null;
}

export class Game {
  readonly content: Content;
  seed: number;
  now: number;
  speed: Speed = 1;
  streams: Streams;
  readonly market: Market;
  readonly news: News;
  /** Each desk's own news, stepped while its desk is open. */
  readonly deskNews: DeskNews[];
  readonly dark: DarkWeb;
  readonly firm: Firm;
  /** The rivals: the stocks' from the start, and each open desk's, which joined when it opened. */
  readonly competitors: Firm[];
  readonly owned: Set<string>;
  private dayStartEquity: number;
  private weekStartEquity: number;
  days: DayReport[] = [];
  private today: Today = freshToday();
  /** Bounded by `MAX_INTRADAY`; cleared at each open. */
  private intraday: IntradayPoint[] = [];
  private rulesChangedAt = 0;
  private equityAtRulesChange: Record<string, number> = {};
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
    // Another desk's instruments are in the game where a venue lists them: content without the desk's venues is
    // without the desk, and plays as it did before the desk was written.
    const others = (content.instruments ?? []).filter((s) => content.exchanges.some((e) => listedOn(s, e)));
    const currencies = (content.currencies ?? []).filter(
      (c) => c.pair === undefined || others.some((s) => s.symbol === c.pair),
    );
    this.market = new Market(
      [...content.stocks, ...others],
      content.exchanges,
      content.factors,
      content.series ?? [],
      others.some((s) => s.base !== undefined) ? currencies : [],
    );
    if (this.market.fx.size > 0) this.market.rollover = content.rollover ?? null;
    this.market.refreshContracts(this.now);
    this.streams = deriveStreams(
      this.seed,
      this.market.venues.map((e) => e.id),
      this.market.desks,
    );
    this.news = new News(content.news, content.stocks);
    this.deskNews = (content.deskNews ?? [])
      .filter((d) => this.market.desks.includes(d.desk))
      .map((d) => new DeskNews(d));
    this.dark = new DarkWeb();
    this.owned = new Set([content.start.location, content.start.network, content.start.computer]);
    this.firm = new Firm(
      'firm',
      content.firmName,
      content.startingCash,
      infrastructureFrom(content, content.start),
      Firm.defaultBlocks(content.start.blocks),
    );
    this.firm.reactionMs = content.desk.reactionMs;
    this.competitors = content.competitors.filter((c) => c.desk === undefined).map((c) => Game.rival(content, c));
    this.dayStartEquity = content.startingCash;
    this.weekStartEquity = content.startingCash;
    this.wasOpen = false;
    this.news.regimeFor = (day) => this.regimeFor(day);
    this.news.step(this.now, this.market, this.streams.world);
  }

  /** A rival firm from its spec: the blocks it names, else arbitrage at its edge. */
  private static rival(content: Content, c: Content['competitors'][number]): Firm {
    const blocks = c.blocks
      ? c.blocks.map((b) => ({
          id: b.id,
          enabled: true,
          params: paramsFrom(blockById(b.id).spec, b.params ?? {}),
        }))
      : [
          {
            id: 'arbitrage',
            enabled: true,
            params: { minEdge: c.minEdge, size: 300, maxPosition: 3000, maxLatency: c.maxLatency ?? 100 },
          },
        ];
    const rival = new Firm(`bot:${c.id}`, c.name, content.startingCash * 10, infrastructureFrom(content, c), blocks);
    rival.desks = Game.rivalDesks(c);
    return rival;
  }

  /** What a rival sees: the desks its spec names; else a stocks firm the stocks alone, a desk's its desk and them. */
  private static rivalDesks(c: Content['competitors'][number]): readonly string[] {
    return c.watches ?? (c.desk === undefined ? [STOCKS_DESK] : [STOCKS_DESK, c.desk]);
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
    this.news.step(this.now, this.market, this.streams.world);
    for (const n of this.deskNews) {
      if (!this.market.isDeskOpen(n.desk)) continue;
      const stream = this.streams.desks[n.desk];
      if (!stream) throw new Error(`No world stream for the ${n.desk} desk`);
      n.step(this.now, this.market, stream);
    }
    const { closedVenues } = tick(this.now, dt, this.market, this.firms(), this.streams, this.news.feed());
    this.dark.step(this.now, this.firm, this.news, this.streams.dark);
    for (const f of this.firm.tickFills) {
      this.emit({ kind: 'fill', at: this.now, fill: f });
      tally(this.today.byBlock, f.block, f);
      tally(this.today.bySymbol, f.symbol, f);
      const desk = deskOf(this.market.stock(f.symbol));
      if (desk !== STOCKS_DESK) tally((this.today.byDesk ??= {}), desk, f);
      this.today.fees += f.fee;
      if (f.resting) this.noteTaken(f);
    }
    for (const r of this.firm.takeRounds()) this.emit({ kind: 'round', at: this.now, block: r.block, net: r.net });
    if (this.today.markouts && this.today.markouts.length > 0) this.settleMarkouts(false);
    this.contracts(closedVenues);
    const roll = this.content.rollover;
    if (roll && this.market.fx.size > 0 && crossed(this.now, dt, roll.at)) this.rollover(roll);
    const store = this.content.storage;
    if (store && this.market.leases.size > 0 && crossed(this.now, dt, store.at)) this.storage(store);
    for (const o of this.firm.tickResolved) {
      if (!o.ioc) continue;
      if (o.filled >= o.size) this.today.races.won++;
      else if (o.beatenBy.length > 0) {
        this.today.races.beaten++;
        this.noteBeaten(o);
      } else this.today.races.missed++;
    }
    for (const h of this.news.tickPublished) this.emit({ kind: 'news', at: this.now, headline: h });
    for (const f of this.dark.tickFines) {
      this.emit({ kind: 'fine', at: this.now, fine: f });
      this.today.fines += f.cents;
    }
    const open = isMarketOpen(this.now);
    if (open && !this.wasOpen) this.onOpen();
    if (open && this.now % MS_PER_MINUTE === 0) this.record();
    if (open && !this.firm.halt && this.now % LOSS_CHECK_EVERY === 0) this.checkLoss();
    if (!open && this.wasOpen) this.onClose();
    this.wasOpen = open;
    this.version++;
  }

  /**
   * What margin asks of the firms each tick: the night's variation where a venue closed, the margin call on the
   * half second, and a contract's expiry when it comes. A game with nothing margined pays two checks a tick.
   */
  private contracts(closedVenues: readonly string[]): void {
    for (const venue of closedVenues) {
      for (const symbol of this.market.settlesOn(venue)) {
        const price = this.market.settlementPrice(symbol);
        for (const f of this.firms()) f.settle(symbol, price);
      }
    }
    if (this.now % LOSS_CHECK_EVERY === 0 && this.market.margins.size > 0) this.checkMargins();
    if (this.now >= this.market.nextExpiry) {
      for (const c of this.market.expired(this.now)) {
        const price = this.market.settlementPrice(c.symbol);
        // A contract delivers its units of the underlying, in the underlying's own lots.
        const lot = c.underlying !== undefined ? (this.market.stock(c.underlying).multiplier ?? 1) : 1;
        const delivery =
          c.settlement === 'delivery' && c.underlying !== undefined
            ? {
                underlying: c.underlying,
                units: (c.multiplier ?? 1) / lot,
                scale: this.market.scales.get(c.underlying) ?? 1,
              }
            : null;
        for (const f of this.firms()) {
          const left = f.expire(c.symbol, price, delivery);
          // Only the player's deliveries are told; a rival's is its own business.
          if (left && f === this.firm)
            this.emit({
              kind: 'delivery',
              at: this.now,
              symbol: left.underlying,
              units: left.units,
              value: left.value,
            });
        }
      }
      const gone = this.market.refreshContracts(this.now);
      for (const f of this.firms()) f.onClose(gone);
    }
  }

  /** The currencies' rollover, for every firm: what each pair's two rates and the venue's spread pay, on its days. */
  rollover(roll: NonNullable<Content['rollover']>): void {
    const days = rolloverDays(this.now);
    if (days === 0) return;
    const markOf = (symbol: string) => this.market.markOf(symbol, this.now);
    for (const f of this.firms()) {
      const credited = f.rollover(days, markOf, this.market.yearly, roll.spread, roll.basis);
      if (f === this.firm && credited.length > 0) this.reportRollover(credited);
    }
  }

  /**
   * The player's rollover, in dollars, into the report of the day it ran on, and into that day's P&L and its equity
   * at the close: it lands after the close and before the next open, so it would otherwise count in no day (the
   * next day starts from the equity it left). The week's P&L is the sum of its days, so it counts there too. A day
   * with no report keeps none.
   */
  private reportRollover(credited: readonly { currency: string; amount: number }[]): void {
    const i = this.days.length - 1;
    const last = this.days[i];
    if (!last || last.day !== calendar(this.now).day) return;
    const dollars = credited.reduce((n, c) => n + toHome(c.currency, c.amount, this.market.rates), 0);
    this.days[i] = {
      ...last,
      pnl: last.pnl + dollars,
      equityAtClose: last.equityAtClose + dollars,
      rollover: (last.rollover ?? 0) + dollars,
    };
  }

  /**
   * Storage and the lease, for every firm: metal held long pays storage, metal held short its lease, on the nights the
   * day carries. The player's goes into that day's report and P&L, as the rollover does.
   */
  storage(store: NonNullable<Content['storage']>): void {
    const days = storageDays(this.now);
    if (days === 0) return;
    const markOf = (symbol: string) => this.market.markOf(symbol, this.now);
    for (const f of this.firms()) {
      const charged = f.storage(days, this.market.leases, markOf, store.rate, store.basis);
      if (f === this.firm && charged !== 0) this.reportStorage(charged);
    }
  }

  /** The player's storage and lease into the report of the day it was charged on, its P&L and its equity at the close. */
  private reportStorage(cents: number): void {
    const i = this.days.length - 1;
    const last = this.days[i];
    if (!last || last.day !== calendar(this.now).day) return;
    this.days[i] = {
      ...last,
      pnl: last.pnl + cents,
      equityAtClose: last.equityAtClose + cents,
      storage: (last.storage ?? 0) + cents,
    };
  }

  /** Each firm holding a margined position on an open venue: below the maintenance margin, it is flattened in them. */
  private checkMargins(): void {
    for (const f of this.firms()) {
      const held = f.marginedHeld().filter((s) => this.market.isOpenFor(s, this.now));
      if (held.length === 0) {
        f.marginCalled = false;
        continue;
      }
      const marks = new Map<string, number>();
      for (const s of held) {
        const mid = this.market.venuesOf(s)[0]?.book(s).mid() ?? null;
        if (mid !== null) marks.set(s, mid);
      }
      if (f.equity(this.market, this.now) >= f.marginRequired('maintenance', marks)) {
        f.marginCalled = false;
        continue;
      }
      f.marginCall(this.now, this.market, this.news.feed());
      if (f.marginCalled) continue;
      f.marginCalled = true;
      if (f === this.firm) {
        const reason = `margin call: below the maintenance margin in ${held.join(', ')}, flattened`;
        this.today.halts.push(reason);
        this.emit({ kind: 'margin', at: this.now, symbols: held });
      }
    }
  }

  /** One point of the day: on the simulated minute only, so the stepping loop pays a modulo and nothing more. */
  private record(): void {
    const byBlock: Record<string, number> = {};
    for (const [id, t] of Object.entries(this.today.byBlock)) byBlock[id] = t.realised - t.fees;
    this.intraday.push({ at: this.now, equity: this.firm.equity(this.market, this.now), byBlock });
    if (this.intraday.length > MAX_INTRADAY) this.intraday.splice(0, this.intraday.length - MAX_INTRADAY);
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
    // The day's character is the stocks desk's: another desk's instruments take no drift from it.
    this.market.stocks.forEach((s, i) => {
      if ((s.desk ?? STOCKS_DESK) !== STOCKS_DESK) return;
      drifts.set(
        s.symbol,
        driftPerMs(regime, this.market.fair.get(s.symbol) ?? s.startPrice, driftSign(this.seed, day, i)),
      );
    });
    this.market.setRegime(regime, drifts);
    this.dayStartEquity = this.firm.equity(this.market, this.now);
    if (calendar(this.now).weekday === 'Mon') this.weekStartEquity = this.dayStartEquity;
    this.today = freshToday();
    this.intraday = [];
    this.today.openedAt = this.now;
    this.today.statsAtOpen = {
      ordersSent: this.firm.stats.ordersSent,
      cancelsSent: this.firm.stats.cancelsSent,
      ordersDropped: this.firm.stats.ordersDropped,
    };
    for (const c of this.competitors) this.today.rivalsAtOpen[c.id] = c.equity(this.market, this.now);
    this.emit({ kind: 'open', at: this.now });
  }

  /** Who won a lost race, and by how long: the first rival to take the quote, as `Run` reads it. */
  private noteBeaten(o: { arrivedAt: number | null; beatenBy: { owner: string; at: number }[] }): void {
    const rival = o.beatenBy[0]!;
    const name =
      this.competitors.find((c) => c.id === rival.owner)?.name ?? (rival.owner === 'bg' ? 'the crowd' : rival.owner);
    const by = (this.today.beatenBy ??= {});
    const t = (by[name] ??= { count: 0, marginsMs: [] });
    t.count++;
    if (t.marginsMs.length < MAX_MARGINS_KEPT) t.marginsMs.push(Math.max(0, (o.arrivedAt ?? rival.at) - rival.at));
  }

  /** A resting quote of the firm's that a named rival took: counted now, worth marked out `MARKOUT_MS` later. */
  private noteTaken(f: {
    against?: string;
    at: number;
    exchange: string;
    symbol: string;
    side: 'buy' | 'sell';
    price: number;
    size: number;
  }): void {
    const rival = this.competitors.find((c) => c.id === f.against);
    if (!rival) return;
    const by = (this.today.takenBy ??= {});
    const t = (by[rival.name] ??= { count: 0, cents: 0 });
    t.count++;
    const list = (this.today.markouts ??= []);
    if (list.length < MAX_MARKOUTS)
      list.push({
        rival: rival.name,
        exchange: f.exchange,
        symbol: f.symbol,
        side: f.side,
        price: f.price,
        size: f.size,
        due: f.at + MARKOUT_MS,
      });
  }

  /** Quotes waiting for their mark-out, for the tests and the page's bound. */
  markoutsPending(): number {
    return this.today.markouts?.length ?? 0;
  }

  /** Marks out the quotes whose time has come (all of them, at the close): cents the mid moved against the firm. */
  private settleMarkouts(all: boolean): void {
    const list = this.today.markouts;
    if (!list) return;
    let n = 0;
    while (n < list.length && (all || list[n]!.due <= this.now)) {
      const m = list[n]!;
      n++;
      const ex = this.market.exchanges.find((e) => e.id === m.exchange);
      const q = ex?.quote(m.symbol);
      if (!q || q.bid === null || q.ask === null) continue;
      const mid = (q.bid + q.ask) / 2;
      const against = m.side === 'buy' ? m.price - mid : mid - m.price;
      let cents = valueOf(this.market.scales.get(m.symbol) ?? 1, m.size, against);
      const pair = this.market.fx.get(m.symbol);
      if (pair && pair.quote !== HOME) cents = toHome(pair.quote, cents, this.market.rates);
      this.today.takenBy![m.rival]!.cents += Math.round(cents);
    }
    list.splice(0, n);
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

  /** Friday's rent from every firm on what it has in use; the player's, in cents. Draws from no stream. */
  private chargeRent(): number {
    let mine = 0;
    for (const f of this.firms()) {
      const paid = f.payRent();
      if (f === this.firm) mine = paid;
    }
    return mine;
  }

  private onClose(): void {
    this.regulate();
    this.settleMarkouts(true);
    const c = calendar(this.now);
    // The week's rent, at the stocks' close on Friday, to every firm, before the day is added up: it is Friday's cost.
    const rent = c.weekday === 'Fri' ? this.chargeRent() : 0;
    const equity = this.firm.equity(this.market, this.now);
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
      beatenBy: Object.fromEntries(
        Object.entries(this.today.beatenBy ?? {}).map(([name, t]) => [
          name,
          { count: t.count, medianMs: median(t.marginsMs) },
        ]),
      ),
      takenBy: Object.fromEntries(Object.entries(this.today.takenBy ?? {}).map(([name, t]) => [name, { ...t }])),
      dropped: this.firm.stats.ordersDropped - this.today.statsAtOpen.ordersDropped,
      ...(this.today.byDesk ? { byDesk: this.byDesk() } : {}),
      ...(rent > 0 ? { rent } : {}),
    });
    if (this.days.length > DAYS_KEPT) this.days.splice(0, this.days.length - DAYS_KEPT);
    this.emit({ kind: 'close', at: this.now, dayPnl: pnl });
    if (c.weekday === 'Fri' && !this.dark.unlocked && equity > this.weekStartEquity) {
      this.dark.unlocked = true;
      this.emit({ kind: 'unlock', at: this.now, what: 'darkweb' });
    }
  }

  /** So many ticks, whatever the speed: the microscope's step. */
  stepTicks(n: number): void {
    for (let i = 0; i < n; i++) this.step();
  }

  /** Run as much simulated time as the speed says this many wall milliseconds are worth. */
  advance(wallMs: number): void {
    if (this.speed === 0) return;
    const ticks = Math.min(MAX_TICKS_PER_ADVANCE, Math.floor((wallMs * this.speed) / TICK_MS));
    for (let i = 0; i < ticks; i++) this.step();
  }

  /** The day by desk: the stocks' from their symbols, the others' as tallied. */
  private byDesk(): Record<string, Tally> {
    const stocks: Tally = { fills: 0, realised: 0, fees: 0 };
    for (const [symbol, t] of Object.entries(this.today.bySymbol)) {
      const spec = this.market.instruments.find((s) => s.symbol === symbol);
      if (!spec || deskOf(spec) !== STOCKS_DESK) continue;
      stocks.fills += t.fills;
      stocks.realised += t.realised;
      stocks.fees += t.fees;
    }
    return { [STOCKS_DESK]: stocks, ...this.today.byDesk };
  }

  /** Open another desk: its instruments and venues step from now on, and the firms and the page see them. */
  openDesk(desk: string): void {
    if (!this.market.desks.includes(desk)) throw new Error(`No desk ${desk}`);
    this.market.openDesk(desk);
    // The desk's rivals join, after the others, in the content's order.
    for (const c of this.content.competitors) {
      if (c.desk !== desk || this.competitors.some((f) => f.id === `bot:${c.id}`)) continue;
      const rival = Game.rival(this.content, c);
      this.competitors.push(rival);
      this.today.rivalsAtOpen[rival.id] = rival.equity(this.market, this.now);
    }
    // The desk's blocks join the player's, off, after the stocks'.
    for (const id of DESK_BLOCKS[desk] ?? []) {
      if (this.firm.blocks.some((b) => b.id === id)) continue;
      this.firm.blocks.push({ id, enabled: false, params: paramsFrom(blockById(id).spec) });
    }
    this.version++;
  }

  /** The next moment a venue opens, strictly after now, on its own hours. */
  nextOpenOf(venue: string): number {
    return this.market.venue(venue).nextOpen(this.now);
  }

  /**
   * The next public time, strictly after now: the stocks' open (closed) or close (open), a fix of a venue of an open
   * desk (none at the weekend, nor where the venue is shut at the fix) and the soonest expiry among the live contracts
   * of open desks. It is the schedule alone, worked out from the clock and the listing: no headline, tip or anything
   * drawn from a stream is in it, it draws nothing and changes nothing. Null if there is nothing (never, in practice).
   */
  nextMoment(): NextMoment | null {
    const now = this.now;
    let best: NextMoment = isMarketOpen(now)
      ? { at: nextClose(now), kind: 'close', label: 'The close' }
      : { at: nextOpen(now), kind: 'open', label: 'The open' };
    const day0 = Math.floor(now / MS_PER_DAY);
    for (const e of this.market.exchanges) {
      const auctions = e.spec.auctions;
      if (!auctions) continue;
      for (let day = day0; day <= day0 + FIX_LOOK_DAYS; day++) {
        if (!isWeekday(day)) continue;
        for (const a of auctions) {
          const at = day * MS_PER_DAY + a.at;
          if (at > now && at < best.at && e.isOpen(at)) best = { at, kind: 'fix', label: `The ${e.spec.city} fix` };
        }
      }
    }
    for (const s of this.market.stocks) {
      if (s.expiry !== undefined && s.expiry > now && s.expiry < best.at)
        best = { at: s.expiry, kind: 'expiry', label: `${s.symbol} expiry` };
    }
    return best;
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

  /**
   * The player clicks: one order, sent as the block `hand` after the reaction time. Refused at once, with the
   * reason, while the market is closed.
   */
  hand(intent: HandIntent): HandResult {
    const result = this.firm.hand(intent, this.now, this.market, this.news.feed());
    this.version++;
    return result;
  }

  /** Set an exchange's rules from the lab, and start the scoreboard again from here. */
  setRules(exchange: string, change: Partial<ExchangeRules>): void {
    const e = this.market.exchange(exchange);
    e.rules = { ...e.rules, ...change };
    this.rulesChangedAt = this.now;
    this.equityAtRulesChange = {};
    for (const f of [this.firm, ...this.competitors]) this.equityAtRulesChange[f.id] = f.equity(this.market, this.now);
    this.emit({ kind: 'rules', at: this.now, exchange, rules: { ...e.rules } });
    this.version++;
  }

  /** Watch a symbol or stop; the computer's limit is applied when the blocks look, not here. */
  setWatch(symbol: string, on: boolean): void {
    const current = this.firm.watching(this.market.stocks.map((s) => s.symbol));
    const next = on ? [...current, symbol] : current.filter((w) => w !== symbol);
    this.firm.setWatch(next);
    this.version++;
  }

  /**
   * Set the firm up as an experiment says: its infrastructure with no purchase and no change of cash, which
   * blocks run (the rest are off) and what they watch. For experiments only. It refuses, by name, what the
   * computer cannot hold, so a setup that would be quietly cut down is found out here.
   */
  configure(setup: Setup): void {
    const infra = infrastructureFrom(this.content, setup);
    const watched = [...new Set(setup.watched)];
    const known = this.market.stocks.map((s) => s.symbol);
    for (const w of watched) if (!known.includes(w)) throw new Error(`Cannot watch ${w}: no such symbol`);
    if (watched.length > infra.computer.maxSymbols)
      throw new Error(`${infra.computer.name} can watch ${infra.computer.maxSymbols} symbols, not ${watched.length}`);
    const on = setup.blocks.filter((b) => b.enabled);
    if (on.length > infra.computer.maxBlocks)
      throw new Error(`${infra.computer.name} runs ${infra.computer.maxBlocks} blocks, not ${on.length}`);
    for (const b of setup.blocks) if (!this.firm.blocks.some((x) => x.id === b.id)) throw new Error(`No block ${b.id}`);
    this.firm.infra = infra;
    this.firm.setWatch(watched);
    for (const b of this.firm.blocks) {
      const set = setup.blocks.find((x) => x.id === b.id);
      this.firm.setBlock(b.id, {
        enabled: set?.enabled ?? false,
        ...(set ? { params: set.params } : {}),
        ...(set?.source !== undefined ? { source: set.source } : {}),
      });
    }
    this.version++;
  }

  buyUpgrade(kind: UpgradeKind, id: string): void {
    const paid = buyUpgrade(this.content, this.firm, this.owned, kind, id);
    // A purchase is not a trading loss: the day and the week start again that much lower, so the day's P&L,
    // the loss limit and the dark web's profitable week all read the trading alone.
    this.dayStartEquity -= paid;
    this.weekStartEquity -= paid;
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
      const mark = this.market.midNow(symbol, now);
      const value = mark === null ? 0 : valueOf(this.market.scales.get(symbol) ?? 1, pos.qty, mark - pos.avgCost);
      // A pair's is in its quote currency: in dollars at the rate now.
      const pair = this.market.fx.get(symbol);
      // What was delivered, as far as it is still held: the same way as the position, and no more than it.
      const given = firm.blockPositions.get(DELIVERY_BLOCK)?.get(symbol) ?? 0;
      const delivered =
        Math.sign(given) === Math.sign(pos.qty) ? Math.sign(given) * Math.min(Math.abs(given), Math.abs(pos.qty)) : 0;
      positions.push({
        symbol,
        qty: pos.qty,
        avgCost: pos.avgCost,
        mark,
        unrealised: pair ? toHome(pair.quote, value, this.market.rates) : value,
        decimals: this.decimals(symbol),
        ...(delivered !== 0 ? { delivered } : {}),
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
      rentPaid: firm.rentPaid,
      rentDue: rentOf(firm.infra),
      heat: firm.heat,
      heatLine: HEAT_FINE_LINE,
      risk: { ...firm.risk },
      halt: firm.halt ? { ...firm.halt } : null,
      positions,
      balances: this.balances(),
      openOrders: [...firm.orders.values()].filter(
        (o) => o.status === 'inflight' || o.status === 'resting' || o.status === 'cancelling',
      ),
      orders: this.stories(),
      intraday: this.intraday.map((p) => ({ ...p, byBlock: { ...p.byBlock } })),
      pendingHand: firm.pendingHand.map((p) => ({ ...p, children: p.children.map((c) => ({ ...c })) })),
      handSlippage: this.handSlippage(),
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
      gaps: firm.gapLog.map((g) => ({ ...g })).reverse(),
      infra: { location: firm.infra.location.id, network: firm.infra.network.id, computer: firm.infra.computer.id },
      latency,
      dataLatency,
      watching: { count: watching.length, max: firm.infra.computer.maxSymbols },
      stocks: this.market.stocks.map((s) => ({
        symbol: s.symbol,
        name: s.name,
        desk: deskOf(s),
        sector: s.sector,
        constituents: s.constituents ? [...s.constituents] : null,
        watched: watching.includes(s.symbol),
        fair: this.market.fair.get(s.symbol) ?? s.startPrice,
        ...this.touchAcross(s.symbol, now),
        dayChange: this.dayChange(s.symbol),
        decimals: this.decimals(s.symbol),
        ...this.pairOf(s),
        ...(s.kind === 'metal'
          ? { metal: { ounces: s.multiplier ?? 1, lease: this.market.leases.get(s.symbol) ?? 0 } }
          : {}),
        exchanges: this.market.venuesOf(s.symbol).map((e) => ({
          id: e.id,
          seen: e.quoteAsOf(s.symbol, now - firm.dataLatency(e.id)),
          last: e.book(s.symbol).lastPrice,
          depth: e.book(s.symbol).depth(5, firm.id),
        })),
        history: this.market.history.get(s.symbol) ?? [],
        ...(isCarried(s) ? { contract: this.contractOf(s) } : {}),
      })),
      ...this.marginNow(),
      exchanges: this.market.exchanges.map((e) => ({
        id: e.id,
        name: e.spec.name,
        desk: deskOf(e.spec),
        city: e.spec.city,
        feePerShare: e.spec.feePerShare,
        dealer: e.spec.lastLook !== undefined,
        ...(e.spec.auctions
          ? { auctions: e.spec.auctions.map((a) => a.at), call: e.callAt(now), fixes: e.fixes.map((f) => ({ ...f })) }
          : {}),
      })),
      news: [...this.news.published].reverse(),
      deskNews: this.deskNews
        .filter((n) => this.market.isDeskOpen(n.desk))
        .flatMap((n) => n.published.map((h) => ({ ...h, desk: n.desk })))
        .sort((a, b) => b.at - a.at),
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
          todayPnl: open
            ? c.equity(this.market, now) - (this.today.rivalsAtOpen[c.id] ?? c.equity(this.market, now))
            : 0,
          location: c.infra.location.name,
          runs: c.enabledBlocks().map((b) => b.id),
        };
      }),
      takenToday: Object.fromEntries(Object.entries(this.today.takenBy ?? {}).map(([name, t]) => [name, { ...t }])),
      racesWon: this.today.races.won,
      wire: [this.firm, ...this.competitors].flatMap((f) => f.inFlight()),
      beliefs: Object.fromEntries(
        this.market.exchanges.map((e) => [
          e.id,
          Object.fromEntries([...e.stocks].map(([sym, st]) => [sym, st.belief])),
        ]),
      ),
      rules: Object.fromEntries(this.market.exchanges.map((e) => [e.id, { ...e.rules }])),
      lab: {
        since: this.rulesChangedAt,
        scores: [this.firm, ...this.competitors].map((f) => ({
          id: f.id,
          name: f.id === 'firm' ? 'You' : f.name,
          pnl: f.equity(this.market, now) - (this.equityAtRulesChange[f.id] ?? f.equity(this.market, now)),
        })),
      },
      shop: catalogue(
        this.content,
        firm,
        this.owned,
        this.market.exchanges.map((e) => e.id),
        this.market.desks.filter((d) => this.market.isDeskOpen(d)),
      ),
      days: this.days,
      log: this.log,
    };
  }

  private contractOf(s: InstrumentSpec): NonNullable<Snapshot['stocks'][number]['contract']> {
    const fair = this.market.fair.get(s.symbol) ?? s.startPrice;
    const value = valueOf(this.market.scales.get(s.symbol) ?? 1, 1, fair);
    return {
      underlying: s.underlying!,
      expiry: s.expiry!,
      multiplier: s.multiplier ?? 1,
      carry: this.market.carryOf(s),
      basis: fair - (this.market.fair.get(s.underlying!) ?? fair),
      margin: s.margin ? { initial: value * s.margin.initial, maintenance: value * s.margin.maintenance } : null,
      delivery: s.settlement === 'delivery',
    };
  }

  /** The places an instrument's prices are written to, from its price unit and its quote currency's minor units. */
  private decimals(symbol: string): number {
    const spec = this.market.instruments.find((x) => x.symbol === symbol);
    if (!spec) return 2;
    const minor = this.content.currencies?.find((c) => c.id === currencyOf(spec))?.minor ?? 100;
    return decimalsOf(spec, minor);
  }

  /** What a pair is: its two currencies, and a cross's legs as theirs. */
  private pairOf(s: InstrumentSpec): { pair?: NonNullable<Snapshot['stocks'][number]['pair']> } {
    const pair = this.market.fx.get(s.symbol);
    if (!pair) return {};
    const legs = s.cross?.map((leg) => this.market.fx.get(leg)).filter((x) => x !== undefined) ?? null;
    return {
      pair: {
        base: pair.base,
        quote: pair.quote,
        lot: s.multiplier ?? 1,
        cross: legs ? legs.map((l) => ({ base: l.base, quote: l.quote })) : null,
        pointValue: inHome(pair.quote, this.market.scales.get(s.symbol) ?? 1, this.market.rates),
      },
    };
  }

  /** The player's balance in each currency whose pricing pair is live, with its value home now. */
  private balances(): Snapshot['balances'] {
    const live = new Set(this.market.stocks.map((s) => s.symbol));
    return (this.content.currencies ?? [])
      .filter((c) => c.id !== HOME && c.pair !== undefined && live.has(c.pair))
      .map((c) => {
        const amount = this.firm.balances.get(c.id) ?? 0;
        return {
          currency: c.id,
          name: c.name,
          amount,
          minor: c.minor,
          dollars: toHome(c.id, amount, this.market.rates),
        };
      });
  }

  /** What the player's margined positions ask, at the marks; nothing while it holds none. */
  private marginNow(): { margin?: { initial: number; maintenance: number } } {
    const held = this.firm.marginedHeld();
    if (held.length === 0) return {};
    const marks = new Map<string, number>();
    for (const s of held) marks.set(s, this.market.fair.get(s) ?? 0);
    return {
      margin: {
        initial: this.firm.marginRequired('initial', marks),
        maintenance: this.firm.marginRequired('maintenance', marks),
      },
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
    const byOrder = new Map<number, { fee: number; realised: number; shares: number; notional: number }>();
    for (const f of this.firm.fills) {
      const t = byOrder.get(f.localId) ?? { fee: 0, realised: 0, shares: 0, notional: 0 };
      t.fee += f.fee;
      t.realised += f.realised;
      t.shares += f.size;
      t.notional += f.size * f.price;
      byOrder.set(f.localId, t);
    }
    return orders.map((o) => {
      const t = byOrder.get(o.localId);
      const avgFill = t && t.shares > 0 ? t.notional / t.shares : null;
      const touch = o.clickTouch ?? null;
      const slippage =
        avgFill !== null && touch !== null ? (o.side === 'buy' ? avgFill - touch : touch - avgFill) : null;
      return { ...o, fee: t?.fee ?? 0, realised: t?.realised ?? 0, avgFill, slippage };
    });
  }

  /** What today's hand fills cost against the touch at each click, cents; fills whose order has aged out are not counted. */
  private handSlippage(): number {
    let total = 0;
    for (const f of this.firm.fills) {
      if (f.block !== HAND_BLOCK || f.at < this.today.openedAt) continue;
      const touch = this.firm.orders.get(f.localId)?.clickTouch;
      if (touch === undefined || touch === null) continue;
      total += valueOf(
        this.market.scales.get(f.symbol) ?? 1,
        f.size,
        f.side === 'buy' ? f.price - touch : touch - f.price,
      );
    }
    return total;
  }

  save(): SavedGame {
    return {
      version: 3,
      seed: this.seed,
      now: this.now,
      speed: this.speed,
      streams: saveStreams(this.streams),
      ...(this.market.desks.some((d) => this.market.isDeskOpen(d))
        ? { desks: this.market.desks.filter((d) => this.market.isDeskOpen(d)) }
        : {}),
      market: this.market.save(),
      news: this.news.save(),
      // A game whose desks' news never ran saves as it did before it, to the byte.
      ...(this.deskNews.some((n) => n.started)
        ? { deskNews: Object.fromEntries(this.deskNews.filter((n) => n.started).map((n) => [n.desk, n.save()])) }
        : {}),
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
      intraday: this.intraday,
      rulesChangedAt: this.rulesChangedAt,
      equityAtRulesChange: this.equityAtRulesChange,
    };
  }

  static load(content: Content, input: SavedGame | SavedGameV1): Game {
    const version: number = input.version;
    if (version !== 1 && version !== 2 && version !== 3)
      throw new Error(`Cannot load a save of version ${String(version)}`);
    // Version 2 is version 3 with nothing margined: it loads as it is.
    const s: Omit<SavedGame, 'version'> =
      input.version === 1 ? { ...input, streams: Game.streamsFromV1(input) } : input;
    const g = new Game(content, s.seed ?? 0);
    g.now = s.now;
    // The contracts listed at the save's time, by the same steps a running game took to reach them.
    g.market.refreshContracts(g.now);
    g.speed = s.speed;
    g.streams = loadStreams(s.streams);
    // A save from before a venue or a desk existed has no stream for it: it is derived from the seed, as a new game's.
    for (const e of g.market.venues) g.streams.crowd[e.id] ??= Random.derive(g.seed, `crowd:${e.id}`);
    for (const d of g.market.desks) g.streams.desks[d] ??= Random.derive(g.seed, `world:${d}`);
    for (const d of s.desks ?? []) if (g.market.desks.includes(d)) g.market.openDesk(d);
    g.market.load(s.market);
    g.news.load(s.news);
    for (const n of g.deskNews) {
      const saved = s.deskNews?.[n.desk];
      if (saved) n.load(saved);
    }
    g.dark.load(s.dark);
    const firm = Firm.load(s.firm, infrastructureFrom(content, s.firmInfra));
    // A save from before a block existed has no setting for it: the default stands in, off. The rivals keep
    // their own single block as saved.
    // A desk's blocks, saved once the desk opened, follow the stocks' in the order they were saved.
    const savedBlocks = firm.blocks;
    firm.blocks = [
      ...Firm.defaultBlocks().map((d) => savedBlocks.find((b) => b.id === d.id) ?? d),
      ...savedBlocks.filter((b) => !Firm.defaultBlocks().some((d) => d.id === b.id)),
    ];
    firm.reactionMs = content.desk.reactionMs;
    Object.assign(g, { firm });
    const saved = s.competitors.map((c) => {
      const spec = content.competitors.find((x) => `bot:${x.id}` === c.id);
      if (!spec) throw new Error(`Unknown competitor ${c.id}`);
      const rival = Firm.load(c, infrastructureFrom(content, spec));
      rival.desks = Game.rivalDesks(spec);
      return rival;
    });
    // A rival added since the save was made joins as it starts, with the starting cash; the saved keep theirs.
    // A desk's rival is there if its desk is open, in the order it joined: after the stocks' rivals.
    const open = new Set(s.desks ?? []);
    const competitors = content.competitors
      .filter((spec) => spec.desk === undefined || open.has(spec.desk))
      .map((spec) => saved.find((f) => f.id === `bot:${spec.id}`) ?? Game.rival(content, spec));
    Object.assign(g, { competitors });
    g.owned.clear();
    for (const id of s.owned) g.owned.add(id);
    g.dayStartEquity = s.dayStartEquity;
    g.weekStartEquity = s.weekStartEquity;
    g.days = s.days.map((d) => ('byBlock' in d ? { ...d } : upgraded(d)));
    g.today = s.today ? { ...freshToday(), ...s.today } : freshToday();
    g.intraday = (s.intraday ?? []).map((p) => ({ ...p, byBlock: { ...p.byBlock } }));
    g.log = s.log.map((e) => ({ ...e }));
    g.wasOpen = s.wasOpen;
    g.rulesChangedAt = s.rulesChangedAt ?? 0;
    g.equityAtRulesChange = { ...(s.equityAtRulesChange ?? {}) };
    return g;
  }

  /** A version-1 save kept one random state: each stream is derived from it, so the game is valid and its future new. */
  private static streamsFromV1(s: SavedGameV1): SavedStreams {
    const ids = Object.keys(s.market.exchanges);
    return saveStreams(deriveStreams(s.random, ids));
  }

  /** A hash of the state that matters, for the determinism check. */
  fingerprint(): string {
    const s = this.save();
    const text = JSON.stringify({
      now: s.now,
      streams: s.streams,
      market: s.market,
      firm: s.firm,
      competitors: s.competitors,
      news: s.news,
      ...(s.deskNews ? { deskNews: s.deskNews } : {}),
    });
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }
}

export { BLOCKS, DEFAULT_RULES, MARKET_OPEN, MS_PER_DAY };

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

/** Whether the tick that ended at `now`, `dt` long, passed `at` ms past some midnight. */
function crossed(now: number, dt: number, at: number): boolean {
  return Math.floor((now - at) / MS_PER_DAY) !== Math.floor((now - dt - at) / MS_PER_DAY);
}
