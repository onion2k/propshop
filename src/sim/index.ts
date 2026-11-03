// The surface the UI uses, and the one a remote API would stand behind. Nothing outside src/sim imports
// anything but this file.

export { Game, SPEEDS, TICK_MS, STUFFING_ORDERS, STUFFING_CANCEL_SHARE, FLOOD_DROPPED } from './game';
export type { GameEvent, SavedGame, Snapshot, Speed, DayRecord, DayReport, Tally, OrderStory } from './game';
export { BLOCKS, EXAMPLE_SOURCE, SCRIPT_ID, blockById } from './strategy';
export type { BeatenBy, BlockSpec, Fill, OpenOrder, ParamSpec, Params } from './strategy';
export type { BlockSetting, RiskSettings, Halt, Wire } from './firm';
export { REJECT_EXPOSURE, REJECT_FLOOD } from './firm';
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
