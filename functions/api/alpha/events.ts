import { authenticate } from "../auth";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../http";
import { parseAlphaDiagnosticEvent } from "../../../shared/alpha-diagnostics";
import type { CradleEnv } from "../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const event = parseAlphaDiagnosticEvent(await parseJsonBody(request));
    if (!event) throw validationError("Please send a supported alpha diagnostic event.");
    await db.prepare(`INSERT INTO alpha_diagnostic_events
      (id, household_id, member_id, event_name, screen, action, status_code, error_code,
       request_id, duration_ms, device_class, runtime_id, app_version, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), identity.householdId, identity.memberId, event.name, event.screen || null,
        event.action || null, event.statusCode || null, event.errorCode || null, event.requestId || null,
        event.durationMs ?? null, event.deviceClass || null, event.runtimeId || null,
        event.appVersion || env.APP_VERSION || null, new Date().toISOString()).run();
    return success({ accepted: true }, requestId, { status: 202 });
  });
}

export async function onRequest(context: Context): Promise<Response> {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
