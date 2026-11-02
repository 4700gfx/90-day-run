import { describe, expect, it } from "vitest";
import { PLACEHOLDER_PROFILE, mergeProfile, type SpendCategory } from "../config/profile";
import { buildRunConfig } from "../config/run.config";
import { advance, clearedBy, emptyCollection, fundLedger, isCleared, stepBack } from "./collections";
import { dateForDay } from "./dates";
import { evaluateRun } from "./evaluate";
import { weekInsights } from "./insights";
import { budgetFor, capCheck, categoryTotals, monthEndSweep, mtdSeries } from "./money";
import type { DayLog, RunInputs, SpendEntry } from "./types";

const cfg = buildRunConfig(undefined, { dailyAllowance: 20, paydayDeposit: 500, paydays: [] });
const T = "";
const s = (date: string, amount: number, category = "misc"): SpendEntry => ({ id: `${date}-${amount}-${category}`, date, amount, category, updatedAt: T });
const casino: SpendCategory = { id: "casino", label: "Casino", monthly: 50, hardCap: true };
const misc: SpendCategory = { id: "misc", label: "Misc", monthly: 75, bonus31: 20 };

describe("budgets & hard cap", () => {
  it("adds the 31-day-month bonus", () => {
    expect(budgetFor(misc, "2026-11-10")).toBe(75);
    expect(budgetFor(misc, "2026-12-10")).toBe(95);
  });
  it("warns at 80% and blocks above 100% of a hard-capped category", () => {
    const e = [s("2026-11-03", 30, "casino")];
    expect(capCheck(e, casino, "2026-11-10", 5).level).toBe("ok"); // 35 = 70%
    expect(capCheck(e, casino, "2026-11-10", 10).level).toBe("warn"); // 40 = 80%
    expect(capCheck(e, casino, "2026-11-10", 20).level).toBe("warn"); // 50 = 100%
    expect(capCheck(e, casino, "2026-11-10", 21).level).toBe("block");
    expect(capCheck(e, casino, "2026-12-01", 21).level).toBe("ok"); // new month
    expect(capCheck(e, misc, "2026-11-10", 999).level).toBe("ok"); // no hard cap
  });
  it("totals categories per calendar month, ignoring deleted entries", () => {
    const e = [s("2026-11-01", 10, "fun"), s("2026-11-30", 5, "fun"), s("2026-12-01", 99, "fun"), { ...s("2026-11-02", 50, "fun"), deleted: true }];
    expect(categoryTotals(e, "2026-11-15")).toEqual({ fun: 15 });
  });
});

describe("MTD series & sweep", () => {
  it("builds one cumulative point per day through the given date", () => {
    const pts = mtdSeries([s("2026-11-01", 10), s("2026-11-03", 25)], "2026-11-01", "2026-11-04", cfg);
    expect(pts.map((p) => [p.day, p.spent, p.allowance])).toEqual([
      [1, 10, 20],
      [2, 10, 40],
      [3, 35, 60],
      [4, 35, 80],
    ]);
  });
  it("month-end sweep = pool − spent", () => {
    expect(monthEndSweep([s("2026-11-05", 450)], "2026-11-30", cfg)).toEqual({ pool: 600, spent: 450, unspent: 150 });
    expect(monthEndSweep([s("2026-12-05", 700)], "2026-12-31", cfg).unspent).toBe(0);
  });
});

describe("collections", () => {
  it("advances, steps back and counts cleared by date", () => {
    let g = advance(emptyCollection("geico"), "validation_sent", "2026-11-07", { tracking: "9400" });
    expect(g.steps.validation_sent).toEqual({ date: "2026-11-07", tracking: "9400" });
    g = advance(g, "paid", "2026-12-14", { amount: 158 });
    expect(isCleared(g)).toBe(true);
    const states = { geico: g, drs: emptyCollection("drs") };
    expect(clearedBy(states, "2026-12-13")).toBe(0);
    expect(clearedBy(states, "2026-12-31")).toBe(1);
    const back = stepBack(g);
    expect(back.status).toBe("pfd_offer");
    expect(back.steps.paid?.amount).toBe(158); // data kept for redo
    expect(isCleared(back)).toBe(false);
  });
  it("fund ledger = deposits − paid collections, with running balance", () => {
    const g = advance(emptyCollection("geico"), "paid", "2026-12-14", { amount: 158 });
    const rows = fundLedger(
      [
        { id: "a", date: "2026-11-15", amount: 450, updatedAt: T },
        { id: "b", date: "2026-12-15", amount: 450, updatedAt: T },
        { id: "c", date: "2026-12-01", amount: 999, updatedAt: T, deleted: true },
      ],
      { geico: g },
      [{ id: "geico", name: "Geico", estAmount: 158, order: 1 }],
    );
    expect(rows.map((r) => [r.date, r.amount, r.balance])).toEqual([
      ["2026-11-15", 450, 450],
      ["2026-12-14", -158, 292],
      ["2026-12-15", 450, 742],
    ]);
  });
});

describe("week insights", () => {
  const profile = mergeProfile(PLACEHOLDER_PROFILE, {});
  function week1(): RunInputs {
    const days: Record<string, DayLog> = {};
    for (let i = 1; i <= 7; i++) {
      const date = dateForDay(i, cfg);
      days[date] = { date, habits: { workout: i !== 3, meals: true, commit: true, read: i !== 5 && i !== 6 }, floorDay: false, appliesCount: 5, sleepHours: i === 3 || i === 6 ? 5 : 7.5, updatedAt: T };
    }
    days[dateForDay(3, cfg)]!.lostReason = "Worked late";
    return { days, spend: [s("2026-11-04", 70, "eatout"), s("2026-11-05", 10, "misc")], hysa: [] };
  }
  it("summarises the week from the data", () => {
    const i = week1();
    const text = weekInsights(evaluateRun(i, cfg, dateForDay(7, cfg)), i, cfg, 1, profile).map((x) => x.text);
    expect(text[0]).toBe("Won 5 of 7 days.");
    expect(text).toContain('Wed (Day 3) was lost on workout. You noted: "Worked late".');
    expect(text).toContain("Sat (Day 6) was lost on reading (2nd miss in a row).");
    expect(text).toContain("Most-missed habit: reading (2 misses). Plan its Floor Day minimum for next week.");
    expect(text.find((t) => t.startsWith("Spent"))).toBe("Spent $80 vs a $140 pace ($20/day). Biggest category: Eating out ($70, 88%).");
    expect(text).toContain("Big spend days: Wed $70.");
    expect(text).toContain("Lost days averaged 5h sleep vs 7.5h on won days. Protect lights-out.");
  });
  it("says nothing for a week with no decided days", () => {
    const i = week1();
    expect(weekInsights(evaluateRun(i, cfg, dateForDay(7, cfg)), i, cfg, 2, profile)).toEqual([]);
  });
});
