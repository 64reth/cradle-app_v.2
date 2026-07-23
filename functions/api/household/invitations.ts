import { authenticate, invitedRole, randomToken, requireInvitationPermission, sha256 } from "../auth";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../http";
import type { CradleEnv } from "../types";
type Context = { request: Request; env: CradleEnv };

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env);
    const identity = await authenticate(request, db);
    requireInvitationPermission(identity);
    const role = invitedRole(await parseJsonBody(request));
    const code = randomToken(12).toUpperCase();
    const codeHash = await sha256(code);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60_000).toISOString();
    await db.prepare(`
      INSERT INTO invitation_codes
        (id, household_id, code_hash, invited_role, max_uses, use_count, expires_at, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, 0, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), identity.householdId, codeHash, role, expiresAt, identity.memberId, now.toISOString(), now.toISOString()).run();
    return success({ code, role, expiresAt }, requestId, { status: 201 });
  });
}
export async function onRequest(context: Context): Promise<Response> {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
