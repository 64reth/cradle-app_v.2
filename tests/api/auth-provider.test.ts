import { describe, expect, it, vi } from "vitest";
import { accountDisplayName, identityCookie, providerFromSupabaseUser, providerIdentity, synchroniseProviderAccount } from "../../functions/api/auth-provider";
import { onRequestPost as exchange } from "../../functions/api/auth/supabase/exchange";
import { SESSION_COOKIE } from "../../functions/api/auth";

type ProviderAccountRow = { id: string; status: string; identityId: string } | null;

function providerDb(options: { identityRows?: ProviderAccountRow[]; rejectFirstBatch?: boolean; identitySessionsUnavailable?: boolean } = {}) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const batches: unknown[][] = [];
  const identityRows = [...(options.identityRows || [])];
  const db = {
    prepare(sql: string) {
      const call = { sql, values: [] as unknown[] };
      calls.push(call);
      if (options.identitySessionsUnavailable && sql.includes("INSERT INTO identity_sessions")) {
        throw new Error("no such table: identity_sessions");
      }
      const statement = {
        bind(...values: unknown[]) { call.values = values; return statement; },
        async first() { return sql.includes("FROM auth_identities") ? identityRows.shift() || null : null; },
        async all() { return { results: [] }; },
        async run() { return { success: true, meta: { changes: 1 } }; },
      };
      return statement;
    },
    async batch(statements: unknown[]) {
      batches.push(statements);
      if (options.rejectFirstBatch && batches.length === 1) {
        throw new Error("UNIQUE constraint failed: auth_identities.provider, auth_identities.provider_subject");
      }
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  } as unknown as D1Database;
  return { db, calls, batches };
}

const verifiedGoogleUser = {
  id: "google-subject", email: "alex@example.com", app_metadata: { provider: "google" }, user_metadata: { full_name: "Alex Example" },
};

async function exchangeRequest(db: D1Database): Promise<Response> {
  return exchange({
    request: new Request("https://cradle.test/api/auth/supabase/exchange", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accessToken: "a".repeat(32) }),
    }),
    env: { DB: db, SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "anon", APP_ENV: "development" },
  });
}

