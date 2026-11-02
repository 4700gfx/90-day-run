import { describe, expect, it } from "vitest";
import { migrate } from "./migrate";

const NOW = "2026-11-02T12:00:00.000Z";
const v0 = {
  days: {
    "2026-09-27": { workout: true, spend: 5, meals: true, closed: true },
    "2026-10-15": { workout: true, code: true, apps: 10, closed: false, note: "ok" },
    "2026-11-02": { workout: true, apps: 5, spend: 12 },
  },
  hysa: [{ date: "2026-10-01", amt: 50 }, { date: "2026-11-01", amt: "125" }],
  body: [{ date: "2026-10-04", w: "163", waist: "", lift: "Bench 185x5" }],
  milestones: { "0": true },
  chapters: 20,
};

describe("migrate", () => {
  it("archives the Sep 27 run read-only and keeps the raw data", () => {
    const s = migrate(v0, NOW);
    const r1 = s.runs["run-1"]!;
    expect(s.schemaVersion).toBe(3);
    expect(s.activeRunId).toBe("run-2");
    expect(r1.archived).toBe(true);
    expect(Object.keys(r1.days)).toEqual(["2026-09-27", "2026-10-15", "2026-11-02"]);
    expect(r1.legacy).toEqual(v0);
    // closed day: untouched habits become misses; open day: they stay unlogged
    expect(r1.days["2026-09-27"]!.habits).toEqual({ workout: true, meals: true, commit: false, read: false });
    expect(r1.days["2026-10-15"]!.habits).toEqual({ workout: true, meals: null, commit: true, read: null });
    expect(r1.days["2026-10-15"]!.appliesCount).toBe(10);
    expect(r1.body[0]).toMatchObject({ weekStart: "2026-10-04", weight: 163, waist: undefined, lifts: { "Lift 1": "Bench 185x5" } });
  });
  it("carries entries from Day 0 onward into Run 2", () => {
    const r2 = migrate(v0, NOW).runs["run-2"]!;
    expect(r2.archived).toBe(false);
    expect(Object.keys(r2.days)).toEqual(["2026-11-02"]);
    expect(r2.spend).toEqual([expect.objectContaining({ date: "2026-11-02", amount: 12 })]);
    expect(r2.hysa).toEqual([expect.objectContaining({ date: "2026-11-01", amount: 125, kind: "opening" })]);
  });
  it("handles the v2 hotfix format", () => {
    const v2 = { schemaVersion: 2, runId: "run-2", days: { "2026-11-02": { workout: true, read: true } }, hysa: [], body: [], milestones: {}, chapters: 0, archive: { run1: v0 } };
    const s = migrate(v2, NOW);
    expect(Object.keys(s.runs["run-1"]!.days)).toHaveLength(3);
    expect(s.runs["run-2"]!.days["2026-11-02"]!.habits.read).toBe(true);
  });
  it("is idempotent", () => {
    const once = migrate(v0, NOW);
    const twice = migrate(once, "2030-01-01T00:00:00.000Z");
    expect(twice).toEqual(once);
    expect(migrate(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });
  it("handles empty storage", () => {
    const s = migrate(null, NOW);
    expect(Object.keys(s.runs["run-2"]!.days)).toEqual([]);
  });
});
