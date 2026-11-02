// The days: each close's report, newest first and the latest open, under a chart of daily P&L and equity.
// The report says what the day was in numbers the top bar cannot: by block, by stock, by race.

import { useEffect, useRef } from 'react';
import { REGIMES } from '../content';
import { BLOCKS, type DayReport, type Snapshot, type Tally } from '../sim';
import { money, moneyShort, ms } from './format';
import { Term } from './Glossary';

function blockName(id: string): string {
  return BLOCKS.find((b) => b.spec.id === id)?.spec.name ?? id;
}

function net(t: Tally): number {
  return t.realised - t.fees;
}

export function DaysPanel({ s }: { s: Snapshot }) {
  const days = [...s.days].reverse();
  if (days.length === 0) {
    return (
      <div className="days">
        <p className="muted">
          No day has closed yet. At 16:00 the game writes up what happened: by block, by stock, by race.
        </p>
      </div>
    );
  }
  return (
    <div className="days">
      <PnlChart days={s.days} />
      {days.map((d, i) => (
        <details key={d.day} className="day" open={i === 0}>
          <summary>
            <strong>
              {d.weekday}, week {d.week}
            </strong>{' '}
            <span className={`num ${d.pnl >= 0 ? 'up' : 'down'}`}>{money(d.pnl, true)}</span>
            <span className="muted small">
              {' '}
              · {d.regime ? `${REGIMES.find((r) => r.id === d.regime)?.name.toLowerCase() ?? d.regime} · ` : ''}
              {verdict(d)}
            </span>
          </summary>
          <Report d={d} />
        </details>
      ))}
    </div>
  );
}

function verdict(d: DayReport): string {
  const blocks = Object.entries(d.byBlock);
  if (blocks.length === 0) return 'nothing traded';
  const best = blocks.reduce((a, b) => (net(b[1]) > net(a[1]) ? b : a));
  const races = d.races.won + d.races.beaten + d.races.missed;
  const won = races > 0 ? `${Math.round((100 * d.races.won) / races)}% of races won` : 'no races';
  return `${blockName(best[0])} did best, ${won}`;
}

function Report({ d }: { d: DayReport }) {
  const races = d.races.won + d.races.beaten + d.races.missed;
  return (
    <div className="report">
      <div className="report-grid">
        <div>
          <h3>By block</h3>
          <TallyTable rows={Object.entries(d.byBlock).map(([k, t]) => [blockName(k), t])} />
        </div>
        <div>
          <h3>By stock</h3>
          <TallyTable rows={Object.entries(d.bySymbol).map(([k, t]) => [k, t])} />
        </div>
      </div>
      <h3>
        Races{' '}
        <span className="muted">
          · <Term id="latency">latency</Term>{' '}
          {Object.entries(d.latency)
            .map(([e, l]) => `${e} ${ms(l)}`)
            .join(', ')}
        </span>
      </h3>
      {races === 0 ? (
        <p className="muted">No immediate-or-cancel orders.</p>
      ) : (
        <p>
          <span className="up">{d.races.won} won</span>, <span className="down">{d.races.beaten} beaten</span> by a
          named rival, <span className="muted">{d.races.missed} missed</span> with nobody named:{' '}
          {Math.round((100 * d.races.won) / races)}% won.
        </p>
      )}
      <p className="muted small">
        Fees {money(-d.fees)}
        {d.fines > 0 && <span className="down">, fines {money(-d.fines)}</span>} · equity at the close{' '}
        {moneyShort(d.equityAtClose)}
      </p>
      {((d.halts?.length ?? 0) > 0 || (d.regulator?.length ?? 0) > 0) && (
        <>
          <h3>Risk and the regulator</h3>
          <ul className="small">
            {(d.halts ?? []).map((h, i) => (
              <li key={`h${i}`} className="down">
                Halted: {h}.
              </li>
            ))}
            {(d.regulator ?? []).map((n, i) => (
              <li key={`r${i}`} className="down">
                {n}
              </li>
            ))}
          </ul>
        </>
      )}
      <h3>Rivals</h3>
      <table>
        <tbody>
          {[{ name: 'You', pnl: d.pnl, you: true }, ...d.rivals.map((r) => ({ ...r, you: false }))]
            .sort((a, b) => b.pnl - a.pnl)
            .map((r) => (
              <tr key={r.name} className={r.you ? 'you' : ''}>
                <td>{r.name}</td>
                <td className={`num ${r.pnl >= 0 ? 'up' : 'down'}`}>{money(r.pnl, true)}</td>
              </tr>
            ))}
        </tbody>
      </table>
      <h3>
        <Term id="news">News</Term> <span className="muted">· {d.headlines.length}</span>
      </h3>
      <ul className="small">
        {d.headlines.map((h, i) => (
          <li key={i}>
            {h.text} <span className="muted">· {h.symbols.join(', ')} · </span>
            {h.noise ? (
              <span className="muted">noise</span>
            ) : (
              Object.entries(h.moved).map(([sym, m]) => (
                <span key={sym} className={m > 0 ? 'up' : 'down'}>
                  {sym} {m > 0 ? '+' : ''}
                  {m}¢{' '}
                </span>
              ))
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TallyTable({ rows }: { rows: [string, Tally][] }) {
  if (rows.length === 0) return <p className="muted small">Nothing.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th></th>
          <th className="num">Fills</th>
          <th className="num">Realised</th>
          <th className="num">Fees</th>
          <th className="num">Net</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, t]) => (
          <tr key={name}>
            <td>{name}</td>
            <td className="num">{t.fills}</td>
            <td className="num">{money(Math.round(t.realised), true)}</td>
            <td className="num muted">{money(-t.fees)}</td>
            <td className={`num ${net(t) >= 0 ? 'up' : 'down'}`}>{money(Math.round(net(t)), true)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Daily P&L as bars, green and red, and equity at each close as a line. */
function PnlChart({ days }: { days: DayReport[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const maxAbs = Math.max(1, ...days.map((d) => Math.abs(d.pnl)));
    const slot = w / Math.max(days.length, 10);
    const mid = h / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();
    days.forEach((d, i) => {
      const bar = (d.pnl / maxAbs) * (mid - 6);
      ctx.fillStyle = d.pnl >= 0 ? '#4fd18b' : '#ff6b6b';
      ctx.fillRect(i * slot + 2, bar >= 0 ? mid - bar : mid, Math.max(2, slot - 4), Math.abs(bar));
    });
    const eq = days.map((d) => d.equityAtClose).filter((e) => e > 0);
    if (eq.length > 1) {
      const lo = Math.min(...eq);
      const hi = Math.max(...eq);
      ctx.strokeStyle = 'rgba(94,200,255,0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      days.forEach((d, i) => {
        if (d.equityAtClose <= 0) return;
        const y = h - 4 - ((d.equityAtClose - lo) / Math.max(1, hi - lo)) * (h - 8);
        if (i === 0) ctx.moveTo(i * slot + slot / 2, y);
        else ctx.lineTo(i * slot + slot / 2, y);
      });
      ctx.stroke();
    }
  }, [days]);
  return (
    <div className="pnl-chart">
      <canvas ref={ref} role="img" aria-label="Daily P&L, and equity at each close" />
      <span className="muted small">
        Each bar a day&apos;s <Term id="pnl">P&L</Term>; the line is equity at the close.
      </span>
    </div>
  );
}
