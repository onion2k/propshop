// One experiment, one screen in steps: the briefing, the first run as given, one change and a guess, the second
// run, the two side by side, and the moments to replay slowed. The runs are the sim's `Run` and `Prepare`, spent
// a budget of each frame as the store spends the free-play game's; the wall clock is read here and nowhere
// nearer the sim. The page keeps no saves of its own beyond the experiment's start, which both runs share and
// which goes when the page does.

import { useEffect, useRef, useState } from 'react';
import { ANSWERS, answerOf, dollars, type Answer, type Change, type Experiment } from '../content/experiments';
import { CONTENT, glossary } from '../content';
import {
  Prepare,
  Run,
  formatTime,
  replayAt,
  startOf,
  type Game,
  type Measures,
  type Moment,
  type SavedGame,
  type Snapshot,
} from '../sim';
import { LearnContext, Term } from './Glossary';
import { Microscope } from './Microscope';
import { BUDGET_MS } from './store';
import type { Tracker } from '../content/experiments';

/** Ticks run between two reads of the clock, as in the store. */
const CHUNK = 25;
/** How often the live view is refreshed, wall ms. */
const PUBLISH_EVERY = 100;
/** One tick, 2 ms of sim, every 200 ms: a hundred times slower than real time. */
const SLOWED_EVERY_MS = 200;

type Phase = 'briefing' | 'runA' | 'pick' | 'runB' | 'result';
type Which = 'a' | 'b';

interface Side {
  run: Run;
  tracker: Tracker;
  /** Chosen once the run is finished. */
  moments: Moment[];
  prep: Prepare | null;
}

interface Live {
  label: string;
  symbol: string;
  now: number;
  progress: number;
  pnl: number;
  races: Measures['races'];
  fills: number;
  windowMs: number;
  points: { t: number; y: number }[];
  marks: { t: number; y: number; side: 'buy' | 'sell' }[];
}

function liveOf(run: Run, label: string, symbol: string): Live {
  const snap = run.game.snapshot();
  const m = run.measures();
  const st = snap.stocks.find((x) => x.symbol === symbol);
  const windowMs = run.endAt - run.startAt;
  const points: Live['points'] = [];
  for (const h of st?.history ?? []) {
    if (h.at < run.startAt) continue;
    const mids = Object.values(h.mids).filter((x): x is number => x !== null);
    points.push({ t: h.at - run.startAt, y: mids.length ? mids.reduce((a, b) => a + b, 0) / mids.length : h.fair });
  }
  const marks = snap.fills
    .filter((f) => f.symbol === symbol && f.at >= run.startAt)
    .map((f) => ({ t: f.at - run.startAt, y: f.price, side: f.side }));
  return {
    label,
    symbol,
    now: snap.now,
    progress: Math.min(1, Math.max(0, (snap.now - run.startAt) / windowMs)),
    pnl: m.pnl,
    races: m.races,
    fills: m.fills,
    windowMs,
    points,
    marks,
  };
}

const VW = 600;
const VH = 140;

