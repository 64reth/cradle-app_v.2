import { authenticate, identityAccessLevel } from "../../auth";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../http";
import { createCustomMoment, getOrCreateDailyMoments } from "../../together";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv };
export async function onRequestGet({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const date = new URL(request.url).searchParams.get("date") || undefined;
    return success(await getOrCreateDailyMoments(db, identity, date), requestId);
  });
}
export async function onRequestPost({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const id = await createCustomMoment(db, identity, await parseJsonBody(request));
    return success({ id, canPublish: identityAccessLevel(identity) === "household_admin" }, requestId, { status: 201 });
  });
}
export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET or POST"); });
}
