import { authenticate, identityAccessLevel } from "../../auth";
import { canManageEvent, eventMembers, householdEvent } from "../../coordination";
import { ApiError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../http";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv; params: { eventId: string } };

export async function onRequestGet({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const event = await householdEvent(db, identity.householdId, params.eventId);
    if (event.visibility === "leadership" && identityAccessLevel(identity) !== "household_admin") {
      throw new ApiError(404, "NOT_FOUND", "We couldn’t find that Schedule entry.");
    }
    return success({ event: { ...event, members: await eventMembers(db, identity.householdId, [event.id]) },
      canManage: canManageEvent(identity, event) }, requestId);
  });
}

export async function onRequestDelete({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); await parseJsonBody(request);
    const event = await householdEvent(db, identity.householdId, params.eventId);
    if (!canManageEvent(identity, event)) {
      throw new ApiError(403, "AUTHORIZATION_ERROR", "You cannot cancel this Schedule entry.");
    }
    const now = new Date().toISOString();
    const result = await db.prepare(`UPDATE household_events SET status = 'cancelled',
      cancelled_at = ?, updated_at = ? WHERE household_id = ? AND id = ? AND status = 'active'`)
      .bind(now, now, identity.householdId, event.id).run();
    if (!result.meta.changes) throw new ApiError(404, "NOT_FOUND", "We couldn’t find that active Schedule entry.");
    return success({ cancelled: true, destination: "/calendar" }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "DELETE") return onRequestDelete(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET or DELETE"); });
}
