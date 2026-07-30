import { clearCookie } from "./api/auth";
import type { CradleEnv } from "./api/types";

const runtimeHeader = "X-Cradle-Dev-Runtime-ID";
const versionHeader = "X-Cradle-App-Version";
let developmentRuntimeId: string | undefined;

type Context = { request: Request; env: CradleEnv; next: () => Promise<Response> };

/**
 * Development-only runtime identity lets an already-open browser document
 * recognise that its local Worker was replaced. It deliberately does not
 * expose build/runtime details in production responses.
 */
export async function onRequest(context: Context): Promise<Response> {
  const response = await context.next();
  const url = new URL(context.request.url);
  const apiResponse = url.pathname.startsWith("/api/") || url.pathname === "/health";
  if (!apiResponse) return response;

  // API handlers create their own Responses, so their headers are mutable.
  // Mutating that response keeps Set-Cookie as a first-class response header;
  // rebuilding the response here risks folding or dropping it at the Worker
  // adapter boundary.
  response.headers.set(versionHeader, context.env.APP_VERSION || "0.1.0");
  if (context.env.APP_ENV === "development") {
    developmentRuntimeId ||= crypto.randomUUID();
    response.headers.set(runtimeHeader, developmentRuntimeId);
  }
  if (context.env.APP_ENV === "development" && url.pathname === "/api/auth/session" && response.status === 401) {
    response.headers.set("Set-Cookie", clearCookie(context.env));
  }
  return response;
}
