// Personal profile: money, debts and body numbers. This repo is public, so only
// PLACEHOLDER values are committed. The real profile lives in a gitignored
// `profile.local.json` and is imported once through Settings, after which it is
// stored with the rest of the run's data (and synced) — never in source.

export interface SpendCategory {
  id: string;
  label: string;
  monthly: number;
  /** Extra budget in 31-day months. */
  bonus31?: number;
  /** Warn at 80%, block at 100% (with override confirmation). */
  hardCap?: boolean;
}

export interface CollectionAccountDef {
  id: string;
  name: string;
  estAmount: number;
  order: number;
  targetDate?: string;
}

export interface PersonalProfile {
  hysa: {
    bank: string;
    openingDeposit: { date: string; amount: number };
    paydayDeposit: number;
    paydays: string[];
    targetDay90: number;
    stretch: number;
    milestone?: { label: string; amount: number };
  };
  spendCategories: SpendCategory[];
  collections: CollectionAccountDef[];
  collectionsFundMonthly: number;
  body: {
    startWeight?: number;
    targetWeight?: number;
    /** 2-week average that switches Build → Hold. */
    buildToHoldAvg?: number;
    holdRange?: [number, number];
    proteinTarget?: [number, number];
    supplements: string[];
    lifts: string[];
  };
  /** Money/debt targets per check-in day (won days + applications live in run.config). */
  checkinTargets: Record<number, { hysa?: number; collectionsCleared?: number }>;
  moneyMilestones: { date: string; label: string }[];
}

export const PLACEHOLDER_PROFILE: PersonalProfile = {
  hysa: {
    bank: "My HYSA",
    openingDeposit: { date: "2026-11-01", amount: 0 },
    paydayDeposit: 100,
    paydays: [],
    targetDay90: 1000,
    stretch: 1500,
  },
  spendCategories: [
    { id: "eatout", label: "Eating out", monthly: 200 },
    { id: "fun", label: "Fun / going out", monthly: 150 },
    { id: "shop", label: "Shopping", monthly: 100 },
    { id: "misc", label: "Misc", monthly: 100 },
    { id: "transport", label: "Transport extras", monthly: 50 },
  ],
  collections: [],
  collectionsFundMonthly: 0,
  body: { supplements: [], lifts: ["Lift 1", "Lift 2", "Lift 3"] },
  checkinTargets: {},
  moneyMilestones: [],
};

/** Shallow-merge an imported/partial profile over the placeholder. */
export function mergeProfile(base: PersonalProfile, p: Partial<PersonalProfile> = {}): PersonalProfile {
  return {
    ...base,
    ...p,
    hysa: { ...base.hysa, ...p.hysa },
    body: { ...base.body, ...p.body },
  };
}
