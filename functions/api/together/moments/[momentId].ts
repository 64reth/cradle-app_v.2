import { authenticate } from "../../auth";
import { handleApiRequest, methodNotAllowed, requireD1, success } from "../../http";
import { getMoment } from "../../together";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv; params: { momentId: string } };
export async function onRequestGet({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    return success(await getMoment(db, identity.householdId, params.momentId), requestId);
  });
}
export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET"); });
}
