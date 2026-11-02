import { GRACE_HABITS, type HabitId } from "../config/run.config";
import { dateForDay, tokenBlockOf, weekCount, weekRange } from "../engine/dates";
import { floorDayAlert, tokenSummary, weekSummary } from "../engine/evaluate";
import { weekInsights } from "../engine/insights";
import { K } from "../store/records";
import { put } from "../store/store";
import type { DayResult } from "../engine/types";
import { Card, StatusChip, fmtDate, habitLabel, money, shortHabit } from "./common";
import type { RunCtx } from "./useRun";

const ROWS: HabitId[] = ["workout", "spend", "hysa", "meals", "commit", "apply", "read"];

/** Symbol + label for one habit on one day (never color alone). */
function cell(d: DayResult, h: HabitId): { sym: string; label: string; tone: string } {
  if (d.status === "FUTURE") return { sym: "", label: "upcoming", tone: "future" };
  if (h === "workout" || h === "spend") {
    const o = d.strict[h];
    return o === "hit" ? { sym: "✓", label: "hit", tone: "hit" } : o === "miss" ? { sym: "✗", label: "missed", tone: "miss" } : { sym: "·", label: "not logged", tone: "unknown" };
  }
  if (h === "hysa") {
    const s = d.strict.hysa;
    return s === "na"
      ? { sym: "–", label: "not a payday", tone: "na" }
      : s === "hit"
        ? { sym: "✓", label: "deposit logged", tone: "hit" }
        : s === "pending"
          ? { sym: "…", label: "deposit due", tone: "unknown" }
          : { sym: "✗", label: "no deposit", tone: "miss" };
  }
  const g = d.grace[h];
  switch (g?.kind) {
    case "hit":
      return { sym: "✓", label: "hit", tone: "hit" };
    case "grace":
      return { sym: "G", label: "grace miss", tone: "grace" };
    case "extended":
      return { sym: "E", label: "extended grace miss", tone: "grace" };
    case "illegal":
      return { sym: "✗", label: g.reason === "consecutive" ? "second miss in a row" : "miss not covered", tone: "miss" };
    default:
      return { sym: "·", label: "not logged", tone: "unknown" };
  }
}

