import { authenticate } from "../../auth";
import { ApiError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../http";
import { requireStep } from "../../setup";
import type { CradleEnv } from "../../types";
type Context = { request: Request; env: CradleEnv };
export async function onRequestPost({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    await parseJsonBody(request); await requireStep(db, identity, "rooms");
    const room = await db.prepare("SELECT id FROM rooms WHERE household_id = ? AND is_active = 1 LIMIT 1").bind(identity.householdId).first();
    if (!room) throw new ApiError(409, "ROOM_REQUIRED", "Add at least one Room before continuing.");
    await db.prepare("UPDATE households SET setup_step = 'pets', updated_at = ? WHERE id = ? AND setup_step = 'rooms'")
      .bind(new Date().toISOString(), identity.householdId).run();
    return success({ step: "pets" }, requestId);
  });
}
export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
