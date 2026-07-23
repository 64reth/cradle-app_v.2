export type Envelope<T> = { ok: true; data: T; requestId?: string } |
  { ok: false; error: { code?: string; message: string }; requestId?: string };

export const developmentRuntimeHeader = "X-Cradle-Dev-Runtime-ID";
export const developmentRuntimeStorageKey = "cradle-development-runtime-id";
export const developmentAuthenticatedStorageKey = "cradle-development-authenticated";

export class TransportError extends Error {}
export class RuntimeChangedError extends Error {}
export class ApiResponseError extends Error {
  constructor(message: string, public requestId?: string, public code?: string, public status?: number) { super(message); }
}

export async function envelope<T>(path: string, init?: RequestInit): Promise<{ response: Response; body: Envelope<T> }> {
  let response: Response;
  try { response = await fetch(path, { credentials: "same-origin", ...init }); }
  catch { throw new TransportError("Cradle couldn’t connect"); }
  const runtimeId = response.headers.get(developmentRuntimeHeader);
  if (runtimeId && typeof window !== "undefined") {
    const previous = window.sessionStorage.getItem(developmentRuntimeStorageKey);
    window.sessionStorage.setItem(developmentRuntimeStorageKey, runtimeId);
    if (previous && previous !== runtimeId) {
      window.dispatchEvent(new Event("cradle-development-runtime-changed"));
      throw new RuntimeChangedError("Cradle has restarted during development.");
    }
  }
  try { return { response, body: await response.json() as Envelope<T> }; }
  catch { throw new ApiResponseError("Cradle received an invalid server response.", response.headers.get("X-Request-ID") || undefined, "INVALID_RESPONSE", response.status); }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const { response, body } = await envelope<T>(path, init);
  if (!body.ok) throw new ApiResponseError(body.error.message, body.requestId, body.error.code, response.status);
  return body.data;
}

export function failureMessage(reason: unknown): string {
  if (reason instanceof TransportError) return reason.message;
  if (reason instanceof ApiResponseError) return `${reason.message}${reason.requestId ? ` Request ID: ${reason.requestId}` : ""}`;
  return "Cradle could not complete the request.";
}

export const jsonInit = (method: string, body: object = {}): RequestInit => ({
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
});
