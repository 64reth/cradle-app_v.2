import { authenticate } from "../auth";
import { handleApiRequest, methodNotAllowed, requireD1, success } from "../http";
import type { CradleEnv } from "../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const sessions = await db.prepare(`SELECT s.id, m.auth_method AS authMethod, m.device_label AS deviceLabel,
      s.created_at AS createdAt, m.last_seen_at AS lastSeenAt, s.expires_at AS expiresAt,
      CASE WHEN s.id = ? THEN 1 ELSE 0 END AS current FROM sessions s LEFT JOIN session_metadata m
      ON m.household_id = s.household_id AND m.session_id = s.id
      WHERE s.household_id = ? AND s.member_id = ? AND s.revoked_at IS NULL AND s.expires_at > ?
      ORDER BY m.last_seen_at DESC, s.created_at DESC`)
      .bind(identity.sessionId, identity.householdId, identity.memberId, new Date().toISOString()).all();
    return success({ sessions: sessions.results }, requestId);
  });
}

export async function onRequest(context: Context): Promise<Response> {
  if (context.request.method === "GET") return onRequestGet(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET"); });
}
