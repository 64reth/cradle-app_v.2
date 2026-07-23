import { authenticate } from "../../auth";
import { ApiError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../http";
import { requireStep, setupState } from "../../setup";
import type { CradleEnv } from "../../types";
import { FUR_PALETTE, PATCH_PRIMARY_PALETTE, PATCH_SECONDARY_PALETTE, isCompanionExpression, paletteHas } from "../../../../shared/companion";
type Context = { request: Request; env: CradleEnv };
export async function onRequestPost({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    await parseJsonBody(request); await requireStep(db, identity, "review");
    const state = await setupState(db, identity.householdId);
    const room = await db.prepare("SELECT id FROM rooms WHERE household_id = ? AND is_active = 1 LIMIT 1").bind(identity.householdId).first();
    const companion = await db.prepare(`SELECT id, name, fur_palette_key AS furPaletteKey,
      patch_primary_palette_key AS patchPrimaryPaletteKey, patch_secondary_palette_key AS patchSecondaryPaletteKey,
      expression_key AS expressionKey FROM companions WHERE household_id = ? AND is_active = 1 LIMIT 1`)
      .bind(identity.householdId).first<{ id: string; name: string; furPaletteKey: string; patchPrimaryPaletteKey: string;
        patchSecondaryPaletteKey: string; expressionKey: string }>();
    const validCompanion = companion && companion.name.trim().length >= 1 && companion.name.trim().length <= 80 &&
      paletteHas(FUR_PALETTE, companion.furPaletteKey) && paletteHas(PATCH_PRIMARY_PALETTE, companion.patchPrimaryPaletteKey) &&
      paletteHas(PATCH_SECONDARY_PALETTE, companion.patchSecondaryPaletteKey) && isCompanionExpression(companion.expressionKey);
    if (!state?.leadershipConfirmedAt || !state.membershipReviewedAt || !room || !validCompanion) {
      throw new ApiError(409, "SETUP_INCOMPLETE", "Complete leadership, membership, Rooms and Companion first.");
    }
    const owner = await db.prepare("SELECT id FROM members WHERE household_id = ? AND id = ? AND role = 'owner' AND is_active = 1")
      .bind(identity.householdId, identity.memberId).first();
    if (!owner) throw new ApiError(403, "AUTHORIZATION_ERROR", "Only the active Owner can complete setup.");
    const now = new Date().toISOString();
    await db.prepare("UPDATE households SET setup_status = 'complete', setup_step = 'complete', setup_completed_at = ?, updated_at = ? WHERE id = ? AND setup_status = 'incomplete'")
      .bind(now, now, identity.householdId).run();
    return success({ status: "complete", completedAt: now }, requestId);
  });
}
export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
