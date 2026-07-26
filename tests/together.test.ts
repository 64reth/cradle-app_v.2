import { describe, expect, it } from "vitest";
import { preferenceScore } from "../functions/api/together";
import { deterministicIndex, participantContext, transitionAllowed } from "../shared/together";

describe("Together selection foundations", () => {
  it("keeps deterministic selection stable for the same household day", () => {
    expect(deterministicIndex("home|2026-08-05|primary", 20)).toBe(deterministicIndex("home|2026-08-05|primary", 20));
    expect(deterministicIndex("home|2026-08-05|primary", 20)).not.toBe(deterministicIndex("other|2026-08-05|primary", 20));
  });

  it("allows warm lifecycle transitions but rejects regressions", () => {
    expect(transitionAllowed("suggested", "accepted")).toBe(true);
    expect(transitionAllowed("accepted", "started")).toBe(true);
    expect(transitionAllowed("started", "completed")).toBe(true);
    expect(transitionAllowed("completed", "started")).toBe(false);
    expect(transitionAllowed("skipped", "accepted")).toBe(false);
  });

  it("summarises participants without exposing an administrative label", () => {
    expect(participantContext([])).toBe("Family Moment");
    expect(participantContext([{ memberId: "a", displayName: "Alex", role: "owner", accessLevel: "household_admin", ageBand: "adult", participantRole: "participant", participationStatus: "invited" }])).toBe("Alex");
  });

  it("ranks interest-aware Moments for more than one household member", () => {
    const template = { id: "music", householdId: null, title: "Share three songs", description: "Choose songs together.", category: "music" as const, momentType: "whole_family", minParticipants: 2, maxParticipants: 99, durationMinutes: 30, indoorOutdoor: "indoor", screenMode: "off_screen", energyLevel: "medium", equipment: [], source: "system" as const };
    const preferences = ["Gareth", "Taryn"].map((displayName) => ({ displayName, memberId: displayName.toLowerCase(), interests: [{ id: displayName, name: "Music", category: "music" as const, level: "love" as const, setting: null, participation: "whole_family" as const, note: null, active: true }], skillsToShare: null, skillsToLearn: null, preferredEnergy: null, screenPreference: null, excludedCategories: null }));
    expect(preferenceScore(template, preferences)).toBeGreaterThan(preferenceScore({ ...template, category: "outdoors", title: "Family walk" }, preferences));
  });
});
