import { describe, expect, it } from "vitest";
import { addMemberInterest, deleteMemberInterest, interestMember, updateMemberInterest } from "../../functions/api/interests";

const identity = { sessionId: "s", householdId: "home-a", householdName: "A", householdReference: "a", memberId: "member-a", displayName: "Alex", profileReference: "alex", role: "owner" as const, accessLevel: "household_admin" as const, ageBand: "adult" as const, expiresAt: "2999", setupStatus: "complete" as const, setupStep: "complete" as const };

function database(stored: string | null = null) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const db = { prepare(sql: string) {
    const statement = { sql, values: [] as unknown[], bind(...values: unknown[]) { statement.values = values; return statement; },
      async first() { if (sql.includes("FROM members")) return { id: "member-a", accessLevel: "managed_member" }; if (sql.includes("together_member_preferences")) return stored ? { interests: stored } : null; return null; },
      async run() { return { success: true, meta: { changes: 1 } }; } };
    calls.push(statement); return statement;
  } } as unknown as D1Database;
  return { db, calls };
}

describe("interest ownership and persistence", () => {
  it("scopes member ownership to the authenticated household", async () => {
    const { db, calls } = database();
    expect(await interestMember(db, identity, "member-a")).toBe("member-a");
    expect(calls.find(({ sql }) => sql.includes("FROM members"))?.values).toEqual(["home-a", "member-a"]);
  });

  it("stores custom interests without requiring optional fields", async () => {
    const { db, calls } = database();
    const interest = await addMemberInterest(db, "home-a", "member-a", { name: "  Model building  " });
    expect(interest.name).toBe("Model building");
    expect(calls.find(({ sql }) => sql.includes("INSERT INTO together_member_preferences"))?.values).toContain("home-a");
  });

  it("updates, archives and removes interests without touching Moments", async () => {
    const stored = JSON.stringify([{ id: "i1", name: "Music", category: "music", active: true }]);
    const { db, calls } = database(stored);
    await updateMemberInterest(db, "home-a", "member-a", "i1", { level: "love" });
    await updateMemberInterest(db, "home-a", "member-a", "i1", { active: false });
    await deleteMemberInterest(db, "home-a", "member-a", "i1");
    expect(calls.every(({ sql }) => !sql.includes("together_daily_moments"))).toBe(true);
  });
});
