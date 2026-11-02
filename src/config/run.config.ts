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
 * OSSU map, from the revised syllabus (OSSU_Syllabus_Revised.pdf, updated Sep 29, 2026),
 * shifted so syllabus Week N runs Sun–Sat starting Sun Nov 1 (Day 0): its Sunday lecture comes
 * just before run Week N, and everything else falls inside run Week N. Editable in Learn.
 */
export interface OssuItem {
  id: string;
  kind: "course" | "project" | "homework";
  track: string;
  title: string;
  done: boolean;
  week?: number;
  phase?: 1 | 2;
  /** Run day number it's due (projects due Saturday, homework due Wednesday). */
  dueDay?: number;
  difficulty?: string;
  details?: string[];
}
const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const c = (track: string, title: string, done: boolean, week?: number): OssuItem => ({ id: `${track}:${slug(title)}`, kind: "course", track, title, done, ...(week ? { week } : {}) });
/** Wednesday of syllabus week n = Day 3 + 7(n−1); Saturday = Day 6 + 7(n−1). */
const wed = (n: number) => 3 + 7 * (n - 1);
const sat = (n: number) => 6 + 7 * (n - 1);
const hw = (id: string, week: number, title: string, difficulty: string, details: string[]): OssuItem => ({ id: `hw:${id}`, kind: "homework", track: "HW", title: `HW ${id}: ${title}`, done: false, week, dueDay: wed(week), difficulty, details });
const proj = (id: string, week: number, track: string, title: string, details: string[]): OssuItem => ({ id: `proj:${id}`, kind: "project", track, title, done: false, week, dueDay: sat(week), details });

