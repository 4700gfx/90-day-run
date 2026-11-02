import { describe, expect, it } from "vitest";
import { buildRunConfig, type HabitId, type RunConfig } from "../config/run.config";
import { addDays, dateForDay, dayNumber, tokenBlockCount, weekOf, weekRange, weekday } from "./dates";
import { evaluateRun, floorDayAlert, runStats, tokenSummary, weekSummary } from "./evaluate";
import { allowanceToDate, hysaStatus, monthToDateSpend, spendOutcome } from "./money";
import { planFor } from "./plan";
import type { DayLog, HysaDeposit, RunInputs, SpendEntry } from "./types";

// Explicit fixture so tests never depend on the (placeholder) profile.
const cfg = buildRunConfig(undefined, { dailyAllowance: 20, paydayDeposit: 500, paydays: [] });
const T = "2026-01-01T00:00:00.000Z";

/** A fully-logged winning day; pass habit overrides to miss things. */
function day(date: string, o: Partial<Record<HabitId, boolean>> = {}, extra: Partial<DayLog> = {}): DayLog {
  const habits = { workout: true, meals: true, commit: true, read: true, ...o };
  const appliesCount = o.apply === false ? 0 : 5;
  delete (habits as Record<string, boolean>).apply;
  return { date, habits, floorDay: false, appliesCount, updatedAt: T, ...extra };
}
/** Days 1..n all won, with per-day overrides by day number. */
function run(n: number, overrides: Record<number, Partial<Record<HabitId, boolean>>> = {}, extras: Record<number, Partial<DayLog>> = {}): RunInputs {
  const days: Record<string, DayLog> = {};
  for (let i = 1; i <= n; i++) {
    const d = dateForDay(i, cfg);
    days[d] = day(d, overrides[i], extras[i]);
  }
  return { days, spend: [], hysa: [] };
}
const spend = (date: string, amount: number, id = `${date}-${amount}`): SpendEntry => ({ id, date, amount, category: "misc", updatedAt: T });
const statusOf = (inputs: RunInputs, dayNum: number, today = dateForDay(90, cfg), c: RunConfig = cfg) =>
  evaluateRun(inputs, c, today).days[dayNum - 1]!;

describe("calendar", () => {
  it("Day 0 = Sun Nov 1, Day 1 = Mon Nov 2, Day 90 = Sat Jan 30, 2027", () => {
    expect(dateForDay(0, cfg)).toBe("2026-11-01");
    expect(weekday("2026-11-01")).toBe(0);
    expect(dateForDay(1, cfg)).toBe("2026-11-02");
    expect(weekday("2026-11-02")).toBe(1);
    expect(dateForDay(90, cfg)).toBe("2027-01-30");
    expect(weekday("2027-01-30")).toBe(6);
  });
  it("Run Week 1 = Nov 2–8, Week 13 is a 6-day week (Jan 25–30)", () => {
    expect(weekRange(1, cfg)).toEqual({ first: 1, last: 7, days: 7 });
    expect(dateForDay(7, cfg)).toBe("2026-11-08");
    const w13 = weekRange(13, cfg);
    expect(w13.days).toBe(6);
    expect(dateForDay(w13.first, cfg)).toBe("2027-01-25");
    expect(dateForDay(w13.last, cfg)).toBe("2027-01-30");
    expect(weekOf(dayNumber("2027-01-30", cfg))).toBe(13);
  });
  it("has 7 Extended Grace blocks (Weeks 1–2 … 11–12, then 13 alone)", () => {
    expect(tokenBlockCount(cfg)).toBe(7);
  });
  it("check-in and holiday days line up with the spec", () => {
    expect(dayNumber("2026-11-26", cfg)).toBe(25);
    expect(dayNumber("2026-12-01", cfg)).toBe(30);
    expect(dayNumber("2026-12-25", cfg)).toBe(54);
    expect(dayNumber("2026-12-31", cfg)).toBe(60);
    expect(dayNumber("2027-01-01", cfg)).toBe(61);
    expect(dayNumber("2027-01-04", cfg)).toBe(64);
  });
});

describe("Day 0", () => {
  it("is never scored and doesn't affect streaks or stats", () => {
    const inputs = run(3);
    inputs.days["2026-11-01"] = day("2026-11-01", { workout: false, meals: false, commit: false, read: false, apply: false });
    const ev = evaluateRun(inputs, cfg, dateForDay(3, cfg));
    expect(ev.prep.status).toBe("PREP");
    expect(ev.days[0]!.grace.meals?.kind).toBe("hit"); // Day 1 is not "consecutive" with Day 0
    const s = runStats(ev);
    expect(s.wonDays).toBe(3);
    expect(s.decidedDays).toBe(3);
    expect(s.currentStreak).toBe(3);
  });
  it("spend on Nov 1 still counts toward November month-to-date", () => {
    const inputs = run(1);
    inputs.spend.push(spend("2026-11-01", 30));
    expect(monthToDateSpend(inputs.spend, "2026-11-02")).toBe(30);
    // Allowance through Nov 2 is $40; $30 + $15 = $45 → over.
    inputs.spend.push(spend("2026-11-02", 15));
    expect(statusOf(inputs, 1).strict.spend).toBe("miss");
  });
});

