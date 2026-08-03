import { authenticate, sha256 } from "../../../auth";
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
    // The retired invitation UUID is private leadership data with sufficient
    // entropy to make regeneration deterministic and retry-safe without
    // retaining plaintext invite credentials in D1.
    const token = await sha256(`cradle-invite-token:${params.inviteId}`);
    const code = (await sha256(`cradle-invite-code:${params.inviteId}`)).slice(0, 10).toUpperCase();
    const tokenHash = await sha256(token);
    const existing = await db.prepare(`SELECT id, target_member_id AS targetMemberId, expires_at AS expiresAt
      FROM household_invites WHERE household_id = ? AND token_hash = ? LIMIT 1`)
      .bind(identity.householdId, tokenHash)
      .first<{ id: string; targetMemberId: string | null; expiresAt: string }>();
    if (existing) {
      return success({ invite: {
        id: existing.id, targetMemberId: existing.targetMemberId, inviteType: existing.targetMemberId ? "profile" : "household",
        token, code, inviteUrl: `${new URL(request.url).origin}/invite/${token}`, expiresAt: existing.expiresAt,
        status: "active"
      } }, requestId);
    }
    const invite = await createHouseholdInvite(request, db, identity, {
      targetMemberId: old.targetMemberId, accessLevel: body.accessLevel || old.accessLevel,
      ageBand: body.ageBand || old.ageBand,
      expiry: body.expiry || "7_days"
    }, params.inviteId, { token, code });
    return success({ invite }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
