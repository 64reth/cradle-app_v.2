import { cookie, createSession, hashPin, verifyPin } from "../../auth";
import { ApiError, conflictError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../../http";
import { accountFields, findPublicInvite, publicInviteState } from "../../invites";
import { recordAuthEvent } from "../../auth-provider";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv; params: { reference: string } };

export async function onRequestPost({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const body = await parseJsonBody(request);
    const rawInvite = await findPublicInvite(db, params.reference);
    if (!rawInvite) throw new ApiError(404, "INVITE_NOT_FOUND", "This invitation could not be found.");
    if (rawInvite.revokedAt) throw new ApiError(410, "INVITE_REVOKED", "This invitation has been revoked.");
    if (rawInvite.expiresAt <= new Date().toISOString()) throw new ApiError(410, "INVITE_EXPIRED", "This invitation has expired.");
    const fields = accountFields(body);

    if (rawInvite.acceptedAt && rawInvite.acceptedAccountId && rawInvite.targetMemberId) {
      const account = await db.prepare(`SELECT pin_hash AS pinHash, pin_salt AS pinSalt FROM user_accounts
        WHERE id = ? AND account_reference = ? AND is_active = 1`)
        .bind(rawInvite.acceptedAccountId, fields.accountReference).first<{ pinHash: string; pinSalt: string }>();
      if (!account || !(await verifyPin(fields.pin, account.pinSalt, account.pinHash))) {
        throw conflictError("This invitation has already been accepted.");
      }
      const session = await createSession(db, rawInvite.householdId, rawInvite.targetMemberId, rawInvite.acceptedAccountId);
      await recordAuthEvent(db, { accountId: rawInvite.acceptedAccountId, householdId: rawInvite.householdId,
        memberId: rawInvite.targetMemberId, eventName: "invitation_accepted", result: "success", requestId });
      return success({ accepted: true, repeated: true, destination: "/dashboard" }, requestId, {
        headers: { "Set-Cookie": cookie(session.token, env) }
      });
    }
    const invite = publicInviteState(rawInvite);
    const pinData = await hashPin(fields.pin); const now = new Date().toISOString();
    if (invite.inviteType === "profile") {
      if (!invite.targetMemberId || invite.targetAccountId) throw conflictError("That family member has already joined.");
      const accountId = crypto.randomUUID();
      try {
        const results = await db.batch([
          db.prepare(`INSERT INTO user_accounts
            (id, account_reference, display_name, pin_hash, pin_salt, is_active, created_at, updated_at)
            SELECT ?, ?, ?, ?, ?, 1, ?, ? WHERE EXISTS (
              SELECT 1 FROM household_invites i JOIN members m
                ON m.household_id = i.household_id AND m.id = i.target_member_id
              WHERE i.household_id = ? AND i.id = ? AND i.revoked_at IS NULL AND i.accepted_at IS NULL
                AND i.expires_at > ? AND i.use_count < i.max_uses AND m.account_id IS NULL
            )`)
            .bind(accountId, fields.accountReference, fields.displayName, pinData.hash, pinData.salt, now, now,
              invite.householdId, invite.id, now),
          db.prepare(`UPDATE members SET account_id = ?, lifecycle_state = 'active', display_name = ?,
            pin_hash = NULL, pin_salt = NULL, updated_at = ?
            WHERE household_id = ? AND id = ? AND account_id IS NULL`)
            .bind(accountId, fields.displayName, now, invite.householdId, invite.targetMemberId),
          db.prepare(`UPDATE household_invites SET use_count = use_count + 1, accepted_at = ?,
            accepted_account_id = ?, updated_at = ?
            WHERE household_id = ? AND id = ? AND revoked_at IS NULL AND accepted_at IS NULL
              AND expires_at > ? AND use_count < max_uses`)
            .bind(now, accountId, now, invite.householdId, invite.id, now)
        ]);
        if (results.some(({ meta }) => meta.changes !== 1)) throw new Error("invite acceptance race");
      } catch (error) {
        if (String(error).includes("UNIQUE constraint") || String(error).includes("acceptance race")) {
          throw conflictError("This invitation changed while it was being accepted. Try signing in or ask for a new invitation.");
        }
        throw error;
      }
      try {
        await db.prepare("INSERT OR IGNORE INTO profiles (account_id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)")
          .bind(accountId, fields.displayName, now, now).run();
        await db.prepare("INSERT OR IGNORE INTO profile_preferences (account_id, preferences_json, created_at, updated_at) VALUES (?, '{}', ?, ?)")
          .bind(accountId, now, now).run();
      } catch { /* Profiles are introduced additively; legacy acceptance remains compatible. */ }
      const session = await createSession(db, invite.householdId, invite.targetMemberId, accountId);
      await recordAuthEvent(db, { accountId, householdId: invite.householdId, memberId: invite.targetMemberId,
        eventName: "invitation_accepted", result: "success", requestId });
      return success({ accepted: true, repeated: false, destination: "/dashboard" }, requestId, {
        status: 201, headers: { "Set-Cookie": cookie(session.token, env) }
      });
    }

    const requestedMemberId = typeof body.requestedMemberId === "string" && body.requestedMemberId ? body.requestedMemberId : null;
    if (requestedMemberId) {
      const target = await db.prepare(`SELECT account_id AS accountId, lifecycle_state AS lifecycleState
        FROM members WHERE household_id = ? AND id = ? AND is_active = 1`)
        .bind(invite.householdId, requestedMemberId).first<{ accountId: string | null; lifecycleState: string }>();
      if (!target || target.accountId || !["managed", "unclaimed", "invited"].includes(target.lifecycleState)) {
        throw validationError("That family member is not available to join.");
      }
    }
    const proposedName = requestedMemberId ? null : fields.displayName;
    const existingAccount = await db.prepare(`SELECT id, pin_hash AS pinHash, pin_salt AS pinSalt
      FROM user_accounts WHERE account_reference = ?`).bind(fields.accountReference)
      .first<{ id: string; pinHash: string; pinSalt: string }>();
    const accountId = existingAccount?.id || crypto.randomUUID();
    if (existingAccount && !(await verifyPin(fields.pin, existingAccount.pinSalt, existingAccount.pinHash))) {
      throw conflictError("Those account details are already in use.");
    }
    const existingRequest = existingAccount && await db.prepare(`SELECT id FROM household_join_requests
      WHERE household_id = ? AND account_id = ? AND status = 'pending'`)
      .bind(invite.householdId, existingAccount.id).first<{ id: string }>();
    if (existingRequest) return success({ joinRequested: true, repeated: true, destination: "/" }, requestId);
    const joinRequestId = crypto.randomUUID();
    const statements = [
      ...(existingAccount ? [] : [db.prepare(`INSERT INTO user_accounts
        (id, account_reference, display_name, pin_hash, pin_salt, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)`)
        .bind(accountId, fields.accountReference, fields.displayName, pinData.hash, pinData.salt, now, now)]),
      db.prepare(`INSERT INTO household_join_requests
        (id, household_id, account_id, invite_id, requested_member_id, proposed_display_name,
          status, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, 'pending', ?, ? WHERE EXISTS (
          SELECT 1 FROM household_invites WHERE household_id = ? AND id = ?
            AND revoked_at IS NULL AND expires_at > ? AND use_count < max_uses
        )`)
        .bind(joinRequestId, invite.householdId, accountId, invite.id, requestedMemberId, proposedName, now, now,
          invite.householdId, invite.id, now),
      db.prepare(`UPDATE household_invites SET use_count = use_count + 1, updated_at = ?
        WHERE household_id = ? AND id = ? AND revoked_at IS NULL AND expires_at > ? AND use_count < max_uses`)
        .bind(now, invite.householdId, invite.id, now),
      ...(requestedMemberId ? [db.prepare(`UPDATE members SET lifecycle_state = 'join_requested', updated_at = ?
        WHERE household_id = ? AND id = ? AND account_id IS NULL`)
        .bind(now, invite.householdId, requestedMemberId)] : [])
    ];
    const results = await db.batch(statements);
    const joinIndex = existingAccount ? 0 : 1;
    if (results[joinIndex].meta.changes !== 1 || results[joinIndex + 1].meta.changes !== 1) {
      throw conflictError("This invitation changed while the request was being sent. Ask for a new invitation.");
    }
    if (!existingAccount) {
      try {
        await db.prepare("INSERT OR IGNORE INTO profiles (account_id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)")
          .bind(accountId, fields.displayName, now, now).run();
        await db.prepare("INSERT OR IGNORE INTO profile_preferences (account_id, preferences_json, created_at, updated_at) VALUES (?, '{}', ?, ?)")
          .bind(accountId, now, now).run();
      } catch { /* Compatibility with databases before the operations migration. */ }
    }
    await recordAuthEvent(db, { accountId, householdId: invite.householdId, eventName: "invitation_accepted", result: "success", requestId });
    return success({ joinRequested: true, repeated: false, destination: "/" }, requestId, { status: 202 });
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
