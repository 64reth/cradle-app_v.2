import { authenticate } from "../auth";
import { handleApiRequest, methodNotAllowed, requireD1, success } from "../http";
import { getOrCreateDailyMoments } from "../together";
import type { CradleEnv } from "../types";

type Context = { request: Request; env: CradleEnv };
export async function onRequestGet({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    return success(await getOrCreateDailyMoments(db, identity, new URL(request.url).searchParams.get("date") || undefined), requestId);
  });
}
export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET"); });
}
