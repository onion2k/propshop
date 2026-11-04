// Everything the sim is handed, in one object.
import type { Content } from '../sim';
import { DESK } from './desk';
import { EXCHANGES } from './exchanges';
import { NEWS } from './news';
import { REGIMES } from './regimes';
import { FACTORS, STOCKS } from './stocks';
import { COMPETITORS, COMPUTERS, LOCATIONS, NETWORKS, START, STARTING_CASH } from './upgrades';

export const CONTENT: Content = {
  stocks: STOCKS,
  exchanges: EXCHANGES,
  news: NEWS,
  locations: LOCATIONS,
  networks: NETWORKS,
  computers: COMPUTERS,
  competitors: COMPETITORS,
  regimes: REGIMES,
  factors: FACTORS,
  startingCash: STARTING_CASH,
  start: START,
  firmName: 'Your firm',
  desk: DESK,
};

export { GLOSSARY, glossary } from './glossary';
export { LESSONS, lesson } from './lessons';
export { REGIMES } from './regimes';
export { TUTORIAL, tutorialStep } from './tutorial';
export type { TutorialStep, TutorialPage } from './tutorial';
export type { Lesson } from './lessons';
export type { GlossaryEntry } from './glossary';
