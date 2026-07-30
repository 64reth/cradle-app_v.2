import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FamilyPanel } from "../src/Family";
import { InvitationPage } from "../src/Invitation";
import { PersonalArea } from "../src/PersonalArea";
import { Dashboard, type DashboardData } from "../src/Dashboard";

const response = (status: number, body: object) => Promise.resolve(new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" }
}));
const owner = { id: "owner", displayName: "Alex", role: "owner", lifecycleState: "active", hasAccount: 1 };
const gillian = { id: "gillian", displayName: "Gillian", role: "parent_admin", lifecycleState: "unclaimed", hasAccount: 0 };
const child = { id: "taryn", displayName: "Taryn", role: "child", lifecycleState: "managed", hasAccount: 0 };
const dashboard: DashboardData = {
  household: { name: "Fox House", reference: "fox" }, currentUser: owner, members: [owner, gillian, child],
  rooms: [{ id: "kitchen", name: "Kitchen", roomType: "kitchen" }],
  pets: [{ id: "tori", name: "Tori", petType: "cat" }],
  family: { canManage: true, pendingInviteCount: 0, joinRequestCount: 0 },
  suggestions: { canReview: true, openCount: 0 },
  schedule: { canCreate: true, canCreateLeadership: true, upcomingCount: 0, upcoming: [] },
  setup: { canManage: true, routinesChosen: false, readyForPlanning: false, steps: [
    { key: "household", label: "Household created", complete: true },
    { key: "family", label: "Family added", complete: true }
  ] },
  recommendations: [], routines: [], activeRoutineCount: 0,
  todayMission: { state: "setup", message: "Choose a few household routines and Cradle will build your daily plan." },
  currentDate: "2026-07-23", deferredModules: ["Plan", "Messages"]
};

afterEach(() => { vi.restoreAllMocks(); });

