import { useState } from "react";
import {
  DAY0_CHECKLIST,
  HABITS,
  MEAL_RESCUES_PER_WEEK,
  RUN,
  TOGGLE_HABITS,
  WORKOUT_FLOOR,
  type HabitId,
} from "../config/run.config";
import { addDays, dayNumber, weekOf, weekRange, dateForDay } from "../engine/dates";
import { weekSummary } from "../engine/evaluate";
import { isPayday } from "../engine/money";
import { planFor } from "../engine/plan";
import { SPEND } from "../config/run.config";
import { diffDays } from "../engine/dates";
import { capCheck } from "../engine/money";
import type { DayLog } from "../engine/types";
import { K } from "../store/records";
import { put } from "../store/store";
import { addSpend, clearDay, removeSpend } from "./actions";
import { Card, StatusChip, emptyLog, fmtDate, graceBadge, habitLabel, money, newId } from "./common";
import { StreakMap } from "./StreakMap";
import type { RunCtx } from "./useRun";

export function Today({ ctx, date, setDate }: { ctx: RunCtx; date: string; setDate: (d: string) => void }) {
  const { cfg, ev, stats, clock, settings } = ctx;
  const n = dayNumber(date, cfg);
  const isToday = date === clock.today;
  const minDate = cfg.prepDate;
  const lastDay = dateForDay(cfg.lengthDays, cfg);
  const todayClamped = clock.today < minDate ? minDate : clock.today > lastDay ? lastDay : clock.today;
  const maxDate = lastDay;
  const canPrev = date > minDate;
  const canNext = date < maxDate;
  const res = ev.byDate[date];
  const plan = planFor(date, cfg, settings.book3);
  const week = weekOf(n);

  const nav = (
    <div className="daynav" role="group" aria-label="Choose day">
      <button className="btn icon" onClick={() => setDate(addDays(date, -1))} disabled={!canPrev} aria-label="Previous day">
        ‹
      </button>
      <button className="btn" onClick={() => setDate(todayClamped)} disabled={date === todayClamped}>
        Today
      </button>
      <button className="btn icon" onClick={() => setDate(addDays(date, 1))} disabled={!canNext} aria-label="Next day">
        ›
      </button>
      <input type="date" aria-label="Jump to date" value={date} min={minDate} max={maxDate} onChange={(e) => e.target.value && setDate(e.target.value)} />
    </div>
  );

  const showReminder = isToday && clock.hm >= RUN.logReminderTime && res && res.status === "PENDING" && !res.fullyLogged;

  return (
    <div className="screen">
      <header className="dayhead">
        <div>
          <div className="eyebrow">
            {fmtDate(date, { weekday: "long", month: "short", day: "numeric" })}
            {week > 0 && ` · Week ${week}`}
            {plan.holiday && ` · ${plan.holiday}`}
          </div>
          <h1 className="daynum">
            {n < 1 ? "Day 0" : `Day ${n}`} <span className="of">/ {cfg.lengthDays}</span>
          </h1>
        </div>
        <div className="dayhead-right">
          {res && <StatusChip status={res.status} floor={res.floorDay} />}
          <div className="streak">
            <b className="mono">{stats.currentStreak}</b> day streak · best {stats.longestStreak}
          </div>
        </div>
      </header>
      {nav}
      {showReminder && (
        <div className="banner" role="status">
          It's after {fmtTime(RUN.logReminderTime)}: log tonight. Mark each habit ✓ or ✗ below.
        </div>
      )}
      {n < 1 ? (
        <Day0 ctx={ctx} date={date} />
      ) : date > clock.today ? (
        <FutureDay ctx={ctx} date={date} setDate={setDate} />
      ) : (
        <DayLogView ctx={ctx} date={date} setDate={setDate} />
      )}
    </div>
  );
}

