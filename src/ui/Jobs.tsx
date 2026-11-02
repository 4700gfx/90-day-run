import { useState } from "react";
import { JOBS } from "../config/run.config";
import { dayNumber, weekOf, weekday } from "../engine/dates";
import { defaultFollowUp, jobStats, live, type JobApp, type JobStatus } from "../engine/jobs";
import { K } from "../store/records";
import { put } from "../store/store";
import { Card, fmtDate, newId } from "./common";
import type { RunCtx } from "./useRun";

type SortKey = "date" | "company" | "role" | "source" | "status" | "followUp";
const STATUSES = JOBS.statuses as JobStatus[];

export function Jobs({ ctx }: { ctx: RunCtx }) {
  const { run, cfg, clock, activeRunId } = ctx;
  const week = Math.max(1, weekOf(dayNumber(clock.today, cfg)));
  const s = jobStats(run.jobs, ctx.inputs, cfg, clock.today, week);
  const [view, setView] = useState<"table" | "board">("table");
  const jobs = live(run.jobs);
  const save = (j: JobApp) => put(K.job(activeRunId, j.id), { ...j, updatedAt: new Date().toISOString() });
  const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

  return (
    <div className="screen">
      <header className="dayhead">
        <div>
          <div className="eyebrow">Jobs</div>
          <h1 className="daynum">Pipeline</h1>
        </div>
        <div className="seg" role="radiogroup" aria-label="View" style={{ minWidth: 170 }}>
          {(["table", "board"] as const).map((v) => (
            <button key={v} role="radio" aria-checked={view === v} className={view === v ? "on" : ""} onClick={() => setView(v)}>
              {v === "table" ? "Table" : "Board"}
            </button>
          ))}
        </div>
      </header>
      {s.bottleneck && (
        <div className="banner warn" role="alert">
          ! {s.total} applications with a {pct(s.responseRate)} response rate. Your resume/portfolio is the bottleneck: fix that before adding volume.
        </div>
      )}
      {weekday(clock.today) === 0 && <div className="banner">Sunday: follow up on anything that replied.</div>}
      <div className="kv kv4">
        <div>
          <b className="mono">{s.total}</b>
          <span>applications</span>
        </div>
        <div>
          <b className="mono">
            {s.thisWeek}/{cfg.applyTarget * 7}
          </b>
          <span>this week</span>
        </div>
        <div>
          <b className="mono">{s.total ? pct(s.responseRate) : "—"}</b>
          <span>response rate</span>
        </div>
        <div>
          <b className="mono">{s.interviews}</b>
          <span>interviews</span>
        </div>
      </div>
      {s.followUpsDue.length > 0 && (
        <Card title="Follow-ups due" right={<span className="small">{s.followUpsDue.length}</span>}>
          <ul className="entries">
            {s.followUpsDue.map((j) => (
              <li key={j.id}>
                <span className="mono tx-date">{fmtDate(j.followUp!, { month: "short", day: "numeric" })}</span>
                <span className="grow">
                  <b>{j.company}</b> <span className="small">{j.role} · {j.status}</span>
                </span>
                <button className="btn small-btn" onClick={() => save({ ...j, followUp: defaultFollowUp(clock.today) })}>
                  Followed up
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <AddJob ctx={ctx} />
      {view === "table" ? <JobTable jobs={jobs} save={save} /> : <Board jobs={jobs} save={save} />}
      <p className="small">
        Applications count the Today counter or the jobs logged here for each day, whichever is higher. Response rate = companies that replied (including rejections) ÷ all applications.
      </p>
    </div>
  );
}

function AddJob({ ctx }: { ctx: RunCtx }) {
  const { clock, activeRunId } = ctx;
  const blank = () => ({ date: clock.today, company: "", role: "Software Engineer", source: JOBS.sources[0]!, link: "", notes: "" });
  const [f, setF] = useState(blank);
  const add = () => {
    if (!f.company.trim()) return;
    const id = newId();
    const j: JobApp = { id, date: f.date, company: f.company.trim(), role: f.role.trim() || "Software Engineer", source: f.source, link: f.link.trim() || undefined, status: "Applied", followUp: defaultFollowUp(f.date), notes: f.notes.trim() || undefined, updatedAt: new Date().toISOString() };
    put(K.job(activeRunId, id), j);
    setF({ ...blank(), date: f.date, source: f.source });
  };
  return (
    <Card title="Add application">
      <div className="jobform">
        <input type="text" aria-label="Company" placeholder="Company" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} />
        <input type="text" aria-label="Role" placeholder="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} />
        <select aria-label="Source" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
          {JOBS.sources.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <input type="date" aria-label="Date applied" value={f.date} max={clock.today} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <input type="url" aria-label="Link" placeholder="Link (optional)" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} />
        <button className="btn primary" disabled={!f.company.trim()} onClick={add}>
          Add
        </button>
      </div>
    </Card>
  );
}

function JobTable({ jobs, save }: { jobs: JobApp[]; save: (j: JobApp) => void }) {
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "date", dir: -1 });
  const [open, setOpen] = useState<string | null>(null);
  const sorted = [...jobs].sort((a, b) => {
    const va = (a[sort.k] ?? "") as string;
    const vb = (b[sort.k] ?? "") as string;
    const c = sort.k === "status" ? STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) : va.localeCompare(vb);
    return c * sort.dir;
  });
  const th = (k: SortKey, label: string) => (
    <th scope="col" aria-sort={sort.k === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button className="thbtn" onClick={() => setSort({ k, dir: sort.k === k ? (-sort.dir as 1 | -1) : 1 })}>
        {label}
        {sort.k === k ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );
  return (
    <Card title="Applications" right={<span className="small">{jobs.length} in pipeline</span>}>
      {jobs.length === 0 ? (
        <p className="small" style={{ marginTop: 0 }}>
          Nothing logged yet. Add one above, or after tapping + on Today.
        </p>
      ) : (
        <div className="scroll">
          <table className="ttable jobtable">
            <thead>
              <tr>
                {th("date", "Date")}
                {th("company", "Company")}
                {th("role", "Role")}
                {th("source", "Source")}
                {th("status", "Status")}
                {th("followUp", "Follow up")}
              </tr>
            </thead>
            <tbody>
              {sorted.map((j) => (
                <JobRow key={j.id} j={j} save={save} open={open === j.id} toggle={() => setOpen(open === j.id ? null : j.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function JobRow({ j, save, open, toggle }: { j: JobApp; save: (j: JobApp) => void; open: boolean; toggle: () => void }) {
  return (
    <>
      <tr>
        <td className="mono">{fmtDate(j.date, { month: "short", day: "numeric" })}</td>
        <td>
          <button className="linkbtn" onClick={toggle} aria-expanded={open}>
            {j.company}
          </button>
        </td>
        <td>{j.role}</td>
        <td>{j.source}</td>
        <td>
          <select aria-label={`Status for ${j.company}`} value={j.status} onChange={(e) => save({ ...j, status: e.target.value as JobStatus })}>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </td>
        <td>
          <input type="date" aria-label={`Follow-up for ${j.company}`} value={j.followUp ?? ""} onChange={(e) => save({ ...j, followUp: e.target.value || undefined })} />
        </td>
      </tr>
      {open && (
        <tr className="detailrow">
          <td colSpan={6}>
            <div className="jobedit">
              <label className="field">
                <span>Company</span>
                <input type="text" value={j.company} onChange={(e) => save({ ...j, company: e.target.value })} />
              </label>
              <label className="field">
                <span>Role</span>
                <input type="text" value={j.role} onChange={(e) => save({ ...j, role: e.target.value })} />
              </label>
              <label className="field">
                <span>Link</span>
                <input type="url" value={j.link ?? ""} onChange={(e) => save({ ...j, link: e.target.value || undefined })} />
              </label>
              <label className="field">
                <span>Source</span>
                <select value={j.source} onChange={(e) => save({ ...j, source: e.target.value })}>
                  {JOBS.sources.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="field span2">
                <span>Notes</span>
                <textarea rows={2} value={j.notes ?? ""} onChange={(e) => save({ ...j, notes: e.target.value || undefined })} />
              </label>
            </div>
            <div className="row-btns">
              {j.link && (
                <a className="btn small-btn" href={j.link} target="_blank" rel="noreferrer">
                  Open link ↗
                </a>
              )}
              <button className="btn small-btn" onClick={() => confirm(`Delete ${j.company}?`) && save({ ...j, deleted: true })}>
                Delete
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Board({ jobs, save }: { jobs: JobApp[]; save: (j: JobApp) => void }) {
  return (
    <div className="board" role="list" aria-label="Applications by status">
      {STATUSES.map((st, si) => {
        const col = jobs.filter((j) => j.status === st).sort((a, b) => (a.date < b.date ? 1 : -1));
        return (
          <section key={st} className="bcol" role="listitem" aria-label={`${st}: ${col.length}`}>
            <h3>
              {st} <span className="small">{col.length}</span>
            </h3>
            {col.map((j) => (
              <div key={j.id} className="bcard">
                <b>{j.company}</b>
                <span className="small">
                  {j.role} · {fmtDate(j.date, { month: "short", day: "numeric" })}
                </span>
                <div className="bmove">
                  <button className="btn small-btn" disabled={si === 0} aria-label={`Move ${j.company} to ${STATUSES[si - 1] ?? ""}`} onClick={() => save({ ...j, status: STATUSES[si - 1]! })}>
                    ‹
                  </button>
                  <button className="btn small-btn" disabled={si === STATUSES.length - 1} aria-label={`Move ${j.company} to ${STATUSES[si + 1] ?? ""}`} onClick={() => save({ ...j, status: STATUSES[si + 1]! })}>
                    ›
                  </button>
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
