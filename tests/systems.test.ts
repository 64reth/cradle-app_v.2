import { describe, expect, it } from "vitest";
import type { Identity } from "../functions/api/auth";
import { householdRoutineAccess, requireSystemsViewer } from "../functions/api/setup";
import {
  ROOM_TYPES, ROUTINE_FREQUENCIES, ROUTINE_TEMPLATE_VERSION, ROUTINE_TEMPLATES,
  displayRoutineName, inferRoomType, templatesForPet, templatesForRoom
} from "../shared/routines";

const identity: Identity = {
  sessionId: "session", householdId: "house-a", householdName: "Home", householdReference: "home",
  memberId: "owner", displayName: "Alex", profileReference: "alex", role: "owner", expiresAt: "later",
  setupStatus: "complete", setupStep: "complete"
};

describe("dashboard routine recommendations", () => {
  it("uses one versioned canonical template and frequency source", () => {
    expect(ROUTINE_TEMPLATE_VERSION).toBe(1);
    expect(ROOM_TYPES.map(({ value }) => value)).toContain("child_bedroom");
    expect(ROUTINE_FREQUENCIES.map(({ value }) => value)).toEqual([
      "daily", "weekdays", "weekends", "twice_weekly", "three_weekly",
      "weekly", "fortnightly", "monthly", "as_needed", "custom"
    ]);
    expect(new Set(ROUTINE_TEMPLATES.map(({ key }) => key)).size).toBe(ROUTINE_TEMPLATES.length);
    expect(ROUTINE_TEMPLATES.every(({ version }) => version === ROUTINE_TEMPLATE_VERSION)).toBe(true);
  });

  it("produces deterministic Kitchen, Bathroom, Toilet, Bedroom and Living room recommendations", () => {
    expect(templatesForRoom("kitchen").map(({ key }) => key)).toEqual([
      "kitchen.evening_reset", "kitchen.weekly_clean", "kitchen.fridge_check"
    ]);
    expect(templatesForRoom("bathroom").map(({ defaultFrequency }) => defaultFrequency)).toEqual(["daily", "weekly"]);
    expect(templatesForRoom("toilet")[0].defaultFrequency).toBe("daily");
    expect(templatesForRoom("bedroom")[0]).toMatchObject({ key: "bedroom.weekly_clean", defaultFrequency: "weekly" });
    expect(templatesForRoom("living_room")[0].defaultFrequency).toBe("weekly");
  });

  it("uses a neutral, opt-in recommendation for unknown Rooms", () => {
    expect(inferRoomType("Music nook")).toBe("other");
    expect(templatesForRoom("other")).toEqual([
      expect.objectContaining({ key: "other.weekly_reset", defaultEnabled: false })
    ]);
  });

  it("infers familiar legacy Room names while allowing explicit Room types", () => {
    expect(inferRoomType("Main Kitchen")).toBe("kitchen");
    expect(inferRoomType("Downstairs WC")).toBe("toilet");
    expect(inferRoomType("Tajaun Bedroom")).toBe("bedroom");
    expect(inferRoomType("Home Study")).toBe("home_office");
  });

  it("produces type-specific Cat, Dog, Fish and neutral Pet care", () => {
    expect(templatesForPet("cat").map(({ key }) => key)).toContain("pet.cat.clean_litter");
    expect(templatesForPet("dog").map(({ key }) => key)).toContain("pet.dog.morning_walk");
    expect(templatesForPet("fish").map(({ key }) => key)).toContain("pet.fish.check_water");
    expect(templatesForPet("other").map(({ key }) => key)).toEqual([
      "pet.other.feed", "pet.other.refresh_water", "pet.other.clean_area"
    ]);
    expect(displayRoutineName(templatesForPet("cat")[0], "Tori")).toContain("Tori");
  });

  it("keeps Pets as context and never encodes them as responsible participants", () => {
    expect(ROUTINE_TEMPLATES.every((template) => !("owner" in template) && !("participants" in template))).toBe(true);
  });

  it("centralises manager, Adult and Child Systems visibility", () => {
    expect(householdRoutineAccess(identity)).toBe("manage");
    expect(householdRoutineAccess({ ...identity, role: "parent_admin" })).toBe("manage");
    expect(householdRoutineAccess({ ...identity, role: "adult" })).toBe("view_active");
    expect(householdRoutineAccess({ ...identity, role: "child" })).toBe("none");
    expect(requireSystemsViewer(identity)).toBe("all");
    expect(requireSystemsViewer({ ...identity, role: "parent_admin" })).toBe("all");
    expect(requireSystemsViewer({ ...identity, role: "adult" })).toBe("active");
    expect(() => requireSystemsViewer({ ...identity, role: "child" })).toThrow();
  });
});
