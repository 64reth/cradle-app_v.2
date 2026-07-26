import { authenticate } from "../../auth";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../http";
import { createMemory } from "../../together";
import type { CradleEnv } from "../../types";
type Context = { request: Request; env: CradleEnv; params: { momentId: string } };
export async function onRequestPost({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    return success({ id: await createMemory(db, identity, params.momentId, await parseJsonBody(request)) }, requestId, { status: 201 });
  });
}
export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
