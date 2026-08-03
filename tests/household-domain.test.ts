import { describe, expect, it } from "vitest";
import {
  canAdvanceSetup, canManageMember, canTransitionMember, householdPresence,
  invitationEligibility, retainedMembersExactlyOnce
} from "../shared/household-domain";

const owner = { householdId: "home-a", memberId: "owner-a", role: "owner" as const, accessLevel: "household_admin" as const };

describe("Household Domain invariants", () => {
  it("keeps every retained member exactly once without consulting optional state", () => {
    const members = [{ id: "a" }, { id: "b" }, { id: "a" }] as never[];
    expect(retainedMembersExactlyOnce(members).map(({ id }) => id)).toEqual(["a", "b"]);
  });

  it("centralises coherent invitation eligibility for API and UI callers", () => {
    expect(invitationEligibility(owner, { id: "gillian", householdId: "home-a", role: "adult",
      lifecycleState: "unclaimed", accountId: null }).allowed).toBe(true);
    expect(invitationEligibility(owner, { id: "joined", householdId: "home-a", role: "adult",
      lifecycleState: "active", accountId: "account" }).allowed).toBe(false);
  });

  it("fails permissions closed across household boundaries", () => {
    expect(canManageMember(owner, { id: "member-b", householdId: "home-b", role: "adult" })).toBe(false);
    expect(canManageMember(owner, { id: "member-a", householdId: "home-a", role: "adult" })).toBe(true);
  });

  it("rejects invalid member and completed-setup transitions", () => {
    expect(canTransitionMember("left", "active")).toBe(false);
    expect(canTransitionMember("suspended", "active")).toBe(true);
    expect(canAdvanceSetup("members", "companion")).toBe(true);
    expect(canAdvanceSetup("complete", "complete")).toBe(false);
  });

  it("keeps presence optional and unrelated to access or visibility", () => {
    expect(householdPresence()).toBe("unknown");
    expect(canManageMember(owner, { id: "member-a", householdId: "home-a", role: "adult" })).toBe(true);
  });
});

