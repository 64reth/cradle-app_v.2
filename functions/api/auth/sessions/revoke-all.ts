import { authenticate, clearCookie } from "../../auth";
import { recordAuthEvent } from "../../auth-provider";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../http";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); await parseJsonBody(request); const identity = await authenticate(request, db);
    const now = new Date().toISOString();
    await db.batch([
      db.prepare("UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE household_id = ? AND member_id = ? AND revoked_at IS NULL")
        .bind(now, now, identity.householdId, identity.memberId),
      ...(identity.accountId ? [db.prepare("UPDATE identity_sessions SET revoked_at = ?, updated_at = ? WHERE account_id = ? AND revoked_at IS NULL")
        .bind(now, now, identity.accountId)] : [])
    ]);
    await recordAuthEvent(db, { accountId: identity.accountId, householdId: identity.householdId, memberId: identity.memberId,
      eventName: "session_revoked", provider: "legacy_pin", result: "success", requestId });
    return success({ revoked: true }, requestId, { headers: { "Set-Cookie": clearCookie(env) } });
  });
}

export async function onRequest(context: Context): Promise<Response> {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
