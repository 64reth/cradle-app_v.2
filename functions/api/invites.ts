import { randomToken, sha256 } from "./auth";
import { ApiError, conflictError, validationError } from "./http";
import type { Identity } from "./auth";
import type { JsonRecord } from "./types";
import {
  isMemberAccessLevel, isMemberAgeBand, legacyRoleForAccess,
  type MemberAccessLevel, type MemberAgeBand
} from "../../shared/members";
import { invitationEligibility } from "../../shared/household-domain";

const expiryHours = (value: unknown): number => value === "24_hours" ? 24 : value === "30_days" ? 720 : value === "7_days" || value === undefined ? 168 : 0;

export async function createHouseholdInvite(
  request: Request, db: D1Database, identity: Identity, body: JsonRecord, replaceInviteId?: string,
  tokenMaterial?: { token: string; code: string }
) {
  const targetMemberId = typeof body.targetMemberId === "string" && body.targetMemberId ? body.targetMemberId : null;
  const hours = expiryHours(body.expiry);
  if (!hours) throw validationError("Please check this invitation.", { expiry: "Choose 24 hours, 7 days, or 30 days" });
  let role: "parent_admin" | "adult" | "child";
  let accessLevel: MemberAccessLevel;
  let ageBand: MemberAgeBand;
  let targetName: string | null = null;
  if (targetMemberId) {
    const member = await db.prepare(`SELECT display_name AS displayName, role,
      access_level AS accessLevel, age_band AS ageBand, account_id AS accountId,
      lifecycle_state AS lifecycleState FROM members
      WHERE household_id = ? AND id = ?`)
      .bind(identity.householdId, targetMemberId)
      .first<{ displayName: string; role: "owner" | "parent_admin" | "adult" | "child";
        accessLevel: MemberAccessLevel; ageBand: MemberAgeBand; accountId: string | null; lifecycleState: string }>();
    if (!member || member.role === "owner") throw new ApiError(404, "NOT_FOUND", "That family member is not available to invite.");
    if (!invitationEligibility(identity, { ...member, id: targetMemberId, householdId: identity.householdId }).allowed) {
      throw conflictError(member.accountId || member.lifecycleState === "active"
        ? `${member.displayName} has already joined.`
        : `${member.displayName} cannot be invited while their access is paused or deactivated.`);
    }
    role = member.role; accessLevel = member.accessLevel; ageBand = member.ageBand; targetName = member.displayName;
  } else {
    if (!isMemberAccessLevel(body.accessLevel)) {
      throw validationError("Please check this invitation.", { accessLevel: "Choose what this person can manage" });
    }
    if (!isMemberAgeBand(body.ageBand)) {
      throw validationError("Please check this invitation.", { ageBand: "Choose an age group" });
    }
    accessLevel = body.accessLevel; ageBand = body.ageBand;
    const compatible = legacyRoleForAccess(accessLevel);
    role = compatible === "owner" ? "parent_admin" : compatible;
  }
  const token = tokenMaterial?.token || randomToken(32);
  const idempotencyKey = request.headers.get("X-Idempotency-Key")?.trim();
  if (idempotencyKey && (idempotencyKey.length < 8 || idempotencyKey.length > 128)) {
    throw validationError("Please retry this invitation.", { idempotencyKey: "Use a valid request key" });
  }
  const stableMaterial = idempotencyKey
    ? `${identity.householdId}:${identity.memberId}:${targetMemberId || "household"}:${idempotencyKey}` : null;
  const stableToken = stableMaterial ? await sha256(`cradle-invite-token:${stableMaterial}`) : token;
  const code = tokenMaterial?.code || (stableMaterial
    ? (await sha256(`cradle-invite-code:${stableMaterial}`)).slice(0, 10).toUpperCase()
    : randomToken(5).toUpperCase());
  const [tokenHash, codeHash] = await Promise.all([sha256(stableToken), sha256(code)]);
  if (idempotencyKey) {
    const repeated = await db.prepare(`SELECT id, target_member_id AS targetMemberId, expires_at AS expiresAt,
      revoked_at AS revokedAt, accepted_at AS acceptedAt FROM household_invites
      WHERE household_id = ? AND token_hash = ? LIMIT 1`)
      .bind(identity.householdId, tokenHash).first<{
        id: string; targetMemberId: string | null; expiresAt: string;
        revokedAt: string | null; acceptedAt: string | null;
      }>();
    if (repeated && !repeated.revokedAt && !repeated.acceptedAt) {
      return { id: repeated.id, targetMemberId: repeated.targetMemberId, targetName,
        inviteType: repeated.targetMemberId ? "profile" as const : "household" as const,
        role, accessLevel, ageBand, token: stableToken, code,
        inviteUrl: `${new URL(request.url).origin}/invite/${stableToken}`,
        expiresAt: repeated.expiresAt, status: "active" as const,
        deliveryStatus: "not_requested" as const, repeated: true };
    }
  }
  const now = new Date(); const id = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + hours * 60 * 60_000).toISOString();
  try {
    const results = await db.batch([
      ...(replaceInviteId ? [db.prepare(`UPDATE household_invites SET revoked_at = ?, updated_at = ?
        WHERE household_id = ? AND id = ? AND accepted_at IS NULL`)
        .bind(now.toISOString(), now.toISOString(), identity.householdId, replaceInviteId)] : []),
      db.prepare(`INSERT INTO household_invites
        (id, household_id, target_member_id, token_hash, short_code_hash, invite_type, invited_role,
          created_by_member_id, expires_at, max_uses, use_count, created_at, updated_at,
          invited_access_level, invited_age_band)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`)
        .bind(id, identity.householdId, targetMemberId, tokenHash, codeHash, targetMemberId ? "profile" : "household",
          role, identity.memberId, expiresAt, targetMemberId ? 1 : 10, now.toISOString(), now.toISOString(),
          accessLevel, ageBand),
      ...(targetMemberId ? [db.prepare(`UPDATE members SET lifecycle_state = 'invited', is_active = 1, updated_at = ?
        WHERE household_id = ? AND id = ? AND account_id IS NULL`)
        .bind(now.toISOString(), identity.householdId, targetMemberId)] : [])
    ]);
    const insertIndex = replaceInviteId ? 1 : 0;
    if (results[insertIndex]?.meta.changes !== 1) {
      throw conflictError("The invitation changed before it could be saved. Refresh and try again.");
    }
  } catch (error) {
    if (String(error).includes("UNIQUE constraint")) throw conflictError("An active invitation already exists. Revoke or regenerate it first.");
    throw error;
  }
  const inviteUrl = `${new URL(request.url).origin}/invite/${stableToken}`;
  return { id, targetMemberId, targetName, inviteType: targetMemberId ? "profile" as const : "household" as const,
    role, accessLevel, ageBand, token: stableToken, code, inviteUrl, expiresAt, status: "active" as const,
    deliveryStatus: "not_requested" as const };
}

