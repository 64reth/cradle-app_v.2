import { authenticate, textField } from "../../auth";
import { conflictError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../../http";
import { optionalText, requireHouseholdManager, requireStep } from "../../setup";
import type { CradleEnv } from "../../types";
import { inferRoomType, isRoomType, storageRoomType } from "../../../../shared/routines";
import { generateRoutineDraft } from "../../routine-generation";
type Context = { request: Request; env: CradleEnv };
async function occupantIds(db: D1Database, householdId: string, body: Record<string, unknown>): Promise<string[]> {
  const value = body.occupantMemberIds === undefined ? [] : body.occupantMemberIds;
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string") || new Set(value).size !== value.length) {
    throw validationError("Please check who uses this Room.", { occupantMemberIds: "Choose each family member once" });
  }
  if (!value.length) return [];
  const members = await db.prepare(`SELECT id FROM members WHERE household_id = ? AND is_active = 1
    AND lifecycle_state NOT IN ('left', 'suspended')`).bind(householdId).all<{ id: string }>();
  const eligible = new Set(members.results.map(({ id }) => id));
  if (value.some((id) => !eligible.has(id as string))) {
    throw validationError("Please check who uses this Room.", { occupantMemberIds: "Choose active family members" });
  }
  return value as string[];
}
export async function onRequestGet({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const includeArchived = new URL(request.url).searchParams.get("include") === "archived";
    if (includeArchived) requireHouseholdManager(identity);
    const rows = await db.prepare(`SELECT id, name, description, room_type AS roomType,
      display_order AS displayOrder, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
      FROM rooms WHERE household_id = ? ${includeArchived ? "" : "AND is_active = 1"} ORDER BY is_active DESC, display_order, created_at`)
      .bind(identity.householdId).all();
    const occupants = await db.prepare(`SELECT room_id AS roomId, member_id AS memberId
      FROM room_occupants WHERE household_id = ? ORDER BY created_at`).bind(identity.householdId).all<{
        roomId: string; memberId: string
      }>();
    const routines = await db.prepare(`SELECT id, room_id AS roomId, name, status FROM household_systems
      WHERE household_id = ? AND room_id IS NOT NULL AND status != 'archived' ORDER BY name`).bind(identity.householdId).all<{
        id: string; roomId: string; name: string; status: string
      }>();
    return success({ rooms: rows.results.map((room) => ({
      ...room, occupantMemberIds: occupants.results.filter(({ roomId }) => roomId === room.id).map(({ memberId }) => memberId),
      routines: routines.results.filter(({ roomId }) => roomId === room.id).map(({ id, name, status }) => ({ id, name, status }))
    })) }, requestId);
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
    const description = optionalText(body, "description", 500);
    const occupants = await occupantIds(db, identity.householdId, body); const now = new Date().toISOString();
    const order = await db.prepare("SELECT COALESCE(MAX(display_order), -1) + 1 AS value FROM rooms WHERE household_id = ? AND is_active = 1")
      .bind(identity.householdId).first<{ value: number }>();
    const id = crypto.randomUUID();
    try {
      await db.batch([
        db.prepare("INSERT INTO rooms (id, household_id, name, description, room_type, display_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)")
          .bind(id, identity.householdId, name, description, storageRoomType(roomType), order?.value ?? 0, now, now),
        ...occupants.map((memberId) => db.prepare(`INSERT INTO room_occupants
          (household_id, room_id, member_id, created_at) VALUES (?, ?, ?, ?)`)
          .bind(identity.householdId, id, memberId, now))
      ]);
    } catch (error) {
      if (String(error).includes("UNIQUE constraint")) throw conflictError("An active Room with that name already exists.");
      throw error;
    }
    if (identity.setupStatus === "complete") await generateRoutineDraft(db, identity.householdId);
    return success({ room: { id, name, description, roomType, displayOrder: order?.value ?? 0,
      occupantMemberIds: occupants } }, requestId, { status: 201 });
  });
}
export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET or POST"); });
}
