import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ApiResponseError, TransportError, type Envelope } from "./api";
import { availableAuthProviders, requireAvailableAuthProvider, type OAuthProviderId } from "./authProviders";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const redirectUrl = import.meta.env.VITE_SUPABASE_REDIRECT_URL as string | undefined;
const storageKey = "cradle-supabase-auth";
const pendingInviteKey = "cradle-supabase-pending-invite";
const providerErrorKey = "cradle-supabase-provider-error";
let client: SupabaseClient | undefined;

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

export function rememberSupabaseInvite(reference: string): void {
  window.sessionStorage.setItem(pendingInviteKey, reference);
}

export function takeSupabaseInvite(): string | null {
  const reference = window.sessionStorage.getItem(pendingInviteKey);
  if (reference) window.sessionStorage.removeItem(pendingInviteKey);
  return reference;
}

export function rememberAuthProviderError(message: string): void {
  window.sessionStorage.setItem(providerErrorKey, message.slice(0, 240));
}

export function takeAuthProviderError(): string | null {
  const message = window.sessionStorage.getItem(providerErrorKey);
  if (message) window.sessionStorage.removeItem(providerErrorKey);
  return message;
}

function configured(): { url: string; key: string } {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Sign-in is not configured yet.");
  return { url: supabaseUrl.replace(/\/$/, ""), key: supabaseAnonKey };
}

function supabase(): SupabaseClient {
  if (client) return client;
  const { url, key } = configured();
  client = createClient(url, key, {
    auth: {
      storage: window.sessionStorage,
      storageKey,
      flowType: "pkce",
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: false,
    },
  });
  return client;
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

export async function startSupabaseOAuth(provider: OAuthProviderId,
  navigate: (url: string) => void = (url) => window.location.assign(url)): Promise<void> {
  requireAvailableAuthProvider(provider);
  const { data, error } = await supabase().auth.signInWithOAuth({
    provider,
    options: { redirectTo: safeRedirect(), skipBrowserRedirect: true },
  });
  if (error || !data.url) throw new Error(`${provider === "apple" ? "Apple" : "Google"} Sign In is not available right now. Please choose another sign-in option.`);
  navigate(data.url);
}

export async function requestSupabaseOtp(email: string): Promise<void> {
  requireAvailableAuthProvider("email");
  const { error } = await supabase().auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true },
  });
  if (error) throw new Error("We couldn’t send that code. Check the email address and try again.");
}

export async function verifySupabaseOtp(email: string, token: string): Promise<void> {
  requireAvailableAuthProvider("email");
  const { data, error } = await supabase().auth.verifyOtp({
    type: "email",
    email: email.trim(),
    token: token.trim(),
  });
  if (error || !data.session?.access_token) throw new Error("That code could not be verified. Please try again.");
  await exchangeSupabaseAccessToken(data.session.access_token);
}

export function hasSupabaseOAuthCallback(location = window.location.href): boolean {
  const params = new URL(location).searchParams;
  return params.has("code") || params.has("error") || params.has("error_code");
}

function callbackError(params: URLSearchParams): Error | null {
  const code = params.get("error_code") || params.get("error");
  if (!code) return null;
  if (code === "bad_oauth_state") {
    return new Error("That Google sign-in could not be verified. Close other Cradle sign-in tabs and try once more.");
  }
  const description = params.get("error_description") || "";
  if (/unsupported provider|provider is not enabled|provider.*disabled/i.test(`${code} ${description}`)) {
    const alternatives = availableAuthProviders.map(({ label }) => label).join(" or ");
    return new Error(`That sign-in option is not available yet.${alternatives ? ` Continue with ${alternatives}.` : " Please try again later."}`);
  }
  return new Error(description || "That sign-in could not be completed. Please try again.");
}

export async function completeSupabaseOAuth(): Promise<SupabaseExchangeResult | null> {
  const params = new URL(window.location.href).searchParams;
  const providerError = callbackError(params);
  if (providerError) throw providerError;
  const code = params.get("code");
  if (!code) return null;
  const { data, error } = await supabase().auth.exchangeCodeForSession(code);
  if (error || !data.session?.access_token) throw new Error("That sign-in could not be completed. Please try again.");
  const exchange = await exchangeSupabaseAccessToken(data.session.access_token);
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
