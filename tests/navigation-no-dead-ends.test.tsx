import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { Dashboard, type DashboardData } from "../src/Dashboard";

const response = (status: number, body: object) => Promise.resolve(new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" }
}));
const session = (step: string) => ({ ok: true, data: {
  household: { name: "Fox House", reference: "fox" }, member: { displayName: "Alex", reference: "alex", role: "owner" },
  expiresAt: "later", setup: { status: "incomplete", step }
} });
const setup = (step: string) => ({ ok: true, data: {
  state: { status: "incomplete", step }, canConfigure: true,
  household: { name: "Fox House", reference: "fox" }, lead: { displayName: "Alex", role: "owner" },
  members: [{ id: "owner", displayName: "Alex", profileReference: "alex", role: "owner", lifecycleState: "active",
    avatarId: step === "companion" ? null : "owner-avatar" }],
  rooms: [{ id: "kitchen", name: "Kitchen", roomType: "kitchen", description: null, displayOrder: 0 }],
  pets: []
} });
const dashboard: DashboardData = {
  household: { name: "Fox House", reference: "fox" },
  currentUser: { id: "owner", displayName: "Alex", role: "owner" },
  members: [{ id: "owner", displayName: "Alex", role: "owner", lifecycleState: "active", hasAccount: 1, avatarId: "owner-avatar" }],
  rooms: [{ id: "kitchen", name: "Kitchen", roomType: "kitchen" }], pets: [],
  family: { canManage: true, pendingInviteCount: 0, joinRequestCount: 0 },
  suggestions: { canReview: true, openCount: 0 },
  schedule: { canCreate: true, canCreateLeadership: true, upcomingCount: 0, upcoming: [] },
  setup: { canManage: true, routinesChosen: false, readyForPlanning: false, steps: [] },
  recommendations: [], routines: [], activeRoutineCount: 0,
  todayMission: { state: "setup", message: "Choose routines." }, currentDate: "2026-07-23",
  deferredModules: ["Plan", "Messages"]
};

afterEach(() => {
  cleanup(); vi.restoreAllMocks(); window.sessionStorage.clear(); window.history.replaceState({}, "", "/");
});

describe("app-wide no-dead-end policy", () => {
  it.each([
    ["leadership", /Confirm household leadership/i],
    ["members", /Skip and create your cat/i],
    ["companion", /Save my cat and continue/i],
    ["rooms", /Continue to optional Pets/i],
    ["pets", /Continue with no pets/i],
    ["review", /Complete household setup/i]
  ])("gives onboarding %s an onward action and a safe exit", async (step, onward) => {
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => response(200, session(step)))
      .mockImplementationOnce(() => response(200, setup(step))));
    render(<App />);
    expect(await screen.findByRole("button", { name: onward })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save and sign out" })).toBeInTheDocument();
  });

  it("exposes the real primary destinations without fictional or deferred dead ends", () => {
    render(<Dashboard data={dashboard} setData={vi.fn()} navigate={vi.fn()} signOut={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Routines" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Schedule" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "My Cradle" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Plan|Messages/ })).not.toBeInTheDocument();
  });

  it("gives the routine setup sheet a close route and never exposes technical System language", () => {
    const data = { ...dashboard, recommendations: [{
      selectionKey: "kitchen", templateKey: "kitchen.evening_reset", templateVersion: 1, contextType: "room" as const,
      roomId: "kitchen", roomName: "Kitchen", petId: null, petName: null, name: "Evening kitchen reset",
      frequency: "daily" as const, estimatedMinutes: 15, defaultEnabled: true,
      defaultAssignment: "rotate" as const, steps: ["Reset"], configuredRoutine: null
    }] };
    render(<Dashboard data={data} setData={vi.fn()} navigate={vi.fn()} signOut={vi.fn()} startSetup />);
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save household plan" })).toBeInTheDocument();
    expect(screen.queryByText(/trigger type|participant role|dependency/i)).not.toBeInTheDocument();
  });

  it("prioritises invitation acceptance without redirecting an invitee into Owner onboarding", async () => {
    window.history.replaceState({}, "", "/invite/private");
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => String(input).startsWith("/api/invites/")
      ? response(200, { ok: true, data: { invitation: {
        householdName: "Fox House", inviteType: "profile", targetMemberId: "gillian", targetName: "Gillian",
        role: "parent_admin", expiresAt: "2999", alreadyAccepted: false, availableProfiles: []
      } } })
      : response(200, session("leadership"))));
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Join Fox House" })).toBeInTheDocument();
    expect(screen.queryByText(/Guide the household/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Return home/ })).toBeInTheDocument();
  });

  it("opens and dismisses family management without trapping the Dashboard", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/household/members") return response(200, { ok: true, data: { members: dashboard.members } });
      if (String(input) === "/api/household/invites") return response(200, { ok: true, data: { invites: [] } });
      if (String(input) === "/api/household/task-suggestions") return response(200, { ok: true, data: { suggestions: [] } });
      return response(200, { ok: true, data: { requests: [] } });
    }));
    render(<Dashboard data={dashboard} setData={vi.fn()} navigate={vi.fn()} signOut={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Manage family" }));
    expect(await screen.findByRole("heading", { name: "Your family" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Back to Dashboard" }).length).toBeGreaterThan(0);
  });
});
