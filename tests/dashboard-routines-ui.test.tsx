import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dashboard, type DashboardData, type RoutineRecommendation } from "../src/Dashboard";
import { SystemsLibrary } from "../src/Systems";
import { defaultRoutineAssignment } from "../shared/routines";

const response = (status: number, body: object) => Promise.resolve(new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" }
}));
const member = { id: "owner", displayName: "Alex", role: "owner" };
const adult = { id: "adult", displayName: "Sam", role: "adult" };
const teen = { id: "teen", displayName: "Tyrel", role: "child", ageGroup: "teen", lifecycleState: "active" };
const child = { id: "child", displayName: "Taryn", role: "child", ageGroup: "child", lifecycleState: "managed" };
const recommendation = (
  selectionKey: string, templateKey: string, contextType: "room" | "pet",
  name: string, contextId: string, contextName: string, frequency: RoutineRecommendation["frequency"]
): RoutineRecommendation => ({
  selectionKey, templateKey, templateVersion: 1, contextType,
  roomId: contextType === "room" ? contextId : null, roomName: contextType === "room" ? contextName : null,
  petId: contextType === "pet" ? contextId : null, petName: contextType === "pet" ? contextName : null,
  name, frequency, estimatedMinutes: 15, defaultEnabled: true, defaultAssignment: "rotate",
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
  household: { name: "Fox House", reference: "fox" }, currentUser: member, members: [member, adult, teen, child],
  rooms: [
    { id: "kitchen-id", name: "Kitchen", roomType: "kitchen" },
    { id: "bathroom-id", name: "Bathroom", roomType: "bathroom" },
    { id: "bedroom-id", name: "Bedroom", roomType: "bedroom" }
  ],
  pets: [{ id: "tori-id", name: "Tori", petType: "cat" }],
  family: { canManage: true, pendingInviteCount: 0, joinRequestCount: 0 },
  suggestions: { canReview: true, openCount: 0 },
  schedule: { canCreate: true, canCreateLeadership: true, upcomingCount: 0, upcoming: [] },
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
  currentDate: "2026-07-23", deferredModules: ["Plan", "Messages"]
};

function renderDashboard(data = dashboard) {
  const setData = vi.fn(); const navigate = vi.fn();
  render(<Dashboard data={data} setData={setData} navigate={navigate} signOut={vi.fn()} />);
  return { setData, navigate };
}
afterEach(() => { vi.restoreAllMocks(); window.sessionStorage.clear(); });

describe("dashboard-first routine setup", () => {
  it("renders real family members and the canonical household panels without guide or fake task performance", () => {
    renderDashboard();
    expect(screen.getByRole("heading", { name: /Good (morning|afternoon|evening) Fox House Family/ })).toBeInTheDocument();
    expect(screen.getAllByText("Alex").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Family Status" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Today’s Mission" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Household Schedule" })).toBeInTheDocument();
    expect(screen.queryByText(/Wes|Household Guide|Family Guide/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/On track|Behind|87%|tasks complete/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Plan|Messages/ })).not.toBeInTheDocument();
  });

  it("shows one accessible daily bar per real Family member and a number-only mission counter", () => {
    const expressions = ["completed", "calm", "behind", "needs_help"] as const;
    const members = dashboard.members.map((person, index) => ({
      ...person,
      dailyProgress: {
        percentage: [100, 75, 50, 25][index],
        status: ["On track", "Doing well", "Needs a hand", "Needs support"][index],
        expression: expressions[index],
        assigned: 4,
        complete: index === 0 ? 4 : 0,
        overdue: index,
        hasWork: true
      }
    }));
    renderDashboard({
      ...dashboard,
      members,
      incompleteTaskCount: 18,
      activeRoutineCount: 22,
      todayMission: { state: "ready", message: "Your household has 18 missions remaining today." }
    });
    for (const [name, value] of [["Alex", 100], ["Sam", 75], ["Tyrel", 50], ["Taryn", 25]] as const) {
      const bar = screen.getByRole("progressbar", { name: `${name} daily household progress` });
      expect(bar).toHaveAttribute("aria-valuenow", String(value));
      expect(bar.querySelector(".family-progress-fill")).toHaveStyle({ width: `${value}%` });
    }
    const counter = screen.getByLabelText("18 household missions remaining today");
    expect(counter).toHaveTextContent(/^18$/);
    expect(counter).not.toHaveTextContent(/routines|ready|mission/i);
  });

  it("shows the full-width mission list and signs off through the canonical task route", async () => {
    const task = {
      id: "task-1", title: "Evening kitchen reset", roomName: "Kitchen", petName: null,
      duePeriod: "evening", dueAt: null, assignmentMode: "one_person" as const, state: "todo",
      participants: [{ memberId: "owner", memberName: "Alex", status: "todo", participantKind: "required" as const }]
    };
    const next = { ...dashboard, incompleteTaskCount: 0, activeRoutineCount: 1,
      todayMissions: [{ ...task, state: "complete" }] };
    const fetch = vi.fn()
      .mockImplementationOnce(() => response(200, { ok: true, data: { completed: true, celebrationMemberIds: ["owner"] }, requestId: "task-complete" }))
      .mockImplementationOnce(() => response(200, { ok: true, data: next, requestId: "dashboard-refresh" }));
    vi.stubGlobal("fetch", fetch);
    const { setData } = renderDashboard({ ...dashboard, incompleteTaskCount: 1, todayMissions: [task] });
    expect(screen.getByLabelText("Today’s household missions")).toHaveClass("mission-list");
    expect(screen.getByText("For Alex")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign off" }));
    await waitFor(() => expect(setData).toHaveBeenCalledWith(next));
    expect(fetch.mock.calls[0][0]).toBe("/api/household/tasks/task-1/complete");
    expect(fetch.mock.calls.every(([, init]) => init.credentials === "same-origin")).toBe(true);
  });

  it("targets a one-shot Joy celebration from actual task completion state", () => {
    window.sessionStorage.setItem("cradle:task-celebration", JSON.stringify(["teen"]));
    renderDashboard({
      ...dashboard,
      members: dashboard.members.map((person) => ({
        ...person,
        dailyProgress: {
          percentage: 100, status: "On track", expression: "completed",
          assigned: 1, complete: 1, overdue: 0, hasWork: true
        }
      }))
    });
    expect(screen.getByRole("button", { name: "Tyrel: On track" })).toHaveClass("celebrating");
    expect(screen.getByRole("button", { name: "Alex: On track" })).not.toHaveClass("celebrating");
    expect(window.sessionStorage.getItem("cradle:task-celebration")).toBeNull();
  });

  it("starts guided setup inside the Dashboard with friendly defaults and progressive checklist disclosure", () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Choose routines" }));
    expect(screen.getByRole("heading", { name: /what happens in Kitchen/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Evening kitchen reset/i)).toBeChecked();
    expect(screen.getByLabelText("How often?")).toHaveDisplayValue("Every day");
    expect(screen.getByLabelText("How is this shared?")).toHaveDisplayValue("Rotation");
    expect(screen.getByText("Start Evening kitchen reset").closest("details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("See what’s included"));
    expect(screen.getByText("Start Evening kitchen reset").closest("details")).toHaveAttribute("open");
    expect(screen.queryByText(/trigger type|dependency|definition of done|participant role/i)).not.toBeInTheDocument();
  });

  it("supports frequency, responsibility, rotation and one focused context at a time", () => {
    renderDashboard(); fireEvent.click(screen.getByRole("button", { name: "Choose routines" }));
    fireEvent.change(screen.getByLabelText("How often?"), { target: { value: "weekends" } });
    fireEvent.change(screen.getByLabelText("How is this shared?"), { target: { value: "one_person" } });
    fireEvent.change(screen.getByLabelText("Who takes this?"), { target: { value: "adult" } });
    expect(screen.getByLabelText("How often?")).toHaveDisplayValue("Weekends");
    expect(screen.getByLabelText("Who takes this?")).toHaveDisplayValue("Sam");
    fireEvent.change(screen.getByLabelText("How is this shared?"), { target: { value: "rotation" } });
    expect(screen.getByRole("group", { name: "Rotation participants" })).toBeInTheDocument();
    expect(screen.getByLabelText("Alex")).toBeChecked();
    expect(screen.getByLabelText("Sam")).toBeChecked();
    expect(screen.getByLabelText("Tyrel")).toBeChecked();
    expect(screen.getByLabelText("Taryn")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Next room" }));
    expect(screen.getByRole("heading", { name: /what happens in Bathroom/i })).toBeInTheDocument();
    expect(screen.queryByText("Evening kitchen reset")).not.toBeInTheDocument();
  });

  it("offers every Family Status member while preserving an editable Rotation subset", () => {
    const unclaimed = { id: "unclaimed", displayName: "Uma", role: "adult", lifecycleState: "unclaimed" };
    const invited = { id: "invited", displayName: "Ivy", role: "child", lifecycleState: "invited" };
    renderDashboard({ ...dashboard, members: [...dashboard.members, unclaimed, invited] });
    fireEvent.click(screen.getByRole("button", { name: "Choose routines" }));
    for (const name of ["Alex", "Sam", "Tyrel", "Taryn", "Uma", "Ivy"]) {
      expect(screen.getByLabelText(name)).toBeChecked();
    }
    fireEvent.click(screen.getByLabelText("Uma"));
    expect(screen.getByLabelText("Uma")).not.toBeChecked();
    expect(screen.getByText("One person takes each turn.")).toBeInTheDocument();
  });

  it("defaults shared routines to Rotation while specialist routines remain Assigned", () => {
    expect(defaultRoutineAssignment("kitchen.evening_reset")).toBe("rotate");
    expect(defaultRoutineAssignment("bathroom.weekly_clean")).toBe("rotate");
    expect(defaultRoutineAssignment("laundry.rotation")).toBe("rotate");
    expect(defaultRoutineAssignment("pet.medication")).toBe("assigned");
    expect(defaultRoutineAssignment("household.school_pickup")).toBe("assigned");
    expect(defaultRoutineAssignment("care.baby_care")).toBe("assigned");
  });

  it("adds a lightweight custom Room routine", () => {
    renderDashboard(); fireEvent.click(screen.getByRole("button", { name: "Choose routines" }));
    fireEvent.click(screen.getByRole("button", { name: "Add something for Kitchen" }));
    fireEvent.change(screen.getByLabelText("What needs doing?"), { target: { value: "Water kitchen herbs" } });
    fireEvent.change(screen.getAllByLabelText("How often?").at(-1)!, { target: { value: "twice_weekly" } });
    fireEvent.change(screen.getAllByLabelText("Who usually handles it?").at(-1)!, { target: { value: "adult" } });
    fireEvent.click(screen.getByRole("button", { name: "Add routine" }));
    expect(screen.getByText("Water kitchen herbs")).toBeInTheDocument();
    expect(screen.getAllByText("Twice a week").some((element) => element.tagName === "SPAN")).toBe(true);
  });

  it("adds a lightweight custom Pet-care routine without offering the Pet as a responsible person", () => {
    renderDashboard(); fireEvent.click(screen.getByRole("button", { name: "Choose routines" }));
    fireEvent.click(screen.getByRole("button", { name: "Next room" }));
    fireEvent.click(screen.getByRole("button", { name: "Next room" }));
    fireEvent.click(screen.getByRole("button", { name: "Next room" }));
    fireEvent.click(screen.getByRole("button", { name: "Add something for Tori" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Choose routines" }));
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
    renderDashboard(); fireEvent.click(screen.getByRole("button", { name: "Choose routines" }));
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
      sourceKind: "template", sourceTemplateKey: "kitchen.evening_reset", rotationEnabled: false, rotationMemberIds: [],
      assignmentMode: "one_person", assignedMemberId: "owner", participantMemberIds: [], rotationNextIndex: 0
    };
    vi.stubGlobal("fetch", vi.fn(() => response(200, { ok: true, data: {
      routines: [routine], members: [member, adult], canManage: true
    }, requestId: "library" })));
    render(<SystemsLibrary navigate={vi.fn()} signOut={vi.fn()} addRoutine={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Routines" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Kitchen" })).toBeInTheDocument();
    expect(screen.getByText("Evening kitchen reset")).toBeInTheDocument();
    expect(screen.getByText(/Every day · One person/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a custom routine" })).toBeInTheDocument();
    expect(screen.queryByText(/trigger type|skip rules|workflow dependency/i)).not.toBeInTheDocument();
  });

  it("lets household leadership remove a generated suggestion from the review library", async () => {
    const summary = {
      id: "one", name: "Evening kitchen reset", status: "active", frequency: "daily",
      roomId: "kitchen-id", roomName: "Kitchen", petId: null, petName: null,
      ownerMemberId: "owner", ownerName: "Alex", note: null, stepCount: 1,
      sourceKind: "template", sourceTemplateKey: "kitchen.evening_reset",
      rotationEnabled: false, rotationMemberIds: [], assignmentMode: "one_person",
      assignedMemberId: "owner", participantMemberIds: [], rotationNextIndex: 0
    };
    const detail = {
      ...summary, purpose: "Keep the kitchen ready.", customFrequencyNote: null,
      definitionOfDone: "The kitchen is ready.", estimatedMinutes: 20, templateCustomised: false,
      steps: [{ id: "step", label: "Wipe worktops", displayOrder: 0 }], rotationMembers: [],
      assignmentMode: "one_person", assignedMemberId: "owner"
    };
    const fetch = vi.fn()
      .mockImplementationOnce(() => response(200, { ok: true, data: {
        routines: [summary], members: [member, adult], canManage: true
      } }))
      .mockImplementationOnce(() => response(200, { ok: true, data: { routine: detail } }))
      .mockImplementationOnce(() => response(200, { ok: true, data: { archived: true } }))
      .mockImplementationOnce(() => response(200, { ok: true, data: {
        routines: [], members: [member, adult], canManage: true
      } }));
    vi.stubGlobal("fetch", fetch);
    render(<SystemsLibrary navigate={vi.fn()} signOut={vi.fn()} addRoutine={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove routine" }));
    expect(await screen.findByRole("heading", { name: "No active routines yet." })).toBeInTheDocument();
    expect(fetch.mock.calls[2][0]).toBe("/api/household/systems/one");
    expect(fetch.mock.calls[2][1]).toMatchObject({ method: "DELETE", credentials: "same-origin" });
  });
});
