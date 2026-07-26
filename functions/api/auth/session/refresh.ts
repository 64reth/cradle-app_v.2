import { authenticate, cookie, createSession } from "../../auth";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../http";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); await parseJsonBody(request); const identity = await authenticate(request, db);
    const current = await db.prepare(`SELECT auth_method AS authMethod FROM session_metadata
      WHERE household_id = ? AND session_id = ?`).bind(identity.householdId, identity.sessionId).first<{ authMethod: "legacy_pin" | "google" | "apple" | "email_otp" }>();
    const session = await createSession(db, identity.householdId, identity.memberId, identity.accountId || null, current?.authMethod || "legacy_pin");
    const now = new Date().toISOString();
    await db.prepare("UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE household_id = ? AND id = ?")
      .bind(now, now, identity.householdId, identity.sessionId).run();
    return success({ expiresAt: session.expiresAt }, requestId, { headers: { "Set-Cookie": cookie(session.token, env) } });
  });
}

export async function onRequest(context: Context): Promise<Response> {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
