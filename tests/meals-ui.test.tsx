import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Meals } from "../src/Meals";

afterEach(() => vi.restoreAllMocks());

describe("Meal planning experience", () => {
  it("starts with a guided week setup instead of a dense four-week grid", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      ok: true, data: { rotations: [], active: null, suggestions: [], canManage: true }, requestId: "setup"
    }), { status: 200, headers: { "Content-Type": "application/json" } }))));
    render(<Meals navigate={vi.fn()} signOut={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: /first week/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Build my first week/i })).toBeInTheDocument();
    expect(screen.queryByText("Week 1")).not.toBeInTheDocument();
  });

  it("opens on the eleven-slot week and keeps the dinner rhythm behind its secondary action", async () => {
    const slots = Array.from({ length: 11 }, (_, index) => ({
      id: `slot-${index}`, dayOfWeek: index < 5 ? index + 1 : index < 8 ? 6 : 7,
      mealType: index < 5 ? "dinner" : index === 5 || index === 8 ? "breakfast" : index === 6 || index === 9 ? "lunch" : "dinner",
      mealName: null, customMealName: null, slotKind: "flexible", sourceRotationSlotId: null, overrideKind: "none"
    }));
    const active = { id: "rotation", title: "Our dinner rhythm", description: null, cycleLengthWeeks: 4, active: 1, startsOn: null,
      slots: [], suggestions: [{ name: "Pasta", mealId: "meal-1", supportCount: 1, priority: 2, favouriteOf: ["Gareth"], dietaryTags: [], allergens: [] }] };
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => Promise.resolve(new Response(JSON.stringify(
      String(input).includes("meal-rotations") ? { ok: true, data: { rotations: [active], active, suggestions: active.suggestions, canManage: true }, requestId: "rotation" } :
        { ok: true, data: { id: "plan", weekStart: "2026-08-03", rotationWeekNumber: 1, rotationTitle: active.title, slots }, requestId: "plan" }
    ), { status: 200, headers: { "Content-Type": "application/json" } }))));
    render(<Meals navigate={vi.fn()} signOut={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "What are we eating?" })).toBeInTheDocument();
    expect(screen.getAllByRole("button").filter((button) => /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/.test(button.textContent || ""))).toHaveLength(11);
    expect(screen.queryByText("Week 1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Review repeating meals/i }));
    expect(screen.getByText("Week 1")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Monday/i })[0]);
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Monday dinner" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Pasta/ }));
    expect(screen.getByText("This week only")).toBeInTheDocument();
  });
});
