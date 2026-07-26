import { authenticate } from "../../../auth";
import { ApiError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../../http";
import { upsertMemberAvatar } from "../../../member-avatars";
import { canManageMember, requireFamilyManager } from "../../../member-policy";
import type { CradleEnv } from "../../../types";

type Context = { request: Request; env: CradleEnv; params: { memberId: string } };

export async function onRequestPut({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); requireFamilyManager(identity);
    const member = await db.prepare(`SELECT id, display_name AS displayName, role,
      access_level AS accessLevel FROM members
      WHERE household_id = ? AND id = ? AND is_active = 1`)
      .bind(identity.householdId, params.memberId)
      .first<{ id: string; displayName: string; role: string; accessLevel: string }>();
    if (!member) throw new ApiError(404, "NOT_FOUND", "Family member not found.");
    if (!canManageMember(identity, member) || member.accessLevel !== "managed_member") {
      throw new ApiError(403, "AUTHORIZATION_ERROR", "Only a Managed member’s avatar can be changed here.");
    }
    const avatar = await upsertMemberAvatar(
      db, identity.householdId, member.id, member.displayName, await parseJsonBody(request)
    );
    return success({ avatar, destination: "/dashboard" }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "PUT") return onRequestPut(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("PUT"); });
}
