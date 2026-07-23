import { authenticate } from "../../auth";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../http";
import { requireStep } from "../../setup";
import type { CradleEnv } from "../../types";
type Context = { request: Request; env: CradleEnv };
export async function onRequestPatch({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    await parseJsonBody(request); await requireStep(db, identity, "leadership");
    const now = new Date().toISOString();
    await db.prepare("UPDATE households SET leadership_confirmed_at = ?, setup_step = 'members', updated_at = ? WHERE id = ? AND setup_step = 'leadership'")
      .bind(now, now, identity.householdId).run();
    return success({ step: "members" }, requestId);
  });
}
export async function onRequest(context: Context) {
  if (context.request.method === "PATCH") return onRequestPatch(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("PATCH"); });
}
