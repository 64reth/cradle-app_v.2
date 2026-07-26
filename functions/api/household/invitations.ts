import { authenticate } from "../auth";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../http";
import { createHouseholdInvite } from "../invites";
import { requireFamilyManager } from "../member-policy";
import type { CradleEnv } from "../types";

type Context = { request: Request; env: CradleEnv };

/**
 * Compatibility alias for early clients. It now creates the secure general
 * invitation domain and returns a complete link/code result rather than a
 * token-only legacy state.
 */
export async function onRequestPost({ request, env }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); requireFamilyManager(identity);
    const body = await parseJsonBody(request);
    const accessLevel = body.role === "parent_admin" ? "household_admin" :
      body.role === "adult" ? "household_member" : body.role === "child" ? "managed_member" : null;
    if (!accessLevel) throw validationError("Please check this invitation.", { role: "Choose a supported access level" });
    const invite = await createHouseholdInvite(request, db, identity, {
      accessLevel, ageBand: body.role === "child" ? "child" : "adult", expiry: body.expiry || "7_days"
    });
    return success({ code: invite.code, inviteUrl: invite.inviteUrl, expiresAt: invite.expiresAt,
      role: invite.role, invite }, requestId, { status: 201 });
  });
}

export async function onRequest(context: Context): Promise<Response> {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
