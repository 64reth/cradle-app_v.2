import { authenticate } from "../../auth";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../http";
import { requireStep } from "../../setup";
import type { CradleEnv } from "../../types";
type Context = { request: Request; env: CradleEnv };
export async function onRequestPost({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    await parseJsonBody(request); await requireStep(db, identity, "pets");
    await db.prepare("UPDATE households SET setup_step = 'companion', updated_at = ? WHERE id = ? AND setup_step = 'pets'")
      .bind(new Date().toISOString(), identity.householdId).run();
    return success({ step: "companion" }, requestId);
  });
}
export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
