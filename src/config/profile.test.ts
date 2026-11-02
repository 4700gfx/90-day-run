import { describe, expect, it } from "vitest";
import { PLACEHOLDER_PROFILE, mergeProfile } from "./profile";
import { buildRunConfig } from "./run.config";

describe("profile", () => {
  it("an imported profile overrides placeholders and feeds the engine config", () => {
    const p = mergeProfile(PLACEHOLDER_PROFILE, { hysa: { ...PLACEHOLDER_PROFILE.hysa, paydayDeposit: 300, paydays: ["2026-11-20", "2026-11-06"] } });
    const cfg = buildRunConfig(p);
    expect(cfg.paydayDeposit).toBe(300);
    expect(cfg.paydays).toEqual(["2026-11-06", "2026-11-20"]);
    expect(p.body.lifts).toHaveLength(3); // untouched sections keep placeholders
  });
  it("Settings overrides beat the profile", () => {
    expect(buildRunConfig(PLACEHOLDER_PROFILE, { paydayDeposit: 50, dailyAllowance: 15 })).toMatchObject({ paydayDeposit: 50, dailyAllowance: 15 });
  });
});
