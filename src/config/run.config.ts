// Single source of truth for Run 2's non-personal config: dates, habit rules,
// plans and schedule. Personal money/debt/body numbers live in the profile
// (see ./profile.ts). Components and the engine read from here; Settings can
// override the editable values at runtime (see `buildRunConfig`).
import { PLACEHOLDER_PROFILE, type PersonalProfile } from "./profile";

export type HabitId = "hysa" | "spend" | "workout" | "meals" | "commit" | "apply" | "read";
export type HabitRule = "strict" | "grace";
export type HabitCadence = "daily" | "payday";

export interface HabitDef {
  id: HabitId;
  label: string;
  rule: HabitRule;
  cadence: HabitCadence;
  floor: string;
  target?: number;
}

export const RUN = {
  id: "run-2",
  name: "90-Day Run — Restart",
  prepDate: "2026-11-01", // Day 0 (Sunday): setup + batch cook, shown but NOT scored
  startDate: "2026-11-02", // Day 1 (Monday)
  lengthDays: 90, // Day 90 = 2027-01-30 (Saturday)
  weekStartsOn: 1, // Monday. Run Week 1 = Nov 2–8; Week 13 = Jan 25–30 (6 days)
  logReminderTime: "21:30",
  timezone: "America/New_York",
} as const;

export const HABITS: HabitDef[] = [
  { id: "hysa", label: "Save to HYSA", rule: "strict", cadence: "payday", floor: "Automated" },
  { id: "spend", label: "Spend under $20/day", rule: "strict", cadence: "daily", floor: "Zero-spend day" },
  { id: "workout", label: "Work out", rule: "strict", cadence: "daily", floor: "Walk 1+ mile" },
  { id: "meals", label: "Meal-prepped meals", rule: "grace", cadence: "daily", floor: "Prepped lunch + dinner" },
  { id: "commit", label: "Commit code", rule: "grace", cadence: "daily", floor: "One small real commit" },
  { id: "apply", label: "Apply to 5 SWE jobs", rule: "grace", cadence: "daily", floor: "5 quick applies", target: 5 },
  { id: "read", label: "Read a chapter", rule: "grace", cadence: "daily", floor: "1 chapter" },
];

export const GRACE_HABITS = HABITS.filter((h) => h.rule === "grace").map((h) => h.id);
/** Habits the user toggles directly (spend, hysa and apply are computed). */
export const TOGGLE_HABITS: HabitId[] = ["workout", "meals", "commit", "read"];

export const SPEND = {
  dailyAllowance: 20, // allowance-to-date = 20 × day-of-calendar-month
  hardCapWarnAt: 0.8,
};

export const COLLECTION_STATUSES = [
  "not_started",
  "validation_sent",
  "response_received",
  "pfd_offer",
  "paid",
  "deletion_confirmed",
] as const;

/** Won days + applications per check-in. Money/debt targets come from the profile. */
export const CHECKINS = [
  { day: 30, date: "2026-12-01", targets: { wonDays: 25, applications: 150 } },
  { day: 60, date: "2026-12-31", targets: { wonDays: 52, applications: 300 } },
  { day: 90, date: "2027-01-30", targets: { wonDays: 80, applications: 450 } },
];

export const JOBS = {
  sources: ["LinkedIn", "Indeed", "Dice", "Wellfound", "Built In", "Other"],
  statuses: ["Applied", "Response", "Screen", "Interview", "Offer", "Rejected", "Ghosted"],
  day30Rule: { minApplications: 150, minResponseRate: 0.02 },
};

export const DAY0_CHECKLIST = [
  { id: "hysa-opened", label: "HYSA opened, opening deposit made, payday transfer set" },
  { id: "baselines", label: "Baselines logged (weight, waist, lifts)" },
  { id: "batch-cook", label: "Batch cook done (cycle 1)" },
];

// ---------------------------------------------------------------- Data appendix

/**
 * Default weekday schedule. Blocks anchored to "wake" shift with the wake time, blocks
 * anchored to "home" shift with the get-home time (both set in Settings); "fixed" never moves.
 */