describe("provider identity foundation", () => {
  it("maps Google, Apple and email identities without trusting display email as identity", () => {
    expect(providerFromSupabaseUser({ id: "g", app_metadata: { provider: "google" } })).toBe("google");
    expect(providerFromSupabaseUser({ id: "a", identities: [{ provider: "apple" }] })).toBe("apple");
    expect(providerIdentity({ id: "relay", email: "relay@privaterelay.appleid.com", app_metadata: { provider: "apple" } })).toEqual({
      provider: "apple", subject: "relay", email: "relay@privaterelay.appleid.com"
    });
  });

  it("creates secure identity cookies and safe profile names", () => {
    expect(identityCookie("token", { APP_ENV: "production" })).toContain("HttpOnly; SameSite=Lax; Path=/; Max-Age=");
    expect(identityCookie("token", { APP_ENV: "production" })).toContain("Secure");
    expect(identityCookie("token", { APP_ENV: "alpha" })).toContain("Secure");
    expect(accountDisplayName({ id: "x", user_metadata: { full_name: "  Alex  " } })).toBe("Alex");
    expect(accountDisplayName({ id: "x" })).toBe("New family member");
  });

  it("creates one provider-linked profile without creating a household", async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        const call = { sql, values: [] as unknown[] }; calls.push(call);
        const statement = { bind(...values: unknown[]) { call.values = values; return statement; },
          async first() { return null; }, async all() { return { results: [] }; }, async run() { return { success: true, meta: { changes: 1 } }; } };
        return statement;
      },
      async batch(statements: unknown[]) { return statements.map(() => ({ success: true, meta: { changes: 1 } })); }
    } as unknown as D1Database;
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ id: "google-subject", email: "alex@example.com", app_metadata: { provider: "google" } }), { status: 200 })) as typeof fetch;
    try {
      const response = await exchange({ request: new Request("https://cradle.test/api/auth/supabase/exchange", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accessToken: "a".repeat(32) })
      }), env: { DB: db, SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "anon", APP_ENV: "development" } });
      const body = await response.json() as { ok: boolean; data: { profileCreated: boolean; householdCount: number } };
      expect(response.status).toBe(200);
      expect(body.data).toMatchObject({ profileCreated: true, householdCount: 0 });
      expect(response.headers.get("Set-Cookie")).toContain("cradle_identity=");
      expect(calls.some(({ sql }) => sql.includes("INSERT INTO user_accounts"))).toBe(true);
      expect(calls.some(({ sql }) => sql.includes("INSERT INTO account_security"))).toBe(true);
      expect(calls.some(({ sql }) => sql.includes("INSERT INTO profiles"))).toBe(true);
      expect(calls.some(({ sql }) => sql.includes("INSERT INTO auth_identities"))).toBe(true);
      expect(calls.some(({ sql }) => sql.includes("INSERT INTO profile_preferences"))).toBe(true);
      expect(calls.some(({ sql }) => sql.includes("INSERT INTO identity_sessions"))).toBe(true);
      expect(response.headers.get("Set-Cookie")).not.toContain(`${SESSION_COOKIE}=`);
    } finally { globalThis.fetch = previousFetch; }
  });

  it("refreshes a known provider identity without creating another account", async () => {
    const { db, calls } = providerDb({ identityRows: [{ id: "account-existing", status: "active", identityId: "identity-existing" }] });

    const sync = await synchroniseProviderAccount(db, { ...verifiedGoogleUser, email: "new-email@example.com" });

    expect(sync).toMatchObject({ account: { id: "account-existing", status: "active" }, profileCreated: false });
    expect(calls.some(({ sql }) => sql.includes("INSERT INTO user_accounts"))).toBe(false);
    expect(calls.find(({ sql }) => sql.includes("UPDATE auth_identities SET email"))?.values).toEqual([
      "new-email@example.com", expect.any(String), "identity-existing",
    ]);
  });

  it("recovers the existing account when a concurrent provider callback wins the unique-constraint race", async () => {
    const { db, calls, batches } = providerDb({
      identityRows: [null, { id: "account-race", status: "active", identityId: "identity-race" }],
      rejectFirstBatch: true,
    });

    const sync = await synchroniseProviderAccount(db, verifiedGoogleUser);

    expect(sync).toMatchObject({ account: { id: "account-race" }, profileCreated: false });
    expect(batches).toHaveLength(2);
    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO user_accounts"))).toHaveLength(1);
    expect(calls.find(({ sql }) => sql.includes("UPDATE auth_identities SET email"))?.values.at(-1)).toBe("identity-race");
  });

  it("rejects a suspended provider account after synchronising its identity metadata", async () => {
    const { db, calls } = providerDb({ identityRows: [{ id: "account-suspended", status: "suspended", identityId: "identity-suspended" }] });
    const previousFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(verifiedGoogleUser), { status: 200 })) as typeof fetch;
    try {
      const response = await exchangeRequest(db);
      const body = await response.json() as { ok: boolean; error?: { code: string } };

      expect(response.status).toBe(403);
      expect(body).toMatchObject({ ok: false, error: { code: "ACCOUNT_UNAVAILABLE" } });
      expect(calls.some(({ sql }) => sql.includes("UPDATE auth_identities SET email"))).toBe(true);
      expect(calls.some(({ sql }) => sql.includes("INSERT INTO identity_sessions"))).toBe(false);
    } finally { globalThis.fetch = previousFetch; }
  });

  it("returns a typed schema error when identity sessions are unavailable after account synchronisation", async () => {
    const { db } = providerDb({ identityRows: [null], identitySessionsUnavailable: true });
    const previousFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(verifiedGoogleUser), { status: 200 })) as typeof fetch;
    try {
      const response = await exchangeRequest(db);
      const body = await response.json() as { ok: boolean; error?: { code: string } };

      expect(response.status).toBe(503);
      expect(body).toMatchObject({ ok: false, error: { code: "AUTH_SCHEMA_UNAVAILABLE" } });
    } finally { globalThis.fetch = previousFetch; }
  });

  it("returns a migration-specific error when the Worker D1 is behind the auth schema", async () => {
    const db = { prepare() { throw new Error("no such table: auth_identities"); } } as unknown as D1Database;
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ id: "google-subject", email: "alex@example.com", app_metadata: { provider: "google" } }), { status: 200 })) as typeof fetch;
    try {
      const response = await exchange({ request: new Request("https://cradle.test/api/auth/supabase/exchange", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accessToken: "a".repeat(32) })
      }), env: { DB: db, SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "anon", APP_ENV: "development" } });
      const body = await response.json() as { ok: boolean; error?: { code: string } };
      expect(response.status).toBe(503);
      expect(body).toMatchObject({ ok: false, error: { code: "AUTH_SCHEMA_UNAVAILABLE" } });
    } finally { globalThis.fetch = previousFetch; }
  });
});
