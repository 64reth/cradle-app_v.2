import { authenticate, textField } from "../../auth";
import { ApiError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../../http";
import { canManageMember, requireFamilyManager } from "../../member-policy";
import type { CradleEnv } from "../../types";
import {
  isMemberAccessLevel, isMemberAgeBand, legacyAgeGroupForBand, legacyRoleForAccess
} from "../../../../shared/members";

type Context = { request: Request; env: CradleEnv; params: { memberId: string } };

export async function onRequestPatch({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const member = await db.prepare(`SELECT id, role, access_level AS accessLevel, age_band AS ageBand,
      lifecycle_state AS lifecycleState
      FROM members WHERE household_id = ? AND id = ? AND lifecycle_state != 'left'`)
      .bind(identity.householdId, params.memberId).first<{
        id: string; role: "owner" | "parent_admin" | "adult" | "child";
        accessLevel: string; ageBand: string; lifecycleState: string
      }>();
    if (!member) throw new ApiError(404, "NOT_FOUND", "Family member not found.");
    const body = await parseJsonBody(request);
    if (identity.memberId === member.id) {
      const displayName = textField(body, "displayName", 1, 80);
      if ("accessLevel" in body || "ageBand" in body || "role" in body || "lifecycleState" in body) {
        throw validationError("You can edit your name here, but household roles are managed by household leaders.");
      }
      await db.prepare("UPDATE members SET display_name = ?, updated_at = ? WHERE household_id = ? AND id = ?")
        .bind(displayName, new Date().toISOString(), identity.householdId, member.id).run();
      return success({ member: { ...member, displayName } }, requestId);
    }
    requireFamilyManager(identity);
    if (!canManageMember(identity, member)) throw new ApiError(403, "AUTHORIZATION_ERROR", "You cannot change this family member.");
    const displayName = textField(body, "displayName", 1, 80);
    if (!isMemberAccessLevel(body.accessLevel)) {
      throw validationError("Please check this family member.", { accessLevel: "Choose what this person can manage" });
    }
    if (!isMemberAgeBand(body.ageBand)) {
      throw validationError("Please check this family member.", { ageBand: "Choose an age group" });
    }
    const role = legacyRoleForAccess(body.accessLevel, member.role);
    await db.prepare(`UPDATE members SET display_name = ?, role = ?, age_group = ?, relationship_label = NULL,
      access_level = ?, age_band = ?, lifecycle_state = CASE WHEN ? = 'managed_member' THEN 'managed'
        WHEN lifecycle_state = 'managed' THEN 'unclaimed' ELSE lifecycle_state END, updated_at = ?
      WHERE household_id = ? AND id = ? AND role != 'owner'`)
      .bind(displayName, role, legacyAgeGroupForBand(body.ageBand), body.accessLevel, body.ageBand,
        body.accessLevel, new Date().toISOString(), identity.householdId, member.id).run();
    return success({ member: { ...member, displayName, role, accessLevel: body.accessLevel,
      ageBand: body.ageBand } }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "PATCH") return onRequestPatch(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("PATCH"); });
}
