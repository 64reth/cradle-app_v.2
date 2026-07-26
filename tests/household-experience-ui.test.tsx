import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HouseholdCalendar } from "../src/Calendar";
import { Dashboard, type DashboardData } from "../src/Dashboard";
import { PersonalArea } from "../src/PersonalArea";

const response = (status: number, body: object) => Promise.resolve(new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" }
}));
const owner = {
  id: "owner", displayName: "Gareth", role: "owner", ageGroup: "adult",
  lifecycleState: "active", hasAccount: 1, avatarId: "owner-cat",
  avatarFurPaletteKey: "orange" as const, avatarPatchPrimaryPaletteKey: "cream" as const,
  avatarPatchSecondaryPaletteKey: "white" as const, avatarExpressionKey: "neutral" as const
};
const parent = { id: "parent", displayName: "Gillian", role: "parent_admin", ageGroup: "adult", lifecycleState: "active", hasAccount: 1 };
const teen = { id: "teen", displayName: "Tyrel", role: "child", ageGroup: "teen", lifecycleState: "active", hasAccount: 1 };
const child = { id: "child", displayName: "Taryn", role: "child", ageGroup: "child", lifecycleState: "managed", hasAccount: 0 };
const dashboard: DashboardData = {
  household: { name: "Allen Family", reference: "allen" }, currentUser: owner,
  members: [owner, parent, teen, child], rooms: [{ id: "kitchen", name: "Kitchen", roomType: "kitchen" }],
  pets: [],
  family: { canManage: true, pendingInviteCount: 0, joinRequestCount: 0 },
  suggestions: { canReview: true, openCount: 0 },
  schedule: { canCreate: true, canCreateLeadership: true, upcomingCount: 0, upcoming: [] },
  setup: { canManage: true, routinesChosen: true, readyForPlanning: true, steps: [] },
  recommendations: [], routines: [], activeRoutineCount: 18,
  todayMission: { state: "ready", message: "Your routines are ready. Daily missions are coming in the next phase." },
  currentDate: "2026-07-23", deferredModules: ["Plan", "Messages"]
};
const me = {
  member: { id: "owner", displayName: "Gareth", preferredName: null, role: "owner",
    lifecycleState: "active", householdName: "Allen Family" },
  avatar: { id: "member-cat", furPaletteKey: "orange", patchPrimaryPaletteKey: "cream",
    patchSecondaryPaletteKey: "white", expressionKey: "neutral" },
  suggestions: [], personalTasks: { state: "not_generated", message: "No tasks have been generated yet." },
  deferred: ["Help Requests", "Messages", "Preferences", "Account"]
};

afterEach(() => { vi.restoreAllMocks(); });

