import { authenticate } from "../../auth";
import { ApiError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../http";
import { getRoutineDetail, parseRoutineEdit } from "../../systems";
import { requireHouseholdManager, requireSystemsViewer } from "../../setup";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv; params: { systemId: string } };

export async function onRequestGet({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); const scope = requireSystemsViewer(identity);
    const routine = await getRoutineDetail(db, identity.householdId, params.systemId);
    if (scope === "active" && routine.status !== "active") throw new ApiError(404, "NOT_FOUND", "Routine not found.");
    return success({ routine }, requestId);
  });
}

export async function onRequestPatch({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); requireHouseholdManager(identity);
    const existing = await db.prepare(`SELECT id, status, owner_member_id AS ownerMemberId FROM household_systems
      WHERE household_id = ? AND id = ?`).bind(identity.householdId, params.systemId)
      .first<{ id: string; status: string; ownerMemberId: string }>();
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Routine not found.");
    if (existing.status === "archived") throw new ApiError(409, "ROUTINE_ARCHIVED", "Archived routines are read-only.");
    const edit = await parseRoutineEdit(await parseJsonBody(request), db, identity);
    const now = new Date().toISOString();
    const legacyOwner = edit.assignedMemberId || edit.participantMemberIds[0] || existing.ownerMemberId;
    await db.batch([
      db.prepare(`UPDATE household_systems SET name = ?, frequency_key = ?, custom_frequency_note = ?, owner_member_id = ?,
        rotation_enabled = ?, status = ?, notes = ?, template_customised = 1, updated_at = ?
        WHERE household_id = ? AND id = ? AND status != 'archived'`)
        .bind(edit.name, edit.frequency, edit.customFrequencyNote, legacyOwner,
          edit.assignmentMode === "rotation" ? 1 : 0, edit.status, edit.note,
          now, identity.householdId, params.systemId),
      db.prepare(`UPDATE routine_assignments SET assignment_mode = ?, assigned_member_id = ?,
        rotation_next_index = CASE WHEN ? = 'rotation' THEN rotation_next_index % ? ELSE 0 END,
        updated_at = ? WHERE household_id = ? AND system_id = ?`)
        .bind(edit.assignmentMode, edit.assignedMemberId, edit.assignmentMode,
          Math.max(1, edit.participantMemberIds.length), now, identity.householdId, params.systemId),
      db.prepare("DELETE FROM routine_assignment_participants WHERE household_id = ? AND system_id = ?")
        .bind(identity.householdId, params.systemId),
      db.prepare("DELETE FROM household_system_participants WHERE household_id = ? AND system_id = ?")
        .bind(identity.householdId, params.systemId),
      ...edit.participantMemberIds.map((memberId, index) => db.prepare(`INSERT INTO routine_assignment_participants
        (household_id, system_id, member_id, participant_order, created_at) VALUES (?, ?, ?, ?, ?)`)
        .bind(identity.householdId, params.systemId, memberId, index, now)),
      ...edit.participantMemberIds.map((memberId) => db.prepare(`INSERT INTO household_system_participants
        (household_id, system_id, member_id, created_at) VALUES (?, ?, ?, ?)`)
        .bind(identity.householdId, params.systemId, memberId, now))
    ]);
    return success({ routine: await getRoutineDetail(db, identity.householdId, params.systemId) }, requestId);
  });
}

export async function onRequestDelete({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); requireHouseholdManager(identity);
    await parseJsonBody(request); const now = new Date().toISOString();
    const result = await db.prepare(`UPDATE household_systems SET status = 'archived', archived_at = ?, updated_at = ?
      WHERE household_id = ? AND id = ? AND status != 'archived'`).bind(now, now, identity.householdId, params.systemId).run();
    if (!result.meta.changes) throw new ApiError(404, "NOT_FOUND", "Routine not found.");
    return success({ archived: true }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "PATCH") return onRequestPatch(context);
  if (context.request.method === "DELETE") return onRequestDelete(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET, PATCH or DELETE"); });
}
