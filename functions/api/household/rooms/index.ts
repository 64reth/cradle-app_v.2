import { authenticate, textField } from "../../auth";
import { conflictError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../../http";
import { optionalText, requireHouseholdManager, requireStep } from "../../setup";
import type { CradleEnv } from "../../types";
import { inferRoomType, isRoomType } from "../../../../shared/routines";
type Context = { request: Request; env: CradleEnv };
export async function onRequestGet({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const rows = await db.prepare("SELECT id, name, description, room_type AS roomType, display_order AS displayOrder FROM rooms WHERE household_id = ? AND is_active = 1 ORDER BY display_order, created_at")
      .bind(identity.householdId).all();
    return success({ rooms: rows.results }, requestId);
  });
}
export async function onRequestPost({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    if (identity.setupStatus === "incomplete") await requireStep(db, identity, "rooms");
    else requireHouseholdManager(identity);
    const body = await parseJsonBody(request); const name = textField(body, "name", 1, 80);
    const roomType = body.roomType === undefined ? inferRoomType(name) : body.roomType;
    if (!isRoomType(roomType)) throw validationError("Choose a supported Room type.");
    const description = optionalText(body, "description", 500); const now = new Date().toISOString();
    const order = await db.prepare("SELECT COALESCE(MAX(display_order), -1) + 1 AS value FROM rooms WHERE household_id = ? AND is_active = 1")
      .bind(identity.householdId).first<{ value: number }>();
    const id = crypto.randomUUID();
    try {
      await db.prepare("INSERT INTO rooms (id, household_id, name, description, room_type, display_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)")
        .bind(id, identity.householdId, name, description, roomType, order?.value ?? 0, now, now).run();
    } catch (error) {
      if (String(error).includes("UNIQUE constraint")) throw conflictError("An active Room with that name already exists.");
      throw error;
    }
    return success({ room: { id, name, description, roomType, displayOrder: order?.value ?? 0 } }, requestId, { status: 201 });
  });
}
export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET or POST"); });
}
