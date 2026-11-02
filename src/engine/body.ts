// Weekly body check-ins: Build/Hold phase, trends and nutrition alerts. Pure functions.
import type { PersonalProfile } from "../config/profile";
import type { ISODate } from "./types";

export const LIFT_SLOTS = ["l1", "l2", "l3"] as const;
export type LiftSlot = (typeof LIFT_SLOTS)[number];

export interface BodyCheck {
  weekStart: ISODate; // the Sunday (or whatever day) of the weigh-in
  weight?: number;
  waist?: number;
  /** Top set per lift slot, e.g. "185x5". Legacy entries may use the lift's name as the key. */
  lifts: Record<string, string>;
  energyAvg?: number;
  updatedAt: string;
}

export type BodyPhase = "build" | "hold";

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Load of a top set: "185x5", "Bench 185 x 5", "185" → 185. */
export function topSetLoad(s: string | undefined): number | undefined {
  const m = s?.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : undefined;
}

/** Top set for a slot, reading legacy "Lift 1"-style keys too. */
export const liftValue = (e: BodyCheck, slot: LiftSlot, i: number) => e.lifts[slot] ?? e.lifts[`Lift ${i + 1}`];

export interface BodyStatus {
  latest?: BodyCheck;
  avg2?: number; // 2-week average weight (last two weigh-ins)
  ratePerWeek?: number; // change in the 2-week average, lb/week
  waistUp: boolean;
  suggestHold: boolean;
  alerts: { id: string; text: string }[];
}

export function bodyStatus(entries: BodyCheck[], phase: BodyPhase, profile: PersonalProfile): BodyStatus {
  const es = [...entries].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
  const ws = es.map((e) => e.weight).filter((w): w is number => typeof w === "number");
  const waists = es.map((e) => e.waist).filter((w): w is number => typeof w === "number");
  const b = profile.body;
  const avg2 = ws.length ? r2(mean(ws.slice(-2))) : undefined;
  // Two-week average now vs the two weeks before, spread over 2 weeks.
  const ratePerWeek = ws.length >= 3 ? r2((mean(ws.slice(-2)) - mean(ws.slice(-4, -2))) / 2) : undefined;
  const waistUp = waists.length >= 3 && waists[waists.length - 1]! - mean(waists.slice(-3, -1)) >= 0.25;

  const alerts: BodyStatus["alerts"] = [];
  const over = b.holdRange && avg2 != null && avg2 > b.holdRange[1];
  if (over && waistUp) alerts.push({ id: "over-waist", text: "Over the hold range with waist trending up: drop the walnuts and the olive-oil finish." });
  else if ((ratePerWeek != null && ratePerWeek > 0.5) || waistUp) alerts.push({ id: "gain", text: "Gaining faster than 0.5 lb/week or waist trending up: drop the walnuts at lunch." });
  if (phase === "hold" && b.holdRange && avg2 != null && avg2 < b.holdRange[0])
    alerts.push({ id: "under-hold", text: "Below the hold range: add the Build add-on back (1 oz almonds or 1 tbsp olive oil)." });

  // A lift with no increase over the last 2 weeks while weight is steady.
  const steady = ratePerWeek != null && Math.abs(ratePerWeek) <= 0.25;
  if (steady && es.length >= 3) {
    const stalled = LIFT_SLOTS.map((slot, i) => {
      const loads = es.slice(-3).map((e) => topSetLoad(liftValue(e, slot, i)));
      if (loads.some((l) => l == null)) return false;
      return Math.max(loads[1]!, loads[2]!) <= loads[0]!;
    });
    const names = LIFT_SLOTS.map((_, i) => b.lifts[i] ?? `Lift ${i + 1}`).filter((_, i) => stalled[i]);
    if (names.length) alerts.push({ id: "stall", text: `${names.join(", ")} hasn't gone up in 2 weeks while weight is steady: add the Build add-on on lifting days.` });
  }

  return {
    latest: es[es.length - 1],
    avg2,
    ratePerWeek,
    waistUp,
    suggestHold: phase === "build" && b.buildToHoldAvg != null && avg2 != null && ws.length >= 2 && avg2 >= b.buildToHoldAvg,
    alerts,
  };
}
