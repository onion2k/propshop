// The top bar: the simulated clock, the market's state, speed, and the firm's money at a glance.

import { SPEEDS, formatSpan, formatTime, type Snapshot } from '../sim';
import { money, moneyShort } from './format';
import { Term } from './Glossary';
import type { Store } from './store';

export function TopBar({ s, store }: { s: Snapshot; store: Store }) {
  const until = s.nextChange - s.now;
  return (
    <header className="topbar">
      <div className="brand">
        <h1>Propshop</h1>
        <span className="muted">
          an <Term id="hft">HFT</Term> sim
        </span>
      </div>
      <div className="clock">
        <span className="day">
          {s.calendar.weekday} wk {s.calendar.week}
        </span>
        <span className="time">{formatTime(s.now)}</span>
        <span className={s.open ? 'state open' : 'state closed'}>
          {s.open ? 'OPEN' : 'CLOSED'}{' '}
          <span className="muted">
            · {s.open ? 'closes' : 'opens'} in {formatSpan(until)}
          </span>
        </span>
      </div>
      <div className="speed" role="group" aria-label="Speed">
        {SPEEDS.map((sp) => (
          <button key={sp} type="button" className={s.speed === sp ? 'on' : ''} onClick={() => store.setSpeed(sp)}>
            {sp === 0 ? '⏸' : `${sp}×`}
          </button>
        ))}
        {!s.open && (
          <button type="button" className="skip" onClick={() => store.skipToOpen()}>
            skip to open
          </button>
        )}
      </div>
      <div className="money">
        <Stat label="Cash" value={moneyShort(s.cash)} />
        <Stat label="Equity" value={moneyShort(s.equity)} />
        <Stat label="Day P&L" value={money(s.dayPnl, true)} tone={s.dayPnl} />
        <Stat label="Heat" value={`${Math.round(s.heat)} / ${s.heatLine}`} tone={s.heat >= s.heatLine ? -1 : 0} />
      </div>
    </header>
  );
}

function Stat({ label, value, tone = 0 }: { label: string; value: string; tone?: number }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className={`value num ${tone > 0 ? 'up' : tone < 0 ? 'down' : ''}`}>{value}</span>
    </div>
  );
}
