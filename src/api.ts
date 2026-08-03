import { trackAlphaError, trackAlphaEvent, trackAlphaTiming } from "./alphaDiagnostics";

export type Envelope<T> = { ok: true; data: T; requestId?: string } |
  { ok: false; error: { code?: string; message: string; details?: Record<string, string> }; requestId?: string };

export const developmentRuntimeHeader = "X-Cradle-Dev-Runtime-ID";
export const developmentRuntimeStorageKey = "cradle-development-runtime-id";
export const developmentAuthenticatedStorageKey = "cradle-development-authenticated";
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export type ApiRequestInit = RequestInit & { timeoutMs?: number; retryReads?: boolean };

export class TransportError extends Error {}
export class RequestTimeoutError extends Error {
  readonly uncertain = true;
  constructor(public timeoutMs: number) { super("This is taking longer than expected"); }
}
export class RequestCancelledError extends Error {}
export class RuntimeChangedError extends Error {}
export class ApiResponseError extends Error {
  constructor(
    message: string,
    public requestId?: string,
    public code?: string,
    public status?: number,
    public details?: Record<string, string>
  ) { super(message); }
}

export type FailureKind = "validation" | "permission" | "authentication" | "conflict" |
  "network" | "timeout" | "server" | "configuration" | "cancelled" | "unknown";

export function classifyFailure(reason: unknown): FailureKind {
  if (reason instanceof RequestTimeoutError) return "timeout";
  if (reason instanceof RequestCancelledError) return "cancelled";
  if (reason instanceof TransportError) return "network";
  if (!(reason instanceof ApiResponseError)) return "unknown";
  if (reason.status === 400 || reason.status === 422) return "validation";
  if (reason.status === 401) return "authentication";
  if (reason.status === 403) return "permission";
  if (reason.status === 409) return "conflict";
  if (reason.status === 503 || reason.code?.includes("SCHEMA") || reason.code?.includes("CONFIG")) return "configuration";
  return reason.status && reason.status >= 500 ? "server" : "unknown";
}

function diagnosticAction(path: string): string {
  return path.split("?")[0].replace(/\/[A-Za-z0-9_-]{16,}/g, "/:id").slice(0, 80);
}

async function fetchWithTimeout(path: string, init: ApiRequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = init.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const externalSignal = init.signal;
  const cancel = () => controller.abort();
  externalSignal?.addEventListener("abort", cancel, { once: true });
  try {
    return await fetch(path, { ...init, timeoutMs: undefined, retryReads: undefined,
      credentials: "same-origin", signal: controller.signal } as RequestInit);
  } catch (error) {
    if (timedOut) throw new RequestTimeoutError(timeoutMs);
    if (externalSignal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new RequestCancelledError("Request cancelled");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", cancel);
  }
}

export async function envelope<T>(path: string, init: ApiRequestInit = {}): Promise<{ response: Response; body: Envelope<T> }> {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  let response: Response;
  try { response = await fetchWithTimeout(path, init); }
  catch (error) {
    if (error instanceof RequestTimeoutError) {
      trackAlphaEvent({ name: "action_failed", action: diagnosticAction(path), errorCode: "REQUEST_TIMEOUT",
        durationMs: (typeof performance !== "undefined" ? performance.now() : Date.now()) - started });
      throw error;
    }
    if (error instanceof RequestCancelledError) throw error;
    trackAlphaError(new TransportError("Cradle couldn’t connect"), { action: diagnosticAction(path) });
    throw new TransportError("Cradle couldn’t connect");
  }
  const runtimeId = response.headers.get(developmentRuntimeHeader);
  if (runtimeId && typeof window !== "undefined") {
    const previous = window.sessionStorage.getItem(developmentRuntimeStorageKey);
    window.sessionStorage.setItem(developmentRuntimeStorageKey, runtimeId);
    if (previous && previous !== runtimeId) {
      trackAlphaEvent({ name: "runtime_changed", action: "api_response" });
      window.dispatchEvent(new Event("cradle-development-runtime-changed"));
      throw new RuntimeChangedError("Cradle has restarted during development.");
    }
  }
  try {
    const result = { response, body: await response.json() as Envelope<T> };
    trackAlphaTiming({ action: diagnosticAction(path), durationMs: (typeof performance !== "undefined" ? performance.now() : Date.now()) - started });
    return result;
  }
  catch {
    const error = new ApiResponseError("Cradle received an invalid server response.", response.headers.get("X-Request-ID") || undefined, "INVALID_RESPONSE", response.status);
    trackAlphaError(error, { action: diagnosticAction(path) });
    throw error;
  }
}

export async function api<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  let result: { response: Response; body: Envelope<T> };
  try {
    result = await envelope<T>(path, init);
  } catch (error) {
    const retryableRead = method === "GET" && init.retryReads !== false &&
      (error instanceof TransportError || error instanceof RequestTimeoutError) && !init.signal?.aborted;
    if (!retryableRead) throw error;
    result = await envelope<T>(path, { ...init, retryReads: false });
  }
  const { response, body } = result;
  if (!body.ok) {
    const error = new ApiResponseError(
      body.error.message, body.requestId, body.error.code, response.status, body.error.details
    );
    trackAlphaError(error, { action: diagnosticAction(path) });
    throw error;
  }
  return body.data;
}

export function failureMessage(reason: unknown): string {
  if (reason instanceof RequestTimeoutError) return reason.message;
  if (reason instanceof RequestCancelledError) return "The request was cancelled.";
  if (reason instanceof TransportError) return reason.message;
  if (reason instanceof ApiResponseError) return `${reason.message}${reason.requestId ? ` Request ID: ${reason.requestId}` : ""}`;
  return "Cradle could not complete the request.";
}

export const jsonInit = (
  method: string, body: object = {}, options: { idempotencyKey?: string; signal?: AbortSignal } = {}
): ApiRequestInit => ({
  method, headers: { "Content-Type": "application/json",
    ...(options.idempotencyKey ? { "X-Idempotency-Key": options.idempotencyKey } : {}) },
  body: JSON.stringify(body), signal: options.signal
});
