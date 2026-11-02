// Everything the sim is handed, in one object.
import type { Content } from '../sim';
import { EXCHANGES } from './exchanges';
import { NEWS } from './news';
import { STOCKS } from './stocks';
import { COMPETITORS, COMPUTERS, LOCATIONS, NETWORKS, START, STARTING_CASH } from './upgrades';

export const CONTENT: Content = {
  stocks: STOCKS,
  exchanges: EXCHANGES,
  news: NEWS,
  locations: LOCATIONS,
  networks: NETWORKS,
  computers: COMPUTERS,
  competitors: COMPETITORS,
  startingCash: STARTING_CASH,
  start: START,
  firmName: 'Your firm',
};

export { GLOSSARY, glossary } from './glossary';
export type { GlossaryEntry } from './glossary';
