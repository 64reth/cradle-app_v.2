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
    const existing = await db.prepare(`SELECT id, status FROM household_systems
      WHERE household_id = ? AND id = ?`).bind(identity.householdId, params.systemId).first<{ id: string; status: string }>();
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Routine not found.");
    if (existing.status === "archived") throw new ApiError(409, "ROUTINE_ARCHIVED", "Archived routines are read-only.");
    const edit = await parseRoutineEdit(await parseJsonBody(request), db, identity);
    await db.prepare(`UPDATE household_systems SET name = ?, frequency_key = ?, custom_frequency_note = ?, owner_member_id = ?,
      status = ?, notes = ?, template_customised = 1, updated_at = ?
      WHERE household_id = ? AND id = ? AND status != 'archived'`)
      .bind(edit.name, edit.frequency, edit.customFrequencyNote, edit.ownerMemberId, edit.status, edit.note,
        new Date().toISOString(), identity.householdId, params.systemId).run();
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
