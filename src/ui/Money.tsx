import { useState } from "react";
import { COLLECTION_STATUSES, SPEND } from "../config/run.config";
import {
  STATUS_LABEL,
  advance,
  emptyCollection,
  fundLedger,
  statusIndex,
  stepBack,
  type CollectionState,
  type CollectionStatus,
  type CollectionStep,
} from "../engine/collections";
import { addDays, daysInMonth, isLastDayOfMonth, monthKey } from "../engine/dates";
import { allowanceToDate, budgetFor, categoryTotals, hysaBalance, isPayday, monthEndSweep, monthToDateSpend, mtdSeries } from "../engine/money";
import type { HysaDeposit, SpendEntry } from "../engine/types";
import { K } from "../store/records";
import { put } from "../store/store";
import { addSpend, removeSpend, updateSpend } from "./actions";
import { MtdChart } from "./charts";
import { Card, fmtDate, money, newId } from "./common";
import type { RunCtx } from "./useRun";

const monthLabel = (d: string) => fmtDate(d, { month: "long", year: "numeric" });
const firstOf = (d: string) => `${monthKey(d)}-01`;
const lastOf = (d: string) => `${monthKey(d)}-${String(daysInMonth(d)).padStart(2, "0")}`;

export function Money({ ctx }: { ctx: RunCtx }) {
  const { cfg, clock } = ctx;
  const runEnd = addDays(cfg.startDate, cfg.lengthDays - 1);
  const months: string[] = [];
  for (let d = firstOf(cfg.prepDate); d <= runEnd; d = addDays(lastOf(d), 1)) months.push(d);
  const current = months.find((m) => monthKey(m) === monthKey(clock.today)) ?? months[clock.today < cfg.prepDate ? 0 : months.length - 1]!;
  const [month, setMonth] = useState(current);
  const mi = months.indexOf(month);

  return (
    <div className="screen">
      <header className="dayhead">
        <div>
          <div className="eyebrow">Money</div>
          <h1 className="daynum">{monthLabel(month)}</h1>
        </div>
        <div className="daynav">
          <button className="btn icon" disabled={mi <= 0} onClick={() => setMonth(months[mi - 1]!)} aria-label="Previous month">
            ‹
          </button>
          <button className="btn icon" disabled={mi >= months.length - 1} onClick={() => setMonth(months[mi + 1]!)} aria-label="Next month">
            ›
          </button>
        </div>
      </header>
      <SweepBanner ctx={ctx} />
      <div className="cols">
        <div className="col">
          <SpendOverview ctx={ctx} month={month} />
          <Categories ctx={ctx} month={month} />
          <Transactions ctx={ctx} month={month} />
        </div>
        <div className="col">
          <Hysa ctx={ctx} />
          <Collections ctx={ctx} />
          <Fund ctx={ctx} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- spend

function SpendOverview({ ctx, month }: { ctx: RunCtx; month: string }) {
  const { run, cfg, clock } = ctx;
  const through = clock.today < lastOf(month) ? clock.today : lastOf(month);
  const started = through >= month;
  const pts = started ? mtdSeries(run.spend, month, through, cfg) : [];
  const spent = started ? monthToDateSpend(run.spend, through) : 0;
  const allowed = started ? allowanceToDate(through, cfg) : 0;
  const pool = cfg.dailyAllowance * daysInMonth(month);
  return (
    <Card title="Month-to-date spend" right={<span className={`mono ${spent > allowed ? "bad-text" : "good-text"}`}>{spent > allowed ? `✗ ${money(spent - allowed)} over` : `✓ ${money(allowed - spent)} under`}</span>}>
      <div className="kv">
        <div>
          <b className="mono">{money(spent)}</b>
          <span>spent</span>
        </div>
        <div>
          <b className="mono">{money(allowed)}</b>
          <span>allowed to date</span>
        </div>
        <div>
          <b className="mono">{money(pool - spent)}</b>
          <span>left in {fmtDate(month, { month: "short" })} pool</span>
        </div>
      </div>
      {started ? <MtdChart points={pts} monthDays={daysInMonth(month)} daily={cfg.dailyAllowance} /> : <p className="small">This month hasn't started yet.</p>}
    </Card>
  );
}

function Categories({ ctx, month }: { ctx: RunCtx; month: string }) {
  const { run, profile } = ctx;
  const totals = categoryTotals(run.spend, month);
  const known = new Set(profile.spendCategories.map((c) => c.id));
  const other = Object.entries(totals).filter(([k]) => !known.has(k)).reduce((s, [, v]) => s + v, 0);
  return (
    <Card title="Categories" right={<span className="small">vs monthly budget</span>}>
      <ul className="catbars">
        {profile.spendCategories.map((c) => {
          const spent = totals[c.id] ?? 0;
          const budget = budgetFor(c, month);
          const ratio = budget ? spent / budget : 0;
          const tone = ratio > 1 ? "over" : ratio >= SPEND.hardCapWarnAt ? "warn" : "ok";
          return (
            <li key={c.id} className={`cat-${tone}`}>
              <span className="lbl">
                {c.label}
                {c.hardCap && <span className="tag t-strict">Hard cap</span>}
              </span>
              <span className="mono val">
                {tone === "over" ? "✗ " : tone === "warn" ? "! " : ""}
                {money(spent)} <span className="small">/ {money(budget)}</span>
              </span>
              <span className="track" aria-hidden="true">
                <span style={{ width: `${Math.min(1, ratio) * 100}%` }} />
              </span>
              {tone === "over" && <span className="small bad-text note">Over by {money(spent - budget)}</span>}
            </li>
          );
        })}
        {other > 0 && (
          <li className="cat-ok">
            <span className="lbl">Other (old or removed categories)</span>
            <span className="mono val">{money(other)}</span>
          </li>
        )}
      </ul>
      <p className="small">Budgets guide where the {money(ctx.cfg.dailyAllowance)}/day goes. Hard-capped categories warn at 80% and ask before going over.</p>
    </Card>
  );
}

function Transactions({ ctx, month }: { ctx: RunCtx; month: string }) {
  const { run, profile, clock } = ctx;
  const cats = profile.spendCategories;
  const entries = run.spend.filter((e) => !e.deleted && monthKey(e.date) === monthKey(month)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const [editing, setEditing] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? entries : entries.slice(0, 8);
  const defaultDate = monthKey(clock.today) === monthKey(month) ? clock.today : lastOf(month) < clock.today ? lastOf(month) : month;
  const [form, setForm] = useState({ date: defaultDate, amount: "", category: cats[0]?.id ?? "misc", note: "" });
  const catLabel = (id: string) => cats.find((c) => c.id === id)?.label ?? id;

  const add = () => {
    const a = Number(form.amount);
    if (!a || a <= 0) return;
    if (addSpend(ctx, { date: form.date, amount: a, category: form.category, note: form.note })) setForm({ ...form, amount: "", note: "" });
  };

  return (
    <Card title="Transactions" right={<span className="small">{entries.length}</span>}>
      <div className="txform">
        <input type="date" aria-label="Date" value={form.date} min={firstOf(month)} max={lastOf(month) < clock.today ? lastOf(month) : clock.today} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <input type="number" inputMode="decimal" aria-label="Amount" placeholder="$0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} />
        <select aria-label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <input type="text" aria-label="Note" placeholder="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn primary" disabled={!form.amount} onClick={add}>
          Add
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="small">No spending logged this month.</p>
      ) : (
        <ul className="entries">
          {shown.map((e) =>
            editing === e.id ? (
              <EditRow key={e.id} e={e} ctx={ctx} done={() => setEditing(null)} />
            ) : (
              <li key={e.id}>
                <span className="mono tx-date">{fmtDate(e.date, { month: "short", day: "numeric" })}</span>
                <span className="mono">{money(e.amount)}</span>
                <span className="grow">
                  {catLabel(e.category)}
                  {e.note && <span className="small"> · {e.note}</span>}
                </span>
                <button className="btn small-btn" onClick={() => setEditing(e.id)}>
                  Edit
                </button>
                <button className="btn small-btn" onClick={() => removeSpend(ctx, e)} aria-label={`Remove ${money(e.amount)} on ${fmtDate(e.date)}`}>
                  ✕
                </button>
              </li>
            ),
          )}
        </ul>
      )}
      {entries.length > 8 && (
        <button className="btn wide" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show latest 8" : `Show all ${entries.length}`}
        </button>
      )}
    </Card>
  );
}

function EditRow({ e, ctx, done }: { e: SpendEntry; ctx: RunCtx; done: () => void }) {
  const [f, setF] = useState({ date: e.date, amount: String(e.amount), category: e.category, note: e.note ?? "" });
  return (
    <li className="editrow">
      <input type="date" aria-label="Date" value={f.date} onChange={(x) => setF({ ...f, date: x.target.value })} />
      <input type="number" inputMode="decimal" aria-label="Amount" value={f.amount} onChange={(x) => setF({ ...f, amount: x.target.value })} />
      <select aria-label="Category" value={f.category} onChange={(x) => setF({ ...f, category: x.target.value })}>
        {ctx.profile.spendCategories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
        {!ctx.profile.spendCategories.some((c) => c.id === f.category) && <option value={f.category}>{f.category}</option>}
      </select>
      <input type="text" aria-label="Note" value={f.note} onChange={(x) => setF({ ...f, note: x.target.value })} />
      <button
        className="btn primary small-btn"
        onClick={() => {
          const a = Number(f.amount);
          if (a > 0 && f.date) updateSpend(ctx, e, { date: f.date, amount: Math.round(a * 100) / 100, category: f.category, note: f.note || undefined });
          done();
        }}
      >
        Save
      </button>
      <button className="btn small-btn" onClick={done}>
        Cancel
      </button>
    </li>
  );
}

// ---------------------------------------------------------------- month-end sweep

function SweepBanner({ ctx }: { ctx: RunCtx }) {
  const { run, cfg, clock, activeRunId } = ctx;
  if (!isLastDayOfMonth(clock.today)) return null;
  const s = monthEndSweep(run.spend, clock.today, cfg);
  const logged = run.hysa.some((d) => !d.deleted && d.kind === "bonus" && monthKey(d.date) === monthKey(clock.today));
  return (
    <div className="banner sweep" role="status">
      <span>
        Month-end sweep: {money(s.unspent)} unspent of the {money(s.pool)} {fmtDate(clock.today, { month: "long" })} pool.
        {s.unspent > 0 && !logged && " Move it to the HYSA as a bonus deposit."}
        {logged && " ✓ Bonus deposit logged."}
      </span>
      {s.unspent > 0 && !logged && (
        <button
          className="btn primary small-btn"
          onClick={() => {
            const id = newId();
            put(K.hysa(activeRunId, id), { id, date: clock.today, amount: s.unspent, kind: "bonus", updatedAt: new Date().toISOString() } satisfies HysaDeposit);
          }}
        >
          Log {money(s.unspent)} bonus
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- HYSA

function Hysa({ ctx }: { ctx: RunCtx }) {
  const { run, profile, cfg, clock, activeRunId } = ctx;
  const h = profile.hysa;
  const deposits = run.hysa.filter((d) => !d.deleted);
  const bal = hysaBalance(deposits);
  const scale = Math.max(h.stretch, h.targetDay90, bal) || 1;
  const pos = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  const [f, setF] = useState<{ date: string; amount: string; kind: HysaDeposit["kind"] }>({ date: clock.today, amount: String(cfg.paydayDeposit), kind: "payday" });
  const paydayToday = isPayday(clock.today, cfg) && !deposits.some((d) => d.kind !== "opening" && (d.date === clock.today || d.date === addDays(clock.today, -1)) && d.amount >= cfg.paydayDeposit);
  const nextPayday = cfg.paydays.find((d) => d >= clock.today);

  const add = () => {
    const a = Number(f.amount);
    if (!a || a <= 0) return;
    const id = newId();
    put(K.hysa(activeRunId, id), { id, date: f.date, amount: Math.round(a * 100) / 100, kind: f.kind, updatedAt: new Date().toISOString() } satisfies HysaDeposit);
  };

  return (
    <Card title={`HYSA · ${h.bank}`} right={<b className="mono">{money(bal)}</b>}>
      {paydayToday && (
        <div className="prompt" role="alert">
          <span>Payday: deposit {money(cfg.paydayDeposit)}+ today or tomorrow.</span>
        </div>
      )}
      <div className="goal" aria-label={`HYSA ${money(bal)} of ${money(h.targetDay90)} target, stretch ${money(h.stretch)}`}>
        <div className="goal-track">
          <span className="goal-fill" style={{ width: pos(bal) }} />
          {h.milestone && <span className="goal-mark m" style={{ left: pos(h.milestone.amount) }} />}
          <span className="goal-mark t" style={{ left: pos(h.targetDay90) }} />
        </div>
        <div className="goal-legend small">
          <span>
            {money(bal)} saved · {bal >= h.targetDay90 ? "✓ target reached" : `${money(h.targetDay90 - bal)} to the ${money(h.targetDay90)} target`}
          </span>
          <span>
            {h.milestone && <>◆ {money(h.milestone.amount)}: {h.milestone.label} · </>}┃ {money(h.targetDay90)} target · bar ends at the {money(h.stretch)} stretch
          </span>
        </div>
      </div>
      <p className="small">{nextPayday ? `Next payday: ${fmtDate(nextPayday)}.` : "Add paydays in Settings to get payday reminders."}</p>
      <div className="txform">
        <input type="date" aria-label="Deposit date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <input type="number" inputMode="decimal" aria-label="Deposit amount" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        <select aria-label="Deposit type" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as HysaDeposit["kind"] })}>
          <option value="payday">Payday</option>
          <option value="bonus">Bonus sweep</option>
          <option value="opening">Opening</option>
        </select>
        <button className="btn primary" onClick={add} disabled={!f.amount}>
          Log
        </button>
      </div>
      <ul className="entries">
        {[...deposits].reverse().map((d) => (
          <li key={d.id}>
            <span className="mono tx-date">{fmtDate(d.date, { month: "short", day: "numeric" })}</span>
            <span className="mono">{money(d.amount)}</span>
            <span className="grow small">{d.kind === "opening" ? "Opening" : d.kind === "bonus" ? "Bonus sweep" : "Payday"}</span>
            <button className="btn small-btn" aria-label={`Remove ${money(d.amount)} deposit on ${fmtDate(d.date)}`} onClick={() => put(K.hysa(activeRunId, d.id), { ...d, deleted: true, updatedAt: new Date().toISOString() })}>
              ✕
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------- collections

const STEP_FIELDS: Record<CollectionStatus, { amount?: string; tracking?: boolean; dateLabel: string }> = {
  not_started: { dateLabel: "" },
  validation_sent: { tracking: true, dateLabel: "Sent" },
  response_received: { dateLabel: "Received" },
  pfd_offer: { amount: "Offer", dateLabel: "Offer date" },
  paid: { amount: "Paid", dateLabel: "Paid on" },
  deletion_confirmed: { dateLabel: "Re-pull date" },
};

function Collections({ ctx }: { ctx: RunCtx }) {
  const { profile, run } = ctx;
  const accounts = [...profile.collections].sort((a, b) => a.order - b.order);
  const cleared = accounts.filter((a) => statusIndex(run.collections[a.id]?.status ?? "not_started") >= statusIndex("paid")).length;
  return (
    <Card title="Collections" right={<span className="small">{cleared} of {accounts.length} cleared</span>}>
      {accounts.length === 0 && <p className="small" style={{ marginTop: 0 }}>Import your profile in Settings to add your collection accounts.</p>}
      <div className="accounts">
        {accounts.map((a) => (
          <Account key={a.id} ctx={ctx} id={a.id} name={a.name} est={a.estAmount} target={a.targetDate} />
        ))}
      </div>
    </Card>
  );
}

function Account({ ctx, id, name, est, target }: { ctx: RunCtx; id: string; name: string; est: number; target?: string }) {
  const { run, clock, activeRunId } = ctx;
  const c: CollectionState = run.collections[id] ?? emptyCollection(id);
  const idx = statusIndex(c.status);
  const next = COLLECTION_STATUSES[idx + 1];
  const save = (v: CollectionState) => put(K.collection(activeRunId, id), { ...v, updatedAt: new Date().toISOString() });
  const editStep = (s: CollectionStatus, patch: CollectionStep) => save({ ...c, steps: { ...c.steps, [s]: { ...c.steps[s], ...patch } } });
  const cleared = idx >= statusIndex("paid");

  return (
    <details className={`account ${cleared ? "cleared" : ""}`}>
      <summary>
        <span className="acc-name">
          {cleared ? "✓ " : ""}
          {name}
        </span>
        <span className="small acc-meta">
          ~{money(est)}
          {target && ` · target ${fmtDate(target, { month: "short", day: "numeric" })}`}
        </span>
        <span className="pipe" aria-label={`Status: ${STATUS_LABEL[c.status]}`}>
          {COLLECTION_STATUSES.slice(1).map((s, i) => (
            <span key={s} className={i + 1 <= idx ? "on" : ""} title={STATUS_LABEL[s]} />
          ))}
        </span>
        <span className="tag t-muted">{STATUS_LABEL[c.status]}</span>
      </summary>
      <ol className="steps">
        {COLLECTION_STATUSES.slice(1).map((s) => {
          const si = statusIndex(s);
          const done = si <= idx;
          const isNext = si === idx + 1;
          if (!done && !isNext) return (
            <li key={s} className="step later">
              <span className="step-dot" aria-hidden="true" /> {STATUS_LABEL[s]}
            </li>
          );
          const f = STEP_FIELDS[s];
          const st = c.steps[s] ?? {};
          return (
            <li key={s} className={`step ${done ? "done" : "next"}`}>
              <div className="step-head">
                <span className="step-dot" aria-hidden="true">
                  {done ? "✓" : ""}
                </span>
                <b>{STATUS_LABEL[s]}</b>
                {isNext && (
                  <button className="btn primary small-btn" onClick={() => save(advance(c, s, clock.today))}>
                    Mark done
                  </button>
                )}
                {done && si === idx && (
                  <button className="btn small-btn" onClick={() => save(stepBack(c))}>
                    Undo
                  </button>
                )}
              </div>
              {done && (
                <div className="step-fields">
                  <label>
                    <span>{f.dateLabel}</span>
                    <input type="date" value={st.date ?? ""} onChange={(e) => editStep(s, { date: e.target.value || undefined })} />
                  </label>
                  {f.tracking && (
                    <label>
                      <span>Certified tracking #</span>
                      <input type="text" value={st.tracking ?? ""} onChange={(e) => editStep(s, { tracking: e.target.value || undefined })} />
                    </label>
                  )}
                  {f.amount && (
                    <label>
                      <span>{f.amount} ($)</span>
                      <input type="number" inputMode="decimal" value={st.amount ?? ""} onChange={(e) => editStep(s, { amount: e.target.value === "" ? undefined : Number(e.target.value) })} />
                    </label>
                  )}
                  <label>
                    <span>File / reference</span>
                    <input type="text" placeholder="e.g. Drive: letters/geico.pdf" value={st.fileRef ?? ""} onChange={(e) => editStep(s, { fileRef: e.target.value || undefined })} />
                  </label>
                  <label className="span2">
                    <span>Notes</span>
                    <input type="text" value={st.notes ?? ""} onChange={(e) => editStep(s, { notes: e.target.value || undefined })} />
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {next === undefined && <p className="small">All steps done.</p>}
    </details>
  );
}

// ---------------------------------------------------------------- collections fund

function Fund({ ctx }: { ctx: RunCtx }) {
  const { run, profile, clock, activeRunId } = ctx;
  const monthly = profile.collectionsFundMonthly;
  const rows = fundLedger(run.fund, run.collections, profile.collections);
  const balance = rows.length ? rows[rows.length - 1]!.balance : 0;
  const thisMonth = run.fund.some((d) => !d.deleted && monthKey(d.date) === monthKey(clock.today));
  const [amount, setAmount] = useState(String(monthly || ""));
  const [date, setDate] = useState(clock.today);
  const add = (amt: number, note: string, d = date) => {
    const id = newId();
    put(K.fund(activeRunId, id), { id, date: d, amount: amt, note, updatedAt: new Date().toISOString() });
  };
  return (
    <Card title="Collections fund" right={<b className={`mono ${balance < 0 ? "bad-text" : ""}`}>{money(balance)}</b>}>
      {monthly > 0 && !thisMonth && (
        <button className="btn primary wide" style={{ marginTop: 0 }} onClick={() => add(monthly, `${fmtDate(clock.today, { month: "long" })} deposit`, clock.today)}>
          Log {money(monthly)} for {fmtDate(clock.today, { month: "long" })}
        </button>
      )}
      <div className="txform">
        <input type="date" aria-label="Fund deposit date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="number" inputMode="decimal" aria-label="Fund deposit amount" value={amount} placeholder="$0" onChange={(e) => setAmount(e.target.value)} />
        <button className="btn" disabled={!Number(amount)} onClick={() => add(Math.round(Number(amount) * 100) / 100, "Deposit")}>
          Add deposit
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="small">Deposits go in here; payments come out automatically when you mark a collection Paid with an amount.</p>
      ) : (
        <table className="ttable ledger">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Item</th>
              <th scope="col">Amount</th>
              <th scope="col">Balance</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dep = run.fund.find((d) => d.id === r.id);
              return (
                <tr key={r.id}>
                  <td className="mono">{r.date ? fmtDate(r.date, { month: "short", day: "numeric" }) : "—"}</td>
                  <td>{r.label}</td>
                  <td className={`mono ${r.amount < 0 ? "bad-text" : ""}`}>{r.amount < 0 ? `−${money(-r.amount)}` : `+${money(r.amount)}`}</td>
                  <td className="mono">{money(r.balance)}</td>
                  <td>
                    {dep && (
                      <button className="btn small-btn" aria-label={`Remove fund deposit on ${fmtDate(r.date)}`} onClick={() => put(K.fund(activeRunId, dep.id), { ...dep, deleted: true, updatedAt: new Date().toISOString() })}>
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}
