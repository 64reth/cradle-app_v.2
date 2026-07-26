import { authenticate } from "../../auth";
import { ApiError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../http";
import { requireStep } from "../../setup";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestPost({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env);
    const identity = await authenticate(request, db);
    await parseJsonBody(request);
    await requireStep(db, identity, "companion");
    const avatar = await db.prepare(`SELECT id FROM member_companions
      WHERE household_id = ? AND member_id = ? AND is_active = 1 LIMIT 1`)
      .bind(identity.householdId, identity.memberId).first();
    if (!avatar) throw new ApiError(409, "AVATAR_REQUIRED", "Create your cat before continuing.");
    const now = new Date().toISOString();
    await db.prepare(`UPDATE households SET setup_step = 'rooms', updated_at = ?
      WHERE id = ? AND setup_step = 'companion'`).bind(now, identity.householdId).run();
    return success({ step: "rooms" }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
