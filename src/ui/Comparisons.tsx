// The Comparisons section: last night's tests, the current setup against each variant over the same windows;
// the record of a variant over nights; the form for the player's own test; the rivals as strategies not run.

import { useState } from 'react';
import { shows, type Signal } from '../content';
import { COMPETITORS } from '../content/upgrades';
import { BLOCKS, type Snapshot } from '../sim';
import { money, moneyShort, ms } from './format';
import { Term } from './Glossary';
import type { Change, Night } from './nights';
import { Section } from './OverviewSection';
import type { Store } from './store';
import {
  VERDICT_WORD,
  blockName,
  compare,
  dayName,
  describeChange,
  latestWithRuns,
  nearest,
  paybackText,
  recordOverNights,
  windowLabel,
  type ComparisonRow,
} from './overview';

type Tests = ReturnType<Store['getTests']>;

const signed = (cents: number) => money(Math.round(cents), true);
const tone = (cents: number) => (cents > 0 ? 'up' : cents < 0 ? 'down' : '');
const verdictTone = (v: string | null) => (v === 'better' ? 'up' : v === 'worse' ? 'down' : 'muted');

export function Comparisons({
  s,
  store,
  tests,
  stage,
  sigs,
}: {
  s: Snapshot;
  store: Store;
  tests: Tests;
  stage: number;
  sigs: Signal[];
}) {
  const latest = tests.nights[tests.nights.length - 1] ?? null;
  const shown = latestWithRuns(tests.nights);
  const rows = shown ? compare(shown) : [];
  const records = recordOverNights(tests.nights);
  const progress = tests.progress;
  const titleOf = (id: string) => sigs.find((g) => g.id === id)?.title ?? id.split(':')[0]!;
  return (
    <Section
      id="ov-comparisons"
      title="Comparisons"
      how={
        <>
          Last night&apos;s tests: the firm as it closed, and each change to it, run again over the same windows of the
          day. Read the verdict in every window, not the total: a change that wins one window and loses another is
          mixed.
        </>
      }
      note={
        <>
          <p>
            This is a <Term id="backtest">backtest</Term>: short windows of the day replayed from the game&apos;s own
            saves, once for each setup. The fair values and the headlines are the same in every run; the crowd answers
            each setup&apos;s orders, so the books are not the day that was. Three windows of five minutes are a small{' '}
            <Term id="sample">sample</Term>, and the more changes you try the likelier one wins by luck (
            <Term id="overfitting">overfitting</Term>). The verdict uses the same band as the experiments: within a
            hundred dollars, or a tenth of the baseline, is about the same.
          </p>
          <p>
            The payback on an upgrade is the price over the extra profit in the tested minutes scaled up to a full
            390-minute session, so it assumes the rest of the day is like the windows (<Term id="payback">payback</Term>
            ). Treat it as a rough size, not a date.
          </p>
        </>
      }
    >
      <p className="ov-line small" aria-live="polite">
        {progress ? (
          <>
            Running the tests for {dayName(progress.day)}: {progress.done} of {progress.of} runs.{' '}
            <progress max={progress.of} value={progress.done} />
          </>
        ) : latest ? (
          <>
            Tests of {dayName(latest.day)}: {STATUS[latest.status]}.
          </>
        ) : (
          <span className="muted">No night tested yet.</span>
        )}
      </p>
      {latest && <Reasons night={latest} showing={shown} />}
      <ul className="small muted ov-caveats">
        <li>The crowd answers each setup&apos;s orders, so a variant&apos;s books differ from the day that was.</li>
        <li>Tips bought on the dark web are left out of the tests: they are your trades, not a block&apos;s.</li>
        <li>
          The day&apos;s saved windows live in this page&apos;s memory: a reload loses the current day&apos;s tests.
        </li>
      </ul>
      {rows.length === 0 ? (
        <p className="ov-empty muted">
          {latest && latest.status === 'none'
            ? 'The last night ran nothing. See why above.'
            : 'Nothing yet. At the first close the game runs the firm as it closed and up to six changes to it over three windows of the day (the open, a minute before the biggest headline, and 14:30), then shows them here with a verdict for each window.'}
        </p>
      ) : (
        <>
          <p className="small">
            {dayName(shown!.day)}: {shown!.pins.length} window{shown!.pins.length === 1 ? '' : 's'} of{' '}
            {Math.round(shown!.windowMs / 60_000)} minutes.
          </p>
          <div className="ov-scroll">
            <table className="ov-table ov-compare">
              <thead>
                <tr>
                  <th>Setup</th>
                  {shown!.pins.map((p) => (
                    <th key={p.label} className="num">
                      {windowLabel(p.label)}
                    </th>
                  ))}
                  <th className="num">Total</th>
                  <th className="num">Races</th>
                  <th className="num">Fees</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Row key={r.id} r={r} titleOf={titleOf} />
                ))}
              </tbody>
            </table>
          </div>
          {rows.some((r) => r.payback !== null) && (
            <ul className="small">
              {rows
                .filter((r) => r.payback !== null)
                .map((r) => (
                  <li key={r.id}>
                    {r.label} costs {moneyShort(r.price ?? 0)}; at this gain it pays back in {paybackText(r.payback!)}.{' '}
                    <span className="muted">
                      An extrapolation: it assumes the rest of the day is like these windows.
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </>
      )}
      <h3>Over the nights</h3>
      {records.length === 0 ? (
        <p className="ov-empty muted">
          Once a change has been tested on more than one night, its record is kept here: “better on 4 of 5 nights”.
        </p>
      ) : (
        <ul className="small">
          {records.map((r) => (
            <li key={r.id}>
              {r.label}: {r.text}
              <span className="muted">
                {' '}
                ({r.worse} worse, {r.same} about the same)
              </span>
            </li>
          ))}
        </ul>
      )}
      <TestTonight s={s} store={store} tests={tests} stage={stage} />
      {shows('tab:rivals', stage as 1) && <RivalsNotRun s={s} stage={stage} />}
    </Section>
  );
}

const STATUS: Record<Night['status'], string> = {
  running: 'running',
  done: 'done',
  partial: 'partly done',
  none: 'nothing ran',
};

function Reasons({ night, showing }: { night: Night; showing: Night | null }) {
  const notes: string[] = [];
  if (night.reason) notes.push(night.reason);
  for (const m of night.missing) notes.push(`${windowLabel(m.pin)} window: ${m.reason}`);
  if (night.setupChanged)
    notes.push('The setup changed during the day. The baseline is the firm as it was at the close.');
  if (night.skipped) notes.push('A newer day closed first, so this night was skipped.');
  if (night.playerNote) notes.push(night.playerNote);
  if (showing && showing.day !== night.day)
    notes.push(`The table below is from ${dayName(showing.day)}, the latest night that ran.`);
  if (notes.length === 0) return null;
  return (
    <ul className="small ov-reasons">
      {notes.map((n, i) => (
        <li key={i}>{n}</li>
      ))}
    </ul>
  );
}

function Row({ r, titleOf }: { r: ComparisonRow; titleOf: (id: string) => string }) {
  const base = r.id === 'baseline';
  return (
    <tr className={base ? 'you' : ''}>
      <td>
        <strong>{base ? 'The firm as it closed' : r.label}</strong>
        {r.signals.length > 0 && <div className="small muted">asked for by: {r.signals.map(titleOf).join(', ')}</div>}
      </td>
      {r.windows.map((w) => (
        <td key={w.pin} className="num">
          {w.pnl === null ? (
            <span className="muted">—</span>
          ) : (
            <>
              <span className={tone(w.pnl)}>{signed(w.pnl)}</span>
              <div className={`small ${verdictTone(w.verdict)}`}>
                {w.verdict ? VERDICT_WORD[w.verdict] : 'baseline'}
              </div>
            </>
          )}
        </td>
      ))}
      <td className="num">
        <span className={tone(r.total.pnl)}>{signed(r.total.pnl)}</span>
        <div className={`small ${verdictTone(r.total.verdict)}`}>
          {r.total.verdict ? VERDICT_WORD[r.total.verdict] : 'baseline'}
        </div>
      </td>
      <td className="num">{r.total.races}</td>
      <td className="num muted">{money(-r.total.fees)}</td>
      <td className={verdictTone(r.tag)}>{base ? <span className="muted">compared against</span> : r.summary}</td>
    </tr>
  );
}

type Kind = 'toggle' | 'param' | 'upgrade';

function TestTonight({ s, store, tests, stage }: { s: Snapshot; store: Store; tests: Tests; stage: number }) {
  const blocks = BLOCKS.filter((b) => shows(`block:${b.spec.id}`, stage as 1));
  const enabled = blocks.filter((b) => s.blocks.find((x) => x.id === b.spec.id)?.enabled);
  const upgrades = s.shop.filter((o) => !o.inUse);
  const [kind, setKind] = useState<Kind>('toggle');
  const [block, setBlock] = useState('');
  const [key, setKey] = useState('');
  const [value, setValue] = useState<number | null>(null);
  const [up, setUp] = useState('');
  const toggleBlock = blocks.find((b) => b.spec.id === block) ?? blocks[0];
  const paramBlock = enabled.find((b) => b.spec.id === block) ?? enabled[0];
  const spec = paramBlock?.spec.params.find((p) => p.key === key) ?? paramBlock?.spec.params[0];
  const current = spec ? (s.blocks.find((b) => b.id === paramBlock!.spec.id)?.params[spec.key] ?? spec.default) : 0;
  const shownValue = value ?? current;
  const offer = upgrades.find((o) => `${o.kind}:${o.spec.id}` === up) ?? upgrades[0];
  const queue = () => {
    let change: Change | null = null;
    if (kind === 'toggle' && toggleBlock) change = { kind: 'toggle', block: toggleBlock.spec.id };
    else if (kind === 'param' && paramBlock && spec)
      change = { kind: 'param', block: paramBlock.spec.id, key: spec.key, value: shownValue };
    else if (kind === 'upgrade' && offer) change = { kind: 'upgrade', upgradeKind: offer.kind, id: offer.spec.id };
    if (change) store.setPlayerTest(change);
  };
  const canQueue = kind === 'toggle' ? !!toggleBlock : kind === 'param' ? !!spec : !!offer;
  return (
    <div className="ov-form">
      <h3>Test tonight</h3>
      <p className="small muted">
        Pick one change of your own. At the close it is tested with the game&apos;s, over the same windows.
      </p>
      <p className="ov-line small" aria-live="polite">
        {tests.player ? (
          <>
            Queued for tonight: <strong>{describeChange(tests.player, s)}</strong>{' '}
            <button type="button" className="link" onClick={() => store.setPlayerTest(null)}>
              Clear
            </button>
          </>
        ) : (
          <span className="muted">Nothing queued.</span>
        )}
      </p>
      <div className="ov-fields">
        <label>
          Change
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="toggle">Switch a block on or off</option>
            <option value="param">Change a parameter</option>
            <option value="upgrade">Try an upgrade</option>
          </select>
        </label>
        {kind === 'toggle' && (
          <label>
            Block
            <select value={toggleBlock?.spec.id ?? ''} onChange={(e) => setBlock(e.target.value)}>
              {blocks.map((b) => (
                <option key={b.spec.id} value={b.spec.id}>
                  {b.spec.name} ({s.blocks.find((x) => x.id === b.spec.id)?.enabled ? 'on' : 'off'})
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === 'param' &&
          (paramBlock && spec ? (
            <>
              <label>
                Block
                <select
                  value={paramBlock.spec.id}
                  onChange={(e) => {
                    setBlock(e.target.value);
                    setKey('');
                    setValue(null);
                  }}
                >
                  {enabled.map((b) => (
                    <option key={b.spec.id} value={b.spec.id}>
                      {b.spec.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Parameter
                <select
                  value={spec.key}
                  onChange={(e) => {
                    setKey(e.target.value);
                    setValue(null);
                  }}
                >
                  {paramBlock.spec.params.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {spec.name}: {shownValue}
                {spec.unit ? ` ${spec.unit}` : ''}
                <input
                  type="range"
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  value={shownValue}
                  onChange={(e) => setValue(Number(e.target.value))}
                />
              </label>
            </>
          ) : (
            <p className="small muted">No block is running, so there is no parameter to change.</p>
          ))}
        {kind === 'upgrade' &&
          (offer ? (
            <label>
              Upgrade
              <select value={`${offer.kind}:${offer.spec.id}`} onChange={(e) => setUp(e.target.value)}>
                {upgrades.map((o) => (
                  <option key={`${o.kind}:${o.spec.id}`} value={`${o.kind}:${o.spec.id}`}>
                    {o.spec.name} ({o.owned ? 'owned' : moneyShort(o.spec.price)})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="small muted">Everything in the shop is in use.</p>
          ))}
        <button type="button" disabled={!canQueue} onClick={queue}>
          Test tonight
        </button>
      </div>
    </div>
  );
}

function RivalsNotRun({ s, stage }: { s: Snapshot; stage: number }) {
  const d = s.days[s.days.length - 1];
  const shown = (id: string) => shows(`block:${id}`, stage as 1);
  return (
    <div className="ov-rivals">
      <h3>Strategies you did not run</h3>
      <p className="small muted">
        The rivals are other strategies on the same day, from nearer seats. Their result is one of the comparisons the
        game gets for free.
      </p>
      {!d ? (
        <p className="ov-empty muted">After the first close, each rival&apos;s day and what it runs are listed here.</p>
      ) : (
        <div className="ov-scroll">
          <table className="ov-table">
            <thead>
              <tr>
                <th>Rival</th>
                <th>Runs</th>
                <th className="num">Nearest</th>
                <th className="num">{dayName(d.day)}</th>
              </tr>
            </thead>
            <tbody>
              {[...d.rivals]
                .sort((a, b) => b.pnl - a.pnl)
                .map((r) => {
                  const spec = COMPETITORS.find((c) => c.name === r.name);
                  const ids = spec?.blocks ? spec.blocks.map((b) => b.id) : ['arbitrage'];
                  const lat = s.competitors.find((c) => c.name === r.name)?.latency;
                  const near = lat ? nearest(lat) : null;
                  return (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td className="small">{ids.filter(shown).map(blockName).join(', ') || '—'}</td>
                      <td className="num">{near === null ? '—' : ms(near)}</td>
                      <td className={`num ${tone(r.pnl)}`}>{signed(r.pnl)}</td>
                    </tr>
                  );
                })}
              <tr className="you">
                <td>You</td>
                <td className="small">
                  {s.blocks
                    .filter((b) => b.enabled)
                    .map((b) => blockName(b.id))
                    .join(', ') || '—'}
                </td>
                <td className="num">{nearest(s.latency) === null ? '—' : ms(nearest(s.latency)!)}</td>
                <td className={`num ${tone(d.pnl)}`}>{signed(d.pnl)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