describe("grace habits", () => {
  it("allows 1 non-consecutive miss per run week", () => {
    const ev = evaluateRun(run(7, { 2: { meals: false } }), cfg, dateForDay(7, cfg));
    expect(ev.days[1]!.grace.meals).toEqual({ kind: "grace" });
    expect(ev.days[1]!.status).toBe("WON");
  });
  it("a second miss in the same week is illegal without a token, and prompts for one", () => {
    const ev = evaluateRun(run(7, { 2: { read: false }, 5: { read: false } }), cfg, dateForDay(7, cfg));
    expect(ev.days[4]!.grace.read).toEqual({ kind: "illegal", reason: "needs_token" });
    expect(ev.days[4]!.tokenPrompt).toEqual(["read"]);
    expect(ev.days[4]!.status).toBe("LOST");
  });
  it("never allows two misses in a row, even across the Sun → Mon week boundary", () => {
    // Day 7 = Sun Nov 8 (end of Week 1), Day 8 = Mon Nov 9 (start of Week 2)
    const ev = evaluateRun(run(9, { 7: { commit: false }, 8: { commit: false } }), cfg, dateForDay(9, cfg));
    expect(ev.days[6]!.grace.commit).toEqual({ kind: "grace" });
    expect(ev.days[7]!.week).toBe(2);
    expect(ev.days[7]!.grace.commit).toEqual({ kind: "illegal", reason: "consecutive" });
    expect(ev.days[7]!.status).toBe("LOST");
  });
  it("a consecutive miss stays illegal even with a token confirmed", () => {
    const ev = evaluateRun(run(7, { 2: { meals: false }, 3: { meals: false } }, { 3: { extendedGraceUsedFor: "meals" } }), cfg, dateForDay(7, cfg));
    expect(ev.days[2]!.grace.meals).toEqual({ kind: "illegal", reason: "consecutive" });
    expect(tokenSummary(ev, cfg).used).toBe(0);
  });
  it("apply is a hit at 5+ and a miss below", () => {
    const inputs = run(2);
    inputs.days[dateForDay(1, cfg)]!.appliesCount = 4;
    const ev = evaluateRun(inputs, cfg, dateForDay(2, cfg));
    expect(ev.days[0]!.grace.apply).toEqual({ kind: "grace" });
    expect(ev.days[1]!.grace.apply).toEqual({ kind: "hit" });
  });
});

describe("Extended Grace tokens", () => {
  const inputs = () => run(14, { 2: { read: false }, 5: { read: false } });
  it("applying a token makes the second miss legal; undo reverts it", () => {
    const i = inputs();
    const d5 = dateForDay(5, cfg);
    i.days[d5]!.extendedGraceUsedFor = "read";
    let ev = evaluateRun(i, cfg, dateForDay(14, cfg));
    expect(ev.days[4]!.grace.read).toEqual({ kind: "extended" });
    expect(ev.days[4]!.status).toBe("WON");
    expect(tokenSummary(ev, cfg)).toEqual({ total: 7, used: 1, remaining: 6 });

    delete i.days[d5]!.extendedGraceUsedFor; // undo
    ev = evaluateRun(i, cfg, dateForDay(14, cfg));
    expect(ev.days[4]!.status).toBe("LOST");
    expect(tokenSummary(ev, cfg).used).toBe(0);
  });
  it("one token per 2-week block: a second habit in the same block can't use it", () => {
    const i = run(14, { 2: { read: false }, 5: { read: false }, 9: { meals: false }, 12: { meals: false } }, {
      5: { extendedGraceUsedFor: "read" },
      12: { extendedGraceUsedFor: "meals" },
    });
    const ev = evaluateRun(i, cfg, dateForDay(14, cfg));
    expect(ev.days[4]!.grace.read?.kind).toBe("extended");
    expect(ev.days[11]!.grace.meals).toEqual({ kind: "illegal", reason: "week_limit" });
    expect(weekSummary(ev, 2, cfg).token.used).toEqual({ dayNum: 5, habit: "read" });
  });
  it("tokens don't carry over: the next block gets its own", () => {
    const i = run(21, { 16: { read: false }, 19: { read: false } }, { 19: { extendedGraceUsedFor: "read" } });
    const ev = evaluateRun(i, cfg, dateForDay(21, cfg));
    expect(ev.days[18]!.grace.read?.kind).toBe("extended"); // Week 3 → block 2
  });
  it("a token allows only a second miss, never a third", () => {
    const i = run(7, { 1: { read: false }, 3: { read: false }, 5: { read: false } }, { 3: { extendedGraceUsedFor: "read" }, 5: { extendedGraceUsedFor: "read" } });
    const ev = evaluateRun(i, cfg, dateForDay(7, cfg));
    expect(ev.days[2]!.grace.read?.kind).toBe("extended");
    expect(ev.days[4]!.grace.read).toEqual({ kind: "illegal", reason: "week_limit" });
  });
  it("an unneeded token flag is ignored and not consumed", () => {
    const ev = evaluateRun(run(7, {}, { 3: { extendedGraceUsedFor: "read" } }), cfg, dateForDay(7, cfg));
    expect(tokenSummary(ev, cfg).used).toBe(0);
  });
});

