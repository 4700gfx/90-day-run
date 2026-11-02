import { describe, expect, it } from "vitest";
import { PLACEHOLDER_PROFILE, mergeProfile } from "../config/profile";
import { buildRunConfig } from "../config/run.config";
import { milestoneTimeline, scorecards } from "./checkins";
import { dateForDay } from "./dates";
import { evaluateRun } from "./evaluate";
import type { DayLog, RunInputs } from "./types";

const cfg = buildRunConfig(undefined, { dailyAllowance: 20, paydayDeposit: 500, paydays: [] });
const profile = mergeProfile(PLACEHOLDER_PROFILE, {
  checkinTargets: { 30: { hysa: 625 }, 60: { hysa: 1125, collectionsCleared: 2 } },
  moneyMilestones: [{ date: "2026-12-14", label: "Pay A" }],
});

function inputs(n: number, lostDays: number[] = [], applies = 5): RunInputs {
  const days: Record<string, DayLog> = {};
  for (let i = 1; i <= n; i++) {
    const date = dateForDay(i, cfg);
    days[date] = { date, habits: { workout: !lostDays.includes(i), meals: true, commit: true, read: true }, floorDay: false, appliesCount: applies, updatedAt: "" };
  }
  return {
    days,
    spend: [],
    hysa: [
      { id: "o", date: "2026-11-01", amount: 125, kind: "opening", updatedAt: "" },
      { id: "p", date: "2026-11-13", amount: 500, kind: "payday", updatedAt: "" },
      { id: "q", date: "2026-12-05", amount: 500, kind: "payday", updatedAt: "" },
    ],
  };
}

describe("scorecards", () => {
  it("before Day 30 the card is locked and shows progress so far", () => {
    const i = inputs(10);
    const [d30] = scorecards(evaluateRun(i, cfg, dateForDay(10, cfg)), i, cfg, profile);
    expect(d30!.unlocked).toBe(false);
    expect(d30!.metrics.find((m) => m.id === "wonDays")).toMatchObject({ actual: 10, target: 25, met: null });
    expect(d30!.metrics.find((m) => m.id === "applications")?.actual).toBe(50);
  });

  it("unlocks on its date and scores actuals as of that date, not later", () => {
    const i = inputs(40, [3, 4, 5, 6, 7, 8]); // 6 lost in the first 30
    const cards = scorecards(evaluateRun(i, cfg, dateForDay(40, cfg)), i, cfg, profile);
    const d30 = cards[0]!;
    expect(d30.unlocked).toBe(true);
    const get = (id: string) => d30.metrics.find((m) => m.id === id)!;
    expect(get("wonDays")).toMatchObject({ actual: 24, met: false }); // target 25
    expect(get("applications")).toMatchObject({ actual: 150, met: true });
    expect(get("hysa")).toMatchObject({ actual: 625, met: true }); // Dec 5 deposit is after Dec 1
    expect(d30.metCount).toBe(2);
  });

  it("only shows money targets present in the profile, and untracked metrics stay null", () => {
    const i = inputs(60);
    const cards = scorecards(evaluateRun(i, cfg, dateForDay(60, cfg)), i, cfg, profile);
    expect(cards[1]!.metrics.map((m) => m.id)).toEqual(["wonDays", "applications", "hysa", "collectionsCleared"]);
    expect(cards[1]!.metrics[3]).toMatchObject({ actual: null, met: null });
    expect(cards[2]!.metrics.map((m) => m.id)).toEqual(["wonDays", "applications"]); // no Day 90 money targets in this profile
  });
});

describe("milestone timeline", () => {
  it("merges money, books, check-ins, school start and holidays in date order", () => {
    const t = milestoneTimeline(cfg, profile, "Book X");
    expect(t.map((m) => m.date)).toEqual([...t.map((m) => m.date)].sort());
    expect(t.find((m) => m.id === "book:31")).toMatchObject({ date: "2026-12-02", label: "Finish The 48 Laws of Power" });
    expect(t.find((m) => m.id === "book:90")?.label).toBe("Finish Book X");
    expect(t.find((m) => m.kind === "school")?.date).toBe("2027-01-04");
    expect(t.filter((m) => m.kind === "checkin")).toHaveLength(3);
    expect(t.find((m) => m.kind === "money")).toMatchObject({ label: "Pay A", checkable: true });
  });
});
