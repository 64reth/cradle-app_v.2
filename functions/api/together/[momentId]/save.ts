import { authenticate } from "../../auth";
import { handleApiRequest, methodNotAllowed, requireD1, success } from "../../http";
import { changeMomentStatus } from "../../together";
import type { CradleEnv } from "../../types";
type Context = { request: Request; env: CradleEnv; params: { momentId: string } };
export async function onRequestPost({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    return success(await changeMomentStatus(db, identity, params.momentId, "saved_for_later"), requestId);
  });
}
export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
