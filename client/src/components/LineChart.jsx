import { useLayoutEffect, useRef, useState } from 'react';
import { niceMax } from '../format.js';

const HEIGHT = 170;
const PAD = { top: 12, right: 12, bottom: 22, left: 44 };

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/**
 * Single-series line chart for the last 60 seconds.
 * One series → no legend; the card title names it.
 * Hover shows a crosshair + tooltip with the exact value.
 *
 *   points: [{ t: unixSeconds, value: number }]
 */
export function LineChart({ points, format, label, minMax = 10 }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);

  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  const newest = points.at(-1)?.t ?? Math.floor(Date.now() / 1000);
  const oldest = newest - 59;
  // minMax keeps an idle chart readable (0 / 5 / 10) instead of squashing to 0 / 0.5 / 1
  const yMax = niceMax(Math.max(minMax, ...points.map((p) => p.value)));

  const x = (t) => PAD.left + ((t - oldest) / 59) * innerW;
  const y = (v) => PAD.top + innerH - (v / yMax) * innerH;

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const area = points.length ? `${path}L${x(points.at(-1).t)},${y(0)}L${x(points[0].t)},${y(0)}Z` : '';
  const ticks = [0, yMax / 2, yMax];

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const t = Math.round(oldest + ((e.clientX - rect.left - PAD.left) / innerW) * 59);
    const p = points.find((pt) => pt.t === t) ?? points.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a), points[0]);
    setHover(p ?? null);
  }

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label={label} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {ticks.map((v) => (
            <g key={v}>
              <line className="gridline"x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} />
              <text className="tick" x={PAD.left - 8} y={y(v)} dy="0.32em" textAnchor="end">{format(v)}</text>
            </g>
          ))}
          <text className="tick" x={PAD.left} y={HEIGHT - 4}>60s ago</text>
          <text className="tick" x={width - PAD.right} y={HEIGHT - 4} textAnchor="end">now</text>

          <path className="area" d={area} />
          <path className="line" d={path} />

          {hover && (
            <g>
              <line className="crosshair" x1={x(hover.t)} x2={x(hover.t)} y1={PAD.top} y2={PAD.top + innerH} />
              <circle className="dot" cx={x(hover.t)} cy={y(hover.value)} r="4.5" />
            </g>
          )}
        </svg>
      )}
      {hover && (
        <div className="tooltip" style={{ left: Math.min(x(hover.t) + 10, width - 130), top: 4 }}>
          <strong>{format(hover.value)}</strong>
          <span>{newest - hover.t === 0 ? 'just now' : `${newest - hover.t}s ago`}</span>
        </div>
      )}
    </div>
  );
}
