import { useState } from "react";
import { RUN } from "../config/run.config";
import { dateForDay, dayNumber, todayIn, weekCount, weekOf, weekRange, weekday } from "../engine/dates";
import { weekInsights } from "../engine/insights";
import { REVIEW_AUTO_FIELDS, REVIEW_TEXT_FIELDS, reviewPrefill } from "../engine/review";
import type { BodyCheck } from "../engine/body";
import { K, type WeeklyReview } from "../store/records";
import { put } from "../store/store";
import { Card, fmtDate } from "./common";
import type { RunCtx } from "./useRun";

const WIDE = new Set(["topSets", "collections", "graceUsed", "extendedUsed"]);

/** Sunday → this week; otherwise the last full week (if any). */
function defaultWeek(ctx: RunCtx) {
  const n = dayNumber(ctx.clock.today, ctx.cfg);
  const w = Math.max(1, Math.min(weekCount(ctx.cfg), weekOf(n)));
  return weekday(ctx.clock.today) === 0 || w === 1 ? w : w - 1;
}

export function Review({ ctx }: { ctx: RunCtx }) {
  const { run, cfg, ev, profile, activeRunId, lifts } = ctx;
  const [week, setWeek] = useState(() => defaultWeek(ctx));
  const total = weekCount(cfg);
  const { first, last } = weekRange(week, cfg);
  const saved: WeeklyReview | undefined = run.reviews[week];
  const prefill = reviewPrefill(ev, ctx.inputs, cfg, profile, { body: run.body as BodyCheck[], collections: run.collections, jobs: run.jobs, lifts }, week);
  const fields = saved?.fields ?? {};
  const value = (id: string) => fields[id] ?? prefill[id] ?? "";
  const write = (patch: Partial<WeeklyReview>) =>
    put(K.review(activeRunId, week), { runWeek: week, fields: {}, ...saved, ...patch, updatedAt: new Date().toISOString() } satisfies WeeklyReview);
  const setField = (id: string, v: string) => write({ fields: { ...fields, [id]: v } });
  const resetField = (id: string) => {
    const next = { ...fields };
    delete next[id];
    write({ fields: next });
  };
  const insights = weekInsights(ev, ctx.inputs, cfg, week, profile);
  const groups = [...new Set(REVIEW_AUTO_FIELDS.map((f) => f.group))];
  const history = Object.values(run.reviews).sort((a, b) => b.runWeek - a.runWeek);
  const started = dateForDay(first, cfg) <= ctx.clock.today;

  return (
    <div className="screen">
      <header className="dayhead">
        <div>
          <div className="eyebrow">
            Sunday review · {fmtDate(dateForDay(first, cfg))} – {fmtDate(dateForDay(last, cfg))}
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
      {!started && <div className="banner warn">This week hasn't started yet.</div>}
      <div className="cols">
        <div className="col">
          <Card title="Reflection" right={saved?.savedAt ? <span className="tag t-good">Saved {fmtDate(todayIn(RUN.timezone, new Date(saved.savedAt)), { month: "short", day: "numeric" })}</span> : <span className="tag t-muted">Draft</span>}>
            {REVIEW_TEXT_FIELDS.map((f) => (
              <label key={f.id} className="field">
                <span>{f.label}</span>
                <textarea rows={2} value={fields[f.id] ?? ""} onChange={(e) => setField(f.id, e.target.value)} />
              </label>
            ))}
            <button
              className="btn primary wide"
              onClick={() => write({ fields: { ...prefill, ...fields }, savedAt: new Date().toISOString() })}
            >
              {saved?.savedAt ? "Re-save with current numbers" : "Save review"}
            </button>
            <p className="small">Saving freezes the numbers below with your answers, so the history shows the week as it was.</p>
          </Card>
          {(insights.length > 0 || run.weekNotes[week]) && (
            <Card title="From the Week tab">
              {insights.length > 0 && (
                <ul className="insights">
                  {insights.slice(0, 6).map((x, i) => (
                    <li key={i} className={`ins-${x.tone}`}>
                      <span className="ins-icon" aria-hidden="true">
                        {x.tone === "good" ? "✓" : x.tone === "warn" ? "!" : "•"}
                      </span>
                      <span>{x.text}</span>
                    </li>
                  ))}
                </ul>
              )}
              {run.weekNotes[week] && (
                <>
                  <h3 className="subhead">Your notes</h3>
                  <p className="prewrap">{run.weekNotes[week]}</p>
                </>
              )}
            </Card>
          )}
        </div>
        <div className="col">
          {groups.map((g) => (
            <Card key={g} title={g}>
              <div className="revgrid">
                {REVIEW_AUTO_FIELDS.filter((f) => f.group === g).map((f) => {
                  const overridden = fields[f.id] != null && fields[f.id] !== prefill[f.id];
                  return (
                    <label key={f.id} className={`field${WIDE.has(f.id) ? " span2" : ""}`}>
                      <span>
                        {f.label}
                        {overridden && (
                          <button type="button" className="resetbtn" onClick={() => resetField(f.id)} aria-label={`Reset ${f.label} to the app's value`}>
                            ↺ auto
                          </button>
                        )}
                      </span>
                      <input type="text" value={value(f.id)} onChange={(e) => setField(f.id, e.target.value)} />
                    </label>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      </div>
      <Card title="History" right={<span className="small">{history.filter((h) => h.savedAt).length} saved</span>}>
        {history.length === 0 ? (
          <p className="small" style={{ marginTop: 0 }}>
            No reviews yet. Save one each Sunday.
          </p>
        ) : (
          <ul className="entries">
            {history.map((h) => (
              <li key={h.runWeek}>
                <button className="linkbtn" onClick={() => setWeek(h.runWeek)}>
                  Week {h.runWeek}
                </button>
                <span className="grow small">
                  {h.fields.wonDays ? `${h.fields.wonDays} won · ` : ""}
                  {h.fields.biggestWin ? `Win: ${h.fields.biggestWin}` : h.savedAt ? "" : "draft"}
                </span>
                {h.savedAt && <span className="tag t-good">Saved</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
