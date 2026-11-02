// OSSU map progress, reading progress and GitHub push detection. Pure functions.
import { BOOKS_FINISHED, READING_PLAN, type OssuItem, type RunConfig } from "../config/run.config";
import { dateForDay, dayNumber, weekCount } from "./dates";
import type { ISODate, RunInputs } from "./types";

export interface OssuStatus {
  thisWeek: OssuItem[];
  overdue: OssuItem[]; // assigned to an earlier week and not done
  done: number;
  total: number;
  onTrack: boolean;
  unassigned: number;
}

/** Items are Phase 2 when marked so or assigned past the run's last week. */
export const isPhase2 = (i: OssuItem, cfg: RunConfig) => i.phase === 2 || (i.week != null && i.week > weekCount(cfg));

export function ossuStatus(items: OssuItem[], week: number, cfg: RunConfig): OssuStatus {
  const p1 = items.filter((i) => !isPhase2(i, cfg));
  const overdue = p1.filter((i) => i.week != null && i.week < week && !i.done);
  return {
    thisWeek: p1.filter((i) => i.week === week),
    overdue,
    done: p1.filter((i) => i.done).length,
    total: p1.length,
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
