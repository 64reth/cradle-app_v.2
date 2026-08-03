import { authenticate } from "../../../auth";
import { ApiError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../../http";
import { requireFamilyManager } from "../../../member-policy";
import type { CradleEnv } from "../../../types";

type Context = { request: Request; env: CradleEnv; params: { inviteId: string } };

export async function onRequestPost({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); requireFamilyManager(identity);
    await parseJsonBody(request); const now = new Date().toISOString();
    const invite = await db.prepare(`SELECT target_member_id AS targetMemberId,
      revoked_at AS revokedAt, accepted_at AS acceptedAt FROM household_invites
      WHERE household_id = ? AND id = ?`)
      .bind(identity.householdId, params.inviteId).first<{
        targetMemberId: string | null; revokedAt: string | null; acceptedAt: string | null
      }>();
    if (!invite) throw new ApiError(404, "NOT_FOUND", "Invitation not found.");
    if (invite.revokedAt) return success({ revoked: true, repeated: true, next: "/dashboard" }, requestId);
    if (invite.acceptedAt) throw new ApiError(409, "CONFLICT", "An accepted invitation cannot be revoked.");
    const results = await db.batch([
      db.prepare("UPDATE household_invites SET revoked_at = ?, updated_at = ? WHERE household_id = ? AND id = ?")
        .bind(now, now, identity.householdId, params.inviteId),
      ...(invite.targetMemberId ? [db.prepare(`UPDATE members SET lifecycle_state = CASE
          WHEN access_level = 'managed_member' THEN 'managed' ELSE 'unclaimed' END, updated_at = ?
        WHERE household_id = ? AND id = ? AND account_id IS NULL`)
        .bind(now, identity.householdId, invite.targetMemberId)] : [])
    ]);
    if (results[0]?.meta.changes !== 1) {
      throw new ApiError(409, "CONFLICT", "The invitation changed before it could be revoked.");
    }
    return success({ revoked: true, next: "/dashboard" }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
