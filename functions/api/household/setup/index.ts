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
    const [members, rooms, pets, companion] = await Promise.all([
      db.prepare("SELECT display_name AS displayName, profile_reference AS profileReference, role FROM members WHERE household_id = ? AND is_active = 1 ORDER BY created_at").bind(identity.householdId).all(),
      db.prepare("SELECT id, name, description, display_order AS displayOrder FROM rooms WHERE household_id = ? AND is_active = 1 ORDER BY display_order, created_at").bind(identity.householdId).all(),
      db.prepare("SELECT id, name, pet_type AS petType, breed, notes FROM pets WHERE household_id = ? AND is_active = 1 ORDER BY created_at").bind(identity.householdId).all(),
      db.prepare(`SELECT id, name, fur_palette_key AS furPaletteKey, patch_primary_palette_key AS patchPrimaryPaletteKey,
        patch_secondary_palette_key AS patchSecondaryPaletteKey, expression_key AS expressionKey
        FROM companions WHERE household_id = ? AND is_active = 1 LIMIT 1`).bind(identity.householdId).first()
    ]);
    return success({ state, canConfigure: identity.role === "owner",
      household: { name: identity.householdName, reference: identity.householdReference },
      lead: { displayName: identity.displayName, profileReference: identity.profileReference, role: identity.role },
      members: members.results, rooms: rooms.results, pets: pets.results, companion }, requestId);
  });
}
export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET"); });
}
