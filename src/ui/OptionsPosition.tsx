// The options desk in Position: its greeks totalled (delta in index units and as futures to hedge, gamma, theta a day,
// vega a point) and a what-if under them, two sliders that revalue the desk by the model without touching the game.
// The working is in overview.ts and was done in the snapshot; this presents it, in room that does not change.

import { useState } from 'react';
import { OPTIONS_WORDS } from '../content';
import type { Snapshot } from '../sim';
import { money } from './format';
import { Term } from './Glossary';
import { deskGreeks, scenario } from './overview';

/** The most the what-if moves the index, in per cent, and the volatility, in points. */
const INDEX_RANGE = 2;
const VOL_RANGE = 5;

const whole = (n: number) => (Math.round(n) || 0).toLocaleString('en-US');
const signed = (n: number, unit: string) => `${n > 0 ? '+' : ''}${n.toFixed(unit === '%' ? 1 : 0)}${unit}`;

export function OptionsPosition({ s }: { s: Snapshot }) {
  const [index, setIndex] = useState(0);
  const [vol, setVol] = useState(0);
  const g = deskGreeks(s);
  const o = s.options;
  if (!g || !o) return null;
  const pnl = scenario(o.held, index / 100, vol, { spot: o.spot, rate: o.rate, now: s.now });
  const hedge = Math.abs(g.hedge) < 0.05 ? OPTIONS_WORDS.flat : OPTIONS_WORDS.hedge(g.hedge);
  return (
    <div className="ov-options" data-testid="options-greeks">
      <h3>
        {OPTIONS_WORDS.greeksHeading}{' '}
        <span className="muted small">
          · {g.held === 0 ? OPTIONS_WORDS.none : OPTIONS_WORDS.held(g.held, g.contracts)}
        </span>
      </h3>
      <dl className="ov-stats">
        <div>
          <dt>
            <Term id="delta">Delta</Term>
          </dt>
          <dd className="num" data-greek="delta">
            {OPTIONS_WORDS.units(whole(g.delta))}
          </dd>
        </div>
        <div>
          <dt>
            <Term id="delta-hedge">To hedge</Term>
          </dt>
          <dd className="num" data-greek="hedge">
            {hedge}
          </dd>
        </div>
        <div>
          <dt>
            <Term id="gamma">Gamma</Term>
          </dt>
          <dd className="num" data-greek="gamma">
            {OPTIONS_WORDS.perDollar(whole(g.gamma))}
          </dd>
        </div>
        <div>
          <dt>
            <Term id="theta">Theta</Term>
          </dt>
          <dd className="num" data-greek="theta">
            {OPTIONS_WORDS.perDay(money(g.theta, true))}
          </dd>
        </div>
        <div>
          <dt>
            <Term id="vega">Vega</Term>
          </dt>
          <dd className="num" data-greek="vega">
            {OPTIONS_WORDS.perPoint(money(g.vega, true))}
          </dd>
        </div>
      </dl>
      <div className="scenario" data-testid="scenario">
        <h4>
          {OPTIONS_WORDS.whatIf} <span className="muted small">· {OPTIONS_WORDS.whatIfNote}</span>
        </h4>
        <div className="scenario-sliders">
          <label className="slider">
            <span>
              Index move (<Term id="gamma">gamma</Term>)
            </span>
            <input
              type="range"
              min={-INDEX_RANGE}
              max={INDEX_RANGE}
              step={0.5}
              value={index}
              aria-label={OPTIONS_WORDS.indexMove}
              onChange={(e) => setIndex(Number(e.target.value))}
            />
            <output className="num">{signed(index, '%')}</output>
          </label>
          <label className="slider">
            <span>
              Volatility move (<Term id="vega">vega</Term>)
            </span>
            <input
              type="range"
              min={-VOL_RANGE}
              max={VOL_RANGE}
              step={1}
              value={vol}
              aria-label={OPTIONS_WORDS.volMove}
              onChange={(e) => setVol(Number(e.target.value))}
            />
            <output className="num">{signed(vol, ' pts')}</output>
          </label>
        </div>
        <p className="scenario-result small">
          <span className="muted">The desk would be </span>
          <strong className={`num ${pnl > 0 ? 'up' : pnl < 0 ? 'down' : ''}`} data-testid="scenario-pnl">
            {money(pnl, true)}
          </strong>
        </p>
      </div>
    </div>
  );
}
