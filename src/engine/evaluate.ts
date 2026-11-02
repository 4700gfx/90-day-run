// The rules engine. Pure: (inputs, config, today) → per-day results + stats.
// The UI must never re-implement any of this.
import { GRACE_HABITS, TOGGLE_HABITS, type HabitId, type RunConfig } from "../config/run.config";
import { dateForDay, dayNumber, tokenBlockOf, weekCount, weekOf, weekRange } from "./dates";
import { allowanceToDate, hysaStatus, monthToDateSpend, spendOn, spendOutcome } from "./money";
import type { DayLog, DayResult, DayStatus, GraceResult, ISODate, Outcome, RunInputs } from "./types";

export const isFullyLogged = (log: DayLog | undefined): boolean =>
  !!log && TOGGLE_HABITS.every((h) => log.habits[h] === true || log.habits[h] === false);

/** Past days: anything not marked a hit is a miss. Today: unknown until fully logged. */
function outcome(h: HabitId, log: DayLog | undefined, isToday: boolean, cfg: RunConfig): Outcome {
  const pendingToday = isToday && !isFullyLogged(log);
  if (h === "apply") {
    if ((log?.appliesCount ?? 0) >= cfg.applyTarget) return "hit";
    return pendingToday ? "unknown" : "miss";
  }
  const v = log?.habits[h];
  if (v === true) return "hit";
  if (v === false) return "miss";
  return pendingToday ? "unknown" : "miss";
}

export interface RunEvaluation {
  today: ISODate;
  todayNum: number;
  prep: DayResult;
  days: DayResult[]; // index 0 = Day 1
  byDate: Record<ISODate, DayResult>;
}

export function evaluateRun(inputs: RunInputs, cfg: RunConfig, today: ISODate): RunEvaluation {
  const todayNum = dayNumber(today, cfg);
  const misses = new Map<string, number>(); // `${week}|${habit}` → misses so far
  const tokenUsed = new Map<number, { dayNum: number; habit: HabitId }>(); // block → use
  const prevMiss: Partial<Record<HabitId, boolean>> = {};

  const build = (dayNum: number): DayResult => {
    const date = dateForDay(dayNum, cfg);
    const log = inputs.days[date];
    const week = weekOf(dayNum);
    const isToday = dayNum === todayNum;
    const mtd = monthToDateSpend(inputs.spend, date);
    const allowance = allowanceToDate(date, cfg);
    const base = {
      date,
      dayNum,
      week,
      floorDay: !!log?.floorDay,
      logged: !!log,
      fullyLogged: isFullyLogged(log),
      spend: { today: spendOn(inputs.spend, date), monthToDate: mtd, allowance, remaining: allowance - mtd },
    };
    if (dayNum > todayNum || dayNum < 1) {
      return {
        ...base,
        status: dayNum < 1 ? "PREP" : "FUTURE",
        strict: { workout: "unknown", spend: "unknown", hysa: "na" },
        grace: {},
        tokenPrompt: [],
      };
    }

    // Grace habits, evaluated in calendar order so "consecutive" spans week boundaries.
    const grace: Record<string, GraceResult> = {};
    const tokenPrompt: HabitId[] = [];
    const block = tokenBlockOf(week);
    for (const h of GRACE_HABITS) {
      const o = outcome(h, log, isToday, cfg);
      if (o !== "miss") {
        grace[h] = { kind: o };
        prevMiss[h] = false;
        continue;
      }
      const key = `${week}|${h}`;
      const count = misses.get(key) ?? 0;
      let r: GraceResult;
      if (prevMiss[h]) r = { kind: "illegal", reason: "consecutive" };
      else if (count === 0) r = { kind: "grace" };
      else if (count === 1 && !tokenUsed.has(block)) {
        if (log?.extendedGraceUsedFor === h) {
          tokenUsed.set(block, { dayNum, habit: h });
          r = { kind: "extended" };
        } else {
          r = { kind: "illegal", reason: "needs_token" };
          tokenPrompt.push(h);
        }
      } else r = { kind: "illegal", reason: "week_limit" };
      grace[h] = r;
      misses.set(key, count + 1);
      prevMiss[h] = true;
    }

    const strict = {
      workout: outcome("workout", log, isToday, cfg),
      spend: spendOutcome(inputs.spend, date, cfg),
      hysa: hysaStatus(inputs.hysa, date, today, cfg),
    };

    let status: DayStatus;
    if (isToday && !base.fullyLogged) status = "PENDING";
    else if (
      strict.workout === "miss" ||
      strict.spend === "miss" ||
      strict.hysa === "miss" ||
      Object.values(grace).some((g) => g.kind === "illegal")
    )
      status = "LOST";
    else if (strict.hysa === "pending") status = "PENDING";
    else status = "WON";

    return { ...base, status, strict, grace, tokenPrompt };
  };

  const prep = build(0);
  const days: DayResult[] = [];
  for (let n = 1; n <= cfg.lengthDays; n++) days.push(build(n));
  const byDate: Record<ISODate, DayResult> = { [prep.date]: prep };
  days.forEach((d) => (byDate[d.date] = d));
  return { today, todayNum, prep, days, byDate };
}

