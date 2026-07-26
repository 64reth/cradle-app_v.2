import { authenticate } from "../../auth";
import { handleApiRequest, methodNotAllowed, requireD1, success } from "../../http";
import { setupState } from "../../setup";
import type { CradleEnv } from "../../types";
type Context = { request: Request; env: CradleEnv };

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env);
    const identity = await authenticate(request, db);
    const state = await setupState(db, identity.householdId);
    if (state?.status === "incomplete" && identity.role !== "owner") {
      return success({ state, canConfigure: false,
        household: { name: identity.householdName, reference: identity.householdReference },
        lead: { displayName: identity.displayName, role: identity.role }, members: [], rooms: [], pets: [] }, requestId);
    }
    const [members, rooms, pets] = await Promise.all([
      db.prepare(`SELECT m.id, m.display_name AS displayName, m.profile_reference AS profileReference, m.role,
        m.lifecycle_state AS lifecycleState, m.access_level AS accessLevel, m.age_band AS ageBand,
        CASE WHEN m.account_id IS NULL THEN 0 ELSE 1 END AS hasAccount,
        c.id AS avatarId, c.fur_palette_key AS avatarFurPaletteKey,
        c.patch_primary_palette_key AS avatarPatchPrimaryPaletteKey,
        c.patch_secondary_palette_key AS avatarPatchSecondaryPaletteKey,
        c.expression_key AS avatarExpressionKey
        FROM members m
        LEFT JOIN member_companions c ON c.household_id = m.household_id
          AND c.member_id = m.id AND c.is_active = 1
        WHERE m.household_id = ? AND m.lifecycle_state != 'left' ORDER BY m.created_at`)
        .bind(identity.householdId).all(),
      db.prepare(`SELECT r.id, r.name, r.description, r.room_type AS roomType, r.display_order AS displayOrder,
        COALESCE('[' || group_concat('"' || ro.member_id || '"') || ']', '[]') AS occupantMemberIdsJson
        FROM rooms r LEFT JOIN room_occupants ro ON ro.household_id = r.household_id AND ro.room_id = r.id
        WHERE r.household_id = ? AND r.is_active = 1 GROUP BY r.id
        ORDER BY r.display_order, r.created_at`).bind(identity.householdId).all(),
      db.prepare("SELECT id, name, pet_type AS petType, breed, notes FROM pets WHERE household_id = ? AND is_active = 1 ORDER BY created_at").bind(identity.householdId).all()
    ]);
    return success({ state, canConfigure: identity.role === "owner",
      household: { name: identity.householdName, reference: identity.householdReference },
      lead: { displayName: identity.displayName, profileReference: identity.profileReference, role: identity.role },
      members: members.results, rooms: rooms.results.map((room) => ({
        ...room, occupantMemberIds: JSON.parse(String(room.occupantMemberIdsJson || "[]"))
      })), pets: pets.results }, requestId);
  });
}
export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET"); });
}
