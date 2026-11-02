import type { HabitId } from "../config/run.config";

export type ISODate = string; // YYYY-MM-DD

export interface DayLog {
  date: ISODate;
  /** Toggle habits only (workout, meals, commit, read). null/undefined = not logged. */
  habits: Partial<Record<HabitId, boolean | null>>;
  floorDay: boolean;
  appliesCount: number;
  energy?: 1 | 2 | 3 | 4 | 5;
  sleepHours?: number;
  mood?: string;
  lostReason?: string;
  note?: string;
  /** Extended Grace token the user confirmed for this day. Clear it to undo. */
  extendedGraceUsedFor?: HabitId;
  mealRescue?: boolean;
  /** User confirmed no spending today (informational; spend is scored from entries). */
  zeroSpend?: boolean;
  creatine?: boolean;
  proteinG?: number;
  updatedAt: string;
}

export interface SpendEntry {
  id: string;
  date: ISODate;
  amount: number;
  category: string;
  note?: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface HysaDeposit {
  id: string;
  date: ISODate;
  amount: number;
  kind: "opening" | "payday" | "bonus";
  updatedAt: string;
  deleted?: boolean;
}

/** What the engine needs to score a run. */
export interface RunInputs {
  days: Record<ISODate, DayLog>;
  spend: SpendEntry[];
  hysa: HysaDeposit[];
  /** Jobs logged in the pipeline per date (applications count = max of this and the Today counter). */
  jobCounts?: Record<ISODate, number>;
}

export type Outcome = "hit" | "miss" | "unknown";
export type GraceResult =
  | { kind: "hit" }
  | { kind: "unknown" }
  | { kind: "grace" } // the week's 1 legal miss
  | { kind: "extended" } // a second miss covered by an Extended Grace token
  | { kind: "illegal"; reason: "consecutive" | "week_limit" | "needs_token" };

export type HysaStatus = "na" | "hit" | "miss" | "pending";
export type DayStatus = "PREP" | "WON" | "LOST" | "PENDING" | "FUTURE";

export interface DayResult {
  date: ISODate;
  dayNum: number; // 0 = prep, 1..90
  week: number; // 0 for prep
  status: DayStatus;
  floorDay: boolean;
  logged: boolean;
  fullyLogged: boolean;
  strict: { workout: Outcome; spend: Outcome; hysa: HysaStatus };
  grace: Record<string, GraceResult>;
  /** Grace habits whose miss would become legal with an Extended Grace token. */
  tokenPrompt: HabitId[];
  spend: { today: number; monthToDate: number; allowance: number; remaining: number };
}
