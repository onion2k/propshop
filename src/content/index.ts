// Everything the sim is handed, in one object.
import type { Content } from '../sim';
import { DESK } from './desk';
import { EXCHANGES } from './exchanges';
import { COLO_PRAIRIE, IXF, PRAIRIE, PRAIRIE_DISTANCE } from './futures';
import { COLO_EASTHOLM, CURRENCIES, FX_DISTANCE, FX_VENUES, PAIRS, ROLLOVER } from './fx';
import {
  COLO_HUDSON,
  COLO_THAMESFORD,
  METALS_DISTANCE,
  METAL_SERIES,
  METAL_VENUES,
  SPOT,
  STORAGE,
  SUPPLY_NEWS,
} from './metals';
import { NEWS } from './news';
import { REGIMES } from './regimes';
import { FACTORS, STOCKS } from './stocks';
import { COMPETITORS, COMPUTERS, LOCATIONS, NETWORKS, START, STARTING_CASH } from './upgrades';

export const CONTENT: Content = {
  stocks: STOCKS,
  // The futures desk's venue and contracts, the currencies desk's venues and pairs, and the metals desk's venues,
  // spot and futures: there, and closed, until each desk opens.
  exchanges: [...EXCHANGES, PRAIRIE, ...FX_VENUES, ...METAL_VENUES],
  series: [IXF, ...METAL_SERIES],
  instruments: [...PAIRS, ...SPOT],
  currencies: CURRENCIES,
  rollover: ROLLOVER,
  storage: STORAGE,
  deskNews: [SUPPLY_NEWS],
  news: NEWS,
  locations: [
    ...[
      ...LOCATIONS.map((l) => ({ ...l, distance: { ...l.distance, PRAIRIE: PRAIRIE_DISTANCE[l.id] ?? 20 } })),
      COLO_PRAIRIE,
    ].map((l) => {
      const fx = FX_DISTANCE[l.id] ?? 35;
      return { ...l, distance: { ...l.distance, ...Object.fromEntries(FX_VENUES.map((v) => [v.id, fx])) } };
    }),
    // The currencies' rack carries its own distance to every venue.
    COLO_EASTHOLM,
  ]
    .map((l) => ({ ...l, distance: { ...l.distance, ...(METALS_DISTANCE[l.id] ?? {}) } }))
    // The metals' racks carry their own distance to every venue.
    .concat([COLO_THAMESFORD, COLO_HUDSON]),
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
