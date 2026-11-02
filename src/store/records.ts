// The persisted + synced form of all data: a flat map of records, each with its
// own updatedAt (`u`). Domain objects (runs, profile, settings) are derived from it.
import { PLACEHOLDER_PROFILE, mergeProfile, type PersonalProfile } from "../config/profile";
import { RUN, type ConfigOverrides } from "../config/run.config";
import { migrate, type BodyEntry, type RunData, type StoreV3 } from "../data/migrate";
import type { BodyPhase } from "../engine/body";
import { emptyCollection, type CollectionState, type FundEntry } from "../engine/collections";
import type { JobApp } from "../engine/jobs";
import type { OssuItem } from "../config/run.config";
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
  /** Names for the 3 tracked lifts (overrides the profile). */
  liftNames?: string[];
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
  milestones: (r: string) => `run/${r}/milestones`,
  collection: (r: string, id: string) => `run/${r}/collection/${id}`,
  fund: (r: string, id: string) => `run/${r}/fund/${id}`,
  weekNote: (r: string, week: number) => `run/${r}/weeknote/${week}`,
  job: (r: string, id: string) => `run/${r}/job/${id}`,
  ossu: (r: string) => `run/${r}/ossu`,
  bodyPhase: (r: string) => `run/${r}/bodyphase`,
  review: (r: string, week: number) => `run/${r}/review/${week}`,
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
  milestones: Record<string, boolean>;
  collections: Record<string, CollectionState>;
  fund: FundEntry[];
  weekNotes: Record<number, string>;
  jobs: JobApp[];
  ossu?: OssuItem[];
  bodyPhase: { phase: BodyPhase; since?: string };
  reviews: Record<number, WeeklyReview>;
}

export interface WeeklyReview {
  runWeek: number;
  fields: Record<string, string>;
  savedAt?: string;
  updatedAt: string;
  deleted?: boolean;
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
    (runs[id] ??= { id, name: id, archived: false, startDate: RUN.startDate, lengthDays: RUN.lengthDays, days: {}, spend: [], hysa: [], body: [], day0: {}, milestones: {}, collections: {}, fund: [], weekNotes: {}, jobs: [], bodyPhase: { phase: "build" }, reviews: {} });
  for (const [k, rec] of Object.entries(records)) {
    const m = /^run\/([^/]+)\/([^/]+)(?:\/(.+))?$/.exec(k);
    if (!m) continue;
    const [, id, kind] = m as unknown as [string, string, string];
    const run = runOf(id);
    if (kind === "info") Object.assign(run, rec.v as RunInfo);
    else if (kind === "day0") run.day0 = rec.v as Record<string, boolean>;
    else if (kind === "milestones") run.milestones = rec.v as Record<string, boolean>;
    else if (kind === "collection") {
      const c = rec.v as CollectionState;
      run.collections[c.id] = c;
    } else if (kind === "fund") run.fund.push(rec.v as FundEntry);
    else if (kind === "job") run.jobs.push(rec.v as JobApp);
    else if (kind === "ossu") run.ossu = rec.v as OssuItem[];
    else if (kind === "bodyphase") run.bodyPhase = rec.v as RunView["bodyPhase"];
    else if (kind === "review") {
      const rv = rec.v as WeeklyReview;
      if (!rv.deleted) run.reviews[rv.runWeek] = rv;
    } else if (kind === "weeknote") run.weekNotes[Number(m[3])] = (rec.v as { text: string }).text;
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
    r.fund.sort(byDate);
    r.jobs.sort(byDate);
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

/**
 * Writes that reset a run: every record is copied into a new archived run (nothing is lost),
 * then the active run's logs are blanked. Profile, settings and the OSSU map are kept.
 */
export function resetRunWrites(records: Records, run: RunInfo, today: string, now: string, suffix: string): [string, unknown][] {
  const prefix = `run/${run.id}/`;
  const archId = `${run.id}-reset-${today.replace(/-/g, "")}-${suffix}`;
  const writes: [string, unknown][] = [
    [K.info(archId), { id: archId, name: `${run.name} (reset ${today})`, archived: true, startDate: run.startDate, lengthDays: run.lengthDays } satisfies RunInfo],
  ];
  for (const [k, rec] of Object.entries(records)) {
    if (!k.startsWith(prefix)) continue;
    const rest = k.slice(prefix.length);
    const kind = rest.split("/")[0]!;
    if (kind === "info" || kind === "legacy") continue;
    writes.push([`run/${archId}/${rest}`, rec.v]);
    const v = rec.v as Record<string, unknown>;
    if (kind === "day") writes.push([k, { date: v.date as string, habits: {}, floorDay: false, appliesCount: 0, updatedAt: now } satisfies DayLog]);
    else if (["spend", "hysa", "fund", "job", "body", "review"].includes(kind)) writes.push([k, { ...v, deleted: true, updatedAt: now }]);
    else if (kind === "collection") writes.push([k, { ...emptyCollection(v.id as string), updatedAt: now }]);
    else if (kind === "milestones" || kind === "day0") writes.push([k, {}]);
    else if (kind === "weeknote") writes.push([k, { text: "", updatedAt: now }]);
    else if (kind === "bodyphase") writes.push([k, { phase: "build" }]);
    // "ossu" is kept on purpose: course progress is real progress.
  }
  return writes;
}
