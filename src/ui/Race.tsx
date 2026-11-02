// One order's story: the quote it was priced from, when it left, when it arrived, when the firm heard, and who
// got there first. Drawn as ticks on a line, with a sentence underneath. This is the lesson in latency.

import type { OrderStory } from '../sim';
import { money, ms, price, shares } from './format';

export function raceSentence(o: OrderStory, names: Record<string, string>, now: number): string {
  const name = (id: string) => names[id] ?? id;
  if (o.status === 'rejected')
    return `Refused before it left: ${o.reason ?? 'the computer was over its orders a second'}.`;
  if (o.status === 'inflight') return `On its way, ${ms(now - o.sentAt)} so far.`;
  if (o.status === 'resting') return `Resting at ${price(o.price)}, ${shares(o.size - o.filled)} left.`;
  if (o.status === 'cancelling') return 'Being pulled.';
  if (o.filled >= o.size) return `Filled ${shares(o.size)} at ${price(o.price)}.`;
  const last = o.beatenBy[o.beatenBy.length - 1];
  const part = o.filled > 0 ? `Filled ${shares(o.filled)} of ${shares(o.size)}; ` : 'Missed: ';
  if (last && o.arrivedAt !== null) {
    const gap = o.arrivedAt - last.at;
    return `${part}${name(last.owner)} took ${shares(last.size)} at ${price(last.price)} ${ms(gap)} before you arrived.`;
  }
  if (o.ioc) return `${part}the quote was gone by the time you arrived.`;
  return `${part}pulled.`;
}

export function Race({ o, names, now }: { o: OrderStory; names: Record<string, string>; now: number }) {
  const start = o.seenAt ?? o.sentAt;
  const end = o.ackAt ?? now;
  const span = Math.max(1, end - start);
  const x = (t: number) => `${Math.min(100, Math.max(0, ((t - start) / span) * 100))}%`;
  const ticks: { at: number; label: string; cls: string }[] = [];
  if (o.seenAt !== null) ticks.push({ at: o.seenAt, label: 'saw the quote', cls: 'saw' });
  ticks.push({ at: o.sentAt, label: 'sent', cls: 'sent' });
  for (const b of o.beatenBy) ticks.push({ at: b.at, label: `${names[b.owner] ?? b.owner} took it`, cls: 'beaten' });
  if (o.arrivedAt !== null) ticks.push({ at: o.arrivedAt, label: 'arrived', cls: 'arrived' });
  if (o.ackAt !== null) ticks.push({ at: o.ackAt, label: 'heard back', cls: 'heard' });
  return (
    <div className="race">
      <div className="race-line" aria-hidden="true">
        {ticks.map((t, i) => (
          <span
            key={i}
            className={`tick ${t.cls}`}
            style={{ left: x(t.at) }}
            title={`${t.label}, +${ms(t.at - start)}`}
          />
        ))}
      </div>
      <div className="race-words small">
        <span className="muted">
          {o.seenAt !== null && `quote ${ms(o.sentAt - o.seenAt)} old when sent`}
          {o.arrivedAt !== null && ` · arrived ${ms(o.arrivedAt - o.sentAt)} later`}
          {o.ackAt !== null && ` · heard ${ms(o.ackAt - o.sentAt)} after sending`}
        </span>
        <div className={o.filled >= o.size ? 'up' : o.beatenBy.length > 0 ? 'down' : ''}>
          {raceSentence(o, names, now)}
          {o.realised !== 0 && <span className="muted"> · {money(Math.round(o.realised), true)} realised</span>}
          {o.fee > 0 && <span className="muted"> · fee {money(o.fee)}</span>}
        </div>
      </div>
    </div>
  );
}
