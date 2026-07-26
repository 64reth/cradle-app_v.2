import { describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "../../functions/api/auth";
import { onRequestGet as today } from "../../functions/api/together/today";

describe("Together protected API", () => {
  it("requires the authenticated household session", async () => {
    const response = await today({ request: new Request("https://cradle.test/api/together/today"), env: { DB: {} as D1Database } });
    expect(response.status).toBe(401);
  });

  it("uses the session cookie rather than a client household id", async () => {
    const request = new Request("https://cradle.test/api/together/today?householdId=other", { headers: { cookie: `${SESSION_COOKIE}=missing` } });
    const response = await today({ request, env: { DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) } as unknown as D1Database } });
    expect(response.status).toBe(401);
  });
});
