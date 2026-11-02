import { useEffect, useMemo, useState } from "react";
import { RUN, buildRunConfig } from "../config/run.config";
import { todayIn } from "../engine/dates";
import { evaluateRun, runStats } from "../engine/evaluate";
import { jobCounts } from "../engine/jobs";
import { useData } from "../store/store";

function nowParts() {
  const now = new Date();
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: RUN.timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  return { today: todayIn(RUN.timezone, now), hm };
}

/** Today's date + HH:MM in the run timezone, refreshed every 30s. */
export function useClock() {
  const [t, setT] = useState(nowParts);
  useEffect(() => {
    const id = setInterval(() => setT(nowParts()), 30_000);
    return () => clearInterval(id);
  }, []);
  return t;
}

export function useRun() {
  const data = useData();
  const clock = useClock();
  const run = data.runs[data.activeRunId]!;
  const cfg = useMemo(() => buildRunConfig(data.profile, data.settings.overrides), [data.profile, data.settings.overrides]);
  const inputs = useMemo(() => ({ ...run, jobCounts: jobCounts(run.jobs) }), [run]);
  const ev = useMemo(() => evaluateRun(inputs, cfg, clock.today), [inputs, cfg, clock.today]);
  const stats = useMemo(() => runStats(ev), [ev]);
  const lifts = data.settings.liftNames ?? data.profile.body.lifts;
  return { ...data, run, inputs, cfg, ev, stats, clock, lifts };
}

export type RunCtx = ReturnType<typeof useRun>;
