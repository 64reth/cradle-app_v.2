import { authenticate, textField } from "../../auth";
import { ApiError, conflictError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../http";
import { optionalText, requireHouseholdManager, requireStep } from "../../setup";
import type { CradleEnv } from "../../types";
type Context = { request: Request; env: CradleEnv; params: { roomId: string } };
async function permit(db: D1Database, identity: Awaited<ReturnType<typeof authenticate>>) {
  if (identity.setupStatus === "incomplete") await requireStep(db, identity, "rooms");
  else requireHouseholdManager(identity);
}
export async function onRequestPatch({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); await permit(db, identity);
    const body = await parseJsonBody(request); const name = textField(body, "name", 1, 80);
    const description = optionalText(body, "description", 500);
    try {
      const result = await db.prepare("UPDATE rooms SET name = ?, description = ?, updated_at = ? WHERE household_id = ? AND id = ? AND is_active = 1")
        .bind(name, description, new Date().toISOString(), identity.householdId, params.roomId).run();
      if (!result.meta.changes) throw new ApiError(404, "NOT_FOUND", "Room not found.");
    } catch (error) {
      if (String(error).includes("UNIQUE constraint")) throw conflictError("An active Room with that name already exists.");
      throw error;
    }
    return success({ updated: true }, requestId);
  });
}
export async function onRequestDelete({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); await permit(db, identity);
    await parseJsonBody(request);
    const result = await db.prepare("UPDATE rooms SET is_active = 0, updated_at = ? WHERE household_id = ? AND id = ? AND is_active = 1")
      .bind(new Date().toISOString(), identity.householdId, params.roomId).run();
    if (!result.meta.changes) throw new ApiError(404, "NOT_FOUND", "Room not found.");
    return success({ deactivated: true }, requestId);
  });
}
export async function onRequest(context: Context) {
  if (context.request.method === "PATCH") return onRequestPatch(context);
  if (context.request.method === "DELETE") return onRequestDelete(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("PATCH or DELETE"); });
}
