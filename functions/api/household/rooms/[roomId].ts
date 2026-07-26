import { authenticate, textField } from "../../auth";
import { ApiError, conflictError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../../http";
import { optionalText, requireHouseholdManager, requireStep } from "../../setup";
import type { CradleEnv } from "../../types";
import { inferRoomType, isRoomType } from "../../../../shared/routines";
type Context = { request: Request; env: CradleEnv; params: { roomId: string } };
async function occupants(db: D1Database, householdId: string, value: unknown): Promise<string[]> {
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string") || new Set(value).size !== value.length) {
    throw validationError("Please check who uses this Room.", { occupantMemberIds: "Choose each family member once" });
  }
  const rows = await db.prepare(`SELECT id FROM members WHERE household_id = ? AND is_active = 1
    AND lifecycle_state NOT IN ('left','suspended')`).bind(householdId).all<{ id: string }>();
  const eligible = new Set(rows.results.map(({ id }) => id));
  if (value.some((id) => !eligible.has(id as string))) {
    throw validationError("Please check who uses this Room.", { occupantMemberIds: "Choose active family members" });
  }
  return value as string[];
}
async function permit(db: D1Database, identity: Awaited<ReturnType<typeof authenticate>>) {
  if (identity.setupStatus === "incomplete") await requireStep(db, identity, "rooms");
  else requireHouseholdManager(identity);
}
export async function onRequestPatch({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); await permit(db, identity);
    const body = await parseJsonBody(request); const name = textField(body, "name", 1, 80);
    const roomType = body.roomType === undefined ? inferRoomType(name) : body.roomType;
    if (!isRoomType(roomType)) throw validationError("Choose a supported Room type.");
    const description = optionalText(body, "description", 500);
    const occupantMemberIds = await occupants(db, identity.householdId, body.occupantMemberIds || []);
    const now = new Date().toISOString();
    try {
      const exists = await db.prepare(`SELECT id FROM rooms WHERE household_id = ? AND id = ? AND is_active = 1`)
        .bind(identity.householdId, params.roomId).first();
      if (!exists) throw new ApiError(404, "NOT_FOUND", "Room not found.");
      await db.batch([
        db.prepare("UPDATE rooms SET name = ?, description = ?, room_type = ?, updated_at = ? WHERE household_id = ? AND id = ? AND is_active = 1")
          .bind(name, description, roomType, now, identity.householdId, params.roomId),
        db.prepare("DELETE FROM room_occupants WHERE household_id = ? AND room_id = ?")
          .bind(identity.householdId, params.roomId),
        ...occupantMemberIds.map((memberId) => db.prepare(`INSERT INTO room_occupants
          (household_id, room_id, member_id, created_at) VALUES (?, ?, ?, ?)`)
          .bind(identity.householdId, params.roomId, memberId, now))
      ]);
    } catch (error) {
      if (String(error).includes("UNIQUE constraint")) throw conflictError("An active Room with that name already exists.");
      throw error;
    }
    return success({ updated: true }, requestId);
  });
}
export async function onRequestDelete({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); await permit(db, identity);
    await parseJsonBody(request);
    const result = await db.prepare("UPDATE rooms SET is_active = 0, updated_at = ? WHERE household_id = ? AND id = ? AND is_active = 1")
      .bind(new Date().toISOString(), identity.householdId, params.roomId).run();
    if (!result.meta.changes) throw new ApiError(404, "NOT_FOUND", "Room not found.");
    return success({ deactivated: true }, requestId);
  });
}
export async function onRequest(context: Context) {
  if (context.request.method === "PATCH") return onRequestPatch(context);
  if (context.request.method === "DELETE") return onRequestDelete(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("PATCH or DELETE"); });
}
