import { describe, expect, it } from "vitest";
import type { Identity } from "../../functions/api/auth";
import { parseRoutineEdit } from "../../functions/api/systems";

const identity: Identity = {
  sessionId: "session", householdId: "house", householdName: "Home", householdReference: "home",
  memberId: "owner", displayName: "Alex", profileReference: "alex", role: "owner",
  accessLevel: "household_admin", ageBand: "adult",
  expiresAt: "2999", setupStatus: "complete", setupStep: "complete"
};

function db(memberIds = ["owner", "adult", "teen", "child"]) {
  return {
    prepare: () => ({
      bind: () => ({
        all: async () => ({ results: memberIds.map((id) => ({ id })) })
      })
    })
  } as unknown as D1Database;
}

const base = { name: "Kitchen reset", frequency: "daily", status: "active" };

describe("canonical Routine assignment modes", () => {
  it("accepts and preserves any valid Rotation subset, including an unchecked former participant", async () => {
    const parsed = await parseRoutineEdit({
      ...base,
      assignmentMode: "rotation",
      participantMemberIds: ["adult", "child"]
    }, db(), identity);
    expect(parsed.participantMemberIds).toEqual(["adult", "child"]);
    expect(parsed.participantMemberIds).not.toContain("owner");
    expect(parsed.assignedMemberId).toBeNull();
  });

  it("supports direct One-person changes without switching modes", async () => {
    const parsed = await parseRoutineEdit({
      ...base,
      assignmentMode: "one_person",
      assignedMemberId: "teen",
      participantMemberIds: ["owner", "adult"]
    }, db(), identity);
    expect(parsed).toMatchObject({
      assignmentMode: "one_person",
      assignedMemberId: "teen",
      participantMemberIds: []
    });
  });

  it("requires a genuine Shared team and keeps one Routine participant pool", async () => {
    await expect(parseRoutineEdit({
      ...base,
      assignmentMode: "shared_team",
      participantMemberIds: ["teen"]
    }, db(), identity)).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    const parsed = await parseRoutineEdit({
      ...base,
      assignmentMode: "shared_team",
      participantMemberIds: ["teen", "child"]
    }, db(), identity);
    expect(parsed).toMatchObject({
      assignmentMode: "shared_team",
      assignedMemberId: null,
      participantMemberIds: ["teen", "child"]
    });
  });

  it("keeps Decide later unassigned rather than falling back to the household owner", async () => {
    const parsed = await parseRoutineEdit({
      ...base,
      assignmentMode: "decide_later",
      assignedMemberId: "owner",
      participantMemberIds: ["owner", "adult"]
    }, db(), identity);
    expect(parsed).toMatchObject({
      assignmentMode: "decide_later",
      assignedMemberId: null,
      participantMemberIds: []
    });
  });

  it("rejects inactive, duplicate and cross-household participant identifiers", async () => {
    for (const participantMemberIds of [
      ["adult", "adult"],
      ["adult", "foreign-member"]
    ]) {
      await expect(parseRoutineEdit({
        ...base,
        assignmentMode: "rotation",
        participantMemberIds
      }, db(), identity)).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    }
  });
});
