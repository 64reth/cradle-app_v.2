import { describe, expect, it } from "vitest";
import { onRequestGet } from "../../functions/health";

type HealthEnvelope = { ok: boolean; data?: { service: string; status: string; function: string; database: string; apiVersion: string }; error?: { code: string; message: string }; requestId: string };

async function responseBody(response: Response): Promise<HealthEnvelope> {
  return await response.json() as HealthEnvelope;
}

function mockD1() {
  return {
    prepare: (sql: string) => ({
      first: async () => ({ ok: sql.includes("SELECT 1") ? 1 : 0 })
    })
  } as unknown as D1Database;
}

describe("health endpoint", () => {
  it("returns success when the D1 binding responds", async () => {
    const response = await onRequestGet({
      request: new Request("https://cradle.test/health", { headers: { "CF-Ray": "ray_123" } }),
      env: { DB: mockD1(), API_VERSION: "v1" }
    });
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      data: { service: "cradle", status: "ok", function: "ok", database: "ok", apiVersion: "v1" },
      requestId: "ray_123"
    });
  });

  it("returns a safe failure when the D1 binding is unavailable", async () => {
    const response = await onRequestGet({
      request: new Request("https://cradle.test/health"),
      env: {}
    });
    const body = await responseBody(response);

    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error).toEqual({ code: "DB_UNAVAILABLE", message: "Database binding is unavailable." });
    expect(body.requestId).toEqual(expect.any(String));
  });
});
