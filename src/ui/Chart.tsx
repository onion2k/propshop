// A price chart on a canvas: each exchange's midpoint, the true fair value faintly behind them, the last
// few minutes. Drawn from the sampled history, not live, so it costs nothing while the sim runs fast.

import { useEffect, useRef } from 'react';
import type { HistoryPoint } from '../sim';

const COLOURS: Record<string, string> = { HARBOR: '#5ec8ff', LAKESIDE: '#ffb454' };
export function exchangeColour(id: string): string {
  return COLOURS[id] ?? '#c0c0c0';
}

export function Chart({
  history,
  exchanges,
  minutes = 5,
}: {
  history: HistoryPoint[];
  exchanges: string[];
  minutes?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const last = history[history.length - 1];
    if (!last) return;
    const from = last.at - minutes * 60_000;
    const points = history.filter((p) => p.at >= from);
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of points) {
      for (const v of [p.fair, ...Object.values(p.mids)]) {
        if (v === null) continue;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    if (!Number.isFinite(lo)) return;
    const pad = Math.max(2, (hi - lo) * 0.1);
    lo -= pad;
    hi += pad;
    const x = (t: number) => ((t - from) / (last.at - from || 1)) * (w - 44);
    const y = (v: number) => h - 4 - ((v - lo) / (hi - lo)) * (h - 8);
    // Grid: a line per whole cent, where there is room for it.
    const span = Math.ceil(hi) - Math.floor(lo);
    const every = span > 12 ? Math.ceil(span / 6) : 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'left';
    for (let c = Math.ceil(lo); c <= hi; c++) {
      if (c % every !== 0) continue;
      ctx.beginPath();
      ctx.moveTo(0, y(c));
      ctx.lineTo(w - 44, y(c));
      ctx.stroke();
      ctx.fillText((c / 100).toFixed(2), w - 40, y(c) + 3);
    }
    const line = (get: (p: HistoryPoint) => number | null, colour: string, width: number) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.beginPath();
      let pen = false;
      for (const p of points) {
        const v = get(p);
        if (v === null) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(x(p.at), y(v));
        else ctx.moveTo(x(p.at), y(v));
        pen = true;
      }
      ctx.stroke();
    };
    line((p) => p.fair, 'rgba(255,255,255,0.25)', 1);
    for (const e of exchanges) line((p) => p.mids[e] ?? null, exchangeColour(e), 1.5);
  }, [history, exchanges, minutes]);
  return <canvas ref={ref} className="chart" role="img" aria-label="Price chart" />;
}
