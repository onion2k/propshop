// The strategy: the blocks, each with a switch and sliders and a paragraph on what it is for, and a meter
// showing how much of the computer is in use.

import { shows, type StageId } from '../content';
import { BLOCKS, SCRIPT_ID, type Snapshot } from '../sim';
import { Term } from './Glossary';
import { ScriptEditor } from './ScriptEditor';
import type { Store } from './store';

const TERM_FOR: Record<string, string> = {
  arbitrage: 'arbitrage',
  marketMaker: 'market-maker',
  momentum: 'momentum',
  meanReversion: 'mean-reversion',
  sniper: 'stale-quote',
  pairs: 'pairs',
  indexArb: 'index-arb',
  newsReaction: 'news',
  triangle: 'triangular-arbitrage',
  carry: 'carry',
  leadLag: 'lead-lag',
  basisArb: 'basis',
  roll: 'roll',
};

/** `stage` is the stage in force; a block that is on is shown whatever the stage, so nothing running is hidden. */
export function StrategyPanel({ s, store, stage = 5 }: { s: Snapshot; store: Store; stage?: StageId }) {
  const cap = s.capacity;
  const full = cap.blocksUsed >= cap.maxBlocks;
  return (
    <section className="panel strategy" data-tut="strategy">
      <h2>
        Strategy{' '}
        <span className="muted">
          · <Term id="capacity">capacity</Term> {cap.blocksUsed}/{cap.maxBlocks} blocks, decides every{' '}
          {cap.decisionEveryMs}ms, {cap.ordersPerSecond} orders/s
          {cap.ordersDropped > 0 && <span className="down"> · {cap.ordersDropped} dropped</span>}
          {cap.ordersRejected > 0 && <span className="down"> · {cap.ordersRejected} refused for exposure</span>}
        </span>
      </h2>
      {BLOCKS.map((b) => {
        const setting = s.blocks.find((x) => x.id === b.spec.id);
        if (!setting) return null;
        if (!setting.enabled && !shows(`block:${b.spec.id}`, stage)) return null;
        const running = setting.enabled && s.blocks.filter((x) => x.enabled).indexOf(setting) < cap.maxBlocks;
        return (
          <details key={b.spec.id} className={`block ${running ? 'running' : ''}`} open={setting.enabled}>
            <summary>
              <label onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={setting.enabled}
                  disabled={!setting.enabled && full}
                  onChange={(e) => store.setBlock(b.spec.id, { enabled: e.target.checked })}
                  aria-label={`Enable ${b.spec.name}`}
                />
              </label>
              <strong>
                <Term id={TERM_FOR[b.spec.id] ?? b.spec.id}>{b.spec.name}</Term>
              </strong>
              <span className="muted"> {b.spec.summary}</span>
              {setting.enabled && !running && <span className="down"> · no capacity</span>}
            </summary>
            <p className="explain">{b.spec.explain}</p>
            {b.spec.id === SCRIPT_ID && <ScriptEditor s={s} setting={setting} store={store} />}
            {b.spec.params.map((p) =>
              p.choices ? (
                <label key={p.key} className="param">
                  <span className="param-name">{p.name}</span>
                  <select
                    value={setting.params[p.key] ?? p.default}
                    onChange={(e) => store.setBlock(b.spec.id, { params: { [p.key]: Number(e.target.value) } })}
                    aria-label={`${b.spec.name} ${p.name}`}
                  >
                    {p.choices.map((label, i) => (
                      <option key={label} value={p.min + i * p.step}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <span className="muted small">{p.explain}</span>
                </label>
              ) : (
                <label key={p.key} className="param">
                  <span className="param-name">
                    {p.name} <span className="num">{setting.params[p.key]}</span>{' '}
                    <span className="muted">{p.unit}</span>
                  </span>
                  <input
                    type="range"
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    value={setting.params[p.key] ?? p.default}
                    onChange={(e) => store.setBlock(b.spec.id, { params: { [p.key]: Number(e.target.value) } })}
                    aria-label={`${b.spec.name} ${p.name}`}
                  />
                  <span className="muted small">{p.explain}</span>
                </label>
              ),
            )}
          </details>
        );
      })}
    </section>
  );
}