describe("spend allowance", () => {
  it("is $20 × day-of-month and resets Nov 30 → Dec 1", () => {
    expect(allowanceToDate("2026-11-30", cfg)).toBe(600);
    expect(allowanceToDate("2026-12-01", cfg)).toBe(20);
    const e = [spend("2026-11-30", 590), spend("2026-12-01", 20)];
    expect(spendOutcome(e, "2026-11-30", cfg)).toBe("hit");
    expect(monthToDateSpend(e, "2026-12-01")).toBe(20);
    expect(spendOutcome(e, "2026-12-01", cfg)).toBe("hit");
    expect(spendOutcome([spend("2026-12-01", 21)], "2026-12-01", cfg)).toBe("miss");
  });
  it("resets Dec 31 → Jan 1", () => {
    const e = [spend("2026-12-31", 620), spend("2027-01-01", 5)];
    expect(spendOutcome(e, "2026-12-31", cfg)).toBe("hit");
    expect(monthToDateSpend(e, "2027-01-01")).toBe(5);
    expect(spendOutcome([spend("2026-12-31", 621)], "2026-12-31", cfg)).toBe("miss");
  });
  it("a zero-spend day is always a hit, even when the month is over", () => {
    const e = [spend("2026-11-02", 100)];
    expect(spendOutcome(e, "2026-11-02", cfg)).toBe("miss");
    expect(spendOutcome(e, "2026-11-03", cfg)).toBe("hit");
  });
  it("editing a past spend entry flips that day's (and later days') status", () => {
    const inputs = run(3);
    inputs.spend = [spend("2026-11-02", 10, "a"), spend("2026-11-03", 25, "b")];
    expect(statusOf(inputs, 1).status).toBe("WON");
    expect(statusOf(inputs, 2).status).toBe("WON"); // 35 ≤ 60
    inputs.spend[0] = { ...inputs.spend[0]!, amount: 50 }; // edit Nov 2
    expect(statusOf(inputs, 1).status).toBe("LOST"); // 50 > 40
    expect(statusOf(inputs, 2).status).toBe("LOST"); // 75 > 60
    inputs.spend[0] = { ...inputs.spend[0]!, deleted: true }; // delete it
    expect(statusOf(inputs, 1).status).toBe("WON");
  });
  it("respects a Settings override of the daily allowance", () => {
    const c = buildRunConfig(undefined, { ...cfg, dailyAllowance: 25 });
    expect(spendOutcome([spend("2026-11-02", 50)], "2026-11-02", c)).toBe("hit");
  });
});

describe("HYSA payday rule", () => {
  const c = buildRunConfig(undefined, { ...cfg, paydays: ["2026-11-13"] });
  const dep = (date: string, amount: number, kind: HysaDeposit["kind"] = "payday"): HysaDeposit => ({ id: date + amount, date, amount, kind, updatedAt: T });
  it("is n/a on non-paydays", () => {
    expect(hysaStatus([], "2026-11-12", "2026-11-20", c)).toBe("na");
  });
  it("hits with ≥ $500 on payday or the next day", () => {
    expect(hysaStatus([dep("2026-11-13", 500)], "2026-11-13", "2026-11-20", c)).toBe("hit");
    expect(hysaStatus([dep("2026-11-14", 650)], "2026-11-13", "2026-11-20", c)).toBe("hit");
  });
  it("misses with a short or late deposit, and the day is LOST", () => {
    expect(hysaStatus([dep("2026-11-13", 499)], "2026-11-13", "2026-11-20", c)).toBe("miss");
    expect(hysaStatus([dep("2026-11-15", 500)], "2026-11-13", "2026-11-20", c)).toBe("miss");
    expect(statusOf(run(19), 12, dateForDay(19, c), c).status).toBe("LOST");
  });
  it("is pending (day PENDING, streak not broken) until the next day passes", () => {
    expect(hysaStatus([], "2026-11-13", "2026-11-14", c)).toBe("pending");
    const ev = evaluateRun(run(13), c, dateForDay(13, c)); // today = Nov 14
    expect(ev.days[11]!.status).toBe("PENDING");
    expect(runStats(ev).currentStreak).toBe(12);
  });
  it("the $125 opening deposit is logged but never scores a payday", () => {
    const c2 = buildRunConfig(undefined, { ...cfg, paydays: ["2026-11-01"] });
    expect(hysaStatus([dep("2026-11-01", 600, "opening")], "2026-11-01", "2026-11-20", c2)).toBe("miss");
  });
});

