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
  members: [{ displayName: "Alex", profileReference: "alex", role: "owner" }],
  rooms: [{ id: "r1", name: "Kitchen", roomType: "kitchen", description: null, displayOrder: 0 }], pets, companion: null
} });
const dashboard = { ok: true, data: {
  household: { name: "Fox House", reference: "fox" }, currentUser: { id: "owner", displayName: "Alex", role: "owner" },
  members: [{ id: "owner", displayName: "Alex", role: "owner" }],
  rooms: [{ id: "r1", name: "Kitchen", roomType: "kitchen" }], pets: [], companion: null,
  setup: { canManage: true, routinesChosen: false, readyForPlanning: false, steps: [
    { key: "household", label: "Household created", complete: true },
    { key: "rooms", label: "Rooms added", complete: true },
    { key: "members", label: "Family added", complete: true },
    { key: "routines", label: "Routines chosen", complete: false },
    { key: "planning", label: "Ready for planning", complete: false }
  ] },
  recommendations: [], routines: [], activeRoutineCount: 0,
  todayMission: { state: "setup", message: "Choose a few household routines and Cradle will build your daily plan." },
  currentDate: "2026-07-23", deferredModules: ["Plan", "Calendar", "Messages"]
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
  it("renders the leadership stage", async () => { mockState("leadership"); render(<App />); expect(await screen.findByText(/Lead the system/i)).toBeInTheDocument(); });
  it("renders the members stage and invitation control", async () => { mockState("members"); render(<App />); expect(await screen.findByText(/Bring in your people/i)).toBeInTheDocument(); expect(screen.getByRole("button", { name: /Create invitation/i })).toBeInTheDocument(); });
  it("renders editable Rooms", async () => { mockState("rooms"); render(<App />); expect(await screen.findByText(/Map where household life/i)).toBeInTheDocument(); expect(screen.getAllByLabelText("Room name")).toHaveLength(2); });
  it("renders optional Pets from the shared type source", async () => { mockState("pets"); render(<App />); expect(await screen.findByText(/Who else needs care/i)).toBeInTheDocument(); expect(screen.getByRole("option", { name: "Guinea Pig" })).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Continue with no pets" })).toBeInTheDocument(); });
  it("renders Companion defaults after Pets", async () => { mockState("companion"); render(<App />); expect(await screen.findByText(/Meet your shared Cradle Cat/i)).toBeInTheDocument(); expect(screen.getByLabelText("Companion name")).toHaveValue("Cradle Cat"); expect(screen.getByRole("img", { name: /Cradle Cat/ })).toBeInTheDocument(); });
  it("includes Pets in review only when present", async () => { mockState("review", "owner", true, [{ id: "p1", name: "Miso", petType: "cat", breed: null, notes: null }]); render(<App />); expect(await screen.findByRole("heading", { name: "Pets" })).toBeInTheDocument(); expect(screen.getByText(/Miso · Cat/)).toBeInTheDocument(); });
  it("routes completed onboarding directly to the honest Dashboard", async () => {
    mockState("complete"); render(<App />);
    expect(await screen.findByText(/Let’s get your household running/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Good .* Alex/i })).toBeInTheDocument();
    expect(screen.getByText(/Choose a few household routines/i)).toBeInTheDocument();
    expect(window.location.pathname).toBe("/dashboard");
    expect(screen.queryByText(/On track|Behind|Completed tasks/i)).not.toBeInTheDocument();
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

  it("preserves Companion selections after transport failure and retries freshly", async () => {
    const fetch = vi.fn()
      .mockImplementationOnce(() => response(200, session("companion")))
      .mockImplementationOnce(() => response(200, setup("companion")))
      .mockImplementationOnce(() => Promise.reject(new TypeError("runtime unreachable")))
      .mockImplementationOnce(() => response(200, { ok: true, data: { companion: {} }, requestId: "companion-save" }))
      .mockImplementationOnce(() => response(200, { ok: true, data: { step: "review" }, requestId: "companion-step" }))
      .mockImplementationOnce(() => response(200, setup("review")));
    vi.stubGlobal("fetch", fetch); render(<App />);
    const name = await screen.findByLabelText("Companion name") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Mochi" } });
    const greyFur = document.querySelector<HTMLInputElement>('input[name="fur"][value="grey"]');
    const gingerPatch = document.querySelector<HTMLInputElement>(
      'input[name="patchPrimary"][value="ginger"]',
    );
    const brownPatch = document.querySelector<HTMLInputElement>('input[name="patchSecondary"][value="brown"]');
    expect(greyFur).not.toBeNull();
    expect(gingerPatch).not.toBeNull();
    expect(brownPatch).not.toBeNull();
    fireEvent.click(greyFur!);
    fireEvent.click(gingerPatch!);
    fireEvent.click(brownPatch!);
    fireEvent.click(screen.getByRole("button", { name: /Save Companion and review setup/i }));
    expect(await screen.findByText("Cradle couldn’t connect")).toBeInTheDocument();
    expect(name).toHaveValue("Mochi");
    expect(greyFur).toBeChecked();
    expect(gingerPatch).toBeChecked();
    expect(brownPatch).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /Save Companion and review setup/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(6));
    expect(fetch.mock.calls.filter(([url]) => url === "/api/household/companion")).toHaveLength(2);
    expect(fetch.mock.calls[2][1]).toMatchObject({ method: "PUT", credentials: "same-origin" });
    expect(fetch.mock.calls[3][1]).toMatchObject({ method: "PUT", credentials: "same-origin" });
  });

  it("shows Companion authentication failure as an API error rather than a connection failure", async () => {
    const fetch = vi.fn()
      .mockImplementationOnce(() => response(200, session("companion")))
      .mockImplementationOnce(() => response(200, setup("companion")))
      .mockImplementationOnce(() => response(401, { ok: false, error: {
        code: "AUTHENTICATION_REQUIRED", message: "Please sign in to continue."
      }, requestId: "expired-companion-session" }));
    vi.stubGlobal("fetch", fetch); render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Save Companion and review setup/i }));
    expect(await screen.findByText(/Please sign in.*expired-companion-session/i)).toBeInTheDocument();
    expect(screen.queryByText("Cradle couldn’t connect")).not.toBeInTheDocument();
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

  it("does not resave Companion after a successful mutation when Review refresh fails", async () => {
    const fetch = vi.fn()
      .mockImplementationOnce(() => response(200, session("companion")))
      .mockImplementationOnce(() => response(200, setup("companion")))
      .mockImplementationOnce(() => response(200, { ok: true, data: { companion: { id: "c1" } }, requestId: "companion-saved" }))
      .mockImplementationOnce(() => response(200, { ok: true, data: { step: "review" }, requestId: "review-ready" }))
      .mockImplementationOnce(() => Promise.reject(new TypeError("refresh interrupted")))
      .mockImplementationOnce(() => response(200, setup("review")));
    vi.stubGlobal("fetch", fetch); render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Save Companion and review setup/i }));
    expect(await screen.findByText(/Companion saved and Review prepared.*couldn’t connect/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Meet your shared Cradle Cat/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /couldn’t load this household/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry opening Review" }));
    expect(await screen.findByRole("heading", { name: "Your household foundation." })).toBeInTheDocument();
    expect(fetch.mock.calls.filter(([url]) => url === "/api/household/companion")).toHaveLength(1);
    expect(fetch.mock.calls.filter(([url]) => url === "/api/household/setup/companion-complete")).toHaveLength(1);
  });
});
