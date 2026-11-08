// Everything the sim is handed, in one object.
import type { Content } from '../sim';
import { DESK } from './desk';
import { EXCHANGES } from './exchanges';
import { COLO_PRAIRIE, IXF, PRAIRIE, PRAIRIE_DISTANCE } from './futures';
import { NEWS } from './news';
import { REGIMES } from './regimes';
import { FACTORS, STOCKS } from './stocks';
import { COMPETITORS, COMPUTERS, LOCATIONS, NETWORKS, START, STARTING_CASH } from './upgrades';

export const CONTENT: Content = {
  stocks: STOCKS,
  // The futures desk's venue and contracts: there, and closed, until the desk opens.
  exchanges: [...EXCHANGES, PRAIRIE],
  series: [IXF],
  news: NEWS,
  locations: [
    ...LOCATIONS.map((l) => ({ ...l, distance: { ...l.distance, PRAIRIE: PRAIRIE_DISTANCE[l.id] ?? 20 } })),
    COLO_PRAIRIE,
  ],
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
export { TUTORIAL, tutorialStep, introSteps } from './tutorial';
export * from './stages';
export * from './signals';
export type { TutorialStep, TutorialPage } from './tutorial';
export type { Lesson } from './lessons';
export type { GlossaryEntry } from './glossary';
