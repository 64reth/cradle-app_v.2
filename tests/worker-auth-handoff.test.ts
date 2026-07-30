import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../functions/worker";

type BoundCall = { sql: string; values: unknown[] };

function handoffDatabase() {
  const calls: BoundCall[] = [];
  let identityTokenHash: string | null = null;
  let identityAccountId: string | null = null;
  const db = {
    prepare(sql: string) {
      const call: BoundCall = { sql, values: [] };
      calls.push(call);
      const statement = {
        bind(...values: unknown[]) { call.values = values; return statement; },
        async first() {
          if (sql.includes("FROM auth_identities")) return null;
          if (sql.includes("FROM identity_sessions")) {
            const [tokenHash] = call.values;
            return tokenHash === identityTokenHash
              ? { accountId: identityAccountId, identitySessionId: "identity-session-1" }
              : null;
          }
          return null;
        },
        async all() { return { results: [] }; },
        async run() {
          if (sql.includes("INSERT INTO identity_sessions")) {
            identityAccountId = String(call.values[1]);
            identityTokenHash = String(call.values[2]);
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch(statements: unknown[]) {
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  } as unknown as D1Database;
  return { db, calls, identitySession: () => ({ accountId: identityAccountId, tokenHash: identityTokenHash }) };
}

const env = (db: D1Database) => ({
  DB: db,
  APP_ENV: "alpha",
  APP_VERSION: "0.1.0",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  ASSETS: { fetch: vi.fn() } as unknown as Fetcher,
});

const householdBody = JSON.stringify({ householdName: "The Fox Home", displayName: "Alex" });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Worker provider-auth session handoff", () => {
  it("preserves the identity cookie through the adapter and authenticates the subsequent household request", async () => {
    const { db, identitySession } = handoffDatabase();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      id: "google-subject",
      email: "alex@example.com",
      app_metadata: { provider: "google" },
      user_metadata: { full_name: "Alex Example" },
    }), { status: 200 })));

    const exchange = await worker.fetch(new Request("https://cradle.test/api/auth/supabase/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessToken: "a".repeat(32) }),
    }), env(db));
    const setCookie = exchange.headers.get("Set-Cookie");

    expect(exchange.status).toBe(200);
    expect(setCookie).toMatch(/^cradle_identity=[a-f0-9]{64};/);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=2592000");
    expect(setCookie).not.toContain("Domain=");
    expect(identitySession()).toEqual({
      accountId: expect.any(String),
      tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });

    const cookie = setCookie?.split(";", 1)[0];
    const household = await worker.fetch(new Request("https://cradle.test/api/auth/households", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookie || "" },
      body: householdBody,
    }), env(db));

    expect(household.status).toBe(201);
    await expect(household.json()).resolves.toMatchObject({ ok: true });
  });

  it.each([
    ["missing", undefined],
    ["invalid", "cradle_identity=not-the-issued-token"],
  ])("returns 401 for a %s identity cookie", async (_label, cookie) => {
    const { db } = handoffDatabase();
    const response = await worker.fetch(new Request("https://cradle.test/api/auth/households", {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: householdBody,
    }), env(db));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "AUTHENTICATION_REQUIRED" },
    });
  });
});
