// The stages: the game opens small and each lesson done opens the next idea. A stage is a pure function of
// which lessons are done (and the show-everything switch, which the store folds in). Nothing here touches the
// sim: a locked feature is hidden by the UI and the sim keeps every block.

export type StageId = 1 | 2 | 3 | 4 | 5;

export interface Stage {
  id: StageId;
  name: string;
  /** The lesson, in the stage before, whose being done opens this stage; null for the first. */
  opensWith: string | null;
  /** The lessons that belong to this stage, in order. */
  lessons: string[];
  /** Ids of the intro cards shown when it opens (see `introSteps` in tutorial.ts). Stage 1 has the tutorial. */
  intro: string[];
}

export const STAGES: readonly Stage[] = [
  { id: 1, name: 'Spare room', opensWith: null, lessons: ['home', 'seat'], intro: [] },
  {
    id: 2,
    name: 'A better seat',
    opensWith: 'seat',
    lessons: ['gap', 'race', 'cost'],
    intro: ['stage2-gap', 'stage2-race', 'stage2-read'],
  },
  {
    id: 3,
    name: 'The day’s character',
    opensWith: 'race',
    lessons: ['maker', 'noise', 'week'],
    intro: ['stage3-character'],
  },
  { id: 4, name: 'By hand', opensWith: 'maker', lessons: ['hand', 'used'], intro: ['stage4-desk'] },
  { id: 5, name: 'The whole firm', opensWith: 'used', lessons: [], intro: ['stage5-whole'] },
];

export const LAST_STAGE: StageId = 5;

/** Something the UI can hide. Blocks are `block:<id>`. */
export type Feature =
  | 'page:desk'
  | 'microscope'
  | 'gaps'
  | 'races'
  | 'tab:rivals'
  | 'tab:news'
  | 'tab:dark'
  | 'tab:lab'
  | `block:${string}`;

/** The first stage each feature is shown at. */
const FEATURE_STAGE: Record<string, StageId> = {
  'page:desk': 4,
  microscope: 4,
  gaps: 2,
  races: 2,
  'tab:rivals': 2,
  'tab:news': 3,
  'tab:dark': 3,
  'tab:lab': 5,
  'block:momentum': 1,
  'block:arbitrage': 2,
  'block:sniper': 2,
  'block:marketMaker': 3,
  'block:meanReversion': 3,
  'block:newsReaction': 3,
  'block:pairs': 5,
  'block:indexArb': 5,
  'block:anticipate': 5,
  'block:script': 5,
};

/** An unknown block is held to the last stage rather than shown early. */
export function featureStage(feature: Feature): StageId {
  return FEATURE_STAGE[feature] ?? LAST_STAGE;
}

export function shows(feature: Feature, stage: StageId): boolean {
  return stage >= featureStage(feature);
}

/** The stage the lessons done so far have reached: each opens only if the one before it has. */
export function stageOf(progress: Readonly<Record<string, number>>): StageId {
  let stage: StageId = 1;
  for (const st of STAGES) {
    if (st.opensWith === null) continue;
    if (progress[st.opensWith] === undefined) break;
    stage = st.id;
  }
  return stage;
}

/** The stage a lesson belongs to. */
export function lessonStage(id: string): StageId | undefined {
  return STAGES.find((s) => s.lessons.includes(id))?.id;
}
