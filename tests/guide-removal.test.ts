import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("retired synthetic household identity", () => {
  it("has no active application query, write, route, or setup stage", () => {
    const runtimeFiles = [
      "functions/api/routines.ts",
      "functions/api/household/setup/index.ts",
      "functions/api/household/setup/complete.ts",
      "src/App.tsx",
      "src/Dashboard.tsx"
    ].map(read).join("\n");
    expect(runtimeFiles).not.toMatch(/\b(FROM|JOIN|INTO|UPDATE)\s+companions\b/i);
    expect(runtimeFiles).not.toMatch(/\/api\/household\/companion|companion-complete/i);
    expect(runtimeFiles).not.toMatch(/Household Guide|Family Guide|\bWes\b/i);
    expect(existsSync("functions/api/household/companion.ts")).toBe(false);
  });

  it("keeps avatars attached to real members and out of family participation data", () => {
    const dashboard = read("functions/api/routines.ts");
    const members = read("functions/domain/household/queries.ts");
    const events = read("functions/api/household/events/index.ts");
    const invitations = read("functions/api/household/invites/index.ts");
    expect(dashboard).toContain("familyMembers(db, identity.householdId)");
    expect(members).toContain("LEFT JOIN member_companions");
    expect(members).toContain("c.id AS avatarId");
    expect(members).toContain("m.id");
    expect(events).not.toMatch(/\bcompanions\b/i);
    expect(invitations).not.toMatch(/\bcompanions\b/i);
  });
});
