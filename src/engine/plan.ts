// "Planned today": workout, meals, reading and holidays for a date, from config.
import {
  HOLIDAYS,
  MEAL_CYCLES,
  PHASE2_START,
  READING_PLAN,
  WEEKEND_RESTAURANTS,
  WORKOUTS,
  type RunConfig,
} from "../config/run.config";
import { dayNumber, weekOf, weekday, weekCount } from "./dates";
import { syllabusDay } from "./learn";
import type { ISODate } from "./types";

export const mealCycleForWeek = (week: number): number => (((week - 1) % MEAL_CYCLES.length) + MEAL_CYCLES.length) % MEAL_CYCLES.length + 1;

export interface DayPlan {
  dayNum: number;
  week: number;
  workout: string;
  meal: { kind: "prep"; cycle: number; lunch: string; dinner: string } | { kind: "restaurant"; name: string };
  batchCookCycle?: number;
  reading?: { book: string; chapter: string };
  holiday?: string;
  phase2: boolean;
  /** Syllabus focus for this day (OSSU weeks 1–7). */
  study?: { week: number; title: string; focus: string };
}

export function planFor(date: ISODate, cfg: RunConfig, book3Title?: string): DayPlan {
  const dayNum = dayNumber(date, cfg);
  const week = weekOf(dayNum);
  const dow = weekday(date);
  let meal: DayPlan["meal"];
  let batchCookCycle: number | undefined;
  if (dayNum < 1) {
    meal = { kind: "restaurant", name: "Setup day" };
    batchCookCycle = 1;
  } else if (dow === 0 || dow === 6) {
    const r = week % 2 === 1 ? WEEKEND_RESTAURANTS.odd : WEEKEND_RESTAURANTS.even;
    meal = { kind: "restaurant", name: dow === 6 ? r.sat : r.sun };
    if (dow === 0 && week < weekCount(cfg)) batchCookCycle = mealCycleForWeek(week + 1);
  } else {
    const c = MEAL_CYCLES[mealCycleForWeek(week) - 1]!;
    meal = { kind: "prep", cycle: c.cycle, lunch: c.lunch, dinner: c.dinner };
  }
  const rp = READING_PLAN.find((r) => dayNum >= r.fromDay && dayNum <= r.toDay);
  const reading = rp && {
    book: rp.editable && book3Title ? book3Title : rp.book,
    chapter: `${rp.unit} ${rp.firstChapter + dayNum - rp.fromDay}`,
  };
  return {
    dayNum,
    week,
    workout: WORKOUTS[dow]!,
    meal,
    batchCookCycle,
    reading,
    holiday: HOLIDAYS.find((h) => h.date === date)?.label,
    phase2: date >= PHASE2_START,
    study: syllabusDay(date),
  };
}