describe("day status & stats", () => {
  it("today is PENDING until every toggle habit is logged; future days are FUTURE", () => {
    const inputs = run(2);
    inputs.days[dateForDay(3, cfg)] = { date: dateForDay(3, cfg), habits: { workout: true }, floorDay: false, appliesCount: 2, updatedAt: T };
    const ev = evaluateRun(inputs, cfg, dateForDay(3, cfg));
    expect(ev.days[2]!.status).toBe("PENDING");
    expect(ev.days[3]!.status).toBe("FUTURE");
  });
  it("an unlogged past day is LOST", () => {
    const inputs = run(3);
    delete inputs.days[dateForDay(2, cfg)];
    expect(statusOf(inputs, 2, dateForDay(3, cfg)).status).toBe("LOST");
  });
  it("a missed strict habit loses the day; a Floor Day can still be WON", () => {
    const inputs = run(2, { 1: { workout: false } }, { 2: { floorDay: true } });
    const ev = evaluateRun(inputs, cfg, dateForDay(2, cfg));
    expect(ev.days[0]!.status).toBe("LOST");
    expect(ev.days[1]!.status).toBe("WON");
    expect(ev.days[1]!.floorDay).toBe(true);
  });
  it("computes streaks, win rate and per-habit %", () => {
    const ev = evaluateRun(run(10, { 4: { workout: false } }), cfg, dateForDay(10, cfg));
    const s = runStats(ev);
    expect(s.wonDays).toBe(9);
    expect(s.longestStreak).toBe(6);
    expect(s.currentStreak).toBe(6);
    expect(s.habitPct.workout).toBeCloseTo(0.9);
    expect(s.habitPct.spend).toBe(1);
    expect(s.habitPct.hysa).toBeNull();
  });
  it("alerts after 3+ Floor Days in 2 consecutive weeks", () => {
    const floors = Object.fromEntries([1, 2, 3, 8, 9, 10].map((n) => [n, { floorDay: true }]));
    const ev = evaluateRun(run(14, {}, floors), cfg, dateForDay(14, cfg));
    expect(weekSummary(ev, 1, cfg).floorDays).toBe(3);
    expect(floorDayAlert(ev, 1, cfg)).toBe(false);
    expect(floorDayAlert(ev, 2, cfg)).toBe(true);
  });
});

describe("plan", () => {
  it("Week 1 weekdays are cycle 1; weekends alternate restaurants; cycles wrap after 7", () => {
    const mon = planFor("2026-11-02", cfg);
    expect(mon.meal).toMatchObject({ kind: "prep", cycle: 1, lunch: "Island Lime-Garlic Chicken" });
    expect(mon.workout).toBe("Lift");
    expect(planFor("2026-11-07", cfg).meal).toEqual({ kind: "restaurant", name: "Chick-fil-A" });
    const sun = planFor("2026-11-08", cfg);
    expect(sun.meal).toEqual({ kind: "restaurant", name: "Chipotle" });
    expect(sun.batchCookCycle).toBe(2);
    expect(planFor("2026-11-14", cfg).meal).toEqual({ kind: "restaurant", name: "Wingstop" });
    expect(planFor(addDays("2026-11-02", 7 * 7), cfg).meal).toMatchObject({ cycle: 1 }); // Week 8
  });
  it("reading plan maps day → chapter", () => {
    expect(planFor(dateForDay(1, cfg), cfg).reading).toEqual({ book: "The 48 Laws of Power", chapter: "Law 18" });
    expect(planFor(dateForDay(31, cfg), cfg).reading?.chapter).toBe("Law 48");
    expect(planFor(dateForDay(32, cfg), cfg).reading).toEqual({ book: "The Way of the Superior Man", chapter: "Ch 1" });
    expect(planFor(dateForDay(90, cfg), cfg, "Book X").reading).toEqual({ book: "Book X", chapter: "Ch 8" });
  });
});
