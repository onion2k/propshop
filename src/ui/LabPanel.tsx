// The lab: the rules each exchange runs, each a real policy built or proposed to blunt speed, and a scoreboard
// of every firm's P&L since the rules last changed, so the effect of a change is read off the rivals.

import { formatSpan, type ExchangeRules, type Snapshot } from '../sim';
import { money } from './format';
import { Term } from './Glossary';
import type { Store } from './store';

interface Knob {
  key: keyof ExchangeRules;
  name: string;
  unit: string;
  choices: number[];
  explain: string;
}

const KNOBS: Knob[] = [
  {
    key: 'speedBumpMs',
    name: 'Speed bump',
    unit: 'ms',
    choices: [0, 2, 5, 10, 20],
    explain:
      'Every order and every quote through this exchange takes this much longer, both ways. IEX put 350 ' +
      'microseconds of coiled fibre in front of its matching engine in 2016 so that no one could race its ' +
      'quotes; here the bump is in game milliseconds. Watch what it does to whoever was winning the race to this venue.',
  },
  {
    key: 'batchMs',
    name: 'Batch auction',
    unit: 'ms',
    choices: [0, 10, 50, 200, 1000],
    explain:
      'Orders do not match on arrival; they wait for the next batch and match then, ties by lot. Budish, ' +
      'Cramton and Shim proposed frequent batch auctions in 2015 as the cure for the arms race: within a ' +
      'batch, being first counts for nothing. Here the crowd still trades continuously, so an order that waits ' +
      'meets a market that has moved, and an arbitrage rarely gets both legs: the fastest rival loses most. A ' +
      'real batch auction would hold the crowd too.',
  },
  {
    key: 'taxPerShare',
    name: 'Transaction tax',
    unit: '¢/share',
    choices: [0, 0.25, 0.5, 1, 2],
    explain:
      'Charged to both sides of every fill. Financial transaction taxes have been proposed in many places and ' +
      'run in a few; their first casualty is the thinnest edge, which is arbitrage at a cent a share. Watch ' +
      'which blocks stop trading at all.',
  },
  {
    key: 'minRestMs',
    name: 'Minimum resting time',
    unit: 'ms',
    choices: [0, 50, 200, 500, 2000],
    explain:
      'A resting order cannot be cancelled before it has rested this long. Proposed in Europe under MiFID ' +
      'II and in the US after the flash crash, to stop quotes that exist only to be pulled. A maker who ' +
      'cannot pull a stale quote is picked off: watch the market maker widen or bleed.',
  },
  {
    key: 'tickSize',
    name: 'Tick size',
    unit: '¢',
    choices: [1, 2, 5, 10],
    explain:
      'Prices sit on this grid, so a spread cannot be narrower than a tick. The US ran a tick size pilot in ' +
      '2016 widening ticks to five cents for small stocks. A wider tick pays makers more a fill and gives ' +
      'arbitrage fewer gaps to find: the two sides of every tick size argument.',
  },
];

export function LabPanel({ s, store }: { s: Snapshot; store: Store }) {
  const scores = [...s.lab.scores].sort((a, b) => b.pnl - a.pnl);
  return (
    <div className="lab">
      <p className="muted">
        Change the <Term id="market-structure">market itself</Term> and watch who earns. Each rule is a real policy
        built or proposed to blunt speed. The scoreboard counts from the last change.
      </p>
      <h3>
        Since the rules changed{' '}
        <span className="muted small">
          · {s.lab.since === 0 ? 'the start' : formatSpan(s.now - s.lab.since) + ' ago'}
        </span>
      </h3>
      <table className="scores">
        <tbody>
          {scores.map((r) => (
            <tr key={r.id} className={r.id === 'firm' ? 'you' : ''}>
              <td>{r.name}</td>
              <td className={`num ${r.pnl >= 0 ? 'up' : 'down'}`}>{money(Math.round(r.pnl), true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {KNOBS.map((k) => (
        <div key={k.key} className="knob">
          <h3>
            {k.name} <span className="muted small">{k.unit}</span>
          </h3>
          <p className="muted small">{k.explain}</p>
          <table className="rule-grid">
            <tbody>
              {s.exchanges.map((e) => (
                <tr key={e.id}>
                  <td>{e.id}</td>
                  <td>
                    {k.choices.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={s.rules[e.id]?.[k.key] === c ? 'on' : ''}
                        aria-label={`${k.name} on ${e.id}: ${c} ${k.unit}`}
                        onClick={() => store.setRules(e.id, { [k.key]: c })}
                      >
                        {c}
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <div className="knob">
        <h3>Post-only honoured</h3>
        <p className="muted small">
          Off, and a post-only order is a plain one: a maker whose quote would cross the market takes instead, and pays
          the taker fee. The maker&apos;s cheapest protection, withdrawn.
        </p>
        <table className="rule-grid">
          <tbody>
            {s.exchanges.map((e) => (
              <tr key={e.id}>
                <td>{e.id}</td>
                <td>
                  {[true, false].map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      className={s.rules[e.id]?.postOnly === v ? 'on' : ''}
                      aria-label={`Post-only on ${e.id}: ${v ? 'on' : 'off'}`}
                      onClick={() => store.setRules(e.id, { postOnly: v })}
                    >
                      {v ? 'on' : 'off'}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
