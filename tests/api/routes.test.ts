import { describe, expect, it } from "vitest";
import { sha256, SESSION_COOKIE } from "../../functions/api/auth";
import { onRequestGet as membersRoute } from "../../functions/api/household/members";
import { onRequestPost as invitationsRoute } from "../../functions/api/household/invitations";
import { onRequestPost as signOutRoute } from "../../functions/api/auth/sign-out";
import { onRequestPost as createPet } from "../../functions/api/household/pets/index";
import { onRequestDelete as deletePet, onRequestPatch as updatePet } from "../../functions/api/household/pets/[petId]";
import { PET_TYPE_VALUES } from "../../shared/pets";
import { onRequestPut as putCompanion } from "../../functions/api/household/companion";
import { onRequestPost as createRoom } from "../../functions/api/household/rooms/index";

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
  } } as unknown as D1Database;
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
  it("ignores forged identity and scopes member queries to the session household", async () => {
    const { db, calls } = mockDb(owner, [{ displayName: "Alex", profileReference: "alex", role: "owner" }]);
    const response = await membersRoute({ request: request("/api/household/members?household_id=house-b"), env: { DB: db } });
    expect(response.status).toBe(200);
    expect(calls.find((call) => call.sql.includes("FROM members WHERE"))?.values).toEqual(["house-a"]);
  });

  it("returns only the signed-in child's safe membership state", async () => {
    const child = { ...owner, role: "child", displayName: "Casey", profileReference: "casey" };
    const { db, calls } = mockDb(child);
    const response = await membersRoute({ request: request("/api/household/members"), env: { DB: db } });
    const body = await response.json() as { data: { members: object[] } };
    expect(body.data.members).toEqual([{ displayName: "Casey", profileReference: "casey", role: "child" }]);
    expect(calls.some((call) => call.sql.includes("FROM members WHERE"))).toBe(false);
  });

  it("stores a hash instead of the raw invitation code", async () => {
    const { db, calls } = mockDb(owner);
    const response = await invitationsRoute({ request: request("/api/household/invitations", {
      method: "POST", body: JSON.stringify({ role: "adult" })
    }), env: { DB: db } });
    const body = await response.json() as { data: { code: string } };
    const insert = calls.find((call) => call.sql.includes("INSERT INTO invitation_codes"));
    expect(response.status).toBe(201);
    expect(insert?.values).toContain("house-a");
    expect(insert?.values).not.toContain(body.data.code);
    expect(insert?.values).toContain(await sha256(body.data.code));
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

  it("upserts a valid default Companion within the session household", async () => {
    const { db, calls } = mockDb({ ...owner, setupStep: "companion" });
    const response = await putCompanion({ request: request("/api/household/companion", {
      method: "PUT", body: JSON.stringify({ name: "Cradle Cat", furPaletteKey: "orange",
        patchPrimaryPaletteKey: "cream", patchSecondaryPaletteKey: "white", expressionKey: "neutral" })
    }), env: { DB: db } });
    expect(response.status).toBe(200);
    const upsert = calls.find((call) => call.sql.includes("INSERT INTO companions"));
    expect(upsert?.values).toContain("house-a");
    expect(upsert?.values).toContain("Cradle Cat");
    expect(upsert?.values).not.toContain("house-b");
  });

  it("rejects invalid Companion names, palettes, and expressions", async () => {
    const invalid = [
      { name: "", furPaletteKey: "orange", patchPrimaryPaletteKey: "cream", patchSecondaryPaletteKey: "white", expressionKey: "neutral" },
      { name: "Cat", furPaletteKey: "purple", patchPrimaryPaletteKey: "cream", patchSecondaryPaletteKey: "white", expressionKey: "neutral" },
      { name: "Cat", furPaletteKey: "orange", patchPrimaryPaletteKey: "purple", patchSecondaryPaletteKey: "white", expressionKey: "neutral" },
      { name: "Cat", furPaletteKey: "orange", patchPrimaryPaletteKey: "cream", patchSecondaryPaletteKey: "purple", expressionKey: "neutral" },
      { name: "Cat", furPaletteKey: "orange", patchPrimaryPaletteKey: "cream", patchSecondaryPaletteKey: "white", expressionKey: "dancing" }
    ];
    for (const body of invalid) {
      const { db } = mockDb({ ...owner, setupStep: "companion" });
      const response = await putCompanion({ request: request("/api/household/companion", {
        method: "PUT", body: JSON.stringify(body)
      }), env: { DB: db } });
      expect(response.status).toBe(400);
    }
  });

  it("denies Adult and Child Companion configuration during setup", async () => {
    for (const role of ["adult", "child"]) {
      const { db } = mockDb({ ...owner, role, setupStep: "companion" });
      const response = await putCompanion({ request: request("/api/household/companion", {
        method: "PUT", body: JSON.stringify({ name: "Cat", furPaletteKey: "orange",
          patchPrimaryPaletteKey: "cream", patchSecondaryPaletteKey: "white", expressionKey: "neutral" })
      }), env: { DB: db } });
      expect(response.status).toBe(403);
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
});