export const OSSU_SYLLABUS_START = "2026-11-01"; // syllabus Week 1 Sunday (Day 0)
export const OSSU_SEED: OssuItem[] = [
  // Completed (19 per the syllabus appendix + 5 finished during Run 1)
  c("JS", "TypeScript Essential Training", true),
  c("JS", "JavaScript: Async", true),
  c("JS", "JavaScript: Array", true),
  c("JS", "JavaScript: Patterns", true),
  c("JS", "Computer Science Principles Lab: JavaScript", true),
  c("JS", "JavaScript: Closures", true),
  c("JS", "Programming Foundations: Algorithms", true),
  c("ARCH", "Software Design: Developing Effective Requirements", true),
  c("ARCH", "Software Architecture Foundations", true),
  c("ARCH", "Programming Foundations: Design Patterns", true),
  c("SQL", "Quick Start Guide to SQL", true),
  c("SQL", "Learning Relational Databases", true),
  c("SQL", "SQL Essential Training", true),
  c("SQL", "Programming Foundations: Databases", true),
  c("REACT", "React Essential Training", true),
  c("REACT", "React: Working with APIs", true),
  c("WEB", "Programming Foundations: Data Structures", true),
  c("WEB", "Programming Foundations: Discrete Math", true),
  c("WEB", "Computer Science Principles: Programming", true),
  // Week 1 · SQL Finish + React Architecture
  c("SQL", "Advanced SQL", false, 1),
  c("REACT", "React: State Management", true, 1),
  c("REACT", "React: Software Architecture", true, 1),
  hw("1-A", 1, "Advanced SQL", "Hard", ["Recursive CTE that traverses an org chart 5 levels deep", "Index a 100k-row orders table; EXPLAIN ANALYZE before/after", "Stored procedure for a batch insert with error handling"]),
  hw("1-B", 1, "State & Architecture", "Hard", ["Global state from scratch with Context + useReducer (no Zustand/Redux)", "Compound component pattern (custom Tabs with children)", "Refactor a class component with lifecycles to hooks"]),
  // Week 2 · Back End Engineering: Express
  c("BE", "Express Essentials", true, 2),
  c("BE", "Building RESTful APIs with Node.js", true, 2),
  hw("2-A", 2, "Express API", "Medium", ["REST API with 5 endpoints for a Books resource (full CRUD)", "Input validation middleware with express-validator", "Custom async error handler that catches all thrown errors"]),
  hw("2-B", 2, "React Hooks", "Medium", ["useFetch with loading/error/data + request caching", "useLocalStorage that syncs state automatically", "useDebounce wired to a live search input"]),
  // Week 3 · MERN + Node Data Layer · Midterm due
  c("BE", "MERN Essential Training", true, 3),
  c("BE", "Databases for Node.js", false, 3),
  c("ADV", "Building a Website with Node and Express", false, 3),
  hw("3-A", 3, "RESTful Blog API", "Medium", ["Express + MongoDB with Mongoose models for users and posts", "JWT auth middleware protecting write routes", "/posts CRUD with pagination"]),
  hw("3-B", 3, "MERN Integration", "Hard", ["Connect the Blog API to a React front end: login + post listing", "Mongoose validation + pre-save password hashing", "Rate limiter middleware from scratch (Map + timestamps)"]),
  proj("midterm", 3, "MIDTERM", "Midterm: Full-Stack Dashboard", [
    "React + TypeScript front end with 3+ data views and global state",
    "Express + SQLite back end: 3+ normalized tables, 5+ endpoints",
    "ADR.md documenting 2 pattern choices",
    "README with setup, screenshots, live demo link",
    "10+ meaningful commits; deployed publicly",
  ]),
  // Week 4 · Intro to React Native
  c("RN", "React Native Essential Training", false, 4),
  c("RN", "React Native Ecosystem and Workflow", false, 4),
  c("RN", "Create a CRM Mobile App", false, 4),
  hw("4-A", 4, "React Native Basics", "Easy–Medium", ["FlatList of mock contacts", "Stack + Tab navigation with React Navigation", "Persist contacts to AsyncStorage and reload on launch"]),
  hw("4-B", 4, "Data Structures", "Medium", ["Doubly linked list: insert, delete, reverse", "Binary search tree: insert, search, in-order traversal", "Min-heap for the K Largest Elements problem"]),
  proj("crm", 4, "RN", "CRM Mobile App", ["Contacts list, detail view, add/edit screen", "AsyncStorage persistence", "Push to GitHub"]),
  // Week 5 · PWAs + Advanced Node
  c("RN", "React: Building Progressive Apps", false, 5),
  c("ADV", "Node.js Microservices", false, 5),
  c("ADV", "Advanced Node.js", false, 5),
  hw("5-A", 5, "PWA & Mobile Polish", "Medium", ["Manifest + service worker on the midterm app", "Offline-first caching (cache-first assets, network-first API)", "Push notification subscription boilerplate"]),
  hw("5-B", 5, "Node Advanced", "Hard", ["Split the Blog API into auth-service and posts-service", "Express API gateway proxying both", "Circuit Breaker in the gateway"]),
  proj("microservices", 5, "ADV", "Microservices Deployment", ["Finish the auth + posts split", "Configure the gateway", "Docker Compose for local orchestration"]),
  // Week 6 · Production React + Next.js
  c("REACT", "Building Production Ready Apps", false, 6),
  c("REACT", "Learning Next.js", false, 6),
  hw("6-A", 6, "Next.js & Production", "Hard", ["SSR on 2 pages, SSG on 1; compare with Lighthouse", "ISR for a blog listing page", "GitHub Actions CI/CD deploying to Vercel on push to main"]),
  hw("6-B", 6, "Final Prep", "Medium", ["Jest unit tests for 3 utility functions", "Error boundaries, tested with intentional throws", "Professional top-level README for the monorepo"]),
  // Week 7 · Final Capstone Sprint
  proj("capstone", 7, "CAPSTONE", "Final Capstone: Production Full-Stack App", [
    "Next.js + TypeScript with SSR/ISR, Lighthouse 90+",
    "2+ Express microservices behind an API gateway",
    "PostgreSQL or MongoDB with CRUD, migrations, seed scripts",
    "JWT auth with refresh tokens, protected routes, roles",
    "React Native companion app on the shared API",
    "PWA manifest + service worker",
    "GitHub Actions CI/CD to production",
    "README with architecture diagram; 20+ conventional commits",
  ]),
];

