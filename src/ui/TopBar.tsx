// The top bar: the simulated clock, the market's state, speed, and the firm's money at a glance.

import { useSyncExternalStore } from 'react';
import { SPEEDS, formatSpan, formatTime, type Snapshot } from '../sim';
import { ROUGH_WORDS, WATCH_WORDS } from '../content';
import { money, moneyShort } from './format';
import { Term } from './Glossary';
import { RUNNING_SHORT, type Store, type WatchState } from './store';

export function TopBar({
  s,
  store,
  micro,
  onMicro,
  microscope = true,
}: {
  s: Snapshot;
  store: Store;
  micro: boolean;
  onMicro: () => void;
  /** Whether the microscope button is shown (a later stage). */
  microscope?: boolean;
}) {
  const until = s.nextChange - s.now;
  const running = useSyncExternalStore(store.subscribe, store.getRunning, store.getRunning);
  // A device that cannot step the asked speed in a frame's budget runs slower; the bar says what it reaches.
  const watch = useSyncExternalStore(store.subscribe, store.getWatchState, store.getWatchState);
  const stride = useSyncExternalStore(store.subscribe, store.getStride, store.getStride);
  const asked = watch.on ? watch.speed : s.speed;
  const short = asked > 0 && running < asked * RUNNING_SHORT;
  return (
    <header className="topbar">
      <div className="brand">
        <h1>Propshop</h1>
        <span className="muted">a trading sim</span>
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
        {/* The day's kind holds its place while there is none, so the bar does not reflow when one is named. */}
        <span className="regime" title={s.regime?.explain}>
          {s.regime ? <Term id="regimes">{s.regime.name}</Term> : '\u00a0'}
        </span>
      </div>
      <div className="speed" role="group" aria-label="Speed" data-tut="speed">
        {SPEEDS.map((sp) => (
          <button
            key={sp}
            type="button"
            className={!watch.on && s.speed === sp ? 'on' : ''}
            onClick={() => store.setSpeed(sp)}
          >
            {sp === 0 ? '⏸' : `${sp}×`}
          </button>
        ))}
        <button
          type="button"
          className={watch.on ? 'on' : ''}
          aria-pressed={watch.on}
          title={WATCH_WORDS.title}
          onClick={() => store.setWatching(!watch.on)}
        >
          {WATCH_WORDS.button}
        </button>
        {/* Holds its room whether or not watch is on, so the row does not reflow when it is switched. */}
        <span className="watching muted" data-testid="watching">
          {watch.on ? <WatchLine now={s.now} watch={watch} /> : '\u00a0'}
        </span>
        {/* Holds its room whether or not the top speed is on, so the row does not reflow when it is picked. */}
        <span className="stride muted" data-testid="stride" title={stride ? ROUGH_WORDS.title : undefined}>
          {stride ? <Term id={ROUGH_WORDS.term}>{ROUGH_WORDS[stride]}</Term> : '\u00a0'}
        </span>
        {short && (
          <span className="running muted" title="This device cannot step the asked speed in time">
            running {Math.max(1, Math.round(running))}×
          </span>
        )}
        {microscope && (
          <button
            type="button"
            className={`skip ${micro ? 'on' : ''}`}
            onClick={onMicro}
            aria-label="Open the microscope"
          >
            microscope
          </button>
        )}
        {/* Kept in place, unseen and last in the row, while the market is open, so the bar does not reflow at the
            open and the close. visibility: hidden takes it out of the tab order and the accessibility tree too. */}
        <button
          type="button"
          className={`skip ${s.open ? 'placeholder' : ''}`}
          onClick={() => store.skipToOpen()}
          disabled={s.open}
          aria-hidden={s.open || undefined}
        >
          skip to open
        </button>
      </div>
      {s.halt && (
        <div className="halt" role="status">
          HALTED{' '}
          <span className="muted">
            · {s.halt.reason} · trading again at the open, in {formatSpan(Math.max(0, s.halt.until - s.now))}
          </span>
        </div>
      )}
      <div className="money">
        <Stat label="Cash" value={moneyShort(s.cash)} />
        <Stat label="Equity" value={moneyShort(s.equity)} />
        <Stat label="Day P&L" value={money(s.dayPnl, true)} tone={s.dayPnl} />
        <Stat label="Heat" value={`${Math.round(s.heat)} / ${s.heatLine}`} tone={s.heat >= s.heatLine ? -1 : 0} />
      </div>
    </header>
  );
}

function WatchLine({ now, watch }: { now: number; watch: WatchState }) {
  const m = watch.next;
  if (watch.slow === 'headline') return <>{WATCH_WORDS.watchingHeadline}</>;
  if (watch.slow === 'moment' && watch.watched) return <>{WATCH_WORDS.watchingMoment(watch.watched)}</>;
  if (!m) return <>{WATCH_WORDS.nothing}</>;
  const term = WATCH_WORDS.termOf[m.kind];
  return (
    <>
      {term ? <Term id={term}>{m.label}</Term> : m.label}
      {WATCH_WORDS.until(formatSpan(Math.max(0, m.at - now)))}
    </>
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
