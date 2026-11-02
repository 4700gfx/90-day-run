// Plain-language observations about a run week, for the Week view and the Sunday review.
// Only says things the data supports; returns nothing for a week with no logged days.
import type { PersonalProfile } from "../config/profile";
import { GRACE_HABITS, type HabitId, type RunConfig } from "../config/run.config";
import { weekRange, weekday } from "./dates";
import { weekSummary, type RunEvaluation } from "./evaluate";
import type { DayResult, RunInputs } from "./types";

export interface Insight {
  tone: "good" | "warn" | "info";
  text: string;
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const NAMES: Record<HabitId, string> = { workout: "workout", spend: "spend", hysa: "HYSA", meals: "meal prep", commit: "commits", apply: "applications", read: "reading" };
const label = (h: HabitId) => NAMES[h];
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const r1 = (n: number) => Math.round(n * 10) / 10;
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** What cost a lost day, in words. */
export function lossCauses(d: DayResult): string[] {
  const out: string[] = [];
  if (d.strict.workout === "miss") out.push("workout");
  if (d.strict.spend === "miss") out.push("spend over allowance");
  if (d.strict.hysa === "miss") out.push("payday deposit");
  for (const h of GRACE_HABITS) {
    const g = d.grace[h];
    if (g?.kind === "illegal") out.push(`${label(h)} (${g.reason === "consecutive" ? "2nd miss in a row" : "no grace left"})`);
  }
  return out;
}

export function weekInsights(ev: RunEvaluation, inputs: RunInputs, cfg: RunConfig, week: number, profile: PersonalProfile): Insight[] {
  const { first, last } = weekRange(week, cfg);
  const days = ev.days.slice(first - 1, last).filter((d) => d.status === "WON" || d.status === "LOST");
  if (!days.length) return [];
  const out: Insight[] = [];
  const won = days.filter((d) => d.status === "WON");
  const lost = days.filter((d) => d.status === "LOST");

  // 1. Result vs last week.
  let vs = "";
  if (week > 1) {
    const prev = weekSummary(ev, week - 1, cfg);
    const prevDecided = ev.days.slice((week - 2) * 7, (week - 1) * 7).filter((d) => d.status === "WON" || d.status === "LOST").length;
    if (prevDecided) vs = ` (last week: ${prev.won}/${prevDecided})`;
  }
  out.push({ tone: lost.length ? (won.length >= days.length * 0.7 ? "info" : "warn") : "good", text: `Won ${won.length} of ${days.length} days${vs}.` });

  // 2. What lost days.
  for (const d of lost) {
    const log = inputs.days[d.date];
    const causes = lossCauses(d);
    const why = log?.lostReason ? ` You noted: "${log.lostReason}".` : "";
    out.push({ tone: "warn", text: `${DAY[weekday(d.date)]} (Day ${d.dayNum}) was lost on ${causes.join(", ") || "an unlogged day"}.${why}` });
  }

  // 3. Weakest habit this week.
  const misses: [HabitId, number][] = [];
  const count = (h: HabitId, pred: (d: DayResult) => boolean) => misses.push([h, days.filter(pred).length]);
  count("workout", (d) => d.strict.workout === "miss");
  for (const h of GRACE_HABITS) count(h, (d) => !!d.grace[h] && d.grace[h]!.kind !== "hit" && d.grace[h]!.kind !== "unknown");
  misses.sort((a, b) => b[1] - a[1]);
  const [worst, n] = misses[0]!;
  if (n >= 2) out.push({ tone: "warn", text: `Most-missed habit: ${label(worst)} (${n} misses). Plan its Floor Day minimum for next week.` });
  else if (n === 0) out.push({ tone: "good", text: "No habit misses at all this week." });

  // 4. Grace spent: those habits have no cushion left this week.
  const ws = weekSummary(ev, week, cfg);
  const usedUp = GRACE_HABITS.filter((h) => ws.grace[h] && ws.grace[h]!.remaining === 0 && !ws.grace[h]!.broken);
  if (usedUp.length) out.push({ tone: "info", text: `Grace used on ${usedUp.map(label).join(", ")}. Another miss this week would lose the day.` });

  // 5. Spend.
  const spent = days.reduce((s, d) => s + d.spend.today, 0);
  const pace = cfg.dailyAllowance * days.length;
  const bigDays = days.filter((d) => d.spend.today > cfg.dailyAllowance * 2);
  const byCat: Record<string, number> = {};
  for (const e of inputs.spend) if (!e.deleted && days.some((d) => d.date === e.date)) byCat[e.category] = (byCat[e.category] ?? 0) + e.amount;
  const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  const catName = (id: string) => profile.spendCategories.find((c) => c.id === id)?.label ?? id;
  let spendText = `Spent ${usd(spent)} vs a ${usd(pace)} pace (${usd(cfg.dailyAllowance)}/day).`;
  if (top && spent > 0) spendText += ` Biggest category: ${catName(top[0])} (${usd(top[1])}, ${Math.round((top[1] / spent) * 100)}%).`;
  out.push({ tone: spent > pace ? "warn" : "good", text: spendText });
  if (bigDays.length) out.push({ tone: "info", text: `Big spend days: ${bigDays.map((d) => `${DAY[weekday(d.date)]} ${usd(d.spend.today)}`).join(", ")}.` });

  // 6. Applications.
  const apps = days.reduce((s, d) => s + (inputs.days[d.date]?.appliesCount ?? 0), 0);
  const appTarget = cfg.applyTarget * days.length;
  out.push({ tone: apps >= appTarget ? "good" : "info", text: `${apps} applications of ${appTarget} planned for these ${days.length} days.` });

  // 7. Sleep / energy vs outcome (only when both won and lost days have data).
  const sleepOf = (ds: DayResult[]) => ds.map((d) => inputs.days[d.date]?.sleepHours).filter((x): x is number => typeof x === "number");
  const sw = sleepOf(won);
  const sl = sleepOf(lost);
  if (sw.length && sl.length && avg(sw) - avg(sl) >= 0.5)
    out.push({ tone: "info", text: `Lost days averaged ${r1(avg(sl))}h sleep vs ${r1(avg(sw))}h on won days. Protect lights-out.` });
  const energy = days.map((d) => inputs.days[d.date]?.energy).filter((x): x is NonNullable<typeof x> => x != null);
  if (energy.length >= 3) {
    const lowDays = days.filter((d) => (inputs.days[d.date]?.energy ?? 5) <= 2);
    out.push({ tone: avg(energy) < 3 ? "warn" : "info", text: `Average energy ${r1(avg(energy))}/5${lowDays.length ? `; low on ${lowDays.map((d) => DAY[weekday(d.date)]).join(", ")}` : ""}.` });
  }

  // 8. Floor Days.
  if (ws.floorDays >= 3) out.push({ tone: "warn", text: `${ws.floorDays} Floor Days this week. If this repeats next week, the schedule needs a fix.` });

  // 9. Recurring weak weekday across the run so far (needs 2+ losses on the same weekday).
  const byDow: Record<number, number> = {};
  for (const d of ev.days) if (d.status === "LOST") byDow[weekday(d.date)] = (byDow[weekday(d.date)] ?? 0) + 1;
  const [dow, losses] = Object.entries(byDow).sort((a, b) => b[1] - a[1])[0] ?? [];
  if (losses && losses >= 2) out.push({ tone: "info", text: `${DAY[Number(dow)]} is your most-lost weekday so far (${losses} times).` });

  return out;
}
