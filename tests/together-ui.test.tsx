import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Together } from "../src/Together";

afterEach(() => vi.restoreAllMocks());

describe("Together UI", () => {
  it("renders one primary Moment and a subordinate optional Moment", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true, data: {
      localDate: "2026-08-05", traditions: [], moments: [
        { id: "primary", localDate: "2026-08-05", title: "Play family charades", description: "Act things out together.", momentType: "whole_family", status: "suggested", isPrimary: true, generatedReason: "shared interests", durationMinutes: 30, indoorOutdoor: "indoor", screenMode: "off_screen", category: "games", equipment: [], participants: [{ memberId: "a", displayName: "Alex", role: "owner", accessLevel: "household_admin", ageBand: "adult", participantRole: "participant", participationStatus: "invited" }] },
        { id: "optional", localDate: "2026-08-05", title: "Share three songs", description: "Choose songs together.", momentType: "one_to_one", status: "suggested", isPrimary: false, generatedReason: "variety", durationMinutes: 20, indoorOutdoor: "indoor", screenMode: "screen_shared", category: "music", equipment: [], participants: [] }
      ]
    }, requestId: "together" }), { status: 200, headers: { "Content-Type": "application/json" } }))));
    render(<Together navigate={vi.fn()} signOut={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Play family charades" })).toBeInTheDocument();
    expect(document.querySelector(".together-hero")).toHaveClass("dashboard-card");
    expect(screen.getByText("Optional Moment")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Try another" })).toHaveLength(2);
  });
});
