import { authenticate } from "../../../auth";
import { ApiError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../../http";
import { createHouseholdInvite } from "../../../invites";
import { requireFamilyManager } from "../../../member-policy";
import type { CradleEnv } from "../../../types";

type Context = { request: Request; env: CradleEnv; params: { inviteId: string } };

export async function onRequestPost({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); requireFamilyManager(identity);
    const body = await parseJsonBody(request);
    const old = await db.prepare(`SELECT target_member_id AS targetMemberId,
      invited_access_level AS accessLevel, invited_age_band AS ageBand
      FROM household_invites WHERE household_id = ? AND id = ? AND accepted_at IS NULL`)
      .bind(identity.householdId, params.inviteId).first<{
        targetMemberId: string | null; accessLevel: string; ageBand: string
      }>();
    if (!old) throw new ApiError(404, "NOT_FOUND", "Invitation not found.");
    const invite = await createHouseholdInvite(request, db, identity, {
      targetMemberId: old.targetMemberId, accessLevel: body.accessLevel || old.accessLevel,
      ageBand: body.ageBand || old.ageBand,
      expiry: body.expiry || "7_days"
    }, params.inviteId);
    return success({ invite }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
