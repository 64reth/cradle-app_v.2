export const CANONICAL_MEMBERS_SQL = `WITH latest_invites AS (
  SELECT i.*, ROW_NUMBER() OVER (
    PARTITION BY i.target_member_id ORDER BY i.created_at DESC, i.id DESC
  ) AS member_rank
  FROM household_invites i
  WHERE i.household_id = ? AND i.target_member_id IS NOT NULL
)
SELECT m.id, m.household_id AS householdId, m.display_name AS displayName,
  m.preferred_name AS preferredName, m.profile_reference AS profileReference, m.role,
  m.access_level AS accessLevel, m.age_band AS ageBand, m.lifecycle_state AS lifecycleState,
  m.is_active AS isActive, m.account_id AS accountId,
  CASE WHEN m.account_id IS NULL THEN 0 ELSE 1 END AS hasAccount,
  a.is_active AS accountIsActive, s.account_status AS accountAccessStatus,
  i.id AS inviteId, i.expires_at AS inviteExpiresAt,
  CASE WHEN i.id IS NULL THEN NULL WHEN i.revoked_at IS NOT NULL THEN 'revoked'
    WHEN i.accepted_at IS NOT NULL THEN 'accepted' WHEN i.expires_at <= ? THEN 'expired' ELSE 'pending' END AS invitationStatus,
  'unknown' AS presence,
  CASE WHEN m.role != 'owner' THEN 1 ELSE 0 END AS canManage,
  CASE WHEN m.role != 'owner' AND m.account_id IS NOT NULL AND m.lifecycle_state != 'suspended' THEN 1 ELSE 0 END AS canPause,
  CASE WHEN m.role != 'owner' AND (m.lifecycle_state = 'suspended' OR a.is_active = 0 OR s.account_status = 'suspended') THEN 1 ELSE 0 END AS canRestore,
  CASE WHEN m.role != 'owner' AND m.account_id IS NULL AND m.lifecycle_state NOT IN ('active','suspended','left')
    AND (i.id IS NULL OR i.revoked_at IS NOT NULL OR (i.accepted_at IS NULL AND i.expires_at <= ?)) THEN 1 ELSE 0 END AS canInvite,
  c.id AS avatarId, c.fur_palette_key AS avatarFurPaletteKey,
  c.patch_primary_palette_key AS avatarPatchPrimaryPaletteKey,
  c.patch_secondary_palette_key AS avatarPatchSecondaryPaletteKey, c.expression_key AS avatarExpressionKey
FROM members m
LEFT JOIN user_accounts a ON a.id = m.account_id
LEFT JOIN account_security s ON s.account_id = m.account_id
LEFT JOIN latest_invites i ON i.household_id = m.household_id AND i.target_member_id = m.id AND i.member_rank = 1
LEFT JOIN member_companions c ON c.household_id = m.household_id AND c.member_id = m.id AND c.is_active = 1
WHERE m.household_id = ?
ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'parent_admin' THEN 1 WHEN 'adult' THEN 2 ELSE 3 END, m.created_at, m.id`;

export async function canonicalHouseholdMembers(db: D1Database, householdId: string) {
  const now = new Date().toISOString();
  return db.prepare(CANONICAL_MEMBERS_SQL).bind(householdId, now, now, householdId).all<Record<string, unknown>>();
}

