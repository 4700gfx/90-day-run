import { useEffect, useRef, useState } from "react";
import { fmtDate, money } from "./common";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const niceMax = (v: number) => {
  if (v <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => n <= s) ?? 10;
  return step * p;
};

export interface MtdPoint {
  date: string;
  day: number;
  spent: number;
  allowance: number;
}

/**
 * Month-to-date spend (solid, accent) against the allowance line ($/day × day, dashed reference).
 * One y-axis, recessive grid, direct labels at the line ends, crosshair tooltip on hover/tap.
 */
export function MtdChart({ points, monthDays, daily }: { points: MtdPoint[]; monthDays: number; daily: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 190;
  const pad = { l: 44, r: 74, t: 14, b: 24 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const yMax = niceMax(Math.max(daily * monthDays, ...points.map((p) => p.spent)));
  const x = (day: number) => pad.l + ((day - 1) / Math.max(1, monthDays - 1)) * iw;
  const y = (v: number) => pad.t + ih - (v / yMax) * ih;
  const ticks = [0, yMax / 2, yMax];
  const spendPath = points.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.spent).toFixed(1)}`).join("");
  const last = points[points.length - 1];
  const hp = hover != null ? points[hover] : null;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (!points.length) return;
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const day = 1 + ((e.clientX - r.left) / r.width) * (monthDays - 1);
    const i = Math.max(0, Math.min(points.length - 1, Math.round(day) - 1));
    setHover(i);
  };

  return (
    <div className="chart" ref={ref}>
      <svg width={W} height={H} role="img" aria-label={last ? `Month-to-date spend ${money(last.spent)} against an allowance of ${money(last.allowance)} through ${fmtDate(last.date)}` : "No spend this month yet"}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={pad.l + iw} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="axis">
              {money(t)}
            </text>
          </g>
        ))}
        {[1, 8, 15, 22, 29].filter((d) => d <= monthDays).map((d) => (
          <text key={d} x={x(d)} y={H - 6} textAnchor="middle" className="axis">
            {d}
          </text>
        ))}
        {/* allowance reference: full month */}
        <line x1={x(1)} y1={y(daily)} x2={x(monthDays)} y2={y(daily * monthDays)} className="ref" />
        <text x={x(monthDays) + 6} y={y(daily * monthDays) + 4} className="dlabel muted">
          Allowance
        </text>
        {points.length > 0 && (
          <>
            <path d={spendPath} className="line" />
            <circle cx={x(last!.day)} cy={y(last!.spent)} r={4.5} className="dot" />
            <text x={x(last!.day) + 8} y={y(last!.spent) + 4} className="dlabel">
              {money(last!.spent)}
            </text>
          </>
        )}
        {hp && (
          <g pointerEvents="none">
            <line x1={x(hp.day)} x2={x(hp.day)} y1={pad.t} y2={pad.t + ih} className="cross" />
            <circle cx={x(hp.day)} cy={y(hp.spent)} r={4.5} className="dot" />
          </g>
        )}
        <rect x={pad.l} y={pad.t} width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hp && (
        <div className="tip" style={{ left: Math.min(W - 150, Math.max(0, x(hp.day) - 70)) }} role="status">
          <b>{fmtDate(hp.date)}</b>
          <span>Spent {money(hp.spent)}</span>
          <span>Allowed {money(hp.allowance)}</span>
          <span className={hp.spent > hp.allowance ? "bad-text" : "good-text"}>
            {hp.spent > hp.allowance ? `✗ Over by ${money(hp.spent - hp.allowance)}` : `✓ ${money(hp.allowance - hp.spent)} under`}
          </span>
        </div>
      )}
      <details className="tableview">
        <summary>Show as table</summary>
        <table className="ttable">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Spent to date</th>
              <th scope="col">Allowed to date</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.date}>
                <td>{fmtDate(p.date, { month: "short", day: "numeric" })}</td>
                <td className="mono">{money(p.spent)}</td>
                <td className="mono">{money(p.allowance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export interface TrendPoint {
  date: string;
  value: number;
  note?: string;
}

/** Weekly trend: one series, optional shaded band and target line, crosshair tooltip, table view. */
export function TrendChart({ points, unit, band, target, label }: { points: TrendPoint[]; unit: string; band?: [number, number]; target?: number; label: string }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return <p className="small">No {label.toLowerCase()} entries yet.</p>;
  const H = 150;
  const pad = { l: 44, r: 30, t: 16, b: 22 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const vals = [...points.map((p) => p.value), ...(band ?? []), ...(target != null ? [target] : [])];
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const spanPad = Math.max(0.5, (hi - lo) * 0.15);
  lo = Math.floor((lo - spanPad) * 2) / 2;
  hi = Math.ceil((hi + spanPad) * 2) / 2;
  const x = (i: number) => pad.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - ((v - lo) / (hi - lo)) * ih;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const last = points[points.length - 1]!;
  const hp = hover != null ? points[hover] : null;
  const fmtV = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)}${unit}`;
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = points.length === 1 ? 0 : Math.round(((e.clientX - r.left) / r.width) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };
  return (
    <div className="chart" ref={ref}>
      <svg width={W} height={H} role="img" aria-label={`${label}: latest ${fmtV(last.value)} on ${fmtDate(last.date)}, ${points.length} entries`}>
        {band && <rect x={pad.l} width={iw} y={y(band[1])} height={y(band[0]) - y(band[1])} className="band" />}
        {[lo, (lo + hi) / 2, hi].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={pad.l + iw} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="axis">
              {fmtV(Math.round(t * 10) / 10)}
            </text>
          </g>
        ))}
        {target != null && (
          <>
            <line x1={pad.l} x2={pad.l + iw} y1={y(target)} y2={y(target)} className="ref" />
            <text x={pad.l + 6} y={y(target) - 5} className="dlabel muted small-label">
              Target {fmtV(target)}
            </text>
          </>
        )}
        {band && (
          <text x={pad.l + 6} y={y(band[0]) - 5} className="dlabel muted small-label">
            Hold {band[0]}–{band[1]}
          </text>
        )}
        <path d={path} className="line" />
        {points.map((p, i) => (
          <circle key={p.date} cx={x(i)} cy={y(p.value)} r={i === points.length - 1 || hover === i ? 4.5 : 3} className="dot" />
        ))}
        <text x={x(points.length - 1)} y={y(last.value) - 9} textAnchor="middle" className="dlabel">
          {fmtV(last.value)}
        </text>
        {hp && <line x1={x(hover!)} x2={x(hover!)} y1={pad.t} y2={pad.t + ih} className="cross" pointerEvents="none" />}
        <rect x={pad.l - 8} y={pad.t} width={iw + 16} height={ih} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hp && (
        <div className="tip" style={{ left: Math.min(W - 150, Math.max(0, x(hover!) - 70)) }} role="status">
          <b>{fmtDate(hp.date)}</b>
          <span>{fmtV(hp.value)}</span>
          {hp.note && <span className="small">{hp.note}</span>}
        </div>
      )}
      <details className="tableview">
        <summary>Show as table</summary>
        <table className="ttable">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">{label}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.date}>
                <td>{fmtDate(p.date, { month: "short", day: "numeric" })}</td>
                <td className="mono">
                  {fmtV(p.value)}
                  {p.note && ` (${p.note})`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
