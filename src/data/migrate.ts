// Stored-data schema + idempotent migration.
//   v0/v1 — original single-file app (Sep 27 run), no schemaVersion
//   v2    — Nov 2 hotfix of the single-file app: { schemaVersion: 2, archive: { run1 }, ...run2 }
//   v3    — this app: { schemaVersion: 3, activeRunId, runs: { "run-1", "run-2" } }
// Nothing is ever dropped: Run 1 is converted AND its raw legacy blob is kept.
import { RUN, type HabitId } from "../config/run.config";
import type { DayLog, HysaDeposit, SpendEntry } from "../engine/types";

export const SCHEMA_VERSION = 3;

export interface BodyEntry {
  weekStart: string;
  weight?: number;
  waist?: number;
  lifts: Record<string, string>;
  energyAvg?: number;
  updatedAt: string;
}

export interface RunData {
  id: string;
  name: string;
  archived: boolean;
  startDate: string;
  lengthDays: number;
  days: Record<string, DayLog>;
  spend: SpendEntry[];
  hysa: HysaDeposit[];
  body: BodyEntry[];
  milestones: Record<string, boolean>;
  /** Raw pre-v3 data, kept verbatim for reference. */
  legacy?: unknown;
}

export interface StoreV3 {
  schemaVersion: 3;
  activeRunId: string;
  runs: Record<string, RunData>;
}

interface LegacyDay {
  workout?: boolean;
  spend?: number | string;
  meals?: boolean;
  code?: boolean;
  apps?: number;
  read?: boolean;
  closed?: boolean;
  note?: string;
}
interface LegacyData {
  schemaVersion?: number;
  days?: Record<string, LegacyDay>;
  hysa?: { date: string; amt: number | string }[];
  body?: { date: string; w?: string | number; waist?: string | number; lift?: string }[];
  milestones?: Record<string, boolean>;
  chapters?: number;
  archive?: { run1?: LegacyData };
}

const num = (v: unknown): number | undefined => {
  if (v === "" || v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Old app: a closed day's unticked habit was a miss; on an open day it was just untouched. */
const tri = (v: boolean | undefined, closed: boolean): boolean | null => (v === true ? true : v === false || closed ? false : null);

function convertLegacy(src: LegacyData, meta: { id: string; name: string; archived: boolean; startDate: string }, now: string): RunData {
  const days: Record<string, DayLog> = {};
  const spend: SpendEntry[] = [];
  for (const [date, d] of Object.entries(src.days ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const closed = !!d.closed;
    const habits: Partial<Record<HabitId, boolean | null>> = {
      workout: tri(d.workout, closed),
      meals: tri(d.meals, closed),
      commit: tri(d.code, closed),
      read: tri(d.read, closed),
    };
    days[date] = { date, habits, floorDay: false, appliesCount: Number(d.apps) || 0, note: d.note || undefined, updatedAt: now };
    const amt = num(d.spend);
    if (amt && amt > 0) spend.push({ id: `legacy-spend-${date}`, date, amount: amt, category: "misc", note: "Migrated daily total", updatedAt: now });
  }
  const hysa: HysaDeposit[] = (src.hysa ?? []).map((h, i) => ({
    id: `legacy-hysa-${h.date}-${i}`,
    date: h.date,
    amount: Number(h.amt) || 0,
    kind: h.date === RUN.prepDate ? "opening" : "payday",
    updatedAt: now,
  }));
  const body: BodyEntry[] = (src.body ?? []).map((b) => ({
    weekStart: b.date,
    weight: num(b.w),
    waist: num(b.waist),
    lifts: (b.lift ? { "Lift 1": b.lift } : {}) as Record<string, string>,
    updatedAt: now,
  }));
  return { ...meta, lengthDays: 90, days, spend, hysa, body, milestones: {}, legacy: JSON.parse(JSON.stringify(src)) };
}

const CUTOVER = RUN.prepDate; // entries on/after Day 0 belong to the restart

function splitV0(src: LegacyData): { run1: LegacyData; run2: LegacyData } {
  const after = <T extends { date: string }>(xs: T[] | undefined) => (xs ?? []).filter((x) => x.date >= CUTOVER);
  return {
    run1: src,
    run2: {
      days: Object.fromEntries(Object.entries(src.days ?? {}).filter(([k]) => k >= CUTOVER)),
      hysa: after(src.hysa),
      body: after(src.body),
    },
  };
}

export function migrate(raw: unknown, now = new Date().toISOString()): StoreV3 {
  if (raw && typeof raw === "object" && (raw as { schemaVersion?: number }).schemaVersion === SCHEMA_VERSION) return raw as StoreV3;
  const src = (raw ?? {}) as LegacyData;
  const { run1, run2 } =
    src.schemaVersion === 2 ? { run1: src.archive?.run1 ?? {}, run2: { ...src, archive: undefined } } : splitV0(src);
  return {
    schemaVersion: 3,
    activeRunId: RUN.id,
    runs: {
      "run-1": convertLegacy(run1, { id: "run-1", name: "Run 1 (Sep 27)", archived: true, startDate: "2026-09-27" }, now),
      [RUN.id]: convertLegacy(run2, { id: RUN.id, name: RUN.name, archived: false, startDate: RUN.startDate }, now),
    },
  };
}
