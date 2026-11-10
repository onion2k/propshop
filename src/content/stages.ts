// The stages: the game opens small and each stage done opens the next idea. A stage is a pure function of
// which lessons are done (and the show-everything switch, which the store folds in). Nothing here touches the
// sim: a locked feature is hidden by the UI and the sim keeps every block.

export type StageId = 1 | 2 | 3 | 4 | 5;

export interface Stage {
  id: StageId;
  name: string;
  /** The lessons that belong to this stage, in order. */
  lessons: string[];
  /** Ids of the intro cards shown when it opens (see `introSteps` in tutorial.ts). Stage 1 has the tutorial. */
  intro: string[];
}

export const STAGES: readonly Stage[] = [
  { id: 1, name: 'Spare room', lessons: ['home', 'seat'], intro: [] },
  {
    id: 2,
    name: 'A better seat',
    lessons: ['gap', 'race', 'cost'],
    intro: ['stage2-gap', 'stage2-race', 'stage2-read'],
  },
  {
    id: 3,
    name: 'The day’s character',
    lessons: ['maker', 'noise'],
    intro: ['stage3-character'],
  },
  { id: 4, name: 'By hand', lessons: ['hand', 'used', 'week'], intro: ['stage4-desk'] },
  { id: 5, name: 'The whole firm', lessons: [], intro: ['stage5-whole'] },
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
  | `block:${string}`
  | `desk:${string}`;

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
  // The futures desk opens with the stage after "A better seat": the lead is a latency lesson, and a better seat
  // is where it starts to pay. Its blocks with it.
  'desk:futures': 3,
  'block:basisArb': 3,
  'block:leadLag': 3,
  'block:roll': 3,
  // The currencies desk opens with "By hand": its triangle is three races at once and its dealer's last look is the
  // maker's option seen from the other side, so it comes after the stage that teaches making.
  'desk:fx': 4,
  'block:triangle': 4,
  'block:carry': 4,
  // The metals desk opens with "The whole firm", the last stage: its miner-and-the-metal block is the pairs block
  // across two desks, and pairs opens there; the curve and the fix come after the stocks' lessons are all done.
  'desk:metals': 5,
  'block:curve': 5,
  'block:fixArb': 5,
  'block:crossPairs': 5,
  // The options desk is built and closed (plans/desk-options.md 7b): its stage is one past the last, so it opens in no
  // game, free play included, until stage 6 is written (7e) and this is set to it.
  'desk:options': (LAST_STAGE + 1) as StageId,
};

/** An unknown block is held to the last stage rather than shown early. */
export function featureStage(feature: Feature): StageId {
  return FEATURE_STAGE[feature] ?? LAST_STAGE;
}

/** Whether a feature is named in the stage table, not left to fall to the last stage. */
export function placed(feature: Feature): boolean {
  return Object.hasOwn(FEATURE_STAGE, feature);
}

export function shows(feature: Feature, stage: StageId): boolean {
  return stage >= featureStage(feature);
}

/** The stage the lessons done so far have reached: stage n opens when n-1 is open and all its lessons are done. */
export function stageOf(progress: Readonly<Record<string, number>>): StageId {
  let stage: StageId = 1;
  for (const st of STAGES) {
    if (st.id !== stage) break;
    if (!st.lessons.every((id) => progress[id] !== undefined) || st.id === LAST_STAGE) break;
    stage = (st.id + 1) as StageId;
  }
  return stage;
}

/**
 * Each desk's lessons beyond the stocks': they open with the desk, at its stage, and open no stage themselves, so
 * the stocks' path is the same with a desk as without.
 */
export const DESK_LESSONS: Readonly<Record<string, readonly string[]>> = {
  futures: ['basis', 'overnight', 'lead'],
  fx: ['pips', 'triangle', 'refused', 'rollover'],
  metals: ['curve', 'flip', 'delivery', 'fix', 'miner'],
};

/** What the page calls each desk, in the day's report. */
export const DESK_NAMES: Readonly<Record<string, string>> = {
  stocks: 'Stocks',
  futures: 'Futures',
  fx: 'Currencies',
  metals: 'Metals',
};

/** The desk a lesson belongs to, if it is a desk's. */
export function lessonDesk(id: string): string | undefined {
  return Object.entries(DESK_LESSONS).find(([, ids]) => ids.includes(id))?.[0];
}

/** The stage a lesson belongs to: its stage's, or its desk's. */
export function lessonStage(id: string): StageId | undefined {
  const st = STAGES.find((s) => s.lessons.includes(id))?.id;
  if (st !== undefined) return st;
  const desk = lessonDesk(id);
  return desk === undefined ? undefined : featureStage(`desk:${desk}`);
}
