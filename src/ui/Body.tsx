import { useEffect, useState } from "react";
import { LIFT_SLOTS, bodyStatus, liftValue, topSetLoad, type BodyCheck } from "../engine/body";
import { addDays, weekday } from "../engine/dates";
import { K } from "../store/records";
import { put } from "../store/store";
import { TrendChart } from "./charts";
import { Card, fmtDate } from "./common";
import type { RunCtx } from "./useRun";

/** Most recent Sunday on or before `d`. */
const lastSunday = (d: string) => addDays(d, -weekday(d));

export function Body({ ctx }: { ctx: RunCtx }) {
  const { run, profile, clock, activeRunId, lifts } = ctx;
  const entries = (run.body as (BodyCheck & { deleted?: boolean })[]).filter((e) => !e.deleted);
  const phase = run.bodyPhase.phase;
  const st = bodyStatus(entries, phase, profile);
  const b = profile.body;

  // 7 days of daily logs ending on a date → energy, protein and creatine.
  const dailyFor = (end: string) => {
    const days = Array.from({ length: 7 }, (_, i) => run.days[addDays(end, -i)]).filter(Boolean);
    const en = days.map((d) => d!.energy).filter((x): x is NonNullable<typeof x> => x != null);
    const pr = days.map((d) => d!.proteinG).filter((x): x is number => typeof x === "number");
    return {
      energy: en.length ? Math.round((en.reduce((a, c) => a + c, 0) / en.length) * 10) / 10 : undefined,
      protein: pr.length ? Math.round(pr.reduce((a, c) => a + c, 0) / pr.length) : undefined,
      creatine: days.filter((d) => d!.creatine).length,
    };
  };
  const week = dailyFor(clock.today);
  const setPhase = (p: "build" | "hold") => put(K.bodyPhase(activeRunId), { phase: p, since: clock.today });

  return (
    <div className="screen">
      <header className="dayhead">
        <div>
          <div className="eyebrow">Body</div>
          <h1 className="daynum">{phase === "build" ? "Build" : "Hold"}</h1>
        </div>
        <div className="seg" role="radiogroup" aria-label="Phase" style={{ minWidth: 180 }}>
          {(["build", "hold"] as const).map((p) => (
            <button key={p} role="radio" aria-checked={phase === p} className={phase === p ? "on" : ""} onClick={() => phase !== p && confirm(`Switch to ${p === "build" ? "Build" : "Hold"}?`) && setPhase(p)}>
              {p === "build" ? "Build" : "Hold"}
            </button>
          ))}
        </div>
      </header>
      {st.suggestHold && (
        <div className="prompt" role="alert">
          <span>Your 2-week average is {st.avg2} lb, at or above {b.buildToHoldAvg}. Time to switch to Hold?</span>
          <button className="btn primary small-btn" onClick={() => confirm("Switch to Hold?") && setPhase("hold")}>
            Switch to Hold
          </button>
        </div>
      )}
      {st.alerts.map((a) => (
        <div key={a.id} className="banner warn" role="status">
          ! {a.text}
        </div>
      ))}
      <div className="kv kv4">
        <div>
          <b className="mono">{st.latest?.weight ?? "—"}</b>
          <span>latest lb</span>
        </div>
        <div>
          <b className="mono">{st.avg2 ?? "—"}</b>
          <span>2-week avg</span>
        </div>
        <div>
          <b className="mono">{st.ratePerWeek != null ? `${st.ratePerWeek > 0 ? "+" : ""}${st.ratePerWeek}` : "—"}</b>
          <span>lb / week</span>
        </div>
        <div>
          <b className="mono">{st.latest?.waist ?? "—"}</b>
          <span>waist in</span>
        </div>
      </div>
      <div className="cols">
        <div className="col">
          <WeighIn ctx={ctx} entries={entries} defaultEnergy={(d) => dailyFor(d).energy} />
          <Card title="This week (daily logs)">
            <div className="kv">
              <div>
                <b className="mono">{week.protein ?? "—"}</b>
                <span>avg protein g{b.proteinTarget ? ` (target ${b.proteinTarget[0]}–${b.proteinTarget[1]})` : ""}</span>
              </div>
              <div>
                <b className="mono">{week.creatine}/7</b>
                <span>creatine days</span>
              </div>
              <div>
                <b className="mono">{week.energy ?? "—"}</b>
                <span>avg energy</span>
              </div>
            </div>
            <p className="small">Log protein, creatine and energy on Today; they roll up here.</p>
          </Card>
        </div>
        <div className="col">
          <Card title="Weight">
            <TrendChart label="Weight" unit=" lb" points={entries.filter((e) => e.weight != null).map((e) => ({ date: e.weekStart, value: e.weight! }))} band={b.holdRange} target={b.targetWeight} />
          </Card>
          <Card title="Waist">
            <TrendChart label="Waist" unit=" in" points={entries.filter((e) => e.waist != null).map((e) => ({ date: e.weekStart, value: e.waist! }))} />
          </Card>
          {LIFT_SLOTS.map((slot, i) => (
            <Card key={slot} title={lifts[i] ?? `Lift ${i + 1}`}>
              <TrendChart
                label={`${lifts[i] ?? `Lift ${i + 1}`} top set`}
                unit=" lb"
                points={entries.flatMap((e) => {
                  const v = liftValue(e, slot, i);
                  const load = topSetLoad(v);
                  return load != null ? [{ date: e.weekStart, value: load, note: v }] : [];
                })}
              />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function WeighIn({ ctx, entries, defaultEnergy }: { ctx: RunCtx; entries: BodyCheck[]; defaultEnergy: (d: string) => number | undefined }) {
  const { clock, activeRunId, lifts } = ctx;
  const [date, setDate] = useState(lastSunday(clock.today));
  const existing = entries.find((e) => e.weekStart === date);
  const blank = () => ({
    weight: existing?.weight?.toString() ?? "",
    waist: existing?.waist?.toString() ?? "",
    lifts: LIFT_SLOTS.map((s, i) => (existing ? liftValue(existing, s, i) ?? "" : "")),
    energy: (existing?.energyAvg ?? defaultEnergy(date))?.toString() ?? "",
  });
  const [f, setF] = useState(blank);
  useEffect(() => setF(blank()), [date, existing?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const num = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? undefined : Number(s));
  const save = () => {
    const e: BodyCheck = {
      weekStart: date,
      weight: num(f.weight),
      waist: num(f.waist),
      lifts: Object.fromEntries(LIFT_SLOTS.map((s, i) => [s, f.lifts[i]!.trim()]).filter(([, v]) => v)),
      energyAvg: num(f.energy),
      updatedAt: new Date().toISOString(),
    };
    put(K.body(activeRunId, date), e);
  };

  return (
    <Card title="Weekly check-in" right={<span className="small">{existing ? "Editing saved entry" : "Sundays"}</span>}>
      <div className="grid2">
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} max={clock.today} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Energy avg (from daily logs)</span>
          <input type="number" inputMode="decimal" step="0.1" min="1" max="5" value={f.energy} onChange={(e) => setF({ ...f, energy: e.target.value })} />
        </label>
        <label className="field">
          <span>Weight (lb)</span>
          <input type="number" inputMode="decimal" step="0.1" value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} />
        </label>
        <label className="field">
          <span>Waist (in)</span>
          <input type="number" inputMode="decimal" step="0.25" value={f.waist} onChange={(e) => setF({ ...f, waist: e.target.value })} />
        </label>
        {LIFT_SLOTS.map((s, i) => (
          <label key={s} className="field">
            <span>{lifts[i] ?? `Lift ${i + 1}`} top set</span>
            <input type="text" placeholder="e.g. 185x5" value={f.lifts[i]} onChange={(e) => setF({ ...f, lifts: f.lifts.map((v, j) => (j === i ? e.target.value : v)) })} />
          </label>
        ))}
      </div>
      <div className="row-btns">
        <button className="btn primary" onClick={save} disabled={!f.weight && !f.waist && !f.lifts.some(Boolean)}>
          {existing ? "Update" : "Save"} {fmtDate(date, { month: "short", day: "numeric" })}
        </button>
        {existing && (
          <button className="btn" onClick={() => confirm(`Delete the ${fmtDate(date)} check-in?`) && put(K.body(activeRunId, date), { ...existing, deleted: true, updatedAt: new Date().toISOString() })}>
            Delete
          </button>
        )}
      </div>
      <p className="small">Rename the lifts in Settings. Alerts use your 2-week average and the hold range from your profile.</p>
    </Card>
  );
}