describe("Phase 4.3 household experience", () => {
  it("renders one household-first Family Status card per real family member and no guide identity", () => {
    const props = { data: dashboard, setData: vi.fn(), navigate: vi.fn(), signOut: vi.fn() };
    const { container, rerender } = render(<Dashboard {...props} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Good (morning|afternoon|evening)/i);
    expect(screen.getByRole("heading", { name: /Good (morning|afternoon|evening) Allen Family/ })).toBeInTheDocument();
    expect(screen.getByText("Signed in as Gareth")).toBeInTheDocument();
    const family = screen.getByRole("heading", { name: "Family Status" }).closest("section")!;
    expect(within(family).getAllByRole("button", { name: /Gareth|Gillian|Tyrel|Taryn/ })).toHaveLength(4);
    for (const name of ["Gareth", "Gillian", "Tyrel", "Taryn"]) {
      expect(within(family).getByRole("img", { name: new RegExp(`${name}’s cat avatar`, "i") })).toBeInTheDocument();
    }
    expect(within(family).getByText("4 family members")).toBeInTheDocument();
    expect(container.querySelectorAll(".family-status-card")).toHaveLength(4);
    const tones = [...container.querySelectorAll(".family-status-card")].map(({ className }) => className);
    rerender(<Dashboard {...props} />);
    expect([...container.querySelectorAll(".family-status-card")].map(({ className }) => className)).toEqual(tones);
    expect(screen.queryByText(/Wes|Household Guide|Family Guide/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Companions|Today’s Household/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Today’s Mission" })).toBeInTheDocument();
    expect(screen.getByLabelText("18 routines")).toHaveTextContent(/^18$/);
    expect(screen.queryByText(/routines ready/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/3 Complete|2 Remaining|tasks complete/i)).not.toBeInTheDocument();
  });

  it("uses one canonical Routines action and activates Schedule", () => {
    const navigate = vi.fn();
    render(<Dashboard data={dashboard} setData={vi.fn()} navigate={navigate} signOut={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: "Review routines" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Review routines" }));
    expect(navigate).toHaveBeenCalledWith("systems");
    expect(screen.getByRole("button", { name: "Schedule" })).toBeEnabled();
  });

  it("loads the member-owned cat without a separate name and refreshes Dashboard after saving appearance", async () => {
    const changed = vi.fn();
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/me/avatar" && init?.method === "PUT") return response(200, { ok: true, data: {} });
      if (path === "/api/me") return response(200, { ok: true, data: me });
      if (path === "/api/dashboard") return response(200, { ok: true, data: dashboard });
      throw new Error(`Unexpected ${path}`);
    }));
    render(<PersonalArea dashboard={dashboard} navigate={vi.fn()} signOut={vi.fn()} onDashboardChanged={changed} />);
    expect((await screen.findAllByRole("heading", { name: "Gareth" })).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Edit appearance" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Companion name|Avatar name/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit appearance" }));
    expect(screen.queryByRole("combobox", { name: "Fur" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Fur: Grey" }));
    expect(screen.getAllByRole("img", { name: /grey coat/i }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Save appearance" }));
    expect(await screen.findByText("Your cat’s appearance was saved.")).toBeInTheDocument();
    await waitFor(() => expect(changed).toHaveBeenCalledWith(dashboard));
  });

  it("provides a useful Schedule empty state and creates a Family Meeting with all Members", async () => {
    let posted: Record<string, unknown> | null = null;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/household/events" && init?.method === "POST") {
        posted = JSON.parse(String(init.body));
        return response(201, { ok: true, data: { event: {
          id: "meeting", ...posted, createdByMemberId: "owner", createdByName: "Gareth",
          status: "active", visibility: "household", members: []
        } } });
      }
      if (path === "/api/household/events") return response(200, { ok: true, data: {
        events: [], canCreate: true, canCreateLeadership: true
      } });
      if (path === "/api/dashboard") return response(200, { ok: true, data: dashboard });
      throw new Error(`Unexpected ${path}`);
    }));
    render(<HouseholdCalendar dashboard={dashboard} navigate={vi.fn()} signOut={vi.fn()} onDashboardChanged={vi.fn()} />);
    expect(await screen.findByText("No meetings planned.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create Meeting" }));
    expect(screen.getByRole("dialog", { name: "Create an event" })).toBeInTheDocument();
    for (const member of ["Gareth", "Gillian", "Tyrel", "Taryn"]) {
      expect(screen.getByLabelText(member)).toBeChecked();
    }
    fireEvent.click(screen.getByRole("button", { name: "Add to household schedule" }));
    expect(await screen.findByText(/Family Meeting was added/i)).toBeInTheDocument();
    expect(posted).toMatchObject({ eventType: "family_meeting",
      memberIds: ["owner", "parent", "teen", "child"], reminderMinutes: 30 });
  });

  it("prefills Weekly Review for Sunday at 7 PM with weekly recurrence", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response(200, { ok: true, data: {
      events: [], canCreate: true, canCreateLeadership: true
    } })));
    render(<HouseholdCalendar dashboard={dashboard} navigate={vi.fn()} signOut={vi.fn()} onDashboardChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Create Meeting" }));
    fireEvent.change(screen.getByLabelText("Event type"), { target: { value: "weekly_review" } });
    expect(screen.getByLabelText("Title")).toHaveValue("Weekly Review");
    expect(screen.getByLabelText("Starts")).toHaveValue("19:00");
    expect(screen.getByLabelText("Repeats")).toHaveDisplayValue("Weekly");
    const chosenDate = new Date(`${(screen.getByLabelText("Date") as HTMLInputElement).value}T12:00:00`);
    expect(chosenDate.getDay()).toBe(0);
    expect(screen.getByText(/not a task/i)).toBeInTheDocument();
  });

  it("hides Leadership Meeting creation from Adults and always offers Dashboard return", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response(200, { ok: true, data: {
      events: [], canCreate: true, canCreateLeadership: false
    } })));
    render(<HouseholdCalendar dashboard={{ ...dashboard, currentUser: { ...owner, role: "adult" } }}
      navigate={vi.fn()} signOut={vi.fn()} onDashboardChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Create Meeting" }));
    expect(screen.getByLabelText("Event type")).not.toHaveTextContent("Leadership Meeting");
    expect(screen.getAllByRole("button", { name: "Back to Dashboard" })).not.toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("locks Family Status to an avatar-led 68/32 layout and preserves it on mobile", async () => {
    const css = await import("node:fs").then(({ readFileSync }) => readFileSync("src/styles/app.css", "utf8"));
    expect(css).toMatch(/family-status-card\s*\{[\s\S]*grid-template-rows:\s*68% 32%/);
    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*family-status-card\s*\{[\s\S]*grid-template-rows:\s*66% 34%/);
    expect(css).toMatch(/calendar-time-grid[\s\S]*grid-template-columns: 1fr 1fr/);
    expect(css).toMatch(/task-celebration[\s\S]*animation:\s*cradle-task-joy 950ms/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*task-celebration\s*\{\s*animation:\s*none/);
  });
});
