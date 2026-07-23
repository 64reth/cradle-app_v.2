import type { ApiEnvelope, CradleEnv, JsonRecord } from "./types";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, string>
  ) {
    super(message);
  }
}

export function requestId(request: Request): string {
  return request.headers.get("CF-Ray") || crypto.randomUUID();
}

export function json<T>(body: ApiEnvelope<T>, init: ResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: { ...jsonHeaders, ...(init.headers || {}) }
  });
}

export function success<T>(data: T, id: string, init: ResponseInit = {}): Response {
  return json({ ok: true, data, requestId: id }, {
    ...init, headers: { ...(init.headers || {}), "X-Request-ID": id }
  });
}

export function failure(error: ApiError, id: string): Response {
  return json(
    {
      ok: false,
      error: { code: error.code, message: error.message, details: error.details },
      requestId: id
    },
    { status: error.status, headers: { "X-Request-ID": id } }
  );
}

export async function parseJsonBody(request: Request): Promise<JsonRecord> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw validationError("Expected an application/json request body.", { contentType: "Use application/json" });
  }

  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw validationError("Expected a JSON object request body.", { body: "Use a JSON object" });
    }
    return value as JsonRecord;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw validationError("Malformed JSON request body.", { body: "Check the JSON syntax" });
  }
}

export function validationError(message = "Please check the submitted fields.", details?: Record<string, string>): ApiError {
  return new ApiError(400, "VALIDATION_ERROR", message, details);
}

export function notFoundError(message = "The requested resource was not found."): ApiError {
  return new ApiError(404, "NOT_FOUND", message);
}

export function conflictError(message = "The resource changed before this request completed."): ApiError {
  return new ApiError(409, "CONFLICT", message);
}

export function authorizationError(message = "You are not allowed to perform this action."): ApiError {
  return new ApiError(403, "AUTHORIZATION_ERROR", message);
}

export function methodNotAllowed(allowed: string): ApiError {
  return new ApiError(405, "METHOD_NOT_ALLOWED", `Use ${allowed} for this endpoint.`);
}

export function serverError(): ApiError {
  return new ApiError(500, "SERVER_ERROR", "Cradle could not complete the request.");
}

export async function handleApiRequest(
  request: Request,
  handler: (id: string) => Response | Promise<Response>
): Promise<Response> {
  const id = requestId(request);
  try {
    return await handler(id);
  } catch (error) {
    if (error instanceof ApiError) return failure(error, id);
    console.error("Unhandled API error", { requestId: id, error });
    return failure(serverError(), id);
  }
}

export function requireD1(env: CradleEnv): D1Database {
  if (!env.DB) throw new ApiError(503, "DB_UNAVAILABLE", "Database binding is unavailable.");
  return env.DB;
}