export const DEFAULT_WAKE = "05:30";
export const DEFAULT_HOME = "18:30";
export interface ScheduleBlock {
  start: string; // HH:MM at the default wake/home time
  end?: string;
  block: string;
  anchor: "wake" | "home" | "fixed";
}
export const SCHEDULE: ScheduleBlock[] = [
  { start: "05:30", end: "06:00", block: "Wake, water, journal & pray", anchor: "wake" },
  { start: "06:00", end: "06:20", block: "Read one chapter", anchor: "wake" },
  { start: "12:00", block: "Prepped lunch; 5 quick applies on phone", anchor: "fixed" },
  { start: "14:30", block: "Snack", anchor: "fixed" },
  { start: "16:30", block: "Snack", anchor: "fixed" },
  { start: "18:40", end: "19:30", block: "Gym: lift Mon–Wed, walk/run Thu–Fri", anchor: "home" },
  { start: "19:30", end: "19:55", block: "Dinner + close shake (window closes 30 min after start)", anchor: "home" },
  { start: "20:00", end: "21:30", block: "Study block → push a commit", anchor: "home" },
  { start: "21:30", end: "21:45", block: "Log the day", anchor: "home" },
  { start: "22:15", end: "22:30", block: "Lights out", anchor: "wake" },
];
export const PHASE2_START = "2027-01-04"; // Spring classes; study block = coursework first

/** Indexed by JS weekday (0 = Sun). */
export const WORKOUTS = ["Walk + Lift", "Lift", "Lift", "Lift", "Walk / Run", "Walk / Run", "Short workout (30–45 min)"];
export const WORKOUT_FLOOR = "Walk 1+ mile";

export const MEAL_CYCLES: { cycle: number; lunch: string; dinner: string }[] = [
  { cycle: 1, lunch: "Island Lime-Garlic Chicken", dinner: "Blackened Salmon & Sweet Potato Hash" },
  { cycle: 2, lunch: "Grilled Chicken & Sweet Potato Bowl", dinner: "Garlic Butter Lamb Chops" },
  { cycle: 3, lunch: "Smothered Chicken & Onion Gravy", dinner: "Island Stewed Lamb" },
  { cycle: 4, lunch: "Grilled Salmon & Salad", dinner: "Shrimp & Lamb Alfredo" },
  { cycle: 5, lunch: "Caribbean Lime Shrimp & Peppers", dinner: "Smothered Steak & Onions" },
  { cycle: 6, lunch: "Herb-Crusted Steak & Mashed Sweet Potato", dinner: "Sweet Chili Shrimp" },
  { cycle: 7, lunch: "Blackened Shrimp Hash", dinner: "Air Fried Wings & Skillet Sweet Potato" },
];
/** Odd run weeks vs even run weeks. Chick-fil-A is closed Sundays. */
export const WEEKEND_RESTAURANTS = {
  odd: { sat: "Chick-fil-A", sun: "Chipotle" },
  even: { sat: "Wingstop", sun: "Subway" },
};
export const MEAL_RESCUES_PER_WEEK = 1;

export const HOLIDAYS = [
  { date: "2026-11-26", label: "Thanksgiving" },
  { date: "2026-12-25", label: "Christmas" },
  { date: "2027-01-01", label: "New Year's Day" },
  { date: PHASE2_START, label: "Spring classes start" },
];

/** One chapter per day. `firstChapter` + (day - fromDay) = today's chapter. */
export const READING_PLAN = [
  { fromDay: 1, toDay: 31, book: "The 48 Laws of Power", unit: "Law", firstChapter: 18 },
  { fromDay: 32, toDay: 82, book: "The Way of the Superior Man", unit: "Ch", firstChapter: 1 },
  { fromDay: 83, toDay: 90, book: "The Psychology of Money", unit: "Ch", firstChapter: 1, editable: true },
];
export const BOOKS_FINISHED = ["Psycho-Cybernetics"];

/**
 * OSSU seed, taken from ossu-tracker/src/OSSUTracker.jsx (its default flags; your
 * live progress there may differ). Editable data: add/remove/reorder and assign each
 * item to a run week in Learn. `week` is unset until the final map is provided.
 */
