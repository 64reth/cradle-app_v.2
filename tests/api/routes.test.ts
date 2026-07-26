import { describe, expect, it } from "vitest";
import { sha256, SESSION_COOKIE } from "../../functions/api/auth";
import { onRequestGet as membersRoute } from "../../functions/api/household/members";
import { onRequestPost as invitationsRoute } from "../../functions/api/household/invitations";
import { onRequestPost as signOutRoute } from "../../functions/api/auth/sign-out";
import { onRequestPost as createPet } from "../../functions/api/household/pets/index";
import { onRequestDelete as deletePet, onRequestPatch as updatePet } from "../../functions/api/household/pets/[petId]";
import { PET_TYPE_VALUES } from "../../shared/pets";
import { onRequestPost as createRoom } from "../../functions/api/household/rooms/index";
import { onRequestPost as alphaEvent } from "../../functions/api/alpha/events";
import { onRequestPost as alphaFeedback } from "../../functions/api/alpha/feedback";
import { onRequestGet as alphaDiagnostics } from "../../functions/api/alpha/diagnostics";

type Identity = { sessionId: string; householdId: string; householdName: string; householdReference: string;
  memberId: string; displayName: string; profileReference: string; role: string; expiresAt: string;
  setupStatus?: string; setupStep?: string };

function mockDb(identity: Identity, members: object[] = []) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const db = { prepare(sql: string) {
    const call = { sql, values: [] as unknown[] }; calls.push(call);
      return { bind(...values: unknown[]) {
      call.values = values;
      return { first: async () => sql.includes("SELECT setup_status AS status")
        ? { status: identity.setupStatus, step: identity.setupStep } : identity,
        all: async () => ({ results: members }),
        run: async () => ({ success: true, meta: { changes: 1 } }) };
    } };
  }, batch: async (statements: unknown[]) => statements.map(() => ({ success: true, meta: { changes: 1 } })) } as unknown as D1Database;
  return { db, calls };
}

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://cradle.test${path}`, { ...init, headers: {
    cookie: `${SESSION_COOKIE}=raw-token`, "content-type": "application/json", ...(init.headers || {})
  } });
}

const owner: Identity = { sessionId: "session-a", householdId: "house-a", householdName: "A",
  householdReference: "a-ref", memberId: "owner-a", displayName: "Alex", profileReference: "alex",
  role: "owner", expiresAt: "2999-01-01", setupStatus: "incomplete", setupStep: "pets" };

