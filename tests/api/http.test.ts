import { describe, expect, it } from "vitest";
import { failure, handleApiRequest, parseJsonBody, success, validationError } from "../../functions/api/http";
import { onRequest as developmentMiddleware } from "../../functions/_middleware";

type TestEnvelope = { ok: boolean; data?: { requestId?: string; ready?: boolean }; error?: { code: string; message: string; details?: Record<string, string> }; requestId: string };

async function responseBody(response: Response): Promise<TestEnvelope> {
  return await response.json() as TestEnvelope;
}

describe("API envelopes", () => {
  it("returns typed success envelopes with request IDs", async () => {
    const response = success({ ready: true }, "req_123");
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Request-ID")).toBe("req_123");
    expect(body).toEqual({ ok: true, data: { ready: true }, requestId: "req_123" });
  });

  it("returns typed error envelopes with request IDs", async () => {
    const response = failure(validationError("Bad fields", { name: "Required" }), "req_456");
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(response.headers.get("X-Request-ID")).toBe("req_456");
    expect(body).toEqual({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Bad fields", details: { name: "Required" } },
      requestId: "req_456"
    });
  });

  it("adds a correlation ID when handling API requests", async () => {
    const response = await handleApiRequest(new Request("https://cradle.test/health"), (requestId) => success({ requestId }, requestId));
    const body = await responseBody(response);

    expect(body.ok).toBe(true);
    expect(body.requestId).toEqual(expect.any(String));
    expect(body.data).toBeDefined();
    expect(body.data?.requestId).toBe(body.requestId);
  });

  it("does not expose unexpected errors to clients", async () => {
    const response = await handleApiRequest(new Request("https://cradle.test/fail"), () => {
      throw new Error("database exploded with private details");
    });
    const body = await responseBody(response);

    expect(response.status).toBe(500);
    expect(body.error).toEqual({ code: "SERVER_ERROR", message: "Cradle could not complete the request." });
  });

  it("handles malformed JSON as a validation failure", async () => {
    const request = new Request("https://cradle.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json"
    });

    await expect(parseJsonBody(request)).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Malformed JSON request body.",
      details: { body: "Check the JSON syntax" }
    });
  });

  it("adds a runtime ID only to development API responses and clears a reset session cookie", async () => {
    const development = await developmentMiddleware({
      request: new Request("http://localhost:8788/api/auth/session"),
      env: { APP_ENV: "development" },
      next: async () => new Response(JSON.stringify({ ok: false }), { status: 401 })
    });
    expect(development.headers.get("X-Cradle-Dev-Runtime-ID")).toEqual(expect.any(String));
    expect(development.headers.get("Set-Cookie")).toContain("cradle_session=; ");

    const production = await developmentMiddleware({
      request: new Request("https://cradle.test/api/auth/session"),
      env: { APP_ENV: "production" },
      next: async () => success({ ready: true }, "production-request")
    });
    expect(production.headers.get("X-Cradle-Dev-Runtime-ID")).toBeNull();
  });
});
