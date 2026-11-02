import { useState } from "react";
import { OSSU_SEED, OSSU_WEEKS, type OssuItem } from "../config/run.config";
import { addDays, dateForDay, dayNumber, weekCount, weekOf } from "../engine/dates";
import { hasSyllabus, isPhase2, mergeSyllabus, ossuStatus, readingProgress, syllabusDay } from "../engine/learn";
import { planFor } from "../engine/plan";
import { K } from "../store/records";
import { put } from "../store/store";
import { Card, fmtDate, newId } from "./common";
import { useGithubPushes } from "./github";
import type { RunCtx } from "./useRun";

export function Learn({ ctx }: { ctx: RunCtx }) {
  return (
    <div className="screen">
      <header className="dayhead">
        <div>
          <div className="eyebrow">Learn</div>
          <h1 className="daynum">Study</h1>
        </div>
      </header>
      <div className="cols">
        <div className="col">
          <SyllabusWeek ctx={ctx} />
          <Ossu ctx={ctx} />
        </div>
        <div className="col">
          <Reading ctx={ctx} />
          <Commits ctx={ctx} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- OSSU

function Ossu({ ctx }: { ctx: RunCtx }) {
  const { run, cfg, clock, activeRunId } = ctx;
  const items = run.ossu ?? OSSU_SEED;
  const week = Math.max(1, Math.min(weekCount(cfg), weekOf(dayNumber(clock.today, cfg))));
  const st = ossuStatus(items, week, cfg, dayNumber(clock.today, cfg));
  const KIND = { course: "Course", project: "Project", homework: "Homework" } as const;
  const save = (next: OssuItem[]) => put(K.ossu(activeRunId), next);
  const update = (id: string, patch: Partial<OssuItem>) => save(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const toggle = (i: OssuItem) => update(i.id, { done: !i.done });
  const p1 = items.filter((i) => !isPhase2(i, cfg));
  const p2 = items.filter((i) => isPhase2(i, cfg));

  const Item = ({ i }: { i: OssuItem }) => (
    <li className={`ossu-item ${i.done ? "done" : ""} k-${i.kind}`}>
      <button className={`tl-check ${i.done ? "on" : ""}`} aria-pressed={i.done} aria-label={`${i.done ? "Mark not done" : "Mark done"}: ${i.title}`} onClick={() => toggle(i)}>
        {i.done ? "✓" : ""}
      </button>
      <span className="grow">
        <span className="ossu-title">{i.title}</span>
        <span className="small">
          {" "}
          {i.track} · {KIND[i.kind]}
          {i.dueDay ? ` · due ${fmtDate(dateForDay(i.dueDay, cfg))}` : i.week ? ` · Week ${i.week}` : ""}
          {i.difficulty ? ` · ${i.difficulty}` : ""}
        </span>
        {i.details && (
          <details className="ossu-details">
            <summary>Details</summary>
            <ul>
              {i.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </details>
        )}
      </span>
    </li>
  );

  return (
    <Card title="OSSU map" right={<span className={`tag ${st.onTrack ? "t-good" : "t-warn"}`}>{st.onTrack ? "✓ On track" : `! Behind: ${st.overdue.length}`}</span>}>
      {run.ossu && !hasSyllabus(run.ossu) && (
        <div className="prompt" role="alert">
          <span>Your map was edited before the revised syllabus arrived. Load it? Anything you ticked done stays done.</span>
          <button className="btn primary small-btn" onClick={() => save(mergeSyllabus(run.ossu!))}>
            Load syllabus
          </button>
        </div>
      )}
      <ul className="bars" style={{ marginBottom: 10 }}>
        {(["course", "homework", "project"] as const).map((k) => (
          <li key={k}>
            <span className="lbl">{{ course: "Courses", homework: "Homework", project: "Projects" }[k]}</span>
            <span className="track" aria-hidden="true">
              <span style={{ width: `${st.byKind[k].total ? (st.byKind[k].done / st.byKind[k].total) * 100 : 0}%` }} />
            </span>
            <span className="mono val">
              {st.byKind[k].done}/{st.byKind[k].total}
            </span>
          </li>
        ))}
      </ul>
      <h3 className="subhead">Week {week} targets</h3>
      {st.thisWeek.length ? (
        <ul className="ossu-list">
          {st.thisWeek.map((i) => (
            <Item key={i.id} i={i} />
          ))}
        </ul>
      ) : (
        <p className="small">Nothing assigned to this week yet. Assign courses to weeks in the map below.</p>
      )}
      {st.overdue.length > 0 && (
        <>
          <h3 className="subhead warn-text">Behind (from earlier weeks)</h3>
          <ul className="ossu-list">
            {st.overdue.map((i) => (
              <Item key={i.id} i={i} />
            ))}
          </ul>
        </>
      )}
      {st.unassigned > 0 && <p className="small">{st.unassigned} unfinished items have no week yet.</p>}

      <details className="ossu-editor">
        <summary>Edit course map ({p1.length})</summary>
        <MapEditor items={items} list={p1} cfg={{ weeks: weekCount(cfg) }} save={save} update={update} />
        <AddItem onAdd={(i) => save([...items, i])} />
      </details>
      <details className="ossu-editor">
        <summary>Phase 2: Feb–Apr ({p2.length})</summary>
        {p2.length ? <MapEditor items={items} list={p2} cfg={{ weeks: weekCount(cfg) }} save={save} update={update} /> : <p className="small">Set an item's week to "Phase 2" to park it here.</p>}
      </details>
      <p className="small">From your revised syllabus (Sep 29), shifted to start Sun Nov 1. Edit anything in the map above.</p>
    </Card>
  );
}

function MapEditor({ items, list, cfg, save, update }: { items: OssuItem[]; list: OssuItem[]; cfg: { weeks: number }; save: (x: OssuItem[]) => void; update: (id: string, p: Partial<OssuItem>) => void }) {
  const move = (id: string, dir: -1 | 1) => {
    const idx = list.findIndex((i) => i.id === id);
    const other = list[idx + dir];
    if (!other) return;
    const a = items.findIndex((i) => i.id === id);
    const b = items.findIndex((i) => i.id === other.id);
    const next = [...items];
    [next[a], next[b]] = [next[b]!, next[a]!];
    save(next);
  };
  return (
    <ul className="map-list">
      {list.map((i, idx) => (
        <li key={i.id} className={i.done ? "done" : ""}>
          <input type="checkbox" checked={i.done} aria-label={`Done: ${i.title}`} onChange={() => update(i.id, { done: !i.done })} />
          <input type="text" className="map-title" aria-label="Title" value={i.title} onChange={(e) => update(i.id, { title: e.target.value })} />
          <select
            aria-label={`Week for ${i.title}`}
            value={i.phase === 2 ? "p2" : i.week ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              update(i.id, v === "p2" ? { phase: 2, week: undefined } : { phase: undefined, week: v ? Number(v) : undefined });
            }}
          >
            <option value="">No week</option>
            {Array.from({ length: cfg.weeks }, (_, w) => (
              <option key={w + 1} value={w + 1}>
                Week {w + 1}
              </option>
            ))}
            <option value="p2">Phase 2</option>
          </select>
          <span className="map-btns">
            <button className="btn small-btn" aria-label={`Move ${i.title} up`} disabled={idx === 0} onClick={() => move(i.id, -1)}>
              ↑
            </button>
            <button className="btn small-btn" aria-label={`Move ${i.title} down`} disabled={idx === list.length - 1} onClick={() => move(i.id, 1)}>
              ↓
            </button>
            <button className="btn small-btn" aria-label={`Remove ${i.title}`} onClick={() => confirm(`Remove "${i.title}"?`) && save(items.filter((x) => x.id !== i.id))}>
              ✕
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

function AddItem({ onAdd }: { onAdd: (i: OssuItem) => void }) {
  const [f, setF] = useState({ title: "", track: "", kind: "course" as OssuItem["kind"] });
  return (
    <div className="txform" style={{ marginTop: 10 }}>
      <input type="text" aria-label="New item title" placeholder="Course or project title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <input type="text" aria-label="Track" placeholder="Track (e.g. SQL)" value={f.track} onChange={(e) => setF({ ...f, track: e.target.value.toUpperCase() })} />
      <select aria-label="Kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as OssuItem["kind"] })}>
        <option value="course">Course</option>
        <option value="project">Project</option>
        <option value="homework">Homework</option>
      </select>
      <button
        className="btn primary"
        disabled={!f.title.trim()}
        onClick={() => {
          onAdd({ id: `custom:${newId()}`, kind: f.kind, track: f.track.trim() || "OTHER", title: f.title.trim(), done: false });
          setF({ ...f, title: "" });
        }}
      >
        Add item
      </button>
    </div>
  );
}

/** This syllabus week's day-by-day plan (Sun–Sat), today highlighted. */
function SyllabusWeek({ ctx }: { ctx: RunCtx }) {
  const today = syllabusDay(ctx.clock.today);
  const [shown, setShown] = useState(today?.week ?? (ctx.clock.today < "2026-11-01" ? 1 : OSSU_WEEKS.length));
  const w = OSSU_WEEKS[shown - 1]!;
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <Card
      title={`Syllabus Week ${w.week}: ${w.title}`}
      right={
        <span className="daynav">
          <button className="btn icon small-btn" disabled={shown <= 1} onClick={() => setShown(shown - 1)} aria-label="Previous syllabus week">
            ‹
          </button>
          <button className="btn icon small-btn" disabled={shown >= OSSU_WEEKS.length} onClick={() => setShown(shown + 1)} aria-label="Next syllabus week">
            ›
          </button>
        </span>
      }
    >
      <ol className="sylweek">
        {w.days.map((d, i) => {
          const isToday = today?.week === w.week && today.dow === i;
          return (
            <li key={i} className={`${isToday ? "today" : ""}${d === "Off" ? " off" : ""}`}>
              <span className="mono">{DOW[i]}</span>
              <span>
                {d}
                {isToday && <b className="good-text"> · today</b>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="small">Tip: {w.tip}</p>
    </Card>
  );
}

// ---------------------------------------------------------------- reading

function Reading({ ctx }: { ctx: RunCtx }) {
  const { inputs, cfg, clock, settings, run } = ctx;
  const r = readingProgress(inputs, cfg, clock.today, settings.book3);
  const plan = planFor(clock.today, cfg, settings.book3);
  const readToday = run.days[clock.today]?.habits.read;
  return (
    <Card title="Reading">
      {plan.reading && (
        <p style={{ marginTop: 0 }}>
          Today: <b>{plan.reading.book}</b> · {plan.reading.chapter}{" "}
          <span className={readToday ? "good-text" : "small"}>{readToday ? "✓ read" : readToday === false ? "✗ missed" : "not logged yet"}</span>
        </p>
      )}
      <ul className="bars">
        {r.books.map((b) => (
          <li key={b.book} style={{ gridTemplateColumns: "1fr 90px" }}>
            <span className="lbl" style={{ color: b.active ? "var(--ink)" : undefined }}>
              {b.finished ? "✓ " : ""}
              {b.book}
            </span>
            <span className="mono val">
              {b.read}/{b.chapters}
              {b.plannedByNow > 0 && b.plannedByNow < b.chapters && b.read < b.plannedByNow ? <span className="warn-text"> ({b.plannedByNow - b.read} behind)</span> : ""}
            </span>
            <span className="track" aria-hidden="true" style={{ gridColumn: "1 / -1" }}>
              <span style={{ width: `${(b.read / b.chapters) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
      <p className="small">Finished: {r.finished.join(", ")}.</p>
      <p className="small">Each ✓ on the Read habit counts as one chapter of the book planned for that day.</p>
    </Card>
  );
}

// ---------------------------------------------------------------- commits

function Commits({ ctx }: { ctx: RunCtx }) {
  const { run, ev, clock, settings } = ctx;
  const gh = useGithubPushes(settings.githubUser);
  const decided = ev.days.filter((d) => d.status === "WON" || d.status === "LOST");
  const commitDays = decided.filter((d) => run.days[d.date]?.habits.commit === true).length;
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(clock.today, -i));
  return (
    <Card title="Commits" right={<span className="small">{commitDays}/{decided.length} days</span>}>
      <table className="ttable">
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Logged</th>
            <th scope="col">GitHub (public)</th>
          </tr>
        </thead>
        <tbody>
          {last7.map((d) => {
            const v = run.days[d]?.habits.commit;
            const p = gh.pushes[d] ?? 0;
            return (
              <tr key={d}>
                <td>{fmtDate(d)}</td>
                <td>{v === true ? <span className="good-text">✓ yes</span> : v === false ? <span className="bad-text">✗ no</span> : <span className="small">—</span>}</td>
                <td className="mono">{settings.githubUser ? (p ? `${p} pushed` : "—") : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {settings.githubUser ? (
        <p className="small">
          Checking public pushes for <b>{settings.githubUser}</b>
          {gh.loading ? "…" : ""}. {gh.error ? <span className="warn-text">{gh.error}. </span> : ""}Private repos don't show up here, so the manual check on Today is what counts.
        </p>
      ) : (
        <p className="small">Add your GitHub username in Settings to get commit suggestions on Today. Only public repos are visible.</p>
      )}
    </Card>
  );
}