describe("protected Phase 3 routes", () => {
  it("stores privacy-safe alpha events under the authenticated household", async () => {
    const { db, calls } = mockDb(owner);
    const response = await alphaEvent({ request: request("/api/alpha/events", {
      method: "POST", body: JSON.stringify({ name: "api_error", screen: "dashboard", action: "sign_off", message: "secret" })
    }), env: { DB: db, APP_VERSION: "0.1.0" } });
    expect(response.status).toBe(202);
    const insert = calls.find(({ sql }) => sql.includes("INSERT INTO alpha_diagnostic_events"));
    expect(insert?.values).toContain("house-a");
    expect(insert?.values).toContain("owner-a");
    expect(insert?.values).not.toContain("secret");
  });

  it("accepts explicit feedback and restricts diagnostics reads to admins", async () => {
    const { db, calls } = mockDb(owner);
    const feedback = await alphaFeedback({ request: request("/api/alpha/feedback", {
      method: "POST", body: JSON.stringify({ category: "confusion", screen: "meals", message: "The review step was unclear." })
    }), env: { DB: db, APP_VERSION: "0.1.0" } });
    expect(feedback.status).toBe(201);
    expect(calls.find(({ sql }) => sql.includes("INSERT INTO alpha_feedback"))?.values).toContain("house-a");
    const diagnostics = await alphaDiagnostics({ request: request("/api/alpha/diagnostics"), env: { DB: db } });
    expect(diagnostics.status).toBe(200);
    const member = mockDb({ ...owner, role: "adult" });
    expect((await alphaDiagnostics({ request: request("/api/alpha/diagnostics"), env: { DB: member.db } })).status).toBe(403);
  });
  it("ignores forged identity and scopes member queries to the session household", async () => {
    const { db, calls } = mockDb(owner, [{ displayName: "Alex", profileReference: "alex", role: "owner" }]);
    const response = await membersRoute({ request: request("/api/household/members?household_id=house-b"), env: { DB: db } });
    expect(response.status).toBe(200);
    expect(calls.find((call) => call.sql.includes("FROM members m"))?.values).toEqual(["house-a"]);
  });

  it("returns a safe family representation to a signed-in Child", async () => {
    const child = { ...owner, role: "child", displayName: "Casey", profileReference: "casey" };
    const safeMembers = [{ id: "casey", displayName: "Casey", role: "child", lifecycleState: "active" }];
    const { db, calls } = mockDb(child, safeMembers);
    const response = await membersRoute({ request: request("/api/household/members"), env: { DB: db } });
    const body = await response.json() as { data: { members: object[] } };
    expect(body.data.members).toEqual(safeMembers);
    expect(calls.find((call) => call.sql.includes("FROM members m"))?.values).toEqual(["house-a"]);
  });

  it("stores a hash instead of the raw invitation code", async () => {
    const { db, calls } = mockDb(owner);
    const response = await invitationsRoute({ request: request("/api/household/invitations", {
      method: "POST", body: JSON.stringify({ role: "adult" })
    }), env: { DB: db } });
    const body = await response.json() as { data: { code: string } };
    const insert = calls.find((call) => call.sql.includes("INSERT INTO household_invites"));
    expect(response.status).toBe(201);
    expect(insert?.values).toContain("house-a");
    expect(insert?.values).not.toContain(body.data.code);
    expect(insert?.values).toContain(await sha256(body.data.code));
    expect(body.data).toHaveProperty("inviteUrl");
  });

  it("denies invitation creation to adults", async () => {
    const { db, calls } = mockDb({ ...owner, role: "adult" });
    const response = await invitationsRoute({ request: request("/api/household/invitations", {
      method: "POST", body: JSON.stringify({ role: "child" })
    }), env: { DB: db } });
    expect(response.status).toBe(403);
    expect(calls.some((call) => call.sql.includes("INSERT INTO invitation_codes"))).toBe(false);
  });

  it("revokes only the authenticated session and clears the cookie", async () => {
    const { db, calls } = mockDb(owner);
    const response = await signOutRoute({ request: request("/api/auth/sign-out", { method: "POST", body: "{}" }), env: { DB: db } });
    expect(calls.find((call) => call.sql.includes("UPDATE sessions"))?.values.slice(-2)).toEqual(["house-a", "session-a"]);
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("rejects a missing session before protected data is read", async () => {
    const { db } = mockDb(owner);
    const response = await membersRoute({ request: new Request("https://cradle.test/api/household/members"), env: { DB: db } });
    expect(response.status).toBe(401);
  });

  it("accepts every central Pet type and scopes creation to the session household", async () => {
    for (const petType of PET_TYPE_VALUES) {
      const { db, calls } = mockDb(owner);
      const response = await createPet({ request: request("/api/household/pets", {
        method: "POST", body: JSON.stringify({ name: "  Miso  ", petType, breed: "Tabby", notes: "Likes naps" })
      }), env: { DB: db } });
      expect(response.status).toBe(201);
      const insert = calls.find((call) => call.sql.includes("INSERT INTO pets"));
      expect(insert?.values).toContain("house-a");
      expect(insert?.values).toContain("Miso");
      expect(insert?.values).toContain(petType);
    }
  });

  it("rejects unsupported Pet types and invalid names", async () => {
    const { db } = mockDb(owner);
    const unsupported = await createPet({ request: request("/api/household/pets", {
      method: "POST", body: JSON.stringify({ name: "Miso", petType: "dragon" })
    }), env: { DB: db } });
    expect(unsupported.status).toBe(400);
    const empty = await createPet({ request: request("/api/household/pets", {
      method: "POST", body: JSON.stringify({ name: " ", petType: "cat" })
    }), env: { DB: db } });
    expect(empty.status).toBe(400);
    const excessive = await createPet({ request: request("/api/household/pets", {
      method: "POST", body: JSON.stringify({ name: "x".repeat(81), petType: "cat" })
    }), env: { DB: db } });
    expect(excessive.status).toBe(400);
  });

  it("tenant-scopes Pet editing and deactivation", async () => {
    const { db, calls } = mockDb(owner);
    expect((await updatePet({ request: request("/api/household/pets/foreign", {
      method: "PATCH", body: JSON.stringify({ name: "Miso", petType: "cat", breed: "", notes: "" })
    }), env: { DB: db }, params: { petId: "foreign" } })).status).toBe(200);
    expect((await deletePet({ request: request("/api/household/pets/foreign", {
      method: "DELETE", body: "{}"
    }), env: { DB: db }, params: { petId: "foreign" } })).status).toBe(200);
    const mutations = calls.filter((call) => call.sql.includes("UPDATE pets"));
    expect(mutations).toHaveLength(2);
    expect(mutations.every((call) => call.sql.includes("household_id = ?") && call.values.includes("house-a"))).toBe(true);
  });

  it("denies Adult and Child Pet modification during initial setup", async () => {
    for (const role of ["adult", "child"]) {
      const { db, calls } = mockDb({ ...owner, role });
      const response = await createPet({ request: request("/api/household/pets", {
        method: "POST", body: JSON.stringify({ name: "Miso", petType: "cat" })
      }), env: { DB: db } });
      expect(response.status).toBe(403);
      expect(calls.some((call) => call.sql.includes("INSERT INTO pets"))).toBe(false);
    }
  });

  it("matches the frontend Room creation contract and includes the session tenant", async () => {
    const { db, calls } = mockDb({ ...owner, setupStep: "rooms" });
    const response = await createRoom({ request: request("/api/household/rooms", {
      method: "POST", body: JSON.stringify({ name: "  Kitchen  ", description: "Main room" })
    }), env: { DB: db } });
    const body = await response.json() as { ok: boolean; data: { room: { name: string } }; requestId: string };
    expect(response.status).toBe(201);
    expect(response.headers.get("X-Request-ID")).toBe(body.requestId);
    expect(body.data.room.name).toBe("Kitchen");
    const insert = calls.find((call) => call.sql.includes("INSERT INTO rooms"));
    expect(insert?.values).toContain("house-a");
  });

  it("persists optional Room occupants from the canonical active Family collection", async () => {
    const roomOwner = { ...owner, setupStep: "rooms" };
    const { db, calls } = mockDb(roomOwner, [{ id: "owner-a" }, { id: "child-a" }]);
    const response = await createRoom({ request: request("/api/household/rooms", {
      method: "POST", body: JSON.stringify({
        name: "Children’s bedroom",
        roomType: "child_bedroom",
        occupantMemberIds: ["owner-a", "child-a"]
      })
    }), env: { DB: db } });
    expect(response.status).toBe(201);
    const occupantInserts = calls.filter(({ sql }) => sql.includes("INSERT INTO room_occupants"));
    expect(occupantInserts).toHaveLength(2);
    expect(occupantInserts.map(({ values }) => values[2])).toEqual(["owner-a", "child-a"]);
    expect(occupantInserts.every(({ values }) => values[0] === "house-a")).toBe(true);
  });

  it("rejects a Room occupant outside the authenticated household", async () => {
    const roomOwner = { ...owner, setupStep: "rooms" };
    const { db, calls } = mockDb(roomOwner, [{ id: "owner-a" }]);
    const response = await createRoom({ request: request("/api/household/rooms", {
      method: "POST", body: JSON.stringify({
        name: "Bedroom",
        roomType: "bedroom",
        occupantMemberIds: ["foreign-member"]
      })
    }), env: { DB: db } });
    expect(response.status).toBe(400);
    expect(calls.some(({ sql }) => sql.includes("INSERT INTO rooms"))).toBe(false);
  });
});
