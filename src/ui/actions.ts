// Writes shared by several screens.
import { SPEND } from "../config/run.config";
import { capCheck } from "../engine/money";
import type { SpendEntry } from "../engine/types";
import { K } from "../store/records";
import { put, putMany } from "../store/store";
import { emptyLog, money, newId } from "./common";
import type { RunCtx } from "./useRun";

/** Add a spend entry, enforcing hard caps (blocked above 100% unless the user overrides). */
export function addSpend(ctx: RunCtx, e: { date: string; amount: number; category: string; note?: string }): boolean {
  const cat = ctx.profile.spendCategories.find((c) => c.id === e.category);
  if (cat?.hardCap) {
    const chk = capCheck(ctx.run.spend, cat, e.date, e.amount, SPEND.hardCapWarnAt);
    if (chk.level === "block" && !confirm(`${cat.label} has a hard cap of ${money(chk.budget)} this month. This would put it at ${money(chk.after)}.\n\nAdd it anyway?`)) return false;
  }
  const id = newId();
  const entry: SpendEntry = { id, date: e.date, amount: Math.round(e.amount * 100) / 100, category: e.category, note: e.note || undefined, updatedAt: new Date().toISOString() };
  put(K.spend(ctx.activeRunId, id), entry);
  return true;
}

export function updateSpend(ctx: RunCtx, e: SpendEntry, patch: Partial<SpendEntry>) {
  put(K.spend(ctx.activeRunId, e.id), { ...e, ...patch, updatedAt: new Date().toISOString() });
}

export const removeSpend = (ctx: RunCtx, e: SpendEntry) => updateSpend(ctx, e, { deleted: true });

/** Reset a day: habits, applies, check-in, notes and its spend entries. HYSA deposits are kept. */
export function clearDay(ctx: RunCtx, date: string) {
  const now = new Date().toISOString();
  const writes: [string, unknown][] = [[K.day(ctx.activeRunId, date), { ...emptyLog(date), updatedAt: now }]];
  for (const e of ctx.run.spend) if (e.date === date && !e.deleted) writes.push([K.spend(ctx.activeRunId, e.id), { ...e, deleted: true, updatedAt: now }]);
  putMany(writes);
}
