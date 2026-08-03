import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AlphaHealth } from "../src/Operations";

const payload = { ok: true, requestId: "health-ui", data: { overall: "healthy", checkedAt: "2026-08-03T10:00:00Z",
  requestDurationMs: 8, signals: { members: { status: "healthy", explanation: "Canonical members available.",
    lastCheckedAt: "2026-08-03T10:00:00Z", durationMs: 2 }, apiLatency: { status: "unknown",
    explanation: "Not enough privacy-safe request history for a global percentile.", lastCheckedAt: "2026-08-03T10:00:00Z" } },
  build: { version: "alpha", commit: null, builtAt: null, validatedTestCount: null, testCountLabel: "Not recorded for this build" } } };

describe("Alpha Health UI", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("renders honest unknown values and manually refreshes without polling", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200,
      headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    render(<AlphaHealth back={() => undefined} />);
    expect(await screen.findByRole("heading", { name: "Cradle Alpha Health" })).toBeInTheDocument();
    expect(await screen.findByText("Not recorded for this build")).toBeInTheDocument();
    expect(screen.getByText("Not enough privacy-safe request history for a global percentile.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });
});
