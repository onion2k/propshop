// The script block's editor: the source, an Apply button, the last error, what the script printed, and a
// short reference of what it can call. Applying sets the source on the block; the game compiles it once.

import { useState } from 'react';
import { SCRIPT_ID, type BlockSetting, type Snapshot } from '../sim';
import type { Store } from './store';

const REFERENCE: [string, string][] = [
  [
    'symbols, exchanges, now, fees, news',
    'the stocks, the exchange ids, simulated ms, taker fee per exchange, recent headlines',
  ],
  ['best(symbol)', '{ bid, ask }, each { price, size, exchange } or null: the best across exchanges, as you see them'],
  ['quote(exchange, symbol)', '{ bid, ask, bidSize, askSize, at } on one exchange, or null'],
  ['mids(symbol)', 'recent midpoints, oldest first'],
  ['position(symbol), mine(symbol)', 'the firm’s position, and the part of it this script took'],
  ['orders()', 'this script’s orders in flight or resting'],
  [
    'buy(symbol, exchange, price, size, options)',
    'send an order; prices are cents, sizes shares; options { ioc, postOnly, display } or a bare ioc flag',
  ],
  ['sell(symbol, exchange, price, size, options)', 'the same, selling'],
  [
    'sweep(symbol, exchange, size, limit)',
    'take every level up to the limit, buying if the limit is at or above the ask, else selling',
  ],
  ['cancel(localId)', 'pull a resting order of yours'],
  ['log(...parts)', 'print a line below the editor'],
];

export function ScriptEditor({ s, setting, store }: { s: Snapshot; setting: BlockSetting; store: Store }) {
  const [draft, setDraft] = useState(setting.source ?? '');
  const dirty = draft !== (setting.source ?? '');
  return (
    <div className="script">
      <textarea
        className="script-source"
        value={draft}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        aria-label="Script source"
        rows={16}
      />
      <div className="script-bar">
        <button type="button" disabled={!dirty} onClick={() => store.setBlock(SCRIPT_ID, { source: draft })}>
          Apply
        </button>
        {dirty && <span className="muted small">edited, not applied</span>}
        {s.script.error && <span className="down small">{s.script.error}</span>}
        {!s.script.error && !dirty && setting.enabled && <span className="up small">running</span>}
      </div>
      {s.script.log.length > 0 && <pre className="script-log">{s.script.log.slice(-8).join('\n')}</pre>}
      <details className="script-reference">
        <summary className="muted small">What the script can call</summary>
        <dl>
          {REFERENCE.map(([call, what]) => (
            <div key={call}>
              <dt>
                <code>{call}</code>
              </dt>
              <dd className="muted small">{what}</dd>
            </div>
          ))}
        </dl>
        <p className="muted small">
          Plain JavaScript, run once a decision. A loop that runs too long is stopped. Math.random is not allowed, and
          the page is out of reach.
        </p>
      </details>
    </div>
  );
}
