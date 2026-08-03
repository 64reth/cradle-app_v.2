import { authenticate, slug, textField } from "../../auth";
import { conflictError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../../http";
import { requireFamilyManager } from "../../member-policy";
import { requireSetupOwner } from "../../setup";
import type { CradleEnv } from "../../types";
import {
  isMemberAccessLevel, isMemberAgeBand, legacyAgeGroupForBand, legacyRoleForAccess
} from "../../../../shared/members";

type Context = { request: Request; env: CradleEnv };

export const FAMILY_MEMBERS_SQL = `WITH latest_invites AS (
  SELECT i.*, ROW_NUMBER() OVER (
    PARTITION BY i.target_member_id ORDER BY i.created_at DESC, i.id DESC
  ) AS member_rank
  FROM household_invites i
  WHERE i.household_id = ? AND i.target_member_id IS NOT NULL
)
  SELECT m.id, m.display_name AS displayName, m.preferred_name AS preferredName,
  m.profile_reference AS profileReference, m.role, m.access_level AS accessLevel,
  m.age_band AS ageBand, m.lifecycle_state AS lifecycleState, m.is_active AS isActive,
  CASE WHEN m.account_id IS NULL THEN 0 ELSE 1 END AS hasAccount,
  a.is_active AS accountIsActive, s.account_status AS accountAccessStatus,
  i.id AS inviteId, i.expires_at AS inviteExpiresAt,
  CASE WHEN i.id IS NULL THEN NULL
    WHEN i.revoked_at IS NOT NULL THEN 'revoked'
    WHEN i.accepted_at IS NOT NULL THEN 'accepted'
    WHEN i.expires_at <= ? THEN 'expired'
    ELSE 'pending' END AS invitationStatus,
  CASE WHEN m.role != 'owner' THEN 1 ELSE 0 END AS canManage,
  CASE WHEN m.role != 'owner' AND m.account_id IS NOT NULL
    AND m.lifecycle_state != 'suspended' THEN 1 ELSE 0 END AS canPause,
  CASE WHEN m.role != 'owner' AND (
    m.lifecycle_state = 'suspended' OR a.is_active = 0 OR s.account_status = 'suspended'
  ) THEN 1 ELSE 0 END AS canRestore,
  CASE WHEN m.role != 'owner' AND m.account_id IS NULL
    AND (i.id IS NULL OR i.revoked_at IS NOT NULL OR (i.accepted_at IS NULL AND i.expires_at <= ?))
    THEN 1 ELSE 0 END AS canInvite,
  c.id AS avatarId, c.fur_palette_key AS avatarFurPaletteKey,
  c.patch_primary_palette_key AS avatarPatchPrimaryPaletteKey,
  c.patch_secondary_palette_key AS avatarPatchSecondaryPaletteKey,
  c.expression_key AS avatarExpressionKey
  FROM members m
  LEFT JOIN user_accounts a ON a.id = m.account_id
  LEFT JOIN account_security s ON s.account_id = m.account_id
  LEFT JOIN latest_invites i ON i.household_id = m.household_id
    AND i.target_member_id = m.id AND i.member_rank = 1
  LEFT JOIN member_companions c ON c.household_id = m.household_id
    AND c.member_id = m.id AND c.is_active = 1
  WHERE m.household_id = ?
  ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'parent_admin' THEN 1 WHEN 'adult' THEN 2 ELSE 3 END,
    m.created_at, m.id`;

export async function familyMembers(db: D1Database, householdId: string) {
  const now = new Date().toISOString();
  return db.prepare(FAMILY_MEMBERS_SQL)
    .bind(householdId, now, now, householdId).all<Record<string, unknown>>();
}

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const result = await familyMembers(db, identity.householdId);
    return success({ members: result.results }, requestId);
  });
}

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    if (identity.setupStatus === "complete") requireFamilyManager(identity); else requireSetupOwner(identity);
    const body = await parseJsonBody(request);
    const displayName = textField(body, "displayName", 1, 80);
    if (!isMemberAccessLevel(body.accessLevel)) {
      throw validationError("Please check this family member.", { accessLevel: "Choose what this person can manage" });
    }
    if (!isMemberAgeBand(body.ageBand)) {
      throw validationError("Please check this family member.", { ageBand: "Choose an age group" });
    }
    const clientKey = textField(body, "clientKey", 8, 100);
    const role = legacyRoleForAccess(body.accessLevel);
    const ageGroup = legacyAgeGroupForBand(body.ageBand);
    const lifecycle = body.accessLevel === "managed_member" ? "managed" : "unclaimed";
    const existing = await db.prepare(`SELECT id, display_name AS displayName, role,
      access_level AS accessLevel, age_band AS ageBand,
      lifecycle_state AS lifecycleState FROM members WHERE household_id = ? AND client_key = ?`)
      .bind(identity.householdId, clientKey).first();
    if (existing) return success({ member: existing, created: false }, requestId);
    const duplicate = await db.prepare(`SELECT id, display_name AS displayName
      FROM members WHERE household_id = ? AND lower(trim(display_name)) = lower(trim(?)) LIMIT 1`)
      .bind(identity.householdId, displayName).first<{ id: string; displayName: string }>();
    if (duplicate) {
      throw conflictError(`${duplicate.displayName} is already a family member. Manage their existing profile instead.`, {
        existingMemberId: duplicate.id, existingMemberName: duplicate.displayName
      });
    }
    const baseReference = slug(displayName);
    if (!baseReference) throw validationError("Please check this family member.", { displayName: "Use letters or numbers" });
    const id = crypto.randomUUID(); const now = new Date().toISOString();
    try {
      await db.prepare(`INSERT INTO members
        (id, household_id, display_name, role, is_active, created_at, updated_at, profile_reference,
          lifecycle_state, age_group, relationship_label, client_key, access_level, age_band)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`)
        .bind(id, identity.householdId, displayName, role, now, now,
          `${baseReference}-${id.slice(0, 4)}`, lifecycle, ageGroup, clientKey,
          body.accessLevel, body.ageBand).run();
    } catch (error) {
      if (String(error).includes("UNIQUE constraint")) {
        const racedDuplicate = await db.prepare(`SELECT id, display_name AS displayName
          FROM members WHERE household_id = ? AND lower(trim(display_name)) = lower(trim(?)) LIMIT 1`)
          .bind(identity.householdId, displayName).first<{ id: string; displayName: string }>();
        throw conflictError(
          racedDuplicate
            ? `${racedDuplicate.displayName} is already a family member. Manage their existing profile instead.`
            : "That family member already exists.",
          racedDuplicate ? {
            existingMemberId: racedDuplicate.id, existingMemberName: racedDuplicate.displayName
          } : undefined
        );
      }
      throw error;
    }
    return success({ member: { id, displayName, profileReference: `${baseReference}-${id.slice(0, 4)}`,
      role, accessLevel: body.accessLevel, ageBand: body.ageBand,
      lifecycleState: lifecycle }, created: true }, requestId, { status: 201 });
  });
}

export async function onRequest(context: Context): Promise<Response> {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET or POST"); });
}
