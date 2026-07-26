import { authenticate, identityAccessLevel } from "../../auth";
import { authorizationError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, notFoundError } from "../../http";
import type { CradleEnv } from "../../types";
type Context = { request: Request; env: CradleEnv; params: { traditionId: string } };
export async function onRequestPatch({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    if (identityAccessLevel(identity) !== "household_admin") throw authorizationError();
    const body = await parseJsonBody(request); const existing = await db.prepare("SELECT id FROM together_traditions WHERE household_id = ? AND id = ?")
      .bind(identity.householdId, params.traditionId).first(); if (!existing) throw notFoundError("That Tradition is no longer available.");
    await db.prepare(`UPDATE together_traditions SET title = COALESCE(?, title), description = COALESCE(?, description),
      recurrence = COALESCE(?, recurrence), is_active = COALESCE(?, is_active), updated_at = ? WHERE household_id = ? AND id = ?`)
      .bind(typeof body.title === "string" ? body.title.trim() : null, typeof body.description === "string" ? body.description.trim() : null,
        typeof body.recurrence === "string" ? body.recurrence.trim() : null, typeof body.isActive === "boolean" ? (body.isActive ? 1 : 0) : null,
        new Date().toISOString(), identity.householdId, params.traditionId).run();
    return success({ traditions: (await db.prepare("SELECT id, title, description, recurrence, is_active AS isActive FROM together_traditions WHERE household_id = ? ORDER BY title").bind(identity.householdId).all()).results }, requestId);
  });
}
export async function onRequest(context: Context) {
  if (context.request.method === "PATCH") return onRequestPatch(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("PATCH"); });
}
