import { describe, expect, it } from "vitest";
import { PLACEHOLDER_PROFILE, mergeProfile } from "../config/profile";
import { buildRunConfig, type OssuItem } from "../config/run.config";
import { bodyStatus, topSetLoad, type BodyCheck } from "./body";
import { dateForDay } from "./dates";
import { appliesOn, evaluateRun } from "./evaluate";
import { jobCounts, jobStats, type JobApp } from "./jobs";
import { ossuStatus, pushesByDate, readingProgress } from "./learn";
import type { DayLog, RunInputs } from "./types";

const cfg = buildRunConfig(undefined, { dailyAllowance: 20, paydayDeposit: 500, paydays: [] });
const profile = mergeProfile(PLACEHOLDER_PROFILE, {
  body: { startWeight: 158, targetWeight: 160, buildToHoldAvg: 159.5, holdRange: [159, 161], supplements: [], lifts: ["Bench", "Squat", "Row"] },
});
const bc = (weekStart: string, weight?: number, waist?: number, lifts: Record<string, string> = {}): BodyCheck => ({ weekStart, weight, waist, lifts, updatedAt: "" });

describe("body", () => {
  it("parses top-set loads", () => {
    expect(topSetLoad("185x5")).toBe(185);
    expect(topSetLoad("Bench 187.5 x 3")).toBe(187.5);
    expect(topSetLoad("")).toBeUndefined();
  });
  it("suggests Hold once the 2-week average reaches 159.5", () => {
    expect(bodyStatus([bc("2026-11-01", 158), bc("2026-11-08", 159)], "build", profile).suggestHold).toBe(false);
    const s = bodyStatus([bc("2026-11-08", 159.4), bc("2026-11-15", 159.6)], "build", profile);
    expect(s.avg2).toBe(159.5);
    expect(s.suggestHold).toBe(true);
    expect(bodyStatus([bc("2026-11-08", 159.4), bc("2026-11-15", 159.6)], "hold", profile).suggestHold).toBe(false);
  });
  it("alerts on fast gain (>0.5 lb/week on the 2-week average)", () => {
    const s = bodyStatus([bc("a1", 158), bc("a2", 158), bc("a3", 159.2), bc("a4", 159.4)], "build", profile);
    expect(s.ratePerWeek).toBe(0.65);
    expect(s.alerts.map((a) => a.id)).toEqual(["gain"]);
  });
  it("alerts when below the hold range in Hold, and over-range with waist up", () => {
    expect(bodyStatus([bc("a", 158.6), bc("b", 158.8)], "hold", profile).alerts.map((a) => a.id)).toContain("under-hold");
    const s = bodyStatus([bc("a", 161.5, 31), bc("b", 161.6, 31), bc("c", 161.8, 31.5)], "hold", profile);
    expect(s.waistUp).toBe(true);
    expect(s.alerts.map((a) => a.id)).toEqual(["over-waist"]);
  });
  it("flags a stalled lift while weight is steady, reading legacy keys too", () => {
    const es = [bc("a", 160, undefined, { l1: "185x5", "Lift 2": "225x5", l3: "135x8" }), bc("b", 160.1, undefined, { l1: "185x5", l2: "230x5", l3: "135x8" }), bc("c", 160, undefined, { l1: "185x4", l2: "235x5", l3: "140x8" })];
    const s = bodyStatus(es, "hold", profile);
    expect(s.alerts.find((a) => a.id === "stall")?.text).toMatch(/^Bench hasn't gone up/);
  });
});

describe("jobs", () => {
  const job = (date: string, status: JobApp["status"] = "Applied", extra: Partial<JobApp> = {}): JobApp => ({ id: date + status + Math.random(), date, company: "Co", role: "SWE", source: "LinkedIn", status, updatedAt: "", ...extra });
  it("a day's applications = max(Today counter, jobs logged that day)", () => {
    const d1 = dateForDay(1, cfg);
    const d2 = dateForDay(2, cfg);
    const log = (date: string, n: number): DayLog => ({ date, habits: { workout: true, meals: true, commit: true, read: true }, floorDay: false, appliesCount: n, updatedAt: "" });
    const jobs = [job(d1), job(d1), job(d2), job(d2), job(d2), job(d2), job(d2)];
    const inputs: RunInputs = { days: { [d1]: log(d1, 5), [d2]: log(d2, 0) }, spend: [], hysa: [], jobCounts: jobCounts(jobs) };
    expect(appliesOn(inputs, d1)).toBe(5);
    expect(appliesOn(inputs, d2)).toBe(5);
    expect(evaluateRun(inputs, cfg, d2).days[1]!.grace.apply?.kind).toBe("hit"); // pipeline alone hits the target
  });
  it("response rate, interviews, follow-ups and the Day 30 bottleneck rule", () => {
    const days: Record<string, DayLog> = {};
    for (let n = 1; n <= 30; n++) days[dateForDay(n, cfg)] = { date: dateForDay(n, cfg), habits: {}, floorDay: false, appliesCount: 5, updatedAt: "" };
    const jobs = [job("2026-11-02", "Rejected"), job("2026-11-03", "Applied", { followUp: "2026-11-10" }), job("2026-11-04", "Ghosted", { followUp: "2026-11-05" })];
    const inputs: RunInputs = { days, spend: [], hysa: [], jobCounts: jobCounts(jobs) };
    const s = jobStats(jobs, inputs, cfg, dateForDay(30, cfg), 5);
    expect(s.total).toBe(150);
    expect(s.responses).toBe(1);
    expect(s.responseRate).toBeCloseTo(1 / 150);
    expect(s.bottleneck).toBe(true); // ≥150 applications, < 2% response
    expect(s.followUpsDue.map((j) => j.date)).toEqual(["2026-11-03"]); // ghosted ones aren't chased
    expect(jobStats(jobs, inputs, cfg, dateForDay(29, cfg), 5).bottleneck).toBe(false); // not before Day 30
  });
});

describe("learn", () => {
  const items: OssuItem[] = [
    { id: "a", kind: "course", track: "JS", title: "A", done: true, week: 1 },
    { id: "b", kind: "course", track: "JS", title: "B", done: false, week: 1 },
    { id: "c", kind: "project", track: "JS", title: "C", done: false, week: 3 },
    { id: "d", kind: "course", track: "JS", title: "D", done: false },
    { id: "e", kind: "course", track: "JS", title: "E", done: false, week: 15 },
  ];
  it("OSSU: this week's targets, overdue items and Phase 2 split", () => {
    const s = ossuStatus(items, 3, cfg);
    expect(s.thisWeek.map((i) => i.id)).toEqual(["c"]);
    expect(s.overdue.map((i) => i.id)).toEqual(["b"]);
    expect(s.onTrack).toBe(false);
    expect(s.total).toBe(4); // e is Phase 2 (week 15 > 13)
    expect(s.unassigned).toBe(1);
  });
  it("reading progress counts read hits per planned book", () => {
    const days: Record<string, DayLog> = {};
    for (let n = 1; n <= 10; n++) days[dateForDay(n, cfg)] = { date: dateForDay(n, cfg), habits: { read: n !== 4 }, floorDay: false, appliesCount: 0, updatedAt: "" };
    const r = readingProgress({ days, spend: [], hysa: [] }, cfg, dateForDay(10, cfg));
    expect(r.books[0]).toMatchObject({ book: "The 48 Laws of Power", chapters: 31, read: 9, plannedByNow: 10, active: true, finished: false });
    expect(r.finished).toEqual(["Psycho-Cybernetics"]);
  });
  it("GitHub push events → pushes per local date", () => {
    const ev = [
      { type: "PushEvent", created_at: "2026-11-03T03:30:00Z", payload: { size: 2 } }, // 10:30 PM Nov 2 in New York
      { type: "PushEvent", created_at: "2026-11-03T15:00:00Z", payload: { size: 1 } },
      { type: "WatchEvent", created_at: "2026-11-03T16:00:00Z" },
    ];
    expect(pushesByDate(ev, "America/New_York")).toEqual({ "2026-11-02": 2, "2026-11-03": 1 });
  });
});
