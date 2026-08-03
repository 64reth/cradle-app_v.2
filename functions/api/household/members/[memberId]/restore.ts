import { authenticate } from "../../../auth";
import { ApiError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../../http";
import { canManageMember, requireFamilyManager } from "../../../member-policy";
import type { CradleEnv } from "../../../types";

type Context = { request: Request; env: CradleEnv; params: { memberId: string } };

export async function onRequestPost({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env);
    const identity = await authenticate(request, db);
    requireFamilyManager(identity);
    await parseJsonBody(request);
    const member = await db.prepare(`SELECT id, role, access_level AS accessLevel, account_id AS accountId,
      lifecycle_state AS lifecycleState, is_active AS isActive
      FROM members WHERE household_id = ? AND id = ?`)
      .bind(identity.householdId, params.memberId)
      .first<{ id: string; role: string; accessLevel: string; accountId: string | null;
        lifecycleState: string; isActive: number }>();
    if (!member) throw new ApiError(404, "NOT_FOUND", "Family member not found.");
    if (!canManageMember(identity, member)) {
      throw new ApiError(403, "AUTHORIZATION_ERROR", "You cannot restore access for this family member.");
    }
    if (member.lifecycleState !== "suspended") {
      if (member.isActive && ["active", "managed", "unclaimed"].includes(member.lifecycleState)) {
        return success({ restored: true, repeated: true, lifecycleState: member.lifecycleState }, requestId);
      }
      throw new ApiError(409, "CONFLICT", "This family member is not paused.");
    }
    const lifecycle = member.accountId
      ? "active"
      : member.accessLevel === "managed_member" ? "managed" : "unclaimed";
    const result = await db.prepare(`UPDATE members SET lifecycle_state = ?, is_active = 1, updated_at = ?
      WHERE household_id = ? AND id = ? AND lifecycle_state = 'suspended'`)
      .bind(lifecycle, new Date().toISOString(), identity.householdId, params.memberId).run();
    if (!result.meta.changes) throw new ApiError(409, "CONFLICT", "This family member’s access has already changed.");
    return success({ restored: true, lifecycleState: lifecycle }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
