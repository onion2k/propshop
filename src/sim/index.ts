// The surface the UI uses, and the one a remote API would stand behind. Nothing outside src/sim imports
// anything but this file.

export {
  Game,
  SPEEDS,
  TICK_MS,
  MAX_TICKS_PER_ADVANCE,
  STUFFING_ORDERS,
  STUFFING_CANCEL_SHARE,
  FLOOD_DROPPED,
} from './game';
export type { GameEvent, SavedGame, Snapshot, Speed, DayRecord, DayReport, Tally, OrderStory } from './game';
export { BLOCKS, EXAMPLE_SOURCE, SCRIPT_ID, blockById } from './strategy';
export type {
  BeatenBy,
  BlockSpec,
  Fill,
  HandIntent,
  OpenOrder,
  ParamSpec,
  Params,
  SeenDepth,
  SeenLevel,
  SeenPrint,
} from './strategy';
export { BEST, TAPE_VIEW } from './strategy';
export type { BlockSetting, GapEpisode, HandResult, PendingHand, RiskSettings, Halt, Wire } from './firm';
export {
  HAND_BLOCK,
  HAND_REACH,
  MAX_PENDING_HAND,
  REJECT_BAD_ORDER,
  REJECT_EXPOSURE,
  REJECT_FLOOD,
  REJECT_HAND_BACKLOG,
  REJECT_MARKET_CLOSED,
  REJECT_NO_QUOTE,
} from './firm';
export type { Tip, Fine } from './darkweb';
export type { Published } from './news';
export type { HistoryPoint } from './market';
export type { Level, Quote } from './orderbook';
export { REFUSED_CROSSED } from './orderbook';
export type { UpgradeKind, UpgradeOffer } from './upgrades';
export { DEFAULT_RULES } from './types';
export type {
  Content,
  ExchangeRules,
  FactorSpec,
  RegimeSpec,
  StockSpec,
  ExchangeSpec,
  LocationSpec,
  NetworkSpec,
  ComputerSpec,
  NewsTemplate,
  CompetitorSpec,
  Headline,
} from './types';
export {
  calendar,
  formatTime,
  formatSpan,
  isMarketOpen,
  nextOpen,
  nextClose,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
} from './clock';
export { regimeFor } from './regime';
