import { authenticate } from "../../../auth";
import { ApiError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../../http";
import { requireFamilyManager } from "../../../member-policy";
import type { CradleEnv } from "../../../types";

type Context = { request: Request; env: CradleEnv; params: { requestId: string } };

export async function onRequestPost({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); requireFamilyManager(identity);
    await parseJsonBody(request); const now = new Date().toISOString();
    const join = await db.prepare(`SELECT requested_member_id AS requestedMemberId FROM household_join_requests
      WHERE household_id = ? AND id = ? AND status = 'pending'`)
      .bind(identity.householdId, params.requestId).first<{ requestedMemberId: string | null }>();
    if (!join) throw new ApiError(404, "NOT_FOUND", "Pending join request not found.");
    await db.batch([
      db.prepare(`UPDATE household_join_requests SET status = 'declined', reviewed_by_member_id = ?,
        reviewed_at = ?, updated_at = ? WHERE household_id = ? AND id = ? AND status = 'pending'`)
        .bind(identity.memberId, now, now, identity.householdId, params.requestId),
      ...(join.requestedMemberId ? [db.prepare(`UPDATE members SET lifecycle_state = CASE
          WHEN access_level = 'managed_member' THEN 'managed' ELSE 'unclaimed' END, updated_at = ?
        WHERE household_id = ? AND id = ? AND account_id IS NULL`)
        .bind(now, identity.householdId, join.requestedMemberId)] : [])
    ]);
    return success({ declined: true, destination: "/dashboard", next: "pending_requests" }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