export function Week({ ctx, week, setWeek, openDay }: { ctx: RunCtx; week: number; setWeek: (w: number) => void; openDay: (d: string) => void }) {
  const { ev, cfg, run, profile, activeRunId } = ctx;
  const total = weekCount(cfg);
  const { first, last } = weekRange(week, cfg);
  const days = ev.days.slice(first - 1, last);
  const ws = weekSummary(ev, week, cfg);
  const tokens = tokenSummary(ev, cfg);
  const block = tokenBlockOf(week);
  const blockWeeks = block * 2 - 1 === total ? `Week ${total}` : `Weeks ${block * 2 - 1}–${Math.min(block * 2, total)}`;
  const alert = floorDayAlert(ev, week, cfg);
  const elapsed = days.filter((d) => d.status === "WON" || d.status === "LOST").length;
  const weekAllowance = cfg.dailyAllowance * days.length;
  const own = weekInsights(ev, ctx.inputs, cfg, week, profile);
  // Early in a week (e.g. Monday) there's nothing decided yet: show last week's takeaways instead.
  const fallback = own.length === 0 && week > 1 && days.some((d) => d.date === ev.today);
  const insights = fallback ? weekInsights(ev, ctx.inputs, cfg, week - 1, profile) : own;
  const noteWeek = fallback ? week - 1 : week;
  const note = run.weekNotes[noteWeek] ?? "";
  const saveNote = (text: string) => put(K.weekNote(activeRunId, noteWeek), { text, updatedAt: new Date().toISOString() });
  const ICON = { good: "✓", warn: "!", info: "•" } as const;

  return (
    <div className="screen">
      <header className="dayhead">
        <div>
          <div className="eyebrow">
            {fmtDate(dateForDay(first, cfg))} – {fmtDate(dateForDay(last, cfg))}
          </div>
          <h1 className="daynum">
            Week {week} <span className="of">/ {total}</span>
          </h1>
        </div>
        <div className="daynav">
          <button className="btn icon" onClick={() => setWeek(week - 1)} disabled={week <= 1} aria-label="Previous week">
            ‹
          </button>
          <button className="btn icon" onClick={() => setWeek(week + 1)} disabled={week >= total} aria-label="Next week">
            ›
          </button>
        </div>
      </header>

      {alert && (
        <div className="banner warn" role="alert">
          3+ Floor Days two weeks in a row. That's a schedule problem: review it on Sunday.
        </div>
      )}

      <Card>
        <div className="scroll">
          <table className="wgrid">
            <caption className="sr-only">Habits by day for week {week}</caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Habit</span>
                </th>
                {days.map((d) => (
                  <th key={d.date} scope="col">
                    <button className="daycol" onClick={() => d.status !== "FUTURE" && openDay(d.date)} disabled={d.status === "FUTURE"} aria-label={`Open ${fmtDate(d.date)}`}>
                      <span>{fmtDate(d.date, { weekday: "short" })}</span>
                      <b className="mono">{d.dayNum}</b>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((h) => (
                <tr key={h}>
                  <th scope="row">{shortHabit[h]}</th>
                  {days.map((d) => {
                    const c = cell(d, h);
                    return (
                      <td key={d.date} className={`c-${c.tone}`} title={`${habitLabel(h)}: ${c.label}`}>
                        <span aria-hidden="true">{c.sym}</span>
                        <span className="sr-only">{c.label}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="statusrow">
                <th scope="row">Day</th>
                {days.map((d) => (
                  <td key={d.date}>{d.status === "FUTURE" ? "" : <StatusChip status={d.status} floor={d.floorDay} />}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="small legend">✓ hit · ✗ miss · G grace · E extended grace · … pending · – n/a · tap a day to open it</p>
      </Card>

      <Card title="Insights" right={<span className="small">{fallback ? `From Week ${week - 1}` : `Week ${week}`}</span>}>
        {insights.length ? (
          <ul className="insights">
            {insights.map((x, i) => (
              <li key={i} className={`ins-${x.tone}`}>
                <span className="ins-icon" aria-hidden="true">
                  {ICON[x.tone]}
                </span>
                <span>{x.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small" style={{ marginTop: 0 }}>
            Insights appear once this week has a finished day.
          </p>
        )}
        <label className="field">
          <span>Your notes for Week {noteWeek}</span>
          <textarea rows={4} value={note} placeholder="What worked, what cost you, what to change next week" onChange={(e) => saveNote(e.target.value)} />
        </label>
        {insights.length > 0 && (
          <button className="btn small-btn" style={{ marginTop: 8 }} onClick={() => saveNote([note.trim(), ...insights.map((x) => `- ${x.text}`)].filter(Boolean).join("\n"))}>
            Copy insights into notes
          </button>
        )}
      </Card>

      <div className="cols">
        <Card title="Grace this week">
          <ul className="list">
            {GRACE_HABITS.map((h) => {
              const g = ws.grace[h]!;
              return (
                <li key={h}>
                  <span className="grow">{habitLabel(h)}</span>
                  <span className={`tag ${g.broken ? "t-bad" : g.remaining ? "t-muted" : "t-warn"}`}>
                    {g.broken ? "Broken" : g.remaining ? "1 grace left" : `${g.misses} used`}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="small">
            Extended Grace ({blockWeeks}):{" "}
            {ws.token.used ? `used for ${habitLabel(ws.token.used.habit).toLowerCase()} on Day ${ws.token.used.dayNum}` : "available"} · {tokens.remaining} of {tokens.total} left this run
          </p>
        </Card>
        <Card title="Week so far">
          <div className="kv">
            <div>
              <b className="mono">
                {ws.won}/{elapsed}
              </b>
              <span>days won (finished)</span>
            </div>
            <div>
              <b className="mono">{ws.floorDays}</b>
              <span>Floor Days</span>
            </div>
            <div>
              <b className={`mono ${ws.spend.total > weekAllowance ? "bad-text" : ""}`}>{money(ws.spend.total)}</b>
              <span>spent of {money(weekAllowance)}</span>
            </div>
          </div>
          <p className="small">Spend is scored month-to-date; the weekly figure is a guide ({money(cfg.dailyAllowance)} × {days.length} days).</p>
        </Card>
      </div>
    </div>
  );
}
