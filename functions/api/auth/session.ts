import { authenticate } from "../auth";
import { handleApiRequest, methodNotAllowed, requireD1, success } from "../http";
import type { CradleEnv } from "../types";
type Context = { request: Request; env: CradleEnv };

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const identity = await authenticate(request, requireD1(env));
    return success({ household: { name: identity.householdName, reference: identity.householdReference },
      member: { displayName: identity.displayName, reference: identity.profileReference, role: identity.role },
      expiresAt: identity.expiresAt, setup: { status: identity.setupStatus, step: identity.setupStep } }, requestId);
  });
}
export async function onRequest(context: Context): Promise<Response> {
  if (context.request.method === "GET") return onRequestGet(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET"); });
}
