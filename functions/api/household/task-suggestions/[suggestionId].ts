import { authenticate, textField } from "../../auth";
import { ApiError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../../http";
import { optionalText } from "../../setup";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv; params: { suggestionId: string } };

export async function onRequestPatch({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); const body = await parseJsonBody(request);
    const existing = await db.prepare(`SELECT id FROM task_suggestions
      WHERE household_id = ? AND id = ? AND suggested_by_member_id = ? AND status = 'open'`)
      .bind(identity.householdId, params.suggestionId, identity.memberId).first();
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Open suggestion not found.");
    const title = textField(body, "title", 1, 120);
    if (body.suggestionType !== "one_off" && body.suggestionType !== "recurring") {
      throw validationError("Please check your suggestion.", { suggestionType: "Choose one-off or recurring" });
    }
    await db.prepare(`UPDATE task_suggestions SET title = ?, suggestion_type = ?, note = ?, updated_at = ?
      WHERE household_id = ? AND id = ? AND suggested_by_member_id = ? AND status = 'open'`)
      .bind(title, body.suggestionType, optionalText(body, "note", 1000), new Date().toISOString(),
        identity.householdId, params.suggestionId, identity.memberId).run();
    return success({ updated: true, destination: "/me" }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "PATCH") return onRequestPatch(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("PATCH"); });
}
