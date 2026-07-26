import { authenticate, identityAccessLevel } from "../auth";
import { authorizationError, handleApiRequest, methodNotAllowed, requireD1, success } from "../http";
import type { CradleEnv } from "../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    if (identityAccessLevel(identity) !== "household_admin") throw authorizationError();
    const [events, feedback] = await Promise.all([
      db.prepare(`SELECT event_name AS name, screen, action, status_code AS statusCode,
        error_code AS errorCode, request_id AS requestId, duration_ms AS durationMs,
        device_class AS deviceClass, app_version AS appVersion, created_at AS createdAt
        FROM alpha_diagnostic_events WHERE household_id = ? ORDER BY created_at DESC LIMIT 100`)
        .bind(identity.householdId).all(),
      db.prepare(`SELECT id, member_id AS memberId, category, screen, rating, message,
        app_version AS appVersion, created_at AS createdAt
        FROM alpha_feedback WHERE household_id = ? ORDER BY created_at DESC LIMIT 100`)
        .bind(identity.householdId).all()
    ]);
    return success({ events: events.results, feedback: feedback.results }, requestId);
  });
}

export async function onRequest(context: Context): Promise<Response> {
  if (context.request.method === "GET") return onRequestGet(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET"); });
}
