import { authenticate } from "../../../auth";
import { ApiError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../../http";
import { requireFamilyManager } from "../../../member-policy";
import type { CradleEnv } from "../../../types";

type Context = { request: Request; env: CradleEnv; params: { inviteId: string } };

export async function onRequestPost({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); requireFamilyManager(identity);
    await parseJsonBody(request); const now = new Date().toISOString();
    const invite = await db.prepare(`SELECT target_member_id AS targetMemberId FROM household_invites
      WHERE household_id = ? AND id = ? AND revoked_at IS NULL AND accepted_at IS NULL`)
      .bind(identity.householdId, params.inviteId).first<{ targetMemberId: string | null }>();
    if (!invite) throw new ApiError(404, "NOT_FOUND", "Active invitation not found.");
    await db.batch([
      db.prepare("UPDATE household_invites SET revoked_at = ?, updated_at = ? WHERE household_id = ? AND id = ?")
        .bind(now, now, identity.householdId, params.inviteId),
      ...(invite.targetMemberId ? [db.prepare(`UPDATE members SET lifecycle_state = CASE
          WHEN access_level = 'managed_member' THEN 'managed' ELSE 'unclaimed' END, updated_at = ?
        WHERE household_id = ? AND id = ? AND account_id IS NULL`)
        .bind(now, identity.householdId, invite.targetMemberId)] : [])
    ]);
    return success({ revoked: true, next: "/dashboard" }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
