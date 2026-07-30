import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiResponseError, TransportError } from "../src/api";
import {
  completeSupabaseOAuth, exchangeSupabaseAccessToken, hasSupabaseOAuthCallback,
  startSupabaseOAuth,
} from "../src/supabaseAuth";

const supabaseAuth = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ auth: supabaseAuth })),
}));

afterEach(() => {
  window.history.replaceState({}, "", "/");
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Supabase Cradle exchange", () => {
  it("recognises successful and failed provider callbacks", () => {
    expect(hasSupabaseOAuthCallback("https://cradle.test/?code=provider-code")).toBe(true);
    expect(hasSupabaseOAuthCallback("https://cradle.test/?error=invalid_request&error_code=bad_oauth_state")).toBe(true);
    expect(hasSupabaseOAuthCallback("https://cradle.test/")).toBe(false);
  });

  it("surfaces bad OAuth state instead of leaving the callback loading", async () => {
    window.history.replaceState({}, "", "/?error=invalid_request&error_code=bad_oauth_state");

    await expect(completeSupabaseOAuth()).rejects.toThrow("Close other Cradle sign-in tabs and try once more.");
    expect(supabaseAuth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("lets the Supabase client own OAuth initiation without supplying custom state", async () => {
    supabaseAuth.signInWithOAuth.mockResolvedValueOnce({ data: { provider: "google", url: "https://provider.test" }, error: null });

    await startSupabaseOAuth("google");

    expect(supabaseAuth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "http://localhost:3000/" },
    });
    expect(JSON.stringify(supabaseAuth.signInWithOAuth.mock.calls[0])).not.toContain("state");
  });

  it("uses the same Supabase client to exchange the callback code before the Cradle exchange", async () => {
    window.history.replaceState({}, "", "/?code=provider-code");
    supabaseAuth.exchangeCodeForSession.mockResolvedValueOnce({
      data: { session: { access_token: "provider-access-token" } },
      error: null,
    });
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      ok: true, data: { profileCreated: true, accountId: "account-1", householdCount: 0 }, requestId: "exchange-1"
    }), { status: 200, headers: { "Content-Type": "application/json" } }))));

    await expect(completeSupabaseOAuth()).resolves.toMatchObject({ accountId: "account-1", householdCount: 0 });
    expect(supabaseAuth.exchangeCodeForSession).toHaveBeenCalledWith("provider-code");
  });

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
