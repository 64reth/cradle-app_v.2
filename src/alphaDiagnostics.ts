import {
  parseAlphaDiagnosticEvent,
  parseAlphaFeedback,
  type AlphaDiagnosticEvent,
  type AlphaFeedback,
  type AlphaScreen
} from "../shared/alpha-diagnostics";

const enabled = import.meta.env.VITE_ALPHA_DIAGNOSTICS === "true";
const runtimeStorageKey = "cradle-development-runtime-id";

export class AlphaFeedbackError extends Error {
  constructor(message: string, public requestId?: string) { super(message); }
}

function deviceClass(): AlphaDiagnosticEvent["deviceClass"] {
  if (typeof window === "undefined") return undefined;
  if (window.innerWidth < 600) return "phone";
  if (window.innerWidth < 1000) return "tablet";
  return "desktop";
}

function runtimeId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.sessionStorage.getItem(runtimeStorageKey) || undefined;
}

function sendEvent(event: AlphaDiagnosticEvent): void {
  if (!enabled || typeof window === "undefined") return;
  const safe = parseAlphaDiagnosticEvent(event);
  if (!safe) return;
  void fetch("/api/alpha/events", {
    method: "POST", credentials: "same-origin", keepalive: true,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(safe)
  }).catch(() => undefined);
}

export function trackAlphaEvent(event: AlphaDiagnosticEvent): void {
  sendEvent({ ...event, runtimeId: event.runtimeId || runtimeId(), deviceClass: event.deviceClass || deviceClass() });
}

export function trackAlphaError(error: unknown, context: { screen?: AlphaScreen; action?: string } = {}): void {
  const candidate = error as { name?: string; status?: number; code?: string; requestId?: string } | null;
  const isTransport = candidate?.name === "TransportError";
  const isApi = candidate?.name === "ApiResponseError";
  trackAlphaEvent({
    name: isTransport ? "transport_error" : "api_error",
    screen: context.screen,
    action: context.action,
    statusCode: isApi ? candidate?.status : undefined,
    errorCode: isApi ? candidate?.code : undefined,
    requestId: isApi ? candidate?.requestId : undefined
  });
}

export function trackAlphaTiming(timing: { screen?: AlphaScreen; action?: string; durationMs: number }): void {
  trackAlphaEvent({ name: "api_timing", ...timing });
}

export async function submitAlphaFeedback(feedback: AlphaFeedback): Promise<{ requestId?: string }> {
  const safeFeedback = parseAlphaFeedback(feedback);
  if (!safeFeedback) throw new AlphaFeedbackError("Please choose a feedback type and check the optional details.");
  const runtime = typeof window !== "undefined" ? window.sessionStorage.getItem(runtimeStorageKey) : null;
  const response = await fetch("/api/alpha/feedback", {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", ...(runtime ? { "X-Cradle-Dev-Runtime-ID": runtime } : {}) },
    body: JSON.stringify(safeFeedback)
  }).catch(() => { throw new AlphaFeedbackError("Cradle couldn’t send that feedback right now."); });
  let body: { ok?: boolean; requestId?: string; error?: { message?: string } };
  try { body = await response.json() as typeof body; }
  catch { throw new AlphaFeedbackError("Cradle received an invalid feedback response.", response.headers.get("X-Request-ID") || undefined); }
  if (!response.ok || !body.ok) throw new AlphaFeedbackError(body.error?.message || "Cradle couldn’t send that feedback right now.", body.requestId);
  return { requestId: body.requestId };
}
