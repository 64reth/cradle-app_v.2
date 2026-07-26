import { authenticate } from "../../auth";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../http";
import { deleteMemberInterest, interestMember, listMemberInterests, updateMemberInterest } from "../../interests";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv; params: { interestId: string } };

export async function onRequestPatch({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); const body = await parseJsonBody(request);
    const memberId = await interestMember(db, identity, typeof body.memberId === "string" ? body.memberId : null);
    const interest = await updateMemberInterest(db, identity.householdId, memberId, params.interestId, body);
    return success({ memberId, interest, interests: await listMemberInterests(db, identity.householdId, memberId, true) }, requestId);
  });
}

export async function onRequestDelete({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const memberId = await interestMember(db, identity, new URL(request.url).searchParams.get("memberId"));
    await deleteMemberInterest(db, identity.householdId, memberId, params.interestId);
    return success({ memberId, interests: await listMemberInterests(db, identity.householdId, memberId, true) }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "PATCH") return onRequestPatch(context);
  if (context.request.method === "DELETE") return onRequestDelete(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("PATCH or DELETE"); });
}
