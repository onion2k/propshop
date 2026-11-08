// The experiments hold what their briefings promise on their seeds: the headline lands in the window, the races
// happen, every change does something measurable, the guess is not the same answer for every change, and the
// moments and explanations come out whole. A change to the sim that moves a seed's morning shows up here.

import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { EXPERIMENTS, answerOf, type Experiment } from '../src/content/experiments';
import { Run, startOf, type Measures, type Moment, type Setup } from '../src/sim';

/** One start a seed, shared by its runs as the page shares it: a run never changes the save it starts from. */
const starts = new Map<string, ReturnType<typeof startOf>>();

function run(e: Experiment, setup: Setup) {
  const tracker = e.tracker();
  if (!starts.has(e.id)) starts.set(e.id, startOf(CONTENT, e.seed, e.startAt));
  const r = new Run(CONTENT, starts.get(e.id)!, setup, e.windowMs, tracker.source);
  while (!r.advance(50_000));
  return { measures: r.measures(), moments: tracker.pick() };
}

function whole(text: string) {
  expect(text).not.toMatch(/NaN|undefined|null|Infinity/);
}

function momentsFit(e: Experiment, moments: Moment[]) {
  expect(moments.length).toBeGreaterThan(0);
  expect(moments.length).toBeLessThanOrEqual(3);
  for (const m of moments) {
    expect(m.at).toBeGreaterThanOrEqual(e.startAt);
    expect(m.at).toBeLessThanOrEqual(e.startAt + e.windowMs);
    expect(m.from).toBeLessThanOrEqual(m.at);
    whole(m.label);
  }
}

describe.each(EXPERIMENTS.map((e) => [e.id, e] as const))('experiment %s', (_id, e) => {
  it('holds its promise, and every change does something', () => {
    const base = run(e, e.baseline);
    momentsFit(e, base.moments);
    if (e.id === 'headline' || e.id === 'option') expect(base.moments.some((m) => m.kind === 'headline')).toBe(true);
    if (e.id === 'miles') expect(base.measures.races.beaten + base.measures.races.won).toBeGreaterThanOrEqual(50);
    expect(base.measures.fills).toBeGreaterThan(0);

    const answers = new Set<string>();
    for (const change of e.changes) {
      const b = run(e, change.apply(structuredClone(e.baseline)));
      const differs = (m: Measures) => m.pnl !== base.measures.pnl || m.fills !== base.measures.fills;
      expect(differs(b.measures), change.id).toBe(true);
      momentsFit(e, b.moments);
      answers.add(answerOf(base.measures, b.measures));
      const text = e.explain(base.measures, b.measures, change);
      whole(text);
      expect(text.length).toBeGreaterThan(80);
    }
    expect(answers.size, 'the guess means something').toBeGreaterThan(1);
  }, 120_000);
});

describe('answerOf', () => {
  const m = (pnl: number) => ({
    pnl,
    fills: 1,
    races: { won: 0, beaten: 0, missed: 0 },
    byExchange: {},
    beaten: [],
    byBlock: {},
    fees: 0,
  });
  it('calls a change within a hundred dollars or a tenth the same', () => {
    expect(answerOf(m(-126_700), m(-131_100))).toBe('same');
    expect(answerOf(m(5_000), m(14_000))).toBe('same');
    expect(answerOf(m(96_200), m(193_800))).toBe('better');
    expect(answerOf(m(-256_400), m(-391_100))).toBe('worse');
  });
});
