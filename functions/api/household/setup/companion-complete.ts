import { authenticate } from "../../auth";
import { ApiError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../http";
import { requireStep } from "../../setup";
import type { CradleEnv } from "../../types";
type Context = { request: Request; env: CradleEnv };
export async function onRequestPost({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    await parseJsonBody(request); await requireStep(db, identity, "companion");
    const companion = await db.prepare("SELECT id FROM companions WHERE household_id = ? AND is_active = 1").bind(identity.householdId).first();
    if (!companion) throw new ApiError(409, "COMPANION_REQUIRED", "Save a Companion before continuing.");
    await db.prepare("UPDATE households SET setup_step = 'review', updated_at = ? WHERE id = ? AND setup_step = 'companion'")
      .bind(new Date().toISOString(), identity.householdId).run();
    return success({ step: "review" }, requestId);
  });
}
export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
