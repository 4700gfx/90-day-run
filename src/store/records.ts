// The persisted + synced form of all data: a flat map of records, each with its
// own updatedAt (`u`). Domain objects (runs, profile, settings) are derived from it.
import { PLACEHOLDER_PROFILE, mergeProfile, type PersonalProfile } from "../config/profile";
import { RUN, type ConfigOverrides } from "../config/run.config";
import { migrate, type BodyEntry, type RunData, type StoreV3 } from "../data/migrate";
import type { DayLog, HysaDeposit, SpendEntry } from "../engine/types";

export interface Rec<T = unknown> {
  v: T;
  u: number;
}
export type Records = Record<string, Rec>;

export interface Settings {
  theme: "dark" | "light";
  overrides: ConfigOverrides;
  githubUser?: string;
  wakeTime?: string;
  homeTime?: string;
  book3?: string;
}
export const DEFAULT_SETTINGS: Settings = { theme: "dark", overrides: {} };

export interface RunInfo {
  id: string;
  name: string;
  archived: boolean;
  startDate: string;
  lengthDays: number;
}

export const K = {
  meta: "meta",
  profile: "profile",
  settings: "settings",
  info: (r: string) => `run/${r}/info`,
  legacy: (r: string) => `run/${r}/legacy`,
  day0: (r: string) => `run/${r}/day0`,
  day: (r: string, date: string) => `run/${r}/day/${date}`,
  spend: (r: string, id: string) => `run/${r}/spend/${id}`,
  hysa: (r: string, id: string) => `run/${r}/hysa/${id}`,
  body: (r: string, weekStart: string) => `run/${r}/body/${weekStart}`,
};

export function storeToRecords(s: StoreV3, u: number): Records {
  const out: Records = { [K.meta]: { v: { schemaVersion: s.schemaVersion, activeRunId: s.activeRunId }, u } };
  for (const run of Object.values(s.runs)) {
    const r = run.id;
    const info: RunInfo = { id: r, name: run.name, archived: run.archived, startDate: run.startDate, lengthDays: run.lengthDays };
    out[K.info(r)] = { v: info, u };
    if (run.legacy !== undefined) out[K.legacy(r)] = { v: run.legacy, u };
    for (const d of Object.values(run.days)) out[K.day(r, d.date)] = { v: d, u };
    for (const e of run.spend) out[K.spend(r, e.id)] = { v: e, u };
    for (const e of run.hysa) out[K.hysa(r, e.id)] = { v: e, u };
    for (const e of run.body) out[K.body(r, e.weekStart)] = { v: e, u };
  }
  return out;
}

/** Records from any older stored format (or nothing) → v3 records stamped at `u`. */
export const recordsFromLegacy = (raw: unknown, u: number): Records => storeToRecords(migrate(raw, new Date(u).toISOString()), u);

export interface RunView extends RunInfo {
  days: Record<string, DayLog>;
  spend: SpendEntry[];
  hysa: HysaDeposit[];
  body: BodyEntry[];
  day0: Record<string, boolean>;
}

export interface Derived {
  activeRunId: string;
  profile: PersonalProfile;
  profileImported: boolean;
  settings: Settings;
  runs: Record<string, RunView>;
}

export function derive(records: Records): Derived {
  const meta = records[K.meta]?.v as { activeRunId?: string } | undefined;
  const runs: Record<string, RunView> = {};
  const runOf = (id: string): RunView =>
    (runs[id] ??= { id, name: id, archived: false, startDate: RUN.startDate, lengthDays: RUN.lengthDays, days: {}, spend: [], hysa: [], body: [], day0: {} });
  for (const [k, rec] of Object.entries(records)) {
    const m = /^run\/([^/]+)\/([^/]+)(?:\/(.+))?$/.exec(k);
    if (!m) continue;
    const [, id, kind] = m as unknown as [string, string, string];
    const run = runOf(id);
    if (kind === "info") Object.assign(run, rec.v as RunInfo);
    else if (kind === "day0") run.day0 = rec.v as Record<string, boolean>;
    else if (kind === "day") {
      const d = rec.v as DayLog;
      run.days[d.date] = d;
    } else if (kind === "spend") run.spend.push(rec.v as SpendEntry);
    else if (kind === "hysa") run.hysa.push(rec.v as HysaDeposit);
    else if (kind === "body") run.body.push(rec.v as BodyEntry);
  }
  for (const r of Object.values(runs)) {
    const byDate = (a: { date: string }, b: { date: string }) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    r.spend.sort(byDate);
    r.hysa.sort(byDate);
    r.body.sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
  }
  const prof = records[K.profile]?.v as Partial<PersonalProfile> | undefined;
  const settings = { ...DEFAULT_SETTINGS, ...(records[K.settings]?.v as Partial<Settings> | undefined) };
  runOf(RUN.id);
  return {
    activeRunId: meta?.activeRunId ?? RUN.id,
    profile: mergeProfile(PLACEHOLDER_PROFILE, prof),
    profileImported: !!prof,
    settings: { ...settings, overrides: { ...settings.overrides } },
    runs,
  };
}

/** Last-write-wins: take each remote record that is newer than ours. Returns the merged map and the keys where local is newer (to push). */
export function mergeRemote(local: Records, remote: Records): { merged: Records; localNewer: string[] } {
  const merged: Records = { ...local };
  for (const [k, r] of Object.entries(remote)) {
    const l = merged[k];
    if (!l || r.u > l.u) merged[k] = r;
  }
  const localNewer = Object.keys(local).filter((k) => !remote[k] || local[k]!.u > remote[k]!.u);
  return { merged, localNewer };
}

export type { RunData };
