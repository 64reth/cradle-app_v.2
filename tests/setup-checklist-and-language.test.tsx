import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dashboard, type DashboardData } from "../src/Dashboard";

const base: DashboardData = {
  household: { name: "Allen Family", reference: "allen" },
  currentUser: { id: "owner", displayName: "Gareth", role: "owner" },
  members: [{ id: "owner", displayName: "Gareth", role: "owner", lifecycleState: "active", hasAccount: 1 }],
  rooms: [{ id: "kitchen", name: "Kitchen", roomType: "kitchen" }],
  pets: [],
  family: { canManage: true, pendingInviteCount: 0, joinRequestCount: 0 },
  suggestions: { canReview: true, openCount: 0 },
  schedule: { canCreate: true, canCreateLeadership: true, upcomingCount: 0, upcoming: [] },
  setup: { canManage: true, routinesChosen: true, readyForPlanning: true, complete: true, steps: [
    { key: "household", label: "Household created", complete: true },
    { key: "rooms", label: "Rooms added", complete: true },
    { key: "members", label: "Family added", complete: true },
    { key: "routines", label: "Routines chosen", complete: true },
    { key: "planning", label: "Ready for planning", complete: true }
  ] },
  recommendations: [], routines: [], activeRoutineCount: 4,
  todayMission: { state: "ready", message: "Daily planning is coming later." },
  currentDate: "2026-07-24", deferredModules: ["Plan", "Messages"]
};

const incomplete: DashboardData = {
  ...base, activeRoutineCount: 0,
  setup: { ...base.setup, routinesChosen: false, readyForPlanning: false, complete: false,
    steps: base.setup.steps.map((step) => ["routines", "planning"].includes(step.key)
      ? { ...step, complete: false } : step) }
};

const props = (data: DashboardData, setData = vi.fn()) => ({
  data, setData, navigate: vi.fn(), signOut: vi.fn()
});

afterEach(() => vi.restoreAllMocks());

describe("completed setup checklist and family-facing language", () => {
  it("shows the complete checklist and one actionable next step while setup is incomplete", () => {
    render(<Dashboard {...props(incomplete)} />);
    expect(screen.getByRole("heading", { name: "Set up your home" })).toBeInTheDocument();
    expect(screen.getByText("Routines chosen").closest("li")).not.toHaveClass("complete");
    expect(screen.getByRole("button", { name: "Choose routines" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Home setup")).not.toBeInTheDocument();
  });

  it("automatically collapses completed setup and keeps routine review in the Routines card", () => {
    const { container } = render(<Dashboard {...props(base)} />);
    expect(screen.queryByRole("heading", { name: "Set up your home" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Home setup")).toHaveTextContent("Home setup complete");
    expect(container.querySelector(".progress-card")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review routines" })).toBeInTheDocument();
  });

  it("derives the collapsed state again after a refresh and lets leadership reopen it", () => {
    const first = render(<Dashboard {...props(base)} />);
    expect(screen.getByLabelText("Home setup")).toBeInTheDocument();
    first.unmount();
    render(<Dashboard {...props(base)} />);
    fireEvent.click(screen.getByRole("button", { name: "Review setup" }));
    expect(screen.getByRole("heading", { name: "Set up your home" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close checklist" })).toBeInTheDocument();
  });

  it("does not expose household-leader setup controls to ordinary family members", () => {
    const ordinary = {
      ...base,
      currentUser: { ...base.currentUser, id: "adult", role: "adult" },
      family: { ...base.family, canManage: false },
      setup: { ...base.setup, canManage: false }
    };
    render(<Dashboard {...props(ordinary)} />);
    expect(screen.getByLabelText("Home setup")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review setup" })).not.toBeInTheDocument();
  });

  it("reopens the relevant setup action when required Room data is removed", async () => {
    const { rerender } = render(<Dashboard {...props(base)} />);
    expect(screen.getByLabelText("Home setup")).toBeInTheDocument();
    const missingRoom = {
      ...base, rooms: [],
      setup: { ...base.setup, readyForPlanning: false, complete: false,
        steps: base.setup.steps.map((step) => ["rooms", "planning"].includes(step.key)
          ? { ...step, complete: false } : step) }
    };
    rerender(<Dashboard {...props(missingRoom)} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Set up your home" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Add a Room" }));
    expect(screen.getByLabelText("Room name")).toBeInTheDocument();
  });

  it("does not reopen completed setup for an optional future feature", () => {
    const withOptionalFutureFeature = {
      ...base, optionalFutureFeature: { enabled: false }
    } as DashboardData;
    render(<Dashboard {...props(withOptionalFutureFeature)} />);
    expect(screen.getByLabelText("Home setup")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Set up your home" })).not.toBeInTheDocument();
  });

  it("uses family-facing navigation without leaking the internal Systems name", () => {
    const { container } = render(<Dashboard {...props(base)} />);
    expect(screen.getByRole("button", { name: "Routines" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Schedule" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "My Cradle" })).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/\bSystems?\b/);
    expect(container).not.toHaveTextContent(/\b(Entity|Record|Provision|Lifecycle|Mutation|Principal|Configuration|Structure)\b/i);
  });
});
