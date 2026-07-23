import { describe, expect, it } from "vitest";
import { requireSetupOwner, requireStep } from "../../functions/api/setup";

const identity = { role: "owner", householdId: "house-a" } as never;
function stateDb(step: string, status = "incomplete") {
  return { prepare: () => ({ bind: () => ({ first: async () => ({ step, status }) }) }) } as unknown as D1Database;
}

describe("server-authoritative setup state", () => {
  it("allows the Owner only at the persisted expected stage", async () => {
    await expect(requireStep(stateDb("rooms"), identity, "rooms")).resolves.toBeUndefined();
    await expect(requireStep(stateDb("leadership"), identity, "rooms")).rejects.toMatchObject({ status: 400 });
  });

  it("prevents completed setup from reopening", async () => {
    await expect(requireStep(stateDb("complete", "complete"), identity, "review")).rejects.toMatchObject({ status: 400 });
  });

  it("denies non-Owners from initial setup changes", () => {
    expect(() => requireSetupOwner({ role: "parent_admin" } as never)).toThrow(/Only the household Owner/);
    expect(() => requireSetupOwner({ role: "adult" } as never)).toThrow(/Only the household Owner/);
    expect(() => requireSetupOwner({ role: "child" } as never)).toThrow(/Only the household Owner/);
  });
});