export async function findPublicInvite(db: D1Database, reference: string) {
  const clean = decodeURIComponent(reference).trim();
  const [tokenHash, codeHash] = await Promise.all([sha256(clean), sha256(clean.toUpperCase())]);
  return db.prepare(`SELECT i.id, i.household_id AS householdId, i.target_member_id AS targetMemberId,
    i.invite_type AS inviteType, i.invited_role AS role,
    i.invited_access_level AS accessLevel, i.invited_age_band AS ageBand, i.expires_at AS expiresAt,
    i.max_uses AS maxUses, i.use_count AS useCount, i.revoked_at AS revokedAt, i.accepted_at AS acceptedAt,
    i.accepted_account_id AS acceptedAccountId, h.name AS householdName,
    m.display_name AS targetName, m.account_id AS targetAccountId, m.lifecycle_state AS targetLifecycleState
    FROM household_invites i
    JOIN households h ON h.id = i.household_id
    LEFT JOIN members m ON m.household_id = i.household_id AND m.id = i.target_member_id
    WHERE i.token_hash = ? OR i.short_code_hash = ? LIMIT 1`)
    .bind(tokenHash, codeHash).first<{
      id: string; householdId: string; targetMemberId: string | null; inviteType: "profile" | "household";
      role: "parent_admin" | "adult" | "child"; accessLevel: MemberAccessLevel; ageBand: MemberAgeBand;
      expiresAt: string; maxUses: number; useCount: number;
      revokedAt: string | null; acceptedAt: string | null; acceptedAccountId: string | null;
      householdName: string; targetName: string | null; targetAccountId: string | null; targetLifecycleState: string | null;
    }>();
}

export function publicInviteState(invite: Awaited<ReturnType<typeof findPublicInvite>>) {
  if (!invite) throw new ApiError(404, "INVITE_NOT_FOUND", "This invitation could not be found.");
  if (invite.revokedAt) throw new ApiError(410, "INVITE_REVOKED", "This invitation has been revoked.");
  if (invite.expiresAt <= new Date().toISOString()) throw new ApiError(410, "INVITE_EXPIRED", "This invitation has expired.");
  if (!invite.acceptedAt && invite.useCount >= invite.maxUses) throw new ApiError(410, "INVITE_USED", "This invitation has already been used.");
  return invite;
}
