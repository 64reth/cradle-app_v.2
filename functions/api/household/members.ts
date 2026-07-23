import { authenticate } from "../auth";
import { handleApiRequest, methodNotAllowed, requireD1, success } from "../http";
import type { CradleEnv } from "../types";
type Context = { request: Request; env: CradleEnv };
type Member = { displayName: string; profileReference: string; role: string };

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env);
    const identity = await authenticate(request, db);
    if (identity.role === "child") {
      return success({ members: [{ displayName: identity.displayName, profileReference: identity.profileReference, role: identity.role }] }, requestId);
    }
    const result = await db.prepare(`
      SELECT display_name AS displayName, profile_reference AS profileReference, role
      FROM members WHERE household_id = ? AND is_active = 1 ORDER BY created_at
    `).bind(identity.householdId).all<Member>();
    return success({ members: result.results }, requestId);
  });
}
export async function onRequest(context: Context): Promise<Response> {
  if (context.request.method === "GET") return onRequestGet(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET"); });
}
