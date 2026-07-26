import { describe, expect, it } from "vitest";
import { onRequestPost } from "../../functions/api/auth/households";

type Call = { sql: string; values: unknown[] };

function request(body: object, cookie?: string): Request {
  return new Request("https://cradle.test/api/auth/households", {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body)
  });
}

function database(options: { authenticated?: boolean; failBatch?: boolean } = {}) {
  const calls: Call[] = [];
  const db = {
    prepare(sql: string) {
      const call = { sql, values: [] as unknown[] };
      calls.push(call);
      const statement = {
        bind(...values: unknown[]) { call.values = values; return statement; },
        async first() {
          if (!sql.includes("FROM identity_sessions")) return null;
          return options.authenticated === false ? null : { accountId: "provider-account", identitySessionId: "identity-session" };
        },
        async all() { return { results: [] }; },
        async run() { return { success: true, meta: { changes: 1 } }; }
      };
      return statement;
    },
    async batch(statements: unknown[]) {
      if (options.failBatch) throw new Error("D1 write unavailable");
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    }
  } as unknown as D1Database;
  return { db, calls };
}

describe("provider-authenticated household creation", () => {
  it("creates a household, first member, and household session without a PIN", async () => {
    const { db, calls } = database();
    const response = await onRequestPost({
      request: request({ householdName: "The Fox Home", displayName: "Alex" }, "cradle_identity=provider-token"),
      env: { DB: db, APP_ENV: "development" }
    });
    const body = await response.json() as { ok: boolean; data: { householdReference: string; profileReference: string; expiresAt: string } };

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ ok: true, data: { profileReference: "alex" } });
    expect(body.data.householdReference).toMatch(/^the-fox-home-/);
    expect(body.data.expiresAt).toBeTruthy();
    expect(response.headers.get("Set-Cookie")).toContain("cradle_session=");
    expect(calls.some(({ sql }) => sql.includes("INSERT INTO households"))).toBe(true);
    const member = calls.find(({ sql }) => sql.includes("INSERT INTO members"));
    expect(member?.values.at(-1)).toBe("provider-account");
    const session = calls.find(({ sql }) => sql.includes("INSERT INTO sessions"));
    expect(session?.values.at(-1)).toBe("provider-account");
    expect(calls.some(({ sql }) => sql.includes("INSERT INTO user_accounts"))).toBe(false);
    expect(calls.some(({ sql }) => /pin_hash|pin_salt/i.test(sql))).toBe(false);
  });

  it("rejects unauthenticated household creation without creating records", async () => {
    const { db, calls } = database({ authenticated: false });
    const response = await onRequestPost({ request: request({ householdName: "The Fox Home", displayName: "Alex" }), env: { DB: db } });
    const body = await response.json() as { ok: boolean; error: { code: string } };

    expect(response.status).toBe(401);
    expect(body).toMatchObject({ ok: false, error: { code: "AUTHENTICATION_REQUIRED" } });
    expect(calls.some(({ sql }) => sql.includes("INSERT INTO households") || sql.includes("INSERT INTO members"))).toBe(false);
  });

  it("reports an outdated identity schema without falling back to PIN creation", async () => {
    const db = { prepare() { throw new Error("no such table: identity_sessions"); } } as unknown as D1Database;
    const response = await onRequestPost({
      request: request({ householdName: "The Fox Home", displayName: "Alex" }, "cradle_identity=provider-token"),
      env: { DB: db }
    });
    const body = await response.json() as { ok: boolean; error: { code: string } };

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ ok: false, error: { code: "AUTH_SCHEMA_UNAVAILABLE" } });
  });

  it("returns a safe structured error when the household write fails", async () => {
    const { db } = database({ failBatch: true });
    const response = await onRequestPost({
      request: request({ householdName: "The Fox Home", displayName: "Alex" }, "cradle_identity=provider-token"),
      env: { DB: db }
    });
    const body = await response.json() as { ok: boolean; error: { code: string; message: string } };

    expect(response.status).toBe(500);
    expect(body).toEqual(expect.objectContaining({ ok: false, error: {
      code: "SERVER_ERROR", message: "Cradle could not complete the request."
    } }));
  });
});
