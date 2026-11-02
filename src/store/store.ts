// Offline-first store: every write lands in localStorage immediately, then
// syncs to /api/sync in the background (per-record last-write-wins).
import { useMemo, useSyncExternalStore } from "react";
import { derive, mergeRemote, recordsFromLegacy, type Rec, type Records } from "./records";

const LS_KEY = "run90_v3";
const LEGACY_KEY = "run90"; // single-file app data (v0/v2)
const LEGACY_TIME = "run90_t";
const LEGACY_CODE = "run90_key";

export type SyncStatus = "local" | "syncing" | "synced" | "offline" | "error";

interface Persisted {
  records: Records;
  dirty: string[];
  syncCode: string;
  lastSync: number;
}
export interface StoreState extends Persisted {
  status: SyncStatus;
  error?: string;
}

const ls = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage full or blocked: data stays in memory and still syncs */
    }
  },
};

function initialState(): StoreState {
  const saved = ls.get(LS_KEY);
  if (saved) {
    try {
      const p = JSON.parse(saved) as Persisted;
      return { ...p, status: p.syncCode ? "syncing" : "local" };
    } catch {
      /* fall through to a fresh migration */
    }
  }
  // First launch of this version: migrate the old app's local data. Records are
  // stamped with the old save time (or 1 if there was none) so anything newer
  // already on the server always wins.
  const raw = ls.get(LEGACY_KEY);
  let legacy: unknown = null;
  try {
    legacy = raw ? JSON.parse(raw) : null;
  } catch {
    legacy = null;
  }
  const u = Number(ls.get(LEGACY_TIME)) || 1;
  const records = recordsFromLegacy(legacy, u);
  const syncCode = ls.get(LEGACY_CODE) || "";
  const s: StoreState = { records, dirty: Object.keys(records), syncCode, lastSync: 0, status: syncCode ? "syncing" : "local" };
  persist(s);
  return s;
}

function persist(s: StoreState) {
  const p: Persisted = { records: s.records, dirty: s.dirty, syncCode: s.syncCode, lastSync: s.lastSync };
  ls.set(LS_KEY, JSON.stringify(p));
}

let state: StoreState = initialState();
const listeners = new Set<() => void>();
function setState(patch: Partial<StoreState>, save = true) {
  state = { ...state, ...patch };
  if (save) persist(state);
  listeners.forEach((l) => l());
}

export const getState = () => state;
export const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

// ---------------------------------------------------------------- writes

export function putMany(entries: [string, unknown][]) {
  const records = { ...state.records };
  const dirty = new Set(state.dirty);
  const now = Date.now();
  for (const [k, v] of entries) {
    const prev = records[k];
    records[k] = { v, u: Math.max(now, (prev?.u ?? 0) + 1) };
    dirty.add(k);
  }
  setState({ records, dirty: [...dirty] });
  scheduleSync();
}
export const put = (k: string, v: unknown) => putMany([[k, v]]);

/** Replace everything (backup import). New timestamps so the import wins everywhere. */
export function replaceAll(records: Records) {
  const now = Date.now();
  const stamped: Records = {};
  for (const [k, r] of Object.entries(records)) stamped[k] = { v: r.v, u: now };
  setState({ records: { ...state.records, ...stamped }, dirty: Object.keys(stamped) });
  scheduleSync(0);
}

export function setSyncCode(code: string) {
  setState({ syncCode: code, lastSync: 0, dirty: Object.keys(state.records), status: code ? "syncing" : "local" });
  ls.set(LEGACY_CODE, code);
  scheduleSync(0);
}

// ---------------------------------------------------------------- sync

let timer: ReturnType<typeof setTimeout> | undefined;
let inflight = false;
let again = false;

export function scheduleSync(ms = 800) {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), ms);
}

export async function syncNow(): Promise<void> {
  if (!state.syncCode) {
    if (state.status !== "local") setState({ status: "local" }, false);
    return;
  }
  if (inflight) {
    again = true;
    return;
  }
  inflight = true;
  const sent = state.dirty;
  const changes: Records = {};
  for (const k of sent) if (state.records[k]) changes[k] = state.records[k]!;
  setState({ status: "syncing" }, false);
  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: state.syncCode, changes }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `HTTP ${res.status}`);
    const j = (await res.json()) as { records: Records; legacy: { json?: string; updated?: number } | null };
    let local = state.records;
    const dirty = new Set(state.dirty.filter((k) => !sent.includes(k) || state.records[k] !== changes[k]));
    if (j.legacy?.json) {
      // First sync on this code: the server still has old-app data. Migrate it; newer records win.
      let raw: unknown = null;
      try {
        raw = JSON.parse(j.legacy.json);
      } catch {
        raw = null;
      }
      const fromLegacy = recordsFromLegacy(raw, Number(j.legacy.updated) || 1);
      const m = mergeRemote(local, fromLegacy);
      for (const k of Object.keys(fromLegacy)) if (m.merged[k] === fromLegacy[k]) dirty.add(k);
      local = m.merged;
    }
    const { merged, localNewer } = mergeRemote(local, j.records || {});
    localNewer.forEach((k) => dirty.add(k));
    setState({ records: merged, dirty: [...dirty], lastSync: Date.now(), status: "synced", error: undefined });
    if (dirty.size) again = true;
  } catch (e) {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    setState({ status: offline ? "offline" : "error", error: (e as Error).message }, false);
  } finally {
    inflight = false;
    if (again) {
      again = false;
      scheduleSync(1500);
    }
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => scheduleSync(0));
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && scheduleSync(0));
  setInterval(() => document.visibilityState === "visible" && scheduleSync(0), 60_000);
  scheduleSync(0);
}

// ---------------------------------------------------------------- hooks

export const useStore = () => useSyncExternalStore(subscribe, getState);
export function useData() {
  const s = useStore();
  const d = useMemo(() => derive(s.records), [s.records]);
  return { ...d, store: s };
}

export type { Rec, Records };
