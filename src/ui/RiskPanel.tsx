// The risk limits, as sliders: the loss on the day that halts the firm, and the leverage it may carry.

import type { Snapshot } from '../sim';
import { moneyShort } from './format';
import { Term } from './Glossary';
import type { Store } from './store';

export function RiskPanel({ s, store }: { s: Snapshot; store: Store }) {
  return (
    <section className="panel risk" data-tut="risk">
      <h2>
        <Term id="risk-limits">Risk limits</Term>
      </h2>
      <label className="param">
        <span className="param-name">
          Daily loss limit <span className="num">{moneyShort(s.risk.dailyLossLimit)}</span>
        </span>
        <input
          type="range"
          min={50_000}
          max={5_000_000}
          step={50_000}
          value={Math.min(5_000_000, Math.max(50_000, s.risk.dailyLossLimit))}
          onChange={(e) => store.setRisk({ dailyLossLimit: Number(e.target.value) })}
          aria-label="Daily loss limit"
        />
        <span className="muted small">Down this much on the day and the firm halts until the next open, flat.</span>
      </label>
      <label className="param">
        <span className="param-name">
          Leverage <span className="num">{s.risk.maxLeverage}×</span>
        </span>
        <input
          type="range"
          min={1}
          max={20}
          step={1}
          value={s.risk.maxLeverage}
          onChange={(e) => store.setRisk({ maxLeverage: Number(e.target.value) })}
          aria-label="Leverage"
        />
        <span className="muted small">
          Gross exposure, held and resting, may reach equity times this. An order past it is refused.
        </span>
      </label>
    </section>
  );
}
