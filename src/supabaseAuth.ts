import { ApiResponseError, TransportError, type Envelope } from "./api";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const redirectUrl = import.meta.env.VITE_SUPABASE_REDIRECT_URL as string | undefined;
const verifierKey = "cradle-supabase-pkce-verifier";
const stateKey = "cradle-supabase-oauth-state";

export type SupabaseExchangeResult = {
  profileCreated: boolean;
  accountId: string;
  householdCount: number;
};

function invalidExchangeResponse(response: Response, requestId?: string): ApiResponseError {
  return new ApiResponseError("Cradle received an invalid server response.", requestId || response.headers.get("X-Request-ID") || undefined, "INVALID_RESPONSE", response.status);
}

function isExchangeResult(value: unknown): value is SupabaseExchangeResult {
  return Boolean(value) && typeof value === "object"
    && typeof (value as SupabaseExchangeResult).profileCreated === "boolean"
    && typeof (value as SupabaseExchangeResult).accountId === "string"
    && typeof (value as SupabaseExchangeResult).householdCount === "number";
}

function parseExchangeResponse(response: Response, candidate: unknown): Envelope<SupabaseExchangeResult> {
  if (!candidate || typeof candidate !== "object" || !("ok" in candidate)) throw invalidExchangeResponse(response);
  const envelope = candidate as Envelope<unknown>;
  if (envelope.ok === true) {
    if (!isExchangeResult(envelope.data)) throw invalidExchangeResponse(response, envelope.requestId);
    return envelope as Envelope<SupabaseExchangeResult>;
  }
  if (envelope.ok === false && envelope.error && typeof envelope.error.message === "string") {
    return envelope as Envelope<SupabaseExchangeResult>;
  }
  throw invalidExchangeResponse(response, envelope.requestId);
}

export const supabaseAuthConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function configured(): { url: string; key: string } {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Sign-in is not configured yet.");
  return { url: supabaseUrl.replace(/\/$/, ""), key: supabaseAnonKey };
}

function bytes(size: number): Uint8Array {
  const value = new Uint8Array(size); crypto.getRandomValues(value); return value;
}

function base64Url(value: ArrayBuffer | Uint8Array): string {
  const bytesValue = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = ""; bytesValue.forEach((item) => { binary += String.fromCharCode(item); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function challenge(verifier: string): Promise<string> {
  return base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
}

function safeRedirect(): string {
  const fallback = window.location.origin + "/";
  if (!redirectUrl) return fallback;
  try {
    const target = new URL(redirectUrl, window.location.origin);
    if (target.origin !== window.location.origin || target.protocol !== window.location.protocol) return fallback;
    return target.toString();
  } catch { return fallback; }
}

export async function startSupabaseOAuth(provider: "google" | "apple"): Promise<void> {
  const { url } = configured(); const verifier = base64Url(bytes(32)); const state = base64Url(bytes(24));
  window.sessionStorage.setItem(verifierKey, verifier); window.sessionStorage.setItem(stateKey, state);
  const params = new URLSearchParams({ provider, redirect_to: safeRedirect(), code_challenge: await challenge(verifier), code_challenge_method: "S256", state });
  window.location.assign(`${url}/auth/v1/authorize?${params.toString()}`);
}

export async function requestSupabaseOtp(email: string): Promise<void> {
  const { url, key } = configured();
  const response = await fetch(`${url}/auth/v1/otp`, { method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), create_user: true }) });
  if (!response.ok) throw new Error("We couldn’t send that code. Check the email address and try again.");
}

async function providerRequest(path: string, body: object): Promise<{ access_token?: string }> {
  const { url, key } = configured();
  let response: Response;
  try {
    response = await fetch(`${url}${path}`, { method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new TransportError("Cradle couldn’t connect");
  }
  if (!response.ok) throw new Error("That code could not be verified. Please try again.");
  return await response.json() as { access_token?: string };
}

export async function verifySupabaseOtp(email: string, token: string): Promise<void> {
  const result = await providerRequest("/auth/v1/verify", { type: "email", email: email.trim(), token: token.trim() });
  if (!result.access_token) throw new Error("That code could not be verified. Please try again.");
  await exchangeSupabaseAccessToken(result.access_token);
}

export async function completeSupabaseOAuth(): Promise<SupabaseExchangeResult | null> {
  const code = new URL(window.location.href).searchParams.get("code");
  if (!code) return null;
  const verifier = window.sessionStorage.getItem(verifierKey); const expectedState = window.sessionStorage.getItem(stateKey);
  const state = new URL(window.location.href).searchParams.get("state");
  if (!verifier || !expectedState || state !== expectedState) throw new Error("That sign-in link is no longer valid. Please try again.");
  const result = await providerRequest("/auth/v1/token?grant_type=pkce", { auth_code: code, code_verifier: verifier });
  if (!result.access_token) throw new Error("That sign-in could not be completed. Please try again.");
  const exchange = await exchangeSupabaseAccessToken(result.access_token);
  window.sessionStorage.removeItem(verifierKey); window.sessionStorage.removeItem(stateKey);
  return exchange;
}

export async function exchangeSupabaseAccessToken(accessToken: string): Promise<SupabaseExchangeResult> {
  let response: Response;
  try {
    response = await fetch("/api/auth/supabase/exchange", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken })
    });
  } catch {
    throw new TransportError("Cradle couldn’t connect");
  }
  let payload: Envelope<SupabaseExchangeResult>;
  try {
    payload = parseExchangeResponse(response, await response.json() as unknown);
  }
  catch (error) {
    if (error instanceof ApiResponseError) throw error;
    throw invalidExchangeResponse(response);
  }
  if (!payload.ok) {
    const error = payload.error;
    throw new ApiResponseError(error.message, payload.requestId, error.code, response.status);
  }
  return payload.data;
}