export interface OssuItem {
  id: string;
  kind: "course" | "project";
  track: string;
  title: string;
  done: boolean;
  week?: number;
  phase?: 1 | 2;
}
const c = (track: string, title: string, done = false): OssuItem => ({
  id: `${track}:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  kind: "course",
  track,
  title,
  done,
});
const p = (track: string, title: string): OssuItem => ({ ...c(track, title), kind: "project" });
export const OSSU_SEED: OssuItem[] = [
  c("JS", "TypeScript Essential Training", true),
  c("JS", "JavaScript: Async", true),
  c("JS", "JavaScript: Array", true),
  c("JS", "JavaScript: Patterns", true),
  c("JS", "Computer Science Principles Lab: JavaScript"),
  c("JS", "JavaScript: Closures"),
  c("JS", "Programming Foundations: Algorithms"),
  p("JS", "JS Fundamentals Showcase"),
  c("ARCH", "Software Design: Developing Effective Requirements", true),
  c("ARCH", "Software Architecture Foundations", true),
  c("ARCH", "Programming Foundations: Design Patterns"),
  p("ARCH", "Architecture Decision Record"),
  c("SQL", "Quick Start Guide to SQL", true),
  c("SQL", "Learning Relational Databases", true),
  c("SQL", "Advanced SQL"),
  c("SQL", "SQL Essential Training"),
  c("SQL", "Programming Foundations: Databases"),
  p("SQL", "Student Records Database"),
  c("REACT", "Building Production Ready Apps"),
  c("REACT", "React: Software Architecture"),
  c("REACT", "React: State Management"),
  c("REACT", "Learning Next.js"),
  c("REACT", "MERN Essential Training"),
  c("REACT", "React Essential Training"),
  c("REACT", "React: Working with APIs"),
  p("REACT", "Full-Stack Portfolio App"),
  c("WEB", "Programming Foundations: Data Structures", true),
  c("WEB", "Programming Foundations: Discrete Math", true),
  c("WEB", "Computer Science Principles: Programming", true),
  p("WEB", "Algorithm Visualizer"),
  c("BE", "Express Essentials"),
  c("BE", "Building RESTful APIs with Node.js"),
  c("BE", "Databases for Node.js"),
  p("BE", "RESTful Blog API"),
  c("RN", "React Native Ecosystem and Workflow"),
  c("RN", "Create a CRM Mobile App"),
  c("RN", "React: Building Progressive Apps"),
  c("RN", "React Native Essential Training"),
  p("RN", "CRM Mobile App"),
  c("ADV", "Node.js Microservices"),
  c("ADV", "Advanced Node.js"),
  c("ADV", "Building a Website with Node and Express"),
  p("ADV", "Microservices Deployment"),
];

// ---------------------------------------------------------------- Runtime config

/** The subset of config the engine needs. */
export interface RunConfig {
  prepDate: string;
  startDate: string;
  lengthDays: number;
  dailyAllowance: number;
  applyTarget: number;
  paydays: string[];
  paydayDeposit: number;
}

export type ConfigOverrides = Partial<Pick<RunConfig, "dailyAllowance" | "paydays" | "paydayDeposit">>;

/** Combine run config + the user's profile + Settings overrides. */
export function buildRunConfig(profile: PersonalProfile = PLACEHOLDER_PROFILE, o: ConfigOverrides = {}): RunConfig {
  return {
    prepDate: RUN.prepDate,
    startDate: RUN.startDate,
    lengthDays: RUN.lengthDays,
    applyTarget: HABITS.find((h) => h.id === "apply")?.target ?? 5,
    dailyAllowance: o.dailyAllowance ?? SPEND.dailyAllowance,
    paydayDeposit: o.paydayDeposit ?? profile.hysa.paydayDeposit,
    paydays: [...(o.paydays ?? profile.hysa.paydays)].sort(),
  };
}

export const DEFAULT_CONFIG: RunConfig = buildRunConfig();
