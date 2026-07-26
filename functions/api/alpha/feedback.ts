import { authenticate } from "../auth";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../http";
import { parseAlphaFeedback } from "../../../shared/alpha-diagnostics";
import type { CradleEnv } from "../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const feedback = parseAlphaFeedback(await parseJsonBody(request));
    if (!feedback) throw validationError("Please choose a feedback type and check the optional details.");
    await db.prepare(`INSERT INTO alpha_feedback
      (id, household_id, member_id, category, screen, rating, message, app_version, runtime_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), identity.householdId, identity.memberId, feedback.category, feedback.screen || null,
        feedback.rating ?? null, feedback.message || null, env.APP_VERSION || null,
        request.headers.get("X-Cradle-Dev-Runtime-ID") || null, new Date().toISOString()).run();
    return success({ accepted: true }, requestId, { status: 201 });
  });
}

export async function onRequest(context: Context): Promise<Response> {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
