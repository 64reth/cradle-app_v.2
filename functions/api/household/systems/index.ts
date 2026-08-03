import { authenticate } from "../../auth";
import { handleApiRequest, methodNotAllowed, requireD1, success, validationError } from "../../http";
import { routineSummaries } from "../../routines";
import { requireSystemsViewer } from "../../setup";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestGet({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); const scope = requireSystemsViewer(identity);
    const requested = new URL(request.url).searchParams.get("status");
    if (requested && !["active", "paused", "archived", "all"].includes(requested)) {
      throw validationError("Choose a supported routine filter.");
    }
    const status = scope === "active" ? "active" : requested && requested !== "all" ? requested : undefined;
    const [routines, members, rooms] = await Promise.all([
      routineSummaries(db, identity.householdId, status),
      db.prepare(`SELECT m.id, m.display_name AS displayName, m.role,
        m.access_level AS accessLevel, m.age_band AS ageBand,
        m.lifecycle_state AS lifecycleState,
        c.id AS avatarId, c.fur_palette_key AS avatarFurPaletteKey,
        c.patch_primary_palette_key AS avatarPatchPrimaryPaletteKey,
        c.patch_secondary_palette_key AS avatarPatchSecondaryPaletteKey,
        c.expression_key AS avatarExpressionKey
        FROM members m
        LEFT JOIN member_companions c ON c.household_id = m.household_id AND c.member_id = m.id AND c.is_active = 1
        WHERE m.household_id = ? AND m.is_active = 1
          AND m.lifecycle_state NOT IN ('left','suspended') ORDER BY m.display_name`)
        .bind(identity.householdId).all(),
      db.prepare(`SELECT id, name, room_type AS roomType FROM rooms
        WHERE household_id = ? AND is_active = 1 ORDER BY display_order, created_at`).bind(identity.householdId).all()
    ]);
    return success({ routines, members: members.results, rooms: rooms.results, canManage: scope === "all" }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET"); });
}
