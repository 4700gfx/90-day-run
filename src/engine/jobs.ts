// Job application pipeline stats. Pure functions.
import { JOBS, type RunConfig } from "../config/run.config";
import { addDays, dateForDay, dayNumber, weekRange } from "./dates";
import { appliesOn } from "./evaluate";
import type { ISODate, RunInputs } from "./types";

export type JobStatus = (typeof JOBS.statuses)[number];
export interface JobApp {
  id: string;
  date: ISODate;
  company: string;
  role: string;
  source: string;
  link?: string;
  status: JobStatus;
  followUp?: ISODate;
  notes?: string;
  updatedAt: string;
  deleted?: boolean;
}

/** Statuses that mean the company replied (a rejection is still a reply). */
export const RESPONDED: JobStatus[] = ["Response", "Screen", "Interview", "Offer", "Rejected"];
export const live = (jobs: JobApp[]) => jobs.filter((j) => !j.deleted);

export function jobCounts(jobs: JobApp[]): Record<ISODate, number> {
  const out: Record<ISODate, number> = {};
  for (const j of live(jobs)) out[j.date] = (out[j.date] ?? 0) + 1;
  return out;
}

export interface JobStats {
  total: number; // applications in the run (Today counter or pipeline, whichever is higher per day)
  thisWeek: number;
  inPipeline: number;
  responses: number;
  responseRate: number; // responses ÷ total applications
  interviews: number;
  followUpsDue: JobApp[];
  bottleneck: boolean; // Day 30 rule
}

export function jobStats(jobs: JobApp[], inputs: RunInputs, cfg: RunConfig, today: ISODate, week: number): JobStats {
  const j = live(jobs);
  let total = 0;
  for (let n = 0; n <= cfg.lengthDays; n++) {
    const d = dateForDay(n, cfg);
    if (d > today) break;
    total += appliesOn(inputs, d);
  }
  let thisWeek = 0;
  if (week >= 1) {
    const { first, last } = weekRange(week, cfg);
    for (let n = first; n <= last; n++) thisWeek += appliesOn(inputs, dateForDay(n, cfg));
  }
  const responses = j.filter((x) => RESPONDED.includes(x.status)).length;
  const responseRate = total ? responses / total : 0;
  const dayNum = dayNumber(today, cfg);
  return {
    total,
    thisWeek,
    inPipeline: j.length,
    responses,
    responseRate,
    interviews: j.filter((x) => x.status === "Interview" || x.status === "Offer").length,
    followUpsDue: j.filter((x) => x.followUp && x.followUp <= today && !["Rejected", "Ghosted", "Offer"].includes(x.status)).sort((a, b) => (a.followUp! < b.followUp! ? -1 : 1)),
    bottleneck: dayNum >= 30 && total >= JOBS.day30Rule.minApplications && responseRate < JOBS.day30Rule.minResponseRate,
  };
}

/** Default follow-up: one week after applying. */
export const defaultFollowUp = (date: ISODate) => addDays(date, 7);
