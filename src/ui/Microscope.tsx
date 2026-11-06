// The microscope: the game held still and stepped a few ticks at a time, with every firm, every exchange and
// every message on the wire drawn where it is. Latency, which the rest of the game tells in sentences, is a dot
// part-way along a line here.

import { useState } from 'react';
import { TICK_MS, formatTime, type Snapshot, type Wire } from '../sim';
import { exchangeColour } from './Chart';
import { price, shares } from './format';
import { Term } from './Glossary';

const W = 640;
const H = 300;

export function Microscope({
  s,
  onStep,
  symbol,
  onClose,
}: {
  s: Snapshot;
  /** Step the game this many ticks: the owner of the game decides which game, and how far it may go. */
  onStep: (n: number) => void;
  symbol: string;
  onClose: () => void;
}) {
  const firms = [{ id: 'firm', name: 'You' }, ...s.competitors.map((c) => ({ id: c.id, name: c.name }))];
  const exchanges = s.exchanges.map((e) => e.id);
  const fy = (i: number) => 40 + (i * (H - 80)) / Math.max(1, firms.length - 1);
  const ey = (i: number) => 60 + (i * (H - 120)) / Math.max(1, exchanges.length - 1);
  const FX = 120;
  const EX = W - 150;
  // What moved in the last step: messages gone from the wire arrived; fills landed. Kept until the next step.
  // Worked out as the time changes, in render, the way React keeps information from a previous render.
  const [previous, setPrevious] = useState<{ now: number; wire: Wire[] }>({ now: s.now, wire: s.wire });
  const [moved, setMoved] = useState<{ arrived: Wire[]; fills: Snapshot['log'] }>({ arrived: [], fills: [] });
  if (previous.now !== s.now) {
    const arrived = previous.wire.filter(
      (p) =>
        !s.wire.some(
          (w) =>
            w.owner === p.owner &&
            w.kind === p.kind &&
            w.arrivesAt === p.arrivesAt &&
            w.symbol === p.symbol &&
            w.direction === p.direction,
        ),
    );
    const fills = s.log.filter((e) => e.kind === 'fill' && e.at > previous.now && e.at <= s.now);
    setMoved({ arrived, fills });
    setPrevious({ now: s.now, wire: s.wire });
  }
  const { arrived, fills } = moved;
  const stock = s.stocks.find((st) => st.symbol === symbol);
  const name = (id: string) => (id === 'firm' ? 'You' : (s.names[id] ?? id));
  return (
    <section className="panel microscope" data-tut="microscope">
      <h2>
        Microscope{' '}
        <span className="muted">
          · {formatTime(s.now)}.{String(s.now % 1000).padStart(3, '0')} · every message on the wire ·{' '}
          <Term id="latency">latency</Term>
        </span>
      </h2>
      <div className="micro-bar">
        {[1, 5, 25, 250].map((n) => (
          <button key={n} type="button" onClick={() => onStep(n)} aria-label={`Step ${n * TICK_MS} milliseconds`}>
            +{n * TICK_MS}ms
          </button>
        ))}
        <button type="button" className="link" onClick={onClose}>
          Close the microscope
        </button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="micro" role="img" aria-label="Firms, exchanges and messages in flight">
        {firms.map((f, i) =>
          exchanges.map((e, j) => (
            <line key={`${f.id}-${e}`} x1={FX} y1={fy(i)} x2={EX} y2={ey(j)} stroke="rgba(255,255,255,0.08)" />
          )),
        )}
        {firms.map((f, i) => (
          <g key={f.id}>
            <circle cx={FX} cy={fy(i)} r={5} fill={f.id === 'firm' ? '#5ec8ff' : '#8b94a3'} />
            <text
              x={FX - 10}
              y={fy(i) + 4}
              textAnchor="end"
              fill={f.id === 'firm' ? '#5ec8ff' : '#c0c6d0'}
              fontSize="11"
            >
              {f.name}
            </text>
          </g>
        ))}
        {exchanges.map((e, j) => {
          const belief = s.beliefs[e]?.[symbol];
          const seenQ = stock?.exchanges.find((x) => x.id === e)?.seen;
          return (
            <g key={e}>
              <rect
                x={EX - 6}
                y={ey(j) - 22}
                width={140}
                height={44}
                rx={4}
                fill="#10141a"
                stroke={exchangeColour(e)}
              />
              <text x={EX} y={ey(j) - 8} fill={exchangeColour(e)} fontSize="11" fontWeight="bold">
                {e}
              </text>
              <text x={EX} y={ey(j) + 5} fill="#c0c6d0" fontSize="10" fontFamily="ui-monospace, monospace">
                {seenQ ? `${price(seenQ.bid)} / ${price(seenQ.ask)}` : '—'}
              </text>
              <text x={EX} y={ey(j) + 17} fill="#8b94a3" fontSize="9" fontFamily="ui-monospace, monospace">
                belief {belief === undefined ? '—' : price(Math.round(belief * 100) / 100)} · fair{' '}
                {stock ? price(Math.round(stock.fair * 100) / 100) : '—'}
              </text>
            </g>
          );
        })}
        {s.wire.map((w, k) => {
          const i = firms.findIndex((f) => f.id === w.owner);
          const j = exchanges.indexOf(w.exchange);
          if (i < 0 || j < 0) return null;
          const span = Math.max(1, w.arrivesAt - w.sentAt);
          const t = Math.min(1, Math.max(0, (s.now - w.sentAt) / span));
          const p = w.direction === 'out' ? t : 1 - t;
          const x = FX + (EX - 6 - FX) * p;
          const y = fy(i) + (ey(j) - fy(i)) * p;
          const colour =
            w.kind === 'fill'
              ? '#4fd18b'
              : w.kind === 'order'
                ? w.side === 'buy'
                  ? '#4fd18b'
                  : '#ff6b6b'
                : w.kind === 'rejected'
                  ? '#ff6b6b'
                  : '#c0c6d0';
          const mine = w.owner === 'firm';
          return (
            <g key={k}>
              <circle cx={x} cy={y} r={mine ? 4 : 3} fill={colour} opacity={mine ? 1 : 0.6} />
              {mine && (
                <text x={x + 6} y={y - 5} fill="#e6e9ee" fontSize="9" fontFamily="ui-monospace, monospace">
                  {w.kind} {w.symbol} {w.side === 'buy' ? 'B' : 'S'}
                  {shares(w.size)}@{price(w.price)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="micro-log small">
        {s.wire.length === 0 && arrived.length === 0 && fills.length === 0 && (
          <span className="muted">Nothing on the wire. Step until something is sent.</span>
        )}
        {arrived.map((w, k) => (
          <div key={`a${k}`}>
            {name(w.owner)}: {w.kind} {w.symbol} {w.side} {shares(w.size)}@{price(w.price)}{' '}
            {w.direction === 'out' ? `arrived at ${w.exchange}` : `heard back from ${w.exchange}`}
          </div>
        ))}
        {fills.map((e, k) => (
          <div key={`f${k}`} className="up">
            {e.kind === 'fill' &&
              `You: filled ${shares(e.fill.size)} ${e.fill.symbol} at ${price(e.fill.price)} on ${e.fill.exchange}`}
          </div>
        ))}
        {s.wire
          .filter((w) => w.owner === 'firm')
          .map((w, k) => (
            <div key={`w${k}`} className="muted">
              You: {w.kind} {w.symbol} {w.side} {shares(w.size)}@{price(w.price)}{' '}
              {w.direction === 'out' ? `to ${w.exchange}` : `from ${w.exchange}`}, {Math.max(0, w.arrivesAt - s.now)}ms
              to go
            </div>
          ))}
      </div>
    </section>
  );
}
