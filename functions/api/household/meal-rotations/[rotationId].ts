import { authenticate, identityAccessLevel } from "../../auth";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../http";
import { activateRotation, parseMealSlot, rotationData } from "../../meal-planning";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv; params: { rotationId: string } };

export async function onRequestGet({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    return success(await rotationData(db, identity.householdId, params.rotationId), requestId);
  });
}

export async function onRequestPatch({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); const body = await parseJsonBody(request);
    const existing = await db.prepare("SELECT id FROM meal_rotations WHERE household_id = ? AND id = ?")
      .bind(identity.householdId, params.rotationId).first();
    if (!existing) return success(null, requestId, { status: 404 });
    if (body.active === true) await activateRotation(db, identity, params.rotationId);
    if (identityAccessLevel(identity) !== "household_admin") return success(await rotationData(db, identity.householdId, params.rotationId), requestId);
    const now = new Date().toISOString();
    if (body.title !== undefined || body.description !== undefined || body.startsOn !== undefined) {
      await db.prepare(`UPDATE meal_rotations SET title = COALESCE(?, title), description = ?, starts_on = ?, updated_at = ?
        WHERE household_id = ? AND id = ?`).bind(
        typeof body.title === "string" ? body.title.trim() : null,
        body.description === null ? null : typeof body.description === "string" ? body.description.trim() : null,
        body.startsOn === null || body.startsOn === "" ? null : body.startsOn,
        now, identity.householdId, params.rotationId).run();
    }
    if (Array.isArray(body.slots)) {
      for (const raw of body.slots) {
        const slot = parseMealSlot(raw as Record<string, unknown>);
        const slotId = typeof (raw as Record<string, unknown>).id === "string" ? String((raw as Record<string, unknown>).id) : crypto.randomUUID();
        await db.prepare(`INSERT INTO meal_rotation_slots
          (id, household_id, meal_rotation_id, rotation_week_number, day_of_week, meal_type, meal_id, custom_meal_name,
           slot_kind, day_theme, assigned_cook_member_id, assignment_mode, notes, sort_position, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(household_id, meal_rotation_id, rotation_week_number, day_of_week, meal_type)
          DO UPDATE SET meal_id = excluded.meal_id, custom_meal_name = excluded.custom_meal_name,
            slot_kind = excluded.slot_kind, day_theme = excluded.day_theme, assigned_cook_member_id = excluded.assigned_cook_member_id,
            assignment_mode = excluded.assignment_mode, notes = excluded.notes, sort_position = excluded.sort_position,
            updated_at = excluded.updated_at`)
          .bind(slotId, identity.householdId, params.rotationId, slot.rotationWeekNumber, slot.dayOfWeek, slot.mealType,
            slot.mealId, slot.customMealName, slot.slotKind, slot.dayTheme, slot.assignedCookMemberId, slot.assignmentMode,
            slot.notes, slot.sortPosition, now, now).run();
      }
    }
    return success(await rotationData(db, identity.householdId, params.rotationId), requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "PATCH") return onRequestPatch(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET or PATCH"); });
}
