import type { RunConfig } from "../config/run.config";
import { addDays, dayOfMonth, monthKey } from "./dates";
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
