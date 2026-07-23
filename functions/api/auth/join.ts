import { cookie, createSession, hashPin, pinField, sha256, slug, textField } from "../auth";
import { ApiError, conflictError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../http";
import type { CradleEnv } from "../types";
type Context = { request: Request; env: CradleEnv };

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env);
    const body = await parseJsonBody(request);
    const code = textField(body, "invitationCode", 8, 64).toUpperCase();
    const displayName = textField(body, "displayName", 1, 80);
    const pin = pinField(body);
    if (body.pinConfirmation !== pin) throw validationError("Please check the submitted fields.", { pinConfirmation: "PINs must match" });
    const codeHash = await sha256(code);
    const invitation = await db.prepare(`
      SELECT id, household_id AS householdId, invited_role AS role
      FROM invitation_codes WHERE code_hash = ? AND use_count = 0 AND redeemed_at IS NULL
        AND revoked_at IS NULL AND expires_at > ? LIMIT 1
    `).bind(codeHash, new Date().toISOString()).first<{ id: string; householdId: string; role: string }>();
    if (!invitation) throw new ApiError(400, "INVALID_INVITATION", "That invitation is invalid or no longer available.");
    const memberId = crypto.randomUUID();
    const profileReference = slug(displayName);
    if (!profileReference) throw validationError("Please check the submitted fields.", { displayName: "Use letters or numbers" });
    const pinData = await hashPin(pin);
    const now = new Date().toISOString();
    try {
      const results = await db.batch([
        db.prepare(`UPDATE invitation_codes SET use_count = 1, redeemed_at = ?, redeemed_by = ?, updated_at = ?
          WHERE household_id = ? AND id = ? AND use_count = 0 AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > ?`)
          .bind(now, memberId, now, invitation.householdId, invitation.id, now),
        db.prepare(`INSERT INTO members (id, household_id, display_name, role, pin_hash, is_active, created_at, updated_at, profile_reference, pin_salt)
          SELECT ?, ?, ?, ?, ?, 1, ?, ?, ?, ? WHERE changes() = 1`)
          .bind(memberId, invitation.householdId, displayName, invitation.role, pinData.hash, now, now, profileReference, pinData.salt)
      ]);
      if (!results[1].meta.changes) throw new Error("invitation race");
    } catch (error) {
      if (String(error).includes("UNIQUE constraint") || String(error).includes("invitation race")) {
        throw conflictError("That invitation or profile is no longer available.");
      }
      throw error;
    }
    const session = await createSession(db, invitation.householdId, memberId);
    return success({ profileReference, role: invitation.role, expiresAt: session.expiresAt }, requestId, {
      status: 201, headers: { "Set-Cookie": cookie(session.token, env) }
    });
  });
}
export async function onRequest(context: Context): Promise<Response> {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
