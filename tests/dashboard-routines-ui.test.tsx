import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dashboard, type DashboardData, type RoutineRecommendation } from "../src/Dashboard";
import { SystemsLibrary } from "../src/Systems";

const response = (status: number, body: object) => Promise.resolve(new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" }
}));
const member = { id: "owner", displayName: "Alex", role: "owner" };
const adult = { id: "adult", displayName: "Sam", role: "adult" };
const recommendation = (
  selectionKey: string, templateKey: string, contextType: "room" | "pet",
  name: string, contextId: string, contextName: string, frequency: RoutineRecommendation["frequency"]
): RoutineRecommendation => ({
  selectionKey, templateKey, templateVersion: 1, contextType,
  roomId: contextType === "room" ? contextId : null, roomName: contextType === "room" ? contextName : null,
  petId: contextType === "pet" ? contextId : null, petName: contextType === "pet" ? contextName : null,
  name, frequency, estimatedMinutes: 15, defaultEnabled: true,
  steps: [`Start ${name}`, `Finish ${name}`], configuredRoutine: null
});
const recommendations = [
  recommendation("kitchen", "kitchen.evening_reset", "room", "Evening kitchen reset", "kitchen-id", "Kitchen", "daily"),
  recommendation("bathroom", "bathroom.daily_reset", "room", "Bathroom reset", "bathroom-id", "Bathroom", "daily"),
  recommendation("bedroom", "bedroom.weekly_clean", "room", "Bedroom clean", "bedroom-id", "Bedroom", "weekly"),
  recommendation("feed-tori", "pet.cat.morning_feed", "pet", "Morning feed for Tori", "tori-id", "Tori", "daily"),
  recommendation("water-tori", "pet.cat.refresh_water", "pet", "Refresh Tori’s water", "tori-id", "Tori", "daily")
];
const dashboard: DashboardData = {
  household: { name: "Fox House", reference: "fox" }, currentUser: member, members: [member, adult],
  rooms: [
    { id: "kitchen-id", name: "Kitchen", roomType: "kitchen" },
    { id: "bathroom-id", name: "Bathroom", roomType: "bathroom" },
    { id: "bedroom-id", name: "Bedroom", roomType: "bedroom" }
  ],
  pets: [{ id: "tori-id", name: "Tori", petType: "cat" }],
  companion: { id: "companion", name: "Mochi", furPaletteKey: "orange", patchPrimaryPaletteKey: "cream",
    patchSecondaryPaletteKey: "white", expressionKey: "neutral" },
  setup: { canManage: true, routinesChosen: false, readyForPlanning: false, steps: [
    { key: "household", label: "Household created", complete: true },
    { key: "rooms", label: "Rooms added", complete: true },
    { key: "members", label: "Family added", complete: true },
    { key: "pets", label: "Pets added", complete: true },
    { key: "routines", label: "Routines chosen", complete: false },
    { key: "planning", label: "Ready for planning", complete: false }
  ] },
  recommendations, routines: [], activeRoutineCount: 0,
  todayMission: { state: "setup", message: "Choose a few household routines and Cradle will build your daily plan." },
  currentDate: "2026-07-23", deferredModules: ["Plan", "Calendar", "Messages"]
};

function renderDashboard(data = dashboard) {
  const setData = vi.fn(); const navigate = vi.fn();
  render(<Dashboard data={data} setData={setData} navigate={navigate} signOut={vi.fn()} />);
  return { setData, navigate };
}
afterEach(() => { vi.restoreAllMocks(); window.sessionStorage.clear(); });

