import { authenticate } from "../../../auth";
import {
  ApiError, authorizationError, conflictError, handleApiRequest, methodNotAllowed, parseJsonBody,
  requireD1, success, validationError
} from "../../../http";
import { canAdministerTasks } from "../../../tasks";
import type { CradleEnv } from "../../../types";

type Context = { request: Request; env: CradleEnv; params: { taskId: string } };

export async function onRequestPost({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const body = await parseJsonBody(request);
    let requestedByMemberId = identity.memberId;
    if (typeof body.requestedByMemberId === "string" && body.requestedByMemberId !== identity.memberId) {
      if (!canAdministerTasks(identity)) {
        throw authorizationError("You cannot request help for another family member.");
      }
      const managed = await db.prepare(`SELECT id FROM members WHERE household_id = ? AND id = ?
        AND access_level = 'managed_member' AND is_active = 1
        AND lifecycle_state NOT IN ('left','suspended')`)
        .bind(identity.householdId, body.requestedByMemberId).first();
      if (!managed) throw authorizationError("Household admins can request help for Managed members.");
      requestedByMemberId = body.requestedByMemberId;
    }
    if (typeof body.helperMemberId !== "string" || body.helperMemberId === requestedByMemberId) {
      throw validationError("Choose another family member to lend a hand.");
    }
    const assignment = await db.prepare(`SELECT t.id, t.status, p.status AS participantStatus
      FROM household_task_instances t JOIN household_task_participants p
        ON p.household_id = t.household_id AND p.task_id = t.id AND p.member_id = ?
      WHERE t.household_id = ? AND t.id = ? AND p.participant_kind = 'required'`)
      .bind(requestedByMemberId, identity.householdId, params.taskId)
      .first<{ id: string; status: string; participantStatus: string }>();
    if (!assignment) throw authorizationError("You can ask for help with work assigned to you.");
    if (assignment.status === "complete" || assignment.participantStatus === "complete") {
      throw conflictError("This household mission is already complete.");
    }
    const helper = await db.prepare(`SELECT id FROM members WHERE household_id = ? AND id = ?
      AND is_active = 1 AND lifecycle_state NOT IN ('left','suspended')`)
      .bind(identity.householdId, body.helperMemberId).first();
    if (!helper) throw new ApiError(404, "NOT_FOUND", "That family member is not available.");
    const existingParticipant = await db.prepare(`SELECT participant_kind AS participantKind
      FROM household_task_participants
      WHERE household_id = ? AND task_id = ? AND member_id = ?`)
      .bind(identity.householdId, params.taskId, body.helperMemberId)
      .first<{ participantKind: "required" | "helper" }>();
    if (existingParticipant?.participantKind === "required") {
      throw conflictError("That family member is already part of this household mission.");
    }
    if (existingParticipant?.participantKind === "helper") {
      throw conflictError("Help has already been requested from that person.");
    }
    const now = new Date().toISOString(); const id = crypto.randomUUID();
    try {
      await db.batch([
        db.prepare(`INSERT INTO task_help_requests
          (id, household_id, task_id, requested_by_member_id, helper_member_id, status,
            created_at, updated_at, completed_at)
          VALUES (?, ?, ?, ?, ?, 'requested', ?, ?, NULL)`)
          .bind(id, identity.householdId, params.taskId, requestedByMemberId, body.helperMemberId, now, now),
        db.prepare(`INSERT INTO household_task_participants
          (household_id, task_id, member_id, participant_kind, status, completed_at,
            completed_by_member_id, created_at, updated_at)
          VALUES (?, ?, ?, 'helper', 'todo', NULL, NULL, ?, ?)`)
          .bind(identity.householdId, params.taskId, body.helperMemberId, now, now)
      ]);
    } catch (error) {
      if (String(error).includes("UNIQUE constraint")) throw conflictError("Help has already been requested from that person.");
      throw error;
    }
    return success({ requested: true, helpRequestId: id }, requestId, { status: 201 });
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