const fmtTime = (hm: string) => {
  const [h, m] = hm.split(":").map(Number) as [number, number];
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

function Day0({ ctx, date }: { ctx: RunCtx; date: string }) {
  const { run, activeRunId } = ctx;
  const done = run.day0;
  return (
    <div className="cols">
      <Card title="Day 0 · Setup" right={<span className="small">Not scored</span>}>
        <p className="small">Get everything ready so Day 1 starts clean. This day never counts toward streaks or stats.</p>
        <ul className="checklist">
          {DAY0_CHECKLIST.map((c) => (
            <li key={c.id}>
              <button
                className={`habit ${done[c.id] ? "on" : ""}`}
                aria-pressed={!!done[c.id]}
                onClick={() => put(K.day0(activeRunId), { ...done, [c.id]: !done[c.id] })}
              >
                <span className="tick" aria-hidden="true">
                  {done[c.id] ? "✓" : ""}
                </span>
                <span className="hname">{c.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <SpendCard ctx={ctx} date={date} note="Spend on Day 0 still counts toward November's month-to-date total." />
    </div>
  );
}

function DayLogView({ ctx, date, setDate }: { ctx: RunCtx; date: string; setDate: (d: string) => void }) {
  const { run, cfg, ev, activeRunId, clock, settings } = ctx;
  const res = ev.byDate[date]!;
  const log: DayLog = run.days[date] ?? emptyLog(date);
  const n = res.dayNum;
  const ws = weekSummary(ev, res.week, cfg);
  const plan = planFor(date, cfg, settings.book3);
  const update = (patch: Partial<DayLog>) => put(K.day(activeRunId, date), { ...log, ...patch, updatedAt: new Date().toISOString() });
  const setHabit = (h: HabitId, v: boolean | null) => update({ habits: { ...log.habits, [h]: v } });
  const floor = log.floorDay;
  const unlogged = TOGGLE_HABITS.filter((h) => log.habits[h] !== true && log.habits[h] !== false);
  const isToday = date === clock.today;

  // Weekday rescue counter (1 per run week).
  const { first, last } = weekRange(res.week, cfg);
  let rescues = 0;
  for (let i = first; i <= last; i++) if (run.days[dateForDay(i, cfg)]?.mealRescue) rescues++;
  const weekday = plan.meal.kind === "prep";

  const floorText = (h: HabitId) => HABITS.find((x) => x.id === h)?.floor ?? "";
  const sub: Partial<Record<HabitId, string>> = {
    workout: floor ? WORKOUT_FLOOR : plan.workout,
    meals: floor
      ? floorText("meals")
      : plan.meal.kind === "prep"
        ? `Cycle ${plan.meal.cycle}: ${plan.meal.lunch} / ${plan.meal.dinner}`
        : `${plan.meal.name} order from the guide`,
    commit: floor ? floorText("commit") : plan.phase2 ? "Coursework commits count" : "Any repo, before lights out",
    read: floor ? floorText("read") : plan.reading ? `${plan.reading.book} · ${plan.reading.chapter}` : "One chapter",
  };

  const row = (h: HabitId) => {
    const v = log.habits[h];
    const def = HABITS.find((x) => x.id === h)!;
    const strict = def.rule === "strict";
    const badge = strict ? { text: "Strict", tone: "strict" } : graceBadge(res.grace[h], ws.grace[h]?.remaining ?? 0);
    return (
      <li key={h}>
        <button
          className={`habit ${v === true ? "on" : v === false ? "off" : ""}`}
          aria-pressed={v === true}
          onClick={() => setHabit(h, v === true ? false : true)}
        >
          <span className="tick" aria-hidden="true">
            {v === true ? "✓" : v === false ? "✗" : ""}
          </span>
          <span className="hbody">
            <span className="hname">
              {habitLabel(h)}
              <span className="sr-only">{v === true ? " (done)" : v === false ? " (missed)" : " (not logged)"}</span>
            </span>
            <span className="hsub">{sub[h]}</span>
          </span>
          <span className={`tag t-${badge.tone}`}>{badge.text}</span>
        </button>
        {h === "meals" && weekday && (
          <label className="inline-check">
            <input type="checkbox" checked={!!log.mealRescue} onChange={(e) => update({ mealRescue: e.target.checked })} />
            Rescue: one on-list restaurant order replaced a prepped meal ({rescues}/{MEAL_RESCUES_PER_WEEK} this week)
            {rescues > MEAL_RESCUES_PER_WEEK && <span className="warn-text"> · that's more than 1 this week</span>}
          </label>
        )}
      </li>
    );
  };

  const applies = log.appliesCount;
  const applyBadge = graceBadge(res.grace.apply, ws.grace.apply?.remaining ?? 0);
  const payday = isPayday(date, cfg);

  return (
    <div className="cols">
      <div className="col">
        <Card
          title="Habits"
          right={
            <label className="switch">
              <input type="checkbox" checked={floor} onChange={(e) => update({ floorDay: e.target.checked })} />
              <span>Floor Day</span>
            </label>
          }
        >
          {floor && <p className="small floor-note">Floor Day: each habit's minimum counts as a hit.</p>}
          <ul className="habits">
            {row("workout")}
            <li>
              <div className={`habit static ${res.strict.spend === "hit" ? "on" : res.strict.spend === "miss" ? "off" : ""}`}>
                <span className="tick" aria-hidden="true">
                  {res.strict.spend === "hit" ? "✓" : "✗"}
                </span>
                <span className="hbody">
                  <span className="hname">Spend under {money(cfg.dailyAllowance)}/day</span>
                  <span className="hsub">
                    {money(res.spend.monthToDate)} of {money(res.spend.allowance)} this month ·{" "}
                    {res.spend.today === 0 ? "zero-spend day" : `${money(res.spend.today)} today`}
                  </span>
                </span>
                <span className="tag t-strict">Strict</span>
              </div>
            </li>
            {payday && (
              <li>
                <div className={`habit static ${res.strict.hysa === "hit" ? "on" : res.strict.hysa === "miss" ? "off" : ""}`}>
                  <span className="tick" aria-hidden="true">
                    {res.strict.hysa === "hit" ? "✓" : res.strict.hysa === "miss" ? "✗" : "…"}
                  </span>
                  <span className="hbody">
                    <span className="hname">Payday: save to HYSA</span>
                    <span className="hsub">
                      {res.strict.hysa === "hit" ? "Deposit logged" : `${money(cfg.paydayDeposit)}+ today or tomorrow`}
                    </span>
                  </span>
                  {res.strict.hysa !== "hit" ? (
                    <button className="btn small-btn" onClick={() => logDeposit(ctx, date, cfg.paydayDeposit)}>
                      Log {money(cfg.paydayDeposit)}
                    </button>
                  ) : (
                    <span className="tag t-strict">Strict</span>
                  )}
                </div>
              </li>
            )}
            {row("meals")}
            {row("commit")}
            <li>
              <div className={`habit static ${applies >= cfg.applyTarget ? "on" : ""}`}>
                <span className="tick" aria-hidden="true">
                  {applies >= cfg.applyTarget ? "✓" : res.grace.apply?.kind && res.grace.apply.kind !== "unknown" && res.grace.apply.kind !== "hit" ? "✗" : ""}
                </span>
                <span className="hbody">
                  <span className="hname">Apply to {cfg.applyTarget} SWE jobs</span>
                  <span className="hsub">{floor ? "5 quick applies" : applies >= cfg.applyTarget ? "Done" : `${cfg.applyTarget - applies} to go`}</span>
                </span>
                <span className="stepper">
                  <button className="btn icon" aria-label="One fewer application" onClick={() => update({ appliesCount: Math.max(0, applies - 1) })}>
                    −
                  </button>
                  <span className="mono count" aria-live="polite">
                    {applies}/{cfg.applyTarget}
                  </span>
                  <button className="btn icon primary" aria-label="One more application" onClick={() => update({ appliesCount: Math.min(99, applies + 1) })}>
                    +
                  </button>
                </span>
              </div>
              <div className="row-tag">
                <span className={`tag t-${applyBadge.tone}`}>{applyBadge.text}</span>
              </div>
            </li>
            {row("read")}
          </ul>

          {res.tokenPrompt.map((h) => (
            <div key={h} className="prompt" role="alert">
              <span>
                That's a second {habitLabel(h).toLowerCase()} miss this week. Use Extended Grace for it?{" "}
                <span className="small">(1 token per 2-week block)</span>
              </span>
              <button className="btn primary" onClick={() => update({ extendedGraceUsedFor: h })}>
                Use token
              </button>
            </div>
          ))}
          {log.extendedGraceUsedFor && res.grace[log.extendedGraceUsedFor]?.kind === "extended" && (
            <div className="prompt ok">
              <span>Extended Grace used for {habitLabel(log.extendedGraceUsedFor).toLowerCase()}.</span>
              <button className="btn" onClick={() => update({ extendedGraceUsedFor: undefined })}>
                Undo
              </button>
            </div>
          )}

          {unlogged.length > 0 && (
            <button className="btn wide" onClick={() => update({ habits: { ...log.habits, ...Object.fromEntries(unlogged.map((h) => [h, false])) } })}>
              Finish day: mark the {unlogged.length} unlogged as missed
            </button>
          )}
          {res.status === "LOST" && (
            <label className="field">
              <span>What caused it? (one line)</span>
              <input type="text" value={log.lostReason ?? ""} placeholder="e.g. Worked late, skipped the gym" onChange={(e) => update({ lostReason: e.target.value })} />
            </label>
          )}
          {!isToday && n >= 1 && <p className="small">Editing a past day. Status updates instantly.</p>}
          {(run.days[date] || res.spend.today > 0) && (
            <button
              className="btn wide ghost-danger"
              onClick={() => {
                if (confirm(`Clear Day ${n} (${fmtDate(date)})?\n\nThis resets its habits, applies, check-in and notes, and removes that day's spend entries. HYSA deposits are kept.`)) clearDay(ctx, date);
              }}
            >
              Clear this day
            </button>
          )}
        </Card>
      </div>

      <div className="col">
        <Card title="Streak map" right={<span className="small">{ctx.stats.wonDays} won · {ctx.stats.lostDays} lost</span>}>
          <StreakMap ctx={ctx} onOpen={setDate} compact selected={date} />
        </Card>
        <PlannedCard plan={plan} ctx={ctx} />
        <SpendCard ctx={ctx} date={date} />
        <Card title="Check-in">
          <div className="field">
            <span id={`energy-${date}`}>Energy</span>
            <div className="seg" role="radiogroup" aria-labelledby={`energy-${date}`}>
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  role="radio"
                  aria-checked={log.energy === v}
                  className={log.energy === v ? "on" : ""}
                  onClick={() => update({ energy: log.energy === v ? undefined : (v as DayLog["energy"]) })}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="grid2">
            <label className="field">
              <span>Sleep (hours)</span>
              <input type="number" inputMode="decimal" step="0.5" min="0" max="16" value={log.sleepHours ?? ""} onChange={(e) => update({ sleepHours: e.target.value === "" ? undefined : Number(e.target.value) })} />
            </label>
            <label className="field">
              <span>Protein (g)</span>
              <input type="number" inputMode="numeric" min="0" value={log.proteinG ?? ""} onChange={(e) => update({ proteinG: e.target.value === "" ? undefined : Number(e.target.value) })} />
            </label>
          </div>
          <label className="inline-check">
            <input type="checkbox" checked={!!log.creatine} onChange={(e) => update({ creatine: e.target.checked })} /> Creatine taken
          </label>
          <label className="field">
            <span>Mood</span>
            <input type="text" value={log.mood ?? ""} placeholder="One word" onChange={(e) => update({ mood: e.target.value || undefined })} />
          </label>
          <label className="field">
            <span>Note</span>
            <textarea rows={2} value={log.note ?? ""} placeholder="What helped or what cost you today" onChange={(e) => update({ note: e.target.value || undefined })} />
          </label>
        </Card>
      </div>
    </div>
  );
}

function logDeposit(ctx: RunCtx, date: string, amount: number) {
  const id = newId();
  put(K.hysa(ctx.activeRunId, id), { id, date, amount, kind: "payday", updatedAt: new Date().toISOString() });
}

function PlannedCard({ plan, ctx }: { plan: ReturnType<typeof planFor>; ctx: RunCtx }) {
  return (
    <Card title="Planned today">
      <dl className="plan">
        <dt>Workout</dt>
        <dd>{plan.workout}</dd>
        <dt>Meals</dt>
        <dd>
          {plan.meal.kind === "prep" ? `Cycle ${plan.meal.cycle} prep: ${plan.meal.lunch} / ${plan.meal.dinner}` : plan.meal.name}
          {plan.batchCookCycle && <div className="small">Batch cook tonight: cycle {plan.batchCookCycle}</div>}
        </dd>
        {plan.reading && (
          <>
            <dt>Reading</dt>
            <dd>
              {plan.reading.book} · {plan.reading.chapter}
            </dd>
          </>
        )}
        <dt>Study</dt>
        <dd>{plan.phase2 ? "Coursework first, then push a commit" : "OSSU block 8:00–9:30 PM, then push a commit"}</dd>
      </dl>
      {ctx.cfg.paydays.length === 0 && <p className="small">Add your paydays in Settings so the HYSA habit is scored.</p>}
    </Card>
  );
}

function SpendCard({ ctx, date, note }: { ctx: RunCtx; date: string; note?: string }) {
  const { run, ev, profile, activeRunId, cfg } = ctx;
  const cats = profile.spendCategories;
  const [amount, setAmount] = useState("");
  const [cat, setCat] = useState(cats[0]?.id ?? "misc");
  const [memo, setMemo] = useState("");
  const entries = run.spend.filter((e) => e.date === date && !e.deleted);
  const res = ev.byDate[date];
  const mtd = res?.spend.monthToDate ?? 0;
  const allowance = res?.spend.allowance ?? 0;
  const remaining = allowance - mtd;
  const log = run.days[date];

  const add = () => {
    const a = Number(amount);
    if (!Number.isFinite(a) || a <= 0) return;
    if (!addSpend(ctx, { date, amount: a, category: cat, note: memo })) return;
    setAmount("");
    setMemo("");
  };
  const selCat = cats.find((c) => c.id === cat);
  const cap = selCat?.hardCap ? capCheck(run.spend, selCat, date, 0, SPEND.hardCapWarnAt) : null;

  return (
    <Card title="Spend" right={<span className={`mono ${remaining < 0 ? "bad-text" : "good-text"}`}>{money(remaining)} left</span>}>
      <div className="kv">
        <div>
          <b className="mono">{money(res?.spend.today ?? 0)}</b>
          <span>today</span>
        </div>
        <div>
          <b className="mono">{money(mtd)}</b>
          <span>month to date</span>
        </div>
        <div>
          <b className="mono">{money(allowance)}</b>
          <span>allowed to date</span>
        </div>
      </div>
      <div className="spend-form">
        <label className="sr-only" htmlFor={`amt-${date}`}>
          Amount
        </label>
        <input
          id={`amt-${date}`}
          className="amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          placeholder="$0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button className="btn primary" onClick={add} disabled={!amount}>
          Add
        </button>
      </div>
      <div className="chips" role="radiogroup" aria-label="Category">
        {cats.map((c) => (
          <button key={c.id} role="radio" aria-checked={cat === c.id} className={`chip ${cat === c.id ? "on" : ""}`} onClick={() => setCat(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      {cap && selCat && (
        <p className={`small ${cap.spent >= cap.budget ? "bad-text" : cap.spent >= cap.budget * SPEND.hardCapWarnAt ? "warn-text" : ""}`}>
          {cap.spent >= cap.budget ? "✗ " : cap.spent >= cap.budget * SPEND.hardCapWarnAt ? "! " : ""}
          {selCat.label}: {money(cap.spent)} of {money(cap.budget)} hard cap this month
        </p>
      )}
      <input type="text" className="wide" placeholder="Note (optional)" value={memo} onChange={(e) => setMemo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
      {entries.length === 0 ? (
        <button
          className={`btn wide ${log?.zeroSpend ? "on" : ""}`}
          aria-pressed={!!log?.zeroSpend}
          onClick={() => {
            const base = run.days[date] ?? emptyLog(date);
            put(K.day(activeRunId, date), { ...base, zeroSpend: !base.zeroSpend, updatedAt: new Date().toISOString() });
          }}
        >
          {log?.zeroSpend ? "✓ Zero-spend day logged" : "Zero-spend day"}
        </button>
      ) : (
        <ul className="entries">
          {entries.map((e) => (
            <li key={e.id}>
              <span className="mono">{money(e.amount)}</span>
              <span className="grow">
                {cats.find((c) => c.id === e.category)?.label ?? e.category}
                {e.note && <span className="small"> · {e.note}</span>}
              </span>
              <button className="btn small-btn" onClick={() => removeSpend(ctx, e)} aria-label={`Remove ${money(e.amount)}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {note && <p className="small">{note}</p>}
      {cfg.dailyAllowance !== 20 && <p className="small">Daily allowance overridden in Settings: {money(cfg.dailyAllowance)}.</p>}
    </Card>
  );
}

function FutureDay({ ctx, date, setDate }: { ctx: RunCtx; date: string; setDate: (d: string) => void }) {
  const plan = planFor(date, ctx.cfg, ctx.settings.book3);
  const days = diffDays(date, ctx.clock.today);
  return (
    <div className="cols">
      <div className="col">
        <Card title="Not started yet">
          <p className="small" style={{ marginTop: 0 }}>
            {days === 1 ? "This is tomorrow." : `This day is ${days} days away.`} You can log it once it starts. Here's the plan.
          </p>
        </Card>
        <PlannedCard plan={plan} ctx={ctx} />
      </div>
      <Card title="Streak map" right={<span className="small">{ctx.stats.wonDays} won · {ctx.stats.lostDays} lost</span>}>
        <StreakMap ctx={ctx} onOpen={setDate} compact selected={date} />
      </Card>
    </div>
  );
}
