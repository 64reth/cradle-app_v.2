import { describe, expect, it } from "vitest";
import { sha256, SESSION_COOKIE } from "../../functions/api/auth";
import { onRequestGet as membersRoute } from "../../functions/api/household/members";
import { onRequestPost as invitationsRoute } from "../../functions/api/household/invitations";
import { onRequestPost as signOutRoute } from "../../functions/api/auth/sign-out";

type Identity = { sessionId: string; householdId: string; householdName: string; householdReference: string;
  memberId: string; displayName: string; profileReference: string; role: string; expiresAt: string };

function mockDb(identity: Identity, members: object[] = []) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const db = { prepare(sql: string) {
    const call = { sql, values: [] as unknown[] }; calls.push(call);
    return { bind(...values: unknown[]) {
      call.values = values;
      return { first: async () => identity, all: async () => ({ results: members }),
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
  role: "owner", expiresAt: "2999-01-01" };

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
});
