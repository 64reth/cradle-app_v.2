import { authenticate } from "../../../auth";
import { ApiError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../../../http";
import { requireFamilyManager } from "../../../member-policy";
import type { CradleEnv } from "../../../types";

type Context = { request: Request; env: CradleEnv; params: { suggestionId: string } };

export async function onRequestPost({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); requireFamilyManager(identity);
    const body = await parseJsonBody(request);
    if (body.decision !== "accepted" && body.decision !== "declined") {
      throw validationError("Choose whether to accept or decline this suggestion.");
    }
    const now = new Date().toISOString();
    const result = await db.prepare(`UPDATE task_suggestions SET status = ?, reviewed_by_member_id = ?,
      reviewed_at = ?, updated_at = ? WHERE household_id = ? AND id = ? AND status = 'open'`)
      .bind(body.decision, identity.memberId, now, now, identity.householdId, params.suggestionId).run();
    if (!result.meta.changes) throw new ApiError(404, "NOT_FOUND", "Open suggestion not found.");
    return success({ reviewed: true, status: body.decision, routineCreated: false, destination: "/dashboard" }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
