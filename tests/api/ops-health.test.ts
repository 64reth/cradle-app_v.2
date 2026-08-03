import { describe, expect, it } from "vitest";
import { onRequestGet } from "../../functions/api/ops/health";
import { SESSION_COOKIE } from "../../functions/api/auth";

const identity = { sessionId: "session", accountId: "account", householdId: "home", householdName: "Home",
  householdReference: "home", memberId: "owner", displayName: "Owner", profileReference: "owner", role: "owner",
  expiresAt: "2999-01-01", setupStatus: "complete", setupStep: "complete" };

function db(options: { operator?: boolean; failTable?: string } = {}) {
  return { prepare(sql: string) { return { bind(...values: unknown[]) { return {
    first: async () => sql.includes("FROM sessions s") ? identity : sql.includes("FROM platform_operators")
      ? (options.operator ? { accountId: "account" } : null) : sql.includes("SELECT 1") ? { ok: 1 }
        : sql.includes("alpha_diagnostic_events") ? { count: 0 } : null,
    all: async () => {
      const requested = values.map(String); const results = requested.filter((name) => name !== options.failTable).map((name) => ({ name }));
      return { results };
    }, run: async () => ({ success: true, meta: { changes: 1 } })
  }; } }; } } as unknown as D1Database;
}
const request = () => new Request("https://cradle.test/api/ops/health", { headers: { cookie: `${SESSION_COOKIE}=token`, "CF-Ray": "health-request" } });

describe("protected Alpha Health aggregate", () => {
  it("denies ordinary household owners", async () => {
    expect((await onRequestGet({ request: request(), env: { DB: db() } })).status).toBe(403);
  });

  it("allows platform operators and labels unrecorded build values honestly", async () => {
    const response = await onRequestGet({ request: request(), env: { DB: db({ operator: true }), APP_VERSION: "alpha" } });
    const body = await response.json() as { data: { overall: string; build: { validatedTestCount: number | null; testCountLabel: string } }; requestId: string };
    expect(response.status).toBe(200);
    expect(body.data.overall).toBe("healthy");
    expect(body.data.build).toMatchObject({ validatedTestCount: null, testCountLabel: "Not recorded for this build" });
    expect(body.requestId).toBe("health-request");
    expect(JSON.stringify(body)).not.toMatch(/token|Owner|home-a|SUPABASE_ANON_KEY/);
  });

  it("isolates a failed subsystem and returns a degraded aggregate", async () => {
    const response = await onRequestGet({ request: request(), env: { DB: db({ operator: true, failTable: "household_invites" }) } });
    const body = await response.json() as { data: { overall: string; signals: Record<string, { status: string; code?: string }> } };
    expect(response.status).toBe(200);
    expect(body.data.overall).toBe("degraded");
    expect(body.data.signals.invitations).toMatchObject({ status: "unavailable", code: "INVITATIONS_CHECK_UNAVAILABLE" });
    expect(body.data.signals.members.status).toBe("healthy");
  });
});

