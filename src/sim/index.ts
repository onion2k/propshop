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
  MAX_INTRADAY,
} from './game';
export type {
  GameEvent,
  SavedGame,
  SavedGameV1,
  Snapshot,
  Speed,
  DayRecord,
  DayReport,
  Tally,
  IntradayPoint,
  OrderStory,
} from './game';
export {
  MAX_BEATEN_LISTED,
  MAX_PINNED,
  MAX_WINDOW_MS,
  Prepare,
  replayTime,
  MAX_MOMENTS,
  REPLAY_LEAD_MS,
  Run,
  replayAt,
  startOf,
} from './experiment';
export type { BeatenRace, Measures, Moment, MomentDraft, MomentSource, RaceTally, Setup } from './experiment';
export {
  BLOCKS,
  EXAMPLE_SOURCE,
  SCRIPT_ID,
  blockById,
  clampParam,
  paramChangeLabel,
  paramText,
  paramsFrom,
} from './strategy';
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
  REJECT_MARGIN,
  DELIVERY_BLOCK,
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
  InstrumentSpec,
  InstrumentKind,
  ContractSeriesSpec,
  MarginSpec,
  CurrencySpec,
  RolloverSpec,
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
  MARKET_OPEN,
  MARKET_CLOSE,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  MS_PER_WEEK,
  MS_PER_YEAR,
} from './clock';
export { regimeFor } from './regime';
export { BACKTEST_WINDOW_MS, MAX_DAY_PINS, MAX_VARIANTS, pinTimes, testNight, variants } from './backtest';
export type { NightEvent, Pin, Variant, VariantOptions } from './backtest';
export {
  HOME,
  MAX_LIVE_PER_SERIES,
  STOCKS_DESK,
  contractOf,
  currencyOf,
  decimalsOf,
  rolloverDays,
  toHome,
  deskOf,
  kindOf,
  listedOn,
  liveContracts,
  scaleOf,
  tickOf,
  valueOf,
} from './instrument';
export type { FxPair, Rate } from './instrument';
export { STOCK_SESSION, activityIn, daily, isOpenIn, nextCloseIn, nextOpenIn, span, type SessionSpec } from './session';
