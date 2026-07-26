import { authenticate } from "../../auth";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../http";
import { createHouseholdInvite } from "../../invites";
import { requireFamilyManager } from "../../member-policy";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestGet({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); requireFamilyManager(identity);
    const result = await db.prepare(`SELECT i.id, i.target_member_id AS targetMemberId, m.display_name AS targetName,
      i.invite_type AS inviteType, i.invited_role AS role, i.expires_at AS expiresAt,
      i.revoked_at AS revokedAt, i.accepted_at AS acceptedAt, i.use_count AS useCount, i.max_uses AS maxUses,
      CASE WHEN i.revoked_at IS NOT NULL THEN 'revoked'
        WHEN i.accepted_at IS NOT NULL THEN 'accepted'
        WHEN i.expires_at <= ? THEN 'expired' ELSE 'active' END AS status
      FROM household_invites i
      LEFT JOIN members m ON m.household_id = i.household_id AND m.id = i.target_member_id
      WHERE i.household_id = ? ORDER BY i.created_at DESC`)
      .bind(new Date().toISOString(), identity.householdId).all();
    return success({ invites: result.results }, requestId);
  });
}

export async function onRequestPost({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); requireFamilyManager(identity);
    const invite = await createHouseholdInvite(request, db, identity, await parseJsonBody(request));
    return success({ invite }, requestId, { status: 201 });
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET or POST"); });
}