// ---------------------------------------------------------------- Derived stats

export interface RunStats {
  wonDays: number;
  lostDays: number;
  decidedDays: number;
  winRate: number;
  currentStreak: number;
  longestStreak: number;
  habitPct: Record<HabitId, number | null>;
}

export function runStats(ev: RunEvaluation): RunStats {
  const decided = ev.days.filter((d) => d.status === "WON" || d.status === "LOST");
  const wonDays = decided.filter((d) => d.status === "WON").length;

  // PENDING days (today, or a payday awaiting its deposit) are neutral for streaks.
  let longest = 0;
  let run = 0;
  for (const d of ev.days) {
    if (d.status === "WON") longest = Math.max(longest, ++run);
    else if (d.status === "LOST") run = 0;
  }
  let current = 0;
  for (let i = Math.min(ev.todayNum, ev.days.length) - 1; i >= 0; i--) {
    const s = ev.days[i]!.status;
    if (s === "WON") current++;
    else if (s === "PENDING") continue;
    else break;
  }

  const habitPct = {} as Record<HabitId, number | null>;
  const all: HabitId[] = ["workout", "spend", "hysa", ...GRACE_HABITS];
  for (const h of all) {
    let hit = 0;
    let total = 0;
    for (const d of decided) {
      const o: string =
        h === "workout" ? d.strict.workout : h === "spend" ? d.strict.spend : h === "hysa" ? d.strict.hysa : d.grace[h]?.kind ?? "unknown";
      if (o === "hit") hit++;
      if (o === "hit" || o === "miss" || o === "grace" || o === "extended" || o === "illegal") total++;
    }
    habitPct[h] = total ? hit / total : null;
  }

  return {
    wonDays,
    lostDays: decided.length - wonDays,
    decidedDays: decided.length,
    winRate: decided.length ? wonDays / decided.length : 0,
    currentStreak: current,
    longestStreak: longest,
    habitPct,
  };
}

export interface WeekSummary {
  week: number;
  days: number;
  won: number;
  floorDays: number;
  /** Per grace habit: misses this week and legal misses left (base 1 per week). */
  grace: Record<string, { misses: number; remaining: number; broken: boolean }>;
  token: { block: number; used: { dayNum: number; habit: HabitId } | null };
  spend: { total: number };
}

export function weekSummary(ev: RunEvaluation, week: number, cfg: RunConfig): WeekSummary {
  const { first, last, days } = weekRange(week, cfg);
  const slice = ev.days.slice(first - 1, last);
  const block = tokenBlockOf(week);
  const grace: WeekSummary["grace"] = {};
  for (const h of GRACE_HABITS) {
    const rs = slice.map((d) => d.grace[h]).filter(Boolean) as GraceResult[];
    const missCount = rs.filter((r) => r.kind !== "hit" && r.kind !== "unknown").length;
    grace[h] = {
      misses: missCount,
      remaining: Math.max(0, 1 - missCount),
      broken: rs.some((r) => r.kind === "illegal"),
    };
  }
  let used: WeekSummary["token"]["used"] = null;
  for (const d of ev.days) {
    if (tokenBlockOf(d.week) !== block) continue;
    for (const [h, r] of Object.entries(d.grace)) if (r.kind === "extended") used = { dayNum: d.dayNum, habit: h as HabitId };
  }
  return {
    week,
    days,
    won: slice.filter((d) => d.status === "WON").length,
    floorDays: slice.filter((d) => d.floorDay && d.dayNum <= ev.todayNum).length,
    grace,
    token: { block, used },
    spend: { total: slice.reduce((s, d) => s + d.spend.today, 0) },
  };
}

/** Extended Grace tokens across the run (1 per block, 7 total for 90 days). */
export function tokenSummary(ev: RunEvaluation, cfg: RunConfig) {
  const total = tokenBlockOf(weekCount(cfg));
  const used = new Set<number>();
  for (const d of ev.days) if (Object.values(d.grace).some((r) => r.kind === "extended")) used.add(tokenBlockOf(d.week));
  return { total, used: used.size, remaining: total - used.size };
}

/** True when the week and the one before it each had 3+ Floor Days. */
export function floorDayAlert(ev: RunEvaluation, week: number, cfg: RunConfig): boolean {
  if (week < 2) return false;
  return weekSummary(ev, week, cfg).floorDays >= 3 && weekSummary(ev, week - 1, cfg).floorDays >= 3;
}

/** Convenience used by the UI to decide whether to ask "Use Extended Grace for {habit}?" */
export const needsTokenPrompt = (ev: RunEvaluation, date: ISODate): HabitId[] => ev.byDate[date]?.tokenPrompt ?? [];
