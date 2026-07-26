import {
  COMPANION_EXPRESSIONS, FUR_PALETTE, PATCH_PRIMARY_PALETTE, PATCH_SECONDARY_PALETTE,
  isCompanionExpression, paletteHas
} from "../../shared/companion";
import { validationError } from "./http";
import type { JsonRecord } from "./types";

/**
 * `member_companions` is retained as the canonical legacy persistence table.
 * Its `name` column is populated with the family member's display name for
 * schema compatibility, but is never treated as a separate avatar identity.
 */
export const memberAvatarSelect = `SELECT id, member_id AS memberId,
  fur_palette_key AS furPaletteKey,
  patch_primary_palette_key AS patchPrimaryPaletteKey,
  patch_secondary_palette_key AS patchSecondaryPaletteKey,
  expression_key AS expressionKey FROM member_companions
  WHERE household_id = ? AND member_id = ? AND is_active = 1 LIMIT 1`;

export function parseMemberAvatar(body: JsonRecord) {
  if (!paletteHas(FUR_PALETTE, body.furPaletteKey)) {
    throw validationError("Please check your avatar.", { furPaletteKey: "Choose a supported fur colour" });
  }
  if (!paletteHas(PATCH_PRIMARY_PALETTE, body.patchPrimaryPaletteKey)) {
    throw validationError("Please check your avatar.", { patchPrimaryPaletteKey: "Choose a supported first patch colour" });
  }
  if (!paletteHas(PATCH_SECONDARY_PALETTE, body.patchSecondaryPaletteKey)) {
    throw validationError("Please check your avatar.", { patchSecondaryPaletteKey: "Choose a supported second patch colour" });
  }
  if (!isCompanionExpression(body.expressionKey)) {
    throw validationError("Please check your avatar.", { expressionKey: "Choose a supported expression" });
  }
  return {
    furPaletteKey: body.furPaletteKey,
    patchPrimaryPaletteKey: body.patchPrimaryPaletteKey,
    patchSecondaryPaletteKey: body.patchSecondaryPaletteKey,
    expressionKey: body.expressionKey
  };
}

export async function upsertMemberAvatar(
  db: D1Database, householdId: string, memberId: string, displayName: string, body: JsonRecord
) {
  const avatar = parseMemberAvatar(body); const now = new Date().toISOString();
  await db.prepare(`INSERT INTO member_companions
    (id, household_id, member_id, name, fur_palette_key, patch_primary_palette_key,
      patch_secondary_palette_key, expression_key, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(household_id, member_id) WHERE is_active = 1 DO UPDATE SET
      name = excluded.name, fur_palette_key = excluded.fur_palette_key,
      patch_primary_palette_key = excluded.patch_primary_palette_key,
      patch_secondary_palette_key = excluded.patch_secondary_palette_key,
      expression_key = excluded.expression_key, updated_at = excluded.updated_at`)
    .bind(crypto.randomUUID(), householdId, memberId, displayName, avatar.furPaletteKey,
      avatar.patchPrimaryPaletteKey, avatar.patchSecondaryPaletteKey, avatar.expressionKey, now, now).run();
  return db.prepare(memberAvatarSelect).bind(householdId, memberId).first();
}

export const memberAvatarOptions = {
  palettes: { fur: FUR_PALETTE, patchPrimary: PATCH_PRIMARY_PALETTE, patchSecondary: PATCH_SECONDARY_PALETTE },
  expressions: COMPANION_EXPRESSIONS
};
