import { cookie, createSession, textField } from "../../auth";
import { authenticateIdentity, recordAuthEvent, type AuthProvider } from "../../auth-provider";
import { ApiError, conflictError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../../http";
import { findPublicInvite, publicInviteState } from "../../invites";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv; params: { reference: string } };

function sessionMethod(provider: "google" | "apple" | "email" | null): "google" | "apple" | "email_otp" {
  return provider === "google" ? "google" : provider === "apple" ? "apple" : "email_otp";
}

export async function onRequestPost({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env);
    const body = await parseJsonBody(request);
    const invite = publicInviteState(await findPublicInvite(db, params.reference));
    if (invite.acceptedAt || invite.useCount >= invite.maxUses) {
      throw new ApiError(410, "INVITE_USED", "This invitation has already been used.");
    }

    // Provider exchange is the only account-provisioning boundary. Invitation
    // acceptance consumes that authenticated account; it never creates another
    // account or credential.
    const identity = await authenticateIdentity(request, db);
    const providerRow = await db.prepare(`SELECT provider FROM auth_identities
      WHERE account_id = ? ORDER BY last_seen_at DESC LIMIT 1`)
      .bind(identity.accountId).first<{ provider: AuthProvider }>();
    const provider = providerRow?.provider || null;
    const now = new Date().toISOString();

    if (invite.inviteType === "profile") {
      if (!invite.targetMemberId || invite.targetAccountId) {
        throw conflictError("That family member has already joined.");
      }
      let results;
      try {
        results = await db.batch([
          db.prepare(`UPDATE members SET account_id = ?, lifecycle_state = 'active',
            pin_hash = NULL, pin_salt = NULL, updated_at = ?
            WHERE household_id = ? AND id = ? AND account_id IS NULL`)
            .bind(identity.accountId, now, invite.householdId, invite.targetMemberId),
          db.prepare(`UPDATE household_invites SET use_count = use_count + 1, accepted_at = ?,
            accepted_account_id = ?, updated_at = ?
            WHERE household_id = ? AND id = ? AND revoked_at IS NULL AND accepted_at IS NULL
              AND expires_at > ? AND use_count < max_uses`)
            .bind(now, identity.accountId, now, invite.householdId, invite.id, now),
        ]);
      } catch (error) {
        if (String(error).includes("UNIQUE constraint")) {
          throw conflictError("This account has already joined that household.");
        }
        throw error;
      }
      if (results.some(({ meta }) => meta.changes !== 1)) {
        throw conflictError("This invitation changed while it was being accepted. Ask for a new invitation.");
      }
      const session = await createSession(
        db, invite.householdId, invite.targetMemberId, identity.accountId, sessionMethod(provider)
      );
      await recordAuthEvent(db, {
        accountId: identity.accountId, householdId: invite.householdId, memberId: invite.targetMemberId,
        eventName: "invitation_accepted", provider, result: "success", requestId,
      });
      return success({ accepted: true, destination: "/dashboard" }, requestId, {
        status: 201,
        headers: { "Set-Cookie": cookie(session.token, env) },
      });
    }

    const requestedMemberId = typeof body.requestedMemberId === "string" && body.requestedMemberId
      ? body.requestedMemberId
      : null;
    if (requestedMemberId) {
      const target = await db.prepare(`SELECT account_id AS accountId, lifecycle_state AS lifecycleState
        FROM members WHERE household_id = ? AND id = ? AND is_active = 1`)
        .bind(invite.householdId, requestedMemberId)
        .first<{ accountId: string | null; lifecycleState: string }>();
      if (!target || target.accountId || !["managed", "unclaimed", "invited"].includes(target.lifecycleState)) {
        throw validationError("That family member is not available to join.");
      }
    }
    const proposedName = requestedMemberId ? null : textField(body, "displayName", 1, 80);
    const existingRequest = await db.prepare(`SELECT id FROM household_join_requests
      WHERE household_id = ? AND account_id = ? AND status = 'pending'`)
      .bind(invite.householdId, identity.accountId).first<{ id: string }>();
    if (existingRequest) return success({ joinRequested: true, repeated: true, destination: "/" }, requestId);

    const joinRequestId = crypto.randomUUID();
    const statements = [
      db.prepare(`INSERT INTO household_join_requests
        (id, household_id, account_id, invite_id, requested_member_id, proposed_display_name,
          status, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, 'pending', ?, ? WHERE EXISTS (
          SELECT 1 FROM household_invites WHERE household_id = ? AND id = ?
            AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at > ? AND use_count < max_uses
        )`)
        .bind(joinRequestId, invite.householdId, identity.accountId, invite.id, requestedMemberId, proposedName, now, now,
          invite.householdId, invite.id, now),
      db.prepare(`UPDATE household_invites SET use_count = use_count + 1, updated_at = ?
        WHERE household_id = ? AND id = ? AND revoked_at IS NULL AND accepted_at IS NULL
          AND expires_at > ? AND use_count < max_uses`)
        .bind(now, invite.householdId, invite.id, now),
      ...(requestedMemberId ? [db.prepare(`UPDATE members SET lifecycle_state = 'join_requested', updated_at = ?
        WHERE household_id = ? AND id = ? AND account_id IS NULL`)
        .bind(now, invite.householdId, requestedMemberId)] : []),
    ];
    const results = await db.batch(statements);
    if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) {
      throw conflictError("This invitation changed while the request was being sent. Ask for a new invitation.");
    }
    await recordAuthEvent(db, {
      accountId: identity.accountId, householdId: invite.householdId,
      eventName: "invitation_accepted", provider, result: "success", requestId,
    });
    return success({ joinRequested: true, repeated: false, destination: "/" }, requestId, { status: 202 });
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
