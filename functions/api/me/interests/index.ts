import { authenticate } from "../../auth";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../http";
import { addMemberInterest, interestMember, listMemberInterests } from "../../interests";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestGet({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const requested = new URL(request.url).searchParams.get("memberId"); const memberId = await interestMember(db, identity, requested);
    return success({ memberId, interests: await listMemberInterests(db, identity.householdId, memberId, true) }, requestId);
  });
}

export async function onRequestPost({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); const body = await parseJsonBody(request);
    const memberId = await interestMember(db, identity, typeof body.memberId === "string" ? body.memberId : null);
    const interest = await addMemberInterest(db, identity.householdId, memberId, body);
    return success({ memberId, interest, interests: await listMemberInterests(db, identity.householdId, memberId, true) }, requestId, { status: 201 });
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET or POST"); });
}
