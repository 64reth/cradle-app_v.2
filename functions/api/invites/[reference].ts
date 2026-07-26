import { handleApiRequest, methodNotAllowed, requireD1, success } from "../http";
import { findPublicInvite, publicInviteState } from "../invites";
import type { CradleEnv } from "../types";

type Context = { request: Request; env: CradleEnv; params: { reference: string } };

export async function onRequestGet({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const invite = publicInviteState(await findPublicInvite(requireD1(env), params.reference));
    const profiles = invite.inviteType === "household"
      ? await requireD1(env).prepare(`SELECT id, display_name AS displayName FROM members
        WHERE household_id = ? AND account_id IS NULL AND is_active = 1
          AND lifecycle_state IN ('managed','unclaimed','invited')
        ORDER BY display_name`).bind(invite.householdId).all()
      : { results: [] };
    return success({ invitation: {
      householdName: invite.householdName, inviteType: invite.inviteType,
      targetMemberId: invite.targetMemberId, targetName: invite.targetName,
      role: invite.role, expiresAt: invite.expiresAt, alreadyAccepted: Boolean(invite.acceptedAt),
      availableProfiles: profiles.results
    } }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET"); });
}