function LiveView({ live }: { live: Live | null }) {
  const pct = Math.round((live?.progress ?? 0) * 100);
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of live?.points ?? []) {
    lo = Math.min(lo, p.y);
    hi = Math.max(hi, p.y);
  }
  if (!Number.isFinite(lo)) {
    lo = 0;
    hi = 1;
  }
  const mid = (lo + hi) / 2;
  const half = Math.max(5, (hi - lo) / 2) * 1.1;
  const x = (t: number) => (t / (live?.windowMs ?? 1)) * VW;
  const y = (v: number) => VH - ((v - (mid - half)) / (2 * half)) * VH;
  return (
    <div className="exp-live">
      <p className="small">
        <strong>{live?.label ?? 'Getting the morning ready…'}</strong>{' '}
        <span className="muted num">{live ? formatTime(live.now) : ''}</span>
      </p>
      <div
        className="exp-progress"
        role="progressbar"
        aria-label="Window progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div style={{ width: `${pct}%` }} />
      </div>
      <svg viewBox={`0 0 ${VW} ${VH}`} className="exp-chart" role="img" aria-label={`${live?.symbol ?? ''} price`}>
        <polyline
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
          points={(live?.points ?? []).map((p) => `${x(p.t).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ')}
        />
        {(live?.marks ?? []).map((m, i) =>
          m.side === 'buy' ? (
            <circle key={i} cx={x(m.t)} cy={y(m.y)} r={4} fill="var(--up)">
              <title>bought</title>
            </circle>
          ) : (
            <rect key={i} x={x(m.t) - 4} y={y(m.y) - 4} width={8} height={8} fill="var(--down)">
              <title>sold</title>
            </rect>
          ),
        )}
      </svg>
      <p className="small muted">Your fills: circle bought, square sold.</p>
      <dl className="exp-stats num">
        <div>
          <dt>P&L</dt>
          <dd className={live && live.pnl < 0 ? 'down' : 'up'}>{dollars(live?.pnl ?? 0)}</dd>
        </div>
        <div>
          <dt>Fills</dt>
          <dd>{live?.fills ?? 0}</dd>
        </div>
        <div>
          <dt>Won</dt>
          <dd>{live?.races.won ?? 0}</dd>
        </div>
        <div>
          <dt>Beaten</dt>
          <dd>{live?.races.beaten ?? 0}</dd>
        </div>
        <div>
          <dt>Missed</dt>
          <dd>{live?.races.missed ?? 0}</dd>
        </div>
      </dl>
    </div>
  );
}

function Column({ title, m }: { title: string; m: Measures }) {
  const rows: [string, string][] = [
    ['P&L', dollars(m.pnl)],
    ['Fills', String(m.fills)],
    ['Races won', String(m.races.won)],
    ['Races beaten', String(m.races.beaten)],
    ['Races missed', String(m.races.missed)],
  ];
  return (
    <section className="exp-col" aria-label={title}>
      <h3>{title}</h3>
      <dl className="num">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** A moment replayed: the microscope on the game just before it, stepped by hand or played a hundred times slower than real. */
function Replay({ run, moment, symbol, onClose }: { run: Run; moment: Moment; symbol: string; onClose: () => void }) {
  const [game] = useState<Game>(() => replayAt(run, moment));
  const [snap, setSnap] = useState<Snapshot>(() => game.snapshot());
  const [playing, setPlaying] = useState(false);
  const atEnd = snap.now >= run.endAt;
  const step = (n: number) => {
    for (let i = 0; i < n && game.now < run.endAt; i++) game.step();
    setSnap(game.snapshot());
  };
  useEffect(() => {
    if (!playing || atEnd) return;
    const id = setInterval(() => {
      for (let i = 0; i < 1 && game.now < run.endAt; i++) game.step();
      setSnap(game.snapshot());
    }, SLOWED_EVERY_MS);
    return () => clearInterval(id);
  }, [playing, atEnd, game, run]);
  return (
    <div className="exp-replay">
      <p className="replay-caption">{moment.label}</p>
      <div className="micro-bar">
        <button type="button" onClick={() => setPlaying((p) => !p)} disabled={atEnd && !playing}>
          {playing && !atEnd ? 'Pause' : 'Play slowed'}
        </button>
        <button type="button" onClick={() => step(1)} disabled={atEnd}>
          Step one tick
        </button>
        <span className="muted small num" data-testid="replay-time">
          {formatTime(snap.now)}.{String(snap.now % 1000).padStart(3, '0')}
        </span>
        <span className="muted small">{atEnd ? 'The window has ended.' : 'Slowed a hundred times.'}</span>
      </div>
      <Microscope s={snap} onStep={step} symbol={moment.symbol ?? symbol} onClose={onClose} />
    </div>
  );
}

export function ExperimentPage({
  experiment,
  onBack,
  onDone,
  onNext,
  clock = () => performance.now(),
}: {
  experiment: Experiment;
  onBack: () => void;
  onDone: (id: string) => void;
  onNext?: () => void;
  /** The wall clock the frame budget is held against. */
  clock?: () => number;
}) {
  const [phase, setPhase] = useState<Phase>('briefing');
  const [change, setChange] = useState<Change | null>(null);
  const [guess, setGuess] = useState<Answer | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [term, setTerm] = useState<string | null>(null);
  const [replay, setReplay] = useState<{ which: Which; moment: Moment } | null>(null);
  // The runs, for drawing: the engine below is mutated by the frame loop, and this is told when it has moved.
  const [sides, setSides] = useState<{ a: Side | null; b: Side | null }>({ a: null, b: null });
  const engine = useRef<{
    start: SavedGame | null;
    a: Side | null;
    b: Side | null;
    active: Which | null;
    setupB: { change: Change } | null;
    lastPublish: number;
  }>({ start: null, a: null, b: null, active: null, setupB: null, lastPublish: -Infinity });
  const latest = useRef({ onDone, clock, experiment });
  useEffect(() => {
    latest.current = { onDone, clock, experiment };
  });

  useEffect(() => {
    const sync = () => setSides({ a: engine.current.a, b: engine.current.b });
    const work = () => {
      const e = engine.current;
      const { clock: now, experiment: x, onDone: done } = latest.current;
      const deadline = now() + BUDGET_MS;
      const which = e.active;
      if (which) {
        const label = which === 'a' ? `Run A: ${x.baselineLabel}` : `Run B: ${e.setupB?.change.label ?? ''}`;
        let side = e[which];
        if (!side) {
          // Building the start is the one lump of work; the frame it lands in is not drawn on time.
          e.start ??= startOf(CONTENT, x.seed, x.startAt);
          const tracker = x.tracker();
          const setup = which === 'a' ? x.baseline : e.setupB!.change.apply(structuredClone(x.baseline));
          side = {
            run: new Run(CONTENT, e.start, setup, x.windowMs, tracker.source),
            tracker,
            moments: [],
            prep: null,
          };
          e[which] = side;
          return;
        }
        const run = side.run;
        while (!run.finished) {
          run.advance(CHUNK);
          if (now() >= deadline) break;
        }
        const t = now();
        if (run.finished || t - e.lastPublish >= PUBLISH_EVERY) {
          e.lastPublish = t;
          setLive(liveOf(run, label, x.symbol));
        }
        if (run.finished) {
          side.moments = side.tracker.pick();
          side.prep = new Prepare(run, side.moments);
          e.active = null;
          if (which === 'a') setPhase('pick');
          else {
            setPhase('result');
            done(x.id);
          }
          sync();
        }
        return;
      }
      // While the player reads, pin the saves for the moments, in the same budget.
      for (const w of ['a', 'b'] as const) {
        const prep = e[w]?.prep;
        if (prep && !prep.finished) {
          let finished = false;
          while (!finished) {
            finished = prep.advance(CHUNK);
            if (now() >= deadline) break;
          }
          if (finished) sync();
          return;
        }
      }
    };
    let raf = 0;
    const frame = () => {
      work();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    // A timer keeps it moving when the tab is throttled and frames come slowly or not at all.
    const timer = setInterval(work, 100);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
    };
  }, []);

  const startA = () => {
    engine.current.active = 'a';
    setPhase('runA');
  };
  const startB = () => {
    if (!change || !guess) return;
    const e = engine.current;
    e.b = null;
    setSides((x) => ({ ...x, b: null }));
    e.setupB = { change };
    e.active = 'b';
    setLive(null);
    setPhase('runB');
  };
  const another = () => {
    const e = engine.current;
    e.b = null;
    setSides((x) => ({ ...x, b: null }));
    e.setupB = null;
    setChange(null);
    setGuess(null);
    setReplay(null);
    if (sides.a) setLive(liveOf(sides.a.run, `Run A: ${experiment.baselineLabel}`, experiment.symbol));
    setPhase('pick');
  };

  const a = sides.a?.run.measures();
  const b = sides.b?.run.measures();
  const learn = { selected: term, open: setTerm };
  const entry = term ? glossary(term) : undefined;
  const sideMoments = (w: Which, title: string) => {
    const side = sides[w];
    if (!side || side.moments.length === 0) return null;
    const ready = side.prep?.finished ?? false;
    return (
      <div key={w}>
        <h3>{title}</h3>
        <div className="exp-moments">
          {side.moments.map((m) => (
            <button
              key={`${m.kind}${m.at}`}
              type="button"
              disabled={!ready}
              onClick={() => setReplay({ which: w, moment: m })}
            >
              {m.label}
            </button>
          ))}
        </div>
        {!ready && <p className="muted small">Getting these ready…</p>}
      </div>
    );
  };

  return (
    <LearnContext.Provider value={learn}>
      <main className="experiment">
        <nav className="back-bar">
          <button type="button" className="link" onClick={onBack}>
            Back to experiments
          </button>
        </nav>
        <h1>{experiment.title}</h1>
        <section className="panel exp-step">
          <h2>Briefing</h2>
          <p>{experiment.briefing}</p>
          <p className="small">
            Words used here:{' '}
            {experiment.terms.map((t, i) => (
              <span key={t}>
                {i > 0 && ', '}
                <Term id={t} />
              </span>
            ))}
          </p>
          {entry && (
            <p className="small exp-term">
              <strong>{entry.term}.</strong> {entry.long}
            </p>
          )}
          {phase === 'briefing' && (
            <button type="button" className="on" onClick={startA}>
              Run as given
            </button>
          )}
        </section>

        {phase !== 'briefing' && phase !== 'result' && (
          <section className="panel exp-step">
            <h2>{phase === 'runB' ? 'Run B' : 'Run A'}</h2>
            <LiveView live={live} />
          </section>
        )}

        {phase === 'pick' && (
          <section className="panel exp-step">
            <h2>Change one thing</h2>
            <fieldset className="exp-pick">
              <legend>Pick one change</legend>
              {experiment.changes.map((c) => (
                <label key={c.id} className={`exp-change ${change?.id === c.id ? 'on' : ''}`}>
                  <input type="radio" name="change" checked={change?.id === c.id} onChange={() => setChange(c)} />
                  <strong>{c.label}</strong>
                  <span className="muted small">{c.detail}</span>
                </label>
              ))}
            </fieldset>
            <div role="group" aria-label="Your guess" className="exp-guess">
              <p className="small">What will it do to the P&L?</p>
              {ANSWERS.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className={guess === x.id ? 'on' : ''}
                  aria-pressed={guess === x.id}
                  onClick={() => setGuess(x.id)}
                >
                  {x.label}
                </button>
              ))}
            </div>
            <button type="button" className="on" disabled={!change || !guess} onClick={startB}>
              Run again with this change
            </button>
          </section>
        )}

        {phase === 'result' && a && b && change && guess && (
          <section className="panel exp-step">
            <h2>The two runs</h2>
            <div className="exp-cols" role="group" aria-label="The two runs">
              <Column title={`Run A: ${experiment.baselineLabel}`} m={a} />
              <Column title={`Run B: ${change.label}`} m={b} />
            </div>
            <p role="status" aria-label="Your guess" className={guess === answerOf(a, b) ? 'up' : 'down'}>
              {guess === answerOf(a, b)
                ? `Right. You guessed "${label(guess)}", and the change made it ${word(answerOf(a, b))}.`
                : `Wrong. You guessed "${label(guess)}", but the change made it ${word(answerOf(a, b))}.`}
            </p>
            <p>{experiment.explain(a, b, change)}</p>
            <p className="muted small">
              Your orders can move the crowd, so the two days are the same market but not the same book.
            </p>
            <p>{experiment.takeaway}</p>
            {replay ? (
              <Replay
                key={`${replay.which}${replay.moment.at}`}
                run={sides[replay.which]!.run}
                moment={replay.moment}
                symbol={experiment.symbol}
                onClose={() => setReplay(null)}
              />
            ) : (
              <>
                <h2>Moments</h2>
                {sideMoments('a', 'Run A')}
                {sideMoments('b', 'Run B')}
              </>
            )}
            <p className="exp-actions">
              <button type="button" onClick={another}>
                Try another change
              </button>{' '}
              {onNext ? (
                <button type="button" className="on" onClick={onNext}>
                  Next experiment
                </button>
              ) : (
                <button type="button" className="on" onClick={onBack}>
                  All experiments
                </button>
              )}
            </p>
          </section>
        )}
      </main>
    </LearnContext.Provider>
  );
}

const label = (a: Answer) => ANSWERS.find((x) => x.id === a)?.label.split(':')[0] ?? a;
const word = (a: Answer) => (a === 'same' ? 'about the same' : a);
