import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
function response(status: number, body: object, headers: HeadersInit = {}) { return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } })); }
const session = (step: string, role = "owner", status = "incomplete") => ({ ok: true, data: {
  household: { name: "Fox House", reference: "fox" }, member: { displayName: "Alex", reference: "alex", role },
  expiresAt: "later", setup: { status, step }
} });
const setup = (step: string, canConfigure = true, pets: object[] = []) => ({ ok: true, data: {
  state: { status: step === "complete" ? "complete" : "incomplete", step }, canConfigure,
  household: { name: "Fox House", reference: "fox" }, lead: { displayName: "Alex", role: "owner" },
  members: [{ id: "owner", displayName: "Alex", profileReference: "alex", role: "owner", lifecycleState: "active",
    avatarId: step === "companion" ? null : "owner-avatar", avatarFurPaletteKey: "cream",
    avatarPatchPrimaryPaletteKey: "ginger", avatarPatchSecondaryPaletteKey: "charcoal", avatarExpressionKey: "neutral" }],
  rooms: [{ id: "r1", name: "Kitchen", roomType: "kitchen", description: null, displayOrder: 0 }], pets
} });
const dashboard = { ok: true, data: {
  household: { name: "Fox House", reference: "fox" }, currentUser: { id: "owner", displayName: "Alex", role: "owner" },
  members: [{ id: "owner", displayName: "Alex", role: "owner", avatarId: "owner-avatar" }],
  rooms: [{ id: "r1", name: "Kitchen", roomType: "kitchen" }], pets: [],
  family: { canManage: true, pendingInviteCount: 0, joinRequestCount: 0 },
  suggestions: { canReview: true, openCount: 0 },
  schedule: { canCreate: true, canCreateLeadership: true, upcomingCount: 0, upcoming: [] },
  setup: { canManage: true, routinesChosen: false, readyForPlanning: false, steps: [
    { key: "household", label: "Household created", complete: true },
    { key: "rooms", label: "Rooms added", complete: true },
    { key: "members", label: "Family added", complete: true },
    { key: "routines", label: "Routines chosen", complete: false },
    { key: "planning", label: "Ready for planning", complete: false }
  ] },
  recommendations: [], routines: [], activeRoutineCount: 0,
  todayMission: { state: "setup", message: "Choose a few household routines and Cradle will build your daily plan." },
  currentDate: "2026-07-23", deferredModules: ["Plan", "Messages"]
} };
function mockState(step: string, role = "owner", canConfigure = true, pets: object[] = []) {
  vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => response(200, session(step, role, step === "complete" ? "complete" : "incomplete")))
    .mockImplementationOnce(() => response(200, step === "complete" ? dashboard : setup(step, canConfigure, pets))));
}
afterEach(() => { vi.restoreAllMocks(); window.sessionStorage.clear(); window.history.replaceState({}, "", "/"); });
describe("household onboarding", () => {
  it("still renders public entry", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response(401, { ok: false, error: { message: "Sign in" } }))); render(<App />);
    expect(await screen.findByRole("button", { name: "Create Household" })).toBeInTheDocument();
  });
  it("renders the leadership stage", async () => { mockState("leadership"); render(<App />); expect(await screen.findByText(/Guide the household/i)).toBeInTheDocument(); });
  it("renders the intentional family stage with add and skip outcomes", async () => { mockState("members"); render(<App />); expect(await screen.findByText(/Bring in your people/i)).toBeInTheDocument(); expect(screen.getByRole("button", { name: /Add family member/i })).toBeInTheDocument(); expect(screen.getByRole("button", { name: /Skip and create your cat/i })).toBeInTheDocument(); });
  it("creates the Owner’s member avatar with tactile swatches before Rooms", async () => {
    const fetch = vi.fn()
      .mockImplementationOnce(() => response(200, session("companion")))
      .mockImplementationOnce(() => response(200, setup("companion")))
      .mockImplementationOnce(() => response(200, { ok: true, data: { avatar: {} }, requestId: "avatar-save" }))
      .mockImplementationOnce(() => response(200, { ok: true, data: { step: "rooms" }, requestId: "avatar-complete" }))
      .mockImplementationOnce(() => response(200, session("rooms")))
      .mockImplementationOnce(() => response(200, setup("rooms")));
    vi.stubGlobal("fetch", fetch); render(<App />);
    expect(await screen.findByRole("heading", { name: "Create your cat." })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Fur: Grey" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Fur" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Fur: Grey" }));
    expect(screen.getByRole("img", { name: /grey coat/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save my cat and continue" }));
    expect(await screen.findByRole("heading", { name: /Map where household life happens/i })).toBeInTheDocument();
    expect(fetch.mock.calls[2][0]).toBe("/api/me/avatar");
    expect(fetch.mock.calls[2][1]).toMatchObject({ method: "PUT", credentials: "same-origin" });
    expect(fetch.mock.calls[3][0]).toBe("/api/household/setup/avatar-complete");
  });
  it("renders editable Rooms with optional Family occupant choices", async () => {
    mockState("rooms"); render(<App />);
    expect(await screen.findByText(/Map where household life/i)).toBeInTheDocument();
    expect(screen.getAllByLabelText("Room name")).toHaveLength(2);
    expect(screen.getAllByRole("group", { name: /Who uses this room/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Alex").length).toBeGreaterThan(0);
  });
  it("renders optional Pets from the shared type source", async () => { mockState("pets"); render(<App />); expect(await screen.findByText(/Who else needs care/i)).toBeInTheDocument(); expect(screen.getByRole("option", { name: "Guinea Pig" })).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Continue with no pets" })).toBeInTheDocument(); });
  it("moves directly from optional Pets to Review without a guide stage", async () => {
    mockState("review"); render(<App />);
    expect(await screen.findByRole("heading", { name: "Your household foundation." })).toBeInTheDocument();
    expect(screen.queryByText(/Companion|Household Guide|Family Guide|Wes/i)).not.toBeInTheDocument();
  });
  it("includes Pets in review only when present", async () => { mockState("review", "owner", true, [{ id: "p1", name: "Miso", petType: "cat", breed: null, notes: null }]); render(<App />); expect(await screen.findByRole("heading", { name: "Pets" })).toBeInTheDocument(); expect(screen.getByText(/Miso · Cat/)).toBeInTheDocument(); });
  it("routes completed onboarding directly to the honest Dashboard", async () => {
    mockState("complete"); render(<App />);
    expect(await screen.findByRole("heading", { name: /Good (morning|afternoon|evening) Fox House Family/ })).toBeInTheDocument();
    expect(screen.getByText("Signed in as Alex")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Family Status" })).toBeInTheDocument();
    expect(screen.getByText(/Choose a few routines so Cradle understands/i)).toBeInTheDocument();
    expect(window.location.pathname).toBe("/dashboard");
    expect(screen.queryByText(/On track|Behind|Completed tasks/i)).not.toBeInTheDocument();
  });
  it("welcomes a newly linked family member into cat customisation before Dashboard", async () => {
    const withoutAvatar = { ...dashboard, data: { ...dashboard.data,
      members: [{ ...dashboard.data.members[0], avatarId: null }] } };
    const withAvatar = { ...dashboard, data: { ...dashboard.data,
      members: [{ ...dashboard.data.members[0], avatarId: "new-avatar", avatarFurPaletteKey: "grey" }] } };
    const fetch = vi.fn()
      .mockImplementationOnce(() => response(200, session("complete", "adult", "complete")))
      .mockImplementationOnce(() => response(200, withoutAvatar))
      .mockImplementationOnce(() => response(200, { ok: true, data: { avatar: {} }, requestId: "invite-avatar" }))
      .mockImplementationOnce(() => response(200, withAvatar));
    vi.stubGlobal("fetch", fetch); render(<App />);
    expect(await screen.findByRole("heading", { name: "Welcome, Alex." })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Good (morning|afternoon|evening)/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Fur: Grey" }));
    fireEvent.click(screen.getByRole("button", { name: "Save my cat and continue" }));
    expect(await screen.findByRole("heading", { name: /Good (morning|afternoon|evening) Fox House Family/ })).toBeInTheDocument();
    expect(fetch.mock.calls[2][0]).toBe("/api/me/avatar");
  });
  it("renders a safe waiting state for non-Owners", async () => { mockState("rooms", "adult", false); render(<App />); expect(await screen.findByText(/household lead is setting things up/i)).toBeInTheDocument(); });
  it("shows network retry", async () => { vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline")))); render(<App />); expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument(); });
  it("opens the create form accessibly", async () => { vi.stubGlobal("fetch", vi.fn(() => response(401, {}))); render(<App />); fireEvent.click(await screen.findByRole("button", { name: "Create Household" })); expect(screen.getByLabelText("Household name")).toBeInTheDocument(); });

  it("creates a Room through the real frontend route and includes same-origin credentials", async () => {
    const fetch = vi.fn()
      .mockImplementationOnce(() => response(200, session("rooms")))
      .mockImplementationOnce(() => response(200, setup("rooms")))
      .mockImplementationOnce(() => response(201, { ok: true, data: { room: { id: "r2", name: "Office" } }, requestId: "create-1" }))
      .mockImplementationOnce(() => response(200, setup("rooms")));
    vi.stubGlobal("fetch", fetch); render(<App />);
    const input = (await screen.findAllByLabelText("Room name"))[0]; fireEvent.change(input, { target: { value: "Office" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Room" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    expect(fetch.mock.calls[2][0]).toBe("/api/household/rooms");
    expect(fetch.mock.calls[2][1]).toMatchObject({ method: "POST", credentials: "same-origin" });
  });

  it("shows a typed Room API message and request ID without losing form values", async () => {
    const fetch = vi.fn()
      .mockImplementationOnce(() => response(200, session("rooms")))
      .mockImplementationOnce(() => response(200, setup("rooms")))
      .mockImplementationOnce(() => response(409, { ok: false, error: { code: "CONFLICT", message: "An active Room with that name already exists." }, requestId: "room-conflict" }));
    vi.stubGlobal("fetch", fetch); render(<App />);
    const input = (await screen.findAllByLabelText("Room name"))[0] as HTMLInputElement; fireEvent.change(input, { target: { value: "Kitchen" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Room" }));
    expect(await screen.findByText(/already exists.*room-conflict/i)).toBeInTheDocument();
    expect(input).toHaveValue("Kitchen");
    expect(screen.queryByText("Cradle couldn’t connect")).not.toBeInTheDocument();
  });

  it("uses the connection message only for transport failure and retries with preserved data", async () => {
    const fetch = vi.fn()
      .mockImplementationOnce(() => response(200, session("rooms")))
      .mockImplementationOnce(() => response(200, setup("rooms")))
      .mockImplementationOnce(() => Promise.reject(new TypeError("fetch failed")))
      .mockImplementationOnce(() => response(201, { ok: true, data: { room: { id: "r2", name: "Office" } }, requestId: "create-2" }))
      .mockImplementationOnce(() => response(200, setup("rooms")));
    vi.stubGlobal("fetch", fetch); render(<App />);
    const input = (await screen.findAllByLabelText("Room name"))[0] as HTMLInputElement; fireEvent.change(input, { target: { value: "Office" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Room" }));
    expect(await screen.findByText("Cradle couldn’t connect")).toBeInTheDocument();
    expect(input).toHaveValue("Office");
    fireEvent.click(screen.getByRole("button", { name: "Add Room" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(5));
    expect(fetch.mock.calls.filter(([url]) => url === "/api/household/rooms")).toHaveLength(2);
  });

  it("does not resubmit a successfully created Room when only refresh fails", async () => {
    const fetch = vi.fn()
      .mockImplementationOnce(() => response(200, session("rooms")))
      .mockImplementationOnce(() => response(200, setup("rooms")))
      .mockImplementationOnce(() => response(201, { ok: true, data: { room: { id: "r2", name: "Office" } }, requestId: "create-3" }))
      .mockImplementationOnce(() => Promise.reject(new TypeError("refresh interrupted")));
    vi.stubGlobal("fetch", fetch); render(<App />);
    const input = (await screen.findAllByLabelText("Room name"))[0] as HTMLInputElement; fireEvent.change(input, { target: { value: "Office" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Room" }));
    expect(await screen.findByText(/Room saved, but the view could not refresh/i)).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(fetch.mock.calls.filter(([url]) => url === "/api/household/rooms")).toHaveLength(1);
  });

  it("shows a reload screen when a development runtime changes", async () => {
    const runtime = "X-Cradle-Dev-Runtime-ID";
    const fetch = vi.fn()
      .mockImplementationOnce(() => response(200, session("leadership"), { [runtime]: "runtime-one" }))
      .mockImplementationOnce(() => response(200, setup("leadership"), { [runtime]: "runtime-one" }))
      .mockImplementationOnce(() => response(200, { ok: true, data: { step: "members" }, requestId: "changed" }, { [runtime]: "runtime-two" }));
    vi.stubGlobal("fetch", fetch); render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Confirm household leadership/i }));
    expect(await screen.findByText("Cradle has restarted during development.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("returns to Create Household when a development database reset invalidates the session", async () => {
    const runtime = "X-Cradle-Dev-Runtime-ID";
    const fetch = vi.fn()
      .mockImplementationOnce(() => response(200, session("leadership"), { [runtime]: "runtime-one" }))
      .mockImplementationOnce(() => response(200, setup("leadership"), { [runtime]: "runtime-one" }))
      .mockImplementationOnce(() => response(200, { ok: true, data: { step: "members" }, requestId: "leadership-ok" }, { [runtime]: "runtime-one" }))
      .mockImplementationOnce(() => response(401, { ok: false, error: { code: "AUTHENTICATION_REQUIRED", message: "Please sign in to continue." }, requestId: "reset-session" }, { [runtime]: "runtime-one" }));
    vi.stubGlobal("fetch", fetch); render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Confirm household leadership/i }));
    expect(await screen.findByText(/local development database has been reset/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Create your household" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it.each([
    ["/systems", "/routines", "Routines"],
    ["/calendar", "/schedule", "Household Schedule"]
  ])("canonicalises the historical %s route to %s without a redirect loop", async (legacy, canonical, heading) => {
    window.history.replaceState({}, "", legacy);
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/auth/session") return response(200, session("complete", "owner", "complete"));
      if (path === "/api/dashboard") return response(200, dashboard);
      if (path.startsWith("/api/household/systems")) return response(200, {
        ok: true, data: { routines: [], members: dashboard.data.members, canManage: true }, requestId: "routines"
      });
      if (path === "/api/household/events") return response(200, {
        ok: true, data: { events: [], canCreate: true, canCreateLeadership: true }, requestId: "schedule"
      });
      throw new Error(`Unexpected ${path}`);
    }));
    render(<App />);
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(window.location.pathname).toBe(canonical);
  });

});
