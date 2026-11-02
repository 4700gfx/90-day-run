import { describe, expect, it } from "vitest";
// @ts-expect-error: plain CommonJS module shared with the Vercel function
import serverMerge from "../../api/_lib/merge.js";
import { K, derive, mergeRemote, recordsFromLegacy, type Records } from "./records";

const { mergeChanges } = serverMerge as {
  mergeChanges: (e: Records, c: Records) => { merged: Records; writes: Records; rejected: string[] };
};

const legacy = {
  days: { "2026-10-10": { workout: true, closed: true }, "2026-11-02": { workout: true, read: true, apps: 3, spend: 8 } },
  hysa: [{ date: "2026-11-01", amt: 125 }],
  body: [],
  milestones: {},
  chapters: 4,
};

describe("records", () => {
  it("round-trips legacy data into runs, profile and settings", () => {
    const d = derive(recordsFromLegacy(legacy, 1000));
    expect(d.activeRunId).toBe("run-2");
    expect(Object.keys(d.runs["run-1"]!.days)).toHaveLength(2);
    expect(d.runs["run-1"]!.archived).toBe(true);
    const r2 = d.runs["run-2"]!;
    expect(r2.days["2026-11-02"]!.habits.read).toBe(true);
    expect(r2.days["2026-11-02"]!.appliesCount).toBe(3);
    expect(r2.spend.map((e) => e.amount)).toEqual([8]);
    expect(r2.hysa[0]).toMatchObject({ amount: 125, kind: "opening" });
    expect(d.profileImported).toBe(false);
    expect(d.settings.theme).toBe("dark");
  });

  it("always has an active run, even with no data", () => {
    const d = derive(recordsFromLegacy(null, 1));
    expect(d.runs["run-2"]).toBeDefined();
    expect(Object.keys(d.runs["run-2"]!.days)).toHaveLength(0);
  });

  it("client merge: newer record wins per key, both directions", () => {
    const local: Records = { a: { v: "phone", u: 5 }, b: { v: "phone", u: 1 }, c: { v: "only-phone", u: 3 } };
    const remote: Records = { a: { v: "desk", u: 2 }, b: { v: "desk", u: 9 }, d: { v: "only-desk", u: 4 } };
    const { merged, localNewer } = mergeRemote(local, remote);
    expect(merged).toEqual({ a: { v: "phone", u: 5 }, b: { v: "desk", u: 9 }, c: { v: "only-phone", u: 3 }, d: { v: "only-desk", u: 4 } });
    expect(localNewer.sort()).toEqual(["a", "c"]);
  });

  it("edits to different days on two devices both survive (no whole-blob overwrite)", () => {
    const base = recordsFromLegacy(legacy, 1000);
    const phone = { ...base, [K.day("run-2", "2026-11-03")]: { v: { date: "2026-11-03", habits: { workout: true }, floorDay: false, appliesCount: 0, updatedAt: "" }, u: 2000 } };
    const desk = { ...base, [K.day("run-2", "2026-11-04")]: { v: { date: "2026-11-04", habits: { read: true }, floorDay: false, appliesCount: 0, updatedAt: "" }, u: 3000 } };
    const server1 = mergeChanges({}, phone).merged;
    const server2 = mergeChanges(server1, desk).merged;
    const phoneAfter = mergeRemote(phone, server2).merged;
    const days = Object.keys(derive(phoneAfter).runs["run-2"]!.days).sort();
    expect(days).toEqual(["2026-11-02", "2026-11-03", "2026-11-04"]);
  });
});

describe("server merge", () => {
  it("only writes records that are newer, and rejects malformed ones", () => {
    const existing: Records = { a: { v: 1, u: 10 } };
    const { merged, writes, rejected } = mergeChanges(existing, {
      a: { v: 2, u: 5 }, // older → ignored
      b: { v: 3, u: 1 }, // new → written
      "bad key!": { v: 4, u: 1 },
      c: { v: 5 } as unknown as Records[string], // no timestamp
    });
    expect(merged.a).toEqual({ v: 1, u: 10 });
    expect(Object.keys(writes)).toEqual(["b"]);
    expect(rejected.sort()).toEqual(["bad key!", "c"]);
  });
  it("a tie keeps the server copy", () => {
    expect(mergeChanges({ a: { v: "s", u: 7 } }, { a: { v: "c", u: 7 } }).writes).toEqual({});
  });
});
