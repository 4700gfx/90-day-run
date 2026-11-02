// Collections pipeline + collections fund ledger. Pure functions.
import { COLLECTION_STATUSES } from "../config/run.config";
import type { CollectionAccountDef } from "../config/profile";
import type { ISODate } from "./types";

export type CollectionStatus = (typeof COLLECTION_STATUSES)[number];
export const STATUS_LABEL: Record<CollectionStatus, string> = {
  not_started: "Not started",
  validation_sent: "Validation letter sent",
  response_received: "Response received",
  pfd_offer: "Written PFD offer",
  paid: "Paid",
  deletion_confirmed: "Deletion confirmed",
};

export interface CollectionStep {
  date?: ISODate;
  tracking?: string; // certified mail tracking #
  amount?: number; // offer (pfd_offer) or amount paid (paid)
  notes?: string;
  fileRef?: string;
}
export interface CollectionState {
  id: string;
  status: CollectionStatus;
  steps: Partial<Record<CollectionStatus, CollectionStep>>;
  updatedAt: string;
}
export interface FundEntry {
  id: string;
  date: ISODate;
  amount: number;
  note?: string;
  updatedAt: string;
  deleted?: boolean;
}

export const statusIndex = (s: CollectionStatus) => COLLECTION_STATUSES.indexOf(s);
export const emptyCollection = (id: string): CollectionState => ({ id, status: "not_started", steps: {}, updatedAt: "" });

/** Cleared = paid with a written pay-for-delete (deletion confirmation is the final step after). */
export const isCleared = (c: CollectionState | undefined) => !!c && statusIndex(c.status) >= statusIndex("paid");

/** Accounts cleared on or before `date` (uses the paid date; undated paid accounts count). */
export function clearedBy(states: Record<string, CollectionState>, date: ISODate): number {
  return Object.values(states).filter((c) => isCleared(c) && (!c.steps.paid?.date || c.steps.paid.date <= date)).length;
}

/** Move an account to `status`, stamping the step's date (default `today`) and keeping earlier step data. */
export function advance(c: CollectionState, status: CollectionStatus, today: ISODate, data: CollectionStep = {}): CollectionState {
  const prev = c.steps[status] ?? {};
  return { ...c, status, steps: { ...c.steps, [status]: { ...prev, date: prev.date ?? today, ...data } } };
}
/** Step back one status (undo), keeping the entered data so redoing it is quick. */
export function stepBack(c: CollectionState): CollectionState {
  const i = statusIndex(c.status);
  return i <= 0 ? c : { ...c, status: COLLECTION_STATUSES[i - 1]! };
}

export interface LedgerRow {
  id: string;
  date: ISODate;
  kind: "deposit" | "payment";
  label: string;
  amount: number; // + deposit, − payment
  balance: number;
}

/** Fund deposits (records) + payments derived from paid collection steps, with a running balance. */
export function fundLedger(deposits: FundEntry[], states: Record<string, CollectionState>, accounts: CollectionAccountDef[]): LedgerRow[] {
  const rows: Omit<LedgerRow, "balance">[] = deposits
    .filter((d) => !d.deleted)
    .map((d) => ({ id: d.id, date: d.date, kind: "deposit" as const, label: d.note || "Deposit", amount: d.amount }));
  for (const a of accounts) {
    const c = states[a.id];
    const paid = c?.steps.paid;
    if (isCleared(c) && paid?.amount) rows.push({ id: `pay-${a.id}`, date: paid.date ?? "", kind: "payment", label: `Paid ${a.name}`, amount: -paid.amount });
  }
  rows.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.kind === "deposit" ? -1 : 1));
  let bal = 0;
  return rows.map((r) => ({ ...r, balance: (bal = Math.round((bal + r.amount) * 100) / 100) }));
}
