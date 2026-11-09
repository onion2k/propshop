// The metals desk on the Market page: a metal's curve (spot and each live expiry, its shape in words) and the fix
// line at the venue that holds one. The working is in metals.ts; this presents it, in room that does not change
// as the market runs.

import type { Snapshot } from '../sim';
import { dollarPrice, expiryLabel, money, pointsInCents, shares } from './format';
import { Term } from './Glossary';
import { curveOf, fixStateOf, type Curve } from './metals';

const W = 300;
const H = 64;
const PAD = 8;

/** The curve as a line of points against their dates, spot at the left. Drawn in a fixed box. */
function CurveChart({ c, now }: { c: Curve; now: number }) {
  const prices = c.points.map((p) => p.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const span = hi - lo || 1;
  const first = c.points[0]!;
  const last = c.points[c.points.length - 1]!;
  // Spot is now and each expiry its own date: x is time from now, read off the snapshot's clock.
  const times = c.points.map((p) => (p.expiry === null ? 0 : p.expiry - now));
  const tMax = Math.max(...times) || 1;
  const x = (i: number) => PAD + ((times[i] ?? 0) / tMax) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - lo) / span) * (H - 2 * PAD);
  const label = `${c.metal.name} curve, spot ${dollarPrice(Math.round(first.price), c.metal.decimals)} to ${dollarPrice(
    Math.round(last.price),
    c.metal.decimals,
  )} at the last expiry: ${c.shape}`;
  return (
    <svg className="curve-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <polyline
        points={c.points.map((p, i) => `${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ')}
        fill="none"
        className="curve-line"
        vectorEffect="non-scaling-stroke"
      />
      {c.points.map((p, i) => (
        <circle
          key={p.symbol}
          cx={x(i)}
          cy={y(p.price)}
          r={3}
          className={p.quoted ? 'curve-dot' : 'curve-dot unquoted'}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

/** The curve's shape in words, linked to what each shape is. */
function ShapeWords({ c }: { c: Curve }) {
  switch (c.shape) {
    case 'contango':
      return (
        <>
          <Term id="contango">Contango</Term>: the later the date, the dearer.
        </>
      );
    case 'backwardation':
      return (
        <>
          <Term id="backwardation">Backwardation</Term>: the later the date, the cheaper. The metal now is short.
        </>
      );
    case 'flat':
      return <>Flat: every date at one price.</>;
    case 'mixed':
      return (
        <>
          Neither <Term id="contango">contango</Term> nor <Term id="backwardation">backwardation</Term>: the dates are
          out of line with each other, which a <Term id="futures-curve">calendar spread</Term> trades.
        </>
      );
  }
}

/** A metal's curve: four fixed rows (spot and the three live expiries), the chart and two lines of words. */
export function CurveView({ s, symbol }: { s: Snapshot; symbol: string }) {
  const c = curveOf(s, symbol);
  if (!c) return null;
  const d = c.metal.decimals;
  const spot = c.points[0]!;
  const lease = c.metal.metal?.lease ?? 0;
  return (
    <div className="curve">
      <h3>
        <Term id="futures-curve">futures curve</Term>{' '}
        <span className="muted">
          · {c.metal.name}: <Term id="spot">spot</Term> and each expiry, at the middle of the touch you see
        </span>
      </h3>
      <div className="curve-body">
        <CurveChart c={c} now={s.now} />
        <table>
          <tbody>
            {c.points.map((p) => (
              <tr key={p.symbol} className={p.symbol === symbol ? 'picked' : ''}>
                <td>{p.expiry === null ? 'spot' : `${p.symbol} ${expiryLabel(p.expiry)}`}</td>
                <td className="num">
                  {dollarPrice(Math.round(p.price), d)}
                  {!p.quoted && <span className="muted"> fair</span>}
                </td>
                <td className="num muted">
                  {p.expiry === null ? '' : money(pointsInCents(Math.round(p.price - spot.price), d), true)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="curve-words small">
        <ShapeWords c={c} />{' '}
        {c.carry !== null && (
          <span className="muted">
            Carry now {(c.carry * 100).toFixed(1)}% a year: the dollar&apos;s rate and <Term id="storage">storage</Term>
            , {((c.carry + lease) * 100).toFixed(1)}%, less the <Term id="lease-rate">lease</Term>,{' '}
            {(lease * 100).toFixed(1)}%.
          </span>
        )}
        {!spot.quoted && <span className="muted"> No spot venue is open: spot is its fair value.</span>}
      </p>
    </div>
  );
}

/** The fix at the venue that holds one: the call while it runs, the day's fixes after. One line, its room kept. */
export function FixLine({ s, symbol }: { s: Snapshot; symbol: string }) {
  const f = fixStateOf(s, symbol);
  if (!f) return null;
  const d = s.stocks.find((x) => x.symbol === symbol)?.decimals ?? 2;
  if (f.kind === 'call') {
    const late = s.dataLatency[f.venue] ?? 0;
    return (
      <p className="fix-line small">
        <Term id="call-auction">In the fix</Term>: {f.secondsLeft} s, <Term id="uncrossing-price">indicative</Term>{' '}
        {f.indicative === null ? (
          'not seen yet'
        ) : f.indicative.price === null ? (
          'not crossed yet'
        ) : (
          <>
            <span className="num">{dollarPrice(f.indicative.price, d)}</span>, {shares(f.indicative.volume)} lots would
            cross
          </>
        )}
        <span className="muted">
          {' '}
          · on {f.venue}, as you see it {late} ms late: a resting order joins, an immediate one is refused
        </span>
      </p>
    );
  }
  const next = f.next === null ? '' : ` · next at ${expiryLabel(f.next).slice(-5)}`;
  return (
    <p className="fix-line small">
      {f.fixes.length === 0 ? (
        <>
          No <Term id="fix">fix</Term> yet today on {f.venue}
        </>
      ) : (
        <>
          <Term id="fix">Fixes</Term> today:{' '}
          {f.fixes.map((x, i) => (
            <span key={x.at}>
              {i > 0 && '; '}
              {expiryLabel(x.at).slice(-5)}{' '}
              {x.price === null ? (
                'no fix'
              ) : (
                <>
                  <span className="num">{dollarPrice(x.price, d)}</span>, {shares(x.volume)} lots
                </>
              )}
            </span>
          ))}
        </>
      )}
      <span className="muted">{next}</span>
    </p>
  );
}
