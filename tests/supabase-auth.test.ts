import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiResponseError, TransportError } from "../src/api";
import { exchangeSupabaseAccessToken } from "../src/supabaseAuth";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Supabase Cradle exchange", () => {
  it("posts the provider token with same-origin credentials and returns the account sync result", async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      ok: true, data: { profileCreated: true, accountId: "account-1", householdCount: 0 }, requestId: "exchange-1"
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    vi.stubGlobal("fetch", fetch);
    await expect(exchangeSupabaseAccessToken("token-value")).resolves.toEqual({ profileCreated: true, accountId: "account-1", householdCount: 0 });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith("/api/auth/supabase/exchange", expect.objectContaining({ method: "POST", credentials: "same-origin" }));
  });

  it("surfaces a typed API error instead of treating a server response as transport failure", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      ok: false, error: { code: "AUTH_SCHEMA_UNAVAILABLE", message: "Apply the latest migration." }, requestId: "exchange-2"
    }), { status: 503, headers: { "Content-Type": "application/json" } }))));
    await expect(exchangeSupabaseAccessToken("token-value")).rejects.toBeInstanceOf(ApiResponseError);
    await expect(exchangeSupabaseAccessToken("token-value")).rejects.toMatchObject({ code: "AUTH_SCHEMA_UNAVAILABLE", requestId: "exchange-2", status: 503 });
  });

  it("treats a rejected exchange request as a transport failure", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Network unavailable"))));

    await expect(exchangeSupabaseAccessToken("token-value")).rejects.toBeInstanceOf(TransportError);
    await expect(exchangeSupabaseAccessToken("token-value")).rejects.toMatchObject({ message: "Cradle couldn’t connect" });
  });

  it.each([
    ["invalid JSON", "not json"],
    ["an incomplete success envelope", JSON.stringify({ ok: true, data: { accountId: "account-1" }, requestId: "exchange-3" })],
  ])("rejects %s as an invalid server response", async (_description, body) => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Request-ID": "header-request-id" },
    }))));

    await expect(exchangeSupabaseAccessToken("token-value")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 200,
      message: "Cradle received an invalid server response.",
    });
  });
});
