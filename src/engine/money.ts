import type { SpendCategory } from "../config/profile";
import type { RunConfig } from "../config/run.config";
import { addDays, dayOfMonth, daysInMonth as dim, monthKey } from "./dates";
import type { HysaDeposit, HysaStatus, ISODate, Outcome, SpendEntry } from "./types";

const live = <T extends { deleted?: boolean }>(xs: T[]) => xs.filter((x) => !x.deleted);
const EPS = 0.001;

export const spendOn = (entries: SpendEntry[], date: ISODate): number =>
  live(entries).reduce((s, e) => (e.date === date ? s + e.amount : s), 0);

/** Calendar-month-to-date spend through `date` (Day 0 spend counts toward November). */
export function monthToDateSpend(entries: SpendEntry[], date: ISODate): number {
  const mk = monthKey(date);
  return live(entries).reduce((s, e) => (monthKey(e.date) === mk && e.date <= date ? s + e.amount : s), 0);
}

export const allowanceToDate = (date: ISODate, cfg: RunConfig): number => cfg.dailyAllowance * dayOfMonth(date);

/** Hit when MTD ≤ $20 × day-of-month. A zero-spend day is always a hit. */
export function spendOutcome(entries: SpendEntry[], date: ISODate, cfg: RunConfig): Outcome {
  if (spendOn(entries, date) <= EPS) return "hit";
  return monthToDateSpend(entries, date) <= allowanceToDate(date, cfg) + EPS ? "hit" : "miss";
}

export const isPayday = (date: ISODate, cfg: RunConfig): boolean => cfg.paydays.includes(date);

/**
 * Only scored on configured paydays. Hit if a non-opening deposit ≥ the payday
 * amount is logged that day or the next. Pending until the next day has passed.
 */
export function hysaStatus(deposits: HysaDeposit[], date: ISODate, today: ISODate, cfg: RunConfig): HysaStatus {
  if (!isPayday(date, cfg)) return "na";
  const next = addDays(date, 1);
  const ok = live(deposits).some(
    (d) => d.kind !== "opening" && (d.date === date || d.date === next) && d.amount + EPS >= cfg.paydayDeposit,
  );
  if (ok) return "hit";
  return today <= next ? "pending" : "miss";
}

export const hysaBalance = (deposits: HysaDeposit[], through?: ISODate): number =>
  live(deposits).reduce((s, d) => (!through || d.date <= through ? s + d.amount : s), 0);

// ---------------------------------------------------------------- budgets & charts


/** Monthly budget for a category in the month containing `date` (+bonus in 31-day months). */
export const budgetFor = (cat: SpendCategory, date: ISODate): number => cat.monthly + (dim(date) === 31 ? cat.bonus31 ?? 0 : 0);

/** Spend per category for the calendar month containing `date` (whole month). */
export function categoryTotals(entries: SpendEntry[], date: ISODate): Record<string, number> {
  const mk = monthKey(date);
  const out: Record<string, number> = {};
  for (const e of live(entries)) if (monthKey(e.date) === mk) out[e.category] = (out[e.category] ?? 0) + e.amount;
  return out;
}

export type CapLevel = "ok" | "warn" | "block";
/** Hard-cap check for adding `amount` to a category on `date`: warn at ≥80% of budget, block above 100%. */
export function capCheck(entries: SpendEntry[], cat: SpendCategory, date: ISODate, amount: number, warnAt = 0.8) {
  const budget = budgetFor(cat, date);
  const spent = categoryTotals(entries, date)[cat.id] ?? 0;
  const after = spent + amount;
  const level: CapLevel = !cat.hardCap ? "ok" : after > budget + EPS ? "block" : after + EPS >= budget * warnAt ? "warn" : "ok";
  return { budget, spent, after, level };
}

/** Cumulative month-to-date spend vs allowance, one point per day from the 1st through `through`. */
export function mtdSeries(entries: SpendEntry[], monthDate: ISODate, through: ISODate, cfg: RunConfig) {
  const first = `${monthKey(monthDate)}-01`;
  const out: { date: ISODate; day: number; spent: number; allowance: number }[] = [];
  for (let d = first, i = 1; monthKey(d) === monthKey(first) && d <= through; d = addDays(d, 1), i++) {
    out.push({ date: d, day: i, spent: monthToDateSpend(entries, d), allowance: allowanceToDate(d, cfg) });
  }
  return out;
}

/** Month-end sweep: the month's full allowance pool minus what was spent. */
export function monthEndSweep(entries: SpendEntry[], date: ISODate, cfg: RunConfig) {
  const pool = cfg.dailyAllowance * dim(date);
  const spent = Object.values(categoryTotals(entries, date)).reduce((a, b) => a + b, 0);
  return { pool, spent, unspent: Math.max(0, Math.round((pool - spent) * 100) / 100) };
}
