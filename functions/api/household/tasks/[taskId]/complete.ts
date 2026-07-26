import { authenticate } from "../../../auth";
import {
  ApiError, authorizationError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success
} from "../../../http";
import { canAdministerTasks } from "../../../tasks";
import type { CradleEnv } from "../../../types";

type Context = { request: Request; env: CradleEnv; params: { taskId: string } };

export async function onRequestPost({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const body = await parseJsonBody(request);
    let contributionMemberId = identity.memberId;
    if (typeof body.contributionMemberId === "string" && body.contributionMemberId !== identity.memberId) {
      if (!canAdministerTasks(identity)) {
        throw authorizationError("You cannot sign off another family member’s contribution.");
      }
      const managed = await db.prepare(`SELECT id FROM members WHERE household_id = ? AND id = ?
        AND access_level = 'managed_member' AND is_active = 1
        AND lifecycle_state NOT IN ('left','suspended')`)
        .bind(identity.householdId, body.contributionMemberId).first();
      if (!managed) throw authorizationError("Household admins can sign off for Managed members.");
      contributionMemberId = body.contributionMemberId;
    }
    const task = await db.prepare(`SELECT id, status, assignment_mode AS assignmentMode
      FROM household_task_instances WHERE household_id = ? AND id = ?`)
      .bind(identity.householdId, params.taskId)
      .first<{ id: string; status: string; assignmentMode: string }>();
    if (!task) throw new ApiError(404, "NOT_FOUND", "Household mission not found.");
    const participant = await db.prepare(`SELECT participant_kind AS participantKind, status
      FROM household_task_participants WHERE household_id = ? AND task_id = ? AND member_id = ?`)
      .bind(identity.householdId, task.id, contributionMemberId)
      .first<{ participantKind: "required" | "helper"; status: string }>();
    const override = body.override === true && canAdministerTasks(identity);
    if (!participant && !override) throw authorizationError("This mission is assigned to another family member.");
    if (task.status === "complete") return success({ completed: true, alreadyComplete: true,
      celebrationMemberIds: [] }, requestId);
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];
    if (override) {
      statements.push(db.prepare(`UPDATE household_task_participants SET status = 'complete',
        completed_at = COALESCE(completed_at, ?), completed_by_member_id = ?, updated_at = ?
        WHERE household_id = ? AND task_id = ? AND participant_kind = 'required'`)
        .bind(now, identity.memberId, now, identity.householdId, task.id));
    } else {
      statements.push(db.prepare(`UPDATE household_task_participants SET status = 'complete',
        completed_at = ?, completed_by_member_id = ?, updated_at = ?
        WHERE household_id = ? AND task_id = ? AND member_id = ?`)
        .bind(now, identity.memberId, now, identity.householdId, task.id, contributionMemberId));
      if (participant?.participantKind === "helper") {
        const help = await db.prepare(`SELECT requested_by_member_id AS requestedByMemberId
          FROM task_help_requests WHERE household_id = ? AND task_id = ? AND helper_member_id = ?
            AND status IN ('requested','accepted') LIMIT 1`)
          .bind(identity.householdId, task.id, contributionMemberId)
          .first<{ requestedByMemberId: string }>();
        if (help) statements.push(db.prepare(`UPDATE household_task_participants SET status = 'complete',
          completed_at = ?, completed_by_member_id = ?, updated_at = ?
          WHERE household_id = ? AND task_id = ? AND member_id = ? AND participant_kind = 'required'`)
          .bind(now, identity.memberId, now, identity.householdId, task.id, help.requestedByMemberId));
      }
    }
    if (statements.length) await db.batch(statements);
    const required = await db.prepare(`SELECT member_id AS memberId, status FROM household_task_participants
      WHERE household_id = ? AND task_id = ? AND participant_kind = 'required'`)
      .bind(identity.householdId, task.id).all<{ memberId: string; status: string }>();
    const complete = required.results.length > 0 && required.results.every(({ status }) => status === "complete");
    await db.batch([
      db.prepare(`UPDATE household_task_instances SET status = ?, completed_at = ?,
        completed_by_member_id = ?, updated_at = ? WHERE household_id = ? AND id = ?`)
        .bind(complete ? "complete" : task.assignmentMode === "shared_team" ? "waiting_for_team" : "in_progress",
          complete ? now : null, complete ? identity.memberId : null, now, identity.householdId, task.id),
      ...(complete ? [db.prepare(`UPDATE task_help_requests SET status = 'completed', completed_at = ?, updated_at = ?
        WHERE household_id = ? AND task_id = ? AND status IN ('requested','accepted')`)
        .bind(now, now, identity.householdId, task.id)] : [])
    ]);
    return success({
      completed: complete,
      state: complete ? "complete" : task.assignmentMode === "shared_team" ? "waiting_for_team" : "in_progress",
      celebrationMemberIds: complete
        ? required.results.map(({ memberId }) => memberId)
        : participant ? [contributionMemberId] : []
    }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
