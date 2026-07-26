import { authenticate } from "../auth";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../http";
import { memberAvatarOptions, memberAvatarSelect, upsertMemberAvatar } from "../member-avatars";
import type { CradleEnv } from "../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestGet({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const avatar = await db.prepare(memberAvatarSelect).bind(identity.householdId, identity.memberId).first();
    return success({ avatar, ...memberAvatarOptions }, requestId);
  });
}

export async function onRequestPut({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const avatar = await upsertMemberAvatar(
      db, identity.householdId, identity.memberId, identity.displayName, await parseJsonBody(request)
    );
    return success({ avatar, destination: "/me" }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "PUT") return onRequestPut(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET or PUT"); });
}
