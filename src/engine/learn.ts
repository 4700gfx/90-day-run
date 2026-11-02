// OSSU map progress, reading progress and GitHub push detection. Pure functions.
import { BOOKS_FINISHED, OSSU_SEED, OSSU_SYLLABUS_START, OSSU_WEEKS, READING_PLAN, type OssuItem, type RunConfig } from "../config/run.config";
import { dateForDay, dayNumber, diffDays, weekCount, weekday } from "./dates";
import type { ISODate, RunInputs } from "./types";

export interface OssuStatus {
  thisWeek: OssuItem[];
  overdue: OssuItem[]; // past its due day (or an earlier week) and not done
  done: number;
  total: number;
  byKind: Record<OssuItem["kind"], { done: number; total: number }>;
  onTrack: boolean;
  unassigned: number;
}

/** Items are Phase 2 when marked so or assigned past the run's last week. */
export const isPhase2 = (i: OssuItem, cfg: RunConfig) => i.phase === 2 || (i.week != null && i.week > weekCount(cfg));

export function ossuStatus(items: OssuItem[], week: number, cfg: RunConfig, todayNum?: number): OssuStatus {
  const p1 = items.filter((i) => !isPhase2(i, cfg));
  const late = (i: OssuItem) => (i.dueDay != null && todayNum != null ? i.dueDay < todayNum : i.week != null && i.week < week);
  const overdue = p1.filter((i) => !i.done && late(i));
  const byKind = { course: { done: 0, total: 0 }, project: { done: 0, total: 0 }, homework: { done: 0, total: 0 } };
  for (const i of p1) {
    byKind[i.kind].total++;
    if (i.done) byKind[i.kind].done++;
  }
  return {
    thisWeek: p1.filter((i) => i.week === week),
    overdue,
    done: p1.filter((i) => i.done).length,
    total: p1.length,
    byKind,
    onTrack: overdue.length === 0,
    unassigned: p1.filter((i) => i.week == null && !i.done).length,
  };
}

export interface BookProgress {
  book: string;
  chapters: number;
  read: number; // read-habit hits on this book's days
  plannedByNow: number;
  active: boolean;
  finished: boolean;
}

/** One chapter per day: progress = read hits on the book's planned days. */
export function readingProgress(inputs: RunInputs, cfg: RunConfig, today: ISODate, book3?: string): { books: BookProgress[]; finished: string[] } {
  const todayN = dayNumber(today, cfg);
  const books = READING_PLAN.map((r) => {
    const chapters = r.toDay - r.fromDay + 1;
    let read = 0;
    for (let n = r.fromDay; n <= r.toDay; n++) if (inputs.days[dateForDay(n, cfg)]?.habits.read === true) read++;
    return {
      book: r.editable && book3 ? book3 : r.book,
      chapters,
      read,
      plannedByNow: Math.max(0, Math.min(chapters, todayN - r.fromDay + 1)),
      active: todayN >= r.fromDay && todayN <= r.toDay,
      finished: read >= chapters,
    };
  });
  return { books, finished: [...BOOKS_FINISHED, ...books.filter((b) => b.finished).map((b) => b.book)] };
}

/** Public GitHub push events → pushes per local date. Private repos never appear here. */
export function pushesByDate(events: { type?: string; created_at?: string; payload?: { size?: number; commits?: unknown[] } }[], timezone: string): Record<ISODate, number> {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  const out: Record<ISODate, number> = {};
  for (const e of events) {
    if (e.type !== "PushEvent" || !e.created_at) continue;
    const d = fmt.format(new Date(e.created_at));
    out[d] = (out[d] ?? 0) + (e.payload?.size ?? e.payload?.commits?.length ?? 1);
  }
  return out;
}

/** The syllabus week/day a date falls on (weeks run Sun–Sat from Sun Nov 1), if any. */
export function syllabusDay(date: string): { week: number; title: string; focus: string; tip: string; dow: number } | undefined {
  const d = diffDays(date, OSSU_SYLLABUS_START);
  if (d < 0) return undefined;
  const w = OSSU_WEEKS[Math.floor(d / 7)];
  if (!w) return undefined;
  const dow = weekday(date);
  return { week: w.week, title: w.title, focus: w.days[dow]!, tip: w.tip, dow };
}

/**
 * Bring an already-edited map up to the syllabus: syllabus items replace the old seed,
 * anything ticked done stays done, and custom items are kept.
 */
export function mergeSyllabus(existing: OssuItem[]): OssuItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  const seeded = OSSU_SEED.map((s) => {
    const e = byId.get(s.id);
    return e ? { ...s, done: s.done || e.done } : s;
  });
  return [...seeded, ...existing.filter((i) => i.id.startsWith("custom:"))];
}

export const hasSyllabus = (items: OssuItem[] | undefined) => !!items?.some((i) => i.id === "proj:midterm");
