import { authenticate, clearCookie } from "../auth";
import { authenticateIdentity, clearIdentityCookie, recordAuthEvent } from "../auth-provider";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../http";
import type { CradleEnv } from "../types";
type Context = { request: Request; env: CradleEnv };

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env);
    await parseJsonBody(request);
    const identity = await authenticate(request, db);
    const now = new Date().toISOString();
    await db.prepare("UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE household_id = ? AND id = ?")
      .bind(now, now, identity.householdId, identity.sessionId).run();
    await recordAuthEvent(db, { accountId: identity.accountId, householdId: identity.householdId, memberId: identity.memberId,
      eventName: "logout", provider: "legacy_pin", result: "success", requestId });
    const headers = new Headers({ "Set-Cookie": clearCookie(env) });
    try {
      const identitySession = await authenticateIdentity(request, db);
      await db.prepare("UPDATE identity_sessions SET revoked_at = ?, updated_at = ? WHERE id = ?").bind(now, now, identitySession.identitySessionId).run();
      headers.append("Set-Cookie", clearIdentityCookie(env));
    } catch { /* A legacy-only session has no identity cookie to revoke. */ }
    return success({ signedOut: true }, requestId, { headers });
  });
}
export async function onRequest(context: Context): Promise<Response> {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
