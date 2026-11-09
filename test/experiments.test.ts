// The experiments hold what their briefings promise on their seeds: the headline lands in the window, the races
// happen, every change does something measurable, the guess is not the same answer for every change, and the
// moments and explanations come out whole. A change to the sim that moves a seed's morning shows up here.

import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { DELIVERY_LOTS, EXPERIMENTS, FIX_LOTS, answerOf, type Experiment } from '../src/content/experiments';
import { Run, startOf, type Measures, type Moment, type Setup } from '../src/sim';

/** One start a seed, shared by its runs as the page shares it: a run never changes the save it starts from. */
const starts = new Map<string, ReturnType<typeof startOf>>();

function run(e: Experiment, setup: Setup) {
  const tracker = e.tracker();
  if (!starts.has(e.id)) starts.set(e.id, startOf(CONTENT, e.seed, e.startAt, e.desks, e.warmMs));
  const r = new Run(CONTENT, starts.get(e.id)!, setup, e.windowMs, tracker.source, { ledger: e.ledger });
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

it('are the five, then the metals desk’s two: the fix and delivery', () => {
  expect(EXPERIMENTS.map((e) => e.id)).toEqual(['headline', 'miles', 'option', 'lead', 'lastlook', 'fix', 'delivery']);
  expect(FIX_LOTS).toBeGreaterThan(10);
  expect(DELIVERY_LOTS).toBeGreaterThan(0);
});

describe.each(EXPERIMENTS.map((e) => [e.id, e] as const))('experiment %s', (_id, e) => {
  it('holds its promise, and every change does something', () => {
    const base = run(e, e.baseline);
    momentsFit(e, base.moments);
    if (e.id === 'headline' || e.id === 'option' || e.id === 'lead')
      expect(base.moments.some((m) => m.kind === 'headline')).toBe(true);
    if (e.id === 'lead') expect(base.measures.races.beaten + base.measures.races.won).toBeGreaterThanOrEqual(10);
    if (e.id === 'miles') expect(base.measures.races.beaten + base.measures.races.won).toBeGreaterThanOrEqual(50);
    // Last look: the dollar jumps in the window, and the dealer turns legs down, refused or gone after its look.
    if (e.id === 'lastlook') {
      expect(base.moments.some((m) => m.kind === 'jump')).toBe(true);
      expect(base.measures.refused).toBeGreaterThan(0);
      expect(base.measures.races.missed).toBeGreaterThan(base.measures.races.won);
    }
    // The fix: the 10:00 fix and the move in gold are in the window, and the buy is in the ledger, all of it.
    if (e.id === 'fix') {
      expect(base.moments.some((m) => m.kind === 'move')).toBe(true);
      const fix = base.measures.ledger?.fixes.find((f) => f.symbol === 'XAU');
      expect(fix?.price).toEqual(expect.any(Number));
      expect(base.measures.ledger?.traded.XAU?.bought).toBe(FIX_LOTS);
    }
    // Delivery: the expiry is in the window, and the contract held through it is metal at the end.
    if (e.id === 'delivery') {
      expect(base.moments.some((m) => m.kind === 'expiry')).toBe(true);
      expect(base.measures.ledger?.held.XAU?.qty).toBe(DELIVERY_LOTS);
    }
    expect(base.measures.fills).toBeGreaterThan(0);

    const answers = new Set<string>();
    for (const change of e.changes) {
      const b = run(e, change.apply(structuredClone(e.baseline)));
      const differs = (m: Measures) => m.pnl !== base.measures.pnl || m.fills !== base.measures.fills;
      expect(differs(b.measures), change.id).toBe(true);
      momentsFit(e, b.moments);
      answers.add(answerOf(base.measures, b.measures));
      // The book, which never looks, fills more legs in full than the dealer; from home the dealer refuses none.
      if (e.id === 'lastlook' && change.id === 'book')
        expect(b.measures.races.won).toBeGreaterThan(base.measures.races.won);
      if (e.id === 'lastlook' && change.id === 'home')
        expect(b.measures.refused ?? 0).toBeLessThan(base.measures.refused ?? 0);
      // Rested into the fix, the whole buy fills at the fix's one price.
      if (e.id === 'fix' && change.id === 'fix') {
        const fix = b.measures.ledger!.fixes.find((f) => f.symbol === 'XAU')!;
        const t = b.measures.ledger!.traded.XAU!;
        expect(t.bought).toBe(FIX_LOTS);
        expect(t.buyValue).toBe(fix.price! * FIX_LOTS);
      }
      // Rolled, nothing is delivered: the next contract is held instead.
      if (e.id === 'delivery' && change.id === 'roll') expect(b.measures.ledger!.held.XAU?.qty ?? 0).toBe(0);
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
