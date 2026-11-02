// Calendar math on YYYY-MM-DD strings. Everything runs in UTC so results never
// depend on the device's timezone or DST.
import type { RunConfig } from "../config/run.config";
import type { ISODate } from "./types";

const DAY_MS = 86_400_000;

export function toUTC(d: ISODate): number {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, day);
}

export function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export const addDays = (d: ISODate, n: number): ISODate => fromUTC(toUTC(d) + n * DAY_MS);
export const diffDays = (a: ISODate, b: ISODate): number => Math.round((toUTC(a) - toUTC(b)) / DAY_MS);
/** 0 = Sunday … 6 = Saturday */
export const weekday = (d: ISODate): number => new Date(toUTC(d)).getUTCDay();
export const dayOfMonth = (d: ISODate): number => Number(d.slice(8, 10));
export const monthKey = (d: ISODate): string => d.slice(0, 7);
export const daysInMonth = (d: ISODate): number => {
  const [y, m] = d.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
export const isLastDayOfMonth = (d: ISODate): boolean => dayOfMonth(d) === daysInMonth(d);

/** Today's date in a given IANA timezone (defaults to the run's timezone). */
export function todayIn(timezone = "America/New_York", now = new Date()): ISODate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Day 0 = prep date, Day 1 = start date. Can be negative or > length outside the run. */
export const dayNumber = (d: ISODate, cfg: RunConfig): number => diffDays(d, cfg.startDate) + 1;
export const dateForDay = (n: number, cfg: RunConfig): ISODate => addDays(cfg.startDate, n - 1);
export const isInRun = (d: ISODate, cfg: RunConfig): boolean => {
  const n = dayNumber(d, cfg);
  return n >= 1 && n <= cfg.lengthDays;
};

/** Run Week n (Mon–Sun) for a scored day number; 0 for Day 0. */
export const weekOf = (dayNum: number): number => (dayNum < 1 ? 0 : Math.ceil(dayNum / 7));
export const weekCount = (cfg: RunConfig): number => Math.ceil(cfg.lengthDays / 7);
export function weekRange(week: number, cfg: RunConfig): { first: number; last: number; days: number } {
  const first = (week - 1) * 7 + 1;
  const last = Math.min(week * 7, cfg.lengthDays);
  return { first, last, days: last - first + 1 };
}

/** Extended Grace blocks: Weeks 1–2, 3–4, …, 11–12, then Week 13 alone. */
export const tokenBlockOf = (week: number): number => Math.ceil(week / 2);
export const tokenBlockCount = (cfg: RunConfig): number => tokenBlockOf(weekCount(cfg));
