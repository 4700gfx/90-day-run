// Day 30/60/90 scorecards and the milestone timeline. Pure functions.
import type { PersonalProfile } from "../config/profile";
import { CHECKINS, HOLIDAYS, PHASE2_START, READING_PLAN, type RunConfig } from "../config/run.config";
import { dateForDay } from "./dates";
import type { RunEvaluation } from "./evaluate";
import { hysaBalance } from "./money";
import type { HysaDeposit, ISODate, RunInputs } from "./types";

export type MetricId = "wonDays" | "applications" | "hysa" | "collectionsCleared";
export interface ScoreMetric {
  id: MetricId;
  label: string;
  target: number;
  actual: number | null; // null = not tracked yet
  met: boolean | null; // null until the check-in unlocks (or untracked)
  money?: boolean;
}
export interface Scorecard {
  day: number;
  date: ISODate;
  unlocked: boolean;
  metrics: ScoreMetric[];
  metCount: number;
}

export interface ScoreInputs extends RunInputs {
  /** Collections cleared by a date; undefined until Money tracks collections. */
  collectionsClearedBy?: (date: ISODate) => number;
}

export function scorecards(ev: RunEvaluation, inputs: ScoreInputs, cfg: RunConfig, profile: PersonalProfile): Scorecard[] {
  return CHECKINS.map((c) => {
    const unlocked = ev.today >= c.date;
    // Actuals as of the check-in date, or as of today while it's still locked.
    const asOf = unlocked ? c.date : ev.today;
    const days = ev.days.filter((d) => d.date <= asOf);
    const won = days.filter((d) => d.status === "WON").length;
    let apps = 0;
    for (let n = 1; n <= c.day; n++) {
      const date = dateForDay(n, cfg);
      if (date > asOf) break;
      apps += inputs.days[date]?.appliesCount ?? 0;
    }
    const money = profile.checkinTargets[c.day] ?? {};
    const metrics: ScoreMetric[] = [
      { id: "wonDays", label: "Won days", target: c.targets.wonDays, actual: won, met: null },
      { id: "applications", label: "Applications", target: c.targets.applications, actual: apps, met: null },
    ];
    if (money.hysa != null) metrics.push({ id: "hysa", label: "HYSA balance", target: money.hysa, actual: hysaBalance(inputs.hysa as HysaDeposit[], asOf), met: null, money: true });
    if (money.collectionsCleared != null)
      metrics.push({ id: "collectionsCleared", label: "Collections cleared", target: money.collectionsCleared, actual: inputs.collectionsClearedBy ? inputs.collectionsClearedBy(asOf) : null, met: null });
    for (const m of metrics) m.met = unlocked && m.actual != null ? m.actual >= m.target : null;
    return { day: c.day, date: c.date, unlocked, metrics, metCount: metrics.filter((m) => m.met).length };
  });
}

export type MilestoneKind = "money" | "book" | "checkin" | "school" | "holiday";
export interface Milestone {
  id: string;
  date: ISODate;
  label: string;
  kind: MilestoneKind;
  /** Can the user tick it off? (check-ins are scored, holidays just happen) */
  checkable: boolean;
}

export function milestoneTimeline(cfg: RunConfig, profile: PersonalProfile, book3?: string): Milestone[] {
  const items: Milestone[] = [];
  profile.moneyMilestones.forEach((m, i) => items.push({ id: `money:${m.date}:${i}`, date: m.date, label: m.label, kind: "money", checkable: true }));
  for (const r of READING_PLAN) {
    const book = r.editable && book3 ? book3 : r.book;
    items.push({ id: `book:${r.toDay}`, date: dateForDay(r.toDay, cfg), label: `Finish ${book}`, kind: "book", checkable: true });
  }
  for (const c of CHECKINS) items.push({ id: `checkin:${c.day}`, date: c.date, label: `Day ${c.day} check-in`, kind: "checkin", checkable: false });
  items.push({ id: "phase2", date: PHASE2_START, label: "Spring classes start: coursework becomes the study block", kind: "school", checkable: false });
  for (const h of HOLIDAYS) if (h.date !== PHASE2_START) items.push({ id: `holiday:${h.date}`, date: h.date, label: h.label, kind: "holiday", checkable: false });
  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
