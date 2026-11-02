// Sunday review: everything the app already knows about a run week, pre-filled.
import type { PersonalProfile } from "../config/profile";
import { GRACE_HABITS, HABITS, type RunConfig } from "../config/run.config";
import { LIFT_SLOTS, liftValue, type BodyCheck } from "./body";
import { STATUS_LABEL, type CollectionState } from "./collections";
import { dateForDay, weekRange, weekday } from "./dates";
import { appliesOn, weekSummary, type RunEvaluation } from "./evaluate";
import { RESPONDED, live, type JobApp } from "./jobs";
import { allowanceToDate, hysaBalance, monthToDateSpend } from "./money";
import type { RunInputs } from "./types";

export const REVIEW_TEXT_FIELDS = [
  { id: "biggestWin", label: "Biggest win" },
  { id: "whatCostMe", label: "What cost me" },
  { id: "fixNextWeek", label: "Fix for next week" },
] as const;

export const REVIEW_AUTO_FIELDS = [
  { id: "weight", label: "Weight (lb)", group: "Body" },
  { id: "waist", label: "Waist (in)", group: "Body" },
  { id: "topSets", label: "Top sets", group: "Body" },
  { id: "energy", label: "Energy (avg)", group: "Body" },
  { id: "weekSpend", label: "Week spend", group: "Money" },
  { id: "mtd", label: "MTD vs allowance", group: "Money" },
  { id: "hysa", label: "HYSA balance", group: "Money" },
  { id: "collections", label: "Collections step", group: "Money" },
  { id: "applies", label: "Applications", group: "Output" },
  { id: "responses", label: "Responses (to date)", group: "Output" },
  { id: "chapters", label: "Chapters", group: "Output" },
  { id: "commits", label: "Commit days", group: "Output" },
  { id: "wonDays", label: "Won days", group: "Run" },
  { id: "floorDays", label: "Floor Days", group: "Run" },
  { id: "graceUsed", label: "Grace used on", group: "Run" },
  { id: "extendedUsed", label: "Extended Grace used on", group: "Run" },
] as const;

export type ReviewFieldId = (typeof REVIEW_AUTO_FIELDS)[number]["id"] | (typeof REVIEW_TEXT_FIELDS)[number]["id"];

export interface ReviewExtras {
  body: (BodyCheck & { deleted?: boolean })[];
  collections: Record<string, CollectionState>;
  jobs: JobApp[];
  lifts: string[];
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const usd = (n: number) => `$${(Math.round(n * 100) / 100).toLocaleString("en-US")}`;

export function reviewPrefill(ev: RunEvaluation, inputs: RunInputs, cfg: RunConfig, profile: PersonalProfile, x: ReviewExtras, week: number): Record<string, string> {
  const { first, last, days: n } = weekRange(week, cfg);
  const start = dateForDay(first, cfg);
  const end = dateForDay(last, cfg);
  const days = ev.days.slice(first - 1, last);
  const logs = days.map((d) => inputs.days[d.date]);
  const ws = weekSummary(ev, week, cfg);

  // Body: the check-in dated inside the week (latest), else the most recent before it.
  const body = x.body.filter((b) => !b.deleted && b.weekStart <= end).sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
  const inWeek = body.filter((b) => b.weekStart >= start);
  const bc = inWeek[inWeek.length - 1] ?? body[body.length - 1];
  const energies = logs.map((l) => l?.energy).filter((v): v is NonNullable<typeof v> => v != null);

  const out: Record<string, string> = {
    weight: bc?.weight != null ? String(bc.weight) : "",
    waist: bc?.waist != null ? String(bc.waist) : "",
    topSets: bc
      ? LIFT_SLOTS.map((s, i) => {
          const v = liftValue(bc, s, i);
          return v ? `${x.lifts[i] ?? `Lift ${i + 1}`} ${v}` : "";
        })
          .filter(Boolean)
          .join(" · ")
      : "",
    energy: energies.length ? (energies.reduce((a, b) => a + b, 0) / energies.length).toFixed(1) : "",
    weekSpend: usd(ws.spend.total),
    mtd: `${usd(monthToDateSpend(inputs.spend, end))} / ${usd(allowanceToDate(end, cfg))}`,
    hysa: usd(hysaBalance(inputs.hysa, end)),
    collections: profile.collections
      .map((a) => {
        const c = x.collections[a.id];
        return c && c.status !== "not_started" ? `${a.name}: ${STATUS_LABEL[c.status]}` : "";
      })
      .filter(Boolean)
      .join(" · "),
    applies: `${days.reduce((s, d) => s + appliesOn(inputs, d.date), 0)}/${cfg.applyTarget * n}`,
    responses: String(live(x.jobs).filter((j) => j.date <= end && RESPONDED.includes(j.status)).length),
    chapters: `${logs.filter((l) => l?.habits.read === true).length}/${n}`,
    commits: `${logs.filter((l) => l?.habits.commit === true).length}/${n}`,
    wonDays: `${ws.won}/${n}`,
    floorDays: String(ws.floorDays),
    graceUsed: "",
    extendedUsed: "",
  };
  const grace: string[] = [];
  const extended: string[] = [];
  for (const d of days)
    for (const h of GRACE_HABITS) {
      const k = d.grace[h]?.kind;
      const name = HABITS.find((x) => x.id === h)!.label;
      if (k === "grace") grace.push(`${name} (${DAY[weekday(d.date)]})`);
      if (k === "extended") extended.push(`${name} (${DAY[weekday(d.date)]})`);
    }
  out.graceUsed = grace.join(", ") || "none";
  out.extendedUsed = extended.join(", ") || "none";
  return out;
}