describe("dashboard-first routine setup", () => {
  it("renders real household, Room, Pet, Companion and setup data without fake task performance", () => {
    renderDashboard();
    expect(screen.getByText("Fox House")).toBeInTheDocument();
    expect(screen.getByText("Alex")).toBeInTheDocument();
    expect(screen.getByText(/3 Rooms · 1 Pet/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Mochi/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your plan starts here." })).toBeInTheDocument();
    expect(screen.queryByText(/On track|Behind|87%|tasks complete/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Plan/i })).toBeDisabled();
  });

  it("starts guided setup inside the Dashboard with friendly defaults and progressive checklist disclosure", () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Continue setup" }));
    expect(screen.getByRole("heading", { name: /what happens in Kitchen/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Evening kitchen reset/i)).toBeChecked();
    expect(screen.getByLabelText("How often?")).toHaveDisplayValue("Every day");
    expect(screen.getByLabelText("Who usually handles this?")).toHaveDisplayValue("Household leaders");
    expect(screen.getByText("Start Evening kitchen reset").closest("details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("See what’s included"));
    expect(screen.getByText("Start Evening kitchen reset").closest("details")).toHaveAttribute("open");
    expect(screen.queryByText(/trigger type|dependency|definition of done|participant role/i)).not.toBeInTheDocument();
  });

  it("supports frequency, responsibility, rotation and one focused context at a time", () => {
    renderDashboard(); fireEvent.click(screen.getByRole("button", { name: "Continue setup" }));
    fireEvent.change(screen.getByLabelText("How often?"), { target: { value: "weekends" } });
    fireEvent.change(screen.getByLabelText("Who usually handles this?"), { target: { value: "adult" } });
    expect(screen.getByLabelText("How often?")).toHaveDisplayValue("Weekends");
    expect(screen.getByLabelText("Who usually handles this?")).toHaveDisplayValue("Sam");
    fireEvent.change(screen.getByLabelText("Who usually handles this?"), { target: { value: "rotate" } });
    expect(screen.getByRole("group", { name: "Rotate between" })).toBeInTheDocument();
    expect(screen.getByLabelText("Alex")).toBeChecked();
    expect(screen.getByLabelText("Sam")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Next room" }));
    expect(screen.getByRole("heading", { name: /what happens in Bathroom/i })).toBeInTheDocument();
    expect(screen.queryByText("Evening kitchen reset")).not.toBeInTheDocument();
  });

  it("adds a lightweight custom Room routine", () => {
    renderDashboard(); fireEvent.click(screen.getByRole("button", { name: "Continue setup" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Add something for Kitchen" }));
    fireEvent.change(screen.getByLabelText("What needs doing?"), { target: { value: "Water kitchen herbs" } });
    fireEvent.change(screen.getAllByLabelText("How often?").at(-1)!, { target: { value: "twice_weekly" } });
    fireEvent.change(screen.getAllByLabelText("Who usually handles it?").at(-1)!, { target: { value: "adult" } });
    fireEvent.click(screen.getByRole("button", { name: "Add routine" }));
    expect(screen.getByText("Water kitchen herbs")).toBeInTheDocument();
    expect(screen.getAllByText("Twice a week").some((element) => element.tagName === "SPAN")).toBe(true);
  });

  it("adds a lightweight custom Pet-care routine without offering the Pet as a responsible person", () => {
    renderDashboard(); fireEvent.click(screen.getByRole("button", { name: "Continue setup" }));
    fireEvent.click(screen.getByRole("button", { name: "Next room" }));
    fireEvent.click(screen.getByRole("button", { name: "Next room" }));
    fireEvent.click(screen.getByRole("button", { name: "Next room" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Add something for Tori" }));
    fireEvent.change(screen.getByLabelText("What needs doing?"), { target: { value: "Brush Tori" } });
    expect(screen.getByLabelText("Who usually handles it?")).not.toHaveTextContent("Tori");
    fireEvent.click(screen.getByRole("button", { name: "Add routine" }));
    expect(screen.getByText("Brush Tori")).toBeInTheDocument();
  });

  it("keeps the Dashboard setup mounted and preserves choices after a typed failure, then retries safely", async () => {
    const success = { ...dashboard, setup: { ...dashboard.setup, routinesChosen: true }, activeRoutineCount: 5 };
    const fetch = vi.fn()
      .mockImplementationOnce(() => response(400, { ok: false, error: {
        code: "VALIDATION_ERROR", message: "Choose at least two people to rotate."
      }, requestId: "routine-error" }))
      .mockImplementationOnce(() => response(200, { ok: true, data: success, requestId: "routine-saved" }));
    vi.stubGlobal("fetch", fetch);
    const { setData } = renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Continue setup" }));
    fireEvent.change(screen.getByLabelText("How often?"), { target: { value: "weekends" } });
    fireEvent.click(screen.getByRole("button", { name: "Next room" }));
    fireEvent.click(screen.getByRole("button", { name: "Next room" }));
    fireEvent.click(screen.getByRole("button", { name: "Next room" }));
    fireEvent.click(screen.getByRole("button", { name: "Save household plan" }));
    expect(await screen.findByText(/Choose at least two.*routine-error/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /what happens in Tori/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("How often?")).toHaveDisplayValue("Weekends");
    fireEvent.click(screen.getByRole("button", { name: "Next room" }));
    fireEvent.click(screen.getByRole("button", { name: "Next room" }));
    fireEvent.click(screen.getByRole("button", { name: "Next room" }));
    fireEvent.click(screen.getByRole("button", { name: "Save household plan" }));
    await waitFor(() => expect(setData).toHaveBeenCalledWith(success));
    expect(fetch.mock.calls.every(([, init]) => init.credentials === "same-origin")).toBe(true);
  });

  it("keeps a transport failure local to routine setup", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("offline"))));
    renderDashboard(); fireEvent.click(screen.getByRole("button", { name: "Continue setup" }));
    fireEvent.click(screen.getByRole("button", { name: "Next room" }));
    fireEvent.click(screen.getByRole("button", { name: "Next room" }));
    fireEvent.click(screen.getByRole("button", { name: "Next room" }));
    fireEvent.click(screen.getByRole("button", { name: "Save household plan" }));
    expect(await screen.findByText("Cradle couldn’t connect")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /what happens in Tori/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /couldn’t load this household/i })).not.toBeInTheDocument();
  });
});

describe("friendly routine library", () => {
  it("shows grouped domestic routine cards instead of the technical authoring form", async () => {
    const routine = {
      id: "one", name: "Evening kitchen reset", status: "active", frequency: "daily",
      roomId: "kitchen-id", roomName: "Kitchen", petId: null, petName: null,
      ownerMemberId: "owner", ownerName: "Alex", note: null, stepCount: 5,
      sourceKind: "template", sourceTemplateKey: "kitchen.evening_reset", rotationEnabled: false, rotationMemberIds: []
    };
    vi.stubGlobal("fetch", vi.fn(() => response(200, { ok: true, data: {
      routines: [routine], members: [member, adult], canManage: true
    }, requestId: "library" })));
    render(<SystemsLibrary navigate={vi.fn()} signOut={vi.fn()} addRoutine={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Household routines" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Kitchen" })).toBeInTheDocument();
    expect(screen.getByText("Evening kitchen reset")).toBeInTheDocument();
    expect(screen.getByText(/Every day · Alex/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add routine" })).toBeInTheDocument();
    expect(screen.queryByText(/trigger type|skip rules|workflow dependency/i)).not.toBeInTheDocument();
  });
});
