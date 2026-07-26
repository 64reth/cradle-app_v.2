import { describe, expect, it } from "vitest";
import {
  MEMBER_ACCESS_LEVELS,
  MEMBER_AGE_BANDS,
  isMemberAccessLevel,
  isMemberAgeBand,
  legacyRoleForAccess
} from "../shared/members";

describe("Family access and age model", () => {
  it("has exactly the three explicit app-access choices", () => {
    expect(MEMBER_ACCESS_LEVELS.map(({ value, label }) => ({ value, label }))).toEqual([
      { value: "household_admin", label: "Household admin" },
      { value: "household_member", label: "Household member" },
      { value: "managed_member", label: "Managed member" }
    ]);
    expect(MEMBER_ACCESS_LEVELS.every(({ description }) => description.length > 20)).toBe(true);
  });

  it("has four age bands and never exposes Dependent as an age", () => {
    expect(MEMBER_AGE_BANDS.map(({ value, label }) => ({ value, label }))).toEqual([
      { value: "adult", label: "Adult — 18+" },
      { value: "teen", label: "Teen — 13–17" },
      { value: "child", label: "Child — 5–12" },
      { value: "young_child", label: "Young child — under 5" }
    ]);
    expect(MEMBER_AGE_BANDS.some(({ label, value }) => /dependent/i.test(`${label} ${value}`))).toBe(false);
    expect(isMemberAgeBand("dependent")).toBe(false);
  });

  it("keeps age suitability independent from application permissions", () => {
    for (const age of MEMBER_AGE_BANDS) expect(isMemberAgeBand(age.value)).toBe(true);
    for (const access of MEMBER_ACCESS_LEVELS) expect(isMemberAccessLevel(access.value)).toBe(true);
    expect(legacyRoleForAccess("household_admin")).toBe("parent_admin");
    expect(legacyRoleForAccess("household_member")).toBe("adult");
    expect(legacyRoleForAccess("managed_member")).toBe("child");
    expect(legacyRoleForAccess("managed_member", "owner")).toBe("owner");
  });
});
