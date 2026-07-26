import { describe, expect, it } from "vitest";
import { accountDisplayName, identityCookie, providerFromSupabaseUser, providerIdentity } from "../../functions/api/auth-provider";
import { onRequestPost as exchange } from "../../functions/api/auth/supabase/exchange";
import { SESSION_COOKIE } from "../../functions/api/auth";

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
      expect(calls.some(({ sql }) => sql.includes("INSERT INTO auth_identities"))).toBe(true);
      expect(calls.some(({ sql }) => sql.includes("INSERT INTO profile_preferences"))).toBe(true);
      expect(response.headers.get("Set-Cookie")).not.toContain(`${SESSION_COOKIE}=`);
    } finally { globalThis.fetch = previousFetch; }
  });
});
