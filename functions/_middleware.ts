import { clearCookie } from "./api/auth";
import type { CradleEnv } from "./api/types";

const runtimeHeader = "X-Cradle-Dev-Runtime-ID";
let developmentRuntimeId: string | undefined;

type Context = { request: Request; env: CradleEnv; next: () => Promise<Response> };

/**
 * Development-only runtime identity lets an already-open browser document
 * recognise that its Pages worker was replaced. It deliberately does not
 * expose build/runtime details in production responses.
 */
export async function onRequest(context: Context): Promise<Response> {
  const response = await context.next();
  const url = new URL(context.request.url);
  const apiResponse = url.pathname.startsWith("/api/") || url.pathname === "/health";
  if (context.env.APP_ENV !== "development" || !apiResponse) return response;

  const headers = new Headers(response.headers);
  developmentRuntimeId ||= crypto.randomUUID();
  headers.set(runtimeHeader, developmentRuntimeId);
  if (url.pathname === "/api/auth/session" && response.status === 401) {
    headers.set("Set-Cookie", clearCookie(context.env));
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