/** Day-by-day focus for syllabus weeks 1–7, indexed Sun..Sat. */
export const OSSU_WEEKS: { week: number; title: string; days: string[]; tip: string }[] = [
  { week: 1, title: "SQL Finish + React Architecture", days: ["Advanced SQL (full course): window functions, CTEs, subqueries", "Review + backlog: Array Manipulation (skip if done)", "React: State Management", "HW 1-A and HW 1-B", "React: Software Architecture", "Off", "Midterm kickoff: repo, SQLite schema (3 tables + ERD), React + TS scaffold with a global state provider"], tip: "Finishing Advanced SQL closes out the SQL track." },
  { week: 2, title: "Back End Engineering: Express", days: ["Express Essentials (full course)", "Review + backlog: TypeScript Generics (skip if done)", "Building RESTful APIs with Node.js: routing, middleware, errors", "HW 2-A and HW 2-B", "Midterm integration: connect front end to API", "Off", "Midterm build: 5 Express endpoints over SQLite, 3 React data views, draft ADR.md"], tip: "HW 2-A's Books API is a dress rehearsal for the midterm back end." },
  { week: 3, title: "MERN + Node Data Layer · Midterm due", days: ["MERN Essential Training: full-stack wiring", "Review + backlog: Closures & Scope (skip if done)", "Databases for Node.js: Mongoose, pooling, indexing", "HW 3-A and HW 3-B", "Building a Website with Node and Express", "Off", "MIDTERM DUE: deploy, README with screenshots + live link, 10+ commits, submit"], tip: "Midterm first, homework second. Push HW 3-B to Monday rather than ship a broken deploy." },
  { week: 4, title: "Intro to React Native", days: ["React Native Essential Training: navigation, StyleSheet, device APIs", "Review + backlog: Design Patterns (skip if done)", "React Native Ecosystem and Workflow", "HW 4-A and HW 4-B", "Create a CRM Mobile App (course)", "Off", "CRM Mobile App: list, detail, add/edit, AsyncStorage. Push to GitHub."], tip: "Your React skills transfer almost 1:1. Focus on Flexbox layout, no DOM, stack navigation." },
  { week: 5, title: "PWAs + Advanced Node", days: ["React: Building Progressive Apps: manifests, service workers, caching", "Review + backlog: SQL Queries (skip if done)", "Node.js Microservices: decomposition, inter-service communication", "HW 5-A and HW 5-B", "Advanced Node.js: streams, clustering, worker threads", "Off", "Microservices Deployment: auth + posts split, gateway, Docker Compose"], tip: "Toughest week technically. Understand the why of microservices before the how." },
  { week: 6, title: "Production React + Next.js", days: ["Building Production Ready Apps: testing, performance, deployment", "Review: self-assess every track 1–10; list your 2 weakest", "Learning Next.js: SSR, SSG, ISR, App Router, API routes", "HW 6-A and HW 6-B", "Final review: revisit your weakest track", "Off", "Capstone kickoff: pick the project, ADR, architecture diagram, scaffold monorepo + schema"], tip: "Last two courses. By Tuesday night all 35 should be marked complete." },
  { week: 7, title: "Final Capstone Sprint", days: ["Back end: auth-service (JWT + refresh, roles) and core service CRUD, migrations, seeds", "API gateway + integration tests across services", "Next.js front end: SSR/ISR pages, protected routes, strict TS", "React Native companion app on the shared API + PWA manifest/service worker", "CI/CD to production, Lighthouse 90+, README with architecture diagram", "Off", "FINAL CAPSTONE DUE: polish, verify live URL, 20+ conventional commits, submit"], tip: "No new material. Ship something complete over something ambitious and half-finished." },
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
