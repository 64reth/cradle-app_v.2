import { authenticate } from "../../../auth";
import { ApiError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../../http";
import type { CradleEnv } from "../../../types";

type Context = { request: Request; env: CradleEnv; params: { suggestionId: string } };

export async function onRequestPost({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); await parseJsonBody(request);
    const result = await db.prepare(`UPDATE task_suggestions SET status = 'withdrawn', updated_at = ?
      WHERE household_id = ? AND id = ? AND suggested_by_member_id = ? AND status = 'open'`)
      .bind(new Date().toISOString(), identity.householdId, params.suggestionId, identity.memberId).run();
    if (!result.meta.changes) throw new ApiError(404, "NOT_FOUND", "Open suggestion not found.");
    return success({ withdrawn: true, destination: "/me" }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
