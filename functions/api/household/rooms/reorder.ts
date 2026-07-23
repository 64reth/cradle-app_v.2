import { authenticate } from "../../auth";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../../http";
import { requireStep } from "../../setup";
import type { CradleEnv } from "../../types";
type Context = { request: Request; env: CradleEnv };
export async function onRequestPost({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); await requireStep(db, identity, "rooms");
    const body = await parseJsonBody(request);
    if (!Array.isArray(body.roomIds) || !body.roomIds.length || body.roomIds.some((id) => typeof id !== "string")) {
      throw validationError("Provide the active Room IDs in order.");
    }
    const current = await db.prepare("SELECT id FROM rooms WHERE household_id = ? AND is_active = 1").bind(identity.householdId).all<{ id: string }>();
    const requested = body.roomIds as string[];
    if (current.results.length !== requested.length || current.results.some(({ id }) => !requested.includes(id)) || new Set(requested).size !== requested.length) {
      throw validationError("The order must contain every active Room in this household exactly once.");
    }
    const now = new Date().toISOString();
    await db.batch(requested.map((id, index) => db.prepare("UPDATE rooms SET display_order = ?, updated_at = ? WHERE household_id = ? AND id = ? AND is_active = 1")
      .bind(index, now, identity.householdId, id)));
    return success({ reordered: true }, requestId);
  });
}
export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