describe("family and personal user journeys", () => {
  it("presents Add family member permissions as accessible selectable cards", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/household/members") return response(200, { ok: true, data: { members: [owner] } });
      if (path === "/api/household/invites") return response(200, { ok: true, data: { invites: [] } });
      if (path === "/api/household/join-requests") return response(200, { ok: true, data: { requests: [] } });
      return response(200, { ok: true, data: { suggestions: [] } });
    }));
    render(<FamilyPanel dashboard={dashboard} onClose={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add family member" }));
    const group = screen.getByRole("group", { name: "What can this person manage?" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(within(group).getByText("Household admin").tagName).toBe("STRONG");
    expect(within(group).getByText(/Can manage family members/i).tagName).toBe("SMALL");
    fireEvent.click(within(group).getByText("Managed member"));
    const radios = within(group).getAllByRole("radio");
    expect(radios[2]).toBeChecked();
    expect(radios[1]).not.toBeChecked();
  });

  it("keeps every relationship state on member cards with an onward action and no Invitations panel", async () => {
    const statefulMembers: DashboardData["members"] = [
      owner,
      { ...gillian, id: "paused", displayName: "Paused Pat", lifecycleState: "suspended", hasAccount: 1 },
      { ...gillian, id: "paused-stale", displayName: "Paused Stale",
        lifecycleState: "suspended", hasAccount: 1, invitationStatus: "revoked", inviteId: "stale-paused" },
      { ...gillian, id: "joined-stale", displayName: "Joined Stale",
        lifecycleState: "active", hasAccount: 1, invitationStatus: "revoked", inviteId: "stale-joined" },
      { ...gillian, id: "ready", displayName: "Ready Riley" },
      { ...gillian, id: "pending", displayName: "Pending Penny", lifecycleState: "invited",
        inviteId: "invite-pending", invitationStatus: "pending", inviteExpiresAt: "2999-01-01" },
      { ...gillian, id: "revoked", displayName: "Revoked Robin",
        inviteId: "invite-revoked", invitationStatus: "revoked", inviteExpiresAt: "2999-01-01" },
      child,
    ];
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/household/members") {
        return response(200, { ok: true, data: { members: statefulMembers } });
      }
      if (path === "/api/household/join-requests") return response(200, { ok: true, data: { requests: [] } });
      return response(200, { ok: true, data: { suggestions: [] } });
    }));

    render(<FamilyPanel dashboard={{ ...dashboard, members: statefulMembers }}
      onClose={vi.fn()} onChanged={vi.fn()} />);

    expect((await screen.findAllByText("Access paused")).length).toBeGreaterThan(0);
    expect(screen.getByText("Ready to invite")).toBeInTheDocument();
    expect(screen.getByText("Invitation sent")).toBeInTheDocument();
    expect(screen.getByText("Invitation revoked")).toBeInTheDocument();
    expect(screen.getByText("Managed by household leaders")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Restore access" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Invite again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resend" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Invitations" })).not.toBeInTheDocument();
    const pausedStale = screen.getByText("Paused Stale").closest("article");
    expect(within(pausedStale!).getByText("Access paused")).toBeInTheDocument();
    expect(within(pausedStale!).queryByText("Invitation revoked")).not.toBeInTheDocument();
    expect(within(pausedStale!).queryByRole("button", { name: "Invite again" })).not.toBeInTheDocument();
    const joinedStale = screen.getByText("Joined Stale").closest("article");
    expect(within(joinedStale!).getByText("Joined Cradle")).toBeInTheDocument();
    expect(within(joinedStale!).queryByText("Invitation revoked")).not.toBeInTheDocument();
    expect(within(joinedStale!).queryByRole("button", { name: "Invite again" })).not.toBeInTheDocument();
    for (const name of ["Paused Pat", "Ready Riley", "Pending Penny", "Revoked Robin", "Taryn"]) {
      const card = screen.getByText(name).closest("article");
      expect(card).not.toBeNull();
      expect(within(card!).getAllByRole("button").length).toBeGreaterThan(0);
    }
  });

  it("shows an honest Family Status and management action only to leadership", () => {
    const { rerender } = render(<Dashboard data={dashboard} setData={vi.fn()} navigate={vi.fn()} signOut={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Gillian: Waiting to join" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage family" })).toBeInTheDocument();
    const adultDashboard = { ...dashboard, currentUser: { ...owner, role: "adult" },
      family: { canManage: false, pendingInviteCount: 0, joinRequestCount: 0 },
      setup: { ...dashboard.setup, canManage: false } };
    rerender(<Dashboard data={adultDashboard} setData={vi.fn()} navigate={vi.fn()} signOut={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Manage family" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alex: Customise avatar" })).toBeInTheDocument();
  });

  it("gives an added Member Invite, Add another, Invite later and Done outcomes", async () => {
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/household/members" && init?.method === "POST") {
        return response(201, { ok: true, data: { member: { ...gillian, id: "new-gillian" } }, requestId: "member" });
      }
      if (path === "/api/household/members") return response(200, { ok: true, data: { members: [owner, gillian, child] }, requestId: "family" });
      if (path === "/api/household/invites") return response(200, { ok: true, data: { invites: [] }, requestId: "invites" });
      if (path === "/api/household/join-requests") return response(200, { ok: true, data: { requests: [] }, requestId: "requests" });
      if (path === "/api/household/task-suggestions") return response(200, { ok: true, data: { suggestions: [] }, requestId: "suggestions" });
      if (path === "/api/dashboard") return response(200, { ok: true, data: dashboard, requestId: "dashboard" });
      throw new Error(`Unexpected ${path}`);
    });
    vi.stubGlobal("fetch", fetch);
    render(<FamilyPanel dashboard={dashboard} onClose={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add family member" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Gillian" } });
    fireEvent.click(screen.getByRole("button", { name: "Add family member" }));
    expect(await screen.findByRole("button", { name: "Invite now" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add another" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invite later" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  it("gives leadership reachable family member, managed avatar and suggestion-review actions", async () => {
    const suggestion = {
      id: "suggestion", title: "Add a shoe tidy", suggestionType: "one_off", note: "The hall gets busy.",
      status: "open", suggestedByName: "Taryn", roomName: null, petName: null
    };
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/household/members") return response(200, { ok: true, data: { members: [owner, gillian, child] } });
      if (path === "/api/household/invites") return response(200, { ok: true, data: { invites: [] } });
      if (path === "/api/household/join-requests") return response(200, { ok: true, data: { requests: [] } });
      if (path === "/api/household/task-suggestions" && !init?.method) {
        return response(200, { ok: true, data: { suggestions: [suggestion] } });
      }
      if (path === "/api/household/task-suggestions/suggestion/review" && init?.method === "POST") {
        return response(200, { ok: true, data: { reviewed: true, routineCreated: false } });
      }
      if (path === "/api/dashboard") return response(200, { ok: true, data: dashboard });
      throw new Error(`Unexpected ${path}`);
    });
    vi.stubGlobal("fetch", fetch);
    render(<FamilyPanel dashboard={dashboard} onClose={vi.fn()} onChanged={vi.fn()} />);
    const childRow = (await screen.findByText("Taryn")).closest("article");
    expect(childRow).not.toBeNull();
    fireEvent.click(within(childRow as HTMLElement).getByRole("button", { name: "Manage" }));
    expect(screen.getByRole("heading", { name: "Manage Taryn" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Family avatar" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(await screen.findByRole("button", { name: "Accept idea" }));
    expect(await screen.findByText(/accepted as an idea.*No routine or task was created/i)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/household/task-suggestions/suggestion/review",
      expect.objectContaining({ method: "POST", credentials: "same-origin" }));
  });

  it("never leaves invitation creation on a token-only state", async () => {
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/household/members") return response(200, { ok: true, data: { members: [owner, gillian] } });
      if (path === "/api/household/join-requests") return response(200, { ok: true, data: { requests: [] } });
      if (path === "/api/household/task-suggestions") return response(200, { ok: true, data: { suggestions: [] } });
      if (path === "/api/household/invites" && init?.method === "POST") return response(201, { ok: true, data: { invite: {
        id: "invite", targetMemberId: "gillian", targetName: "Gillian", inviteType: "profile", role: "parent_admin",
        expiresAt: "2999", status: "active", inviteUrl: "https://cradle.test/invite/private", code: "ABC123"
      } } });
      if (path === "/api/household/invites") return response(200, { ok: true, data: { invites: [] } });
      if (path === "/api/dashboard") return response(200, { ok: true, data: dashboard });
      throw new Error(`Unexpected ${path}`);
    });
    vi.stubGlobal("fetch", fetch);
    render(<FamilyPanel dashboard={dashboard} onClose={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Invite$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create invitation" }));
    expect(await screen.findByRole("button", { name: "Copy link" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy code" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show QR code" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  it("preserves failed Member input and always offers Cancel and Dashboard exits", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/household/members" && init?.method === "POST") {
        return response(409, { ok: false, error: { message: "That family member already exists." }, requestId: "member-error" });
      }
      if (String(input) === "/api/household/members") return response(200, { ok: true, data: { members: [owner] } });
      if (String(input) === "/api/household/invites") return response(200, { ok: true, data: { invites: [] } });
      if (String(input) === "/api/household/task-suggestions") return response(200, { ok: true, data: { suggestions: [] } });
      return response(200, { ok: true, data: { requests: [] } });
    }));
    render(<FamilyPanel dashboard={dashboard} onClose={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add family member" }));
    const name = screen.getByLabelText("Name");
    fireEvent.change(name, { target: { value: "Gillian" } });
    fireEvent.click(screen.getByRole("button", { name: "Add family member" }));
    expect(await screen.findByText(/already exists.*member-error/i)).toBeInTheDocument();
    expect(name).toHaveValue("Gillian");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Back to Dashboard" }).length).toBeGreaterThan(0);
  });

  it("renders /me with honest tasks, suggestion CTA and Dashboard return paths", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response(200, { ok: true, data: {
      member: { id: "owner", displayName: "Alex", preferredName: null, role: "owner", lifecycleState: "active", householdName: "Fox House" },
      avatar: null, suggestions: [],
      personalTasks: { state: "not_generated", message: "No tasks have been generated yet. Your household routines are ready for planning." },
      deferred: ["Help Requests", "Messages", "Preferences", "Account"]
    } })));
    render(<PersonalArea dashboard={dashboard} navigate={vi.fn()} signOut={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "My Cradle" })).toBeInTheDocument();
    expect(document.querySelectorAll(".personal-profile-hero")).toHaveLength(1);
    expect(document.querySelectorAll(".personal-overview, .personal-companion")).toHaveLength(0);
    expect(screen.getAllByRole("heading", { name: "What should Cradle keep in mind?" })).toHaveLength(1);
    expect(screen.getByText(/No tasks have been generated yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suggest something" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Back to Dashboard" }).length).toBeGreaterThan(0);
    const avatarLauncher = screen.getByRole("button", { name: "Customise your cat" });
    avatarLauncher.focus(); fireEvent.click(avatarLauncher);
    expect(screen.getByRole("dialog", { name: "Edit your cat" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Edit your cat" })).not.toBeInTheDocument();
    expect(avatarLauncher).toHaveFocus();
  });

  it("offers household-private Hobbies and Interests with a custom entry", async () => {
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/me/interests" && init?.method === "POST") return response(201, { ok: true, data: { interest: { id: "i1", name: "Model building", active: true }, interests: [] } });
      return response(200, { ok: true, data: {
        member: { id: "owner", displayName: "Alex", preferredName: null, role: "owner", accessLevel: "household_admin", lifecycleState: "active", householdName: "Fox House" },
        avatar: null, suggestions: [], interests: [], favourites: [], mealPreferences: null,
        personalTasks: { state: "empty", message: "Nothing is assigned here today.", tasks: [] }, helpRequested: [], helpers: [], viewedMemberId: "owner", deferred: []
      } });
    });
    vi.stubGlobal("fetch", fetch);
    render(<PersonalArea dashboard={dashboard} navigate={vi.fn()} signOut={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Hobbies and Interests" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add interest" }));
    fireEvent.change(screen.getByLabelText("Interest"), { target: { value: "Model building" } });
    fireEvent.click(screen.getByRole("button", { name: "Save interest" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/me/interests", expect.objectContaining({ method: "POST" })));
  });

  it("gives expired or revoked invitation states retry and safe sign-in exits", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response(410, {
      ok: false, error: { code: "INVITE_EXPIRED", message: "This invitation has expired." }, requestId: "invite-expired"
    })));
    render(<InvitationPage reference="expired" accepted={vi.fn()} goHome={vi.fn()} />);
    expect(await screen.findByText(/invitation is unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Return to sign in" })).toBeInTheDocument();
  });

  it("routes accepted profile invitations onward to Dashboard", async () => {
    const accepted = vi.fn();
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST"
      ? response(201, { ok: true, data: { accepted: true, destination: "/dashboard" } })
      : response(200, { ok: true, data: { invitation: {
        householdName: "Fox House", inviteType: "profile", targetMemberId: "gillian", targetName: "Gillian",
        role: "parent_admin", expiresAt: "2999", alreadyAccepted: false, identityAuthenticated: true, availableProfiles: []
      } } })));
    render(<InvitationPage reference="private" accepted={accepted} goHome={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Join household" }));
    await waitFor(() => expect(accepted).toHaveBeenCalled());
    expect(screen.queryByLabelText(/PIN/i)).not.toBeInTheDocument();
  });
});
