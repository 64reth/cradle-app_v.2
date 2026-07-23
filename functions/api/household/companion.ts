import {
  COMPANION_EXPRESSIONS, FUR_PALETTE, PATCH_PRIMARY_PALETTE, PATCH_SECONDARY_PALETTE,
  isCompanionExpression, paletteHas
} from "../../../shared/companion";
import { authenticate, textField } from "../auth";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../http";
import { requireHouseholdManager, requireStep } from "../setup";
import type { CradleEnv } from "../types";
type Context = { request: Request; env: CradleEnv };
const select = `SELECT id, name, fur_palette_key AS furPaletteKey,
  patch_primary_palette_key AS patchPrimaryPaletteKey, patch_secondary_palette_key AS patchSecondaryPaletteKey,
  expression_key AS expressionKey FROM companions WHERE household_id = ? AND is_active = 1 LIMIT 1`;

export async function onRequestGet({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const companion = await db.prepare(select).bind(identity.householdId).first();
    return success({ companion, palettes: { fur: FUR_PALETTE, patchPrimary: PATCH_PRIMARY_PALETTE, patchSecondary: PATCH_SECONDARY_PALETTE },
      expressions: COMPANION_EXPRESSIONS }, requestId);
  });
}
export async function onRequestPut({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    if (identity.setupStatus === "incomplete") await requireStep(db, identity, "companion");
    else requireHouseholdManager(identity);
    const body = await parseJsonBody(request); const name = textField(body, "name", 1, 80);
    if (!paletteHas(FUR_PALETTE, body.furPaletteKey)) throw validationError("Please check the submitted fields.", { furPaletteKey: "Choose a supported Fur colour" });
    if (!paletteHas(PATCH_PRIMARY_PALETTE, body.patchPrimaryPaletteKey)) throw validationError("Please check the submitted fields.", { patchPrimaryPaletteKey: "Choose a supported Patch 1 colour" });
    if (!paletteHas(PATCH_SECONDARY_PALETTE, body.patchSecondaryPaletteKey)) throw validationError("Please check the submitted fields.", { patchSecondaryPaletteKey: "Choose a supported Patch 2 colour" });
    if (!isCompanionExpression(body.expressionKey)) throw validationError("Please check the submitted fields.", { expressionKey: "Choose a supported expression" });
    const now = new Date().toISOString(); const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO companions
      (id, household_id, name, fur_palette_key, patch_primary_palette_key, patch_secondary_palette_key, expression_key, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(household_id) WHERE is_active = 1 DO UPDATE SET name = excluded.name,
        fur_palette_key = excluded.fur_palette_key, patch_primary_palette_key = excluded.patch_primary_palette_key,
        patch_secondary_palette_key = excluded.patch_secondary_palette_key, expression_key = excluded.expression_key,
        updated_at = excluded.updated_at`)
      .bind(id, identity.householdId, name, body.furPaletteKey, body.patchPrimaryPaletteKey,
        body.patchSecondaryPaletteKey, body.expressionKey, now, now).run();
    const companion = await db.prepare(select).bind(identity.householdId).first();
    return success({ companion }, requestId);
  });
}
export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "PUT") return onRequestPut(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET or PUT"); });
}
