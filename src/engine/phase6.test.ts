import { describe, expect, it } from "vitest";
import { PLACEHOLDER_PROFILE, mergeProfile } from "../config/profile";
import { buildRunConfig } from "../config/run.config";
import { advance, emptyCollection } from "./collections";
import { dateForDay } from "./dates";
import { evaluateRun } from "./evaluate";
import { reviewPrefill } from "./review";
import { logTime, scheduleFor } from "./schedule";
import type { DayLog, RunInputs } from "./types";

const cfg = buildRunConfig(undefined, { dailyAllowance: 20, paydayDeposit: 500, paydays: [] });

describe("schedule", () => {
  it("uses the defaults unchanged", () => {
    const s = scheduleFor();
    expect(s[0]).toMatchObject({ time: "5:30 AM–6:00 AM", block: "Wake, water, journal & pray" });
    expect(s.find((b) => b.block.startsWith("Study"))?.time).toBe("8:00 PM–9:30 PM");
  });
  it("shifts wake blocks by wake time and evening blocks by home time; fixed blocks stay", () => {
    const s = scheduleFor("06:00", "19:00");
    expect(s[0]!.time).toBe("6:00 AM–6:30 AM");
    expect(s.find((b) => b.block.startsWith("Prepped lunch"))?.time).toBe("12:00 PM");
    expect(s.find((b) => b.block.startsWith("Gym"))?.time).toBe("7:10 PM–8:00 PM");
    expect(s.find((b) => b.block === "Lights out")?.time).toBe("10:45 PM–11:00 PM");
    expect(logTime("19:00")).toBe("22:00");
    expect(logTime()).toBe("21:30");
  });
});

describe("review prefill", () => {
  it("fills the Sunday sheet from what the app knows", () => {
    const days: Record<string, DayLog> = {};
    for (let i = 1; i <= 7; i++) {
      const date = dateForDay(i, cfg);
      days[date] = { date, habits: { workout: true, meals: i !== 3, commit: i !== 6, read: true }, floorDay: i === 7, appliesCount: 5, energy: 4, updatedAt: "" };
    }
    const inputs: RunInputs = {
      days,
      spend: [{ id: "s", date: "2026-11-04", amount: 42.5, category: "misc", updatedAt: "" }],
      hysa: [{ id: "h", date: "2026-11-01", amount: 125, kind: "opening", updatedAt: "" }],
    };
    const profile = mergeProfile(PLACEHOLDER_PROFILE, { collections: [{ id: "g", name: "Geico", estAmount: 158, order: 1 }] });
    const ev = evaluateRun(inputs, cfg, dateForDay(7, cfg));
    const r = reviewPrefill(
      ev,
      inputs,
      cfg,
      profile,
      {
        body: [{ weekStart: "2026-11-08", weight: 158.6, waist: 31.5, lifts: { l1: "185x5" }, updatedAt: "" }],
        collections: { g: advance(emptyCollection("g"), "validation_sent", "2026-11-07") },
        jobs: [],
        lifts: ["Bench", "Squat", "Row"],
      },
      1,
    );
    expect(r).toMatchObject({
      weight: "158.6",
      waist: "31.5",
      topSets: "Bench 185x5",
      energy: "4.0",
      weekSpend: "$42.5",
      mtd: "$42.5 / $160",
      hysa: "$125",
      collections: "Geico: Validation letter sent",
      applies: "35/35",
      chapters: "7/7",
      commits: "6/7",
      wonDays: "7/7",
      floorDays: "1",
      graceUsed: "Meal-prepped meals (Wed), Commit code (Sat)",
      extendedUsed: "none",
    });
  });
});
