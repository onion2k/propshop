// The Overview's charts, drawn on a canvas of fixed height so the page does not move as numbers arrive. Lines over
// a shared x domain, and the days' P&L as bars with equity (moved from the Days tab). Each has a legend that
// names every line with its latest value, so a colour never carries a line's meaning alone.

import { useEffect, useRef } from 'react';
import type { DayReport } from '../sim';
import { exchangeColour } from './Chart';

/** A colour from the page's tokens, read where the page is; the fallback is the token's value. */
function token(name: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

/** Line colours and dashes for several lines at once: the tokens first, then the exchange colours. */
export function lineStyle(i: number): { colour: string; dash: number[] } {
  const palette = [
    token('--accent', '#5ec8ff'),
    exchangeColour('LAKESIDE'),
    exchangeColour('PACIFIC'),
    token('--text', '#e6e9ee'),
    token('--muted', '#8b94a3'),
  ];
  const dashes = [[], [], [], [6, 3], [2, 3], [10, 4]];
  return {
    colour: palette[i % palette.length]!,
    dash: dashes[Math.floor(i / palette.length) + (i >= 3 ? 1 : 0)] ?? [],
  };
}

export interface Line {
  name: string;
  colour: string;
  dash?: number[];
  /** One value per x, null for a gap. */
  values: (number | null)[];
}

function prepare(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

const GUTTER = 58;

/**
 * Lines over x. `xs` are the x values, `domain` the span the chart always shows (so a day in progress grows into a
 * chart of fixed width), `format` writes the top and bottom of the y axis. `zero` draws the line at nought.
 */
export function LineChart({
  xs,
  lines,
  domain,
  format,
  zero = false,
  yRange,
  label,
}: {
  xs: number[];
  lines: Line[];
  domain: [number, number];
  format: (v: number) => string;
  zero?: boolean;
  /** A fixed y span, e.g. 0 to 1 for shares; otherwise fitted to the data. */
  yRange?: [number, number];
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const c = canvas && prepare(canvas);
    if (!c) return;
    const { ctx, w, h } = c;
    let lo = yRange ? yRange[0] : Infinity;
    let hi = yRange ? yRange[1] : -Infinity;
    if (!yRange && !lines.some((l) => l.values.some((v) => v !== null))) return;
    if (!yRange) {
      for (const l of lines) {
        for (const v of l.values) {
          if (v === null) continue;
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
      }
      if (zero) {
        lo = Math.min(lo, 0);
        hi = Math.max(hi, 0);
      }
      if (!Number.isFinite(lo)) return;
      const pad = Math.max(1, (hi - lo) * 0.08);
      lo -= pad;
      hi += pad;
    }
    const plotW = w - GUTTER;
    const x = (v: number) => ((v - domain[0]) / (domain[1] - domain[0] || 1)) * plotW;
    const y = (v: number) => h - 4 - ((v - lo) / (hi - lo || 1)) * (h - 8);
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = token('--muted', '#8b94a3');
    ctx.textAlign = 'left';
    ctx.fillText(format(hi), plotW + 4, 10);
    ctx.fillText(format(lo), plotW + 4, h - 2);
    ctx.strokeStyle = token('--line', '#262c35');
    ctx.lineWidth = 1;
    if (zero && lo < 0 && hi > 0) {
      ctx.beginPath();
      ctx.moveTo(0, y(0));
      ctx.lineTo(plotW, y(0));
      ctx.stroke();
      // Its label only where it would not sit on the top or bottom label.
      if (y(0) > 22 && y(0) < h - 14) ctx.fillText(format(0), plotW + 4, y(0) + 3);
    }
    for (const l of lines) {
      ctx.strokeStyle = l.colour;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(l.dash ?? []);
      ctx.beginPath();
      let pen = false;
      l.values.forEach((v, i) => {
        if (v === null || xs[i] === undefined) {
          pen = false;
          return;
        }
        if (pen) ctx.lineTo(x(xs[i]), y(v));
        else ctx.moveTo(x(xs[i]), y(v));
        pen = true;
      });
      ctx.stroke();
      // A short line gets a dot at each point, so a single day is seen.
      if (l.values.filter((v) => v !== null).length <= 20) {
        ctx.setLineDash([]);
        ctx.fillStyle = l.colour;
        l.values.forEach((v, i) => {
          if (v === null || xs[i] === undefined) return;
          ctx.beginPath();
          ctx.arc(x(xs[i]), y(v), 2.5, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }
    ctx.setLineDash([]);
  }, [xs, lines, domain, format, zero, yRange]);
  return <canvas ref={ref} className="ov-canvas" role="img" aria-label={label} />;
}

/** Names every line with a swatch (colour and dash) and its latest value. */
export function Legend({ lines, format }: { lines: Line[]; format: (v: number) => string }) {
  return (
    <ul className="ov-legend small">
      {lines.map((l) => {
        const last = [...l.values].reverse().find((v) => v !== null) ?? null;
        return (
          <li key={l.name}>
            <svg width="22" height="8" aria-hidden="true">
              <line
                x1="0"
                y1="4"
                x2="22"
                y2="4"
                stroke={l.colour}
                strokeWidth="2"
                strokeDasharray={(l.dash ?? []).join(' ')}
              />
            </svg>{' '}
            {l.name} <span className="num muted">{last === null ? '—' : format(last)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Daily P&L as bars, and equity at each close as a line. */
export function PnlChart({ days }: { days: readonly DayReport[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const c = canvas && prepare(canvas);
    if (!c) return;
    const { ctx, w, h } = c;
    const maxAbs = Math.max(1, ...days.map((d) => Math.abs(d.pnl)));
    const slot = w / Math.max(days.length, 10);
    const mid = h / 2;
    ctx.strokeStyle = token('--line', '#262c35');
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();
    days.forEach((d, i) => {
      const bar = (d.pnl / maxAbs) * (mid - 6);
      ctx.fillStyle = d.pnl >= 0 ? token('--up', '#4fd18b') : token('--down', '#ff6b6b');
      ctx.fillRect(i * slot + 2, bar >= 0 ? mid - bar : mid, Math.max(2, slot - 4), Math.abs(bar));
    });
    const eq = days.map((d) => d.equityAtClose).filter((e) => e > 0);
    if (eq.length > 1) {
      const lo = Math.min(...eq);
      const hi = Math.max(...eq);
      ctx.strokeStyle = token('--accent', '#5ec8ff');
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let first = true;
      days.forEach((d, i) => {
        if (d.equityAtClose <= 0) return;
        const yy = h - 4 - ((d.equityAtClose - lo) / Math.max(1, hi - lo)) * (h - 8);
        if (first) ctx.moveTo(i * slot + slot / 2, yy);
        else ctx.lineTo(i * slot + slot / 2, yy);
        first = false;
      });
      ctx.stroke();
    }
    // The game keeps one array of days and pushes to it: the length says a day was added.
  }, [days, days.length]);
  return <canvas ref={ref} className="ov-canvas" role="img" aria-label="Daily P&L as bars, and equity at each close" />;
}
