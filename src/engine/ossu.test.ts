import { describe, expect, it } from "vitest";
import { OSSU_SEED, buildRunConfig, type OssuItem } from "../config/run.config";
import { PLACEHOLDER_PROFILE } from "../config/profile";
import { milestoneTimeline } from "./checkins";
import { dateForDay, dayNumber } from "./dates";
import { hasSyllabus, mergeSyllabus, ossuStatus, syllabusDay } from "./learn";
import { planFor } from "./plan";

const cfg = buildRunConfig(undefined, { dailyAllowance: 20, paydayDeposit: 500, paydays: [] });
const courses = OSSU_SEED.filter((i) => i.kind === "course");

describe("OSSU syllabus seed", () => {
  it("has all 35 courses, 24 done (19 from the syllabus + 5 from Run 1), 11 left across weeks 1–6", () => {
    expect(courses).toHaveLength(35);
    expect(courses.filter((c) => c.done)).toHaveLength(24);
    const left = courses.filter((c) => !c.done);
    expect(left.map((c) => c.title)).toEqual([
      "Advanced SQL",
      "Databases for Node.js",
      "Building a Website with Node and Express",
      "React Native Essential Training",
      "React Native Ecosystem and Workflow",
      "Create a CRM Mobile App",
      "React: Building Progressive Apps",
      "Node.js Microservices",
      "Advanced Node.js",
      "Building Production Ready Apps",
      "Learning Next.js",
    ]);
    expect(left.every((c) => c.week! >= 1 && c.week! <= 6)).toBe(true);
    expect(new Set(OSSU_SEED.map((i) => i.id)).size).toBe(OSSU_SEED.length); // unique ids
  });
  it("track totals match the syllabus (MERN counts under Back End)", () => {
    const by = (t: string) => courses.filter((c) => c.track === t).length;
    expect([by("JS"), by("ARCH"), by("SQL"), by("REACT"), by("WEB"), by("BE"), by("RN"), by("ADV")]).toEqual([7, 3, 5, 6, 3, 4, 4, 3]);
  });
  it("midterm is due Sat Nov 21 and the capstone Sat Dec 19; homework is due Wednesdays", () => {
    const due = (id: string) => dateForDay(OSSU_SEED.find((i) => i.id === id)!.dueDay!, cfg);
    expect(due("proj:midterm")).toBe("2026-11-21");
    expect(due("proj:capstone")).toBe("2026-12-19");
    expect(due("hw:1-A")).toBe("2026-11-04");
    expect(due("hw:6-B")).toBe("2026-12-09");
  });
});

describe("syllabus calendar", () => {
  it("maps dates to syllabus week + day (Sun–Sat from Sun Nov 1)", () => {
    expect(syllabusDay("2026-11-01")).toMatchObject({ week: 1, focus: expect.stringMatching(/^Advanced SQL/) });
    expect(syllabusDay("2026-11-04")?.focus).toBe("HW 1-A and HW 1-B");
    expect(syllabusDay("2026-11-06")?.focus).toBe("Off");
    expect(syllabusDay("2026-11-08")).toMatchObject({ week: 2, focus: "Express Essentials (full course)" });
    expect(syllabusDay("2026-11-21")?.focus).toMatch(/^MIDTERM DUE/);
    expect(syllabusDay("2026-12-19")?.focus).toMatch(/^FINAL CAPSTONE DUE/);
    expect(syllabusDay("2026-12-20")).toBeUndefined();
    expect(syllabusDay("2026-10-31")).toBeUndefined();
  });
  it("Today's plan carries the day's study focus", () => {
    expect(planFor("2026-11-03", cfg).study?.focus).toBe("React: State Management");
  });
});

describe("OSSU progress", () => {
  it("homework is overdue the day after its Wednesday due date; projects after Saturday", () => {
    const thu = dayNumber("2026-11-05", cfg);
    const s = ossuStatus(OSSU_SEED, 1, cfg, thu);
    expect(s.overdue.map((i) => i.id)).toEqual(["hw:1-A", "hw:1-B"]); // Advanced SQL (week 1) isn't late until week 2
    expect(s.byKind.course).toEqual({ done: 24, total: 35 });
    expect(ossuStatus(OSSU_SEED, 2, cfg, dayNumber("2026-11-09", cfg)).overdue.map((i) => i.id)).toContain("SQL:advanced-sql");
  });
  it("puts projects on the timeline at their due date", () => {
    const t = milestoneTimeline(cfg, PLACEHOLDER_PROFILE, undefined, OSSU_SEED);
    expect(t.find((m) => m.id === "ossu:proj:midterm")).toMatchObject({ date: "2026-11-21", label: "Midterm: Full-Stack Dashboard due" });
  });
  it("merging into an edited map keeps done ticks and custom items, drops the old seed projects", () => {
    const old: OssuItem[] = [
      { id: "SQL:advanced-sql", kind: "course", track: "SQL", title: "Advanced SQL", done: true, week: 9 },
      { id: "JS:js-fundamentals-showcase", kind: "project", track: "JS", title: "JS Fundamentals Showcase", done: false },
      { id: "custom:abc", kind: "course", track: "OTHER", title: "My course", done: false },
    ];
    expect(hasSyllabus(old)).toBe(false);
    const m = mergeSyllabus(old);
    expect(hasSyllabus(m)).toBe(true);
    expect(m.find((i) => i.id === "SQL:advanced-sql")).toMatchObject({ done: true, week: 1 });
    expect(m.some((i) => i.id === "JS:js-fundamentals-showcase")).toBe(false);
    expect(m[m.length - 1]!.id).toBe("custom:abc");
  });
});
