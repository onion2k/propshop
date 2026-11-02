// The strategy: the blocks, each with a switch and sliders and a paragraph on what it is for, and a meter
// showing how much of the computer is in use.

import { BLOCKS, type Snapshot } from '../sim';
import { Term } from './Glossary';
import type { Store } from './store';

const TERM_FOR: Record<string, string> = {
  arbitrage: 'arbitrage',
  marketMaker: 'market-maker',
  momentum: 'momentum',
  newsReaction: 'news',
};

export function StrategyPanel({ s, store }: { s: Snapshot; store: Store }) {
  const cap = s.capacity;
  const full = cap.blocksUsed >= cap.maxBlocks;
  return (
    <section className="panel strategy">
      <h2>
        Strategy{' '}
        <span className="muted">
          · <Term id="capacity">capacity</Term> {cap.blocksUsed}/{cap.maxBlocks} blocks, decides every{' '}
          {cap.decisionEveryMs}ms, {cap.ordersPerSecond} orders/s
          {cap.ordersDropped > 0 && <span className="down"> · {cap.ordersDropped} dropped</span>}
        </span>
      </h2>
      {BLOCKS.map((b) => {
        const setting = s.blocks.find((x) => x.id === b.spec.id);
        if (!setting) return null;
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
            {b.spec.params.map((p) => (
              <label key={p.key} className="param">
                <span className="param-name">
                  {p.name} <span className="num">{setting.params[p.key]}</span> <span className="muted">{p.unit}</span>
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
            ))}
          </details>
        );
      })}
    </section>
  );
}
