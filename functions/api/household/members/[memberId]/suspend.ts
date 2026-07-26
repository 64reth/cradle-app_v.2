import { authenticate } from "../../../auth";
import { ApiError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../../http";
import { canManageMember, requireFamilyManager } from "../../../member-policy";
import type { CradleEnv } from "../../../types";
import { syncRoutineRotationsToFamily } from "../../../routine-generation";

type Context = { request: Request; env: CradleEnv; params: { memberId: string } };

export async function onRequestPost({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); requireFamilyManager(identity);
    await parseJsonBody(request);
    const member = await db.prepare(`SELECT id, role, access_level AS accessLevel FROM members
      WHERE household_id = ? AND id = ? AND lifecycle_state NOT IN ('suspended','left')`)
      .bind(identity.householdId, params.memberId).first<{ id: string; role: string; accessLevel: string }>();
    if (!member) throw new ApiError(404, "NOT_FOUND", "Family member not found.");
    if (!canManageMember(identity, member)) {
      throw new ApiError(403, "AUTHORIZATION_ERROR", "You cannot pause access for this family member.");
    }
    const now = new Date().toISOString();
    const result = await db.prepare(`UPDATE members SET lifecycle_state = 'suspended', is_active = 0, updated_at = ?
      WHERE household_id = ? AND id = ? AND role != 'owner' AND lifecycle_state NOT IN ('suspended','left')`)
      .bind(now, identity.householdId, params.memberId).run();
    if (!result.meta.changes) throw new ApiError(404, "NOT_FOUND", "Family member not found or cannot be suspended.");
    await db.prepare(`UPDATE sessions SET revoked_at = ?, updated_at = ?
      WHERE household_id = ? AND member_id = ? AND revoked_at IS NULL`)
      .bind(now, now, identity.householdId, params.memberId).run();
    await syncRoutineRotationsToFamily(db, identity.householdId);
    return success({ suspended: true }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
