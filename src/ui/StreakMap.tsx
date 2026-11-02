import { weekCount } from "../engine/dates";
import type { DayResult } from "../engine/types";
import { fmtDate } from "./common";
import type { RunCtx } from "./useRun";

const DOW = ["M", "T", "W", "T", "F", "S", "S"];

function look(d: DayResult): { cls: string; glyph: string; label: string } {
  switch (d.status) {
    case "WON":
      return d.floorDay ? { cls: "won floor", glyph: "✓", label: "Won (Floor Day)" } : { cls: "won", glyph: "✓", label: "Won" };
    case "LOST":
      return { cls: "lost", glyph: "✗", label: "Lost" };
    case "PENDING":
      return { cls: "pending", glyph: "…", label: "In progress" };
    default:
      return { cls: "future", glyph: "", label: "Upcoming" };
  }
}

/** 90-day map: one row per run week (Mon–Sun). Tap a past day to open it. */
export function StreakMap({ ctx, onOpen, compact = false, selected }: { ctx: RunCtx; onOpen: (date: string) => void; compact?: boolean; selected?: string }) {
  const { ev, cfg } = ctx;
  const weeks = weekCount(cfg);
  return (
    <div className={`smap ${compact ? "compact" : ""}`}>
      <div className="smap-grid" role="grid" aria-label="Streak map: days won and lost">
        <div className="smap-row head" role="row">
          <span className="wk" />
          {DOW.map((d, i) => (
            <span key={i} className="dow" role="columnheader" aria-label={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}>
              {d}
            </span>
          ))}
        </div>
        {Array.from({ length: weeks }, (_, w) => (
          <div className="smap-row" role="row" key={w}>
            <span className="wk" role="rowheader">
              W{w + 1}
            </span>
            {Array.from({ length: 7 }, (_, i) => {
              const d = ev.days[w * 7 + i];
              if (!d) return <span key={i} className="cell void" role="gridcell" />;
              const l = look(d);
              const isToday = d.date === ev.today;
              return (
                <button
                  key={i}
                  role="gridcell"
                  className={`cell ${l.cls}${isToday ? " today" : ""}${selected === d.date ? " sel" : ""}`}
                  disabled={d.status === "FUTURE"}
                  onClick={() => onOpen(d.date)}
                  aria-label={`Day ${d.dayNum}, ${fmtDate(d.date)}: ${l.label}${isToday ? " (today)" : ""}`}
                  title={`Day ${d.dayNum} · ${fmtDate(d.date)} · ${l.label}`}
                >
                  {compact ? <span aria-hidden="true">{l.glyph}</span> : (
                    <>
                      <span className="n" aria-hidden="true">{d.dayNum}</span>
                      <span className="g" aria-hidden="true">{l.glyph}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="smap-legend" aria-hidden="true">
        <span><i className="won" />Won</span>
        <span><i className="won floor" />Floor Day won</span>
        <span><i className="lost" />Lost</span>
        <span><i className="pending" />In progress</span>
        <span><i className="future" />Upcoming</span>
      </div>
    </div>
  );
}
