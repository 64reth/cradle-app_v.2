import { authenticate, slug } from "../../../auth";
import { ApiError, conflictError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../../http";
import { requireFamilyManager } from "../../../member-policy";
import type { CradleEnv } from "../../../types";

type Context = { request: Request; env: CradleEnv; params: { requestId: string } };

export async function onRequestPost({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); requireFamilyManager(identity);
    const body = await parseJsonBody(request);
    const join = await db.prepare(`SELECT j.account_id AS accountId, j.requested_member_id AS requestedMemberId,
      j.proposed_display_name AS proposedDisplayName, i.invited_role AS invitedRole,
      i.invited_access_level AS invitedAccessLevel, i.invited_age_band AS invitedAgeBand,
      a.display_name AS accountName
      FROM household_join_requests j
      JOIN household_invites i ON i.household_id = j.household_id AND i.id = j.invite_id
      JOIN user_accounts a ON a.id = j.account_id
      WHERE j.household_id = ? AND j.id = ? AND j.status = 'pending'`)
      .bind(identity.householdId, params.requestId).first<{ accountId: string; requestedMemberId: string | null;
        proposedDisplayName: string | null; invitedRole: "parent_admin" | "adult" | "child";
        invitedAccessLevel: string; invitedAgeBand: string; accountName: string
      }>();
    if (!join) throw new ApiError(404, "NOT_FOUND", "Pending join request not found.");
    const now = new Date().toISOString();
    let memberId = join.requestedMemberId;
    const createNew = body.resolution === "create_new" || !memberId;
    if (createNew) {
      memberId = crypto.randomUUID();
      const displayName = (typeof body.displayName === "string" && body.displayName.trim()) ||
        join.proposedDisplayName || join.accountName;
      const reference = `${slug(displayName)}-${memberId.slice(0, 4)}`;
      try {
        await db.batch([
          db.prepare(`INSERT INTO members
            (id, household_id, display_name, role, is_active, created_at, updated_at, profile_reference,
              account_id, lifecycle_state, age_group, relationship_label, access_level, age_band)
            VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, 'active', ?, NULL, ?, ?)`)
            .bind(memberId, identity.householdId, displayName, join.invitedRole, now, now, reference,
              join.accountId, join.invitedAgeBand === "young_child" ? "dependent" : join.invitedAgeBand,
              join.invitedAccessLevel, join.invitedAgeBand),
          db.prepare(`UPDATE household_join_requests SET status = 'approved', reviewed_by_member_id = ?,
            reviewed_at = ?, updated_at = ? WHERE household_id = ? AND id = ? AND status = 'pending'`)
            .bind(identity.memberId, now, now, identity.householdId, params.requestId)
        ]);
      } catch (error) {
        if (String(error).includes("UNIQUE constraint")) throw conflictError("That account or family member has already joined.");
        throw error;
      }
    } else {
      const results = await db.batch([
        db.prepare(`UPDATE members SET account_id = ?, lifecycle_state = 'active', updated_at = ?
          WHERE household_id = ? AND id = ? AND account_id IS NULL
            AND lifecycle_state IN ('managed','unclaimed','invited','join_requested')`)
          .bind(join.accountId, now, identity.householdId, memberId),
        db.prepare(`UPDATE household_join_requests SET status = 'approved', reviewed_by_member_id = ?,
          reviewed_at = ?, updated_at = ? WHERE household_id = ? AND id = ? AND status = 'pending'`)
          .bind(identity.memberId, now, now, identity.householdId, params.requestId)
      ]);
      if (!results[0].meta.changes) throw conflictError("That family member has already joined.");
    }
    return success({ approved: true, memberId, destination: "/dashboard", next: "pending_requests" }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
